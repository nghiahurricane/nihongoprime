import React, { useEffect, useState } from 'react';
// Đã sửa 'expSystem' thành 'Expsystem'
import { getLevelColor, getLevelTitle } from './Expsystem';
import Confetti from 'react-confetti';

function LevelUpToast({ oldLevel, newLevel, onClose }) {
  const color = getLevelColor(newLevel);
  const title = getLevelTitle(newLevel);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); setTimeout(onClose, 400); }, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed inset-0 z-[200] flex items-center justify-center pointer-events-none`}>
      <Confetti width={window.innerWidth} height={window.innerHeight} recycle={false} numberOfPieces={220} gravity={0.3} />
      <div className={`pointer-events-auto transition-all duration-400 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
        <div className={`bg-linear-to-br ${color} text-white rounded-3xl p-8 shadow-2xl text-center max-w-xs mx-4`}>
          <div className="text-5xl mb-3 animate-bounce">⭐</div>
          <p className="text-sm font-bold opacity-80 uppercase tracking-widest mb-1">Level Up!</p>
          <p className="text-4xl font-black mb-1">Lv.{oldLevel} → Lv.{newLevel}</p>
          <p className="text-lg font-bold opacity-90 mt-2">{title}</p>
          <button onClick={() => { setVisible(false); setTimeout(onClose, 400); }} className="mt-5 bg-white/20 hover:bg-white/30 text-white font-bold px-6 py-2 rounded-xl text-sm active:scale-95 transition-all pointer-events-auto">
            Tuyệt vời! 🎉
          </button>
        </div>
      </div>
    </div>
  );
}

export default LevelUpToast;