import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";

const API_BASE = "https://equran.id/api/v2";
const STORAGE_PREFIX = "analysis-";

// Detect if running on Vercel (serverless proxy available)
const isVercel = window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";
const PROXY_URL = "/api/analyze";

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
  // On Vercel: check if proxy is configured by hitting a health endpoint
  // On local: check env var
  const apiAvailableRef = useRef(false);
  const [apiStatus, setApiStatus] = useState("checking");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const prevFn = useRef();
  const nextFn = useRef();
  const analysisRef = useRef(null);

  // Load cached analysis when ayah changes
  useEffect(() => {
    if (!surahNomor || !currentAyat) return;
    const key = `${STORAGE_PREFIX}${surahNomor}-${currentAyat}`;
    const cached = localStorage.getItem(key);
    if (cached) {
      try {
        setAnalysis(JSON.parse(cached));
      } catch {
        setAnalysis(cached);
      }
    } else {
      setAnalysis(null);
    }
  }, [surahNomor, currentAyat]);

  // Check API availability & fetch daftar surat
  useEffect(() => {
    // Cek proxy health dulu
    if (isVercel) {
      fetch(PROXY_URL, { method: "OPTIONS" })
        .then(() => {
          apiAvailableRef.current = true;
          setApiStatus("ready");
        })
        .catch(() => {
          // Proxy gak available, fallback ke localStorage
          apiAvailableRef.current = false;
          const localKey = localStorage.getItem("deepseek-api-key");
          setApiStatus(localKey ? "ready" : "missing");
        });
    } else {
      // Local: cek env var
      const envKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
      if (envKey && envKey !== "sk-your-deepseek-api-key-here") {
        apiAvailableRef.current = true;
        setApiStatus("ready");
      } else {
        const localKey = localStorage.getItem("deepseek-api-key");
        apiAvailableRef.current = false;
        setApiStatus(localKey ? "ready" : "missing");
      }
    }

    // Fetch surat
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

Berikan analisis dengan format berikut (gunakan markdown sederhana, jangan pakai <b> atau HTML):

1. **Terjemahan Kata Per Kata** — setiap kata Arab diurai dengan arti per katanya dalam Bahasa Indonesia
2. **Bentukan Kata (Sarf/Morfologi)** — analisis bentuk kata dasar (fi'il madhi/mudhari/amar, isim masdar, isim fa'il/maf'ul, dll) untuk kata-kata kunci
3. **Balaghah** — analisis retorika dan keindahan bahasa: uslub (gaya bahasa), kinayah/majaz, fashahah, keunikan susunan kata
4. **Tafsir Singkat** — penjelasan singkat makna ayat berdasarkan tafsir klasik (seperti Ibnu Katsir, al-Mishbah, dll)`;
  };

  const handleAnalyze = async () => {
    if (!ayat.teksArab) return;

    // Di local dev tanpa env var, fallback ke localStorage
    if (!isVercel) {
      const envKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
      const localKey = localStorage.getItem("deepseek-api-key");
      if (
        !envKey ||
        envKey === "sk-your-deepseek-api-key-here" ||
        envKey === "sk-xxx…xxxx"
      ) {
        if (!localKey) {
          setShowKeyInput(true);
          return;
        }
      }
    }

    setAnalyzing(true);
    setAnalysis(null);

    try {
      const prompt = buildAnalysisPrompt(
        ayat.teksArab,
        ayat.teksIndonesia,
        ayat.teksLatin
      );

      const messages = [
        {
          role: "system",
          content:
            "Kamu adalah asisten ahli tafsir Al-Qur'an yang menguasai ilmu nahwu, sharaf, balaghah, dan tafsir. Jawab dalam Bahasa Indonesia yang baik dan santai namun ilmiah.",
        },
        { role: "user", content: prompt },
      ];

      let result;

      if (isVercel) {
        // Pakai Vercel proxy (CORS-safe)
        const res = await fetch(PROXY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, max_tokens: 2000, temperature: 0.3 }),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        result = data.choices?.[0]?.message?.content || "Tidak ada respons.";
      } else {
        // Local: langsung ke DeepSeek (env atau localStorage)
        const key =
          import.meta.env.VITE_DEEPSEEK_API_KEY ||
          localStorage.getItem("deepseek-api-key");
        const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages,
            max_tokens: 2000,
            temperature: 0.3,
          }),
        });
        if (!res.ok) {
          const errData = await res.text();
          throw new Error(`API error ${res.status}: ${errData}`);
        }
        const data = await res.json();
        result = data.choices?.[0]?.message?.content || "Tidak ada respons.";
      }

      // Cache the result
      const cacheKey = `${STORAGE_PREFIX}${surahNomor}-${currentAyat}`;
      localStorage.setItem(cacheKey, JSON.stringify(result));
      setAnalysis(result);

      // Scroll to analysis
      setTimeout(() => {
        analysisRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    } catch (err) {
      setAnalysis(`**Error:** ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveKey = () => {
    const trimmed = keyInput.trim();
    if (trimmed) {
      localStorage.setItem("deepseek-api-key", trimmed);
      setApiStatus("ready");
      setShowKeyInput(false);
      setTimeout(() => handleAnalyze(), 100);
    }
  };

  const clearAnalysis = () => {
    const cacheKey = `${STORAGE_PREFIX}${surahNomor}-${currentAyat}`;
    localStorage.removeItem(cacheKey);
    setAnalysis(null);
  };

  // Simple markdown-to-HTML renderer
  const renderAnalysis = (text) => {
    if (!text) return null;
    let html = text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/```(\w*)\n?([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br/>");
    return `<p>${html}</p>`;
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
        <h1 className="title">Al-Qur&apos;an</h1>
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

      {/* API Status Bar */}
      {apiStatus === "missing" && (
        <div className="api-status-bar">
          <span>🔑 DeepSeek API key belum dikonfigurasi</span>
          <button
            className="api-set-btn"
            onClick={() => {
              setKeyInput(localStorage.getItem("deepseek-api-key") || "");
              setShowKeyInput(true);
            }}
          >
            Set Key
          </button>
        </div>
      )}

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

        {/* Analyze Button */}
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

          {/* Analysis Result */}
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
              <div
                className="analysis-body"
                dangerouslySetInnerHTML={{ __html: renderAnalysis(analysis) }}
              />
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

      {/* API Key Input Sheet (slide up) */}
      {showKeyInput && (
        <div className="modal-overlay" onClick={() => setShowKeyInput(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">🔑 DeepSeek API Key</h3>
            <p className="modal-desc">
              Masukkan API key untuk fitur analisa ayat. Bisa juga pakai env
              <code> VITE_DEEPSEEK_API_KEY</code> di file <code>.env</code>.
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
                onClick={() => setShowKeyInput(false)}
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
