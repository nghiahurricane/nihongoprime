import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
// Đã sửa 'expSystem' thành 'Expsystem'
import { calcLevelFromExp, getLevelTitle, getLevelColor } from './Expsystem';

const CoinIcon = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" className={`inline-block drop-shadow-sm ${className}`} xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="#FCD34D" stroke="#F59E0B" strokeWidth="2"/>
    <circle cx="12" cy="12" r="6" fill="#FBBF24" stroke="#D97706" strokeWidth="1.5"/>
    <path d="M12 9V15" stroke="#D97706" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

function LevelBadge({ exp = 0, size = 'md' }) {
  const { level, currentExp, expNeeded, percent } = calcLevelFromExp(exp);
  const color = getLevelColor(level);
  const title = getLevelTitle(level);

  return (
    <div className="flex flex-col items-end gap-1 min-w-[110px]">
      <span className={`bg-gradient-to-r ${color} text-white font-black text-sm px-3 py-1 rounded-full shadow`}>
        ⭐ {title}
      </span>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
        <div
          className={`bg-gradient-to-r ${color} h-full rounded-full transition-all duration-500`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-400 font-medium">{currentExp} / {expNeeded} EXP</span>
    </div>
  );
}

function LeaderboardPage() {
  const [topUsers, setTopUsers] = useState([]);
  const [tab, setTab] = useState('level'); // 'level' | 'coins'

  useEffect(() => {
    const fetchLeaderboard = async () => {
      const field = tab === 'level' ? 'exp' : 'coins';
      const q = query(collection(db, 'users'), orderBy(field, 'desc'), limit(10));
      const snapshot = await getDocs(q);
      const arr = [];
      snapshot.forEach(docSnap => {
        arr.push({ userId: docSnap.id, ...docSnap.data() });
      });
      setTopUsers(arr);
    };
    fetchLeaderboard();
  }, [tab]);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="max-w-xl mx-auto mt-6 dark:text-gray-100">

      {/* Tab switcher */}
      <div className="flex gap-2 mb-5 bg-gray-100 dark:bg-gray-800 p-1 rounded-2xl">
        <button
          onClick={() => setTab('level')}
          className={`flex-1 py-2.5 rounded-xl font-black text-sm transition-all ${tab === 'level' ? 'bg-white dark:bg-gray-700 shadow text-indigo-600 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`}
        >
          ⭐ Bảng Level
        </button>
        <button
          onClick={() => setTab('coins')}
          className={`flex-1 py-2.5 rounded-xl font-black text-sm transition-all ${tab === 'coins' ? 'bg-white dark:bg-gray-700 shadow text-yellow-600 dark:text-yellow-300' : 'text-gray-500 dark:text-gray-400'}`}
        >
          💰 Bảng Phú Hào
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-xl border border-gray-50 dark:border-gray-700">
        <h2 className="text-xl font-black text-indigo-700 dark:text-indigo-300 mb-6 flex items-center gap-2">
          {tab === 'level' ? '🏆 Bảng Xếp Hạng Level' : '🏆 Bảng Xếp Hạng Phú Hào'}
        </h2>

        <ol className="space-y-3">
          {topUsers.map((u, i) => (
            <li
              key={u.userId}
              className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                i === 0 ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700' :
                i === 1 ? 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600' :
                i === 2 ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' :
                'bg-indigo-50 dark:bg-gray-700 border-indigo-100 dark:border-gray-600'
              }`}
            >
              {/* Rank */}
              <span className="text-2xl font-black w-8 text-center shrink-0">
                {i < 3 ? medals[i] : <span className="text-indigo-500 dark:text-indigo-400 text-xl">{i + 1}</span>}
              </span>

              {/* Avatar */}
              {u.photoURL ? (
                <img src={u.photoURL} alt="avatar" className="w-11 h-11 rounded-full border-2 border-white dark:border-gray-600 shadow-sm shrink-0" referrerPolicy="no-referrer" />
              ) : (
                <span className="w-11 h-11 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-500 shrink-0">?</span>
              )}

              {/* Name + title */}
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-bold text-gray-800 dark:text-gray-100 text-base truncate">{u.displayName || 'Ẩn danh'}</span>
                {u.activeTitle && (
                  <span className="mt-0.5 text-[10px] bg-gradient-to-r from-pink-500 to-purple-500 text-white px-2 py-0.5 rounded-full inline-block w-max font-bold shadow-sm">
                    {u.activeTitle}
                  </span>
                )}
              </div>

              {/* Score: level or coins */}
              {tab === 'level' ? (
                <LevelBadge exp={u.exp || 0} />
              ) : (
                <span className="ml-auto font-black text-yellow-600 dark:text-yellow-400 flex items-center gap-1 text-xl shrink-0">
                  {u.coins || 0} <CoinIcon className="w-6 h-6" />
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default LeaderboardPage;