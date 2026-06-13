// Shared auth helpers — JWT + Supabase user storage
import { createHmac, randomUUID, randomBytes, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// ─── HMAC JWT ─────────────────────────────────────
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

// ─── Password Hashing (SHA-256 + salt) ────────────
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = createHmac("sha256", salt).update(password).digest("hex");
  return salt + ":" + hash;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = createHmac("sha256", salt).update(password).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  } catch {
    return false;
  }
}

// ─── User Helpers ─────────────────────────────────
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

export async function getUserById(id) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return null;
    return data;
  } catch { return null; }
}

export async function createUser(email, name = "") {
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

  const extra = {};
  if (name) extra.name = name.trim() || email.split("@")[0];

  const { data, error } = await insertUser(user, extra);
  if (error) throw error;
  return data;
}

// ─── Signup with password ─────────────────────────
// Helper: insert user with graceful column fallback
// For columns that don't exist yet, store them in preferences JSONB
async function insertUser(user, extraFields = {}) {
  let fields = { ...extraFields };
  let prefsExtras = {}; // Stuff to store in preferences JSONB

  while (true) {
    const payload = { ...user, ...fields };
    // Merge extras into preferences
    if (Object.keys(prefsExtras).length > 0) {
      payload.preferences = { ...user.preferences, ...prefsExtras };
    }
    try {
      const { data, error } = await supabase.from("users").insert(payload).select().single();
      if (!error) return { data, error: null };

      const msg = error.message || "";
      if (msg.includes("name")) {
        if (fields.name) { prefsExtras._name = fields.name; }
        delete fields.name;
        continue;
      }
      if (msg.includes("password_hash")) {
        if (fields.password_hash) { prefsExtras._password_hash = fields.password_hash; }
        delete fields.password_hash;
        continue;
      }
      return { data, error };
    } catch (e) {
      return { data: null, error: e };
    }
  }
}

// Read name from either column or preferences JSONB
function getUserDisplayName(user) {
  if (user.name) return user.name;
  if (user.preferences && user.preferences._name) return user.preferences._name;
  return "";
}

function getUserPasswordHash(user) {
  if (user.password_hash) return user.password_hash;
  if (user.preferences && user.preferences._password_hash) return user.preferences._password_hash;
  return "";
}

export async function signupUser(email, password, name = "") {
  if (!supabase) throw new Error("Database not configured");

  const existing = await getUser(email);
  if (existing) throw new Error("Email already registered");

  const password_hash = hashPassword(password);
  const user = {
    id: "user_" + randomUUID().slice(0, 8),
    email: email.toLowerCase().trim(),
    preferences: {
      qari: "",
      theme: "dark",
      lastRead: { surah: 1, ayat: 1 },
    },
  };

  const extra = { password_hash };
  if (name) extra.name = name.trim() || email.split("@")[0];

  const { data, error } = await insertUser(user, extra);
  if (error) throw error;
  return data;
}

// ─── Login with password ──────────────────────────
export async function loginUser(email, password) {
  const user = await getUser(email);
  if (!user) throw new Error("User not found");

  // If no password_hash set (magic link user), prompt to set password
  const pwhash = getUserPasswordHash(user);
  if (!pwhash) throw new Error("Set password first");

  if (!verifyPassword(password, pwhash)) {
    throw new Error("Wrong password");
  }

  return user;
}

// ─── Set password for existing magic-link users ───
export async function setUserPassword(email, password) {
  if (!supabase) throw new Error("Database not configured");
  const password_hash = hashPassword(password);

  // Try updating password_hash column; fall back to preferences JSONB
  const { data, error } = await supabase
    .from("users")
    .update({ password_hash })
    .eq("email", email.toLowerCase().trim())
    .select()
    .single()
    .catch(async () => {
      // password_hash column doesn't exist — store in preferences
      const { data: user } = await supabase
        .from("users")
        .select("preferences")
        .eq("email", email.toLowerCase().trim())
        .single();
      if (!user) throw new Error("User not found");
      const prefs = { ...user.preferences, _password_hash: password_hash };
      return await supabase
        .from("users")
        .update({ preferences: prefs })
        .eq("email", email.toLowerCase().trim())
        .select()
        .single();
    });

  if (error) throw error;
  return data;
}

// ─── Update user profile ──────────────────────────
export async function updateUserProfile(email, updates) {
  if (!supabase) throw new Error("Database not configured");

  const allowed = {};
  if (updates.name !== undefined) allowed.name = updates.name.trim();

  if (Object.keys(allowed).length === 0) return null;

  const { data, error } = await supabase
    .from("users")
    .update(allowed)
    .eq("email", email.toLowerCase().trim())
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Preferences ──────────────────────────────────
export async function saveUserPrefs(email, prefs) {
  if (!supabase) throw new Error("Database not configured");
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

// ─── Auto Migration ───────────────────────────────
// Runs once on first deploy to add missing columns
let migrationDone = false;

export async function runMigration() {
  if (migrationDone || !supabase || !supabaseUrl) return;
  migrationDone = true;

  // Try via management API (project.supabase.co/rest/v1/)
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey) return;

  const projectRef = supabaseUrl.replace(/^https?:\/\//, "").replace(/\.supabase\.co.*$/, "");
  const mgmtUrl = `https://api.supabase.com/v1/projects/${projectRef}/sql`;

  const sql = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT '';
  `.trim();

  try {
    const res = await fetch(mgmtUrl, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    if (res.ok) {
      console.log("Migration: columns added successfully");
    } else {
      const text = await res.text().catch(() => "");
      console.log("Migration mgmt API failed:", res.status, text.slice(0, 200));
    }
  } catch (e) {
    console.log("Migration error:", e.message);
  }
}

// ─── Magic Link Helpers ───────────────────────────
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

    if (new Date(data.expires_at) < new Date()) return null;

    await supabase
      .from("magic_links")
      .update({ consumed: true })
      .eq("token", token);

    return data;
  } catch { return null; }
}
