// Shared auth helpers — JWT + Supabase user storage
import { createHmac, randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

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

// User helpers via Supabase
export async function getUser(email) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase().trim())
      .single();
    if (error) return null;
    return data;
  } catch { return null; }
}

export async function createUser(email) {
  if (!supabase) throw new Error("Database not configured");
  const user = {
    id: "user_" + randomUUID().slice(0, 8),
    email: email.toLowerCase().trim(),
    preferences: {
      qari: "",
      theme: "dark",
      lastRead: { surah: 1, ayat: 1 },
    },
  };

  const { data, error } = await supabase
    .from("users")
    .insert(user)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function saveUserPrefs(email, prefs) {
  if (!supabase) throw new Error("Database not configured");
  // Get current prefs first
  const { data: user, error: getErr } = await supabase
    .from("users")
    .select("preferences")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (getErr) return null;

  const mergedPrefs = { ...user.preferences, ...prefs };

  const { data, error } = await supabase
    .from("users")
    .update({ preferences: mergedPrefs })
    .eq("email", email.toLowerCase().trim())
    .select()
    .single();

  if (error) return null;
  return data;
}

// Magic link helpers via Supabase
export async function storeMagicLink(email) {
  if (!supabase) throw new Error("Database not configured");
  const token = randomUUID();
  const data = {
    token,
    email: email.toLowerCase().trim(),
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    consumed: false,
  };

  const { error } = await supabase.from("magic_links").insert(data);
  if (error) throw error;
  return token;
}

export async function consumeMagicLink(token) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("magic_links")
      .select("*")
      .eq("token", token)
      .eq("consumed", false)
      .single();

    if (error) return null;

    // Check expiry
    if (new Date(data.expires_at) < new Date()) return null;

    // Mark as consumed (one-time use)
    await supabase
      .from("magic_links")
      .update({ consumed: true })
      .eq("token", token);

    return data;
  } catch { return null; }
}
