// GET /api/admin/users — list users (count only)
// GET /api/admin/users — list users (count only)
import { list, get } from "@vercel/blob";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!BLOB_TOKEN) return res.status(500).json({ error: "BLOB token not set" });

  try {
    const response = await list({ prefix: "users/", token: BLOB_TOKEN, limit: 1000 });
    const blobs = response.blobs || [];
    const users = blobs.map((b) => b.pathname);

    return res.status(200).json({
      ok: true,
      total: blobs.length,
      users: users,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
