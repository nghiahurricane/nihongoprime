import React, { useState } from 'react';
import { doc, updateDoc, increment, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';
import Confetti from 'react-confetti';
import { useDialog } from './DialogContext'; // KẾT NỐI POPUP

const CoinIcon = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" className={`inline-block drop-shadow-sm ${className}`} xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="#FCD34D" stroke="#F59E0B" strokeWidth="2"/>
    <circle cx="12" cy="12" r="6" fill="#FBBF24" stroke="#D97706" strokeWidth="1.5"/>
    <path d="M12 9V15" stroke="#D97706" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const GACHA_COST = 50;
const DUPLICATE_TITLE_REFUND = 80;

const PRIZES = [
  { id: 1, type: 'coin', value: 20, prob: 20, name: '20 Xu', icon: <CoinIcon className="w-20 h-20" />, color: 'text-gray-500' },
  { id: 2, type: 'coin', value: 80, prob: 14, name: '80 Xu', icon: <CoinIcon className="w-20 h-20" />, color: 'text-yellow-500' },
  { id: 3, type: 'coin', value: 200, prob: 4, name: '200 Xu Hiếm', icon: <CoinIcon className="w-20 h-20" />, color: 'text-amber-500' },
  { id: 4, type: 'title', value: 'Kẻ Hủy Diệt Kanji', prob: 10, name: 'Danh hiệu: Kẻ Hủy Diệt Kanji', icon: <span className="text-7xl drop-shadow-md">🔥</span>, color: 'text-red-500' },
  { id: 5, type: 'title', value: 'Thần Đồng Ngoại Ngữ', prob: 10, name: 'Danh hiệu: Thần Đồng Ngoại Ngữ', icon: <span className="text-7xl drop-shadow-md">🧠</span>, color: 'text-purple-500' },
  { id: 6, type: 'title', value: 'Chúa Tể Gacha', prob: 3, name: 'Danh hiệu: Chúa Tể Gacha', icon: <span className="text-7xl drop-shadow-md">🎰</span>, color: 'text-pink-500' },
  { id: 7, type: 'title', value: 'Kẻ Nắm Giữ Thời Gian', prob: 3, name: 'Danh hiệu: Kẻ Nắm Giữ Thời Gian', icon: <span className="text-7xl drop-shadow-md">⏳</span>, color: 'text-yellow-600' },
  { id: 8, type: 'freeze', value: 1, prob: 9, name: 'Thẻ Đóng Băng x1', icon: <span className="text-7xl drop-shadow-md">❄️</span>, color: 'text-blue-500' },
  { id: 9, type: 'item', value: 'hintTicket', prob: 10, name: 'Vé Gợi Ý x1', icon: <span className="text-7xl drop-shadow-md">💡</span>, color: 'text-cyan-500' },
  { id: 10, type: 'item', value: 'retryToken', prob: 8, name: 'Vé Làm Lại x1', icon: <span className="text-7xl drop-shadow-md">🔁</span>, color: 'text-emerald-500' },
  { id: 11, type: 'item', value: 'xpBoost', prob: 6, name: 'Bùa EXP x1', icon: <span className="text-7xl drop-shadow-md">⚡</span>, color: 'text-orange-500' },
  { id: 12, type: 'item', value: 'shieldToken', prob: 3, name: 'Lá Chắn Sai x1', icon: <span className="text-7xl drop-shadow-md">🛡️</span>, color: 'text-indigo-500' },
];

const SHOP_ITEMS = [
  { id: 'freezeCard', label: 'Thẻ Đóng Băng Streak', icon: '❄️', desc: 'Tự động cứu chuỗi streak khi lỡ quên học 1 ngày.', cost: 200, type: 'freezeCards', amount: 1, theme: 'blue' },
  { id: 'hintTicket', label: 'Vé Gợi Ý', icon: '💡', desc: 'Dùng để mở gợi ý khi gặp từ khó (chuẩn bị cho chế độ trợ giúp).', cost: 120, type: 'inventory.hintTicket', amount: 1, theme: 'cyan' },
  { id: 'retryToken', label: 'Vé Làm Lại', icon: '🔁', desc: 'Cho phép làm lại nhanh một phiên học (sẵn sàng tích hợp).', cost: 150, type: 'inventory.retryToken', amount: 1, theme: 'emerald' },
  { id: 'xpBoost', label: 'Bùa EXP', icon: '⚡', desc: 'Nhận thêm EXP trong phiên kế tiếp (sẵn sàng tích hợp).', cost: 260, type: 'inventory.xpBoost', amount: 1, theme: 'orange' },
  { id: 'shieldToken', label: 'Lá Chắn Sai', icon: '🛡️', desc: 'Miễn 1 lần sai khi đang combo (sẵn sàng tích hợp).', cost: 220, type: 'inventory.shieldToken', amount: 1, theme: 'indigo' },
];

const ITEM_COUNT_LABELS = {
  hintTicket: 'Vé Gợi Ý',
  retryToken: 'Vé Làm Lại',
  xpBoost: 'Bùa EXP',
  shieldToken: 'Lá Chắn Sai',
};

function ShopPage({ user, userData }) {
  const [isRolling, setIsRolling] = useState(false);
  const [currentIcon, setCurrentIcon] = useState(<span className="text-7xl drop-shadow-md transition-all">🎁</span>);
  const [result, setResult] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  
  const { showAlert } = useDialog(); // SỬ DỤNG POPUP DIALOG

  const handleRoll = async () => {
    if ((userData?.coins || 0) < GACHA_COST) {
      return await showAlert("Thiếu Xu", "Bạn không đủ Xu! Hãy làm bài Test hoặc học Flashcard để kiếm thêm nhé.");
    }

    setIsRolling(true);
    setResult(null);

    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, { coins: increment(-GACHA_COST) });

    const spinInterval = setInterval(() => {
      const randomIcon = PRIZES[Math.floor(Math.random() * PRIZES.length)].icon;
      setCurrentIcon(randomIcon);
    }, 100);

    setTimeout(async () => {
      clearInterval(spinInterval);
      
      const rand = Math.random() * 100;
      let cumulative = 0;
      let wonPrize = PRIZES[0];
      
      for (let p of PRIZES) {
        cumulative += p.prob;
        if (rand <= cumulative) {
          wonPrize = p;
          break;
        }
      }

      setCurrentIcon(wonPrize.icon);
      setResult(wonPrize);
      setIsRolling(false);

      if (wonPrize.type !== 'coin' || wonPrize.value > 10) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }

      const updates = {};
      if (wonPrize.type === 'coin') updates.coins = increment(wonPrize.value);
      if (wonPrize.type === 'freeze') updates.freezeCards = increment(wonPrize.value);
      if (wonPrize.type === 'item') updates[`inventory.${wonPrize.value}`] = increment(1);
      if (wonPrize.type === 'title') {
        const currentTitles = userData?.titles || [];
        if (!currentTitles.includes(wonPrize.value)) {
          updates.titles = arrayUnion(wonPrize.value);
        } else {
          updates.coins = increment(DUPLICATE_TITLE_REFUND);
          wonPrize.name += ` (Đã sở hữu -> Đổi thành ${DUPLICATE_TITLE_REFUND} Xu)`;
        }
      }
      
      if (Object.keys(updates).length > 0) {
        await updateDoc(userRef, updates);
      }
    }, 2000);
  };

  const buyItem = async (item) => {
    if ((userData?.coins || 0) < item.cost) {
      return await showAlert("Thiếu Xu", `Không đủ Xu để mua ${item.label}!`);
    }

    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, { coins: increment(-item.cost), [item.type]: increment(item.amount) });
    await showAlert("Giao Dịch Thành Công", `✅ Mua thành công ${item.label} x${item.amount}.`);
  };

  return (
    <div className="max-w-4xl mx-auto mt-4 pb-32 dark:text-gray-100 relative">
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          <Confetti width={window.innerWidth} height={window.innerHeight} recycle={false} numberOfPieces={300} />
        </div>
      )}

      <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-3xl p-6 shadow-lg mb-8 flex justify-between items-center text-white">
        <div>
          <p className="font-bold opacity-80 uppercase tracking-widest text-sm">Tài sản hiện tại</p>
          <h2 className="text-4xl font-black flex items-center gap-2">
            <CoinIcon className="w-10 h-10" /> {userData?.coins || 0} <span className="text-xl">Xu</span>
          </h2>
        </div>
        <div className="text-right">
          <p className="font-bold opacity-80 uppercase tracking-widest text-sm">Vật phẩm</p>
          <h2 className="text-2xl font-black">🎒 {(userData?.freezeCards || 0) + Object.values(userData?.inventory || {}).reduce((a, b) => a + (Number(b) || 0), 0)}</h2>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 mb-6">
        <p className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Kho vật phẩm</p>
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-xs font-black">❄️ Thẻ Đóng Băng: {userData?.freezeCards || 0}</span>
          {Object.keys(ITEM_COUNT_LABELS).map((key) => (
            <span key={key} className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-black">
              {ITEM_COUNT_LABELS[key]}: {userData?.inventory?.[key] || 0}
            </span>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl border-4 border-pink-200 dark:border-pink-900/50 flex flex-col items-center text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-pink-400 to-purple-500"></div>
          <h3 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2">🎰 Vòng Quay Nhân Phẩm</h3>
          <p className="text-gray-500 dark:text-gray-400 font-medium mb-8">Thử vận may! Trúng danh hiệu hiếm và tài nguyên giá trị.</p>

          <div className={`w-40 h-40 bg-gray-50 dark:bg-gray-900 rounded-full border-8 border-gray-100 dark:border-gray-700 flex items-center justify-center mb-8 shadow-inner ${isRolling ? 'animate-pulse ring-4 ring-pink-400 ring-offset-4' : ''}`}>
            {currentIcon}
          </div>

          {result && !isRolling && (
            <div className={`mb-6 p-4 rounded-xl border-2 animate-fade-in w-full ${result.type === 'coin' ? 'bg-yellow-50 border-yellow-200' : 'bg-pink-50 border-pink-200'} dark:bg-gray-900 dark:border-gray-700`}>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Kết quả</p>
              <p className={`font-black text-lg ${result.color}`}>{result.name}</p>
            </div>
          )}

          <button 
            onClick={handleRoll} 
            disabled={isRolling}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-black text-xl py-4 rounded-2xl shadow-lg transition-transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            QUAY 1 LẦN ({GACHA_COST} <CoinIcon className="w-6 h-6" />)
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 flex flex-col">
          <h3 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2">🛒 Cửa Hàng Tiện Lợi</h3>
          <p className="text-gray-500 dark:text-gray-400 font-medium mb-6">Dùng Xu để mua các vật phẩm hỗ trợ học tập.</p>

          <div className="flex-1 flex flex-col gap-4">
            {SHOP_ITEMS.map((item) => (
              <div key={item.id} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-2xl border-2 border-gray-100 dark:border-gray-700 flex items-center gap-4">
                <div className="text-5xl drop-shadow-sm">{item.icon}</div>
                <div className="flex-1">
                  <h4 className="font-black text-gray-800 dark:text-gray-100 text-lg">{item.label}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-1">{item.desc}</p>
                </div>
                <button
                  onClick={() => buyItem(item)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl shadow-md active:scale-95 transition-transform flex items-center gap-1"
                >
                  {item.cost} <CoinIcon className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShopPage;