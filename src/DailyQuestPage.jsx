import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { doc, onSnapshot, setDoc, increment, runTransaction } from 'firebase/firestore';
import { db } from './firebase';

const CoinIcon = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" className={`inline-block ${className}`} xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="#FCD34D" stroke="#F59E0B" strokeWidth="2" />
    <circle cx="12" cy="12" r="6" fill="#FBBF24" stroke="#D97706" strokeWidth="1.5" />
    <path d="M12 9V15" stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const MAX_DAILY_REROLL = 1;
const DAILY_WEEKLY_BONUS = {
  threeDay: { rewardExp: 120, rewardCoins: 60 },
  sevenDay: { rewardExp: 300, rewardCoins: 180 },
};

const QUEST_CHAIN_BONUS = {
  rewardExp: 200,
  rewardCoins: 100,
};

const RARITY_INFO = {
  common: { label: 'Thường', badge: 'Phổ biến', chipClass: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200', multiplier: 1 },
  rare: { label: 'Rare', badge: 'Hiếm', chipClass: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300', multiplier: 1.25 },
  epic: { label: 'Epic', badge: 'Sự kiện', chipClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', multiplier: 1.5 },
};

const QUEST_TEMPLATES = {
  study_words_10: { id: 'study_words_10', track: 'study_words', label: 'Học 10 từ', icon: '📚', target: 10, rewardExp: 45, rewardCoins: 16, rarity: 'common' },
  study_words_14: { id: 'study_words_14', track: 'study_words', label: 'Học 14 từ', icon: '📘', target: 14, rewardExp: 55, rewardCoins: 20, rarity: 'common' },
  study_words_18: { id: 'study_words_18', track: 'study_words', label: 'Học 18 từ', icon: '📖', target: 18, rewardExp: 70, rewardCoins: 25, rarity: 'rare' },
  study_words_24: { id: 'study_words_24', track: 'study_words', label: 'Học 24 từ', icon: '🧾', target: 24, rewardExp: 95, rewardCoins: 34, rarity: 'epic' },
  combo_10: { id: 'combo_10', track: 'combo_10', label: 'Đúng liên tiếp 10 câu', icon: '🔥', target: 1, rewardExp: 70, rewardCoins: 25, rarity: 'rare' },
  study_session_1: { id: 'study_session_1', track: 'study_sessions', label: 'Hoàn thành 1 phiên Study', icon: '✅', target: 1, rewardExp: 55, rewardCoins: 18, rarity: 'common' },
  study_session_2: { id: 'study_session_2', track: 'study_sessions', label: 'Hoàn thành 2 phiên Study', icon: '🎯', target: 2, rewardExp: 90, rewardCoins: 30, rarity: 'rare' },
  review_session_1: { id: 'review_session_1', track: 'review_sessions', label: 'Hoàn thành 1 phiên ôn tập', icon: '🧠', target: 1, rewardExp: 70, rewardCoins: 24, rarity: 'rare' },
  review_session_2: { id: 'review_session_2', track: 'review_sessions', label: 'Hoàn thành 2 phiên ôn tập', icon: '🧩', target: 2, rewardExp: 95, rewardCoins: 32, rarity: 'epic' },
  quiz_session_1: { id: 'quiz_session_1', track: 'quiz_sessions', label: 'Hoàn thành 1 phiên Quiz', icon: '🎮', target: 1, rewardExp: 55, rewardCoins: 18, rarity: 'common' },
  quiz_session_2: { id: 'quiz_session_2', track: 'quiz_sessions', label: 'Hoàn thành 2 phiên Quiz', icon: '⚡', target: 2, rewardExp: 90, rewardCoins: 30, rarity: 'rare' },
};

const EVENT_DEFS = {
  weekday_focus: {
    id: 'weekday_focus',
    label: 'Ngày thường - Focus mode',
    rewardMultiplier: 1,
    bias: ['study_words_14', 'study_session_1', 'review_session_1', 'combo_10'],
  },
  weekend_blast: {
    id: 'weekend_blast',
    label: 'Weekend Blast - thưởng x1.15',
    rewardMultiplier: 1.15,
    bias: ['quiz_session_2', 'combo_10', 'study_words_18', 'study_session_2'],
  },
  monday_reboot: {
    id: 'monday_reboot',
    label: 'Monday Reboot - ưu tiên ôn tập',
    rewardMultiplier: 1.08,
    bias: ['review_session_1', 'review_session_2', 'study_words_14', 'study_session_1'],
  },
};

const getLocalDateStr = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const todayKey = () => getLocalDateStr();
const localQuestKey = (dateKey = todayKey()) => `nihongo:dailyQuestState:${dateKey}`;

const toDate = (dateKey) => {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const shiftDateKey = (dateKey, deltaDays) => {
  const d = toDate(dateKey);
  d.setDate(d.getDate() + deltaDays);
  return getLocalDateStr(d);
};

const getWeekStartKey = (dateKey = todayKey()) => {
  const d = toDate(dateKey);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return getLocalDateStr(d);
};

const hashSeed = (text) => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};

const createRng = (seedText) => {
  let seed = hashSeed(seedText) || 123456789;
  return () => {
    seed = Math.imul(1664525, seed) + 1013904223;
    return ((seed >>> 0) % 1_000_000) / 1_000_000;
  };
};

const getEventForDate = (dateKey = todayKey()) => {
  const d = toDate(dateKey);
  const weekday = d.getDay();
  if (weekday === 1) return EVENT_DEFS.monday_reboot;
  if (weekday === 0 || weekday === 6) return EVENT_DEFS.weekend_blast;
  return EVENT_DEFS.weekday_focus;
};

const safeReadLocal = (dateKey = todayKey()) => {
  try {
    const raw = localStorage.getItem(localQuestKey(dateKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.quests)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const safeWriteLocal = (state, dateKey = todayKey()) => {
  try {
    localStorage.setItem(localQuestKey(dateKey), JSON.stringify(state));
  } catch (error) {
    console.warn('Không thể lưu daily quest local:', error);
  }
};

const deriveBehaviorProfile = (dateKey = todayKey()) => {
  const failedByTrack = {};
  for (let i = 1; i <= 3; i += 1) {
    const previousKey = shiftDateKey(dateKey, -i);
    const state = safeReadLocal(previousKey);
    if (!state || !Array.isArray(state.quests)) continue;
    state.quests.forEach((quest) => {
      if (quest.claimed) return;
      const track = quest.track || quest.id;
      failedByTrack[track] = (failedByTrack[track] || 0) + 1;
    });
  }

  const weakTrack = Object.entries(failedByTrack).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { weakTrack, failedByTrack };
};

const pickFromPool = (poolIds, rng, fallbackId) => {
  if (!Array.isArray(poolIds) || poolIds.length === 0) return fallbackId;
  const idx = Math.floor(rng() * poolIds.length);
  return poolIds[idx] || fallbackId;
};

const applyRewardMultiplier = (quest, eventMultiplier = 1) => {
  const rarity = quest.rarity || 'common';
  const rarityMultiplier = RARITY_INFO[rarity]?.multiplier || 1;
  const multiplier = rarityMultiplier * eventMultiplier;
  return {
    ...quest,
    rewardExp: Math.max(1, Math.round(quest.rewardExp * multiplier)),
    rewardCoins: Math.max(1, Math.round(quest.rewardCoins * multiplier)),
    rarity,
  };
};

const buildQuestDefs = (dateKey = todayKey(), options = {}) => {
  const userId = options.userId || 'guest';
  const rerollCount = Math.max(0, Number(options.rerollCount) || 0);
  const behavior = options.behavior || deriveBehaviorProfile(dateKey);
  const eventInfo = options.event || getEventForDate(dateKey);

  const rng = createRng(`${dateKey}:${userId}:${rerollCount}:${eventInfo.id}:${behavior.weakTrack || 'none'}`);

  const studyPool = ['study_words_10', 'study_words_14', 'study_words_18', 'study_words_24'];
  const comboPool = ['combo_10'];
  const sessionPool = ['study_session_1', 'study_session_2', 'review_session_1', 'review_session_2', 'quiz_session_1', 'quiz_session_2'];

  let preferredSessionTrack = 'study_sessions';
  if (behavior.weakTrack === 'review_sessions') preferredSessionTrack = 'review_sessions';
  if (behavior.weakTrack === 'quiz_sessions') preferredSessionTrack = 'quiz_sessions';

  const eventBias = eventInfo.bias || [];
  const weightedStudyPool = [...studyPool, ...eventBias.filter((id) => studyPool.includes(id))];
  const weightedComboPool = [...comboPool, ...eventBias.filter((id) => comboPool.includes(id))];
  const weightedSessionPool = [
    ...sessionPool,
    ...eventBias.filter((id) => sessionPool.includes(id)),
    ...sessionPool.filter((id) => (QUEST_TEMPLATES[id]?.track || '') === preferredSessionTrack),
  ];

  if (behavior.weakTrack === 'study_words') {
    weightedStudyPool.push('study_words_10', 'study_words_14');
  }

  const pickedIds = [
    pickFromPool(weightedStudyPool, rng, 'study_words_14'),
    pickFromPool(weightedComboPool, rng, 'combo_10'),
    pickFromPool(weightedSessionPool, rng, 'study_session_1'),
  ];

  const uniqueIds = Array.from(new Set(pickedIds));
  while (uniqueIds.length < 3) {
    uniqueIds.push(pickFromPool(sessionPool, rng, 'quiz_session_1'));
  }

  return uniqueIds.slice(0, 3).map((id) => applyRewardMultiplier({ ...QUEST_TEMPLATES[id] }, eventInfo.rewardMultiplier));
};

const normalizeQuestList = (incoming, dateKey = todayKey(), options = {}) => {
  const list = Array.isArray(incoming) ? incoming : [];
  const defs = buildQuestDefs(dateKey, options);
  return defs.map((def) => {
    const old = list.find((q) => q.id === def.id);
    return {
      ...def,
      current: Math.max(0, Math.min(def.target, Number(old?.current) || 0)),
      claimed: Boolean(old?.claimed),
    };
  });
};

const createDailyQuestData = (dateKey = todayKey(), options = {}) => {
  const eventInfo = getEventForDate(dateKey);
  const rerollCount = Math.max(0, Number(options.rerollCount) || 0);
  const defs = buildQuestDefs(dateKey, options);
  return {
    date: dateKey,
    eventId: eventInfo.id,
    eventLabel: eventInfo.label,
    rerollCount,
    bonusClaimed: false,
    quests: defs.map((q) => ({ ...q, current: 0, claimed: false })),
  };
};

const getTomorrowPreview = (userId, today = todayKey()) => {
  const tomorrow = shiftDateKey(today, 1);
  const behavior = deriveBehaviorProfile(today);
  const eventInfo = getEventForDate(tomorrow);
  const quests = buildQuestDefs(tomorrow, { userId, behavior, event: eventInfo });
  return { date: tomorrow, eventLabel: eventInfo.label, quests };
};

const getRarityCounts = (quests) => {
  return (Array.isArray(quests) ? quests : []).reduce((acc, quest) => {
    const rarity = quest.rarity || 'common';
    acc[rarity] = (acc[rarity] || 0) + 1;
    return acc;
  }, { common: 0, rare: 0, epic: 0 });
};

const sanitizeWeeklyState = (input, weekStart, dateKey) => {
  const raw = input && typeof input === 'object' ? input : {};
  const isSameWeek = raw.weekStart === weekStart;
  const dates = Array.isArray(raw.completedDates) ? raw.completedDates.filter((d) => typeof d === 'string') : [];
  const uniqueDates = Array.from(new Set(isSameWeek ? dates : [])).sort();
  const daysCompleted = uniqueDates.length;

  return {
    weekStart,
    completedDates: uniqueDates,
    daysCompleted,
    bonus3Claimed: Boolean(isSameWeek ? raw.bonus3Claimed : false),
    bonus7Claimed: Boolean(isSameWeek ? raw.bonus7Claimed : false),
    lastCompletedDate: isSameWeek ? (raw.lastCompletedDate || '') : '',
    today: dateKey,
  };
};

function QuestBar({ quest }) {
  const pct = Math.min(100, Math.round((quest.current / quest.target) * 100));
  const done = quest.current >= quest.target;
  const rarityInfo = RARITY_INFO[quest.rarity || 'common'] || RARITY_INFO.common;

  return (
    <div className={`p-4 rounded-2xl border-2 transition-all ${done && quest.claimed ? 'opacity-50 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900' : done ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20' : 'border-indigo-100 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl shrink-0">{quest.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`font-bold text-sm leading-snug whitespace-normal break-words ${done && !quest.claimed ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-200'}`}>{quest.label}</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wide ${rarityInfo.chipClass}`}>{rarityInfo.badge}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-green-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-black text-gray-500 dark:text-gray-400 shrink-0">{quest.current}/{quest.target}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {quest.claimed ? (
            <span className="text-green-500 font-black text-lg">✓</span>
          ) : done ? (
            <button onClick={quest.onClaim} className="bg-green-500 hover:bg-green-600 text-white font-black text-xs px-3 py-1.5 rounded-xl active:scale-95 transition-transform shadow-sm">
              Nhận!
            </button>
          ) : (
            <div className="text-right">
              <p className="text-xs font-bold text-yellow-600 dark:text-yellow-400 flex items-center gap-0.5 justify-end">+{quest.rewardExp} EXP</p>
              <p className="text-xs font-bold text-orange-500 flex items-center gap-0.5 justify-end mt-0.5">+{quest.rewardCoins} <CoinIcon className="w-3.5 h-3.5" /></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function useDailyQuests(user, userData, addExp) {
  const [quests, setQuests] = useState([]);
  const [bonusClaimed, setBonusClaimed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState({
    eventLabel: getEventForDate(todayKey()).label,
    rerollCount: 0,
    rerollsLeft: MAX_DAILY_REROLL,
    rarityCounts: { common: 0, rare: 0, epic: 0 },
    tomorrowPreview: { date: shiftDateKey(todayKey(), 1), eventLabel: '', quests: [] },
    weekly: sanitizeWeeklyState(userData?.questWeekly, getWeekStartKey(todayKey()), todayKey()),
  });

  const updateMetaFromState = useCallback((state, dateKey) => {
    const nextQuests = Array.isArray(state?.quests) ? state.quests : [];
    const rerollCount = Math.max(0, Number(state?.rerollCount) || 0);
    setMeta((prev) => ({
      ...prev,
      eventLabel: state?.eventLabel || getEventForDate(dateKey).label,
      rerollCount,
      rerollsLeft: Math.max(0, MAX_DAILY_REROLL - rerollCount),
      rarityCounts: getRarityCounts(nextQuests),
      tomorrowPreview: getTomorrowPreview(user?.uid || 'guest', dateKey),
      weekly: sanitizeWeeklyState(userData?.questWeekly, getWeekStartKey(dateKey), dateKey),
    }));
  }, [user?.uid, userData?.questWeekly]);

  const loadQuests = useCallback(async () => {
    const dateKey = todayKey();
    const behavior = deriveBehaviorProfile(dateKey);
    const local = safeReadLocal(dateKey);

    if (local) {
      const normalized = normalizeQuestList(local.quests, dateKey, { userId: user?.uid || 'guest', rerollCount: local.rerollCount || 0, behavior });
      const nextState = {
        ...local,
        date: local.date || dateKey,
        eventId: local.eventId || getEventForDate(dateKey).id,
        eventLabel: local.eventLabel || getEventForDate(dateKey).label,
        rerollCount: Math.max(0, Number(local.rerollCount) || 0),
        quests: normalized,
        bonusClaimed: Boolean(local.bonusClaimed),
      };
      setQuests(nextState.quests);
      setBonusClaimed(nextState.bonusClaimed);
      setError('');
      setLoading(false);
      updateMetaFromState(nextState, dateKey);
      safeWriteLocal(nextState, dateKey);
    } else {
      const fallback = createDailyQuestData(dateKey, { userId: user?.uid || 'guest', behavior });
      setQuests(fallback.quests);
      setBonusClaimed(false);
      setLoading(false);
      updateMetaFromState(fallback, dateKey);
      safeWriteLocal(fallback, dateKey);
    }

    if (!user) return () => {};

    const ref = doc(db, 'users', user.uid, 'dailyQuests', dateKey);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          const seed = safeReadLocal(dateKey) || createDailyQuestData(dateKey, { userId: user.uid, behavior });
          const seedState = {
            ...seed,
            date: seed.date || dateKey,
            eventId: seed.eventId || getEventForDate(dateKey).id,
            eventLabel: seed.eventLabel || getEventForDate(dateKey).label,
            rerollCount: Math.max(0, Number(seed.rerollCount) || 0),
            quests: normalizeQuestList(seed.quests, dateKey, { userId: user.uid, rerollCount: seed.rerollCount || 0, behavior }),
            bonusClaimed: Boolean(seed.bonusClaimed),
          };
          setQuests(seedState.quests);
          setBonusClaimed(seedState.bonusClaimed);
          safeWriteLocal(seedState, dateKey);
          updateMetaFromState(seedState, dateKey);
          setLoading(false);
          setError('');
          setDoc(ref, seedState, { merge: true }).catch(() => {});
          return;
        }

        const data = snap.data();
        const rerollCount = Math.max(0, Number(data.rerollCount) || 0);
        const normalized = normalizeQuestList(data.quests, data.date || dateKey, { userId: user.uid, rerollCount, behavior });
        const nextState = {
          ...data,
          date: data.date || dateKey,
          eventId: data.eventId || getEventForDate(dateKey).id,
          eventLabel: data.eventLabel || getEventForDate(dateKey).label,
          rerollCount,
          quests: normalized,
          bonusClaimed: Boolean(data.bonusClaimed),
        };

        setQuests(nextState.quests);
        setBonusClaimed(nextState.bonusClaimed);
        safeWriteLocal(nextState, dateKey);
        updateMetaFromState(nextState, dateKey);
        setLoading(false);
        setError('');
      },
      (syncError) => {
        console.warn('Daily quest remote sync unavailable, using local data:', syncError);
        setLoading(false);
        setError('Đang dùng local cache vì mất kết nối.');
      }
    );

    return () => unsubscribe();
  }, [user, updateMetaFromState]);

  useEffect(() => {
    let unsub = () => {};
    loadQuests().then((cleanup) => {
      if (typeof cleanup === 'function') unsub = cleanup;
    });
    return () => unsub();
  }, [loadQuests]);

  useEffect(() => {
    const handleLocalQuestUpdate = (event) => {
      const payload = event?.detail;
      const dateKey = todayKey();
      if (!payload || payload.date !== dateKey || !payload.state) return;

      const behavior = deriveBehaviorProfile(dateKey);
      const rerollCount = Math.max(0, Number(payload.state.rerollCount) || 0);
      const nextQuests = normalizeQuestList(payload.state.quests, payload.date || dateKey, { userId: user?.uid || 'guest', rerollCount, behavior });
      const nextState = {
        ...payload.state,
        rerollCount,
        quests: nextQuests,
      };
      setQuests(nextQuests);
      setBonusClaimed(Boolean(payload.state.bonusClaimed));
      updateMetaFromState(nextState, dateKey);
      setLoading(false);
      setError('');
    };

    window.addEventListener('daily-quest-local-updated', handleLocalQuestUpdate);
    return () => window.removeEventListener('daily-quest-local-updated', handleLocalQuestUpdate);
  }, [updateMetaFromState, user?.uid]);

  const claimQuest = useCallback(async (questId) => {
    if (!user) return;
    const dateKey = todayKey();
    const ref = doc(db, 'users', user.uid, 'dailyQuests', dateKey);
    const userRef = doc(db, 'users', user.uid);

    let reward = null;

    const behavior = deriveBehaviorProfile(dateKey);
    const local = safeReadLocal(dateKey) || createDailyQuestData(dateKey, { userId: user.uid, behavior });
    const localRerollCount = Math.max(0, Number(local.rerollCount) || 0);
    const targetQuest = normalizeQuestList(local.quests, dateKey, { userId: user.uid, rerollCount: localRerollCount, behavior }).find((q) => q.id === questId);
    if (!targetQuest || targetQuest.claimed || targetQuest.current < targetQuest.target) return;

    reward = { rewardExp: targetQuest.rewardExp, rewardCoins: targetQuest.rewardCoins };
    const updated = normalizeQuestList(local.quests, dateKey, { userId: user.uid, rerollCount: localRerollCount, behavior }).map((q) => (q.id === questId ? { ...q, claimed: true } : q));
    const nextState = { ...local, date: dateKey, rerollCount: localRerollCount, quests: updated };
    setQuests(updated);
    safeWriteLocal(nextState, dateKey);
    updateMetaFromState(nextState, dateKey);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists()
          ? snap.data()
          : {
              ...createDailyQuestData(dateKey, { userId: user.uid, behavior }),
              date: dateKey,
            };

        const rerollCount = Math.max(0, Number(data.rerollCount) || 0);
        const questsData = normalizeQuestList(data.quests, data.date || dateKey, { userId: user.uid, rerollCount, behavior });
        const remoteQuest = questsData.find((q) => q.id === questId);
        if (!remoteQuest || remoteQuest.claimed || remoteQuest.current < remoteQuest.target) return;

        const updatedRemote = questsData.map((q) => (q.id === questId ? { ...q, claimed: true } : q));
        tx.set(ref, { ...data, date: dateKey, quests: updatedRemote, bonusClaimed: Boolean(data.bonusClaimed), rerollCount }, { merge: true });
        tx.set(userRef, { coins: increment(remoteQuest.rewardCoins) }, { merge: true });
      });
    } catch (error) {
      console.warn('Daily quest remote claim unavailable, kept local:', error);
    }

    if (reward && addExp) addExp(reward.rewardExp);
  }, [user, addExp, updateMetaFromState]);

  const rerollQuests = useCallback(async () => {
    if (!user) return false;

    const dateKey = todayKey();
    const questRef = doc(db, 'users', user.uid, 'dailyQuests', dateKey);
    const behavior = deriveBehaviorProfile(dateKey);
    const local = safeReadLocal(dateKey) || createDailyQuestData(dateKey, { userId: user.uid, behavior });

    const rerollCount = Math.max(0, Number(local.rerollCount) || 0);
    if (rerollCount >= MAX_DAILY_REROLL) return false;

    const nextRerollCount = rerollCount + 1;
    const nextState = createDailyQuestData(dateKey, { userId: user.uid, rerollCount: nextRerollCount, behavior });
    setQuests(nextState.quests);
    setBonusClaimed(false);
    safeWriteLocal(nextState, dateKey);
    updateMetaFromState(nextState, dateKey);

    try {
      await setDoc(questRef, nextState, { merge: true });
    } catch (error) {
      console.warn('Không thể đồng bộ reroll daily quest lên server:', error);
    }

    return true;
  }, [user, updateMetaFromState]);

  const claimChainBonus = useCallback(async () => {
    if (!user) return;
    if (bonusClaimed || quests.length === 0 || quests.some((q) => !q.claimed)) return;

    const dateKey = todayKey();
    const ref = doc(db, 'users', user.uid, 'dailyQuests', dateKey);
    const userRef = doc(db, 'users', user.uid);
    const weekStart = getWeekStartKey(dateKey);

    let granted = false;
    let expToGrant = 0;

    const behavior = deriveBehaviorProfile(dateKey);
    const local = safeReadLocal(dateKey) || createDailyQuestData(dateKey, { userId: user.uid, behavior });
    const localAllClaimed = local.quests.length > 0 && local.quests.every((q) => q.claimed);
    if (!localAllClaimed) return;

    granted = true;
    expToGrant += QUEST_CHAIN_BONUS.rewardExp;
    const nextState = { ...local, bonusClaimed: true };
    setBonusClaimed(true);
    safeWriteLocal(nextState, dateKey);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists()
          ? snap.data()
          : {
              ...createDailyQuestData(dateKey, { userId: user.uid, behavior }),
              date: dateKey,
            };

        const rerollCount = Math.max(0, Number(data.rerollCount) || 0);
        const questsData = normalizeQuestList(data.quests, data.date || dateKey, { userId: user.uid, rerollCount, behavior });
        const allClaimed = questsData.length > 0 && questsData.every((q) => q.claimed);
        if (!allClaimed || data.bonusClaimed) return;

        const userSnap = await tx.get(userRef);
        const weeklyRaw = userSnap.exists() ? userSnap.data()?.questWeekly : null;
        const weekly = sanitizeWeeklyState(weeklyRaw, weekStart, dateKey);
        if (!weekly.completedDates.includes(dateKey)) {
          weekly.completedDates = [...weekly.completedDates, dateKey].sort();
        }
        weekly.daysCompleted = weekly.completedDates.length;
        weekly.lastCompletedDate = dateKey;

        let weeklyBonusCoins = 0;
        let weeklyBonusExp = 0;

        if (weekly.daysCompleted >= 3 && !weekly.bonus3Claimed) {
          weekly.bonus3Claimed = true;
          weeklyBonusCoins += DAILY_WEEKLY_BONUS.threeDay.rewardCoins;
          weeklyBonusExp += DAILY_WEEKLY_BONUS.threeDay.rewardExp;
        }

        if (weekly.daysCompleted >= 7 && !weekly.bonus7Claimed) {
          weekly.bonus7Claimed = true;
          weeklyBonusCoins += DAILY_WEEKLY_BONUS.sevenDay.rewardCoins;
          weeklyBonusExp += DAILY_WEEKLY_BONUS.sevenDay.rewardExp;
        }

        expToGrant += weeklyBonusExp;

        tx.set(ref, { ...data, date: dateKey, quests: questsData, bonusClaimed: true, rerollCount }, { merge: true });
        tx.set(userRef, {
          coins: increment(QUEST_CHAIN_BONUS.rewardCoins + weeklyBonusCoins),
          dailyChainWins: increment(1),
          questWeekly: weekly,
        }, { merge: true });
      });
    } catch (error) {
      console.warn('Daily quest remote bonus unavailable, kept local:', error);
    }

    if (granted && addExp && expToGrant > 0) addExp(expToGrant);
  }, [user, quests, bonusClaimed, addExp]);

  return {
    quests,
    loading,
    error,
    bonusClaimed,
    claimQuest,
    claimChainBonus,
    rerollQuests,
    meta,
  };
}

function DailyQuestPageMain({ user, userData, addExp }) {
  const { quests, loading, error, bonusClaimed, claimQuest, claimChainBonus, rerollQuests, meta } = useDailyQuests(user, userData, addExp);

  const completedCount = quests.filter((q) => q.claimed).length;
  const allClaimed = quests.length > 0 && completedCount === quests.length;

  if (loading) return <div className="p-10 text-center text-gray-500 font-bold animate-pulse">Đang tải nhiệm vụ...</div>;

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mt-6 mb-20">
      
      {/* Banner của Trang */}
      <div className="bg-linear-to-r from-indigo-500 to-purple-600 p-6 text-white">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-black text-2xl">📋 Nhiệm Vụ Hàng Ngày</h2>
            <p className="text-white/80 text-sm mt-1">{meta.eventLabel}</p>
          </div>
          <span className="font-black text-3xl">{completedCount}/{quests.length}</span>
        </div>
        <div className="mt-4 bg-white/20 rounded-full h-3 overflow-hidden">
          <div className="bg-white h-full rounded-full transition-all duration-500" style={{ width: `${(completedCount / Math.max(1, quests.length)) * 100}%` }} />
        </div>
      </div>

      <div className="p-6 flex flex-col gap-4">
        {error && (
          <div className="text-sm font-bold rounded-xl border border-amber-200 bg-amber-50 text-amber-700 px-4 py-3 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300">
            {error}
          </div>
        )}

        {/* Nút đổi nhiệm vụ */}
        <div className="rounded-2xl border border-indigo-100 dark:border-gray-700 bg-indigo-50/60 dark:bg-gray-900 p-4 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-black text-indigo-700 dark:text-indigo-300">Bạn muốn đổi nhiệm vụ khác?</p>
            <p className="text-xs font-medium text-indigo-500 dark:text-indigo-400 mt-0.5">Hôm nay còn {meta.rerollsLeft} lần đổi</p>
          </div>
          <button
            onClick={rerollQuests}
            disabled={meta.rerollsLeft <= 0}
            className={`text-sm font-black px-4 py-2 rounded-xl transition-all ${meta.rerollsLeft > 0 ? 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 shadow-md' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}
          >
            Đổi nhiệm vụ
          </button>
        </div>

        {/* Danh sách nhiệm vụ */}
        <div className="flex flex-col gap-3 mt-2">
          {quests.map((q) => (
            <QuestBar key={q.id} quest={{ ...q, onClaim: () => claimQuest(q.id) }} />
          ))}
        </div>

        {/* Hộp quà chuỗi ngày */}
        <div className={`mt-4 p-5 rounded-2xl border-2 transition-colors ${bonusClaimed ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 opacity-70' : allClaimed ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 dark:border-yellow-600 shadow-md' : 'bg-gray-50 dark:bg-gray-900 border-dashed border-gray-200 dark:border-gray-700'}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-black text-base text-yellow-700 dark:text-yellow-400">🏆 Thưởng hoàn thành chuỗi</p>
              <p className="text-sm font-bold text-gray-600 dark:text-gray-300 mt-1">+{QUEST_CHAIN_BONUS.rewardExp} EXP · +{QUEST_CHAIN_BONUS.rewardCoins} <CoinIcon className="w-4 h-4" /></p>
            </div>
            {bonusClaimed ? (
              <span className="text-green-600 dark:text-green-400 font-black px-4 py-2 bg-green-100 dark:bg-green-900/30 rounded-xl">Đã nhận ✔️</span>
            ) : (
              <button
                onClick={claimChainBonus}
                disabled={!allClaimed}
                className={`font-black text-sm px-5 py-2.5 rounded-xl transition-all ${allClaimed ? 'bg-yellow-500 hover:bg-yellow-600 text-white active:scale-95 shadow-lg shadow-yellow-500/30 animate-bounce' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}
              >
                Mở quà
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export {
  QUEST_CHAIN_BONUS,
  DAILY_WEEKLY_BONUS,
  createDailyQuestData,
  normalizeQuestList,
  todayKey,
  getEventForDate,
  buildQuestDefs as getQuestDefsForDate,
};

// Đổi tên export mặc định thành Page để tương thích với Routes trong App.jsx
export default DailyQuestPageMain;