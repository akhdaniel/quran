// POST /api/auth/register — sign up with email, password, name
import { createJWT, signupUser } from "../_auth.mjs";

export default async function handler(req, res) {
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
    const name = (body.name || "").trim();

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Invalid email" });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const user = await signupUser(email, password, name);

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
        name: user.name,
        preferences: user.preferences,
      },
    });
  } catch (err) {
    console.error("register error:", err.message);
    if (err.message === "Email already registered") {
      return res.status(409).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || "Registration failed" });
  }
}
