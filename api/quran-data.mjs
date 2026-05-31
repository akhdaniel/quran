// GET /api/quran-data — serve full Quran data from Vercel Blob
import { get } from "@vercel/blob";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=604800");

  if (req.method === "OPTIONS") return res.status(200).end();

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not set" });

  try {
    const result = await get("quran-data/full.json", { access: "private", token });
    if (!result) return res.status(404).json({ error: "Data not found. Run POST /api/sync-quran first." });

    const chunks = [];
    for await (const chunk of result.stream) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf-8");
    const data = JSON.parse(text);

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
