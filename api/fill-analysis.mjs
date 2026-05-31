// POST /api/fill-analysis — generate analysis untuk ayat yang belum ada
// Proses 5 ayat per panggilan (ID + EN), batch biar gak timeout
import { put, get } from "@vercel/blob";

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

// ID Analysis Prompt
const PROMPT_ID = `Analisislah ayat Al-Qur'an berikut secara mendalam dan terstruktur dalam Bahasa Indonesia. Langsung ke analisis, tanpa pendahuluan atau penutup.

**Ayat:**
{arab}

**Terjemahan:**
{translation}

{latinSegment}Berikan analisis dengan format berikut (gunakan markdown sederhana):

1. **Terjemahan Kata Per Kata** — tiap kata: - **kata** — artinya
2. **Bentukan Kata (Sarf/Morfologi)** — analisis bentuk kata dasar (fi'il madhi/mudhari/amar, isim masdar, isim fa'il/maf'ul, dll) untuk kata-kata kunci, beserta arti/konsep dari kata dasar tersebut
3. **Balaghah** — analisis retorika dan keindahan bahasa: uslub (gaya bahasa), kinayah/majaz, fashahah, keunikan susunan kata
4. **Tafsir Singkat** — penjelasan singkat makna ayat berdasarkan tafsir klasik (seperti Ibnu Katsir, al-Mishbah, dll)`;

// EN Analysis Prompt
const PROMPT_EN = `Analyze the following Qur'anic verse deeply and in a structured manner in English. Get straight to the analysis, no introduction or closing.

**Verse:**
{arab}

**Translation:**
{translation}

{latinSegment}Provide analysis in the following format (use simple markdown):

1. **Word-by-Word Translation** — each word: - **word** — meaning
2. **Word Formation (Sarf/Morphology)** — analysis of root word forms (fi'il madhi/mudhari/amar, isim masdar, isim fa'il/maf'ul, etc.) for key words, with the meaning/concept of each root word
3. **Balaghah (Rhetoric)** — analysis of rhetorical devices and linguistic beauty: uslub (style), kinayah/majaz (metaphor), fashahah (eloquence), unique word arrangement
4. **Brief Tafsir** — concise explanation of the verse's meaning based on classical tafsir (such as Ibn Kathir, al-Mishbah, etc.)`;

const BATCH_SIZE = 5;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (!BLOB_TOKEN) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not set" });
  if (!DEEPSEEK_KEY) return res.status(500).json({ error: "DEEPSEEK_API_KEY not set" });

  try {
    // 1. Ambil daftar semua ayat dari Blob
    const blob = await get("quran-data/full.json", { access: "private", token: BLOB_TOKEN });
    if (!blob) return res.status(404).json({ error: "Quran data not found. Run /api/sync-quran first." });

    const chunks = [];
    for await (const chunk of blob.stream) chunks.push(chunk);
    const quranData = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

    // 2. Cari ayat yang belum ada analisa
    const pending = [];
    for (const surah of quranData.surahs) {
      for (const ayat of surah.ayat) {
        // Cek ID
        const idKey = `analysis/${surah.nomor}-${ayat.nomor}-id.json`;
        const enKey = `analysis/${surah.nomor}-${ayat.nomor}-en.json`;
        pending.push({ surah: surah.nomor, ayat: ayat.nomor, lang: "id", key: idKey });
        pending.push({ surah: surah.nomor, ayat: ayat.nomor, lang: "en", key: enKey });
      }
    }

    // Check existing analysis (check first 100 in parallel)
    const existing = new Set();
    const checkBatch = pending.slice(0, 100);
    const checks = await Promise.allSettled(
      checkBatch.map(async (p) => {
        try {
          const r = await get(p.key, { access: "private", token: BLOB_TOKEN });
          if (r) existing.add(p.surah + ":" + p.ayat + ":" + p.lang);
        } catch {}
      })
    );

    // Filter pending yang belum ada
    const todo = pending.filter((p) => !existing.has(p.surah + ":" + p.ayat + ":" + p.lang));

    if (todo.length === 0) {
      return res.status(200).json({ ok: true, message: "Semua ayat sudah dianalisa", done: true });
    }

    // 3. Proses BATCH_SIZE ayat (ID + EN dihitung sendiri)
    const batch = todo.slice(0, BATCH_SIZE);
    const results = [];

    for (const item of batch) {
      // Cari teks ayat
      let arab = "", idText = "", enText = "", latin = "";
      for (const s of quranData.surahs) {
        if (s.nomor === item.surah) {
          for (const a of s.ayat) {
            if (a.nomor === item.ayat) {
              arab = a.teksArab;
              idText = a.teksIndonesia;
              enText = a.teksInggris;
              latin = a.teksLatin;
              break;
            }
          }
          break;
        }
      }

      const translation = item.lang === "en" && enText ? enText : idText;
      const latinSegment = latin ? `**Latin:** ${latin}\n\n` : "";
      const prompt = (item.lang === "en" ? PROMPT_EN : PROMPT_ID)
        .replace("{arab}", arab)
        .replace("{translation}", translation)
        .replace("{latinSegment}", latinSegment);

      // Panggil DeepSeek
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
              content: item.lang === "en"
                ? "You are an expert Qur'anic tafsir assistant. Only answer questions related to the given verse, nahw, sarf, balaghah, and Qur'anic tafsir. Answer directly without preamble or closing. Use clear, academic yet approachable English."
                : "Kamu adalah asisten ahli tafsir Al-Qur'an yang hanya menjawab seputar ayat yang diberikan, ilmu nahwu, sharaf, balaghah, dan tafsir Al-Qur'an. Jawab langsung tanpa pendahuluan atau penutup. Gunakan Bahasa Indonesia yang baik dan santai namun ilmiah.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 4000,
          temperature: 0.3,
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text().catch(() => "");
        console.warn(`DeepSeek error ${item.surah}:${item.ayat} (${item.lang}): ${aiRes.status} ${errText.slice(0,200)}`);
        results.push({ surah: item.surah, ayat: item.ayat, lang: item.lang, status: "error", error: `HTTP ${aiRes.status}` });
        continue;
      }

      const aiData = await aiRes.json();
      const content = aiData.choices?.[0]?.message?.content || "";

      // Simpan ke Vercel Blob
      try {
        await put(item.key, JSON.stringify({
          surah: item.surah,
          ayat: item.ayat,
          content: content,
          lang: item.lang,
          updatedAt: new Date().toISOString(),
        }), {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: true,
          token: BLOB_TOKEN,
        });
        results.push({ surah: item.surah, ayat: item.ayat, lang: item.lang, status: "ok", length: content.length });
      } catch (saveErr) {
        console.warn(`Save error ${item.surah}:${item.ayat}: ${saveErr.message}`);
        results.push({ surah: item.surah, ayat: item.ayat, lang: item.lang, status: "save_error", error: saveErr.message });
      }

      // Delay antar panggilan biar gak kena rate limit
      await new Promise(r => setTimeout(r, 1000));
    }

    return res.status(200).json({
      ok: true,
      processed: results.length,
      totalPending: todo.length,
      remaining: todo.length - results.length,
      results: results,
    });
  } catch (err) {
    console.error("fill-analysis error:", err);
    return res.status(500).json({ error: err.message });
  }
}
