// GET /api/auth/verify?token=xxx — verify magic link, create/login user, return JWT
import { createJWT, getUser, createUser, consumeMagicLink } from "../_auth.mjs";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const token = req.query?.token || "";
  if (!token) return res.status(400).json({ error: "Missing token" });

  try {
    // Consume the magic link (one-time use)
    const linkData = await consumeMagicLink(token);
    if (!linkData) return res.status(401).json({ error: "Invalid or expired link" });

    const email = linkData.email;

    // Find or create user
    let user = await getUser(email);
    let isNew = false;
    if (!user) {
      user = await createUser(email);
      isNew = true;
    }

    // Generate JWT (7 days expiry)
    const jwt = createJWT({
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    });

    return res.status(200).json({
      ok: true,
      token: jwt,
      isNew,
      user: {
        id: user.id,
        email: user.email,
        preferences: user.preferences,
      },
    });
  } catch (err) {
    console.error("verify error:", err);
    return res.status(500).json({ error: err.message });
  }
}
