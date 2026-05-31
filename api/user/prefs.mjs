// /api/user/prefs — GET/PUT user preferences
import { verifyJWT, getUser, saveUserPrefs } from "../_auth.mjs";

function getUserFromReq(req, res) {
  const auth = req.headers?.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "No auth token" });
    return null;
  }
  const payload = verifyJWT(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }
  return payload;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const userPayload = getUserFromReq(req, res);
  if (!userPayload) return;

  try {
    if (req.method === "GET") {
      const user = await getUser(userPayload.email);
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.status(200).json({
        ok: true,
        preferences: user.preferences,
      });
    }

    if (req.method === "PUT") {
      let body = {};
      try { body = req.body || JSON.parse(req.body || "{}"); } catch {}
      const { qari, theme, lastRead } = body;
      const prefs = {};
      if (qari !== undefined) prefs.qari = qari;
      if (theme !== undefined) prefs.theme = theme;
      if (lastRead !== undefined) prefs.lastRead = lastRead;

      const user = await saveUserPrefs(userPayload.email, prefs);
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.status(200).json({ ok: true, preferences: user.preferences });
    }

    return res.status(405).json({ error: "GET or PUT only" });
  } catch (err) {
    console.error("prefs error:", err);
    return res.status(500).json({ error: err.message });
  }
}
