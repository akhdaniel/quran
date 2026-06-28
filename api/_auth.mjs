// Shared auth helpers — JWT + PostgREST user storage
import { createHmac, randomUUID, randomBytes, timingSafeEqual } from "crypto";

const PGREST_URL = "http://124.156.205.118:3001";
const API_KEY = process.env.VITE_DEEPSEEK_API_KEY || process.env.SMTP2GO_API_KEY || "dev-secret";

// ─── PostgREST fetch helper ──────────────────────────
async function pgrst(path, options = {}) {
  const url = PGREST_URL + path;
  const resp = await fetch(url, {
    headers: { "Content-Type": "application/json", "Accept": "application/json", ...options.headers },
    ...options,
  });
  if (!resp.ok) throw new Error(`PostgREST ${resp.status}: ${await resp.text()}`);
  return resp;
}

// ─── HMAC JWT ─────────────────────────────────────
function getSecret() {
  return API_KEY;
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

// ─── User CRUD via PostgREST ──────────────────────────
export async function getUserByEmail(email) {
  const resp = await pgrst(`/users?email=eq.${encodeURIComponent(email)}&select=id,email,created_at,preferences`);
  const data = await resp.json();
  return data?.[0] || null;
}

export async function createUser(email) {
  const resp = await pgrst("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify({ email, preferences: {} }),
  });
  const data = await resp.json();
  return data?.[0] || data;
}

export async function getUserById(id) {
  const resp = await pgrst(`/users?id=eq.${encodeURIComponent(id)}&select=id,email,created_at,preferences`);
  const data = await resp.json();
  return data?.[0] || null;
}

export async function updateUserProfile(id, updates) {
  const resp = await pgrst(`/users?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify(updates),
  });
  const data = await resp.json();
  return data?.[0] || data;
}

export async function updateUserPreferences(id, prefs) {
  const user = await getUserById(id);
  if (!user) return null;
  const merged = { ...(user.preferences || {}), ...prefs };
  return updateUserProfile(id, { preferences: merged });
}

// ─── Magic Links ──────────────────────────────────────
export async function storeMagicLink(email) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await pgrst("/magic_links", {
    method: "POST",
    body: JSON.stringify({ token, email, expires_at: expiresAt, consumed: false }),
  });

  return token;
}

export async function consumeMagicLink(token) {
  try {
    const resp = await pgrst(`/magic_links?token=eq.${token}&consumed=eq.false&select=*`);
    const data = await resp.json();
    const link = data?.[0];
    if (!link) return null;

    if (new Date(link.expires_at) < new Date()) return null;

    await pgrst(`/magic_links?token=eq.${token}`, {
      method: "PATCH",
      body: JSON.stringify({ consumed: true }),
    });

    return link;
  } catch { return null; }
}
