import React from 'react';
import { useNavigate } from 'react-router-dom';
import { calcLevelFromExp, getLevelColor, getLevelTitle } from './Expsystem';

const CoinIcon = ({ className = "w-5 h-5" }) => (
  <svg viewBox="0 0 24 24" className={`inline-block ${className}`} xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="#FCD34D" stroke="#F59E0B" strokeWidth="2"/>
    <circle cx="12" cy="12" r="6" fill="#FBBF24" stroke="#D97706" strokeWidth="1.5"/>
    <path d="M12 9V15" stroke="#D97706" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

function QuickCard({ to, icon, label, sub, color, navigate }) {
  return (
    <button
      onClick={() => navigate(to)}
      className={`flex flex-col items-center justify-center gap-2 p-5 rounded-3xl border-2 ${color} transition-all active:scale-95 shadow-sm hover:shadow-md`}
    >
      <span className="text-4xl">{icon}</span>
      <span className="font-black text-sm text-gray-800 dark:text-gray-100">{label}</span>
      {sub && <span className="text-xs font-medium text-gray-400">{sub}</span>}
    </button>
  );
}

function HomePage({ user, userData, vocabList }) {
  const navigate = useNavigate();
  const { level, currentExp, expNeeded, percent } = calcLevelFromExp(userData?.exp || 0);
  const color = getLevelColor(level);
  const title = getLevelTitle(level);

  const newWordsCount  = vocabList.filter(v => !v.srsLevel || v.srsLevel === 0).length;
  const now = new Date();
  const reviewCount = vocabList.filter(v => {
    const d = v.nextReview?.seconds ? new Date(v.nextReview.seconds * 1000) : v.nextReview ? new Date(v.nextReview) : null;
    return d && d <= now && (v.srsLevel || 0) > 0;
  }).length;
  const hasReviewWords = reviewCount > 0;
  const masterCount = vocabList.filter(v => (v.srsLevel || 0) >= 7).length;

  return (
    <div className="max-w-xl mx-auto mt-4 pb-28 px-1 dark:text-gray-100 flex flex-col gap-5">

      {/* Welcome banner */}
      <div className={`bg-linear-to-r ${color} rounded-3xl p-5 text-white shadow-lg`}>
        <div className="flex items-center gap-3 mb-3">
          {user?.photoURL && <img src={user.photoURL} className="w-12 h-12 rounded-full border-2 border-white/50 object-cover" alt="avatar" referrerPolicy="no-referrer" />}
          <div>
            <p className="text-white/70 text-xs font-bold tracking-[0.2em] uppercase">Nihongo Prime</p>
            <p className="font-black text-lg leading-tight">{user?.displayName?.split(' ').slice(-1)[0]}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="font-black text-xl">⭐ Lv.{level}</p>
            <p className="text-white/70 text-xs">{title.replace(`Lv.${level}`, '').trim()}</p>
          </div>
        </div>
        {/* EXP bar */}
        <div className="bg-white/20 rounded-full h-2.5 overflow-hidden">
          <div className="bg-white h-full rounded-full transition-all duration-700" style={{ width: `${percent}%` }} />
        </div>
        <div className="flex justify-between text-xs text-white/70 font-medium mt-1">
          <span>{currentExp} EXP</span><span>{expNeeded - currentExp} EXP đến Lv.{level + 1}</span>
        </div>
      </div>

      {/* Review CTA luôn hiển thị trên đầu để không cần cuộn */}
      <button
        onClick={() => navigate('/study', { state: { autoStart: true, studyMode: 'REVIEW', selectedTag: 'All' } })}
        className={`w-full font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 ${hasReviewWords ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300'}`}
      >
        {hasReviewWords ? `⏰ Ôn tập ngay ${reviewCount} từ đến hạn!` : '✅ Chưa có từ đến hạn ôn tập'}
      </button>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Streak', val: `🔥 ${userData?.streak || 0}`, sub: 'ngày' },
          { label: 'Từ mới', val: newWordsCount, sub: 'từ', urgent: newWordsCount > 0 },
          { label: 'Cần ôn', val: reviewCount,   sub: 'từ', urgent: reviewCount > 0 },
          { label: 'Master', val: masterCount,    sub: 'từ' },
        ].map(s => (
          <div key={s.label} className={`p-3 rounded-2xl text-center ${s.urgent ? 'bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700'}`}>
            <p className={`text-xl font-black ${s.urgent ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}`}>{s.val}</p>
            <p className="text-[10px] font-bold text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <QuickCard navigate={navigate} to="/study" icon="📚" label="Flashcard" sub={`${newWordsCount} từ mới`} color="border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100" />
        <QuickCard navigate={navigate} to="/quiz"  icon="✏️" label="Quiz" sub={`${vocabList.length} từ`} color="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 hover:bg-green-100" />
        <QuickCard navigate={navigate} to="/challenge" icon="⚔️" label="Thách Đấu" sub="Real-time PvP" color="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 hover:bg-red-100" />
        <QuickCard navigate={navigate} to="/stats"  icon="📊" label="Thống Kê" sub="SRS & heatmap" color="border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100" />
        <QuickCard navigate={navigate} to="/daily-quests" icon="📋" label="Nhiệm Vụ Ngày" sub="Chuỗi nhiệm vụ" color="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100" />
        <QuickCard navigate={navigate} to="/leaderboard" icon="🏆" label="Bảng Xếp Hạng" sub="Top phú hào & level" color="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100" />
      </div>

      {/* Xu + Freeze card */}
      <div className="flex gap-3">
        <div className="flex-1 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl p-4 flex items-center gap-3">
          <CoinIcon className="w-8 h-8" />
          <div>
            <p className="font-black text-xl text-yellow-600 dark:text-yellow-400">{userData?.coins || 0}</p>
            <p className="text-xs font-bold text-yellow-500">Xu tích lũy</p>
          </div>
          <button onClick={() => navigate('/shop')} className="ml-auto text-xs font-black text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/40 px-3 py-1.5 rounded-xl active:scale-95">Shop →</button>
        </div>
        <div className="flex-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-3xl">❄️</span>
          <div>
            <p className="font-black text-xl text-blue-600 dark:text-blue-400">{userData?.freezeCards || 0}</p>
            <p className="text-xs font-bold text-blue-500">Freeze Card</p>
          </div>
        </div>
      </div>

    </div>
  );
}

export default HomePage;