// API /api/analysis — simpan & baca analisa ayat via Vercel Blob

const BLOB_API = "https://vercel.com/api/blob";

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
      token_prefix: (token || "").substring(0, 12),
      node: process.version,
      file: "api/analysis.mjs",
    });
  }

  if (!token) {
    return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not set" });
  }

  // Extract storeId dari token: vercel_blob_rw_<random>_<storeId>
  const parts = token.split("_");
  const storeId = parts[parts.length - 1];

  const PREFIX = "analysis/";

  // POST — simpan
  if (req.method === "POST") {
    const { surah, ayat, content } = req.body || {};
    if (!surah || !ayat || !content) {
      return res.status(400).json({ error: "surah, ayat, content required" });
    }

    const pathname = `${PREFIX}${surah}-${ayat}.json`;
    const data = JSON.stringify({
      surah, ayat, content,
      updatedAt: new Date().toISOString(),
    });

    try {
      const params = new URLSearchParams({ pathname, addRandomSuffix: "false" });
      const resp = await fetch(`${BLOB_API}/?${params.toString()}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: data,
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        return res.status(resp.status).json({ error: `PUT failed (${resp.status}): ${errText}` });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "PUT error: " + err.message });
    }
  }

  // GET — ambil
  if (req.method === "GET") {
    const { surah, ayat } = req.query;
    if (!surah || !ayat) {
      return res.status(400).json({ error: "surah and ayat required" });
    }

    const pathname = `${PREFIX}${surah}-${ayat}.json`;
    const blobUrl = `https://${storeId}.public.blob.vercel-storage.com/${pathname}`;

    try {
      const resp = await fetch(blobUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (resp.status === 404) {
        return res.status(404).json({ error: "not found" });
      }

      if (!resp.ok) {
        return res.status(resp.status).json({ error: `GET failed: ${resp.status}` });
      }

      const text = await resp.text();
      return res.status(200).json(JSON.parse(text));
    } catch (err) {
      return res.status(404).json({ error: "GET error: " + err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
