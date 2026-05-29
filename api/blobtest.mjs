// === API test: cek apakah @vercel/blob bisa jalan di serverless ===
import { put, get } from "@vercel/blob";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  const token = process.env.BLOB_READ_WRITE_TOKEN || "";
  const parts = token.split("_");
  const storeId = parts[parts.length - 1] || "unknown";

  // Coba put
  let putResult = { ok: false, error: null, url: null };
  try {
    const r = await put("test-ping.json", JSON.stringify({
      ping: true,
      time: Date.now(),
    }), { access: "public", addRandomSuffix: false, token });
    putResult = { ok: true, url: r.url, downloadUrl: r.downloadUrl, pathname: r.pathname };
  } catch (e) {
    putResult.error = e.message;
  }

  // Coba get
  let getResult = { ok: false, error: null, data: null };
  if (putResult.ok) {
    try {
      const blob = await get("test-ping.json", { access: "public", token });
      if (blob) {
        const text = await blob.text();
        getResult = { ok: true, data: JSON.parse(text) };
      } else {
        getResult = { ok: false, error: "blob is null" };
      }
    } catch (e) {
      getResult.error = e.message;
    }
  }

  // Coba get langsung dari public URL
  let directGetResult = { ok: false, error: null };
  if (putResult.url) {
    try {
      const r2 = await fetch(putResult.url);
      if (r2.ok) {
        const t2 = await r2.text();
        directGetResult = { ok: true, data: JSON.parse(t2) };
      } else {
        directGetResult = { ok: false, error: `HTTP ${r2.status}`, body: await r2.text().catch(() => "") };
      }
    } catch (e) {
      directGetResult.error = e.message;
    }
  }

  // Hapus test file
  try {
    // Vercel Blob doesn't have a simple delete in the SDK,
    // but we can overwrite with empty content
  } catch {}

  res.status(200).json({
    token_prefix: token.substring(0, 15),
    store_id: storeId,
    put: putResult,
    get: getResult,
    direct_get: directGetResult,
  });
}
