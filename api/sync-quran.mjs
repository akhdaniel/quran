// POST /api/sync-quran — fetch all Quran data (ID + EN), save to Vercel Blob
import { put } from "@vercel/blob";

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
    console.log("Fetching surah list from equran.id...");
    const suratRes = await fetch("https://equran.id/api/v2/surat");
    const suratData = await suratRes.json();
    if (suratData.code !== 200) throw new Error("equran.id surat API failed");

    const surahList = suratData.data;
    const total = surahList.length;
    const result = [];

    // 2. Loop per surat, fetch detail (Arab + ID translation) + EN translation
    for (let i = 0; i < total; i++) {
      const s = surahList[i];
      console.log(`Fetching surah ${s.nomor}/${total} (${s.namaLatin})...`);

      // Ambil detail dari equran.id (Arab + Indonesia)
      const detailRes = await fetch(`https://equran.id/api/v2/surat/${s.nomor}`);
      const detailData = await detailRes.json();
      if (detailData.code !== 200) {
        console.warn(`equran.id detail for surah ${s.nomor} failed, skipping`);
        continue;
      }

      const surahDetail = detailData.data;
      const ayats = surahDetail.ayat || [];

      // Ambil English translation dari alquran.cloud
      let enAyats = [];
      try {
        const enRes = await fetch(`https://api.alquran.cloud/v1/surah/${s.nomor}/en.sahih`);
        const enData = await enRes.json();
        if (enData.code === 200 && enData.data?.ayahs) {
          enAyats = enData.data.ayahs;
        }
      } catch (e) {
        console.warn(`alquran.cloud for surah ${s.nomor} failed: ${e.message}`);
      }

      // Gabung data
      const mergedAyat = ayats.map((ayat, idx) => ({
        nomor: ayat.nomor || idx + 1,
        teksArab: ayat.teksArab || "",
        teksIndonesia: ayat.teksIndonesia || "",
        teksLatin: ayat.teksLatin || "",
        teksInggris: enAyats[idx]?.text || "",
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

    // 3. Simpan ke Vercel Blob
    console.log("Saving to Vercel Blob...");
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
      downloadUrl: blobRes.downloadUrl,
      totalSurahs: blobData.totalSurahs,
      totalAyats: blobData.totalAyats,
    });
  } catch (err) {
    console.error("sync-quran error:", err);
    return res.status(500).json({ error: err.message });
  }
}
