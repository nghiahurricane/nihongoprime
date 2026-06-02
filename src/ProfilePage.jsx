import React from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { calcLevelFromExp, getLevelTitle, getLevelColor } from './Expsystem';
import { db } from './firebase';

const CoinIcon = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" className={`inline-block drop-shadow-sm ${className}`} xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="#FCD34D" stroke="#F59E0B" strokeWidth="2"/>
    <circle cx="12" cy="12" r="6" fill="#FBBF24" stroke="#D97706" strokeWidth="1.5"/>
    <path d="M12 9V15" stroke="#D97706" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

function ProfilePage({
  vocabList,
  user,
  userData,
  handleLogout
}) {
  const navigate = useNavigate();

  const totalWords = vocabList.length;
  const totalCorrect = vocabList.reduce((acc, v) => acc + (v.correctCount || 0), 0);
  const totalWrong = vocabList.reduce((acc, v) => acc + (v.wrongCount || 0), 0);
  const totalAnswers = totalCorrect + totalWrong;

  const accuracy = totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 0;

  // EXP / Level
  const { level, currentExp, expNeeded, percent } = calcLevelFromExp(userData?.exp || 0);
  const levelColor = getLevelColor(level);
  const levelTitle = getLevelTitle(level);

  const tagCounts = vocabList.reduce((acc, curr) => {
    const tag = curr.tag || 'Chung';
    acc[tag] = (acc[tag] || 0) + 1;
    return acc;
  }, {});

  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

  const weakWords = [...vocabList]
    .filter(v => (v.wrongCount || 0) > 0)
    .sort((a, b) => {
      const ratioA = (a.correctCount || 0) > 0 ? a.wrongCount / a.correctCount : a.wrongCount;
      const ratioB = (b.correctCount || 0) > 0 ? b.wrongCount / b.correctCount : b.wrongCount;
      return ratioB - ratioA;
    })
    .slice(0, 5);

  const reviewedWords = vocabList.filter(v => Boolean(v.lastReviewed)).length;
  const masteredWords = vocabList.filter(v => (v.srsLevel || 0) >= 7).length;
  const inventory = userData?.inventory || {};
  const inventoryCount = (userData?.freezeCards || 0)
    + (inventory.hintTicket || 0)
    + (inventory.retryToken || 0)
    + (inventory.xpBoost || 0)
    + (inventory.shieldToken || 0);

  const isNightOwl = vocabList.some(v => {
    if (!v.lastReviewed) return false;
    const reviewDate = new Date(v.lastReviewed);
    const hour = reviewDate.getHours();
    return hour >= 0 && hour < 4;
  });

  const isEarlyBird = vocabList.some(v => {
    if (!v.lastReviewed) return false;
    const reviewDate = new Date(v.lastReviewed);
    const hour = reviewDate.getHours();
    return hour >= 5 && hour < 8;
  });

  const userStreak = userData?.streak || 0;

  const n5Vocabs = vocabList.filter(v => v.tag === 'JLPT N5');
  const n5MasteredCount = n5Vocabs.filter(v => (v.correctCount || 0) > 0).length;

  const getLocalDateStr = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const activityMap = {};
  vocabList.forEach(v => {
    if (v.createdAt) {
      const d = v.createdAt.seconds ? new Date(v.createdAt.seconds * 1000) : new Date(v.createdAt);
      if (!isNaN(d.getTime())) {
        const dateStr = getLocalDateStr(d);
        activityMap[dateStr] = (activityMap[dateStr] || 0) + 1;
      }
    }
    if (v.lastReviewed) {
      const d = new Date(v.lastReviewed);
      if (!isNaN(d.getTime())) {
        const dateStr = getLocalDateStr(d);
        activityMap[dateStr] = (activityMap[dateStr] || 0) + 2; 
      }
    }
  });

  const heatmapDays = [];
  const todayObj = new Date();
  const totalDaysToShow = 140;

  for (let i = totalDaysToShow - 1; i >= 0; i--) {
    const d = new Date(todayObj);
    d.setDate(todayObj.getDate() - i);
    const dateStr = getLocalDateStr(d);
    heatmapDays.push({
      date: dateStr,
      displayDate: d.toLocaleDateString('vi-VN'),
      count: activityMap[dateStr] || 0
    });
  }

  const activeDaysCount = heatmapDays.filter(day => day.count > 0).length;
  const dailyChainWins = userData?.dailyChainWins || 0;
  const titlesOwnedCount = userData?.titles?.length || 0;

  const badges = [
    { id: 'first_word', name: 'Bước Chân Đầu Tiên', desc: 'Có từ vựng đầu tiên trong kho', icon: '🌱', achieved: totalWords >= 1, activeClass: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700 shadow-md' },
    { id: 'reviewed_50', name: 'Nhà Sưu Tập Trí Nhớ', desc: 'Đã ôn tập 50 từ khác nhau', icon: '📦', achieved: reviewedWords >= 50, activeClass: 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700 shadow-md' },
    { id: 'reviewed_200', name: 'Kho Ký Ức Khổng Lồ', desc: 'Đã ôn tập 200 từ khác nhau', icon: '🏯', achieved: reviewedWords >= 200, activeClass: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700 shadow-md' },
    { id: 'answer_50', name: 'Luyện Tay', desc: 'Trả lời tổng cộng 50 câu', icon: '✍️', achieved: totalAnswers >= 50, activeClass: 'bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-700 shadow-md' },
    { id: 'answer_500', name: 'Cơn Lốc Câu Hỏi', desc: 'Trả lời tổng cộng 500 câu', icon: '🌪️', achieved: totalAnswers >= 500, activeClass: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-700 shadow-md' },
    { id: 'accuracy_80', name: 'Xạ Thủ 80%', desc: 'Độ chính xác đạt từ 80% (ít nhất 50 câu)', icon: '🎯', achieved: totalAnswers >= 50 && accuracy >= 80, activeClass: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-700 shadow-md' },
    { id: 'accuracy_90', name: 'Sniper 90%', desc: 'Độ chính xác đạt từ 90% (ít nhất 200 câu)', icon: '🏹', achieved: totalAnswers >= 200 && accuracy >= 90, activeClass: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700 shadow-md' },
    { id: 'accuracy_95', name: 'Vô Cực Chính Xác', desc: 'Độ chính xác đạt từ 95% (ít nhất 300 câu)', icon: '💎', achieved: totalAnswers >= 300 && accuracy >= 95, activeClass: 'bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-700 shadow-md' },
    { id: 'reviewer_100', name: 'Người Ôn Tập', desc: 'Ôn tập ít nhất 100 từ', icon: '🧠', achieved: reviewedWords >= 100, activeClass: 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-700 shadow-md' },
    { id: 'reviewer_300', name: 'Nhà Khảo Cổ Từ Vựng', desc: 'Ôn tập ít nhất 300 từ', icon: '🗿', achieved: reviewedWords >= 300, activeClass: 'bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-900/40 dark:text-stone-300 dark:border-stone-700 shadow-md' },
    { id: 'master_10', name: 'Thợ Rèn Trí Nhớ', desc: 'Master 10 từ (SRS Lv7)', icon: '⚔️', achieved: masteredWords >= 10, activeClass: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700 shadow-md' },
    { id: 'master_50', name: 'Kiếm Thánh Từ Vựng', desc: 'Master 50 từ (SRS Lv7)', icon: '👑', achieved: masteredWords >= 50, activeClass: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700 shadow-md' },
    { id: 'master_100', name: 'Đại Tông Sư SRS', desc: 'Master 100 từ (SRS Lv7)', icon: '🏔️', achieved: masteredWords >= 100, activeClass: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700 shadow-md' },
    { id: 'streak_7', name: 'Siêu Chăm Chỉ', desc: 'Chuỗi học 7 ngày', icon: '🔥', achieved: userStreak >= 7, activeClass: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700 shadow-md' },
    { id: 'streak_30', name: 'Bất Khuất 30', desc: 'Chuỗi học 30 ngày', icon: '🌋', achieved: userStreak >= 30, activeClass: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700 shadow-md' },
    { id: 'streak_100', name: 'Huyền Thoại Kỷ Luật', desc: 'Chuỗi học 100 ngày', icon: '🗽', achieved: userStreak >= 100, activeClass: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700 shadow-md' },
    { id: 'active_30', name: 'Điểm Danh 30', desc: 'Có hoạt động trong 30 ngày gần đây', icon: '🗓️', achieved: activeDaysCount >= 30, activeClass: 'bg-lime-100 text-lime-700 border-lime-300 dark:bg-lime-900/40 dark:text-lime-300 dark:border-lime-700 shadow-md' },
    { id: 'active_90', name: 'Bền Bỉ 90 Ngày', desc: 'Có hoạt động trong 90 ngày gần đây', icon: '📆', achieved: activeDaysCount >= 90, activeClass: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700 shadow-md' },
    { id: 'n5_master', name: 'Bậc Thầy N5', desc: 'Làm đúng ít nhất 30 từ JLPT N5', icon: '🎓', achieved: n5MasteredCount >= 30, activeClass: 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700 shadow-md' },
    { id: 'daily_chain_5', name: 'Chuỗi Nhiệm Vụ', desc: 'Nhận thưởng lớn nhiệm vụ ngày 5 lần', icon: '🏆', achieved: dailyChainWins >= 5, activeClass: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-900/40 dark:text-fuchsia-300 dark:border-fuchsia-700 shadow-md' },
    { id: 'daily_chain_20', name: 'Ông Trùm Daily', desc: 'Nhận thưởng lớn nhiệm vụ ngày 20 lần', icon: '🥇', achieved: dailyChainWins >= 20, activeClass: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-900/40 dark:text-fuchsia-300 dark:border-fuchsia-700 shadow-md' },
    { id: 'coin_2000', name: 'Ông Trùm Kinh Tế', desc: 'Tích lũy 2000 xu', icon: '💰', achieved: (userData?.coins || 0) >= 2000, activeClass: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700 shadow-md' },
    { id: 'exp_10000', name: 'Linh Hồn Học Thuật', desc: 'Đạt 10,000 EXP tích lũy', icon: '✨', achieved: (userData?.exp || 0) >= 10000, activeClass: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700 shadow-md' },
    { id: 'title_collector_5', name: 'Nhà Săn Danh Hiệu', desc: 'Sở hữu 5 danh hiệu từ gacha', icon: '🎖️', achieved: titlesOwnedCount >= 5, activeClass: 'bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-700 shadow-md' },
    { id: 'inventory_keeper', name: 'Thủ Kho', desc: 'Sở hữu tổng 15 vật phẩm hỗ trợ', icon: '🎒', achieved: inventoryCount >= 15, activeClass: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700 shadow-md' },
    { id: 'night_owl', name: 'Cú Đêm', desc: 'Học bài trong khung 0h-4h', icon: '🦉', achieved: isNightOwl, activeClass: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 shadow-md', hidden: true },
    { id: 'early_bird', name: 'Dậy Sớm Luyện Công', desc: 'Học bài trong khung 5h-8h', icon: '🐦', achieved: isEarlyBird, activeClass: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700 shadow-md', hidden: true },
  ];

  const handleSetTitle = async (title) => {
    await updateDoc(doc(db, 'users', user.uid), { activeTitle: title });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 dark:text-gray-100 pb-10">
      
      {/* THÔNG TIN CÁ NHÂN & DANH HIỆU */}
      <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden">
        <button onClick={() => navigate('/settings')} className="md:hidden absolute top-4 left-4 w-20 h-8 bg-indigo-50 text-indigo-600 text-sm font-bold rounded-lg text-center z-10">Cài đặt</button>
        <button onClick={handleLogout} className="md:hidden absolute top-4 right-4 w-20 h-8 bg-red-50 text-red-500 text-sm font-bold rounded-lg text-center z-10">Đăng xuất</button>

        {/* Hàng 1: Avatar + Tên + Stats */}
        <div className="flex flex-col md:flex-row items-center gap-6">
          <img src={user.photoURL} alt="Avatar" className="w-24 h-24 rounded-full shadow-md border-4 border-white dark:border-gray-700 object-cover shrink-0" referrerPolicy="no-referrer" />

          <div className="text-center md:text-left flex-1">
            <h2 className="text-3xl font-black text-gray-800 dark:text-gray-100">{user.displayName}</h2>
            {userData?.activeTitle && (
              <span className="inline-block mt-1 px-3 py-1 bg-gradient-to-r from-pink-500 to-purple-500 text-white text-xs font-black tracking-widest rounded-full shadow-md">
                {userData.activeTitle}
              </span>
            )}
            <p className="text-gray-500 dark:text-gray-400 font-medium mt-1">{user.email}</p>
          </div>

          <div className="flex gap-4 w-full md:w-auto shrink-0">
            <div className="bg-indigo-50 dark:bg-gray-700 p-4 rounded-2xl flex-1 md:w-32 text-center border border-indigo-100 dark:border-gray-600">
              <p className="text-indigo-500 dark:text-indigo-300 text-sm font-bold mb-1">Kho từ</p>
              <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400">{totalWords}</p>
            </div>
            <div className="bg-green-50 dark:bg-gray-700 p-4 rounded-2xl flex-1 md:w-32 text-center border border-green-100 dark:border-gray-600">
              <p className="text-green-500 text-sm font-bold mb-1">Tỷ lệ đúng</p>
              <p className="text-3xl font-black text-green-600 dark:text-green-400">{accuracy}%</p>
            </div>
          </div>
        </div>

        {/* Hàng 2: EXP & LEVEL BLOCK */}
        <div className={`mt-5 bg-gradient-to-r ${levelColor} p-4 md:p-5 rounded-2xl text-white`}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-black text-lg md:text-xl leading-tight">⭐ {levelTitle}</p>
              <p className="text-white/70 text-xs font-medium mt-0.5">{currentExp} / {expNeeded} EXP đến level tiếp theo</p>
            </div>
            <span className="text-4xl font-black opacity-20">Lv</span>
          </div>
          <div className="w-full bg-white/30 rounded-full h-3 overflow-hidden">
            <div className="bg-white h-full rounded-full transition-all duration-700" style={{ width: `${percent}%` }} />
          </div>
          <div className="flex justify-between text-xs text-white/70 font-bold mt-1">
            <span>Lv.{level}</span>
            <span>{percent}%</span>
            <span>Lv.{level + 1}</span>
          </div>
        </div>
      </div>

      {/* KHO ĐỒ CÁ NHÂN TỪ GACHA */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">🎒 Kho Đồ Của Bạn</h3>
        
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-4 py-3 rounded-xl font-black border border-yellow-200 dark:border-yellow-700">
            <CoinIcon className="w-5 h-5" /> Xu: {userData?.coins || 0}
          </div>
          <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-4 py-3 rounded-xl font-black border border-blue-200 dark:border-blue-700">
            ❄️ Thẻ Đóng Băng: {userData?.freezeCards || 0}
          </div>
          <div className="flex items-center gap-2 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 px-4 py-3 rounded-xl font-black border border-cyan-200 dark:border-cyan-700">
            💡 Vé Gợi Ý: {inventory.hintTicket || 0}
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-4 py-3 rounded-xl font-black border border-emerald-200 dark:border-emerald-700">
            🔁 Vé Làm Lại: {inventory.retryToken || 0}
          </div>
          <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-4 py-3 rounded-xl font-black border border-orange-200 dark:border-orange-700">
            ⚡ Bùa EXP: {inventory.xpBoost || 0}
          </div>
          <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-4 py-3 rounded-xl font-black border border-indigo-200 dark:border-indigo-700">
            🛡️ Lá Chắn Sai: {inventory.shieldToken || 0}
          </div>
        </div>

        <h4 className="font-bold text-gray-600 dark:text-gray-300 mb-3">Danh Hiệu Đã Mở Khóa:</h4>
        <div className="flex flex-wrap gap-2">
          {(!userData?.titles || userData.titles.length === 0) ? (
            <p className="text-sm text-gray-400 italic">Chưa có danh hiệu nào. Hãy ra Shop quay Gacha nhé!</p>
          ) : (
            userData.titles.map((t, i) => (
              <button 
                key={i}
                onClick={() => handleSetTitle(t)}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-transform active:scale-95 border-2 ${userData?.activeTitle === t ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
              >
                {t} {userData?.activeTitle === t && '✅'}
              </button>
            ))
          )}
          {userData?.activeTitle && (
            <button 
              onClick={() => handleSetTitle('')}
              className="px-4 py-2 rounded-full text-sm font-bold border-2 border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400"
            >
              Gỡ Danh Hiệu
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            🟩 Mật độ học tập
          </h3>
          <span className="text-xs font-bold text-gray-400">140 ngày qua</span>
        </div>
        
        <div className="flex overflow-x-auto custom-scrollbar pb-4 hide-scrollbar">
          <div className="grid grid-rows-7 gap-1 md:gap-[6px]" style={{ gridAutoFlow: 'column' }}>
            {heatmapDays.map(day => {
              let colorClass = "bg-gray-100 dark:bg-gray-700";
              
              if (day.count > 0 && day.count <= 2) colorClass = "bg-green-200 dark:bg-green-900";
              else if (day.count > 2 && day.count <= 5) colorClass = "bg-green-400 dark:bg-green-700";
              else if (day.count > 5 && day.count <= 10) colorClass = "bg-green-500 dark:bg-green-600";
              else if (day.count > 10) colorClass = "bg-green-600 dark:bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.5)]";

              return (
                <div 
                  key={day.date} 
                  title={`${day.displayDate}: ${day.count === 0 ? 'Chưa học' : day.count + ' hoạt động'}`} 
                  className={`w-3 h-3 md:w-[14px] md:h-[14px] rounded-sm transition-colors hover:ring-2 hover:ring-indigo-400 cursor-pointer ${colorClass}`}
                ></div>
              );
            })}
          </div>
        </div>
        
        <div className="flex justify-end items-center gap-2 mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          <span>Ít</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-700"></div>
            <div className="w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900"></div>
            <div className="w-3 h-3 rounded-sm bg-green-400 dark:bg-green-700"></div>
            <div className="w-3 h-3 rounded-sm bg-green-500 dark:bg-green-600"></div>
            <div className="w-3 h-3 rounded-sm bg-green-600 dark:bg-green-400"></div>
          </div>
          <span>Nhiều</span>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-2xl">🏅</span>
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Bộ Sưu Tập Huy Hiệu</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {badges.map(badge => {
            const lockedHidden = badge.hidden && !badge.achieved;
            const displayIcon = lockedHidden ? '❓' : badge.icon;
            const displayName = lockedHidden ? 'Huy hiệu bí ẩn' : badge.name;
            const displayDesc = lockedHidden ? 'Tiếp tục học để khám phá điều kiện mở khóa.' : badge.desc;

            return (
            <div 
              key={badge.id} 
              className={`p-4 rounded-2xl border-2 flex items-center gap-4 transition-all duration-300 
                ${badge.achieved 
                  ? badge.activeClass 
                  : 'bg-gray-50 dark:bg-gray-900 border-dashed border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600 grayscale opacity-70'}`}
            >
              <div className="text-4xl">{displayIcon}</div>
              <div className="flex-1">
                <p className="font-black text-lg leading-tight">{displayName}</p>
                <p className="text-xs font-medium mt-1">{displayDesc}</p>
              </div>
              {!badge.achieved && (
                <div className="text-xl opacity-40">🔒</div>
              )}
            </div>
            );
          })}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 items-start">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6 flex items-center gap-2">📊 Phân bổ theo Cấp độ</h3>
          
          {sortedTags.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-center py-4">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-4">
              {sortedTags.map(([tag, count]) => {
                const percent = Math.round((count / totalWords) * 100);
                return (
                  <div key={tag}>
                    <div className="flex justify-between text-sm font-bold mb-1">
                      <span className="text-gray-700 dark:text-gray-300">{tag}</span>
                      <span className="text-indigo-600 dark:text-indigo-400">{count} từ ({percent}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-700 h-3 rounded-full overflow-hidden">
                      <div className="bg-indigo-500 dark:bg-indigo-400 h-full rounded-full" style={{ width: `${percent}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6 flex items-center gap-2">⚠️ Cần ôn tập gấp</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Top 5 từ vựng bạn trả lời sai nhiều nhất trong lúc Test.</p>
          
          {weakWords.length === 0 ? (
            <div className="bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 p-4 rounded-xl text-center font-bold border border-green-100 dark:border-green-800">
              Tuyệt vời! Hiện tại không có từ vựng nào làm khó được bạn.
            </div>
          ) : (
            <div className="space-y-3">
              {weakWords.map((v, index) => (
                <div key={v.id} className="flex justify-between items-center bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-100 dark:border-red-800/50">
                  <div className="flex items-center gap-3">
                    <span className="bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300 w-6 h-6 flex items-center justify-center rounded-full text-xs font-black">{index + 1}</span>
                    <div>
                      <p className="font-bold text-gray-800 dark:text-gray-100">{v.word} <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-1">({v.tag})</span></p>
                      <p className="text-xs text-gray-600 dark:text-gray-300">{v.meaning}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-red-600 dark:text-red-400 font-black text-sm">Sai {v.wrongCount} lần</p>
                    <p className="text-green-600 dark:text-green-400 text-xs font-bold">Đúng {v.correctCount || 0} lần</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;