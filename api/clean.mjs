// POST /api/sync-quran/clean — strip Quranic annotation chars from Arabic text
// Run once to clean up non-standard Unicode characters in stored data
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (!supabase) {
    return res.status(500).json({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" });
  }

  try {
    // Baca data yang ada
    const { data: record, error: readErr } = await supabase
      .from("quran_data")
      .select("data")
      .eq("key", "full")
      .single();

    if (readErr) return res.status(404).json({ error: "Data not found, run /api/sync-quran first" });
    const data = record.data;

    // Quranic annotation characters to strip
    const stripRegex = /[\u06D5-\u06ED\u08D0-\u08E1\u08E3-\u08FF\uFE70-\uFEFF\uFDF2-\uFDFD]/g;

    let cleaned = 0;
    for (const surah of data.surahs) {
      for (const ayat of surah.ayat) {
        const original = ayat.teksArab;
        let cleanedText = ayat.teksArab.replace(stripRegex, '').replace(/\s{2,}/g, ' ').trim();
        if (cleanedText !== original) {
          ayat.teksArab = cleanedText;
          cleaned++;
        }
      }
    }

    // Normalize spaces
    let spaceNormalized = 0;
    for (const surah of data.surahs) {
      for (const ayat of surah.ayat) {
        const normalized = ayat.teksArab.replace(/\s{2,}/g, ' ').trim();
        if (normalized !== ayat.teksArab) {
          ayat.teksArab = normalized;
          spaceNormalized++;
        }
      }
    }

    // Simpan balik ke Supabase
    data.cleanedAt = new Date().toISOString();
    const { error: saveErr } = await supabase
      .from("quran_data")
      .upsert({
        key: "full",
        data: data,
        updated_at: new Date().toISOString(),
      }, { onConflict: "key", ignoreDuplicates: false });

    if (saveErr) throw saveErr;

    return res.status(200).json({
      ok: true,
      totalAyatsCleaned: cleaned,
      totalAyats: data.totalAyats,
    });
  } catch (err) {
    console.error("clean error:", err);
    return res.status(500).json({ error: err.message });
  }
}
