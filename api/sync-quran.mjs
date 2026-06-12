// POST /api/sync-quran — fetch all Quran data (ID + EN), save to Supabase
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Batch helper: process items with concurrency limit
async function batchFetch(items, fn, concurrency) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults.map(r => r.status === "fulfilled" ? r.value : null));
    if (i + concurrency < items.length) {
      await new Promise(r => setTimeout(r, 800));
    }
  }
  return results;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (!supabase) {
    return res.status(500).json({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" });
  }

  try {
    // 1. Fetch daftar surat dari equran.id
    console.log("Fetching surah list...");
    const suratRes = await fetch("https://equran.id/api/v2/surat");
    const suratData = await suratRes.json();
    if (suratData.code !== 200) throw new Error("equran.id surat API failed");
    const surahList = suratData.data;
    console.log(`Found ${surahList.length} surahs`);

    // 2. Fetch detail per surat (Arab + ID) in batches of 5
    console.log("Fetching surah details (Arab + ID)...");
    const detailResults = await batchFetch(
      surahList,
      async (s) => {
        const r = await fetch(`https://equran.id/api/v2/surat/${s.nomor}`);
        const d = await r.json();
        return d.code === 200 ? d.data : null;
      },
      5
    );

    // 3. Fetch English translations (alquran.cloud) in batches of 5
    console.log("Fetching English translations...");
    const enResults = await batchFetch(
      surahList,
      async (s) => {
        const r = await fetch(`https://api.alquran.cloud/v1/surah/${s.nomor}/en.sahih`);
        const d = await r.json();
        return d.code === 200 && d.data?.ayahs ? d.data.ayahs : null;
      },
      5
    );

    // 4. Merge data
    console.log("Merging data...");
    const result = [];
    for (let i = 0; i < surahList.length; i++) {
      const s = surahList[i];
      const surahDetail = detailResults[i];
      const enAyats = enResults[i];

      if (!surahDetail) {
        console.warn(`Skipping surah ${s.nomor} - no detail data`);
        continue;
      }

      const ayats = surahDetail.ayat || [];
      const mergedAyat = ayats.map((ayat, idx) => ({
        nomor: ayat.nomor || idx + 1,
        teksArab: ayat.teksArab || "",
        teksIndonesia: ayat.teksIndonesia || "",
        teksLatin: ayat.teksLatin || "",
        teksInggris: enAyats && enAyats[idx] ? enAyats[idx].text || "" : "",
      }));

      result.push({
        nomor: surahDetail.nomor,
        namaLatin: surahDetail.namaLatin,
        nama: surahDetail.nama,
        arti: surahDetail.arti,
        jumlahAyat: surahDetail.jumlahAyat,
        tempatTurun: surahDetail.tempatTurun,
        ayat: mergedAyat,
      });
    }

    // 5. Simpan ke Supabase
    console.log("Saving to Supabase...");
    const blobData = {
      source: "equran.id + alquran.cloud",
      syncedAt: new Date().toISOString(),
      totalSurahs: result.length,
      totalAyats: result.reduce((sum, s) => sum + s.ayat.length, 0),
      surahs: result,
    };

    const { error } = await supabase
      .from("quran_data")
      .upsert({
        key: "full",
        data: blobData,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "key",
        ignoreDuplicates: false,
      });

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      totalSurahs: blobData.totalSurahs,
      totalAyats: blobData.totalAyats,
      enComplete: result.every(s => s.ayat.every(a => a.teksInggris)),
    });
  } catch (err) {
    console.error("sync-quran error:", err);
    return res.status(500).json({ error: err.message });
  }
}
