// GET/PUT /api/auth/profile — get or update user profile
import { verifyJWT, getUserById, updateUserProfile } from "../_auth.mjs";

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
      const user = await getUserById(userPayload.sub);
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.status(200).json({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    }

    if (req.method === "PUT") {
      let body = {};
      try { body = req.body || JSON.parse(req.body || "{}"); } catch {}

      const user = await updateUserProfile(userPayload.email, body);
      if (!user) return res.status(400).json({ error: "No changes" });

      // Issue new JWT with updated name
      const { createJWT } = await import("../_auth.mjs");
      const newJwt = createJWT({
        sub: user.id,
        email: user.email,
        name: user.name,
        exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
      });

      return res.status(200).json({
        ok: true,
        token: newJwt,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    }

    return res.status(405).json({ error: "GET or PUT only" });
  } catch (err) {
    console.error("profile error:", err);
    return res.status(500).json({ error: err.message });
  }
}
