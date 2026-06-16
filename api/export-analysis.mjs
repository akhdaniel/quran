// GET /api/export-analysis — export semua analisa ke JSON (untuk diproses jadi CSV/SQL)
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (!supabase) {
    return res.status(500).json({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" });
  }

  const format = req.query.format || "json"; // json or csv

  try {
    // Fetch all analysis data
    let allData = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("analysis")
        .select("surah, ayat, lang, content, updated_at")
        .range(from, from + limit - 1)
        .order("surah", { ascending: true })
        .order("ayat", { ascending: true })
        .order("lang", { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        allData = allData.concat(data);
        from += limit;
        if (data.length < limit) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    if (format === "csv") {
      // Escape content for CSV: wrap in quotes, escape inner quotes
      const escapeCSV = (str) => {
        if (!str) return '""';
        const escaped = str.replace(/"/g, '""');
        return `"${escaped}"`;
      };

      const header = "surah,ayat,lang,content,updated_at";
      const rows = allData.map(r =>
        `${r.surah},${r.ayat},${r.lang},${escapeCSV(r.content)},${r.updated_at || ''}`
      );

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=analysis-export.csv");
      return res.status(200).send([header, ...rows].join("\n"));
    }

    // Default: JSON
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=analysis-export.json");
    return res.status(200).json({
      ok: true,
      total: allData.length,
      data: allData,
    });

  } catch (err) {
    console.error("export-analysis error:", err);
    return res.status(500).json({ error: err.message });
  }
}
