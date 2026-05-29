// API /api/analysis — simpan & baca analisa ayat via @vercel/blob SDK
import { put, get } from "@vercel/blob";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const token = process.env.BLOB_READ_WRITE_TOKEN;

  // Health check (GET tanpa params)
  if (req.method === "GET" && !req.query.surah) {
    return res.status(200).json({
      status: "alive",
      token_exists: !!token,
      token_prefix: (token || "").substring(0, 15),
      node: process.version,
    });
  }

  if (!token) {
    return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not set" });
  }

  const PREFIX = "analysis/";

  // POST — simpan
  if (req.method === "POST") {
    const { surah, ayat, content } = req.body || {};
    if (!surah || !ayat || !content) {
      return res.status(400).json({ error: "surah, ayat, content required" });
    }

    const key = `${PREFIX}${surah}-${ayat}.json`;

    try {
      const result = await put(key, JSON.stringify({
        surah, ayat, content,
        updatedAt: new Date().toISOString(),
      }), {
        access: "private",
        addRandomSuffix: false,
        token,
      });

      return res.status(200).json({ ok: true, url: result.url, downloadUrl: result.downloadUrl });
    } catch (err) {
      console.error("PUT error:", err);
      return res.status(500).json({ error: "PUT: " + err.message });
    }
  }

  // GET — ambil
  if (req.method === "GET") {
    const { surah, ayat } = req.query;
    if (!surah || !ayat) {
      return res.status(400).json({ error: "surah and ayat required" });
    }

    const key = `${PREFIX}${surah}-${ayat}.json`;

    try {
      const blob = await get(key, { access: "private", token });
      if (!blob) {
        return res.status(404).json({ error: "not found" });
      }
      const text = await blob.text();
      return res.status(200).json(JSON.parse(text));
    } catch (err) {
      return res.status(404).json({ error: "GET: " + err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
