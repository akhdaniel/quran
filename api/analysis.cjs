// === API /api/analysis ===
// Menyimpan & mengambil analisa ayat via Vercel Blob

let blobOk = false;
let blobError = null;
try {
  require.resolve("@vercel/blob");
  blobOk = true;
} catch (e) {
  blobError = e.message;
}

const BLOB = blobOk ? require("@vercel/blob") : null;

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Health check (GET tanpa params)
  if (req.method === "GET" && !req.query.surah) {
    return res.status(200).json({
      status: "alive",
      blob_available: blobOk,
      blob_error: blobError,
      token_exists: !!process.env.BLOB_READ_WRITE_TOKEN,
      token_prefix: (process.env.BLOB_READ_WRITE_TOKEN || "").substring(0, 12),
      node: process.version,
    });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN || "";

  if (!BLOB) {
    return res.status(500).json({ error: "@vercel/blob not resolvable: " + blobError });
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
      const result = await BLOB.put(key, JSON.stringify({
        surah, ayat, content,
        updatedAt: new Date().toISOString()
      }), {
        access: "public",
        addRandomSuffix: false,
        token,
      });
      return res.status(200).json({ ok: true, url: result.url });
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
      const blob = await BLOB.get(key, { access: "public", token });
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
};
