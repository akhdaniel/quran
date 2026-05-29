import { useState, useEffect, useCallback, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

const API_BASE = "https://equran.id/api/v2";
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const STORAGE_PREFIX = "analysis-";

// Baca API key: env var > localStorage
const ENV_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || "";

function getApiKey() {
  if (ENV_KEY && !ENV_KEY.includes("sk-your")) return ENV_KEY;
  return localStorage.getItem("deepseek-api-key") || "";
}

function App() {
  const [surahs, setSurahs] = useState([]);
  const [currentSurah, setCurrentSurah] = useState(null);
  const [surahNomor, setSurahNomor] = useState(1);
  const [verses, setVerses] = useState([]);
  const [currentAyat, setCurrentAyat] = useState(1);
  const [loading, setLoading] = useState(true);
  const [jumpValue, setJumpValue] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const hasKey = !!getApiKey();
  const prevFn = useRef();
  const nextFn = useRef();
  const analysisRef = useRef(null);

  // Load analysis from backend (or localStorage fallback) when ayah changes
  useEffect(() => {
    if (!surahNomor || !currentAyat) return;
    loadAnalysis(surahNomor, currentAyat);
  }, [surahNomor, currentAyat]);

  const loadAnalysis = async (surah, ayat) => {
    const localKey = `${STORAGE_PREFIX}${surah}-${ayat}`;

    // Coba dari API dulu
    try {
      const res = await fetch(`/api/analysis?surah=${surah}&ayat=${ayat}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.content) {
          setAnalysis(data.content);
          // Sync ke localStorage
          localStorage.setItem(localKey, JSON.stringify(data.content));
          return;
        }
      }
    } catch {
      // API gagal, fallback
    }

    // Fallback ke localStorage
    const cached = localStorage.getItem(localKey);
    if (cached) {
      let content;
      try {
        content = JSON.parse(cached);
      } catch {
        content = cached;
      }
      setAnalysis(content);

      // Sync ke backend (fire & forget) biar user lain ikut lihat
      fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surah,
          ayat,
          content,
        }),
      }).then((r) => {
        if (!r.ok) console.warn("Backend sync failed:", r.status);
      }).catch((e) => console.warn("Backend sync error:", e.message));
    } else {
      setAnalysis(null);
    }
  };

  // Fetch daftar surat
  useEffect(() => {
    fetch(`${API_BASE}/surat`)
      .then((r) => r.json())
      .then((d) => {
        if (d.code === 200) {
          setSurahs(d.data);
          const first = d.data[0];
          setSurahNomor(first.nomor);
          loadSurah(first.nomor);
        }
      })
      .catch(console.error);
  }, []);

  const loadSurah = useCallback((nomor) => {
    setLoading(true);
    setCurrentAyat(1);
    setJumpValue("");
    setAnalysis(null);
    fetch(`${API_BASE}/surat/${nomor}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.code === 200) {
          setCurrentSurah(d.data);
          setVerses(d.data.ayat);
          setSurahNomor(nomor);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const totalAyat = verses.length;
  const ayat = verses[currentAyat - 1] || {};

  const prevAyat = useCallback(() => {
    setCurrentAyat((a) => Math.max(1, a - 1));
    setJumpValue("");
  }, []);

  const nextAyat = useCallback(() => {
    setCurrentAyat((a) => {
      const next = a + 1;
      return next <= verses.length ? next : a;
    });
    setJumpValue("");
  }, [verses.length]);

  prevFn.current = prevAyat;
  nextFn.current = nextAyat;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "ArrowLeft") prevFn.current();
      if (e.key === "ArrowRight") nextFn.current();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const handleJump = (e) => {
    e.preventDefault();
    const num = parseInt(jumpValue, 10);
    if (num >= 1 && num <= totalAyat) {
      setCurrentAyat(num);
      setJumpValue("");
    }
  };

  const handleSurahChange = (nomor) => {
    loadSurah(nomor);
  };

  const buildAnalysisPrompt = (arab, translation, latin) => {
    return `Analisislah ayat Al-Qur'an berikut secara mendalam dan terstruktur dalam Bahasa Indonesia:

**Ayat:**
${arab}

**Terjemahan:**
${translation}

${latin ? `**Latin:** ${latin}` : ""}

Berikan analisis dengan format berikut (gunakan markdown sederhana):

1. **Terjemahan Kata Per Kata** — setiap kata Arab diurai dengan arti per katanya
2. **Bentukan Kata (Sarf/Morfologi)** — analisis bentuk kata dasar (fi'il madhi/mudhari/amar, isim masdar, isim fa'il/maf'ul, dll) untuk kata-kata kunci
3. **Balaghah** — analisis retorika dan keindahan bahasa: uslub (gaya bahasa), kinayah/majaz, fashahah, keunikan susunan kata
4. **Tafsir Singkat** — penjelasan singkat makna ayat berdasarkan tafsir klasik (seperti Ibnu Katsir, al-Mishbah, dll)`;
  };

  const handleAnalyze = async () => {
    const key = getApiKey();
    if (!key) {
      setKeyInput("");
      setShowKeyModal(true);
      return;
    }

    if (!ayat.teksArab) return;

    setAnalyzing(true);
    setAnalysis(null);

    try {
      const prompt = buildAnalysisPrompt(
        ayat.teksArab,
        ayat.teksIndonesia,
        ayat.teksLatin
      );

      const res = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content:
                "Kamu adalah asisten ahli tafsir Al-Qur'an yang menguasai ilmu nahwu, sharaf, balaghah, dan tafsir. Jawab dalam Bahasa Indonesia yang baik dan santai namun ilmiah.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 2000,
          temperature: 0.3,
        }),
      });

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          errMsg = errData.error?.message || errMsg;
        } catch {
          const txt = await res.text().catch(() => "");
          if (txt) errMsg = txt;
        }
        throw new Error(errMsg);
      }

      const data = await res.json();
      const result =
        data.choices?.[0]?.message?.content || "Tidak ada respons.";

      // Cache (local + backend)
      const cacheKey = `${STORAGE_PREFIX}${surahNomor}-${currentAyat}`;
      localStorage.setItem(cacheKey, JSON.stringify(result));
      setAnalysis(result);

      // Simpan ke backend (fire & forget)
      fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surah: surahNomor,
          ayat: currentAyat,
          content: result,
        }),
      }).then((r) => {
        if (!r.ok) console.warn("Backend save failed:", r.status);
      }).catch((e) => console.warn("Backend save error:", e.message));

      setTimeout(() => {
        analysisRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    } catch (err) {
      setAnalysis(
        `**Error:** ${err.message}\n\n> 💡 Pastikan \`VITE_DEEPSEEK_API_KEY\` sudah di-set di Vercel env vars, atau masukkan key manual lewat tombol ⚙️.`
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveKey = () => {
    const trimmed = keyInput.trim();
    if (trimmed) {
      localStorage.setItem("deepseek-api-key", trimmed);
      setShowKeyModal(false);
      setTimeout(() => handleAnalyze(), 100);
    }
  };

  const clearAnalysis = () => {
    const cacheKey = `${STORAGE_PREFIX}${surahNomor}-${currentAyat}`;
    localStorage.removeItem(cacheKey);
    setAnalysis(null);
  };

  // Markdown components with custom styling
  const MarkdownComponents = {
    strong: ({ children }) => (
      <span className="md-strong">{children}</span>
    ),
    code: ({ inline, children, ...props }) =>
      inline ? (
        <code className="md-inline-code">{children}</code>
      ) : (
        <pre className="md-code-block">
          <code {...props}>{children}</code>
        </pre>
      ),
    ul: ({ children }) => (
      <ul className="md-list">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="md-list">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="md-list-item">{children}</li>
    ),
    h1: ({ children }) => (
      <h1 className="md-heading md-h1">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="md-heading md-h2">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="md-heading md-h3">{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className="md-heading md-h4">{children}</h4>
    ),
    p: ({ children }) => (
      <p className="md-paragraph">{children}</p>
    ),
    hr: () => <hr className="md-hr" />,
    table: ({ children }) => (
      <div className="md-table-wrapper">
        <table className="md-table">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="md-thead">{children}</thead>
    ),
    tbody: ({ children }) => (
      <tbody className="md-tbody">{children}</tbody>
    ),
    tr: ({ children }) => (
      <tr className="md-tr">{children}</tr>
    ),
    th: ({ children }) => (
      <th className="md-th">{children}</th>
    ),
    td: ({ children }) => (
      <td className="md-td">{children}</td>
    ),
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Memuat...</div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-row">
          <h1 className="title">Al-Qur&apos;an</h1>
          <button
            className="key-btn"
            onClick={() => {
              setKeyInput(getApiKey() || "");
              setShowKeyModal(true);
            }}
            title={hasKey ? "Ganti API Key" : "Set API Key"}
          >
            {hasKey ? "🔑" : "⚙️"}
          </button>
        </div>
      </header>

      {/* Surah Selector */}
      <div className="surah-selector">
        <select
          className="surah-select"
          value={currentSurah?.nomor || 1}
          onChange={(e) => handleSurahChange(Number(e.target.value))}
        >
          {surahs.map((s) => (
            <option key={s.nomor} value={s.nomor}>
              {s.nomor}. {s.namaLatin} ({s.nama})
            </option>
          ))}
        </select>
      </div>

      {/* Main Card */}
      <main className="main-card">
        {/* Surah Header */}
        <div className="surah-header">
          <div className="surah-info">
            <h2 className="surah-name">{currentSurah?.namaLatin}</h2>
            <span className="surah-arabic">{currentSurah?.nama}</span>
          </div>
          <div className="surah-meta">
            {currentSurah?.arti} &middot; {currentSurah?.jumlahAyat} Ayat &middot;{" "}
            {currentSurah?.tempatTurun === "mekah" ? "Makkiyah" : "Madaniyah"}
          </div>
        </div>

        {/* Bismillah */}
        {currentSurah?.nomor !== 9 && currentSurah?.nomor !== 1 && (
          <div className="bismillah">
            <span className="bismillah-text">
              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
            </span>
          </div>
        )}

        {/* Ayat Card */}
        <div
          className="ayat-card"
          key={`${currentSurah?.nomor}-${currentAyat}`}
        >
          <div className="ayat-number">{ayat.nomor || currentAyat}</div>
          <div className="ayat-arabic">{ayat.teksArab}</div>
          <div className="ayat-translation">{ayat.teksIndonesia}</div>
          <div className="ayat-latin">{ayat.teksLatin}</div>
        </div>

        {/* Analyze */}
        <div className="analyze-section">
          {!analysis && !analyzing && (
            <button className="analyze-btn" onClick={handleAnalyze}>
              🤖 Analisa Ayat
            </button>
          )}

          {analyzing && (
            <div className="analyzing">
              <div className="spinner" />
              <span>Menganalisis ayat dengan AI...</span>
            </div>
          )}

          {analysis && (
            <div className="analysis-result" ref={analysisRef}>
              <div className="analysis-header">
                <span className="analysis-title">📊 Analisa Ayat</span>
                <div className="analysis-actions">
                  <button
                    className="analysis-regen-btn"
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    title="Analisa ulang"
                  >
                    🔄
                  </button>
                  <button
                    className="analysis-close-btn"
                    onClick={clearAnalysis}
                    title="Tutup"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="analysis-body">
                <Markdown
                  components={MarkdownComponents}
                  remarkPlugins={[remarkGfm]}
                >
                  {analysis}
                </Markdown>
              </div>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="progress-bar-wrapper">
          <div className="progress-text">
            Ayat {currentAyat} dari {totalAyat}
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(currentAyat / totalAyat) * 100}%` }}
            />
          </div>
        </div>

        {/* Navigation */}
        <div className="navigation">
          <button
            className="nav-btn"
            onClick={prevAyat}
            disabled={currentAyat <= 1}
          >
            &#8592; Sebelumnya
          </button>

          <form className="jump-form" onSubmit={handleJump}>
            <input
              type="number"
              className="jump-input"
              placeholder="Lompat..."
              min={1}
              max={totalAyat}
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
            />
            <button type="submit" className="jump-btn">
              Pergi
            </button>
          </form>

          <button
            className="nav-btn"
            onClick={nextAyat}
            disabled={currentAyat >= totalAyat}
          >
            Selanjutnya &rarr;
          </button>
        </div>
      </main>

      {/* API Key Modal */}
      {showKeyModal && (
        <div className="modal-overlay" onClick={() => setShowKeyModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">🔑 DeepSeek API Key</h3>
            <p className="modal-desc">
              Masukkan API key untuk fitur analisa ayat. Bisa juga pakai env{" "}
              <code>VITE_DEEPSEEK_API_KEY</code> di Vercel dashboard.
            </p>
            <input
              type="password"
              className="modal-input"
              placeholder="sk-xxxxxxxxxxxxxxxx"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              autoFocus
            />
            <p className="modal-hint">
              Belum punya?{" "}
              <a
                href="https://platform.deepseek.com/api_keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                Daftar di sini
              </a>
            </p>
            <div className="modal-actions">
              <button
                className="modal-cancel"
                onClick={() => setShowKeyModal(false)}
              >
                Batal
              </button>
              <button
                className="modal-save"
                onClick={handleSaveKey}
                disabled={!keyInput.trim()}
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
