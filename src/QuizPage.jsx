import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from './firebase';
import { getAuth } from 'firebase/auth';
import { EXP_REWARDS } from './Expsystem';
import { useDialog } from './DialogContext';
import Confetti from 'react-confetti';

// ══════════════════════════════════════════════════════════════
//  UTILITY
// ══════════════════════════════════════════════════════════════
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

const getLocalDateStr = (d = new Date()) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const useTTS = () => {
  const speak = useCallback((text, lang = 'ja-JP') => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    window.speechSynthesis.speak(u);
  }, []);
  return speak;
};

// Seeded PRNG for deterministic daily game selection
const seededRandom = (seed) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
};

// Get today's 2 game IDs (deterministic per day)
const getTodayGames = () => {
  const dateStr = getLocalDateStr();
  const seed = dateStr.split('-').reduce((a, b) => a * 100 + parseInt(b), 0);
  const rng = seededRandom(seed);
  const allIds = Array.from({ length: 20 }, (_, i) => i + 1);
  const shuffled = [...allIds].sort(() => rng() - 0.5);
  return [shuffled[0], shuffled[1]];
};

// ══════════════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════════════
const GAME_DEFS = [
  { id: 1,  name: "Hợp Thể Giả Kim",       icon: "⚗️",  group: "Thẻ Bài & Kết Nối",    color: "from-violet-900 to-purple-950",   accent: "#a855f7", desc: "Kéo từ vựng nối với nghĩa đúng" },
  { id: 2,  name: "Lật Thẻ Tinh Tú",        icon: "🃏",  group: "Thẻ Bài & Kết Nối",    color: "from-indigo-900 to-blue-950",     accent: "#6366f1", desc: "Lật đôi thẻ từ vựng - ý nghĩa" },
  { id: 3,  name: "Vòng Tròn Ma Trận",       icon: "🔮",  group: "Thẻ Bài & Kết Nối",    color: "from-cyan-900 to-teal-950",       accent: "#06b6d4", desc: "Chạm vào từ vựng đúng bay quanh" },
  { id: 4,  name: "Khóa Ấn Tà Linh",         icon: "👹",  group: "Thẻ Bài & Kết Nối",    color: "from-red-900 to-rose-950",        accent: "#ef4444", desc: "Chọn lá bùa đúng phong ấn quỷ" },
  { id: 5,  name: "Chỉ Lối Vong Hồn",        icon: "👻",  group: "Thẻ Bài & Kết Nối",    color: "from-emerald-900 to-green-950",   accent: "#10b981", desc: "Nối liên tiếp Kanji→Hiragana→Nghĩa" },
  { id: 6,  name: "Cán Cân Sinh Tử",         icon: "⚖️",  group: "Tốc Độ & Phản Xạ",    color: "from-amber-900 to-yellow-950",    accent: "#f59e0b", desc: "Vuốt phải/trái: Đúng/Sai nghĩa" },
  { id: 7,  name: "Mưa Sao Băng",            icon: "☄️",  group: "Tốc Độ & Phản Xạ",    color: "from-blue-900 to-indigo-950",     accent: "#3b82f6", desc: "Bắn vỡ sao băng mang từ đúng" },
  { id: 8,  name: "Trảm Phong Kiếm",         icon: "⚔️",  group: "Tốc Độ & Phản Xạ",    color: "from-slate-900 to-gray-950",      accent: "#94a3b8", desc: "Vuốt chém từ vựng đúng bay qua" },
  { id: 9,  name: "Cuộc Chiến Ánh Sáng",     icon: "🔨",  group: "Tốc Độ & Phản Xạ",    color: "from-orange-900 to-red-950",      accent: "#f97316", desc: "Đập quỷ cầm biển nghĩa đúng" },
  { id: 10, name: "Cửa Ngục Tử Thần",        icon: "🚪",  group: "Tốc Độ & Phản Xạ",    color: "from-purple-900 to-violet-950",   accent: "#8b5cf6", desc: "Chọn cửa đúng khi nhân vật chạy" },
  { id: 11, name: "Giải Mã Đá Cổ",           icon: "🗿",  group: "Logic & Xếp Hình",      color: "from-stone-900 to-zinc-950",      accent: "#78716c", desc: "Xếp ký tự Hiragana theo đúng thứ tự" },
  { id: 12, name: "Chén Thánh Độc Dược",      icon: "🏺",  group: "Logic & Xếp Hình",      color: "from-green-900 to-emerald-950",   accent: "#22c55e", desc: "Tìm từ không cùng chủ đề" },
  { id: 13, name: "Điền Chữ Tế Đàn",         icon: "📜",  group: "Logic & Xếp Hình",      color: "from-yellow-900 to-amber-950",    accent: "#eab308", desc: "Kéo ký tự điền vào chỗ trống" },
  { id: 14, name: "Lưới Phép Thuật",          icon: "🕸️",  group: "Logic & Xếp Hình",      color: "from-teal-900 to-cyan-950",       accent: "#14b8a6", desc: "Tìm từ tiếng Nhật trong lưới chữ" },
  { id: 15, name: "Ghép Mảnh Ấn Chú",        icon: "🧩",  group: "Logic & Xếp Hình",      color: "from-pink-900 to-rose-950",       accent: "#ec4899", desc: "Ghép nửa từ ghép Kanji" },
  { id: 16, name: "Tiếng Vọng Hư Không",     icon: "🌑",  group: "Âm Thanh Ám Ảnh",      color: "from-black to-gray-950",          accent: "#6b7280", desc: "Nghe âm thanh, chọn nghĩa đúng" },
  { id: 17, name: "Bắt Tinh Linh Âm",        icon: "✨",  group: "Âm Thanh Ám Ảnh",      color: "from-fuchsia-900 to-purple-950",  accent: "#d946ef", desc: "Bắt tinh linh khi nghe đọc tên nó" },
  { id: 18, name: "Thẩm Âm Phán Xét",        icon: "⚡",  group: "Âm Thanh Ám Ảnh",      color: "from-yellow-900 to-orange-950",   accent: "#facc15", desc: "Nghe từ, phán Đúng/Sai trong 3 giây" },
  { id: 19, name: "Khúc Hát Nhân Ngư",       icon: "🧜",  group: "Âm Thanh Ám Ảnh",      color: "from-blue-950 to-cyan-950",       accent: "#38bdf8", desc: "Nhớ thứ tự 3 từ vừa nghe" },
  { id: 20, name: "Leo Tháp Quỷ",            icon: "💀",  group: "Sinh Tồn Vô Tận",       color: "from-red-950 to-black",           accent: "#dc2626", desc: "Trắc nghiệm không hồi kết, sai = chết" },
];

const EXP_PER_CORRECT   = 6;
const COIN_PER_CORRECT  = 1;
const COIN_PER_GAME     = 20;
const EXP_PER_GAME      = 40;

// ══════════════════════════════════════════════════════════════
//  MYSTIC PARTICLES BACKGROUND
// ══════════════════════════════════════════════════════════════
function MysticBg({ accent = '#a855f7' }) {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-950 to-black" />
      {Array.from({ length: 30 }, (_, i) => (
        <div
          key={i}
          className="absolute rounded-full opacity-20 animate-pulse"
          style={{
            width: `${2 + (i % 4)}px`,
            height: `${2 + (i % 4)}px`,
            background: accent,
            left: `${(i * 37) % 100}%`,
            top: `${(i * 53) % 100}%`,
            animationDelay: `${(i * 0.3) % 3}s`,
            animationDuration: `${2 + (i % 3)}s`,
            boxShadow: `0 0 6px ${accent}`,
          }}
        />
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  MYSTIC BUTTON
// ══════════════════════════════════════════════════════════════
function MysticBtn({ onClick, disabled, children, variant = 'primary', accent = '#a855f7', className = '' }) {
  const base = "relative font-black rounded-2xl transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed select-none";
  if (variant === 'primary') return (
    <button onClick={onClick} disabled={disabled}
      className={`${base} px-6 py-3 text-white shadow-lg ${className}`}
      style={{ background: `linear-gradient(135deg, ${accent}cc, ${accent}88)`, border: `1px solid ${accent}44`, boxShadow: `0 0 20px ${accent}33` }}
    >
      {children}
    </button>
  );
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${base} px-6 py-3 bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 ${className}`}
    >
      {children}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
//  SCORE PANEL (top bar during game)
// ══════════════════════════════════════════════════════════════
function ScoreBar({ score, total, expGained, onQuit, accent }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-3"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${accent}33` }}>
      <button onClick={onQuit} className="text-red-400 font-bold text-sm bg-red-900/30 px-3 py-1 rounded-lg active:scale-95">✖ Thoát</button>
      <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: total ? `${(score / total) * 100}%` : '0%', background: accent }} />
      </div>
      <span className="text-white font-black whitespace-nowrap">{score}/{total}</span>
      <span className="text-yellow-400 font-black text-base">⚡{expGained}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  RESULT SCREEN
// ══════════════════════════════════════════════════════════════
function ResultScreen({ score, total, expGained, coinsGained, gameName, onDone, accent }) {
  const pct = total ? Math.min(100, Math.round((score / total) * 100)) : 0;
  const [show, setShow] = useState(false);
  useEffect(() => { setTimeout(() => setShow(true), 50); }, []);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-5">
      <MysticBg accent={accent} />
      {pct >= 60 && <Confetti width={window.innerWidth} height={window.innerHeight} recycle={false} numberOfPieces={180} />}
      <div className={`relative z-10 text-center max-w-sm w-full transition-all duration-500 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <div className="text-8xl mb-4">{pct >= 80 ? '🏆' : pct >= 60 ? '⭐' : '💀'}</div>
        <h2 className="text-3xl font-black text-white mb-1">{gameName}</h2>
        <p className="text-white/50 text-base mb-8">Kết quả phiên đấu</p>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Điểm', val: `${score}/${total}`, icon: '🎯' },
            { label: 'EXP', val: `+${expGained}`, icon: '⚡' },
            { label: 'Xu', val: `+${coinsGained}`, icon: '🪙' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <div className="text-3xl mb-2">{s.icon}</div>
              <div className="text-white font-black text-xl">{s.val}</div>
              <div className="text-white/40 text-sm mt-1">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl p-5 mb-8" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div className="text-white/50 text-sm mb-2">Độ chính xác</div>
          <div className="text-5xl font-black" style={{ color: accent }}>{pct}%</div>
        </div>
        <MysticBtn onClick={onDone} accent={accent} className="w-full py-5 text-xl">Hoàn Tất</MysticBtn>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 1: HỢP THỂ GIẢ KIM (Drag & Match)
// ══════════════════════════════════════════════════════════════
function Game1AlchemistFusion({ vocab, onScore, onFinish, accent }) {
  const PAIRS = 5;
  const [pairs] = useState(() => shuffle(vocab).slice(0, PAIRS));
  const [rights] = useState(() => shuffle(pairs.map(p => ({ id: p.id || p.word, text: p.meaning }))));
  const [matched, setMatched] = useState([]); // word ids matched
  const [selectedLeft, setSelectedLeft] = useState(null);
  const [selectedRight, setSelectedRight] = useState(null);
  const [flashes, setFlashes] = useState({}); // id → 'correct'|'wrong'
  const doneRef = useRef(false);

  const flash = (ids, type) => {
    const f = {};
    ids.forEach(id => { f[id] = type; });
    setFlashes(f);
    setTimeout(() => setFlashes({}), 500);
  };

  const tryMatch = (leftId, rightId) => {
    const left = pairs.find(p => (p.id || p.word) === leftId);
    const right = rights.find(r => r.id === rightId);
    const correct = left && right && left.meaning === right.text;
    if (correct) {
      flash([leftId, rightId], 'correct');
      onScore(1);
      setMatched(m => {
        const nm = [...m, leftId];
        if (nm.length === PAIRS && !doneRef.current) {
          doneRef.current = true;
          setTimeout(onFinish, 700);
        }
        return nm;
      });
    } else {
      flash([leftId, rightId], 'wrong');
    }
    setSelectedLeft(null);
    setSelectedRight(null);
  };

  const handleLeft = (id) => {
    if (matched.includes(id)) return;
    const newSel = selectedLeft === id ? null : id;
    setSelectedLeft(newSel);
    if (newSel && selectedRight) tryMatch(newSel, selectedRight);
  };

  const handleRight = (id) => {
    if (matched.includes(id)) return;
    const newSel = selectedRight === id ? null : id;
    setSelectedRight(newSel);
    if (selectedLeft && newSel) tryMatch(selectedLeft, newSel);
  };

  const cardStyle = (isMatched, isSelected, flashType) => ({
    background: isMatched ? '#ffffff06'
      : flashType === 'correct' ? '#22c55e33'
      : flashType === 'wrong' ? '#ef444433'
      : isSelected ? `${accent}44`
      : `${accent}15`,
    border: `2px solid ${
      isMatched ? '#ffffff10'
      : flashType === 'correct' ? '#22c55e'
      : flashType === 'wrong' ? '#ef4444'
      : isSelected ? accent
      : accent + '44'
    }`,
    boxShadow: isSelected && !isMatched ? `0 0 16px ${accent}55` : 'none',
    minHeight: '56px',
    transition: 'all 0.15s ease',
  });

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6 mt-16">
      <p className="text-white/50 text-base text-center">
        Chạm chọn từ bên trái, rồi chọn nghĩa bên phải
      </p>
      <div className="w-full max-w-lg grid grid-cols-2 gap-x-4 gap-y-3">
        {/* Render pairs side by side row by row */}
        {Array.from({ length: Math.max(pairs.length, rights.length) }, (_, i) => {
          const lp = pairs[i];
          const rp = rights[i];
          return (
            <React.Fragment key={i}>
              {/* LEFT */}
              {lp ? (() => {
                const id = lp.id || lp.word;
                const isMatched = matched.includes(id);
                const isSelected = selectedLeft === id;
                const flashType = flashes[id];
                return (
                  <button onClick={() => handleLeft(id)}
                    className={`rounded-2xl flex items-center justify-center text-center font-black text-xl px-3 py-4 select-none active:scale-95
                      ${isMatched ? 'opacity-20 cursor-default' : 'cursor-pointer text-white'}`}
                    style={cardStyle(isMatched, isSelected, flashType)}
                  >
                    {lp.word}
                  </button>
                );
              })() : <div />}

              {/* RIGHT */}
              {rp ? (() => {
                const isMatched = matched.includes(rp.id);
                const isSelected = selectedRight === rp.id;
                const flashType = flashes[rp.id];
                return (
                  <button onClick={() => handleRight(rp.id)}
                    className={`rounded-2xl flex items-center justify-center text-center font-bold text-base px-3 py-4 select-none active:scale-95
                      ${isMatched ? 'opacity-20 cursor-default' : 'cursor-pointer text-white'}`}
                    style={cardStyle(isMatched, isSelected, flashType)}
                  >
                    {rp.text}
                  </button>
                );
              })() : <div />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Selection hint */}
      <div className="text-white/30 text-sm h-5 text-center">
        {selectedLeft && !selectedRight && '👈 Đã chọn từ — chạm nghĩa bên phải'}
        {selectedRight && !selectedLeft && '👉 Đã chọn nghĩa — chạm từ bên trái'}
      </div>

      <button onClick={onFinish} className="text-white/30 text-sm underline">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 2: LẬT THẺ TINH TÚ (Memory Match)
// ══════════════════════════════════════════════════════════════
function Game2TarotMemory({ vocab, onScore, onFinish, accent }) {
  const PAIRS = 6;
  const [pairs] = useState(() => shuffle(vocab).slice(0, PAIRS));
  const [cards] = useState(() => shuffle([
    ...pairs.map(p => ({ id: `w-${p.word}`, pairId: p.word, text: p.word, type: 'word' })),
    ...pairs.map(p => ({ id: `m-${p.word}`, pairId: p.word, text: p.meaning, type: 'meaning' })),
  ]));
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState([]);
  const [disabled, setDisabled] = useState(false);
  const scoreRef = useRef(0);

  const handleFlip = (id) => {
    if (disabled || flipped.includes(id) || matched.some(m => m === id)) return;
    const newFlipped = [...flipped, id];
    setFlipped(newFlipped);
    if (newFlipped.length === 2) {
      setDisabled(true);
      const [a, b] = newFlipped.map(fid => cards.find(c => c.id === fid));
      if (a.pairId === b.pairId && a.type !== b.type) {
        scoreRef.current++;
        onScore(1);
        setTimeout(() => {
          setMatched(m => {
            const nm = [...m, a.id, b.id];
            if (nm.length === PAIRS * 2) setTimeout(onFinish, 600);
            return nm;
          });
          setFlipped([]);
          setDisabled(false);
        }, 500);
      } else {
        setTimeout(() => { setFlipped([]); setDisabled(false); }, 1000);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 mt-16 gap-4">
      <p className="text-white/50 text-base text-center">Lật thẻ tìm cặp Từ Vựng ↔ Nghĩa</p>
      <p className="text-white/30 text-sm">{matched.length / 2}/{PAIRS} cặp đã ghép</p>
      <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
        {cards.map(c => {
          const isFlipped = flipped.includes(c.id) || matched.includes(c.id);
          const isMatched = matched.includes(c.id);
          const isWord = c.type === 'word';
          return (
            <button key={c.id} onClick={() => handleFlip(c.id)}
              className="aspect-[4/5] rounded-2xl overflow-hidden transition-all duration-200 active:scale-95"
            >
              {!isFlipped ? (
                <div className="w-full h-full flex flex-col items-center justify-center"
                  style={{
                    background: `linear-gradient(145deg, ${accent}44, ${accent}18)`,
                    border: `2px solid ${accent}55`,
                    boxShadow: `0 0 10px ${accent}22`,
                  }}>
                  <span className="text-3xl">🌟</span>
                </div>
              ) : (
                <div className={`w-full h-full flex items-center justify-center text-center font-black px-2 py-3
                  ${isMatched ? 'opacity-30' : ''}`}
                  style={{
                    background: isMatched ? '#22c55e22'
                      : isWord ? `linear-gradient(145deg, ${accent}55, ${accent}33)`
                      : 'linear-gradient(145deg, #1e293b, #0f172a)',
                    border: `2px solid ${isMatched ? '#22c55e88' : isWord ? accent : '#475569'}`,
                    color: 'white',
                  }}>
                  <span className={`leading-tight break-words w-full ${isWord ? 'text-2xl' : 'text-sm'}`}>
                    {c.text}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
      <button onClick={onFinish} className="text-white/30 text-sm underline mt-2">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 3: VÒNG TRÒN MA TRẬN
// ══════════════════════════════════════════════════════════════
function Game3RuneCircle({ vocab, onScore, onFinish, accent }) {
  const TOTAL = 8;
  const pool = useMemo(() => shuffle(vocab).slice(0, Math.min(TOTAL + 3, vocab.length)), []);
  const [idx, setIdx] = useState(0);
  const [flash, setFlash] = useState(null);

  const current = pool[idx];
  const options = useMemo(() => {
    if (!current) return [];
    const wrong = shuffle(pool.filter((_, i) => i !== idx)).slice(0, 3);
    return shuffle([current, ...wrong]);
  }, [idx, pool]);

  const angles = [0, 90, 180, 270];

  const handleTap = (word) => {
    const correct = word === current.word;
    setFlash(correct ? 'correct' : 'wrong');
    if (correct) onScore(1);
    setTimeout(() => {
      setFlash(null);
      if (idx + 1 >= TOTAL) onFinish();
      else setIdx(i => i + 1);
    }, 500);
  };

  if (!current) return null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center mt-16 px-4">
      <p className="text-white/50 text-sm mb-8">{idx + 1}/{TOTAL} — Chạm từ vựng đúng bay xung quanh</p>
      <div className="relative w-72 h-72">
        {/* Center meaning */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-28 h-28 rounded-full flex items-center justify-center text-center text-base font-black text-white p-2"
            style={{ background: `radial-gradient(circle, ${accent}66, ${accent}22)`, border: `2px solid ${accent}`, boxShadow: `0 0 30px ${accent}66` }}>
            {current.meaning}
          </div>
        </div>
        {/* Orbiting options */}
        {options.map((opt, i) => {
          const rad = (angles[i] * Math.PI) / 180;
          const r = 110;
          const x = Math.cos(rad) * r + 136 - 36;
          const y = Math.sin(rad) * r + 136 - 36;
          return (
            <button key={opt.word}
              onClick={() => handleTap(opt.word)}
              className="absolute w-20 h-20 rounded-full text-center flex items-center justify-center text-sm font-black text-white transition-all duration-150 active:scale-90"
              style={{
                left: x, top: y,
                background: flash === 'correct' && opt.word === current.word ? '#22c55e55'
                  : flash === 'wrong' && opt.word !== current.word ? '#ef444422'
                  : `${accent}22`,
                border: `2px solid ${accent}55`,
                boxShadow: `0 0 15px ${accent}33`,
                animation: `orbit-float ${2 + i * 0.5}s ease-in-out infinite alternate`,
              }}>
              {opt.word}
            </button>
          );
        })}
      </div>
      <style>{`@keyframes orbit-float { from { transform: translateY(-4px); } to { transform: translateY(4px); } }`}</style>
      <button onClick={onFinish} className="text-white/30 text-sm underline mt-6">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 4: KHÓA ẤN TÀ LINH
// ══════════════════════════════════════════════════════════════
function Game4SealDemon({ vocab, onScore, onFinish, accent }) {
  const TOTAL = 8;
  const pool = useMemo(() => shuffle(vocab).slice(0, Math.min(TOTAL + 3, vocab.length)), []);
  const [idx, setIdx] = useState(0);
  const [flash, setFlash] = useState(null);
  const [sealed, setSealed] = useState(false);

  const current = pool[idx];
  const options = useMemo(() => {
    if (!current) return [];
    const wrong = shuffle(pool.filter((_, i) => i !== idx)).slice(0, 3);
    return shuffle([{ text: current.meaning, correct: true }, ...wrong.map(w => ({ text: w.meaning, correct: false }))]);
  }, [idx, pool]);

  const handleTap = (opt) => {
    if (flash) return;
    setFlash(opt.correct ? 'correct' : 'wrong');
    if (opt.correct) { onScore(1); setSealed(true); }
    setTimeout(() => {
      setFlash(null); setSealed(false);
      if (idx + 1 >= TOTAL) onFinish();
      else setIdx(i => i + 1);
    }, 800);
  };

  if (!current) return null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center mt-16 px-4 gap-6">
      <p className="text-white/60 text-lg font-black">{idx + 1}/{TOTAL} — Chọn lá bùa đúng phong ấn quỷ</p>
      {/* Demon display */}
      <div className={`text-center transition-all duration-300 ${sealed ? 'opacity-20 scale-90' : ''}`}>
        <div className="text-8xl mb-2 animate-pulse" style={{ filter: `drop-shadow(0 0 20px ${accent})` }}>👹</div>
        <div className="text-3xl font-black text-white px-6 py-3 rounded-2xl"
          style={{ background: `${accent}22`, border: `2px solid ${accent}66` }}>
          {current.word}
        </div>
        {current.reading !== current.word && (
          <div className="text-white/50 text-sm mt-1">{current.reading}</div>
        )}
      </div>
      {/* Seals (options) */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {options.map((opt, i) => (
          <button key={i} onClick={() => handleTap(opt)}
            className="p-5 rounded-2xl text-lg font-bold text-white transition-all duration-200 active:scale-95 min-h-[64px]"
            style={{
              background: flash && opt.correct ? '#22c55e44' : flash && !opt.correct ? '#ef444422' : `${accent}18`,
              border: `2px solid ${flash && opt.correct ? '#22c55e' : flash && !opt.correct ? '#ef4444' : accent + '44'}`,
              boxShadow: `0 0 12px ${accent}22`,
            }}>
            🧧 {opt.text}
          </button>
        ))}
      </div>
      <button onClick={onFinish} className="text-white/30 text-sm underline">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 5: CHỈ LỐI VONG HỒN (Chain: Kanji→Hira→Meaning)
// ══════════════════════════════════════════════════════════════
function Game5SoulPath({ vocab, onScore, onFinish, accent }) {
  const TOTAL = 6;
  const pool = useMemo(() => shuffle(vocab.filter(v => v.reading && v.reading !== v.word)).slice(0, Math.min(TOTAL + 2, vocab.length)), []);
  const [idx, setIdx] = useState(0);
  const [stage, setStage] = useState(0); // 0=pick reading, 1=pick meaning
  const [selected, setSelected] = useState([]);

  const current = pool[idx];
  const getOptions = (type) => {
    if (!current || !pool.length) return [];
    if (type === 'reading') {
      const wrong = shuffle(pool.filter((_, i) => i !== idx)).slice(0, 3);
      return shuffle([current, ...wrong].map(v => v.reading));
    }
    const wrong = shuffle(pool.filter((_, i) => i !== idx)).slice(0, 3);
    return shuffle([current, ...wrong].map(v => v.meaning));
  };

  const handleTap = (val) => {
    if (stage === 0) {
      const correct = val === current.reading;
      if (correct) { setStage(1); setSelected([current.word, val]); }
      else { onScore(0); }
    } else {
      const correct = val === current.meaning;
      if (correct) { onScore(1); }
      setSelected([]);
      setStage(0);
      if (idx + 1 >= TOTAL) onFinish();
      else setIdx(i => i + 1);
    }
  };

  if (!current) { onFinish(); return null; }

  const opts = getOptions(stage === 0 ? 'reading' : 'meaning');

  return (
    <div className="flex-1 flex flex-col items-center justify-center mt-16 px-4 gap-6">
      <p className="text-white/60 text-lg font-black">{idx + 1}/{TOTAL} — Nối: Kanji → Hiragana → Nghĩa</p>
      {/* Chain display */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <div className="px-4 py-2 rounded-xl font-black text-2xl text-white" style={{ background: `${accent}33`, border: `2px solid ${accent}` }}>
          {current.word}
        </div>
        <span className="text-white/30">→</span>
        <div className={`px-4 py-2 rounded-xl font-bold text-lg transition-all ${selected[1] ? 'text-white' : 'text-white/20'}`}
          style={{ background: selected[1] ? `${accent}22` : '#ffffff08', border: `2px solid ${selected[1] ? accent : '#ffffff15'}` }}>
          {selected[1] || '?'}
        </div>
        <span className="text-white/30">→</span>
        <div className="px-4 py-2 rounded-xl font-bold text-sm text-white/20" style={{ background: '#ffffff08', border: '2px solid #ffffff15' }}>
          ?
        </div>
      </div>
      <p className="text-white/60 font-bold text-sm">{stage === 0 ? 'Chọn cách đọc Hiragana:' : 'Chọn nghĩa tiếng Việt:'}</p>
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {opts.map((opt, i) => (
          <button key={i} onClick={() => handleTap(opt)}
            className="p-4 rounded-2xl text-base font-bold text-white active:scale-95 min-h-[60px]"
            style={{ background: `${accent}18`, border: `2px solid ${accent}33` }}>
            {opt}
          </button>
        ))}
      </div>
      <button onClick={onFinish} className="text-white/30 text-sm underline">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 6: CÁN CÂN SINH TỬ (Swipe True/False)
// ══════════════════════════════════════════════════════════════
function Game6Scales({ vocab, onScore, onFinish, accent }) {
  const TOTAL = 12;
  const [cards] = useState(() => {
    const items = [];
    for (let i = 0; i < TOTAL; i++) {
      const correct = shuffle(vocab)[0];
      const useCorrect = Math.random() > 0.4;
      const wrong = shuffle(vocab.filter(v => v.word !== correct.word))[0];
      items.push({ word: correct.word, meaning: useCorrect ? correct.meaning : (wrong?.meaning || correct.meaning), isCorrect: useCorrect });
    }
    return items;
  });
  const [idx, setIdx] = useState(0);
  const [swipeX, setSwipeX] = useState(0);
  const [startX, setStartX] = useState(null);
  const [flash, setFlash] = useState(null);
  const [done, setDone] = useState(false);

  const current = cards[idx];

  const decide = (right) => {
    if (done) return;
    const correct = right === current.isCorrect;
    setFlash(correct ? 'correct' : 'wrong');
    if (correct) onScore(1);
    setTimeout(() => {
      setFlash(null); setSwipeX(0); setStartX(null);
      if (idx + 1 >= TOTAL) { setDone(true); setTimeout(onFinish, 500); }
      else setIdx(i => i + 1);
    }, 400);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center mt-16 px-4 gap-6"
      onTouchStart={e => setStartX(e.touches[0].clientX)}
      onTouchMove={e => startX !== null && setSwipeX(e.touches[0].clientX - startX)}
      onTouchEnd={() => { if (Math.abs(swipeX) > 60) decide(swipeX > 0); else setSwipeX(0); setStartX(null); }}>
      <p className="text-white/60 text-lg font-black">{idx + 1}/{TOTAL} — Vuốt ← SAI &nbsp;|&nbsp; ĐúNG →</p>
      {/* Swipeable card */}
      <div className="relative w-full max-w-xs">
        <div className="absolute -left-2 top-1/2 -translate-y-1/2 text-red-400 font-black text-lg opacity-70">✗ SAI</div>
        <div className="absolute -right-2 top-1/2 -translate-y-1/2 text-green-400 font-black text-lg opacity-70">ĐÚNG ✓</div>
        <div
          className="relative p-8 rounded-3xl text-center transition-transform duration-100 select-none"
          style={{
            transform: `translateX(${swipeX}px) rotate(${swipeX * 0.05}deg)`,
            background: flash === 'correct' ? '#22c55e33' : flash === 'wrong' ? '#ef444433' : `${accent}18`,
            border: `2px solid ${flash === 'correct' ? '#22c55e' : flash === 'wrong' ? '#ef4444' : accent + '44'}`,
            boxShadow: `0 0 30px ${accent}22`,
          }}>
          <div className="text-4xl font-black text-white mb-3">{current?.word}</div>
          <div className="text-white/50 text-base mb-3">nghĩa là</div>
          <div className="text-xl font-bold text-white/80">{current?.meaning}</div>
        </div>
      </div>
      <div className="flex gap-4 mt-2">
        <MysticBtn onClick={() => decide(false)} accent="#ef4444" className="px-8 py-3">✗ SAI</MysticBtn>
        <MysticBtn onClick={() => decide(true)} accent="#22c55e" className="px-8 py-3">ĐÚNG ✓</MysticBtn>
      </div>
      <button onClick={onFinish} className="text-white/30 text-sm underline">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 7: MƯA SAO BĂNG (Tap falling meteors)
// ══════════════════════════════════════════════════════════════
function Game7Meteors({ vocab, onScore, onFinish, accent }) {
  const TOTAL = 10;
  const [round, setRound] = useState(1);
  const [meteors, setMeteors] = useState([]);
  const [target, setTarget] = useState(null);
  const [exploded, setExploded] = useState([]);
  const roundRef = useRef(0);
  const doneRef = useRef(false);
  const spawnTimerRef = useRef(null);

  const spawnRound = useCallback((idx) => {
    if (doneRef.current) return;
    const correct = shuffle(vocab)[0];
    const wrongs = shuffle(vocab.filter(v => v.word !== correct.word)).slice(0, 2);
    const all = shuffle([correct, ...wrongs]);
    setTarget(correct);
    setMeteors(all.map((v, i) => ({
      id: `${idx}-${i}`,
      word: v.word,
      correct: v.word === correct.word,
      x: 8 + i * 30,
      duration: Math.max(2, 4 - idx * 0.12),
    })));
    setExploded([]);
    setRound(idx + 1);
  }, [vocab]);

  useEffect(() => {
    spawnRound(0);
    return () => { doneRef.current = true; clearTimeout(spawnTimerRef.current); };
  }, []);

  const handleTap = (m) => {
    if (doneRef.current || exploded.includes(m.id)) return;
    setExploded(e => [...e, m.id]);
    if (m.correct) {
      onScore(1);
      roundRef.current++;
      if (roundRef.current >= TOTAL) { doneRef.current = true; setTimeout(onFinish, 700); return; }
      spawnTimerRef.current = setTimeout(() => spawnRound(roundRef.current), 900);
    }
  };

  return (
    <div className="flex-1 flex flex-col mt-16 relative overflow-hidden" style={{ minHeight: '60vh' }}>
      <p className="text-white/50 text-lg font-black text-center py-3">{round}/{TOTAL} — Bắn vỡ sao băng mang từ đúng!</p>
      {target && (
        <div className="text-center py-4">
          <span className="text-white/50 text-sm">Nghĩa cần tìm:</span>
          <div className="text-4xl font-black text-white mt-2" style={{ color: accent }}>{target.meaning}</div>
        </div>
      )}
      <div className="relative flex-1">
        {meteors.map(m => {
          const explode = exploded.includes(m.id);
          return (
            <button key={m.id} onClick={() => handleTap(m)}
              className={`absolute text-center font-black text-white rounded-2xl px-4 py-2 transition-all duration-200
                ${explode ? 'opacity-0 scale-150' : 'opacity-100 scale-100'}`}
              style={{
                left: `${m.x}%`,
                background: m.correct ? `${accent}44` : '#ffffff11',
                border: `2px solid ${m.correct ? accent : '#ffffff22'}`,
                boxShadow: m.correct ? `0 0 20px ${accent}66` : 'none',
                animation: explode ? 'none' : `fall ${m.duration}s linear forwards`,
                fontSize: '18px', fontWeight: 'bold',
              }}>
              ☄️ {m.word}
            </button>
          );
        })}
      </div>
      <style>{`
        @keyframes fall { from { top: -60px; } to { top: 105%; } }
      `}</style>
      <button onClick={onFinish} className="text-white/30 text-sm underline text-center py-3">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 8: TRẢM PHONG KIẾM (Swipe-slash)
// ══════════════════════════════════════════════════════════════
function Game8NinjaSword({ vocab, onScore, onFinish, accent }) {
  const TOTAL = 10;
  const [round, setRound] = useState(1);
  const [words, setWords] = useState([]);
  const [target, setTarget] = useState(null);
  const [slashed, setSlashed] = useState([]);
  const roundRef = useRef(0);
  const doneRef = useRef(false);

  const spawnRound = useCallback((idx) => {
    if (doneRef.current) return;
    const correct = shuffle(vocab)[0];
    const wrongs = shuffle(vocab.filter(v => v.word !== correct.word)).slice(0, 3);
    setTarget(correct);
    setWords(shuffle([correct, ...wrongs]).map((v, i) => ({
      id: `${idx}-${i}`,
      word: v.word,
      correct: v.word === correct.word,
      y: 20 + (i % 2) * 30,
      speed: 3 + Math.random() * 2,
    })));
    setSlashed([]);
    setRound(idx + 1);
  }, [vocab]);

  useEffect(() => {
    spawnRound(0);
    return () => { doneRef.current = true; };
  }, []);

  const handleSlash = (w) => {
    if (doneRef.current || slashed.includes(w.id)) return;
    setSlashed(s => [...s, w.id]);
    if (w.correct) {
      onScore(1);
      roundRef.current++;
      if (roundRef.current >= TOTAL) { doneRef.current = true; setTimeout(onFinish, 800); return; }
      setTimeout(() => spawnRound(roundRef.current), 900);
    }
  };

  return (
    <div className="flex-1 flex flex-col mt-16 relative overflow-hidden" style={{ minHeight: '60vh' }}>
      <p className="text-white/50 text-lg font-black text-center py-3">{round}/{TOTAL} — Vuốt chém từ vựng đúng!</p>
      {target && (
        <div className="text-center py-3">
          <span className="text-white/50 text-sm">Nghĩa cần chém:</span>
          <div className="text-2xl font-black mt-1" style={{ color: accent }}>{target.meaning}</div>
        </div>
      )}
      <div className="relative flex-1">
        {words.map((w, i) => {
          const isSlashed = slashed.includes(w.id);
          return (
            <button key={w.id} onClick={() => handleSlash(w)}
              className={`absolute font-black text-white rounded-xl px-4 py-2 transition-all duration-150 active:scale-75
                ${isSlashed ? 'opacity-0 scale-50' : 'opacity-100'}`}
              style={{
                top: `${w.y}%`,
                background: w.correct ? `${accent}33` : '#ffffff0d',
                border: `2px solid ${w.correct ? accent + '66' : '#ffffff15'}`,
                animation: isSlashed ? 'none' : `sword-fly-${i % 2 === 0 ? 'lr' : 'rl'} ${w.speed}s linear infinite`,
              }}>
              ⚔️ {w.word}
            </button>
          );
        })}
      </div>
      <style>{`
        @keyframes sword-fly-lr { from { left: -120px; } to { left: 110%; } }
        @keyframes sword-fly-rl { from { left: 110%; } to { left: -120px; } }
      `}</style>
      <button onClick={onFinish} className="text-white/30 text-sm underline text-center py-3">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 9: CUỘC CHIẾN ÁNH SÁNG (Whack-a-Demon)
// ══════════════════════════════════════════════════════════════
function Game9WhackDemon({ vocab, onScore, onFinish, accent }) {
  const TOTAL = 10;
  const [round, setRound] = useState(0);
  const [demons, setDemonsState] = useState([]);
  const [target, setTarget] = useState(null);
  const [hit, setHit] = useState(null);
  const roundRef = useRef(0);

  const spawnRound = useCallback((idx) => {
    const correct = shuffle(vocab)[0];
    const wrongs = shuffle(vocab.filter(v => v.word !== correct.word)).slice(0, 5);
    setTarget(correct);
    setDemonsState(shuffle([correct, ...wrongs]).map((v, i) => ({
      id: `${idx}-${i}`,
      meaning: v.meaning,
      correct: v.word === correct.word,
      visible: true,
      delay: Math.random() * 1.5,
    })));
    setHit(null);
  }, [vocab]);

  useEffect(() => { spawnRound(0); }, []);

  const handleWhack = (d) => {
    setHit(d.id);
    if (d.correct) {
      onScore(1);
      roundRef.current++;
      if (roundRef.current >= TOTAL) { setTimeout(onFinish, 800); return; }
      setTimeout(() => spawnRound(roundRef.current), 800);
    }
  };

  return (
    <div className="flex-1 flex flex-col mt-16 px-4 gap-4">
      <p className="text-white/50 text-sm text-center">{roundRef.current + 1}/{TOTAL} — Đập quỷ cầm biển nghĩa đúng!</p>
      {target && (
        <div className="text-center">
          <div className="text-2xl font-black text-white" style={{ textShadow: `0 0 20px ${accent}` }}>{target.word}</div>
          {target.reading !== target.word && <div className="text-white/40 text-sm">{target.reading}</div>}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        {demons.map(d => (
          <button key={d.id} onClick={() => handleWhack(d)}
            className={`aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-75
              ${hit === d.id ? (d.correct ? 'opacity-0 scale-75' : 'bg-red-900/40') : ''}`}
            style={{
              background: hit === d.id && d.correct ? '#22c55e33' : `${accent}15`,
              border: `2px solid ${hit === d.id && d.correct ? '#22c55e' : accent + '33'}`,
              animation: `pop-up ${d.delay + 0.5}s ease-out`,
            }}>
            <span className="text-5xl">👹</span>
            <span className="text-white text-base font-bold text-center px-2 leading-tight">{d.meaning}</span>
          </button>
        ))}
      </div>
      <style>{`@keyframes pop-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
      <button onClick={onFinish} className="text-white/30 text-sm underline text-center mt-2">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 10: CỬA NGỤC TỬ THẦN (Dungeon Doors)
// ══════════════════════════════════════════════════════════════
function Game10DungeonDoors({ vocab, onScore, onFinish, accent }) {
  const TOTAL = 8;
  const [round, setRound] = useState(0);
  const [doors, setDoors] = useState([]);
  const [target, setTarget] = useState(null);
  const [opened, setOpened] = useState(null);
  const roundRef = useRef(0);

  const spawnRound = useCallback((idx) => {
    const correct = shuffle(vocab)[0];
    const wrongs = shuffle(vocab.filter(v => v.word !== correct.word)).slice(0, 2);
    setTarget(correct);
    setDoors(shuffle([correct, ...wrongs]).map((v, i) => ({
      id: i,
      meaning: v.meaning,
      correct: v.word === correct.word,
    })));
    setOpened(null);
  }, [vocab]);

  useEffect(() => { spawnRound(0); }, []);

  const handleDoor = (d) => {
    setOpened(d.id);
    if (d.correct) {
      onScore(1);
      roundRef.current++;
      if (roundRef.current >= TOTAL) { setTimeout(onFinish, 800); return; }
      setTimeout(() => spawnRound(roundRef.current), 1000);
    } else {
      setTimeout(() => spawnRound(roundRef.current), 1000);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center mt-16 px-4 gap-8">
      <p className="text-white/50 text-sm">{roundRef.current + 1}/{TOTAL} — Chọn cửa đúng để thoát!</p>
      {target && (
        <div className="text-center">
          <div className="text-5xl mb-2">🏃</div>
          <div className="text-3xl font-black text-white" style={{ textShadow: `0 0 20px ${accent}` }}>{target.word}</div>
          {target.reading !== target.word && <div className="text-white/40">{target.reading}</div>}
        </div>
      )}
      <div className="flex gap-4 w-full max-w-sm">
        {doors.map(d => {
          const isOpen = opened === d.id;
          return (
            <button key={d.id} onClick={() => !opened && handleDoor(d)}
              className={`flex-1 aspect-[2/3] rounded-2xl flex flex-col items-center justify-center gap-2 transition-all duration-300
                ${isOpen ? (d.correct ? 'scale-105 bg-green-500/30 border-green-400' : 'scale-90 bg-red-500/20 border-red-400') : 'active:scale-95'}`}
              style={{
                background: isOpen ? undefined : `${accent}15`,
                border: `3px solid ${isOpen ? undefined : accent + '44'}`,
                boxShadow: isOpen && d.correct ? `0 0 30px #22c55e66` : 'none',
              }}>
              <span className="text-5xl">{isOpen ? (d.correct ? '✅' : '💀') : '🚪'}</span>
              <span className="text-white text-base font-bold text-center px-2">{d.meaning}</span>
            </button>
          );
        })}
      </div>
      <button onClick={onFinish} className="text-white/30 text-sm underline">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 11: GIẢI MÃ ĐÁ CỔ (Rune Unscramble - tap to order)
// ══════════════════════════════════════════════════════════════
function Game11RuneUnscramble({ vocab, onScore, onFinish, accent }) {
  const TOTAL = 6;
  const pool = useMemo(() => shuffle(vocab.filter(v => v.reading && v.reading.length >= 2)).slice(0, TOTAL), []);
  const [idx, setIdx] = useState(0);
  const [tapped, setTapped] = useState([]);
  const [flash, setFlash] = useState(null);

  const current = pool[idx];
  const scrambled = useMemo(() => current ? shuffle([...current.reading]) : [], [current]);

  const handleTap = (char, charIdx) => {
    if (tapped.some(t => t.idx === charIdx)) return;
    const newTapped = [...tapped, { char, idx: charIdx }];
    setTapped(newTapped);
    if (newTapped.length === scrambled.length) {
      const formed = newTapped.map(t => t.char).join('');
      const correct = formed === current.reading;
      setFlash(correct ? 'correct' : 'wrong');
      if (correct) onScore(1);
      setTimeout(() => {
        setFlash(null); setTapped([]);
        if (idx + 1 >= TOTAL) onFinish();
        else setIdx(i => i + 1);
      }, 800);
    }
  };

  if (!current) return null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center mt-16 px-4 gap-6">
      <p className="text-white/60 text-lg font-black">{idx + 1}/{TOTAL} — Xếp ký tự Hiragana theo đúng thứ tự</p>
      <div className="text-center">
        <div className="text-white/50 text-xs mb-1">Nghĩa:</div>
        <div className="text-2xl font-black text-white" style={{ color: accent }}>{current.meaning}</div>
        <div className="text-white/40 text-sm">(Kanji: {current.word})</div>
      </div>
      {/* Answer slots */}
      <div className="flex gap-2 justify-center">
        {Array.from({ length: scrambled.length }, (_, i) => (
          <div key={i} className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white"
            style={{
              background: tapped[i] ? (flash === 'correct' ? '#22c55e44' : flash === 'wrong' ? '#ef444444' : `${accent}33`) : '#ffffff08',
              border: `2px solid ${tapped[i] ? (flash === 'correct' ? '#22c55e' : flash === 'wrong' ? '#ef4444' : accent) : '#ffffff15'}`,
            }}>
            {tapped[i]?.char || ''}
          </div>
        ))}
      </div>
      {/* Stone tiles */}
      <div className="flex flex-wrap gap-3 justify-center max-w-xs">
        {scrambled.map((char, i) => {
          const used = tapped.some(t => t.idx === i);
          return (
            <button key={i} onClick={() => !used && handleTap(char, i)}
              className={`w-14 h-14 rounded-2xl text-2xl font-black text-white transition-all duration-200 active:scale-90
                ${used ? 'opacity-20' : ''}`}
              style={{
                background: used ? '#ffffff08' : `${accent}22`,
                border: `2px solid ${used ? '#ffffff10' : accent + '77'}`,
                boxShadow: used ? 'none' : `0 0 12px ${accent}44`,
              }}>
              {char}
            </button>
          );
        })}
      </div>
      <button onClick={() => setTapped([])} className="text-white/30 text-xs underline">Xóa</button>
      <button onClick={onFinish} className="text-white/30 text-sm underline">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 12: CHÉN THÁNH ĐỘC DƯỢC (Odd One Out)
// ══════════════════════════════════════════════════════════════
function Game12PoisonChalice({ vocab, onScore, onFinish, accent }) {
  const TOTAL = 8;
  const [round, setRound] = useState(0);
  const [cups, setCups] = useState([]);
  const [flash, setFlash] = useState(null);
  const roundRef = useRef(0);

  const makeRound = useCallback(() => {
    const allTags = [...new Set(vocab.map(v => v.tag || 'Chung'))];
    if (allTags.length < 2) {
      // Fallback: random odd one out by meaning length
      const picks = shuffle(vocab).slice(0, 4);
      const oddIdx = Math.floor(Math.random() * 4);
      setCups(picks.map((v, i) => ({ word: v.word, tag: i === oddIdx ? 'ODD' : 'SAME', isOdd: i === oddIdx })));
      return;
    }
    const mainTag = allTags[Math.floor(Math.random() * allTags.length)];
    const sameTag = shuffle(vocab.filter(v => (v.tag || 'Chung') === mainTag)).slice(0, 3);
    const otherTags = allTags.filter(t => t !== mainTag);
    const oddTag = otherTags[Math.floor(Math.random() * otherTags.length)];
    const oddWord = shuffle(vocab.filter(v => (v.tag || 'Chung') === oddTag))[0];
    if (sameTag.length < 3 || !oddWord) { makeRound(); return; }
    setCups(shuffle([...sameTag.map(v => ({ word: v.word, tag: mainTag, isOdd: false })), { word: oddWord.word, tag: oddTag, isOdd: true }]));
  }, [vocab]);

  useEffect(() => { makeRound(); }, []);

  const handleTap = (cup) => {
    setFlash(cup.isOdd ? 'correct' : 'wrong');
    if (cup.isOdd) onScore(1);
    setTimeout(() => {
      setFlash(null);
      roundRef.current++;
      if (roundRef.current >= TOTAL) { onFinish(); return; }
      makeRound();
    }, 800);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center mt-16 px-4 gap-8">
      <p className="text-white/50 text-sm">{roundRef.current + 1}/{TOTAL} — Tìm từ không cùng chủ đề (độc dược!)</p>
      <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
        {cups.map((cup, i) => (
          <button key={i} onClick={() => !flash && handleTap(cup)}
            className={`aspect-square rounded-3xl flex flex-col items-center justify-center gap-2 transition-all duration-300 active:scale-95
              ${flash ? (cup.isOdd ? 'bg-green-500/30 border-green-400 scale-105' : 'bg-red-500/10 border-red-900/50 opacity-50') : ''}`}
            style={{
              background: flash ? undefined : `${accent}15`,
              border: `2px solid ${flash ? undefined : accent + '33'}`,
              boxShadow: flash && cup.isOdd ? `0 0 30px #22c55e66` : 'none',
            }}>
            <span className="text-5xl">{flash && cup.isOdd ? '🧪' : '🏺'}</span>
            <span className="text-white font-black text-xl text-center px-2">{cup.word}</span>
            {flash && <span className="text-xs text-white/50">{cup.tag}</span>}
          </button>
        ))}
      </div>
      <button onClick={onFinish} className="text-white/30 text-sm underline">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 13: ĐIỀN CHỮ TẾ ĐÀN (Fill in the blank)
// ══════════════════════════════════════════════════════════════
function Game13MissingStone({ vocab, onScore, onFinish, accent }) {
  const TOTAL = 8;
  const pool = useMemo(() => shuffle(vocab.filter(v => v.reading && v.reading.length >= 2)).slice(0, TOTAL + 3), []);
  const [idx, setIdx] = useState(0);
  const [flash, setFlash] = useState(null);
  const [blankIdx, setBlankIdx] = useState(() => {
    const v = pool[0];
    return v ? Math.floor(Math.random() * v.reading.length) : 0;
  });

  const current = pool[idx];
  if (!current) { onFinish(); return null; }

  const correctChar = current.reading[blankIdx] || '';
  const wrongChars = shuffle(
    'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'
      .split('')
      .filter(c => c !== correctChar)
  ).slice(0, 3);
  const options = shuffle([correctChar, ...wrongChars]);

  const handleTap = (char) => {
    if (flash) return;
    const correct = char === correctChar;
    setFlash(correct ? 'correct' : 'wrong');
    if (correct) onScore(1);
    setTimeout(() => {
      const nextIdx = idx + 1;
      if (nextIdx >= TOTAL || nextIdx >= pool.length) { onFinish(); return; }
      const nextV = pool[nextIdx];
      setBlankIdx(Math.floor(Math.random() * nextV.reading.length));
      setIdx(nextIdx);
      setFlash(null);
    }, 600);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center mt-16 px-4 gap-6">
      <p className="text-white/60 text-lg font-black">{idx + 1}/{TOTAL} — Điền ký tự còn thiếu vào chỗ trống</p>
      <div className="text-center">
        <div className="text-white/50 text-sm">Nghĩa:</div>
        <div className="text-xl font-black mt-1" style={{ color: accent }}>{current.meaning}</div>
      </div>
      {/* Word display with blank */}
      <div className="flex gap-2 justify-center">
        {current.reading.split('').map((c, i) => (
          <div key={i} className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-black"
            style={{
              background: i === blankIdx ? (flash === 'correct' ? '#22c55e44' : flash === 'wrong' ? '#ef444444' : `${accent}44`) : '#ffffff08',
              border: `2px solid ${i === blankIdx ? (flash === 'correct' ? '#22c55e' : flash === 'wrong' ? '#ef4444' : accent) : '#ffffff15'}`,
              color: i === blankIdx ? 'white' : 'rgba(255,255,255,0.4)',
            }}>
            {i === blankIdx ? (flash ? c : '?') : c}
          </div>
        ))}
      </div>
      <div className="text-white/40 text-sm">{current.word}</div>
      {/* Stone options */}
      <div className="flex gap-3">
        {options.map((char, i) => (
          <button key={i} onClick={() => handleTap(char)}
            className="w-16 h-16 rounded-2xl text-3xl font-black text-white active:scale-90 transition-all"
            style={{ background: `${accent}22`, border: `2px solid ${accent}55`, boxShadow: `0 0 10px ${accent}33` }}>
            {char}
          </button>
        ))}
      </div>
      <button onClick={onFinish} className="text-white/30 text-sm underline">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 14: LƯỚI PHÉP THUẬT (Word Search 4×4)
// ══════════════════════════════════════════════════════════════
function Game14WordGrid({ vocab, onScore, onFinish, accent }) {
  const WORDS_TO_FIND = 3;
  const filteredVocab = useMemo(() => vocab.filter(v => v.reading && v.reading.length <= 4 && v.reading.length >= 2), [vocab]);
  const [targets] = useState(() => shuffle(filteredVocab).slice(0, WORDS_TO_FIND));
  const GRID_SIZE = 5;

  const [grid, placements] = useMemo(() => {
    const g = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(''));
    const placed = [];
    const kana = 'あいうえおかきくけこさしすせそたちつてとなにぬねもやゆよらりるれろ';

    targets.forEach(t => {
      const word = t.reading;
      let done = false;
      for (let attempt = 0; attempt < 30 && !done; attempt++) {
        const horiz = Math.random() > 0.5;
        const r = Math.floor(Math.random() * GRID_SIZE);
        const c = Math.floor(Math.random() * (GRID_SIZE - word.length + 1));
        let ok = true;
        if (horiz) {
          for (let i = 0; i < word.length; i++) if (g[r][c + i] && g[r][c + i] !== word[i]) { ok = false; break; }
          if (ok) { for (let i = 0; i < word.length; i++) g[r][c + i] = word[i]; placed.push({ word: t.reading, cells: word.split('').map((_, i) => [r, c + i]) }); done = true; }
        } else {
          const maxR = GRID_SIZE - word.length;
          const rr = Math.floor(Math.random() * (maxR + 1));
          const cc = Math.floor(Math.random() * GRID_SIZE);
          for (let i = 0; i < word.length; i++) if (g[rr + i][cc] && g[rr + i][cc] !== word[i]) { ok = false; break; }
          if (ok) { for (let i = 0; i < word.length; i++) g[rr + i][cc] = word[i]; placed.push({ word: t.reading, cells: word.split('').map((_, i) => [rr + i, cc]) }); done = true; }
        }
      }
    });
    for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) if (!g[r][c]) g[r][c] = kana[Math.floor(Math.random() * kana.length)];
    return [g, placed];
  }, [targets]);

  const [found, setFound] = useState([]);
  const [selecting, setSelecting] = useState([]);
  const [foundCells, setFoundCells] = useState([]);

  const getCellKey = (r, c) => `${r}-${c}`;

  const handleCellTap = (r, c) => {
    const key = getCellKey(r, c);
    const newSel = selecting.includes(key) ? selecting.filter(k => k !== key) : [...selecting, key];
    setSelecting(newSel);
    // Check if any placement matches
    for (const p of placements) {
      if (found.includes(p.word)) continue;
      const cellKeys = p.cells.map(([pr, pc]) => getCellKey(pr, pc));
      if (cellKeys.every(k => newSel.includes(k)) && newSel.length === cellKeys.length) {
        onScore(1);
        setFound(f => {
          const nf = [...f, p.word];
          if (nf.length >= WORDS_TO_FIND) setTimeout(onFinish, 800);
          return nf;
        });
        setFoundCells(fc => [...fc, ...cellKeys]);
        setSelecting([]);
        return;
      }
    }
    // Auto-clear wrong selection after 5 taps
    if (newSel.length >= 5) setSelecting([]);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center mt-16 px-4 gap-4">
      <p className="text-white/50 text-sm text-center">Tìm {WORDS_TO_FIND} từ tiếng Nhật trong lưới — chạm từng ô</p>
      {/* Targets */}
      <div className="flex gap-2 flex-wrap justify-center">
        {targets.map(t => (
          <span key={t.word} className={`px-3 py-1 rounded-xl text-sm font-bold transition-all ${found.includes(t.reading) ? 'line-through opacity-30' : 'text-white'}`}
            style={{ background: found.includes(t.reading) ? '#ffffff10' : `${accent}22`, border: `1px solid ${found.includes(t.reading) ? '#ffffff15' : accent + '55'}` }}>
            {t.meaning} ({found.includes(t.reading) ? '✓' : '?'})
          </span>
        ))}
      </div>
      {/* Grid */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}>
        {grid.map((row, r) => row.map((cell, c) => {
          const key = getCellKey(r, c);
          const isSel = selecting.includes(key);
          const isFound = foundCells.includes(key);
          return (
            <button key={key} onClick={() => handleCellTap(r, c)}
              className="w-14 h-14 rounded-xl text-xl font-black text-white transition-all duration-150 active:scale-90"
              style={{
                background: isFound ? `${accent}55` : isSel ? `${accent}33` : '#ffffff08',
                border: `2px solid ${isFound ? accent : isSel ? accent + '88' : '#ffffff10'}`,
                boxShadow: isFound ? `0 0 12px ${accent}66` : 'none',
              }}>
              {cell}
            </button>
          );
        }))}
      </div>
      <button onClick={() => setSelecting([])} className="text-white/30 text-xs underline">Xóa chọn</button>
      <button onClick={onFinish} className="text-white/30 text-sm underline">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 15: GHÉP MẢNH ẤN CHÚ (Match word halves)
// ══════════════════════════════════════════════════════════════
function Game15AmuletPuzzle({ vocab, onScore, onFinish, accent }) {
  const PAIRS = 5;
  const pool = useMemo(() => shuffle(vocab.filter(v => v.reading && v.reading.length >= 2)).slice(0, PAIRS), []);
  const [selectedLeft, setSelectedLeft] = useState(null);
  const [matched, setMatched] = useState([]);
  const [flash, setFlash] = useState({});
  const [target] = useState(() => {
    const t = shuffle(pool)[0];
    return t;
  });

  const lefts = useMemo(() => pool.map(p => ({ id: p.word, text: p.reading.slice(0, Math.ceil(p.reading.length / 2)), word: p.word })), [pool]);
  const rights = useMemo(() => shuffle(pool.map(p => ({ id: p.word, text: p.reading.slice(Math.ceil(p.reading.length / 2)), word: p.word, meaning: p.meaning }))), [pool]);

  const handleLeft = (l) => setSelectedLeft(l.id === selectedLeft ? null : l.id);

  const handleRight = (r) => {
    if (!selectedLeft) return;
    const correct = selectedLeft === r.id;
    setFlash(f => ({ ...f, [r.id]: correct ? 'correct' : 'wrong' }));
    setTimeout(() => setFlash(f => { const n = { ...f }; delete n[r.id]; return n; }), 500);
    if (correct) {
      onScore(1);
      setMatched(m => {
        const nm = [...m, r.id];
        if (nm.length >= PAIRS) setTimeout(onFinish, 600);
        return nm;
      });
    }
    setSelectedLeft(null);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center mt-16 px-4 gap-4">
      <p className="text-white/50 text-sm text-center">Ghép nửa trái + nửa phải tạo thành từ hoàn chỉnh</p>
      <div className="w-full max-w-sm flex gap-4">
        <div className="flex-1 flex flex-col gap-2">
          <div className="text-white/30 text-xs text-center mb-1">Phần đầu</div>
          {lefts.map(l => {
            const isM = matched.includes(l.id);
            return (
              <button key={l.id} onClick={() => !isM && handleLeft(l)}
                className={`p-3 rounded-xl text-center font-black text-lg transition-all ${isM ? 'opacity-20' : selectedLeft === l.id ? 'scale-105' : ''} text-white`}
                style={{
                  background: isM ? '#ffffff05' : selectedLeft === l.id ? accent + '55' : `${accent}15`,
                  border: `2px solid ${isM ? '#ffffff05' : selectedLeft === l.id ? accent : accent + '33'}`,
                  boxShadow: selectedLeft === l.id ? `0 0 15px ${accent}66` : 'none',
                }}>
                {l.text}
              </button>
            );
          })}
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <div className="text-white/30 text-xs text-center mb-1">Phần đuôi</div>
          {rights.map(r => {
            const isM = matched.includes(r.id);
            const f = flash[r.id];
            return (
              <button key={r.id} onClick={() => !isM && handleRight(r)}
                className={`p-3 rounded-xl text-center font-black text-lg transition-all ${isM ? 'opacity-20' : ''} text-white`}
                style={{
                  background: isM ? '#ffffff05' : f === 'correct' ? '#22c55e44' : f === 'wrong' ? '#ef444433' : `${accent}15`,
                  border: `2px solid ${isM ? '#ffffff05' : f === 'correct' ? '#22c55e' : f === 'wrong' ? '#ef4444' : accent + '33'}`,
                }}>
                {r.text}
                {isM && <div className="text-xs text-white/30 font-normal">{r.meaning}</div>}
              </button>
            );
          })}
        </div>
      </div>
      <button onClick={onFinish} className="text-white/30 text-sm underline mt-2">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 16: TIẾNG VỌNG HƯ KHÔNG (Audio → Meaning)
// ══════════════════════════════════════════════════════════════
function Game16EchoAudio({ vocab, onScore, onFinish, accent }) {
  const TOTAL = 10;
  const pool = useMemo(() => shuffle(vocab).slice(0, TOTAL + 3), []);
  const [idx, setIdx] = useState(0);
  const [flash, setFlash] = useState(null);
  const speak = useTTS();

  const current = pool[idx];
  const options = useMemo(() => {
    if (!current) return [];
    const wrong = shuffle(pool.filter((_, i) => i !== idx)).slice(0, 3);
    return shuffle([current, ...wrong].map(v => ({ text: v.meaning, correct: v === current })));
  }, [idx, pool]);

  const playAudio = () => speak(current.word);

  useEffect(() => { if (current) setTimeout(playAudio, 300); }, [idx, current]);

  const handleTap = (opt) => {
    setFlash(opt.correct ? 'correct' : 'wrong');
    if (opt.correct) onScore(1);
    setTimeout(() => {
      setFlash(null);
      if (idx + 1 >= TOTAL) onFinish();
      else setIdx(i => i + 1);
    }, 600);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center mt-16 px-4 gap-8" style={{ background: 'transparent' }}>
      <p className="text-white/60 text-lg font-black">{idx + 1}/{TOTAL} — Nghe âm thanh, chọn nghĩa đúng</p>
      <button onClick={playAudio}
        className="w-40 h-40 rounded-full flex flex-col items-center justify-center gap-2 transition-all active:scale-95"
        style={{ background: `radial-gradient(circle, ${accent}44, ${accent}11)`, border: `2px solid ${accent}66`, boxShadow: `0 0 40px ${accent}44` }}>
        <span className="text-6xl animate-pulse">🔊</span>
        <span className="text-white/50 text-sm">Chạm để nghe</span>
      </button>
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {options.map((opt, i) => (
          <button key={i} onClick={() => !flash && handleTap(opt)}
            className="p-4 rounded-2xl text-base font-bold text-white transition-all active:scale-95"
            style={{
              background: flash && opt.correct ? '#22c55e44' : flash && !opt.correct ? '#ef444422' : `${accent}15`,
              border: `2px solid ${flash && opt.correct ? '#22c55e' : flash && !opt.correct ? '#ef444466' : accent + '33'}`,
            }}>
            {opt.text}
          </button>
        ))}
      </div>
      <button onClick={onFinish} className="text-white/30 text-sm underline">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 17: BẮT TINH LINH ÂM (Catch fairy when heard)
// ══════════════════════════════════════════════════════════════
function Game17FairyVoice({ vocab, onScore, onFinish, accent }) {
  const TOTAL = 8;
  const pool = useMemo(() => shuffle(vocab).slice(0, 4), []);
  const [round, setRound] = useState(0);
  const [target, setTarget] = useState(null);
  const [caught, setCaught] = useState(null);
  const [positions] = useState(() => pool.map((_, i) => ({ x: 10 + i * 22, y: 20 + Math.random() * 40 })));
  const speak = useTTS();
  const roundRef = useRef(0);

  const playRound = useCallback((rnd) => {
    const t = pool[rnd % pool.length];
    setTarget(t);
    setCaught(null);
    setTimeout(() => speak(t.word), 500);
  }, [pool, speak]);

  useEffect(() => { playRound(0); }, []);

  const handleCatch = (p) => {
    if (!target || caught) return;
    const correct = p.word === target.word;
    setCaught(p.word);
    if (correct) onScore(1);
    setTimeout(() => {
      roundRef.current++;
      if (roundRef.current >= TOTAL) { onFinish(); return; }
      setRound(r => r + 1);
      playRound(roundRef.current);
    }, 800);
  };

  return (
    <div className="flex-1 flex flex-col mt-16 px-4 gap-4">
      <p className="text-white/50 text-sm text-center">{round + 1}/{TOTAL} — Bắt tinh linh khi nghe tên nó!</p>
      <button onClick={() => target && speak(target.word)}
        className="mx-auto px-4 py-2 rounded-xl text-sm text-white/50 active:scale-95"
        style={{ background: `${accent}22`, border: `1px solid ${accent}44` }}>
        🔊 Nghe lại
      </button>
      <div className="relative flex-1" style={{ minHeight: '300px' }}>
        {pool.map((p, i) => {
          const isCaught = caught === p.word;
          const isTarget = target?.word === p.word;
          return (
            <button key={p.word} onClick={() => handleCatch(p)}
              className={`absolute rounded-2xl px-4 py-3 flex flex-col items-center gap-1 transition-all duration-300 active:scale-90
                ${isCaught ? (isTarget ? 'scale-125 opacity-0' : 'opacity-20 scale-75') : ''}`}
              style={{
                left: `${positions[i].x}%`,
                top: `${positions[i].y}%`,
                background: `${accent}22`,
                border: `2px solid ${accent}55`,
                boxShadow: `0 0 15px ${accent}44`,
                animation: isCaught ? 'none' : `fairy-float ${2 + i * 0.7}s ease-in-out infinite alternate`,
              }}>
              <span className="text-3xl">✨</span>
              <span className="text-white font-black text-base">{p.word}</span>
            </button>
          );
        })}
      </div>
      <style>{`@keyframes fairy-float { from { transform: translateY(-8px) rotate(-3deg); } to { transform: translateY(8px) rotate(3deg); } }`}</style>
      <button onClick={onFinish} className="text-white/30 text-sm underline text-center pb-4">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 18: THẨM ÂM PHÁN XÉT (Audio True/False, 3s)
// ══════════════════════════════════════════════════════════════
function Game18AudioJudge({ vocab, onScore, onFinish, accent }) {
  const TOTAL = 12;
  const speak = useTTS();
  const [idx, setIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(3);
  const [flash, setFlash] = useState(null);
  const timerRef = useRef(null);
  const answeredRef = useRef(false);
  const idxRef = useRef(0);

  const [cards] = useState(() => {
    const arr = [];
    for (let i = 0; i < TOTAL; i++) {
      const v = shuffle(vocab)[0];
      const useCorrect = Math.random() > 0.4;
      const spoken = useCorrect ? v : shuffle(vocab.filter(x => x.word !== v.word))[0] || v;
      arr.push({ shown: v, spoken, isCorrect: useCorrect });
    }
    return arr;
  });

  const advance = useCallback((correct, gaveScore) => {
    clearInterval(timerRef.current);
    setFlash(correct ? 'correct' : 'wrong');
    if (gaveScore) onScore(1);
    setTimeout(() => {
      setFlash(null);
      const next = idxRef.current + 1;
      if (next >= TOTAL) { onFinish(); return; }
      idxRef.current = next;
      setIdx(next);
    }, 700);
  }, []);

  useEffect(() => {
    const current = cards[idxRef.current];
    if (!current) return;
    answeredRef.current = false;
    setTimeLeft(3);
    speak(current.spoken.word);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          if (!answeredRef.current) { answeredRef.current = true; advance(false, false); }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [idx]);

  const handleDecide = (answer) => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    const current = cards[idxRef.current];
    const correct = answer === current.isCorrect;
    advance(correct, correct);
  };

  const current = cards[idx];
  if (!current) return null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center mt-16 px-4 gap-8">
      <p className="text-white/60 text-lg font-black">{idx + 1}/{TOTAL} — Nghe âm, phán ĐÚNG/SAI trong 3 giây</p>
      {/* Timer ring */}
      <div className="relative w-20 h-20">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="#ffffff11" strokeWidth="6" />
          <circle cx="40" cy="40" r="34" fill="none" stroke={accent} strokeWidth="6"
            strokeDasharray={`${2 * Math.PI * 34}`}
            strokeDashoffset={`${2 * Math.PI * 34 * (1 - timeLeft / 3)}`}
            style={{ transition: 'stroke-dashoffset 1s linear' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-2xl font-black text-white">{timeLeft}</div>
      </div>
      {/* Shown meaning */}
      <div className="text-center p-6 rounded-3xl w-full max-w-sm"
        style={{ background: flash === 'correct' ? '#22c55e22' : flash === 'wrong' ? '#ef444422' : '#ffffff08', border: `2px solid ${flash === 'correct' ? '#22c55e' : flash === 'wrong' ? '#ef4444' : '#ffffff15'}` }}>
        <div className="text-white/50 text-xs mb-2">Nghĩa hiển thị:</div>
        <div className="text-2xl font-black text-white">{current.shown.meaning}</div>
        <button onClick={() => speak(current.spoken.word)} className="mt-3 text-white/40 text-sm active:scale-95">🔊 Nghe lại</button>
      </div>
      <div className="flex gap-4 w-full max-w-xs">
        <button onClick={() => handleDecide(true)}
          className="flex-1 py-6 rounded-2xl text-white font-black text-4xl active:scale-95 transition-all"
          style={{ background: '#22c55e33', border: '2px solid #22c55e66', boxShadow: '0 0 20px #22c55e33' }}>
          ⭕
        </button>
        <button onClick={() => handleDecide(false)}
          className="flex-1 py-6 rounded-2xl text-white font-black text-4xl active:scale-95 transition-all"
          style={{ background: '#ef444433', border: '2px solid #ef444466', boxShadow: '0 0 20px #ef444433' }}>
          ❌
        </button>
      </div>
      <button onClick={onFinish} className="text-white/30 text-sm underline">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 19: KHÚC HÁT NHÂN NGƯ (Remember sequence of 3)
// ══════════════════════════════════════════════════════════════
function Game19SirenSequence({ vocab, onScore, onFinish, accent }) {
  const TOTAL = 6;
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState('listen'); // 'listen' | 'answer'
  const [sequence, setSequence] = useState([]);
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState([]);
  const speak = useTTS();
  const roundRef = useRef(0);

  const startRound = useCallback((rnd) => {
    const seq = shuffle(vocab).slice(0, 3);
    setSequence(seq);
    const others = shuffle(vocab.filter(v => !seq.find(s => s.word === v.word))).slice(0, 3);
    setOptions(shuffle([...seq.map(v => ({ meaning: v.meaning, word: v.word })), ...others.map(v => ({ meaning: v.meaning, word: v.word }))]));
    setSelected([]);
    setPhase('listen');
    // TTS sequence
    seq.forEach((v, i) => setTimeout(() => speak(v.word), 800 + i * 1200));
    setTimeout(() => setPhase('answer'), 800 + seq.length * 1200 + 500);
  }, [vocab, speak]);

  useEffect(() => { startRound(0); }, []);

  const handleSelect = (opt) => {
    if (selected.find(s => s.word === opt.word)) return;
    const newSel = [...selected, opt];
    setSelected(newSel);
    if (newSel.length === 3) {
      const correct = newSel.every((s, i) => s.word === sequence[i].word);
      if (correct) onScore(1);
      roundRef.current++;
      if (roundRef.current >= TOTAL) { setTimeout(onFinish, 800); return; }
      setTimeout(() => { setRound(r => r + 1); startRound(roundRef.current); }, 1000);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center mt-16 px-4 gap-6">
      <p className="text-white/50 text-sm">{round + 1}/{TOTAL} — Nhớ thứ tự 3 từ vừa nghe</p>
      {phase === 'listen' ? (
        <div className="text-center flex flex-col items-center gap-4">
          <div className="text-7xl animate-pulse" style={{ filter: `drop-shadow(0 0 20px ${accent})` }}>🧜</div>
          <p className="text-white/60 font-bold">Đang phát âm… hãy lắng nghe</p>
          <div className="flex gap-3 mt-2">
            {sequence.map((v, i) => (
              <div key={i} className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black text-white/30"
                style={{ background: '#ffffff08', border: '2px solid #ffffff10' }}>
                {i + 1}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <p className="text-white/60 text-sm font-bold">Chọn 3 nghĩa theo đúng thứ tự đã nghe:</p>
          <div className="flex gap-2 justify-center mb-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-16 h-16 rounded-xl flex items-center justify-center text-xs font-bold text-center p-1"
                style={{ background: selected[i] ? `${accent}33` : '#ffffff08', border: `2px solid ${selected[i] ? accent : '#ffffff15'}`, color: 'white' }}>
                {selected[i]?.meaning || `${i + 1}`}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
            {options.map((opt, i) => {
              const used = selected.find(s => s.word === opt.word);
              return (
                <button key={i} onClick={() => !used && handleSelect(opt)}
                  className={`p-3 rounded-2xl text-sm font-bold text-white transition-all active:scale-95 ${used ? 'opacity-30' : ''}`}
                  style={{ background: `${accent}15`, border: `2px solid ${used ? '#ffffff10' : accent + '33'}` }}>
                  {opt.meaning}
                </button>
              );
            })}
          </div>
          <button onClick={() => setSelected(s => s.slice(0, -1))} className="text-white/30 text-xs underline">← Xóa chọn cuối</button>
        </>
      )}
      <button onClick={onFinish} className="text-white/30 text-sm underline">Bỏ qua</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME 20: LEO THÁP QUỶ (Sudden Death Endless)
// ══════════════════════════════════════════════════════════════
function Game20TowerAbyss({ vocab, onScore, onFinish, accent }) {
  const [floor, setFloor] = useState(1);
  const [q, setQ] = useState(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const [dead, setDead] = useState(false);
  const [flash, setFlash] = useState(null);
  const timerRef = useRef(null);
  const floorRef = useRef(1);
  const deadRef = useRef(false);
  const flashRef = useRef(null);

  const genQ = useCallback((f) => {
    if (deadRef.current) return;
    const v = shuffle(vocab)[0];
    const wrong = shuffle(vocab.filter(x => x.word !== v.word)).slice(0, 3);
    const type = Math.random() > 0.5 ? 'word2mean' : 'mean2word';
    const timeLimit = Math.max(3, 10 - Math.floor(f / 5));
    setQ({
      question: type === 'word2mean' ? v.word : v.meaning,
      hint: type === 'word2mean' ? 'Nghĩa là gì?' : 'Từ vựng nào?',
      correct: type === 'word2mean' ? v.meaning : v.word,
      options: shuffle([type === 'word2mean' ? v.meaning : v.word, ...wrong.map(w => type === 'word2mean' ? w.meaning : w.word)]),
    });
    flashRef.current = null;
    setFlash(null);
    setTimeLeft(timeLimit);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          if (!deadRef.current) { deadRef.current = true; setDead(true); }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }, [vocab]);

  useEffect(() => {
    genQ(1);
    return () => clearInterval(timerRef.current);
  }, []);

  const handleAnswer = (opt) => {
    if (flashRef.current || deadRef.current || !q) return;
    clearInterval(timerRef.current);
    const correct = opt === q.correct;
    flashRef.current = correct ? 'correct' : 'wrong';
    setFlash(correct ? 'correct' : 'wrong');
    if (!correct) {
      setTimeout(() => { deadRef.current = true; setDead(true); }, 700);
      return;
    }
    onScore(1);
    setTimeout(() => {
      const next = floorRef.current + 1;
      floorRef.current = next;
      setFloor(next);
      genQ(next);
    }, 400);
  };

  if (dead) {
    const reachedFloor = floorRef.current;
    return (
      <div className="flex-1 flex flex-col items-center justify-center mt-16 px-4 gap-6">
        <div className="text-8xl animate-bounce">💀</div>
        <h2 className="text-3xl font-black text-white">Ngươi Đã Ngã</h2>
        <div className="text-white/50">Đã leo tới tầng <span className="text-white font-black text-2xl" style={{ color: accent }}>{reachedFloor}</span></div>
        <div className="text-yellow-400 font-black text-lg">+{Math.floor(reachedFloor * 1.5)} EXP thưởng tháp</div>
        <MysticBtn onClick={() => onFinish(reachedFloor)} accent={accent} className="px-8 py-4">Kết Thúc</MysticBtn>
      </div>
    );
  }

  if (!q) return null;

  const maxTime = Math.max(3, 10 - Math.floor(floor / 5));

  return (
    <div className="flex-1 flex flex-col items-center justify-center mt-16 px-4 gap-6">
      {/* Tower level */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">🏰</span>
        <div className="text-white font-black text-xl">Tầng <span style={{ color: accent }}>{floor}</span></div>
        <span className="text-3xl">💀</span>
      </div>
      {/* Timer bar */}
      <div className="w-full max-w-sm bg-white/10 rounded-full h-3 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${(timeLeft / maxTime) * 100}%`, background: timeLeft <= 3 ? '#ef4444' : accent }} />
      </div>
      <div className="text-white/50 text-sm font-bold">{timeLeft}s</div>
      {/* Question */}
      <div className="text-center p-6 rounded-3xl w-full max-w-sm"
        style={{ background: '#ffffff08', border: `2px solid ${accent}33` }}>
        <div className="text-white/40 text-xs mb-2">{q.hint}</div>
        <div className="text-4xl font-black text-white" style={{ textShadow: `0 0 20px ${accent}` }}>{q.question}</div>
      </div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {q.options.map((opt, i) => (
          <button key={i} onClick={() => !flash && handleAnswer(opt)}
            className={`p-5 rounded-2xl text-lg font-bold text-white transition-all active:scale-95
              ${flash && opt === q.correct ? 'scale-105' : flash && opt !== q.correct ? 'opacity-20' : ''}`}
            style={{
              background: flash && opt === q.correct ? '#22c55e44' : flash && opt !== q.correct ? '#ef444422' : `${accent}15`,
              border: `2px solid ${flash && opt === q.correct ? '#22c55e' : flash && opt !== q.correct ? '#ef444466' : accent + '33'}`,
            }}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  GAME WRAPPER
// ══════════════════════════════════════════════════════════════
const GAME_COMPONENTS = {
  1: Game1AlchemistFusion, 2: Game2TarotMemory, 3: Game3RuneCircle,
  4: Game4SealDemon, 5: Game5SoulPath, 6: Game6Scales,
  7: Game7Meteors, 8: Game8NinjaSword, 9: Game9WhackDemon,
  10: Game10DungeonDoors, 11: Game11RuneUnscramble, 12: Game12PoisonChalice,
  13: Game13MissingStone, 14: Game14WordGrid, 15: Game15AmuletPuzzle,
  16: Game16EchoAudio, 17: Game17FairyVoice, 18: Game18AudioJudge,
  19: Game19SirenSequence, 20: Game20TowerAbyss,
};

function GameWrapper({ gameId, vocab, onFinish, onScoreChange, accent }) {
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const Comp = GAME_COMPONENTS[gameId];

  const handleScore = (n) => {
    scoreRef.current += n;
    const next = scoreRef.current;
    setScore(next);
    if (onScoreChange) onScoreChange(next);
  };

  return (
    <div className="fixed inset-0 flex flex-col z-10">
      <MysticBg accent={accent} />
      <div className="relative z-10 flex flex-col h-full overflow-y-auto">
        <Comp vocab={vocab} onScore={handleScore} onFinish={() => onFinish(scoreRef.current)} accent={accent} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  DAILY LOBBY
// ══════════════════════════════════════════════════════════════
function DailyLobby({ todayGames, completedToday, onSelectGame, vocab }) {
  const dateStr = getLocalDateStr();

  return (
    <div className="relative min-h-screen overflow-x-hidden pb-32">
      <MysticBg accent="#a855f7" />
      <div className="relative z-10 max-w-lg mx-auto px-4 pt-6 pb-32">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-7xl mb-3" style={{ filter: 'drop-shadow(0 0 24px #a855f7)' }}>🔮</div>
          <h1 className="text-4xl font-black text-white mb-2" style={{ textShadow: '0 0 30px #a855f7aa' }}>
            Arena Huyền Bí
          </h1>
          <p className="text-white/50 text-base">{dateStr} — Mini Games Hằng Ngày</p>
        </div>

        {/* Today's games */}
        <div className="mb-8">
          <div className="text-white/50 text-sm font-black uppercase tracking-widest mb-4 text-center">
            ⚔️ Thử Thách Hôm Nay
          </div>
          <div className="flex flex-col gap-4">
            {todayGames.map((gameId, slotIdx) => {
              const def = GAME_DEFS.find(g => g.id === gameId);
              const done = completedToday.includes(gameId);
              return (
                <button key={gameId} onClick={() => onSelectGame(gameId)}
                  className="w-full p-6 rounded-3xl text-left transition-all active:scale-[0.98] hover:scale-[1.01]"
                  style={{
                    background: `linear-gradient(135deg, ${def.accent}28, ${def.accent}0a)`,
                    border: `2px solid ${def.accent}66`,
                    boxShadow: `0 0 40px ${def.accent}28`,
                  }}>
                  <div className="flex items-center gap-4">
                    <div className="text-5xl">{def.icon}</div>
                    <div className="flex-1">
                      <div className="text-white font-black text-xl leading-tight">{def.name}</div>
                      <div className="text-white/40 text-sm mt-0.5">{def.group}</div>
                      <div className="text-white/70 text-lg mt-2">{def.desc}</div>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      {done && <span className="text-green-400 font-black text-sm">✓ Đã chơi</span>}
                      <div className="font-black text-base" style={{ color: def.accent }}>+{EXP_PER_GAME}</div>
                      <div className="text-white/30 text-xs">⚡ EXP / lượt</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Vocab warning */}
        {vocab.length < 4 && (
          <div className="p-5 rounded-2xl text-center text-yellow-300 text-base font-bold mb-4"
            style={{ background: '#fbbf2415', border: '1px solid #fbbf2433' }}>
            ⚠️ Cần ít nhất 4 từ đã học để chơi!
          </div>
        )}

        {/* All games catalog */}
        <div className="mt-8">
          <div className="text-white/40 text-sm font-black uppercase tracking-widest mb-5 text-center">
            📖 Toàn Bộ 20 Mini Games — Chơi Thoải Mái
          </div>
          {['Thẻ Bài & Kết Nối', 'Tốc Độ & Phản Xạ', 'Logic & Xếp Hình', 'Âm Thanh Ám Ảnh', 'Sinh Tồn Vô Tận'].map(group => (
            <div key={group} className="mb-5">
              <div className="text-white/35 text-sm font-bold mb-2 pl-1">{group}</div>
              <div className="flex flex-col gap-2">
                {GAME_DEFS.filter(g => g.group === group).map(def => {
                  const isToday = todayGames.includes(def.id);
                  const done = completedToday.includes(def.id);
                  return (
                    <button key={def.id}
                      onClick={() => onSelectGame(def.id)}
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl text-left active:scale-95 transition-all w-full"
                      style={{
                        background: isToday ? `${def.accent}18` : '#ffffff06',
                        border: `1px solid ${isToday ? def.accent + '44' : '#ffffff0a'}`,
                      }}>
                      <span className="text-xl">{def.icon}</span>
                      <span className={`text-base font-bold flex-1 ${isToday ? 'text-white' : 'text-white/60'}`}>{def.name}</span>
                      {isToday && <span className="text-sm font-black" style={{ color: def.accent }}>Hôm nay</span>}
                      {done && <span className="text-green-400 text-sm font-black ml-1">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  ACTIVE GAME SCREEN (wraps GameWrapper + live ScoreBar)
// ══════════════════════════════════════════════════════════════
function ActiveGameScreen({ gameId, def, vocab, onFinish, onQuit }) {
  const [liveScore, setLiveScore] = useState(0);
  const GAME_TOTALS = { 6: 12, 7: 10, 8: 10, 9: 10, 10: 8, 18: 12, 20: 99 };
  const total = GAME_TOTALS[gameId] || 10;
  const expPreview = EXP_PER_GAME + liveScore * EXP_PER_CORRECT;

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ background: '#000' }}>
      <ScoreBar
        score={liveScore}
        total={total}
        expGained={expPreview}
        onQuit={onQuit}
        accent={def.accent}
      />
      <GameWrapper
        gameId={gameId}
        vocab={vocab}
        onFinish={onFinish}
        onScoreChange={setLiveScore}
        accent={def.accent}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN QUIZPAGE
// ══════════════════════════════════════════════════════════════
function QuizPage({ vocabList, onFinishLesson, onQuestProgress, addExp, userData, sfxVolume = 0.8 }) {
  const auth = getAuth();
  const user = auth.currentUser;
  const { showAlert, showConfirm } = useDialog();

  // Only use learned vocab for games (has srsLevel > 0 or has been seen)
  const learnedVocab = useMemo(() => {
    const list = vocabList.filter(v => (Number(v.srsLevel) || 0) > 0 || (Number(v.correctCount) || 0) > 0);
    return list.length >= 4 ? list : vocabList; // fallback to all if not enough learned
  }, [vocabList]);

  const todayGames = useMemo(() => getTodayGames(), []);
  const todayKey = `nihongo:dailyGames:${getLocalDateStr()}`;

  const [completedToday, setCompletedToday] = useState(() => {
    try { return JSON.parse(localStorage.getItem(todayKey) || '[]'); } catch { return []; }
  });

  const [activeGameId, setActiveGameId] = useState(null);
  const [showResult, setShowResult] = useState(null); // { score, total, expGained, coinsGained, gameName }
  const [showConfetti, setShowConfetti] = useState(false);

  const handleSelectGame = (gameId) => {
    if (learnedVocab.length < 4) {
      showAlert('Chưa Đủ Từ', 'Cần ít nhất 4 từ đã học để bắt đầu mini game. Hãy học Flashcard trước nhé!');
      return;
    }
    setActiveGameId(gameId);
  };

  const GAME_TOTALS = { 1:5, 2:6, 3:8, 4:8, 5:6, 6:12, 7:10, 8:10, 9:10, 10:8, 11:6, 12:8, 13:8, 14:3, 15:5, 16:10, 17:8, 18:12, 19:6, 20:99 };

  const handleGameFinish = async (score) => {
    const def = GAME_DEFS.find(g => g.id === activeGameId);
    const gameTotal = GAME_TOTALS[activeGameId] || 10;
    const expGained = EXP_PER_GAME + score * EXP_PER_CORRECT;
    const coinsGained = COIN_PER_GAME + score * COIN_PER_CORRECT;

    // Save to DB
    if (user) {
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          exp: increment(expGained),
          coins: increment(coinsGained),
        });
      } catch (e) {
        console.error('Lỗi lưu EXP game:', e);
      }
    }

    // Mark as completed
    const newCompleted = [...completedToday, activeGameId];
    setCompletedToday(newCompleted);
    localStorage.setItem(todayKey, JSON.stringify(newCompleted));

    // Callbacks
    if (addExp) addExp(expGained);
    if (onQuestProgress) onQuestProgress('GAME_COMPLETE', 1);

    setActiveGameId(null);
    setShowResult({ score, total: gameTotal, expGained, coinsGained, gameName: def?.name || 'Mini Game' });
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 3000);
  };

  const handleQuitGame = async () => {
    const ok = await showConfirm('Thoát Mini Game', 'Tiến độ sẽ không được lưu. Bạn có chắc?');
    if (ok) setActiveGameId(null);
  };

  const handleResultDone = () => {
    setShowResult(null);
  };

  const activeDef = activeGameId ? GAME_DEFS.find(g => g.id === activeGameId) : null;

  // Result screen
  if (showResult) {
    return (
      <ResultScreen
        score={showResult.score}
        total={showResult.total || 10}
        expGained={showResult.expGained}
        coinsGained={showResult.coinsGained}
        gameName={showResult.gameName}
        onDone={handleResultDone}
        accent="#a855f7"
      />
    );
  }

  // Active game
  if (activeGameId && activeDef) {
    return <ActiveGameScreen
      gameId={activeGameId}
      def={activeDef}
      vocab={learnedVocab}
      onFinish={handleGameFinish}
      onQuit={handleQuitGame}
    />;
  }

  // Lobby
  return (
    <DailyLobby
      todayGames={todayGames}
      completedToday={completedToday}
      onSelectGame={handleSelectGame}
      vocab={learnedVocab}
    />
  );
}
ádsad
export default QuizPage;