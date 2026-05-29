import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";

const API_BASE = "https://equran.id/api/v2";

function App() {
  const [surahs, setSurahs] = useState([]);
  const [currentSurah, setCurrentSurah] = useState(null);
  const [verses, setVerses] = useState([]);
  const [currentAyat, setCurrentAyat] = useState(1);
  const [loading, setLoading] = useState(true);
  const [jumpValue, setJumpValue] = useState("");
  const prevFn = useRef();
  const nextFn = useRef();

  // Fetch daftar surat
  useEffect(() => {
    fetch(`${API_BASE}/surat`)
      .then((r) => r.json())
      .then((d) => {
        if (d.code === 200) {
          setSurahs(d.data);
          // Auto-load surah pertama
          const first = d.data[0];
          loadSurah(first.nomor);
        }
      })
      .catch(console.error);
  }, []);

  const loadSurah = useCallback((nomor) => {
    setLoading(true);
    setCurrentAyat(1);
    setJumpValue("");
    fetch(`${API_BASE}/surat/${nomor}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.code === 200) {
          setCurrentSurah(d.data);
          setVerses(d.data.ayat);
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
        <div className="ayat-card" key={`${currentSurah?.nomor}-${currentAyat}`}>
          <div className="ayat-number">{ayat.nomor || currentAyat}</div>
          <div className="ayat-arabic">{ayat.teksArab}</div>
          <div className="ayat-translation">{ayat.teksIndonesia}</div>
          <div className="ayat-latin">{ayat.teksLatin}</div>
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
    </div>
  );
}

export default App;
