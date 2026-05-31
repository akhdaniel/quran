import React, { useState, useEffect, useCallback, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const STORAGE_PREFIX = "analysis-";

// Baca API key: env var > localStorage
const ENV_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || "";

function getApiKey() {
  if (ENV_KEY && !ENV_KEY.includes("sk-your")) return ENV_KEY;
  return localStorage.getItem("deepseek-api-key") || "";
}

// ─── Translations ─────────────────────────────────────────
const translations = {
  id: {
    loading: "Memuat...",
    title: "Al-Qur'an",
    surahSearchPlaceholder: "Cari surat (Arab / Latin)...",
    surahNotFound: "Tidak ditemukan",
    prev: "Sebelumnya",
    next: "Selanjutnya",
    analyzeBtn: "Analisa Ayat",
    analyzing: "Menganalisis ayat dengan AI...",
    analysisTitle: "Analisa Ayat",
    regenTitle: "Analisa ulang",
    closeTitle: "Tutup",
    wordNavTitle: "Kata Per Kata",
    chatLabelUser: "Kamu",
    chatLabelAI: "AI",
    chatTyping: "Mengetik...",
    chatPlaceholder: "Tanya detail analisa...",
    chatSend: "Kirim",
    progressText: "Ayat {current} dari {total}",
    footerText:
      "Ada saran, pertanyaan, atau mau donasi? Silakan hubungi",
    footerHandle: "@akhmaddaniel",
    modalDesc:
      "Masukkan API key untuk fitur analisa ayat. Bisa juga pakai env VITE_DEEPSEEK_API_KEY di Vercel dashboard.",
    modalHint: "Belum punya?",
    modalHintLink: "Daftar di sini",
    modalCancel: "Batal",
    modalSave: "Simpan",
    errNoKey:
      "**Error:** API key belum di-set.\n\n> 💡 Klik tombol ⚙️ di pojok kanan atas untuk memasukkan key, atau set `VITE_DEEPSEEK_API_KEY` di Vercel env vars.",
    errPrefix: "Error",
    systemPrompt:
      "Kamu adalah asisten ahli tafsir Al-Qur'an yang hanya menjawab seputar ayat yang diberikan, ilmu nahwu, sharaf, balaghah, dan tafsir Al-Qur'an. Jawab langsung tanpa pendahuluan atau penutup. Gunakan Bahasa Indonesia yang baik dan santai namun ilmiah.",
    analysisPrompt:
      "Analisislah ayat Al-Qur'an berikut secara mendalam dan terstruktur dalam Bahasa Indonesia. Langsung ke analisis, tanpa pendahuluan atau penutup.\n\n**Ayat:**\n{arab}\n\n**Terjemahan:**\n{translation}\n\n{latinSegment}Berikan analisis dengan format berikut (gunakan markdown sederhana):\n\n1. **Terjemahan Kata Per Kata** — tiap kata: - **kata** — artinya\n2. **Bentukan Kata (Sarf/Morfologi)** — analisis bentuk kata dasar (fi'il madhi/mudhari/amar, isim masdar, isim fa'il/maf'ul, dll) untuk kata-kata kunci, beserta arti/konsep dari kata dasar tersebut\n3. **Balaghah** — analisis retorika dan keindahan bahasa: uslub (gaya bahasa), kinayah/majaz, fashahah, keunikan susunan kata\n4. **Tafsir Singkat** — penjelasan singkat makna ayat berdasarkan tafsir klasik (seperti Ibnu Katsir, al-Mishbah, dll)",
    chatSystemPrefix: "Kamu adalah asisten ahli tafsir Al-Qur'an yang hanya menjawab pertanyaan seputar ayat yang sedang dibahas, ilmu nahwu, sharaf, balaghah, dan tafsir Al-Qur'an. Berikut adalah analisa ayat yang sudah dibuat:\n\n{analysis}\n\nJawab langsung tanpa pendahuluan atau penutup. Berikan detail dan ilmiah dalam Bahasa Indonesia.\n\nJika user bertanya di luar topik tafsir Al-Qur'an, tolak dengan sopan dan ajak kembali ke ayat yang sedang dibahas.",
    bismillah: "Bismillah",
  },
  en: {
    loading: "Loading...",
    title: "Al-Qur'an",
    surahSearchPlaceholder: "Search surah (Arabic / Latin)...",
    surahNotFound: "Not found",
    prev: "Previous",
    next: "Next",
    analyzeBtn: "Analyze Verse",
    analyzing: "Analyzing verse with AI...",
    analysisTitle: "Verse Analysis",
    regenTitle: "Re-analyze",
    closeTitle: "Close",
    wordNavTitle: "Word by Word",
    chatLabelUser: "You",
    chatLabelAI: "AI",
    chatTyping: "Typing...",
    chatPlaceholder: "Ask about the analysis...",
    chatSend: "Send",
    progressText: "Verse {current} of {total}",
    footerText:
      "Suggestions, questions, or want to donate? Reach out at",
    footerHandle: "@akhmaddaniel",
    modalDesc:
      "Enter your API key for verse analysis. You can also use the VITE_DEEPSEEK_API_KEY env var in your Vercel dashboard.",
    modalHint: "Don't have one?",
    modalHintLink: "Register here",
    modalCancel: "Cancel",
    modalSave: "Save",
    errNoKey:
      "**Error:** API key not set.\n\n> 💡 Click the ⚙️ button in the top-right corner to enter a key, or set `VITE_DEEPSEEK_API_KEY` in Vercel env vars.",
    errPrefix: "Error",
    systemPrompt:
      "You are an expert Qur'anic tafsir assistant. Only answer questions related to the given verse, nahw, sarf, balaghah, and Qur'anic tafsir. Answer directly without preamble or closing. Use clear, academic yet approachable English.",
    analysisPrompt:
      "Analyze the following Qur'anic verse deeply and in a structured manner in English. Get straight to the analysis, no introduction or closing.\n\n**Verse:**\n{arab}\n\n**Translation:**\n{translation}\n\n{latinSegment}Provide analysis in the following format (use simple markdown):\n\n1. **Word-by-Word Translation** — each word: - **word** — meaning\n2. **Word Formation (Sarf/Morphology)** — analysis of root word forms (fi'il madhi/mudhari/amar, isim masdar, isim fa'il/maf'ul, etc.) for key words, with the meaning/concept of each root word\n3. **Balaghah (Rhetoric)** — analysis of rhetorical devices and linguistic beauty: uslub (style), kinayah/majaz (metaphor), fashahah (eloquence), unique word arrangement\n4. **Brief Tafsir** — concise explanation of the verse's meaning based on classical tafsir (such as Ibn Kathir, al-Mishbah, etc.)",
    chatSystemPrefix: "You are an expert Qur'anic tafsir assistant. Only answer questions related to the verse being discussed, nahw, sarf, balaghah, and Qur'anic tafsir. Here is the existing analysis for the verse:\n\n{analysis}\n\nAnswer directly without preamble or closing. Be detailed and academic in English.\n\nIf the user asks about something outside Qur'anic tafsir, politely decline and redirect to the verse being discussed.",
    bismillah: "In the name of Allah",
  },
};

function App() {
  // ─── i18n ──────────────────────────────────────────────
  const [lang, setLang] = useState(() => {
    return localStorage.getItem("quran-lang") || "id";
  });

  useEffect(() => {
    localStorage.setItem("quran-lang", lang);
  }, [lang]);

  // ─── Theme (dark/light) ─────────────────────────────────
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("quran-theme") || "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("quran-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

  const t = useCallback(
    (key, params) => {
      let val = translations[lang]?.[key];
      if (val === undefined) val = translations["id"]?.[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          val = val.replace(`{${k}}`, v);
        }
      }
      return val;
    },
    [lang]
  );

  const toggleLang = () => {
    setLang((l) => (l === "id" ? "en" : "id"));
  };

  // ─── State ──────────────────────────────────────────────
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
  const [surahSearch, setSurahSearch] = useState("");
  const [showSurahDropdown, setShowSurahDropdown] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(null);
  const audioRef = useRef(new Audio());
  const [showAyatDropdown, setShowAyatDropdown] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const qariList = [
    { id: "01", name: "Abdullah Al-Juhany" },
    { id: "02", name: "Abdul Muhsin Al-Qasim" },
    { id: "03", name: "Abdurrahman As-Sudais" },
    { id: "04", name: "Ibrahim Al-Dossari" },
    { id: "05", name: "Misyari Rasyid Al-Afasi" },
    { id: "06", name: "Yasser Al-Dosari" },
  ];
  const [selectedQari, setSelectedQari] = useState(() => {
    return localStorage.getItem("quran-qari") || "05";
  });
  useEffect(() => {
    localStorage.setItem("quran-qari", selectedQari);
  }, [selectedQari]);
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
  }, [surahNomor, currentAyat, lang]);

  const loadAnalysis = async (surah, ayat, id) => {
    const suffix = lang || "id";
    const localKey = `${STORAGE_PREFIX}${surah}-${ayat}-${suffix}`;

    // Coba dari API dulu
    try {
      const res = await fetch(`/api/analysis?surah=${surah}&ayat=${ayat}&lang=${lang || "id"}`);
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
        body: JSON.stringify({ surah, ayat, content, lang: lang || "id" }),
      }).then((r) => {
        if (!r.ok) console.warn("Backend sync failed:", r.status);
      }).catch((e) => console.warn("Backend sync error:", e.message));
    }

    // Load chat history (selalu, baik dr API maupun localStorage)
    const chatKey = `chat-${surah}-${ayat}-${lang || "id"}`;
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

  // Helper: extract surah & ayat from local data (defined before useEffect)
  function loadLocalSurah(nomor, data) {
    var surahList = data || surahs;
    var surah = surahList.find(function(s) { return s.nomor === nomor; });
    if (surah) {
      setCurrentSurah(surah);
      setVerses(surah.ayat || []);
      setSurahNomor(nomor);
      setCurrentAyat(1);
      setLoading(false);
    }
  }

  // Load Quran data: coba dari storage dulu, fallback ke external API
  useEffect(() => {
    var hasUrlParams = new URLSearchParams(window.location.search);
    var urlSurah = Number(hasUrlParams.get("surah"));
    var urlAyat = Number(hasUrlParams.get("ayat"));

    // Coba dari storage
    fetch("/api/quran-data")
      .then(function(r) {
        if (!r.ok) throw new Error("Storage not available");
        return r.json();
      })
      .then(function(d) {
        if (d.surahs && d.surahs.length > 0) {
          setSurahs(d.surahs);
          if (urlSurah > 0) {
            loadLocalSurah(urlSurah, d.surahs);
            setCurrentAyat(urlAyat > 0 ? urlAyat : 1);
          } else {
            loadLocalSurah(d.surahs[0].nomor, d.surahs);
          }
        } else {
          throw new Error("Empty data");
        }
      })
      .catch(function() {
        // Fallback: fetch dari external API
        console.warn("Quran storage unavailable, fetching from external API...");
        fetch("https://equran.id/api/v2/surat")
          .then(function(r) { return r.json(); })
          .then(function(d) {
            if (d.code === 200) {
              setSurahs(d.data);
              if (urlSurah > 0) {
                loadExternalSurah(urlSurah, urlAyat);
              } else {
                loadExternalSurah(d.data[0].nomor, 1);
              }
            }
          }).catch(console.error);
      });
  }, []);

  // Helper: fetch surah dari external API (fallback)
  function loadExternalSurah(nomor, ayatNum) {
    Promise.all([
      fetch("https://equran.id/api/v2/surat/" + nomor).then(function(r) { return r.json(); }),
      fetch("https://api.alquran.cloud/v1/surah/" + nomor + "/en.sahih")
        .then(function(r) { return r.json(); }).catch(function() { return null; }),
    ]).then(function(results) {
      var idData = results[0];
      var enData = results[1];
      if (idData.code === 200) {
        var surah = Object.assign({}, idData.data);
        var ayats = [].concat(surah.ayat);
        var isEn = lang === "en";
        if (isEn && enData && enData.data && enData.data.ayahs) {
          ayats = ayats.map(function(ayat, idx) {
            return Object.assign({}, ayat, { teksInggris: enData.data.ayahs[idx] ? enData.data.ayahs[idx].text : "" });
          });
          surah.arti = enData.data.englishNameTranslation || surah.arti;
        } else {
          ayats = ayats.map(function(ayat) { return Object.assign({}, ayat, { teksInggris: "" }); });
        }
        setCurrentSurah(surah);
        setVerses(ayats);
        setSurahNomor(nomor);
        setCurrentAyat(ayatNum > 0 ? ayatNum : 1);
        setLoading(false);
      }
    }).catch(console.error);
  }

  const loadSurah = useCallback(function(nomor) {
    setLoading(false);
    setCurrentAyat(1);
    setJumpValue("");
    setAnalysis(null);
    if (surahs.length > 0 && surahs[0].ayat) {
      // Data sudah ada di storage
      loadLocalSurah(nomor);
    } else {
      // Fallback ke external API
      loadExternalSurah(nomor, 1);
    }
  }, [surahs]);

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
    const latinSegment = latin ? `**Latin:** ${latin}\n\n` : "";
    const prompt = t("analysisPrompt")
      .replace("{arab}", arab)
      .replace("{translation}", translation)
      .replace("{latinSegment}", latinSegment);
    return prompt;
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
        lang === "en" && ayat.teksInggris ? ayat.teksInggris : ayat.teksIndonesia,
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
              content: t("systemPrompt"),
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
      const suffix = lang || "id";
      const cacheKey = `${STORAGE_PREFIX}${surahNomor}-${currentAyat}-${suffix}`;
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
          lang: lang || "id",
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
        `**${t("errPrefix")}:** ${err.message}\n\n> 💡 Pastikan \`VITE_DEEPSEEK_API_KEY\` sudah di-set di Vercel env vars.`
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

  const handleShare = () => {
    const surahName = currentSurah?.namaLatin || "";
    const surahNumber = surahNomor || 1;
    const ayatNumber = currentAyat || 1;
    const arabText = ayat?.teksArab || "";
    const translation = lang === "en" && ayat?.teksInggris ? ayat.teksInggris : ayat?.teksIndonesia || "";
    const url = window.location.origin + window.location.pathname + "?surah=" + surahNumber + "&ayat=" + ayatNumber;
    const detailLine = lang === "id"
      ? "Lihat detail analisa kata per kata, nahwu sharaf, balaghah dan tafsir, klik:"
      : "See detailed word-by-word analysis, nahwu sharaf, balaghah and tafsir, click:";
    const shareText = surahName + " " + ayatNumber + "\n\n" + arabText + "\n\n" + translation + "\n\n" + detailLine + "\n\n" + url;
    if (navigator.share) {
      navigator.share({ title: surahName + " " + ayatNumber, text: shareText }).catch(function() {});
    } else {
      var waUrl = "https://wa.me/?text=" + encodeURIComponent(shareText);
      var xUrl = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(shareText);
      var fbUrl = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url) + "&quote=" + encodeURIComponent(shareText);
      var action = window.prompt(
        lang === "id"
          ? "Bagikan ke:\\n1. WhatsApp\\n2. X (Twitter)\\n3. Facebook\\n4. Salin tautan"
          : "Share to:\\n1. WhatsApp\\n2. X (Twitter)\\n3. Facebook\\n4. Copy link"
      );
      if (action === "1") window.open(waUrl, "_blank", "noopener");
      else if (action === "2") window.open(xUrl, "_blank", "noopener");
      else if (action === "3") window.open(fbUrl, "_blank", "noopener");
      else if (action === "4") {
        navigator.clipboard.writeText(shareText).catch(function() {});
        alert(lang === "id" ? "Tautan disalin!" : "Link copied!");
      }
    }
  };
  const handlePlay = () => {
    if (!ayat?.teksArab) return;
    
    // Pause/resume if same ayat
    if (audioPlaying === currentAyat) {
      if (audioRef.current.paused) {
        audioRef.current.play();
      } else {
        audioRef.current.pause();
      }
      return;
    }
    
    // Stop previous
    if (audioPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    const surahStr = String(surahNomor).padStart(3, "0");
    const ayatStr = String(currentAyat).padStart(3, "0");
    const qariName = qariList.find(function(q) { return q.id === selectedQari; })?.name || qariList[0].name;
    const audioUrl = "https://cdn.equran.id/audio-partial/" + qariName + "/" + surahStr + ayatStr + ".mp3";
    
    audioRef.current.src = audioUrl;
    audioRef.current.play();
    setAudioPlaying(currentAyat);
    
    audioRef.current.onended = () => setAudioPlaying(null);
    audioRef.current.onerror = () => {
      setAudioPlaying(null);
      audioRef.current.src = "https://cdn.equran.id/audio-partial/" + qariList[0].name + "/" + surahStr + ayatStr + ".mp3";
      audioRef.current.play().catch(() => setAudioPlaying(null));
    };
  };

  const clearAnalysis = () => {
    const suffix = lang || "id";
    const cacheKey = `${STORAGE_PREFIX}${surahNomor}-${currentAyat}-${suffix}`;
    localStorage.removeItem(cacheKey);
    localStorage.removeItem(`chat-${surahNomor}-${currentAyat}-${suffix}`);
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
      const analysisSnippet = analysis?.substring(0, 4000) || t("chatSystemPrefixNoAnalysis");
      const systemPrompt = t("chatSystemPrefix").replace("{analysis}", analysisSnippet);

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
      const chatKey = `chat-${surahNomor}-${currentAyat}-${lang || "id"}`;
      localStorage.setItem(chatKey, JSON.stringify(finalMessages));

      setTimeout(() => {
        chatRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 100);
    } catch (err) {
      setChatMessages([
        ...updated,
        { role: "assistant", content: `**${t("errPrefix")}:** ${err.message}` },
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
        if (line.includes("**Terjemahan Kata Per Kata**") || line.includes("**Word-by-Word Translation**")) {
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
        <div className="loading">{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1 className="title">{t("title")}</h1>
        <button
          className="lang-toggle"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Ganti ke dark mode"}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <button
          className="lang-toggle"
          onClick={toggleLang}
          title={lang === "id" ? "Switch to English" : "Ganti ke Bahasa Indonesia"}
        >
          🌐 <span className="lang-label">{lang === "id" ? "ID" : "EN"}</span>
        </button>
      </header>

      {/* Surah Search */}
      <div className="surah-selector">
        <div className="surah-search-wrapper">
          <input
            className="surah-search-input"
            placeholder={t("surahSearchPlaceholder")}
            value={surahSearch}
            onChange={(e) => {
              setSurahSearch(e.target.value);
              setShowSurahDropdown(true);
            }}
            onFocus={() => setShowSurahDropdown(true)}
            onBlur={() => setTimeout(() => setShowSurahDropdown(false), 200)}
          />
          {surahSearch && (
            <button
              className="surah-search-clear"
              onClick={() => {
                setSurahSearch("");
                setShowSurahDropdown(false);
              }}
            >
              ✕
            </button>
          )}
        </div>
        {showSurahDropdown && (
          <div className="surah-dropdown">
            {surahs
              .filter((s) => {
                if (!surahSearch) return true;
                const q = surahSearch.toLowerCase();
                return (
                  s.namaLatin.toLowerCase().includes(q) ||
                  s.nama.includes(q) ||
                  s.nomor.toString().includes(q) ||
                  s.arti.toLowerCase().includes(q)
                );
              })
              .slice(0, 50)
              .map((s) => (
                <div
                  key={s.nomor}
                  className={`surah-dropdown-item ${s.nomor === currentSurah?.nomor ? "active" : ""}`}
                  onMouseDown={() => {
                    handleSurahChange(s.nomor);
                    setSurahSearch("");
                    setShowSurahDropdown(false);
                  }}
                >
                  <span className="surah-dd-nomor">{s.nomor}</span>
                  <span className="surah-dd-latin">{s.namaLatin}</span>
                  <span className="surah-dd-arab">{s.nama}</span>
                </div>
              ))}
            {surahs.filter((s) => {
              if (!surahSearch) return true;
              const q = surahSearch.toLowerCase();
              return (
                s.namaLatin.toLowerCase().includes(q) ||
                s.nama.includes(q) ||
                s.nomor.toString().includes(q) ||
                s.arti.toLowerCase().includes(q)
              );
            }).length === 0 && (
              <div className="surah-dropdown-empty">{t("surahNotFound")}</div>
            )}
          </div>
        )}
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
            {currentSurah?.arti} &middot; {currentSurah?.jumlahAyat} {lang === "en" ? "Verses" : "Ayat"} &middot;{" "}
            {currentSurah?.tempatTurun === "mekah"
              ? lang === "en"
                ? "Makkiyah"
                : "Makkiyah"
              : lang === "en"
                ? "Madaniyah"
                : "Madaniyah"}
          </div>
        </div>

        {/* Top Navigation */}
        <div className="navigation nav-top">
          <button
            className="nav-btn"
            onClick={prevAyat}
            disabled={currentAyat <= 1}
          >
            &#8592; {t("prev")}
          </button>

          <div className="jump-wrap">
            <button
              className="jump-btn"
              onClick={() => setShowAyatDropdown(!showAyatDropdown)}
              onBlur={() => setTimeout(() => setShowAyatDropdown(false), 200)}
            >
              {currentAyat} <span className="jump-arrow">▾</span>
            </button>
            {showAyatDropdown && (
              <div className="jump-dropdown">
                {verses.map((v, i) => {
                  const words = v.teksArab?.split(/\s+/).filter(Boolean) || [];
                  const first = words[0] || "";
                  const last = words.length > 1 ? words[words.length - 1] : "";
                  return (
                    <div
                      key={i}
                      className={"jump-item" + (i + 1 === currentAyat ? " active" : "")}
                      onMouseDown={() => {
                        setCurrentAyat(i + 1);
                        setShowAyatDropdown(false);
                      }}
                    >
                      {i + 1}. {first}{last ? " ... " + last : ""}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            className="nav-btn"
            onClick={nextAyat}
            disabled={currentAyat >= totalAyat}
          >
            {t("next")} &rarr;
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
          <div className="ayat-toolbar">
            <button className="ayat-btn play-btn" onClick={handlePlay} title={lang === "id" ? "Putar audio" : "Play audio"}>
              {audioPlaying === currentAyat && !audioRef.current.paused ? "⏸" : "▶"}
            </button>
            <span className="ayat-btn num-btn">{ayat.nomor || currentAyat}</span>
            <button className="ayat-btn share-btn" onClick={() => handleShare()} title={lang === "id" ? "Bagikan" : "Share"}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/>
                <circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
          </div>
          <div className="ayat-arabic">
            {ayatWords.map((w, i) => (
              <span
                key={i}
                className="ayat-word"
              >
                {w}{" "}
              </span>
            ))}
          </div>
          <div className="ayat-translation">
            {lang === "en" && ayat.teksInggris ? ayat.teksInggris : ayat.teksIndonesia}
          </div>
          <div className="ayat-latin">{ayat.teksLatin}</div>
        </div>

        {/* Analyze */}
        <div className="analyze-section">
          {!analysis && !analyzing && (
            <button className="analyze-btn" onClick={handleAnalyze}>
              🤖 {t("analyzeBtn")}
            </button>
          )}

          {analyzing && (
            <div className="analyzing">
              <div className="spinner" />
              <span>{t("analyzing")}</span>
            </div>
          )}

          {analysis && (
            <div className="analysis-result" ref={analysisRef}>
              <div className="analysis-header">
                <span className="analysis-title">📊 {t("analysisTitle")}</span>
                <div className="analysis-actions">
                  <button
                    className="analysis-regen-btn"
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    title={t("regenTitle")}
                  >
                    🔄
                  </button>
                  <button
                    className="analysis-close-btn"
                    onClick={clearAnalysis}
                    title={t("closeTitle")}
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

              {/* Chatbox */}
              <div className="chat-section">
                {chatMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`chat-bubble ${m.role === "user" ? "chat-user" : "chat-ai"}`}
                  >
                    <div className="chat-label">
                      {m.role === "user" ? t("chatLabelUser") : t("chatLabelAI")}
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
                    <span>{t("chatTyping")}</span>
                  </div>
                )}
                <div className="chat-input-row">
                  <input
                    className="chat-input"
                    placeholder={t("chatPlaceholder")}
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
                    {t("chatSend")}
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
            {t("progressText", { current: currentAyat, total: totalAyat })}
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
            &#8592; {t("prev")}
          </button>

          <div className="jump-wrap">
            <button
              className="jump-btn"
              onClick={() => setShowAyatDropdown(!showAyatDropdown)}
              onBlur={() => setTimeout(() => setShowAyatDropdown(false), 200)}
            >
              {currentAyat} <span className="jump-arrow">▾</span>
            </button>
            {showAyatDropdown && (
              <div className="jump-dropdown">
                {verses.map((v, i) => {
                  const words = v.teksArab?.split(/\s+/).filter(Boolean) || [];
                  const first = words[0] || "";
                  const last = words.length > 1 ? words[words.length - 1] : "";
                  return (
                    <div
                      key={i}
                      className={"jump-item" + (i + 1 === currentAyat ? " active" : "")}
                      onMouseDown={() => {
                        setCurrentAyat(i + 1);
                        setShowAyatDropdown(false);
                      }}
                    >
                      {i + 1}. {first}{last ? " ... " + last : ""}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            className="nav-btn"
            onClick={nextAyat}
            disabled={currentAyat >= totalAyat}
          >
            {t("next")} &rarr;
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>
          {t("footerText")}{" "}
          <a
            href="https://x.com/akhmaddaniel"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            {t("footerHandle")}
          </a>
        </p>
      </footer>

      {/* API Key Modal */}
      {showKeyModal && (
        <div className="modal-overlay" onClick={() => setShowKeyModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">🔑 DeepSeek API Key</h3>
            <p className="modal-desc">
              {t("modalDesc")}
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
              {t("modalHint")}{" "}
              <a
                href="https://platform.deepseek.com/api_keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("modalHintLink")}
              </a>
            </p>
            <div className="modal-actions">
              <button
                className="modal-cancel"
                onClick={() => setShowKeyModal(false)}
              >
                {t("modalCancel")}
              </button>
              <button
                className="modal-save"
                onClick={handleSaveKey}
                disabled={!keyInput.trim()}
              >
                {t("modalSave")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error: error };
  }
  render() {
    if (this.state.hasError) {
      return React.createElement("div", { style: { padding: "20px", textAlign: "center", fontFamily: "sans-serif" } },
        React.createElement("h2", null, "Something went wrong :("),
        React.createElement("p", { style: { color: "#ef4444" } }, this.state.error && this.state.error.toString()),
        React.createElement("button", {
          onClick: function() { window.location.reload(); },
          style: { padding: "8px 16px", marginTop: "12px", cursor: "pointer" }
        }, "Reload")
      );
    }
    return this.props.children;
  }
}

const AppWithBoundary = () => React.createElement(ErrorBoundary, null, React.createElement(App));
export default AppWithBoundary;
