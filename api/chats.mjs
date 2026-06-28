// /api/chats — GET shared chats for an ayat, POST new message (via PostgREST)
import { verifyJWT } from "./_auth.mjs";

const PGREST_URL = "https://pgrest.xerpium.com/quran";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { surah, ayat } = req.query;
  if (!surah || !ayat) return res.status(400).json({ error: "surah and ayat required" });

  // GET — load chat messages
  if (req.method === "GET") {
    try {
      const resp = await fetch(
        `${PGREST_URL}/chats?surah=eq.${parseInt(surah)}&ayat=eq.${parseInt(ayat)}&order=created_at.asc&select=*`
      );
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
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

      const resp = await fetch(`${PGREST_URL}/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Prefer": "return=representation" },
        body: JSON.stringify({
          surah: parseInt(surah),
          ayat: parseInt(ayat),
          author: user || "anonymous",
          text,
        }),
      });

      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();

      return res.status(200).json({ ok: true, message: data?.[0] || data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
