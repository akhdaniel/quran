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
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatRef = useRef(null);
  const [wordEntries, setWordEntries] = useState([]);
  const wordRefs = useRef({});
  const hasKey = !!getApiKey();
  const prevFn = useRef();
  const nextFn = useRef();
  const analysisRef = useRef(null);

  // Load analysis & chat when ayah changes
  const loadIdRef = useRef(0);
  useEffect(() => {
    if (!surahNomor || !currentAyat) return;

    // Langsung clear biar gak numpuk analisa lama
    setAnalysis(null);
    setChatMessages([]);

    const id = ++loadIdRef.current;
    loadAnalysis(surahNomor, currentAyat, id);
  }, [surahNomor, currentAyat]);

  const loadAnalysis = async (surah, ayat, id) => {
    const localKey = `${STORAGE_PREFIX}${surah}-${ayat}`;

    // Coba dari API dulu
    try {
      const res = await fetch(`/api/analysis?surah=${surah}&ayat=${ayat}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.content) {
          if (id !== loadIdRef.current) return; // stale
          setAnalysis(data.content);
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
      if (id !== loadIdRef.current) return; // stale
      setAnalysis(content);

      // Sync ke backend (fire & forget)
      fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surah, ayat, content }),
      }).then((r) => {
        if (!r.ok) console.warn("Backend sync failed:", r.status);
      }).catch((e) => console.warn("Backend sync error:", e.message));
    }

    // Load chat history (selalu, baik dr API maupun localStorage)
    const chatKey = `chat-${surah}-${ayat}`;
    const chatCached = localStorage.getItem(chatKey);
    if (id !== loadIdRef.current) return; // stale
    if (chatCached) {
      try {
        setChatMessages(JSON.parse(chatCached));
      } catch {
        setChatMessages([]);
      }
    } else {
      setChatMessages([]);
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
  const ayatWords = ayat?.teksArab ? ayat.teksArab.split(/\s+/).filter(Boolean) : [];

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
    return `Analisislah ayat Al-Qur'an berikut secara mendalam dan terstruktur dalam Bahasa Indonesia. Langsung ke analisis, tanpa pendahuluan atau penutup.

**Ayat:**
${arab}

**Terjemahan:**
${translation}

${latin ? `**Latin:** ${latin}` : ""}

Berikan analisis dengan format berikut (gunakan markdown sederhana):

1. **Bentukan Kata (Sarf/Morfologi)** — analisis bentuk kata dasar (fi'il madhi/mudhari/amar, isim masdar, isim fa'il/maf'ul, dll) untuk kata-kata kunci
2. **Balaghah** — analisis retorika dan keindahan bahasa: uslub (gaya bahasa), kinayah/majaz, fashahah, keunikan susunan kata
3. **Tafsir Singkat** — penjelasan singkat makna ayat berdasarkan tafsir klasik (seperti Ibnu Katsir, al-Mishbah, dll)`;
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
                "Kamu adalah asisten ahli tafsir Al-Qur'an yang hanya menjawab seputar ayat yang diberikan, ilmu nahwu, sharaf, balaghah, dan tafsir Al-Qur'an. Jawab langsung tanpa pendahuluan atau penutup. Gunakan Bahasa Indonesia yang baik dan santai namun ilmiah.",
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
    localStorage.removeItem(`chat-${surahNomor}-${currentAyat}`);
    setAnalysis(null);
    setChatMessages([]);
  };

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatSending) return;

    const key = getApiKey();
    if (!key) {
      setKeyInput("");
      setShowKeyModal(true);
      return;
    }

    const userMessage = { role: "user", content: msg };
    const updated = [...chatMessages, userMessage];
    setChatMessages(updated);
    setChatInput("");
    setChatSending(true);

    try {
      const systemPrompt = `Kamu adalah asisten ahli tafsir Al-Qur'an yang hanya menjawab pertanyaan seputar ayat yang sedang dibahas, ilmu nahwu, sharaf, balaghah, dan tafsir Al-Qur'an. Berikut adalah analisa ayat yang sudah dibuat:

${analysis?.substring(0, 4000) || "(belum ada analisa)"}

Jawab langsung tanpa pendahuluan atau penutup. Berikan detail dan ilmiah dalam Bahasa Indonesia.

Jika user bertanya di luar topik tafsir Al-Qur'an, tolak dengan sopan dan ajak kembali ke ayat yang sedang dibahas.`;

      const apiMessages = [
        { role: "system", content: systemPrompt },
        ...updated.map((m) => ({ role: m.role, content: m.content })),
      ];

      const res = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: apiMessages,
          max_tokens: 1500,
          temperature: 0.3,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "Tidak ada respons.";

      const finalMessages = [...updated, { role: "assistant", content: reply }];
      setChatMessages(finalMessages);

      // Simpan chat ke localStorage
      const chatKey = `chat-${surahNomor}-${currentAyat}`;
      localStorage.setItem(chatKey, JSON.stringify(finalMessages));

      setTimeout(() => {
        chatRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 100);
    } catch (err) {
      setChatMessages([
        ...updated,
        { role: "assistant", content: `**Error:** ${err.message}` },
      ]);
    } finally {
      setChatSending(false);
    }
  };

  // Cek apakah children mengandung huruf Arab
  const containsArabic = (children) => {
    const str = typeof children === "string" ? children : "";
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(str);
  };

  // Parse kata per kata dari analysis text
  useEffect(() => {
    if (!analysis) {
      setWordEntries([]);
      return;
    }
    try {
      const lines = analysis.split("\n");
      const list = [];
      let inSection = false;
      for (const line of lines) {
        if (line.includes("**Terjemahan Kata Per Kata**")) {
          inSection = true;
          continue;
        }
        if (inSection && line.startsWith("-")) {
          const match = line.match(/\*\*([^\*]+)\*\*/);
          if (match) {
            list.push({
              arabic: match[1].trim(),
              original: line,
            });
          }
        }
        if (inSection && !line.startsWith("-") && !line.startsWith("**") && line.trim()) {
          break;
        }
      }
      setWordEntries(list);
    } catch {}
  }, [analysis]);

  const scrollToWord = (idx) => {
    const el = wordRefs.current[idx];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("word-highlight");
      setTimeout(() => el.classList.remove("word-highlight"), 2000);
    }
  };

  // Markdown components with custom styling
  const MarkdownComponents = {
    strong: ({ children }) => (
      <span className={containsArabic(children) ? "md-strong-arabic" : "md-strong"}>
        {children}
      </span>
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

        {/* Top Navigation */}
        <div className="navigation nav-top">
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
          <div className="ayat-arabic">
            {ayatWords.map((w, i) => (
              <span
                key={i}
                className={`ayat-word ${i < wordEntries.length ? "clickable" : ""}`}
                onClick={() => i < wordEntries.length && scrollToWord(i)}
              >
                {w}{" "}
              </span>
            ))}
          </div>
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
              {/* Word-by-word nav — pakai ayatWords langsung kalo gak ada parsed entries */}
              {(wordEntries.length > 0 || ayatWords.length > 1) && (
                <div className="word-nav-section">
                  <div className="word-nav-title">📖 Kata Per Kata</div>
                  <div className="word-nav-list">
                    {(wordEntries.length > 0 ? wordEntries : ayatWords.map((w, i) => ({ arabic: w }))).map((entry, i) => (
                      <div
                        key={i}
                        ref={(el) => { wordRefs.current[i] = el; }}
                        className="word-nav-item"
                        onClick={() => scrollToWord(i)}
                      >
                        <span className="word-nav-arabic">{entry.arabic}</span>
                        {entry.original && (
                          <>
                            <span className="word-nav-arrow">→</span>
                            <span className="word-nav-meaning">
                              {entry.original.replace(/^\s*-\s*\*\*[^\*]+\*\*\s*[—–-]?\s*/, "").trim()}
                            </span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="analysis-body">
                <Markdown
                  components={MarkdownComponents}
                  remarkPlugins={[remarkGfm]}
                >
                  {analysis}
                </Markdown>
              </div>

              {/* Chatbox */}
              <div className="chat-section">
                {chatMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`chat-bubble ${m.role === "user" ? "chat-user" : "chat-ai"}`}
                  >
                    <div className="chat-label">
                      {m.role === "user" ? "Kamu" : "AI"}
                    </div>
                    <Markdown
                      components={MarkdownComponents}
                      remarkPlugins={[remarkGfm]}
                    >
                      {m.content}
                    </Markdown>
                  </div>
                ))}
                {chatSending && (
                  <div className="chat-typing">
                    <div className="spinner" />
                    <span>Mengetik...</span>
                  </div>
                )}
                <div className="chat-input-row">
                  <input
                    className="chat-input"
                    placeholder="Tanya detail analisa..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChat();
                      }
                    }}
                    disabled={chatSending}
                  />
                  <button
                    className="chat-send-btn"
                    onClick={sendChat}
                    disabled={!chatInput.trim() || chatSending}
                  >
                    Kirim
                  </button>
                </div>
                <div ref={chatRef} />
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

      {/* Footer */}
      <footer className="footer">
        <p>
          Ada saran, pertanyaan, atau mau donasi?{" "}
          <a
            href="https://x.com/akhmaddaniel"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            @akhmaddaniel
          </a>
        </p>
      </footer>

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
