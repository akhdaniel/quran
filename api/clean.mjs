// POST /api/sync-quran/clean — strip Quranic annotation chars from Arabic text
// Run once to clean up non-standard Unicode characters in Blob data
import { put, get } from "@vercel/blob";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not set" });

  try {
    // Baca data yg ada
    const blob = await get("quran-data/full.json", { access: "private", token });
    if (!blob) return res.status(404).json({ error: "Data not found, run /api/sync-quran first" });

    const chunks = [];
    for await (const chunk of blob.stream) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf-8");
    const data = JSON.parse(text);

    // Quranic annotation characters to strip (non-standard, cause boxes)
    // These are end-of-verse marks and tashkeel annotations
    const stripRegex = /[\u06D6-\u06ED\u08D0-\u08E1\u08E3-\u08FF\uFE70-\uFEFF\uFDF2-\uFDFD]/g;

    let cleaned = 0;
    for (const surah of data.surahs) {
      for (const ayat of surah.ayat) {
        const original = ayat.teksArab;
        const cleanedText = ayat.teksArab.replace(stripRegex, '').trim();
        if (cleanedText !== original) {
          ayat.teksArab = cleanedText;
          cleaned++;
        }
      }
    }

    // Simpan balik
    data.cleanedAt = new Date().toISOString();
    await put("quran-data/full.json", JSON.stringify(data), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      token,
    });

    return res.status(200).json({
      ok: true,
      totalAyatsCleaned: cleaned,
      totalAyats: data.totalAyats,
    });
  } catch (err) {
    console.error("clean error:", err);
    return res.status(500).json({ error: err.message });
  }
}
