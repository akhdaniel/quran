// GET /api/quran-data — serve full Quran data from PostgREST
const PGREST_URL = "http://124.156.205.118:3000";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=604800");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const resp = await fetch(`${PGREST_URL}/quran_data?key=eq.full&select=data`);
    if (!resp.ok) throw new Error(await resp.text());

    const rows = await resp.json();
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Data not found." });
    }

    return res.status(200).json(rows[0].data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
