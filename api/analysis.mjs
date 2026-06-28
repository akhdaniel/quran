// API /api/analysis — simpan & baca analisa ayat via PostgREST on-premise
const PGREST_URL = "https://pgrest.xerpium.com/quran";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Health check (GET tanpa params)
  if (req.method === "GET" && !req.query.surah) {
    try {
      const resp = await fetch(PGREST_URL + "/analysis?select=count");
      const data = await resp.json();
      return res.status(200).json({
        status: "alive",
        total: data[0]?.count || 0,
        node: process.version,
      });
    } catch (err) {
      return res.status(200).json({
        status: "alive",
        pgrst_connected: false,
        node: process.version,
      });
    }
  }

  // POST — simpan (upsert by surah+ayat+lang)
  if (req.method === "POST") {
    const { surah, ayat, content, lang } = req.body || {};
    if (!surah || !ayat || !content) {
      return res.status(400).json({ error: "surah, ayat, content required" });
    }

    try {
      const resp = await fetch(PGRST_URL + "/analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          surah: parseInt(surah),
          ayat: parseInt(ayat),
          lang: lang || "id",
          content,
          updated_at: new Date().toISOString(),
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText);
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("PostgREST upsert error:", err);
      return res.status(500).json({ error: "POST: " + err.message });
    }
  }

  // GET — ambil analysis
  if (req.method === "GET") {
    const { surah, ayat, lang } = req.query;
    if (!surah || !ayat) {
      return res.status(400).json({ error: "surah and ayat required" });
    }

    try {
      const params = new URLSearchParams({
        "surah": `eq.${parseInt(surah)}`,
        "ayat": `eq.${parseInt(ayat)}`,
        "lang": `eq.${lang || "id"}`,
        "select": "content,updated_at",
      });

      const resp = await fetch(PGRST_URL + "/analysis?" + params.toString());
      if (!resp.ok) throw new Error(await resp.text());

      const data = await resp.json();

      if (!data || data.length === 0) {
        return res.status(404).json({ error: "not found" });
      }

      return res.status(200).json({
        surah: parseInt(surah),
        ayat: parseInt(ayat),
        lang: lang || "id",
        content: data[0].content,
        updatedAt: data[0].updated_at,
      });
    } catch (err) {
      return res.status(500).json({ error: "GET: " + err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
