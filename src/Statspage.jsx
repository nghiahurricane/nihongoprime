import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { calcLevelFromExp, getLevelColor, getLevelTitle } from './Expsystem';

// ── SRS Bar Chart ──────────────────────────────────────────
function SrsChart({ vocabList }) {
  const levels = [0,1,2,3,4,5,6,7];
  const labels = ['Mới','Lv1','Lv2','Lv3','Lv4','Lv5','Lv6','Master'];
  const colors = ['bg-gray-300','bg-red-400','bg-orange-400','bg-yellow-400','bg-lime-400','bg-green-400','bg-teal-400','bg-indigo-500'];
  const counts = levels.map(l => vocabList.filter(v => (v.srsLevel || 0) === l).length);
  const max = Math.max(...counts, 1);

  return (
    <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm">
      <h3 className="font-black text-gray-700 dark:text-gray-200 mb-4">📊 Phân bổ SRS Level</h3>
      <div className="flex items-end gap-1.5 h-32">
        {levels.map((l, i) => (
          <div key={l} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] font-black text-gray-500">{counts[i]}</span>
            <div
              className={`w-full rounded-t-lg transition-all duration-700 ${colors[i]}`}
              style={{ height: `${Math.max(4, (counts[i] / max) * 100)}%` }}
            />
            <span className="text-[9px] font-bold text-gray-400 text-center leading-tight">{labels[i]}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>Tổng: <b className="text-gray-700 dark:text-gray-200">{vocabList.length}</b> từ</span>
        <span>Master: <b className="text-indigo-600 dark:text-indigo-400">{counts[7]}</b> từ</span>
      </div>
    </div>
  );
}

// ── Activity Heatmap ────────────────────────────────────────
function Heatmap({ user }) {
  const [activityData, setActivityData] = useState({});

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const snap = await getDocs(collection(db, 'users', user.uid, 'dailyQuests'));
      const data = {};
      snap.forEach(d => { data[d.id] = d.data().quests?.filter(q => q.claimed).length || 0; });
      setActivityData(data);
    };
    load();
  }, [user]);

  const getLocalDateStr = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Build last 91 days (13 weeks)
  const days = [];
  const today = new Date();
  for (let i = 90; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(getLocalDateStr(d));
  }

  const getColor = (dateStr) => {
    const count = activityData[dateStr] || 0;
    if (count === 0) return 'bg-gray-100 dark:bg-gray-700';
    if (count === 1) return 'bg-indigo-200 dark:bg-indigo-900';
    if (count === 2) return 'bg-indigo-400 dark:bg-indigo-700';
    if (count === 3) return 'bg-indigo-500 dark:bg-indigo-500';
    return 'bg-indigo-600 dark:bg-indigo-400';
  };

  // Group into weeks
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const monthLabels = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];

  return (
    <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm">
      <h3 className="font-black text-gray-700 dark:text-gray-200 mb-4">📅 Lịch Hoạt Động (13 tuần)</h3>
      <div className="overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map(dateStr => (
                <div
                  key={dateStr}
                  title={dateStr}
                  className={`w-3.5 h-3.5 rounded-sm ${getColor(dateStr)} transition-colors`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 text-[10px] text-gray-400 font-medium">
        <span>Ít</span>
        {['bg-gray-100 dark:bg-gray-700','bg-indigo-200','bg-indigo-400','bg-indigo-500','bg-indigo-600'].map((c,i) => (
          <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
        ))}
        <span>Nhiều</span>
      </div>
    </div>
  );
}

// ── EXP History ─────────────────────────────────────────────
function ExpCard({ userData }) {
  const { level, currentExp, expNeeded, percent } = calcLevelFromExp(userData?.exp || 0);
  const color = getLevelColor(level);
  const title = getLevelTitle(level);
  return (
    <div className={`bg-linear-to-r ${color} p-5 rounded-3xl text-white shadow-md`}>
      <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-1">Rank hiện tại</p>
      <p className="text-2xl font-black mb-1">⭐ {title}</p>
      <p className="text-white/80 text-sm mb-3">Tổng EXP: <b>{userData?.exp || 0}</b></p>
      <div className="bg-white/20 rounded-full h-2.5 overflow-hidden">
        <div className="bg-white h-full rounded-full transition-all duration-700" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex justify-between text-xs text-white/70 font-bold mt-1">
        <span>Lv.{level}</span><span>{currentExp}/{expNeeded} EXP</span><span>Lv.{level+1}</span>
      </div>
    </div>
  );
}

function StatsPage({ user, userData, vocabList }) {
  const correctCount = vocabList.reduce((s, v) => s + (v.correctCount || 0), 0);
  const wrongCount   = vocabList.reduce((s, v) => s + (v.wrongCount   || 0), 0);
  const accuracy     = (correctCount + wrongCount) > 0 ? Math.round((correctCount / (correctCount + wrongCount)) * 100) : 0;
  const masterCount  = vocabList.filter(v => (v.srsLevel || 0) >= 7).length;

  return (
    <div className="max-w-xl mx-auto mt-4 pb-24 flex flex-col gap-5 dark:text-gray-100">
      <ExpCard userData={userData} />

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Tổng từ',   val: vocabList.length, icon: '📖', color: 'indigo' },
          { label: 'Master',    val: masterCount,       icon: '🏆', color: 'yellow' },
          { label: 'Chính xác', val: `${accuracy}%`,   icon: '🎯', color: 'green'  },
        ].map(s => (
          <div key={s.label} className={`bg-${s.color}-50 dark:bg-${s.color}-900/20 p-4 rounded-2xl text-center border border-${s.color}-100 dark:border-${s.color}-900`}>
            <p className="text-2xl mb-1">{s.icon}</p>
            <p className={`text-xl font-black text-${s.color}-600 dark:text-${s.color}-400`}>{s.val}</p>
            <p className={`text-xs font-bold text-${s.color}-500 mt-0.5`}>{s.label}</p>
          </div>
        ))}
      </div>

      <SrsChart vocabList={vocabList} />
      <Heatmap user={user} />
    </div>
  );
}

export default StatsPage;