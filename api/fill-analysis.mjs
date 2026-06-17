// POST /api/fill-analysis — generate analysis untuk ayat yang belum ada via PostgREST
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY;
const PGREST_URL = "http://124.156.205.118";

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

// ─── Helper: PostgREST fetch ────────────────────────
async function pgrst(path, options = {}) {
  const url = PGREST_URL + path;
  const resp = await fetch(url, {
    headers: { "Content-Type": "application/json", "Accept": "application/json", ...options.headers },
    ...options,
  });
  if (!resp.ok) throw new Error(`PostgREST ${resp.status}: ${await resp.text()}`);
  return resp;
}

// ─── Helper: tanya DeepSeek ─────────────────────────
async function askDeepSeek(prompt) {
  if (!DEEPSEEK_KEY) throw new Error("VITE_DEEPSEEK_API_KEY not set");
  const resp = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 8192,
    }),
  });
  if (!resp.ok) throw new Error(`DeepSeek ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

// ─── Helper: get Quran data ─────────────────────────
async function getQuranData() {
  const resp = await pgrst("/quran_data?key=eq.full&select=data");
  const rows = await resp.json();
  if (!rows?.[0]?.data?.surahs) throw new Error("Quran data not found");
  return rows[0].data;
}

function buildTasks(surahs, progress) {
  const tasks = [];
  const langs = ["id", "en"];
  const progressArr = progress?.completed?.[0] || [];

  for (const surah of surahs) {
    for (const ayah of surah.ayat) {
      for (const lang of langs) {
        const done = progressArr.some(
          (p) => p.surah === surah.nomor && p.ayat === ayah.nomor && p.lang === lang
        );
        if (!done) {
          tasks.push({
            surah: surah.nomor,
            ayat: ayah.nomor,
            lang,
            ayah,
            surahName: surah.nama_latin || surah.nama,
          });
        }
      }
    }
  }
  return tasks;
}

function buildPrompt(task, surah) {
  const isID = task.lang === "id";
  const promptTemplate = isID ? PROMPT_ID : PROMPT_EN;
  const surahInfo =
    task.lang === "id"
      ? `Surah ${surah.nama_latin} (${surah.arti}), Ayat ${task.ayat}\n\n`
      : `Surah ${surah.nama_latin} (${surah.nama}), Verse ${task.ayat}\n\n`;
  const arab = task.ayah.teksArab;
  const translation = isID ? task.ayah.teksIndonesia : task.ayah.teksInggris;
  const latinSegment = task.ayah.teksLatin ? `**Latin:** ${task.ayah.teksLatin}\n\n` : "";
  return promptTemplate
    .replace("{surahInfo}", surahInfo)
    .replace("{arab}", arab)
    .replace("{translation}", translation)
    .replace("{latinSegment}", latinSegment);
}

// ─── Progress ────────────────────────────────────────
async function loadProgress() {
  try {
    const resp = await pgrst(`/quran_data?key=eq.${PROGRESS_KEY}&select=data`);
    const rows = await resp.json();
    if (rows?.[0]) {
      const p = rows[0].data;
      return { current: p.current || 0, total: p.total || 0, completed: p.completed || [] };
    }
  } catch {}
  return { current: 0, total: 0, completed: [] };
}

async function saveProgress(progress) {
  try {
    await pgrst(`/quran_data`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ key: PROGRESS_KEY, data: progress, updated_at: new Date().toISOString() }),
    });
  } catch {}
}

// ─── Check if analysis exists ────────────────────────
async function analysisExists(surah, ayat, lang) {
  try {
    const resp = await pgrst(`/analysis?surah=eq.${surah}&ayat=eq.${ayat}&lang=eq.${lang}&select=id`);
    const data = await resp.json();
    return data.length > 0;
  } catch {
    return false;
  }
}

// ─── Main Handler ────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!DEEPSEEK_KEY) {
    return res.status(500).json({ error: "VITE_DEEPSEEK_API_KEY not set" });
  }

  try {
    const { force } = req.body || {};

    // Load Quran data
    const quran = await getQuranData();
    const surahs = quran.surahs;

    // Load progress
    let progress = await loadProgress();

    // Rebuild task list if needed
    if (!progress.total) {
      const surahsAll = surahs.map((s) => s.nomor);
      const totalTasks = surahs.reduce((sum, s) => sum + s.ayat.length * 2, 0);
      progress.total = totalTasks;
      progress.completed = []; // will be [[{surah, ayat, lang}, ...]]
      await saveProgress(progress);
    }

    // Find next tasks
    const allTasks = buildTasks(surahs, progress);

    // Get BATCH tasks
    const batch = allTasks.slice(0, BATCH);
    if (batch.length === 0) {
      return res.status(200).json({ ok: true, done: true, message: "All analysis complete!" });
    }

    const results = [];
    // Ensure completed is an array
    if (!Array.isArray(progress.completed)) progress.completed = [];

    for (const task of batch) {
      // Skip if already exists (unless force)
      if (!force) {
        const exists = await analysisExists(task.surah, task.ayat, task.lang);
        if (exists) {
          results.push({ surah: task.surah, ayat: task.ayat, lang: task.lang, status: "already_exists" });
          progress.current++;
          await saveProgress(progress);
          continue;
        }
      }

      // Find surah info
      const surah = surahs.find((s) => s.nomor === task.surah);

      // Build prompt & call DeepSeek
      const prompt = buildPrompt(task, surah);
      let content;
      try {
        content = await askDeepSeek(prompt);
      } catch (e) {
        results.push({ surah: task.surah, ayat: task.ayat, lang: task.lang, status: "deepseek_error", error: e.message });
        continue;
      }

      // Save to PostgREST
      try {
        await pgrst("/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
          body: JSON.stringify({
            surah: task.surah,
            ayat: task.ayat,
            lang: task.lang,
            content,
            updated_at: new Date().toISOString(),
          }),
        });
        results.push({ surah: task.surah, ayat: task.ayat, lang: task.lang, status: "ok" });
      } catch (e) {
        results.push({ surah: task.surah, ayat: task.ayat, lang: task.lang, status: "save_error", error: e.message });
      }

      // Only advance progress on success
      progress.current++;
      await saveProgress(progress);
      await new Promise((r) => setTimeout(r, 1000));
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
