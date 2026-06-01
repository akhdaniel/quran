// GET /api/admin/users — list users (count only)
import { list, get } from "@vercel/blob";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!BLOB_TOKEN) return res.status(500).json({ error: "BLOB token not set" });

  try {
    const { blobs } = await list({ prefix: "users/", token: BLOB_TOKEN });
    const entries = blobs.map((b) => b.pathname);

    // Read each user to get email
    const users = [];
    for (const path of entries) {
      try {
        const blob = await get(path, { access: "private", token: BLOB_TOKEN });
        if (blob) {
          const chunks = [];
          for await (const chunk of blob.stream) chunks.push(chunk);
          const data = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
          users.push({ email: data.email, createdAt: data.createdAt });
        }
      } catch {}
    }

    return res.status(200).json({
      ok: true,
      total: users.length,
      users: users.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
