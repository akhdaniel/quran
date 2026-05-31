// /api/chats — GET shared chats for an ayat, POST new message
import { put, get } from "@vercel/blob";
import { verifyJWT } from "./_auth.mjs";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const PREFIX = "chats/";

function chatKey(surah, ayat) {
  return PREFIX + surah + "-" + ayat + ".json";
}

async function loadChats(surah, ayat) {
  const key = chatKey(surah, ayat);
  try {
    const blob = await get(key, { access: "private", token: BLOB_TOKEN });
    if (!blob) return { surah, ayat, messages: [] };
    const chunks = [];
    for await (const chunk of blob.stream) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return { surah, ayat, messages: [] };
  }
}

async function saveChats(surah, ayat, messages) {
  const key = chatKey(surah, ayat);
  await put(key, JSON.stringify({ surah, ayat, messages }), {
    access: "private", addRandomSuffix: false, allowOverwrite: true, token: BLOB_TOKEN,
  });
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      const surah = parseInt(req.query?.surah, 10);
      const ayat = parseInt(req.query?.ayat, 10);
      if (!surah || !ayat) return res.status(400).json({ error: "Missing surah/ayat" });

      const data = await loadChats(surah, ayat);
      return res.status(200).json({ ok: true, ...data });
    }

    if (req.method === "POST") {
      // Require auth
      const auth = req.headers?.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const userPayload = verifyJWT(token);
      if (!userPayload) return res.status(401).json({ error: "Login required" });

      let body = {};
      try { body = req.body || JSON.parse(req.body || "{}"); } catch {}
      const { surah, ayat, content, role } = body;
      if (!surah || !ayat || !content) return res.status(400).json({ error: "Missing surah/ayat/content" });

      const data = await loadChats(surah, ayat);
      const msg = {
        id: "msg_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        userId: userPayload.sub,
        email: role === "assistant" ? "AI" : userPayload.email,
        role: role || "user",
        content,
        timestamp: new Date().toISOString(),
      };
      data.messages.push(msg);
      await saveChats(surah, ayat, data.messages);

      return res.status(200).json({ ok: true, message: msg });
    }

    return res.status(405).json({ error: "GET or POST only" });
  } catch (err) {
    console.error("chats error:", err);
    return res.status(500).json({ error: err.message });
  }
}
