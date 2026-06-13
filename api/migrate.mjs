// GET /api/migrate — run DB migrations (add name, password_hash columns if missing)
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const results = [];

  // Add name column if not exists
  try {
    const { error } = await supabase.rpc("exec_sql", {
      sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT DEFAULT ''",
    });
    if (error) {
      // rpc might not exist, try raw query via REST
      results.push({ step: "add_name_column", error: error.message });
    } else {
      results.push({ step: "add_name_column", ok: true });
    }
  } catch (e) {
    results.push({ step: "add_name_column", error: e.message });
  }

  // Add password_hash column if not exists
  try {
    const { error } = await supabase.rpc("exec_sql", {
      sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT ''",
    });
    if (error) {
      results.push({ step: "add_password_hash", error: error.message });
    } else {
      results.push({ step: "add_password_hash", ok: true });
    }
  } catch (e) {
    results.push({ step: "add_password_hash", error: e.message });
  }

  // Try direct REST endpoint as alternative
  return res.status(200).json({
    message: "Run the SQL below in Supabase SQL Editor if auto-migration failed",
    results,
    sql: `
-- Manually run this in Supabase SQL Editor:
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT '';
    `.trim(),
  });
}
