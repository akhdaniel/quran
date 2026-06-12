// /api/chats — GET shared chats for an ayat, POST new message
import { createClient } from "@supabase/supabase-js";
import { verifyJWT } from "./_auth.mjs";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const TABLE = "chats";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (!supabase) return res.status(500).json({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" });

  const { surah, ayat } = req.query;
  if (!surah || !ayat) return res.status(400).json({ error: "surah and ayat required" });

  // GET — load chat messages
  if (req.method === "GET") {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("surah", parseInt(surah))
        .eq("ayat", parseInt(ayat))
        .order("created_at", { ascending: true });

      if (error) throw error;
      return res.status(200).json({ surah: parseInt(surah), ayat: parseInt(ayat), messages: data || [] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — add message
  if (req.method === "POST") {
    try {
      const authHeader = req.headers.authorization;
      let user = null;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        const payload = verifyJWT(token);
        if (payload) user = payload.email || payload.sub || "user";
      }

      const { text } = req.body || {};
      if (!text) return res.status(400).json({ error: "text required" });

      const { data, error } = await supabase
        .from(TABLE)
        .insert({
          surah: parseInt(surah),
          ayat: parseInt(ayat),
          author: user || "anonymous",
          text,
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ ok: true, message: data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
