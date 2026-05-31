// POST /api/fill-analysis — generate analysis untuk ayat yang belum ada
// Proses 5 ayat per panggilan, simpan progress di Blob
import { put, get } from "@vercel/blob";

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY;
const PROGRESS_KEY = "analysis/progress.json";
const BATCH = 3; // 5 ayat per panggilan
const PREFIX = "analysis/";

// ID Prompt (clean, no JSON)
const PROMPT_ID = `Analisislah ayat Al-Qur'an berikut secara mendalam dan terstruktur dalam Bahasa Indonesia. Langsung ke analisis, tanpa pendahuluan atau penutup.

**Ayat:**
{arab}

**Terjemahan:**
{translation}

{latinSegment}Berikan analisis dengan format berikut (gunakan markdown sederhana):

1. **Terjemahan Kata Per Kata** — tiap kata: - **tulis kata dalam huruf Arab** — artinya
2. **Bentukan Kata (Sarf/Morfologi)** — analisis bentuk kata dasar (fi'il madhi/mudhari/amar, isim masdar, isim fa'il/maf'ul, dll) untuk kata-kata kunci, beserta arti/konsep dari kata dasar tersebut
3. **Balaghah** — analisis retorika dan keindahan bahasa: uslub (gaya bahasa), kinayah/majaz, fashahah, keunikan susunan kata
4. **Tafsir Singkat** — penjelasan singkat makna ayat, minimal dari 3 sumber tafsir berikut: Ibnu Katsir, As-Sa'di, Al-Muyassar/Al-Munir, Al-Qurthubi, Ath-Thabari, Sayyid Qutb`;

// EN Prompt
const PROMPT_EN = `Analyze the following Qur'anic verse deeply and in a structured manner in English. Get straight to the analysis, no introduction or closing.

**Verse:**
{arab}

**Translation:**
{translation}

{latinSegment}Provide analysis in the following format (use simple markdown):

1. **Word-by-Word Translation** — each word: - **write the word in Arabic script** — meaning
2. **Word Formation (Sarf/Morphology)** — analysis of root word forms (fi'il madhi/mudhari/amar, isim masdar, isim fa'il/maf'ul, etc.) for key words, with the meaning/concept of each root word
3. **Balaghah (Rhetoric)** — analysis of rhetorical devices and linguistic beauty: uslub (style), kinayah/majaz (metaphor), fashahah (eloquence), unique word arrangement
4. **Brief Tafsir** — concise explanation from at least 3 of these tafsir sources: Ibn Kathir, As-Sa'di, Al-Muyassar/Al-Munir, Al-Qurtubi, At-Tabari, Sayyid Qutb`;

async function loadQuranData() {
  const blob = await get("quran-data/full.json", { access: "private", token: BLOB_TOKEN });
  if (!blob) return null;
  const chunks = [];
  for await (const chunk of blob.stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

async function loadProgress() {
  try {
    const blob = await get(PROGRESS_KEY, { access: "private", token: BLOB_TOKEN });
    if (!blob) return { current: 0, total: 0 };
    const chunks = [];
    for await (const chunk of blob.stream) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return { current: 0, total: 0 };
  }
}

async function saveProgress(progress) {
  await put(PROGRESS_KEY, JSON.stringify(progress), {
    access: "private", addRandomSuffix: false, allowOverwrite: true, token: BLOB_TOKEN,
  });
}

async function getAnalysis(surah, ayat, lang) {
  const key = PREFIX + surah + "-" + ayat + "-" + lang + ".json";
  try {
    const blob = await get(key, { access: "private", token: BLOB_TOKEN });
    return !!blob;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!BLOB_TOKEN) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not set" });
  if (!DEEPSEEK_KEY) return res.status(500).json({ error: "DEEPSEEK_API_KEY not set. Set DEEPSEEK_API_KEY or VITE_DEEPSEEK_API_KEY in Vercel env" });

  try {
    // Load data & progress
    const quranData = await loadQuranData();
    if (!quranData) return res.status(404).json({ error: "Quran data not found" });

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

    // Find next BATCH tasks that don't have analysis yet
    const tasks = [];
    let idx = 0;
    let scanned = 0;
    for (const s of quranData.surahs) {
      for (const a of s.ayat) {
        for (const lang of ["id", "en"]) {
          if (tasks.length >= BATCH) break;
          if (idx < progress.current) { idx++; continue; }
          scanned++;
          const exists = await getAnalysis(s.nomor, a.nomor, lang);
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

            tasks.push({ surah: s.nomor, ayat: a.nomor, lang, arab, prompt, key: PREFIX + s.nomor + "-" + a.nomor + "-" + lang + ".json" });
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
        results.push({ surah: task.surah, ayat: task.ayat, lang: task.lang, status: "error", error: err.slice(0,100) });
        // Update progress even on error to avoid getting stuck
        progress.current++;
        await saveProgress(progress);
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      const aiData = await aiRes.json();
      const content = aiData.choices?.[0]?.message?.content || "";

      // Save to Blob
      try {
        await put(task.key, JSON.stringify({
          surah: task.surah, ayat: task.ayat, content, lang: task.lang,
          updatedAt: new Date().toISOString(),
        }), { access: "private", addRandomSuffix: false, allowOverwrite: true, token: BLOB_TOKEN });
        results.push({ surah: task.surah, ayat: task.ayat, lang: task.lang, status: "ok" });
      } catch (e) {
        results.push({ surah: task.surah, ayat: task.ayat, lang: task.lang, status: "save_error", error: e.message });
      }

      progress.current++;
      await saveProgress(progress);
      await new Promise(r => setTimeout(r, 1000)); // delay antar request
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
