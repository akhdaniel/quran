// POST /api/fill-analysis — generate analysis untuk ayat yang belum ada
// Proses 1 ayat per panggilan (BATCH=1 biar gak timeout di Vercel)
import { createClient } from "@supabase/supabase-js";

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const BATCH = 1; // 1 ayat per panggilan biar cepet
const PROGRESS_KEY = "analysis_progress";

// ID Prompt
const PROMPT_ID = `Analisislah ayat Al-Qur'an berikut secara mendalam dan terstruktur dalam Bahasa Indonesia. Langsung ke analisis, tanpa pendahuluan atau penutup.

{surahInfo}**Ayat:**
{arab}

**Terjemahan:**
{translation}

{latinSegment}Berikan analisis dengan format berikut (gunakan markdown sederhana):

1. **Terjemahan Kata Per Kata** — tiap kata: - **tulis kata dalam huruf Arab** — artinya
2. **Bentukan Kata (Sarf/Morfologi)** — analisis bentuk kata dasar (fi'il madhi/mudhari/amar, isim masdar, isim fa'il/maf'ul, dll) untuk kata-kata kunci, beserta arti/konsep dari kata dasar tersebut
3. **Balaghah** — analisis retorika dan keindahan bahasa: uslub (gaya bahasa), kinayah/majaz, fashahah, keunikan susunan kata
4. **Tafsir Singkat** — penjelasan singkat makna ayat, minimal dari 3 sumber tafsir berikut: Ibnu Katsir, As-Sa'di, Al-Muyassar/Al-Munir, Al-Qurthubi, Ath-Thabari, Sayyid Qutb
5. **Asbabun Nuzul** — sebab-sebab turunnya ayat ini (riwayat yang shahih), jika ada. Jika tidak ada riwayat khusus, sebutkan bahwa ayat ini diturunkan tanpa sebab khusus (ghairu sababin nuzul) dan tetap berikan konteks historisnya`;

// EN Prompt
const PROMPT_EN = `Analyze the following Qur'anic verse deeply and in a structured manner in English. Get straight to the analysis, no introduction or closing.

{surahInfo}**Verse:**
{arab}

**Translation:**
{translation}

{latinSegment}Provide analysis in the following format (use simple markdown):

1. **Word-by-Word Translation** — each word: - **write the word in Arabic script** — meaning
2. **Word Formation (Sarf/Morphology)** — analysis of root word forms (fi'il madhi/mudhari/amar, isim masdar, isim fa'il/maf'ul, etc.) for key words, with the meaning/concept of each root word
3. **Balaghah (Rhetoric)** — analysis of rhetorical devices and linguistic beauty: uslub (style), kinayah/majaz (metaphor), fashahah (eloquence), unique word arrangement
4. **Brief Tafsir** — concise explanation from at least 3 of these tafsir sources: Ibn Kathir, As-Sa'di, Al-Muyassar/Al-Munir, Al-Qurtubi, At-Tabari, Sayyid Qutb
5. **Asbabun Nuzul (Occasion of Revelation)** — the authentic reasons/context for this verse's revelation, if known. If no specific narration exists, state that the verse was revealed without a specific occasion (ghairu sababin nuzul) and still provide its historical context`;

async function loadQuranData() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("quran_data")
    .select("data")
    .eq("key", "full")
    .single();
  if (error) return null;
  return data.data;
}

async function loadProgress() {
  if (!supabase) return { current: 0, total: 0 };
  try {
    const { data, error } = await supabase
      .from("quran_data")
      .select("data")
      .eq("key", PROGRESS_KEY)
      .single();
    if (error) return { current: 0, total: 0 };
    return data.data;
  } catch {
    return { current: 0, total: 0 };
  }
}

async function saveProgress(progress) {
  if (!supabase) return;
  await supabase
    .from("quran_data")
    .upsert({
      key: PROGRESS_KEY,
      data: progress,
      updated_at: new Date().toISOString(),
    }, { onConflict: "key", ignoreDuplicates: false });
}

async function getAnalysisExists(surah, ayat, lang) {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("analysis")
    .select("id")
    .eq("surah", surah)
    .eq("ayat", ayat)
    .eq("lang", lang)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!supabase) return res.status(500).json({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" });
  if (!DEEPSEEK_KEY) return res.status(500).json({ error: "DEEPSEEK_API_KEY not set" });

  // Allow resetting progress
  let body = {};
  try { body = req.body || {}; } catch {}
  const resetTo = body.reset !== undefined ? parseInt(body.reset, 10) : null;
  if (resetTo !== null && !isNaN(resetTo) && resetTo >= 0) {
    await saveProgress({ current: resetTo, total: 12472 });
    return res.status(200).json({ ok: true, message: "Progress reset to index " + resetTo, progress: { current: resetTo, total: 12472 } });
  }
  
  const forceReanalyze = body.force === true;

  try {
    // Load data & progress
    const quranData = await loadQuranData();
    if (!quranData) return res.status(404).json({ error: "Quran data not found. Sync quran data first." });

    let progress = await loadProgress();

    // Build full task list
    if (progress.total === 0) {
      let total = 0;
      for (const s of quranData.surahs) {
        for (const a of s.ayat) {
          total += 2; // ID + EN
        }
      }
      progress.total = total;
      await saveProgress(progress);
    }

    // Find next BATCH tasks
    const tasks = [];
    let idx = 0;
    for (const s of quranData.surahs) {
      for (const a of s.ayat) {
        for (const lang of ["id", "en"]) {
          if (tasks.length >= BATCH) break;
          if (idx < progress.current) { idx++; continue; }
          const exists = forceReanalyze ? false : await getAnalysisExists(s.nomor, a.nomor, lang);
          if (!exists) {
            const arab = a.teksArab || "";
            const translation = lang === "en" && a.teksInggris ? a.teksInggris : a.teksIndonesia || "";
            const latinSegment = a.teksLatin ? "**Latin:** " + a.teksLatin + "\n\n" : "";
            const surahInfo = "**Surah:** " + (s.nomor || "") + " - Ayat " + (a.nomor || "") + "\n\n";
            const prompt = (lang === "en" ? PROMPT_EN : PROMPT_ID)
              .replace("{surahInfo}", surahInfo)
              .replace("{arab}", arab)
              .replace("{translation}", translation)
              .replace("{latinSegment}", latinSegment);

            tasks.push({ surah: s.nomor, ayat: a.nomor, lang, arab, prompt });
          }
          idx++;
        }
        if (tasks.length >= BATCH) break;
      }
      if (tasks.length >= BATCH) break;
    }

    if (tasks.length === 0) {
      return res.status(200).json({
        ok: true, message: "Semua ayat sudah dianalisa!",
        progress: { current: progress.total, total: progress.total },
        done: true,
      });
    }

    // Process tasks
    const results = [];
    for (const task of tasks) {
      const aiRes = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + DEEPSEEK_KEY,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content: task.lang === "en"
                ? "You are an expert Qur'anic tafsir assistant. Only answer about the given verse, nahw, sarf, balaghah, and tafsir. Answer directly without preamble or closing."
                : "Kamu adalah asisten ahli tafsir Al-Qur'an. Jawab langsung tanpa pendahuluan atau penutup.",
            },
            { role: "user", content: task.prompt },
          ],
          max_tokens: 4000,
          temperature: 0.3,
        }),
      });

      if (!aiRes.ok) {
        const err = await aiRes.text().catch(() => "");
        results.push({ surah: task.surah, ayat: task.ayat, lang: task.lang, status: "error", error: err.slice(0,200) });
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      const aiData = await aiRes.json();
      const content = aiData.choices?.[0]?.message?.content || "";

      // Save to Supabase
      try {
        const { error } = await supabase.from("analysis").upsert({
          surah: task.surah,
          ayat: task.ayat,
          lang: task.lang,
          content,
          updated_at: new Date().toISOString(),
        }, { onConflict: "surah,ayat,lang", ignoreDuplicates: false });

        if (error) throw error;
        results.push({ surah: task.surah, ayat: task.ayat, lang: task.lang, status: "ok" });
      } catch (e) {
        results.push({ surah: task.surah, ayat: task.ayat, lang: task.lang, status: "save_error", error: e.message });
      }

      // Only advance progress on success
      progress.current++;
      await saveProgress(progress);
      await new Promise(r => setTimeout(r, 1000));
    }

    return res.status(200).json({
      ok: true,
      processed: results.length,
      progress: { current: progress.current, total: progress.total },
      remaining: progress.total - progress.current,
      results,
    });
  } catch (err) {
    console.error("fill-analysis error:", err);
    return res.status(500).json({ error: err.message });
  }
}
