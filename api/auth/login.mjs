// POST /api/auth/login — sign in with email + password
import { createJWT, loginUser, runMigration } from "../_auth.mjs";

export default async function handler(req, res) {
  await runMigration();
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    let body = {};
    try { body = req.body || JSON.parse(req.body || "{}"); } catch {}

    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const user = await loginUser(email, password);

    const jwt = createJWT({
      sub: user.id,
      email: user.email,
      name: user.name,
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600, // 30 days
    });

    return res.status(200).json({
      ok: true,
      token: jwt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || (user.preferences && user.preferences._name) || "",
        preferences: user.preferences,
      },
    });
  } catch (err) {
    console.error("login error:", err.message);
    if (err.message === "User not found" || err.message === "Wrong password") {
      return res.status(401).json({ error: err.message });
    }
    if (err.message === "Set password first") {
      return res.status(400).json({ error: err.message, needsPasswordSetup: true });
    }
    return res.status(500).json({ error: err.message || "Login failed" });
  }
}
