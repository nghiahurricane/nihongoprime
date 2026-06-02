import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { HashRouter as Router, Route, Routes, NavLink, Link, useLocation } from 'react-router-dom';
import { collection, query, onSnapshot, doc, getDoc, getDocs, getDocsFromCache, updateDoc, setDoc, increment, runTransaction } from 'firebase/firestore';
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth';
import { db, auth, provider } from './firebase';

import { DarkModeProvider, useDarkMode } from './darkmode';
import { calcLevelFromExp } from './Expsystem';
import DailyQuestPanel from './Dailyquest';
import { createDailyQuestData, normalizeQuestList } from './Dailyquest';
import LevelUpToast from './Leveluptoast';
import HomePage from './Homepage';
import StatsPage from './Statspage';
import { DialogProvider } from './DialogContext'; 
import bgmLoopSound from './assets/sounds/bgm-loop.wav';

const InputPage = lazy(() => import('./InputPage'));
const StudyPage = lazy(() => import('./StudyPage'));
const QuizPage = lazy(() => import('./QuizPage'));
const ProfilePage = lazy(() => import('./ProfilePage'));
const SettingsPage = lazy(() => import('./SettingsPage'));
const LeaderboardPage = lazy(() => import('./LeaderboardPage'));
const ChallengePage = lazy(() => import('./ChallengePage'));
const ShopPage = lazy(() => import('./ShopPage'));
const DailyQuestPage = lazy(() => import('./DailyQuestPage'));

const VOCAB_CACHE_SYNC_MS = 1000 * 60 * 60 * 12;
const VOCAB_LAST_SYNC_KEY = 'nihongo:vocab:lastServerSyncAt';
const BGM_VOLUME_KEY = 'nihongo:bgmVolume';
const SFX_VOLUME_KEY = 'nihongo:sfxVolume';
const STUDY_SESSION_WORDS_KEY = 'nihongo:studySessionWords';
const REVIEW_SESSION_WORDS_KEY = 'nihongo:reviewSessionWords';
const LEGACY_ADMIN_EMAIL = 'nghianguyenvan.ulis.vnu@gmail.com';
const STUDY_SESSION_OPTIONS = [10, 20, 30];
const REVIEW_SESSION_OPTIONS = [10, 30, 50, 100];

// HÀM LẤY ĐÚNG MÚI GIỜ ĐỊA PHƯƠNG (VD: NHẬT BẢN)
const getLocalDateStr = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateLocal = (dateStr) => {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const localQuestKey = (dateKey) => `nihongo:dailyQuestState:${dateKey}`;
const readLocalQuestState = (dateKey) => {
  try {
    const raw = localStorage.getItem(localQuestKey(dateKey));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeLocalQuestState = (dateKey, state) => {
  try {
    localStorage.setItem(localQuestKey(dateKey), JSON.stringify(state));
  } catch (error) {
    console.warn('Lỗi lưu local nhiệm vụ ngày:', error);
  }
};

const nearestOption = (value, options, fallback) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return options.reduce((best, current) => (Math.abs(current - num) < Math.abs(best - num) ? current : best), options[0]);
};

const CoinIcon = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" className={`inline-block drop-shadow-sm ${className}`} xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="#FCD34D" stroke="#F59E0B" strokeWidth="2"/>
    <circle cx="12" cy="12" r="6" fill="#FBBF24" stroke="#D97706" strokeWidth="1.5"/>
    <path d="M12 9V15" stroke="#D97706" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

function App() {
  const [vocabList, setVocabList] = useState([]);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null); 
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isUserDataReady, setIsUserDataReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [bgmVolume, setBgmVolume] = useState(() => {
    const saved = Number(localStorage.getItem(BGM_VOLUME_KEY));
    return Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 0.3;
  });
  const [sfxVolume, setSfxVolume] = useState(() => {
    const saved = Number(localStorage.getItem(SFX_VOLUME_KEY));
    return Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 0.8;
  });
  const [studySessionWordCount, setStudySessionWordCount] = useState(() => {
    const saved = Number(localStorage.getItem(STUDY_SESSION_WORDS_KEY));
    return nearestOption(saved, STUDY_SESSION_OPTIONS, 10);
  });
  const [reviewSessionWordCount, setReviewSessionWordCount] = useState(() => {
    const saved = Number(localStorage.getItem(REVIEW_SESSION_WORDS_KEY));
    return nearestOption(saved, REVIEW_SESSION_OPTIONS, 10);
  });

  const [showAudioPanel, setShowAudioPanel] = useState(false);
  const [levelUpData, setLevelUpData] = useState(null);
  const [showPwaUpdateModal, setShowPwaUpdateModal] = useState(false);
  const prevExpRef = React.useRef(null);
  const lastBgmVolumeRef = useRef(0.3);
  const lastSfxVolumeRef = useRef(0.8);
  const loginFallbackTimerRef = useRef(null);
  const bgmAudioContextRef = useRef(null);
  const bgmSourceRef = useRef(null);
  const bgmGainRef = useRef(null);
  const isAdmin = userData?.role === 'admin' || user?.email === LEGACY_ADMIN_EMAIL;

  const clearLoginFallbackTimer = () => {
    if (loginFallbackTimerRef.current) {
      window.clearTimeout(loginFallbackTimerRef.current);
      loginFallbackTimerRef.current = null;
    }
  };

  const stopLoginLoading = () => {
    clearLoginFallbackTimer();
    setIsLoggingIn(false);
  };

  // CƠ CHẾ AUTO-RELOAD KHI QUA NGÀY MỚI
  useEffect(() => {
    const checkMidnightReset = () => {
      const currentDay = getLocalDateStr();
      const lastDay = localStorage.getItem('nihongo:lastActiveDay');
      if (lastDay && lastDay !== currentDay) {
        localStorage.setItem('nihongo:lastActiveDay', currentDay);
        window.location.reload(); 
      } else if (!lastDay) {
        localStorage.setItem('nihongo:lastActiveDay', currentDay);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkMidnightReset();
      }
    };

    checkMidnightReset(); 
    window.addEventListener('visibilitychange', handleVisibilityChange);
    return () => window.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    const handlePwaUpdateReady = () => {
      setShowPwaUpdateModal(true);
    };

    try {
      if (localStorage.getItem('nihongo:pwa-update-ready') === '1') {
        setShowPwaUpdateModal(true);
      }
    } catch {
      // ignore localStorage issues
    }

    window.addEventListener('nihongo:pwa-update-ready', handlePwaUpdateReady);
    return () => window.removeEventListener('nihongo:pwa-update-ready', handlePwaUpdateReady);
  }, []);

  const applyPwaUpdate = () => {
    try {
      localStorage.removeItem('nihongo:pwa-update-ready');
    } catch {
      // ignore localStorage issues
    }
    const applyFn = window.__nihongoApplyUpdate;
    if (typeof applyFn === 'function') {
      applyFn();
      return;
    }
    window.location.reload();
  };

  // ── EXP System ─────────────────────────────────────────────
  const addExp = async (amount) => {
    if (!user) return;
    try { await updateDoc(doc(db, 'users', user.uid), { exp: increment(amount) }); }
    catch (e) { console.error('Lỗi cộng EXP:', e); }
  };

  const updateDailyQuestProgress = async (questId, options = {}) => {
    if (!user) return;
    const amount = Math.max(0, Number(options.amount) || 0);
    const complete = Boolean(options.complete);
    const today = getLocalDateStr();
    const questRef = doc(db, 'users', user.uid, 'dailyQuests', today);

    const localFallback = createDailyQuestData(today, { userId: user.uid });
    const localState = readLocalQuestState(today) || localFallback;
    const normalizedLocalQuests = normalizeQuestList(localState.quests, localState.date || today, { userId: user.uid, rerollCount: localState.rerollCount || 0 });
    const hasMatch = normalizedLocalQuests.some((quest) => (quest.id === questId || quest.track === questId));
    if (!hasMatch) return;

    const optimisticQuests = normalizedLocalQuests.map((quest) => {
      if ((quest.id !== questId && quest.track !== questId) || quest.claimed) return quest;
      const nextCurrent = complete ? quest.target : quest.current + amount;
      return {
        ...quest,
        current: Math.max(0, Math.min(quest.target, nextCurrent)),
      };
    });
    const optimisticState = {
      date: localState.date || today,
      bonusClaimed: Boolean(localState.bonusClaimed),
      quests: optimisticQuests,
    };

    writeLocalQuestState(today, optimisticState);
    window.dispatchEvent(new CustomEvent('daily-quest-local-updated', {
      detail: { date: today, state: optimisticState },
    }));

    try {
      let committedState = null;

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(questRef);
        const baseData = snap.exists() ? snap.data() : createDailyQuestData(today, { userId: user.uid });
        const baseDate = baseData.date || today;
        const baseRerollCount = Math.max(0, Number(baseData.rerollCount) || 0);

        const currentQuests = normalizeQuestList(baseData.quests, baseDate, { userId: user.uid, rerollCount: baseRerollCount });
        const updatedQuests = currentQuests.map((quest) => {
          if ((quest.id !== questId && quest.track !== questId) || quest.claimed) return quest;
          const nextCurrent = complete ? quest.target : quest.current + amount;
          return {
            ...quest,
            current: Math.max(0, Math.min(quest.target, nextCurrent)),
          };
        });

        committedState = {
          date: baseDate,
          bonusClaimed: Boolean(baseData.bonusClaimed),
          rerollCount: baseRerollCount,
          quests: updatedQuests,
        };

        if (baseData.eventId !== undefined && baseData.eventId !== null) {
          committedState.eventId = baseData.eventId;
        }
        if (baseData.eventLabel !== undefined && baseData.eventLabel !== null) {
          committedState.eventLabel = baseData.eventLabel;
        }

        if (snap.exists()) {
          tx.update(questRef, committedState);
        } else {
          tx.set(questRef, committedState);
        }
      });

      if (committedState) {
        writeLocalQuestState(today, committedState);
        window.dispatchEvent(new CustomEvent('daily-quest-local-updated', {
          detail: { date: today, state: committedState },
        }));
      }
    } catch (error) {
      setDoc(questRef, optimisticState, { merge: true }).catch(() => {});
      console.warn('Lỗi cập nhật tiến độ nhiệm vụ ngày (đã giữ local):', error);
    }
  };

  // Level-up detection
  React.useEffect(() => {
    if (userData?.exp == null) return;
    const cur = userData.exp;
    if (prevExpRef.current !== null && cur > prevExpRef.current) {
      const { level: oldLv } = calcLevelFromExp(prevExpRef.current);
      const { level: newLv } = calcLevelFromExp(cur);
      if (newLv > oldLv) setLevelUpData({ oldLevel: oldLv, newLevel: newLv });
    }
    prevExpRef.current = cur;
  }, [userData?.exp]);
  const bgmRef = useRef(null);

  const ensureBgmGraph = () => {
    if (!bgmRef.current) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!bgmAudioContextRef.current) {
      bgmAudioContextRef.current = new AudioContextClass();
    }

    if (!bgmSourceRef.current) {
      try {
        bgmSourceRef.current = bgmAudioContextRef.current.createMediaElementSource(bgmRef.current);
        bgmGainRef.current = bgmAudioContextRef.current.createGain();
        bgmSourceRef.current.connect(bgmGainRef.current);
        bgmGainRef.current.connect(bgmAudioContextRef.current.destination);
      } catch (error) {
        console.warn('Không thể khởi tạo graph âm thanh BGM:', error);
        return null;
      }
    }

    return bgmAudioContextRef.current;
  };

  const applyBgmVolume = (nextVolume) => {
    const volume = clampVolume(nextVolume);
    if (bgmGainRef.current) {
      bgmGainRef.current.gain.setValueAtTime(volume, bgmAudioContextRef.current?.currentTime || 0);
    }
    if (bgmRef.current) {
      bgmRef.current.volume = volume;
      bgmRef.current.muted = volume === 0;
    }
  };

  const clampVolume = (value) => Math.max(0, Math.min(1, Math.round(value * 100) / 100));
  const tryPlayBgm = () => {
    if (!bgmRef.current) return;
    const audioContext = ensureBgmGraph();
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    applyBgmVolume(bgmVolume);
    bgmRef.current.play().catch(e => console.log("Lỗi play BGM:", e));
  };

  const toggleBgmMuteQuick = () => {
    if (bgmVolume > 0) {
      lastBgmVolumeRef.current = bgmVolume;
      setBgmVolume(0);
      applyBgmVolume(0);
      return;
    }

    const restored = lastBgmVolumeRef.current || 0.3;
    setBgmVolume(restored);
    applyBgmVolume(restored);
    tryPlayBgm();
  };

  const toggleSfxMuteQuick = () => {
    if (sfxVolume > 0) {
      lastSfxVolumeRef.current = sfxVolume;
      setSfxVolume(0);
      return;
    }

    setSfxVolume(lastSfxVolumeRef.current || 0.8);
  };

  const handleBgmSliderChange = (value) => {
    const next = clampVolume(value);
    setBgmVolume(next);
    applyBgmVolume(next);
    if (next > 0) {
      lastBgmVolumeRef.current = next;
      tryPlayBgm();
    }
  };

  const handleSfxSliderChange = (value) => {
    const next = clampVolume(value);
    setSfxVolume(next);
    if (next > 0) {
      lastSfxVolumeRef.current = next;
    }
  };

  const handleStudySessionWordCountChange = (value) => {
    setStudySessionWordCount(nearestOption(value, STUDY_SESSION_OPTIONS, studySessionWordCount));
  };

  const handleReviewSessionWordCountChange = (value) => {
    setReviewSessionWordCount(nearestOption(value, REVIEW_SESSION_OPTIONS, reviewSessionWordCount));
  };

  useEffect(() => {
    localStorage.setItem(BGM_VOLUME_KEY, String(bgmVolume));
    applyBgmVolume(bgmVolume);
  }, [bgmVolume]);

  useEffect(() => {
    if (!bgmRef.current) return;
    applyBgmVolume(bgmVolume);
  }, [bgmVolume, user]);

  useEffect(() => {
    localStorage.setItem(SFX_VOLUME_KEY, String(sfxVolume));
  }, [sfxVolume]);

  useEffect(() => {
    localStorage.setItem(STUDY_SESSION_WORDS_KEY, String(studySessionWordCount));
  }, [studySessionWordCount]);

  useEffect(() => {
    localStorage.setItem(REVIEW_SESSION_WORDS_KEY, String(reviewSessionWordCount));
  }, [reviewSessionWordCount]);

  useEffect(() => {
    if (bgmVolume > 0) {
      lastBgmVolumeRef.current = bgmVolume;
    }
  }, [bgmVolume]);

  useEffect(() => {
    if (sfxVolume > 0) {
      lastSfxVolumeRef.current = sfxVolume;
    }
  }, [sfxVolume]);

  const audioPanelRef = useRef(null);
  const audioPanelButtonRef = useRef(null);

  useEffect(() => {
    if (!showAudioPanel) return;

    const handleOutsideClick = (event) => {
      const target = event.target;
      if (audioPanelRef.current?.contains(target)) return;
      if (audioPanelButtonRef.current?.contains(target)) return;
      setShowAudioPanel(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showAudioPanel]);

  useEffect(() => {
    let isMounted = true;

    getRedirectResult(auth)
      .catch((error) => {
        console.error('Lỗi PWA Redirect:', error);
      })
      .finally(() => {
        if (isMounted) {
          stopLoginLoading();
        }
      });

    return () => {
      isMounted = false;
      clearLoginFallbackTimer();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        try {
          const snap = await getDoc(userDocRef);
          const todayStr = getLocalDateStr();
          
          if (snap.exists()) {
            const data = snap.data();
            const lastActiveStr = data.lastActive || todayStr;
            const todayDate = parseDateLocal(todayStr);
            const lastActiveDate = parseDateLocal(lastActiveStr);
            const diffTime = todayDate - lastActiveDate;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            let updates = {};
            if (currentUser.email === LEGACY_ADMIN_EMAIL && data.role !== 'admin') {
              updates.role = 'admin';
            }

            if (diffDays > 1) {
              const freezeCards = data.freezeCards || 0;
              const missedDays = diffDays - 1;

              if (freezeCards >= missedDays) {
                updates.freezeCards = freezeCards - missedDays;
                updates.lastActive = todayStr;
                updates._autoUsedFreeze = missedDays;
              } else {
                updates.streak = 0;
                updates.lastActive = todayStr;
                if (freezeCards > 0) {
                  updates.freezeCards = 0; 
                }
              }
            }

            if (Object.keys(updates).length > 0) {
              await updateDoc(userDocRef, updates);
            }
          } else {
            await setDoc(userDocRef, {
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              email: currentUser.email,
              role: currentUser.email === LEGACY_ADMIN_EMAIL ? 'admin' : 'user',
              lastActive: todayStr,
              streak: 0,
              score: 0,
              coins: 100, 
              freezeCards: 0,
              titles: [],
              dailyChainWins: 0,
              inventory: {
                hintTicket: 0,
                retryToken: 0,
                xpBoost: 0,
                shieldToken: 0,
              }
            });
          }
        } catch (e) { console.error("Lỗi lấy thông tin User:", e); }
      } else {
        setUserData(null);
        setVocabList([]);
        setIsUserDataReady(false);
      }
      setIsAuthChecking(false);
      stopLoginLoading();
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) setUserData(docSnap.data());
      setIsUserDataReady(true);
    });
    return () => unsub();
  }, [user]);

  // Tối ưu đọc dữ liệu: ưu tiên cache IndexedDB, chỉ sync server theo chu kỳ.
  useEffect(() => {
    if (!user) return;

    let isUnmounted = false;
    let baseVocab = [];
    let userProgress = {};
    const vocabQuery = query(collection(db, 'vocabularies'));

    // TÁC VỤ 1: Debounce mergeData() (Giảm re-render ngay lập tức)
    let debounceTimer;
    const mergeData = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (baseVocab.length === 0) return;
        const merged = baseVocab.map(v => {
          const p = userProgress[v.id] || { correctCount: 0, wrongCount: 0, srsLevel: 0 };
          return { ...v, ...p, id: v.id };
        });
        if (!isUnmounted) {
          setVocabList(merged);
        }
      }, 300); // 300ms debounce
    };

    const loadVocabularyWithCache = async () => {
      try {
        const cacheSnapshot = await getDocsFromCache(vocabQuery);
        if (!isUnmounted && !cacheSnapshot.empty) {
          baseVocab = cacheSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          mergeData();
        }
      } catch {
        console.log('Không có cache vocab cục bộ, bỏ qua bước cache.');
      }

      const lastSyncAt = Number(localStorage.getItem(VOCAB_LAST_SYNC_KEY) || 0);
      const cacheStale = Date.now() - lastSyncAt > VOCAB_CACHE_SYNC_MS;
      const shouldFetchServer = isAdmin || baseVocab.length === 0 || cacheStale;

      if (!shouldFetchServer) return;

      try {
        const serverSnapshot = await getDocs(vocabQuery);
        if (!isUnmounted) {
          baseVocab = serverSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          localStorage.setItem(VOCAB_LAST_SYNC_KEY, String(Date.now()));
          mergeData();
        }
      } catch (error) {
        console.error('Lỗi đồng bộ vocab từ server:', error);
      }
    };

    loadVocabularyWithCache();

    // Realtime vocab sync để thêm/xóa/sửa phản ánh ngay không cần reload.
    const unsubVocab = onSnapshot(vocabQuery, (snapshot) => {
      baseVocab = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (!isUnmounted) {
        localStorage.setItem(VOCAB_LAST_SYNC_KEY, String(Date.now()));
        mergeData();
      }
    }, (error) => {
      console.error('Lỗi realtime sync vocab:', error);
    });

    // TÁC VỤ 2: Migrate progress sub-collection -> progressMap document (Giảm 3000x reads)
    const unsubProgress = onSnapshot(doc(db, 'users', user.uid, 'progressMap', 'default'), (docSnap) => {
      if (docSnap.exists()) {
        userProgress = docSnap.data();
      } else {
        userProgress = {};
      }
      mergeData();
    });

    return () => {
      isUnmounted = true;
      clearTimeout(debounceTimer);
      unsubVocab();
      unsubProgress();
    };
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user || vocabList.length === 0) return;
    const checkAndSendNotification = async () => {
      const now = new Date();
      const reviewWordsCount = vocabList.filter(v => {
        if (!v.nextReview) return false;
        const reviewDate = v.nextReview instanceof Date ? v.nextReview : new Date(v.nextReview.seconds ? v.nextReview.seconds * 1000 : v.nextReview);
        return reviewDate <= now && (v.srsLevel || 0) > 0;
      }).length;

      if (reviewWordsCount > 0) {
        const todayStr = getLocalDateStr();
        const lastNotified = localStorage.getItem('lastNotifiedDate');

        if (lastNotified !== todayStr) {
          if (!("Notification" in window)) return;
          let permission = Notification.permission;
          if (permission !== "granted" && permission !== "denied") permission = await Notification.requestPermission();
          if (permission === "granted") {
            const notification = new Notification("Nihongo Prime - Đến giờ học rồi!", {
              body: `🔥 Ê, hôm nay bạn có ${reviewWordsCount} từ cần ôn tập (SRS Level tụt), vào học ngay kẻo mất Streak nhé!`,
              icon: user.photoURL || '/vite.svg',
            });
            notification.onclick = () => window.focus();
            localStorage.setItem('lastNotifiedDate', todayStr);
          }
        }
      }
    };
    const timer = setTimeout(() => checkAndSendNotification(), 3000);
    return () => clearTimeout(timer);
  }, [user, vocabList]);

  const handleCompleteLesson = async (sessionInfo = {}) => {
    if (!user) return;
    const userDocRef = doc(db, 'users', user.uid);
    try {
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const data = snap.data();
        const todayStr = getLocalDateStr();
        
        if (data.lastActive !== todayStr) {
          const newStreak = (data.streak || 0) + 1;
          await updateDoc(userDocRef, {
            lastActive: todayStr,
            streak: newStreak,
            coins: increment(20) 
          });
        } else {
          await updateDoc(userDocRef, {
            coins: increment(20) 
          });
        }
      }
    } catch (error) { console.error("Lỗi cập nhật Streak:", error); }

    if (sessionInfo.type === 'study_session') {
      const totalWordsStudied = Math.max(0, Number(sessionInfo.wordsStudied) || 0);
      const realtimeSent = Math.max(0, Number(sessionInfo.studyQuestProgressSent) || 0);
      const fallbackWords = Math.max(0, totalWordsStudied - realtimeSent);

      // Fallback để không bị hụt progress nếu event realtime bị miss.
      if (fallbackWords > 0) {
        await updateDailyQuestProgress('study_words', { amount: fallbackWords });
      }

      await updateDailyQuestProgress('study_sessions', { amount: 1 });
      if (sessionInfo.mode === 'REVIEW') {
        await updateDailyQuestProgress('review_sessions', { amount: 1 });
      }

      if (sessionInfo.reachedCombo10) {
        await updateDailyQuestProgress('combo_10', { complete: true });
      }
      return;
    }

    if (sessionInfo.type === 'quiz_session') {
      await updateDailyQuestProgress('quiz_sessions', { amount: 1 });
      if (sessionInfo.reachedCombo10) {
        await updateDailyQuestProgress('combo_10', { complete: true });
      }
    }
  };

  const handleQuestProgressEvent = async (event = {}) => {
    if (!user) return;

    if (event.type === 'study_word_completed') {
      const amount = Math.max(0, Number(event.amount) || 0);
      if (amount > 0) {
        await updateDailyQuestProgress('study_words', { amount });
      }
      return;
    }

    if (event.type === 'combo_10') {
      await updateDailyQuestProgress('combo_10', { complete: true });
    }
  };

  const handleLogin = () => {
    setIsLoggingIn(true);

    clearLoginFallbackTimer();
    loginFallbackTimerRef.current = window.setTimeout(() => {
      setIsLoggingIn(false);
      loginFallbackTimerRef.current = null;
    }, 15000);

    signInWithPopup(auth, provider).catch((error) => {
      console.error("Lỗi đăng nhập Popup:", error);

      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request' || error.code === 'auth/user-cancelled') {
        stopLoginLoading();
        return;
      }

      if (error.code === 'auth/popup-blocked') {
        clearLoginFallbackTimer();
        signInWithRedirect(auth, provider).catch((redirectError) => {
          console.error('Lỗi đăng nhập Redirect:', redirectError);
          stopLoginLoading();
        });
        return;
      }

      stopLoginLoading();
    });
  };

  const handleLogout = () => signOut(auth);

  React.useEffect(() => {
    if (!isAuthChecking && (!user || isUserDataReady)) {
      setSplashFading(true);
      const t = setTimeout(() => setShowSplash(false), 500);
      return () => clearTimeout(t);
    }
  }, [isAuthChecking, user, isUserDataReady]);

  if (!user) {
    return (
      <DarkModeProvider>
        {showSplash && (
          <div
            className="fixed inset-0 z-[999]"
            style={{
              transition: 'opacity 0.5s ease',
              opacity: splashFading ? 0 : 1,
              pointerEvents: splashFading ? 'none' : 'auto',
            }}
          >
            <PremiumLoadingScreen message="Đang mở Nihongo Prime..." />
          </div>
        )}
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors px-6">
        <div className="mb-6">
          <img src="/app-logo-cropped.png" alt="Nihongo Prime" className="w-24 h-24 rounded-[22px]" />
        </div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-4 tracking-wide">Nihongo Prime</h1>
        <p className="text-gray-600 dark:text-gray-300 mb-6 text-center max-w-sm">Vui lòng đăng nhập để lưu tiến trình học.</p>
        <button
          onClick={handleLogin}
          disabled={isLoggingIn}
          className={`font-bold py-3 px-6 rounded-xl shadow-md transition-all text-white flex items-center gap-2 ${isLoggingIn ? 'bg-indigo-400 cursor-not-allowed scale-95' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'}`}
        >
          {isLoggingIn && <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
          {isLoggingIn ? 'Đang mở đăng nhập...' : 'Đăng nhập bằng Google'}
        </button>
      </div>
      </DarkModeProvider>
    );
  }

  return (
    <DarkModeProvider>
      <DialogProvider> 
        <Router>
          <audio ref={bgmRef} src={bgmLoopSound} loop preload="none" />
          <div className="min-h-screen pb-20 md:pb-0 bg-gray-50 dark:bg-gray-900 transition-colors relative">
            <header
              className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-50 w-full"
              style={{ paddingTop: 'env(safe-area-inset-top)' }}
            >
              <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center w-full">
                
                {/* LOGO KIÊM NÚT TRỞ VỀ HOMEPAGE + THÊM NÚT SHOP TRÊN HEADER */}
                <div className="flex items-center gap-1 md:gap-2">
                  <Link to="/" className="text-lg md:text-xl font-bold text-indigo-600 tracking-tight flex items-center gap-1 md:gap-2 hover:opacity-80 transition-opacity cursor-pointer">
                    <img src="/app-logo-cropped.png" alt="Nihongo Prime" className="w-8 h-8 rounded-full border border-indigo-200 sm:hidden" />
                    <span className="hidden sm:block">Nihongo Prime</span>
                  </Link>

                  {userData?.streak > 0 && (
                    <span id="streak-fire" className="ml-1 text-orange-500 text-xl md:text-2xl flex items-center gap-1 cursor-default" title={`Chuỗi học: ${userData.streak}`}>
                      🔥<span className="text-sm md:text-base font-black">{userData.streak}</span>
                    </span>
                  )}
                  {userData?.coins !== undefined && (
                    <Link to="/shop" className="ml-1 text-yellow-600 font-black text-xs md:text-sm bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded-lg flex items-center gap-1 hover:scale-105 transition-transform" title="Vào cửa hàng">
                      <CoinIcon className="w-4 h-4" /> {userData.coins}
                      <span className="text-sm ml-0.5">🛒</span>
                    </Link>
                  )}
                </div>

                <div className="flex items-center gap-2 md:gap-3">
                  <nav className="hidden md:flex items-center gap-1">
                    {/* CÁC NÚT TÍNH NĂNG CỐT LÕI */}
                    <NavLink to="/study" className={({isActive}) => `px-2 lg:px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-1 ${isActive ? 'bg-indigo-100 text-indigo-700 dark:bg-gray-700 dark:text-white' : 'text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>🎴 Flashcard</NavLink>
                    <NavLink to="/quiz" className={({isActive}) => `px-2 lg:px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-1 ${isActive ? 'bg-indigo-100 text-indigo-700 dark:bg-gray-700 dark:text-white' : 'text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>🎮 Quiz</NavLink>
                    <NavLink to="/challenge" className={({isActive}) => `px-2 lg:px-3 py-2 rounded-xl text-sm font-black transition-colors flex items-center gap-1 ${isActive ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'text-gray-600 dark:text-gray-200 hover:bg-red-50 dark:hover:bg-gray-700'}`}>⚔️ Đấu</NavLink>
                    <NavLink to="/shop" className={({isActive}) => `px-2 lg:px-3 py-2 rounded-xl text-sm font-black transition-colors flex items-center gap-1 ${isActive ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400' : 'text-gray-600 dark:text-gray-200 hover:bg-pink-50 dark:hover:bg-gray-700'}`}>🎰 Gacha</NavLink>
                    <NavLink to="/leaderboard" className={({isActive}) => `px-2 lg:px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-1 ${isActive ? 'bg-yellow-100 text-yellow-700 dark:bg-gray-700 dark:text-yellow-300' : 'text-gray-600 dark:text-gray-200 hover:bg-yellow-50 dark:hover:bg-gray-700'}`}>🏆 BXH</NavLink>
                    
                    {/* DROPDOWN MENU */}
                    <div className="relative group ml-1">
                      <button className="px-2 lg:px-3 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1 transition-colors">
                        <img src={user.photoURL} alt="Avatar" className="w-5 h-5 rounded-full border border-indigo-200" referrerPolicy="no-referrer" />
                        Cá nhân <span className="text-[10px]">▼</span>
                      </button>
                      
                      <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] border border-gray-100 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 flex flex-col overflow-hidden z-[100] transform origin-top-right scale-95 group-hover:scale-100">
                        <NavLink to="/profile" className={({isActive}) => `px-4 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700 dark:bg-gray-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>👤 Hồ Sơ</NavLink>
                        <NavLink to="/daily-quests" className={({isActive}) => `px-4 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700 dark:bg-gray-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>📋 Nhiệm Vụ Ngày</NavLink>
                        <NavLink to="/settings" className={({isActive}) => `px-4 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700 dark:bg-gray-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>⚙️ Cài Đặt</NavLink>
                        <NavLink to="/stats" className={({isActive}) => `px-4 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700 dark:bg-gray-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>📊 Thống Kê</NavLink>
                        {isAdmin && (
                          <NavLink to="/input" className={({isActive}) => `px-4 py-3 text-sm font-medium flex items-center gap-2 border-t border-gray-100 dark:border-gray-700 transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700 dark:bg-gray-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>⌨️ Nhập Liệu</NavLink>
                        )}
                        <button onClick={handleLogout} className="px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-left flex items-center gap-2 border-t border-gray-100 dark:border-gray-700 w-full transition-colors">🚪 Đăng xuất</button>
                      </div>
                    </div>
                  </nav>

                  <div className="flex items-center gap-1 md:gap-2 relative">
                    <div className="h-9 md:h-10 flex items-center rounded-full border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 overflow-hidden">
                      <button
                        onClick={toggleBgmMuteQuick}
                        className={`w-9 md:w-10 h-full flex items-center justify-center transition-colors ${bgmVolume > 0 ? 'text-indigo-600 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/40' : 'text-gray-400 dark:text-gray-300'}`}
                        title={bgmVolume > 0 ? 'Tắt tiếng nhanh BGM' : 'Bật lại tiếng BGM'}
                      >
                        {bgmVolume > 0 ? '🔊' : '🔇'}
                      </button>
                      <button
                        ref={audioPanelButtonRef}
                        onClick={() => setShowAudioPanel(prev => !prev)}
                        className="w-7 md:w-8 h-full flex items-center justify-center text-gray-500 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors border-l border-gray-200 dark:border-gray-600"
                        title="Mở cài đặt âm thanh"
                      >
                        ▾
                      </button>
                    </div>
                    <DarkModeToggle />

                    {showAudioPanel && (
                      <div
                        ref={audioPanelRef}
                        className="absolute top-12 right-0 md:right-12 w-72 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-xl p-4 z-[120]"
                      >
                        <h4 className="font-black text-gray-800 dark:text-gray-100 mb-3">Âm thanh nhanh</h4>

                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <label htmlFor="quick-bgm-slider" className="text-sm font-bold text-gray-700 dark:text-gray-200">Nhạc nền (BGM)</label>
                            <span className="text-xs font-black text-indigo-600 dark:text-indigo-300">{Math.round(bgmVolume * 100)}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={toggleBgmMuteQuick}
                              className={`w-9 h-9 rounded-lg border text-lg ${bgmVolume > 0 ? 'border-indigo-200 text-indigo-600 bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:bg-indigo-900/30' : 'border-gray-200 text-gray-400 bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:bg-gray-700'}`}
                              title={bgmVolume > 0 ? 'Tắt tiếng BGM' : 'Bật tiếng BGM'}
                            >
                              {bgmVolume > 0 ? '🔊' : '🔇'}
                            </button>
                            <input
                              id="quick-bgm-slider"
                              type="range"
                              min="0"
                              max="100"
                              step="1"
                              value={Math.round(bgmVolume * 100)}
                              onChange={(e) => handleBgmSliderChange(Number(e.target.value) / 100)}
                              className="flex-1 accent-indigo-600"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label htmlFor="quick-sfx-slider" className="text-sm font-bold text-gray-700 dark:text-gray-200">SFX</label>
                            <span className="text-xs font-black text-indigo-600 dark:text-indigo-300">{Math.round(sfxVolume * 100)}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={toggleSfxMuteQuick}
                              className={`w-9 h-9 rounded-lg border text-lg ${sfxVolume > 0 ? 'border-indigo-200 text-indigo-600 bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:bg-indigo-900/30' : 'border-gray-200 text-gray-400 bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:bg-gray-700'}`}
                              title={sfxVolume > 0 ? 'Tắt tiếng SFX' : 'Bật tiếng SFX'}
                            >
                              {sfxVolume > 0 ? '🔊' : '🔇'}
                            </button>
                            <input
                              id="quick-sfx-slider"
                              type="range"
                              min="0"
                              max="100"
                              step="1"
                              value={Math.round(sfxVolume * 100)}
                              onChange={(e) => handleSfxSliderChange(Number(e.target.value) / 100)}
                              className="flex-1 accent-indigo-600"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </header>
            
            <main className="max-w-5xl mx-auto p-4 mt-4">
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<HomePage user={user} userData={userData} vocabList={vocabList} />} />
                  <Route path="/input" element={<InputPage vocabList={vocabList} user={user} isAdmin={isAdmin} />} />
                  <Route path="/stats" element={<StatsPage user={user} userData={userData} vocabList={vocabList} />} />
                  <Route path="/study" element={<StudyPage vocabList={vocabList} onFinishLesson={handleCompleteLesson} onQuestProgress={handleQuestProgressEvent} addExp={addExp} userData={userData} sfxVolume={sfxVolume} studySessionWordCount={studySessionWordCount} reviewSessionWordCount={reviewSessionWordCount} />} />
                  <Route path="/quiz" element={<QuizPage vocabList={vocabList} onFinishLesson={handleCompleteLesson} onQuestProgress={handleQuestProgressEvent} addExp={addExp} userData={userData} sfxVolume={sfxVolume} />} />
                  <Route path="/challenge" element={<ChallengePage vocabList={vocabList} user={user} isAdmin={isAdmin} addExp={addExp} />} />
                  <Route path="/shop" element={<ShopPage user={user} userData={userData} />} /> 
                  <Route path="/daily-quests" element={<DailyQuestPage user={user} userData={userData} addExp={addExp} />} />
                  <Route path="/settings" element={<SettingsPage bgmVolume={bgmVolume} sfxVolume={sfxVolume} onBgmVolumeChange={setBgmVolume} onSfxVolumeChange={setSfxVolume} studySessionWordCount={studySessionWordCount} reviewSessionWordCount={reviewSessionWordCount} onStudySessionWordCountChange={handleStudySessionWordCountChange} onReviewSessionWordCountChange={handleReviewSessionWordCountChange} studySessionOptions={STUDY_SESSION_OPTIONS} reviewSessionOptions={REVIEW_SESSION_OPTIONS} />} />
                  <Route path="/profile" element={<ProfilePage vocabList={vocabList} user={user} userData={userData} handleLogout={handleLogout} isAdmin={isAdmin} />} />
                  <Route path="/leaderboard" element={<LeaderboardPage />} />
                </Routes>
              </Suspense>
            </main>
            
            {/* THANH ĐIỀU HƯỚNG MOBILE */}
            <nav
              className="md:hidden fixed bottom-0 left-0 w-full bg-white dark:bg-gray-800 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex justify-around items-center px-2 py-2 z-50 border-t border-gray-100 dark:border-gray-700"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
            >
              <NavLink to="/" className={({isActive}) => `flex flex-col items-center p-1 min-w-[56px] transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                <span className="text-xl mb-0.5">🏠</span>
                <span className="text-[10px] font-bold">Home</span>
              </NavLink>

              <NavLink to="/study" className={({isActive}) => `flex flex-col items-center p-1 min-w-[56px] transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                <span className="text-xl mb-0.5">🎴</span>
                <span className="text-[10px] font-bold">Học</span>
              </NavLink>

              <NavLink to="/quiz" className={({isActive}) => `flex flex-col items-center p-1 min-w-[56px] transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                <span className="text-xl mb-0.5">🎮</span>
                <span className="text-[10px] font-bold">Quiz</span>
              </NavLink>

              <NavLink to="/challenge" className={({isActive}) => `flex flex-col items-center p-1 min-w-[56px] transition-colors ${isActive ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                <span className="text-xl mb-0.5">⚔️</span>
                <span className="text-[10px] font-bold">Đấu</span>
              </NavLink>

              {isAdmin && (
                <NavLink to="/input" className={({isActive}) => `flex flex-col items-center p-1 min-w-[56px] transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                  <span className="text-xl mb-0.5">⌨️</span>
                  <span className="text-[10px] font-bold">Nhập</span>
                </NavLink>
              )}

              <NavLink to="/profile" className={({isActive}) => `flex flex-col items-center p-1 min-w-[56px] transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                <img src={user.photoURL} alt="Avatar" className="w-6 h-6 rounded-full border border-indigo-200 mb-0.5" referrerPolicy="no-referrer" />
                <span className="text-[10px] font-bold">Hồ Sơ</span>
              </NavLink>
            </nav>

            <DailyQuestPanelGate user={user} userData={userData} addExp={addExp} />

            {showPwaUpdateModal && (
              <div className="fixed inset-0 z-[130] bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4">
                <div className="w-full max-w-sm rounded-3xl border border-indigo-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-5">
                  <div className="text-center">
                    <div className="text-4xl mb-2">🚀</div>
                    <h3 className="text-xl font-black text-gray-800 dark:text-gray-100">Có phiên bản mới</h3>
                    <p className="mt-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                      Nihongo Prime vừa có bản cập nhật. Cập nhật ngay để dùng tính năng mới.
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setShowPwaUpdateModal(false)}
                      className="py-2.5 rounded-xl font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Để sau
                    </button>
                    <button
                      onClick={applyPwaUpdate}
                      className="py-2.5 rounded-xl font-black bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                    >
                      Cập nhật ngay
                    </button>
                  </div>
                </div>
              </div>
            )}

            {levelUpData && (
              <LevelUpToast
                oldLevel={levelUpData.oldLevel}
                newLevel={levelUpData.newLevel}
                onClose={() => setLevelUpData(null)}
              />
            )}
            
          </div>
        </Router>
      </DialogProvider>

      {showSplash && (
        <div
          className="fixed inset-0 z-[999]"
          style={{
            transition: 'opacity 0.5s ease',
            opacity: splashFading ? 0 : 1,
            pointerEvents: splashFading ? 'none' : 'auto',
          }}
        >
          <PremiumLoadingScreen message="Đang mở Nihongo Prime..." />
        </div>
      )}

    </DarkModeProvider>
  );
}

function DarkModeToggle() {
  const { dark, setDark } = useDarkMode();
  return (
    <button
      onClick={() => setDark(!dark)}
      className={`ml-2 w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-xl transition-colors`}
      title={dark ? 'Chế độ sáng' : 'Chế độ tối'}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
}

function RouteFallback() {
  return (
    <div className="fixed inset-0 z-[90]">
      <PremiumLoadingScreen message="Đang tải nội dung..." />
    </div>
  );
}

function PremiumLoadingScreen({ compact = false, message = 'Đang tải...' }) {
  const premiumBackdropClass = "bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.12),transparent_30%),linear-gradient(180deg,#07111f_0%,#0f172a_54%,#111827_100%)]";

  return (
    <div className={`min-h-screen flex items-center justify-center px-6 ${compact ? 'py-10' : ''} ${premiumBackdropClass}`}>
      <div className="w-full max-w-sm text-center text-white">
        <div className="mx-auto mb-5 w-20 h-20 rounded-[22px] p-2 bg-white/8 border border-white/10 shadow-2xl shadow-black/30 backdrop-blur-sm">
          <img src="/app-logo-cropped.png" alt="Nihongo Prime" className="w-full h-full rounded-[18px]" />
        </div>
        <div className="text-2xl font-black tracking-[0.18em] uppercase">Nihongo Prime</div>
        <div className="mt-3 text-sm text-white/70 font-medium">{message}</div>
        <div className="mt-6 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-amber-300 via-amber-200 to-amber-500 loading-bar-run" />
        </div>
      </div>
    </div>
  );
}

function DailyQuestPanelGate({ user, userData, addExp }) {
  const location = useLocation();
  const hideOnRoutes = ['/study', '/quiz', '/challenge'];
  const shouldHide = hideOnRoutes.some((route) => location.pathname.startsWith(route));

  if (!user || shouldHide) return null;

  return <DailyQuestPanel user={user} userData={userData} addExp={addExp} />;
}

export default App;