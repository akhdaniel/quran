const BLOB_BASE = "https://blob.vercel-storage.com";
const BLOB_PREFIX = "analysis/";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not set" });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // POST — simpan analisa
  if (req.method === "POST") {
    const { surah, ayat, content } = req.body || {};
    if (!surah || !ayat || !content) {
      return res.status(400).json({ error: "surah, ayat, content required" });
    }

    const key = `${BLOB_PREFIX}${surah}-${ayat}.json`;
    const data = JSON.stringify({ surah, ayat, content, updatedAt: new Date().toISOString() });

    try {
      const resBlob = await fetch(`${BLOB_BASE}/${key}`, {
        method: "PUT",
        headers: {
          ...headers,
          "x-api-key": token,
        },
        body: data,
      });

      if (!resBlob.ok) {
        const errText = await resBlob.text();
        return res.status(resBlob.status).json({ error: errText });
      }

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
      const key = `${BLOB_PREFIX}${surah}-${ayat}.json`;

      try {
        const resBlob = await fetch(`${BLOB_BASE}/${key}`, {
          headers: {
            ...headers,
            "x-api-key": token,
          },
        });

        if (resBlob.status === 404) {
          return res.status(404).json({ error: "not found" });
        }

        if (!resBlob.ok) {
          return res.status(resBlob.status).json({ error: "blob error" });
        }

        const text = await resBlob.text();
        return res.status(200).json(JSON.parse(text));
      } catch (err) {
        return res.status(404).json({ error: "not found" });
      }
    }

    return res.status(400).json({ error: "surah and ayat query params required" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
