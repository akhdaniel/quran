// API /api/analysis — simpan & baca analisa ayat via Supabase
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Health check (GET tanpa params)
  if (req.method === "GET" && !req.query.surah) {
    return res.status(200).json({
      status: "alive",
      db_connected: !!supabase,
      node: process.version,
    });
  }

  if (!supabase) {
    return res.status(500).json({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" });
  }

  // POST — simpan
  if (req.method === "POST") {
    const { surah, ayat, content, lang } = req.body || {};
    if (!surah || !ayat || !content) {
      return res.status(400).json({ error: "surah, ayat, content required" });
    }

    try {
      const { error } = await supabase.from("analysis").upsert({
        surah: parseInt(surah),
        ayat: parseInt(ayat),
        lang: lang || "id",
        content,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "surah,ayat,lang",
        ignoreDuplicates: false,
      });

      if (error) throw error;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("SUPABASE upsert error:", err);
      return res.status(500).json({ error: "POST: " + err.message });
    }
  }

  // GET — ambil
  if (req.method === "GET") {
    const { surah, ayat, lang } = req.query;
    if (!surah || !ayat) {
      return res.status(400).json({ error: "surah and ayat required" });
    }

    try {
      const { data, error } = await supabase
        .from("analysis")
        .select("content, updated_at")
        .eq("surah", parseInt(surah))
        .eq("ayat", parseInt(ayat))
        .eq("lang", lang || "id")
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return res.status(404).json({ error: "not found" });
        }
        throw error;
      }

      return res.status(200).json({
        surah: parseInt(surah),
        ayat: parseInt(ayat),
        lang: lang || "id",
        content: data.content,
        updatedAt: data.updated_at,
      });
    } catch (err) {
      return res.status(500).json({ error: "GET: " + err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
