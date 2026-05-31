// Shared auth helpers — JWT + Blob user storage
import { createHmac, randomUUID } from "crypto";
import { put, get, del } from "@vercel/blob";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

// Signing secret: SMTP2GO key used as HMAC secret
function getSecret() {
  return process.env.SMTP2GO_API_KEY || process.env.VITE_DEEPSEEK_API_KEY || "dev-secret";
}

export function createJWT(payload) {
  const secret = getSecret();
  const header = { alg: "HS256", typ: "JWT" };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const h = b64(header);
  const p = b64(payload);
  const sig = createHmac("sha256", secret).update(h + "." + p).digest("base64url");
  return h + "." + p + "." + sig;
}

export function verifyJWT(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const secret = getSecret();
    const sig = createHmac("sha256", secret).update(parts[0] + "." + parts[1]).digest("base64url");
    if (sig !== parts[2]) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// User storage helpers
function userKey(email) {
  const hash = Buffer.from(email.toLowerCase().trim()).toString("base64url");
  return "users/" + hash + ".json";
}

export async function getUser(email) {
  const key = userKey(email);
  try {
    const blob = await get(key, { access: "private", token: BLOB_TOKEN });
    if (!blob) return null;
    const chunks = [];
    for await (const chunk of blob.stream) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch { return null; }
}

export async function createUser(email) {
  const user = {
    id: "user_" + randomUUID().slice(0, 8),
    email: email.toLowerCase().trim(),
    preferences: {
      qari: "",
      theme: "dark",
      lastRead: { surah: 1, ayat: 1 },
    },
    createdAt: new Date().toISOString(),
  };
  await put(userKey(email), JSON.stringify(user), {
    access: "private", addRandomSuffix: false, allowOverwrite: true, token: BLOB_TOKEN,
  });
  return user;
}

export async function saveUserPrefs(email, prefs) {
  const user = await getUser(email);
  if (!user) return null;
  user.preferences = { ...user.preferences, ...prefs };
  await put(userKey(email), JSON.stringify(user), {
    access: "private", addRandomSuffix: false, allowOverwrite: true, token: BLOB_TOKEN,
  });
  return user;
}

// Magic link helpers
const LINK_PREFIX = "magic-links/";

export async function storeMagicLink(email) {
  const token = randomUUID();
  const data = {
    email: email.toLowerCase().trim(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min
  };
  await put(LINK_PREFIX + token + ".json", JSON.stringify(data), {
    access: "private", addRandomSuffix: false, allowOverwrite: true, token: BLOB_TOKEN,
  });
  return token;
}

export async function consumeMagicLink(token) {
  const key = LINK_PREFIX + token + ".json";
  try {
    const blob = await get(key, { access: "private", token: BLOB_TOKEN });
    if (!blob) return null;
    const chunks = [];
    for await (const chunk of blob.stream) chunks.push(chunk);
    const data = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    // Delete immediately (one-time use)
    await del(key, { access: "private", token: BLOB_TOKEN });
    // Check expiry
    if (new Date(data.expiresAt) < new Date()) return null;
    return data;
  } catch { return null; }
}
