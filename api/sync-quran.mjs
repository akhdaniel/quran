// POST /api/sync-quran — fetch all Quran data (ID + EN), save to Vercel Blob
import { put } from "@vercel/blob";

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

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not set" });

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

    // 5. Simpan ke Vercel Blob
    console.log("Saving to Blob...");
    const blobData = {
      source: "equran.id + alquran.cloud",
      syncedAt: new Date().toISOString(),
      totalSurahs: result.length,
      totalAyats: result.reduce((sum, s) => sum + s.ayat.length, 0),
      surahs: result,
    };

    const blobRes = await put("quran-data/full.json", JSON.stringify(blobData), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      token,
    });

    return res.status(200).json({
      ok: true,
      url: blobRes.url,
      totalSurahs: blobData.totalSurahs,
      totalAyats: blobData.totalAyats,
      enComplete: result.every(s => s.ayat.every(a => a.teksInggris)),
    });
  } catch (err) {
    console.error("sync-quran error:", err);
    return res.status(500).json({ error: err.message });
  }
}
