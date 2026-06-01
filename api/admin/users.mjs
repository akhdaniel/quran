// GET /api/admin/users — list users (count only)
// GET /api/admin/users — list users (count only)
import { put, get } from "@vercel/blob";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const STORE_ID = process.env.BLOB_STORE_ID || "";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!BLOB_TOKEN) return res.status(500).json({ error: "BLOB token not set" });

  try {
    // Use Blob REST API directly (list endpoint)
    const apiUrl = "https://blob.vercel-storage.com/" + (STORE_ID ? STORE_ID + "/" : "") + "?prefix=users/&limit=1000";
    const resp = await fetch(apiUrl, {
      headers: { Authorization: "Bearer " + BLOB_TOKEN },
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return res.status(500).json({ error: "List failed: " + resp.status, detail: errText.slice(0, 200) });
    }
    const listData = await resp.json();
    const blobs = listData.blobs || [];

    // Read each user
    const users = [];
    for (const b of blobs) {
      try {
        const blob = await get(b.pathname, { access: "private", token: BLOB_TOKEN });
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
