import { put, list, get } from "@vercel/blob";

const BLOB_PREFIX = "analysis/";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // POST — simpan analisa
  if (req.method === "POST") {
    const { surah, ayat, content } = req.body || {};
    if (!surah || !ayat || !content) {
      return res.status(400).json({ error: "surah, ayat, content required" });
    }

    const key = `${BLOB_PREFIX}${surah}-${ayat}.json`;

    try {
      await put(key, JSON.stringify({ surah, ayat, content, updatedAt: new Date().toISOString() }), {
        contentType: "application/json",
        access: "public",
        addRandomSuffix: false,
      });
      return res.status(200).json({ ok: true, key });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET — ambil analisa
  if (req.method === "GET") {
    const surah = req.query.surah;
    const ayat = req.query.ayat;

    if (surah && ayat) {
      // Ambil spesifik surah:ayat
      const key = `${BLOB_PREFIX}${surah}-${ayat}.json`;
      try {
        const blob = await get(key);
        if (!blob) {
          return res.status(404).json({ error: "not found" });
        }
        const text = await blob.text();
        return res.status(200).json(JSON.parse(text));
      } catch (err) {
        // Not found or error
        return res.status(404).json({ error: "not found" });
      }
    }

    // Ambil semua (dengan prefix filter)
    try {
      const { blobs } = await list({ prefix: BLOB_PREFIX });
      const results = await Promise.all(
        blobs.map(async (b) => {
          const text = await fetch(b.url).then((r) => r.text());
          return JSON.parse(text);
        })
      );
      return res.status(200).json(results);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
