import React, { useState, useEffect, useRef, useMemo } from 'react'; 
import { useLocation, useNavigate } from 'react-router-dom'; 
import { doc, setDoc, updateDoc, increment } from 'firebase/firestore'; 
import { getAuth } from 'firebase/auth'; 
import { db } from './firebase'; 
import { useDialog } from './DialogContext';
import { EXP_REWARDS, calcLevelFromExp, getLevelColor } from './Expsystem';
import Confetti from 'react-confetti'; 
import correctSound from './assets/sounds/correct.wav'; 
import wrongSound from './assets/sounds/wrong.wav'; 
import comboSound from './assets/sounds/combo.wav'; 

export const stratifyVocabByJLPT = (vocabList) => {
  return vocabList.reduce((acc, vocab) => {
    const level = vocab.jlptLevel || 'Uncategorized';
    if (!acc[level]) acc[level] = [];
    acc[level].push(vocab);
    return acc;
  }, { 'N5': [], 'N4': [], 'N3': [], 'N2': [], 'N1': [], 'Uncategorized': [] });
};

const INVENTORY_ITEMS = [
  { id: 'hintTicket', label: 'Vé Gợi Ý', icon: '💡', desc: 'Mở gợi ý khi gặp từ khó (chuẩn bị cho chế độ trợ giúp).' },
  { id: 'retryToken', label: 'Vé Làm Lại', icon: '🔁', desc: 'Cho phép làm lại nhanh một phiên học (sẵn sàng tích hợp).' },
  { id: 'xpBoost', label: 'Bùa EXP', icon: '⚡', desc: 'Nhận thêm x1.5 EXP cho toàn bộ phiên thám hiểm.' },
  { id: 'shieldToken', label: 'Lá Chắn Sai', icon: '🛡️', desc: 'Miễn 1 lần sai khi đang giữ combo.' },
];

export default function StudyPage({ vocabList, onFinishLesson, onQuestProgress, addExp, userData, sfxVolume = 0.8 }) {   
  const location = useLocation();   
  const navigate = useNavigate();   
  const { showAlert, showConfirm } = useDialog(); 
  
  const [appState, setAppState] = useState('map');    
  
  const uniqueTags = useMemo(() => {
    const tags = [...new Set(vocabList.map(v => v.tag || 'Chung'))];
    return tags.length > 0 ? tags : ['All'];
  }, [vocabList]);

  const [selectedCourse, setSelectedCourse] = useState(() => {
    const saved = localStorage.getItem('nihongo:lastCourse');
    if (saved && uniqueTags.includes(saved)) return saved;
    return uniqueTags[0];
  });    

  const [currentIslandConfig, setCurrentIslandConfig] = useState(null);
  const [pool, setPool] = useState([]);    
  const [progress, setProgress] = useState({});    
  const [currentTask, setCurrentTask] = useState(null);   
  const [selectedAnswer, setSelectedAnswer] = useState(null);   
  const [stats, setStats] = useState({ correct: 0, wrong: 0 });
  const [combo, setCombo] = useState(0);
  const [comboMsg, setComboMsg] = useState('');
  const [showCombo, setShowCombo] = useState(false);
  const [expGained, setExpGained] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  // States Balo Vật phẩm
  const [showBackpack, setShowBackpack] = useState(false);
  const [equippedItems, setEquippedItems] = useState([]);
  const [sessionExpMultiplier, setSessionExpMultiplier] = useState(1);
  const [shieldAvailable, setShieldAvailable] = useState(false);
  const [shieldUsed, setShieldUsed] = useState(false);
  
  const correctAudio = useRef(null);   
  const wrongAudio = useRef(null);   
  const comboAudio = useRef(null);
  const activeIslandRef = useRef(null);
  const combo10ReachedRef = useRef(false);
  const studyQuestProgressSentRef = useRef(0);

  useEffect(() => {
    if (correctAudio.current) correctAudio.current.volume = sfxVolume;
    if (wrongAudio.current) wrongAudio.current.volume = sfxVolume;
    if (comboAudio.current) comboAudio.current.volume = Math.min(1, sfxVolume + 0.1);
  }, [sfxVolume]);

  useEffect(() => {
    localStorage.setItem('nihongo:lastCourse', selectedCourse);
  }, [selectedCourse]);

  // Khóa scroll Body khi mở Balo hoặc làm bài
  useEffect(() => {
    if (appState === 'playing' || appState === 'result') {
      window.scrollTo(0, 0);
    }
    if (showBackpack || appState === 'playing') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showBackpack, appState]);

  useEffect(() => {
    if (appState === 'map' && activeIslandRef.current) {
      const timer = setTimeout(() => {
        const element = activeIslandRef.current;
        const yOffset = 180; 
        const y = element.getBoundingClientRect().top + window.scrollY - yOffset;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [appState, selectedCourse]);

  const shuffleArray = (array) => [...array].sort(() => Math.random() - 0.5);   

  const playAudio = (text, langStr = 'ja-JP') => {     
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);     
    speech.lang = langStr;     
    window.speechSynthesis.speak(speech);   
  };   

  const toggleEquip = (itemId) => {
    if (equippedItems.includes(itemId)) {
        setEquippedItems(prev => prev.filter(id => id !== itemId));
    } else {
        if (equippedItems.length >= 2) {
            showAlert("Hành trang đầy!", "Bạn chỉ có thể mang tối đa 2 vật phẩm cho mỗi chuyến thám hiểm.");
            return;
        }
        const currentStock = userData?.inventory?.[itemId] || 0;
        if (currentStock <= 0) {
            showAlert("Hết vật phẩm", "Bạn không còn vật phẩm này trong kho. Hãy ra Shop để mua thêm nhé!");
            return;
        }
        setEquippedItems(prev => [...prev, itemId]);
    }
  };

  const mapData = useMemo(() => {
    const courseWords = selectedCourse === 'All' 
        ? [...vocabList] 
        : vocabList.filter(v => v.tag === selectedCourse);
    
    courseWords.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds : 0;
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds : 0;
        return timeA - timeB;
    });

    const islands = [];
    let wordIndex = 0;
    let regularIslandCount = 0;

    while (wordIndex < courseWords.length) {
        const islandWords = courseWords.slice(wordIndex, wordIndex + 10);
        regularIslandCount++;
        
        islands.push({
            id: `reg-${regularIslandCount}`,
            type: 'regular',
            label: `Đảo ${regularIslandCount}`,
            words: islandWords,
            icon: '🏝️'
        });

        wordIndex += 10;

        if (regularIslandCount % 5 === 0 && wordIndex <= courseWords.length) {
            const previous50Words = courseWords.slice(Math.max(0, wordIndex - 50), wordIndex);
            islands.push({
                id: `boss-${regularIslandCount / 5}`,
                type: 'big_boss',
                label: `Trạm Kiểm Tra ${regularIslandCount / 5}`,
                words: previous50Words,
                icon: '🏯'
            });
        }
    }

    if (courseWords.length > 0) {
        islands.push({
            id: 'final_boss',
            type: 'final_boss',
            label: 'Đảo Vua (Tổng Khóa)',
            words: courseWords,
            icon: '🏰'
        });
    }

    let firstActiveFound = false;
    const mappedIslands = islands.map(island => {
        let isCompleted = false;

        if (island.type === 'regular') {
            isCompleted = island.words.every(w => (w.correctCount || 0) > 0 || (w.srsLevel || 0) > 0);
        } else {
            isCompleted = island.words.every(w => (w.correctCount || 0) > 0 || (w.srsLevel || 0) > 0);
        }

        let status = 'locked';
        if (isCompleted) {
            status = 'completed';
        } else if (!firstActiveFound) {
            status = 'active';
            firstActiveFound = true;
        }

        return { ...island, status };
    });

    const weakWords = courseWords.filter(w => (w.wrongCount || 0) > 0 && (w.wrongCount || 0) >= (w.correctCount || 0));
    weakWords.sort((a, b) => ((b.wrongCount || 0) - (b.correctCount || 0)) - ((a.wrongCount || 0) - (a.correctCount || 0)));
    const isolatedWords = weakWords.slice(0, 10);

    const isolatedIsland = {
        id: 'isolated_island',
        type: 'isolated',
        label: 'Đảo Hoang (Từ Khó)',
        words: isolatedWords,
        icon: '🌋',
        status: isolatedWords.length > 0 ? 'active' : 'locked'
    };

    return { courseWords, islands: mappedIslands, isolatedIsland };
  }, [vocabList, selectedCourse]);

  const startIslandSession = async (island) => {
      if (island.status === 'locked') {
          showAlert("Đảo đang khóa!", "Hãy hoàn thành các đảo trước đó để mở khóa hòn đảo này nhé.");
          return;
      }
      if (island.words.length === 0) {
          showAlert("Trống", "Đảo này hiện chưa có từ vựng nào.");
          return;
      }

      const auth = getAuth();
      const user = auth.currentUser;

      // Xử lý trừ vật phẩm trang bị
      const updates = {};
      let expMult = 1;
      let hasShield = false;

      equippedItems.forEach(itemId => {
          updates[`inventory.${itemId}`] = increment(-1);
          if (itemId === 'xpBoost') expMult = 1.5;
          if (itemId === 'shieldToken') hasShield = true;
      });

      if (Object.keys(updates).length > 0 && user) {
          try {
              await updateDoc(doc(db, 'users', user.uid), updates);
          } catch (e) {
              console.error("Lỗi trừ vật phẩm:", e);
          }
      }

      setSessionExpMultiplier(expMult);
      setShieldAvailable(hasShield);
      setShieldUsed(false);
      setEquippedItems([]); // Reset balo để người chơi phải chọn lại cho chuyến sau

      let sessionPool = [];
      let targetSteps = 5; 
      let skipFlashcard = false;
      let isReviewMode = false;

      if (island.type === 'regular') {
          if (island.status === 'completed') {
              sessionPool = [...island.words];
              targetSteps = 2; 
              skipFlashcard = true;
              isReviewMode = true;
          } else {
              sessionPool = [...island.words];
              targetSteps = 5; 
              skipFlashcard = false;
          }
      } 
      else if (island.type === 'big_boss') {
          sessionPool = shuffleArray(island.words).slice(0, 25);
          targetSteps = 1; 
          skipFlashcard = true;
          isReviewMode = true;
      }
      else if (island.type === 'final_boss') {
          sessionPool = shuffleArray(island.words).slice(0, 100);
          targetSteps = 1; 
          skipFlashcard = true;
          isReviewMode = true;
      }
      else if (island.type === 'isolated') {
          sessionPool = [...island.words];
          targetSteps = 4; 
          skipFlashcard = false;
      }

      setCurrentIslandConfig({
          ...island,
          targetSteps,
          skipFlashcard,
          isReviewMode,
          totalQuestions: sessionPool.length * targetSteps
      });

      setPool(sessionPool);          
      const initialProgress = {};     
      
      sessionPool.forEach(w => {
          initialProgress[w.id] = skipFlashcard ? 1 : 0;
      });      
      
      setProgress(initialProgress);     
      setStats({ correct: 0, wrong: 0 });
      setCombo(0); setComboMsg(''); setShowCombo(false);
      setExpGained(0); setShowConfetti(false);
      setSelectedAnswer(null);     
      combo10ReachedRef.current = false;
      studyQuestProgressSentRef.current = 0;

      setAppState('playing');          
      pickNextTask(sessionPool, initialProgress, targetSteps, skipFlashcard, isReviewMode);   
  };

  const pickNextTask = (currentPool, currentProgress, targetSteps, skipFlashcard, isReviewMode) => {     
    const actualTarget = skipFlashcard ? 1 + targetSteps : targetSteps;
    const activeWords = currentPool.filter(w => currentProgress[w.id] < actualTarget);     
    
    if (activeWords.length === 0) {
      if (onFinishLesson) {
        onFinishLesson({
          type: 'study_session',
          mode: isReviewMode ? 'REVIEW' : 'NEW',
          wordsStudied: currentPool.length,
          studyQuestProgressSent: studyQuestProgressSentRef.current,
          reachedCombo10: combo10ReachedRef.current,
        });
      }
      const totalSteps = currentPool.length * targetSteps;
      const baseReward = isReviewMode ? EXP_REWARDS.QUIZ_CORRECT : Math.round(EXP_REWARDS.FLASHCARD_CORRECT * 2);
      const bonus = Math.round(totalSteps * baseReward * sessionExpMultiplier); // Áp dụng bùa EXP
      
      setExpGained(prev => prev + bonus);
      if (addExp) addExp(bonus);
      setShowConfetti(true);
      setAppState('result');
      return;
    }     

    const introduced = activeWords.filter(w => currentProgress[w.id] > (skipFlashcard ? 1 : 0));     
    let candidate;          
    
    if (!skipFlashcard && introduced.length < 4 && activeWords.length > introduced.length) {       
      candidate = activeWords.find(w => currentProgress[w.id] === 0);     
    } else {       
      candidate = introduced[Math.floor(Math.random() * introduced.length)];       
      if (!candidate) candidate = activeWords[0];     
    }     
    
    const step = currentProgress[candidate.id];          
    
    if (step === 0) {       
      setCurrentTask({ type: 'flashcard', vocab: candidate });     
    } else {       
      const isOddStep = step % 2 !== 0;
      const askType = isReviewMode 
          ? (Math.random() < 0.5 ? 'word' : 'meaning') 
          : (isOddStep ? 'meaning' : 'word');
      const answerType = askType === 'word' ? 'meaning' : 'word';              
      
      const allUniqueAnswers = [...new Set(vocabList.map(v => v[answerType]))];       
      const wrongAnswers = allUniqueAnswers.filter(ans => ans !== candidate[answerType]);       
      const finalOptions = shuffleArray([candidate[answerType], ...shuffleArray(wrongAnswers).slice(0, 3)]);       
      
      setCurrentTask({         
        type: 'quiz',         
        vocab: candidate,         
        askType,         
        answerType,         
        options: finalOptions       
      });     
    }   
  };   

  const handleFlashcardNext = () => {     
    setShowCombo(false); 
    const p = { ...progress };     
    const id = currentTask.vocab.id;
    const isFirstLearnInSession = (progress[id] || 0) === 0;
    
    p[id] = 1;

    if (isFirstLearnInSession && onQuestProgress) {
      studyQuestProgressSentRef.current += 1;
      onQuestProgress({ type: 'study_word_completed', amount: 1 });
    }

    setProgress(p);     
    pickNextTask(pool, p, currentIslandConfig.targetSteps, currentIslandConfig.skipFlashcard, currentIslandConfig.isReviewMode);   
  };   

  const handleOptionClick = (option) => {     
    if (selectedAnswer) return;     
    setSelectedAnswer(option);     
    const isCorrect = option === currentTask.vocab[currentTask.answerType];          
    
    if (isCorrect) {
      setStats(prev => ({ ...prev, correct: prev.correct + 1 }));
      setCombo(prev => {
        const nc = prev + 1;
        if (nc >= 10) combo10ReachedRef.current = true;
        if (nc === 10 && onQuestProgress) {
          onQuestProgress({ type: 'combo_10' });
        }
        const hitComboMilestone = nc % 5 === 0;
        if (hitComboMilestone) {
          setComboMsg(`COMBO ${nc}!`);
          setShowCombo(true);
          if (comboAudio.current) {
            comboAudio.current.currentTime = 0;
            comboAudio.current.play().catch(()=>{});
          }
        } else if (correctAudio.current) {
          correctAudio.current.currentTime = 0;
          correctAudio.current.play().catch(()=>{});
        }
        return nc;
      });
    } else {
      setStats(prev => ({ ...prev, wrong: prev.wrong + 1 }));
      if (wrongAudio.current) { 
        wrongAudio.current.currentTime = 0; 
        wrongAudio.current.play().catch(()=>{}); 
      }
      
      // Kích hoạt Lá Chắn Sai
      if (combo > 0 && shieldAvailable && !shieldUsed) {
        setShieldUsed(true);
        setShieldAvailable(false);
        setComboMsg('🛡️ CHẶN VỠ COMBO!');
        setShowCombo(true);
      } else {
        setCombo(0);
        setShowCombo(false);
      }
    }     

    if (currentTask.answerType !== 'meaning') {       
      const lang = currentTask.vocab.tag === 'Tiếng Trung' ? 'zh-CN' : 'ja-JP';       
      playAudio(currentTask.vocab.word, lang);      
    }   
  };   

  const handleNextAfterAnswer = () => {     
    setShowCombo(false); 
    const isCorrect = selectedAnswer === currentTask.vocab[currentTask.answerType];     
    const p = { ...progress };     
    const id = currentTask.vocab.id;     
    
    const auth = getAuth();
    const user = auth.currentUser;
    const progressMapRef = doc(db, 'users', user.uid, 'progressMap', 'default');
    
    const isSkip = currentIslandConfig.skipFlashcard;
    const actualTarget = isSkip ? 1 + currentIslandConfig.targetSteps : currentIslandConfig.targetSteps;

    if (isCorrect) {       
      p[id] += 1;               
      
      if (p[id] >= actualTarget) {         
        const currentLevel = currentTask.vocab.srsLevel || 0;         
        const newLevel = Math.min(currentLevel + 1, 7);         
        const intervals = [0, 1, 3, 7, 14, 30, 90, 180];                  
        const nextDate = new Date();         
        nextDate.setDate(nextDate.getDate() + intervals[newLevel]);         
        
        setDoc(progressMapRef, {             
            [id]: {
              srsLevel: newLevel,             
              nextReview: nextDate,             
              correctCount: increment(1),             
              lastReviewed: new Date().toISOString()         
            }
        }, { merge: true }).catch(console.error);       
      }     
    } else {       
      p[id] = 1;        
      setDoc(progressMapRef, {           
          [id]: {
            srsLevel: 0,           
            nextReview: new Date(),            
            wrongCount: increment(1),           
            lastReviewed: new Date().toISOString()       
          }
      }, { merge: true }).catch(console.error);     
    }          
    
    setProgress(p);     
    setSelectedAnswer(null);     
    pickNextTask(pool, p, currentIslandConfig.targetSteps, currentIslandConfig.skipFlashcard, currentIslandConfig.isReviewMode);   
  };   

  useEffect(() => {     
    const handleKeyDown = (e) => {       
      if (appState !== 'playing' || !currentTask) return;       
      if (currentTask.type === 'flashcard') {          
         if (e.key === 'Enter' || e.code === 'Space') {             
            e.preventDefault();             
            handleFlashcardNext();          
         }       
      } else if (currentTask.type === 'quiz') {          
         if (!selectedAnswer) {             
            if (['1', '2', '3', '4'].includes(e.key)) {                
               const index = parseInt(e.key) - 1;                
               if (currentTask.options[index]) {                   
                  handleOptionClick(currentTask.options[index]);                
               }             
            }          
         } else {             
            if (e.key === 'Enter' || e.code === 'Space') {                
               e.preventDefault();                
               handleNextAfterAnswer();             
            }          
         }       
      }     
    };     
    window.addEventListener('keydown', handleKeyDown);     
    return () => window.removeEventListener('keydown', handleKeyDown);   
  }, [appState, currentTask, selectedAnswer]);   

  useEffect(() => {     
    const handleBeforeUnload = (e) => {       
      if (appState === 'playing') {         
        e.preventDefault();         
        e.returnValue = 'Bạn chắc chắn muốn thoát? Tiến trình sẽ không được lưu!';       
      }     
    };     
    const handleLinkClick = async (e) => {       
      if (appState === 'playing') {         
        const target = e.target.closest('a');          
        if (target) {           
          e.preventDefault();             
          e.stopPropagation();           
          const ok = await showConfirm("Chưa Học Xong!", "Bạn đang học dở dang trên đảo. Chắc chắn muốn thoát khỏi đảo không?");
          if (ok) {
             const dest = target.getAttribute('href');
             if(dest) navigate(dest.replace('#', ''));
          }
        }       
      }     
    };     
    window.addEventListener('beforeunload', handleBeforeUnload);     
    document.addEventListener('click', handleLinkClick, { capture: true });     
    return () => {       
      window.removeEventListener('beforeunload', handleBeforeUnload);       
      document.removeEventListener('click', handleLinkClick, { capture: true });     
    };   
  }, [appState, navigate, showConfirm]);   

  const totalAnswers = stats.correct + stats.wrong;
  const accuracy = totalAnswers > 0 ? Math.round((stats.correct / totalAnswers) * 100) : 100;

  if (vocabList.length === 0) return <div className="text-center py-20 text-gray-500 font-medium">Kho rỗng. Hãy vào Nhập Liệu thêm từ vựng!</div>;   

  return (
    <div className="-mx-4 md:-mx-4 min-h-screen relative">
      
      {/* THẺ AUDIO CỐ ĐỊNH Ở GỐC ĐỂ LUÔN SẴN SÀNG PLAY */}
      <audio ref={correctAudio} src={correctSound} preload="auto" />       
      <audio ref={wrongAudio} src={wrongSound} preload="auto" />              
      <audio ref={comboAudio} src={comboSound} preload="auto" />

      {/* 1. MAP VIEW */}
      {appState === 'map' && (
        <div 
            className="bg-[linear-gradient(180deg,#38bdf8_0%,#3b82f6_40%,#1e3a8a_100%)] flex flex-col items-center pb-32 min-h-screen relative -mb-24 md:-mb-4" 
            style={{ 
                width: '100vw', 
                marginLeft: 'calc(-50vw + 50%)',
                marginTop: '-2rem' 
            }}
        >
          
          <div className="absolute top-10 left-10 text-white/30 text-6xl select-none animate-[bounce_8s_infinite] pointer-events-none">☁️</div>
          <div className="absolute top-60 right-10 text-white/20 text-5xl select-none animate-[bounce_10s_infinite_reverse] pointer-events-none">☁️</div>
          <div className="absolute bottom-1/4 left-5 text-white/10 text-7xl select-none pointer-events-none">☁️</div>

          <div 
              className="sticky z-40 w-full bg-blue-900/80 backdrop-blur-md border-b border-white/20 px-4 py-3 flex justify-between items-center shadow-lg transition-all"
              style={{ top: 'calc(58px + env(safe-area-inset-top, 0px))' }}
          >
              <h2 className="text-white font-black text-lg drop-shadow-md flex items-center gap-2">
                  🧭 Bản Đồ Học Tập
              </h2>
              <select 
                  value={selectedCourse} 
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className="bg-white/20 text-white font-bold px-3 py-2 rounded-xl outline-none border border-white/30 focus:bg-white/30 transition-colors backdrop-blur-md cursor-pointer"
              >
                  {uniqueTags.map(tag => (
                      <option key={tag} value={tag} className="text-gray-800 font-bold bg-white">{tag}</option>
                  ))}
              </select>
          </div>

          <div 
              className="fixed left-4 md:left-8 z-50 transition-all"
              style={{ bottom: 'calc(110px + env(safe-area-inset-bottom, 0px))' }}
          >
              <button 
                  onClick={() => setShowBackpack(true)}
                  className="relative group flex flex-col items-center hover:-translate-y-2 transition-transform duration-300"
              >
                  <div className="bg-amber-700/90 backdrop-blur border-4 border-amber-500 rounded-full w-16 h-16 md:w-20 md:h-20 flex items-center justify-center text-3xl md:text-4xl shadow-[0_0_20px_rgba(245,158,11,0.6)]">
                      🎒
                  </div>
                  {equippedItems.length > 0 && (
                      <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-black w-6 h-6 flex items-center justify-center rounded-full border-2 border-white">
                          {equippedItems.length}
                      </div>
                  )}
                  <div className="absolute -bottom-4 bg-amber-800 text-white text-[10px] md:text-xs font-black px-3 py-1.5 rounded-full border-2 border-amber-600 shadow-lg whitespace-nowrap">
                      Hành trang
                  </div>
              </button>
          </div>

          {showBackpack && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
              <div className="bg-[#fdf8f0] dark:bg-gray-800 w-full max-w-md rounded-3xl shadow-2xl border-4 border-amber-700 dark:border-gray-600 overflow-hidden flex flex-col">
                <div className="bg-amber-800 p-4 text-center relative border-b-4 border-amber-900">
                  <button onClick={() => setShowBackpack(false)} className="absolute right-4 top-4 text-white hover:text-amber-200 font-black text-xl">✕</button>
                  <h2 className="text-2xl font-black text-white flex items-center justify-center gap-2">🎒 Hành Trang</h2>
                  <p className="text-amber-200 text-sm font-bold mt-1">Trang bị tối đa 2 vật phẩm</p>
                </div>
                <div className="p-4 grid gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
                  {INVENTORY_ITEMS.map(item => {
                    const count = userData?.inventory?.[item.id] || 0;
                    const isEquipped = equippedItems.includes(item.id);
                    const disabled = count <= 0 && !isEquipped;

                    return (
                      <div key={item.id}
                        onClick={() => !disabled && toggleEquip(item.id)}
                        className={`flex items-center gap-3 p-3 rounded-2xl border-2 cursor-pointer transition-all duration-200 ${isEquipped ? 'bg-amber-100 border-amber-500 shadow-md dark:bg-amber-900/40 dark:border-amber-500' : disabled ? 'bg-gray-100 border-gray-200 opacity-60 grayscale dark:bg-gray-800 dark:border-gray-700' : 'bg-white border-amber-200 hover:bg-amber-50 dark:bg-gray-700 dark:border-gray-600'}`}>
                        <div className="text-4xl drop-shadow-sm">{item.icon}</div>
                        <div className="flex-1">
                          <h4 className="font-black text-gray-800 dark:text-gray-100 text-lg">{item.label}</h4>
                          <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">{item.desc}</p>
                        </div>
                        <div className="text-right flex flex-col items-end justify-center min-w-[70px]">
                          <span className="text-xs font-black text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 px-2 py-1 rounded-lg">Kho: {count}</span>
                          {isEquipped && <span className="mt-1 text-[10px] font-black text-white bg-green-500 px-2 py-0.5 rounded-full uppercase">Đã mang</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="p-4 bg-amber-100 dark:bg-gray-900 border-t-2 border-amber-200 dark:border-gray-700">
                  <button onClick={() => setShowBackpack(false)} className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black text-lg py-3 rounded-xl shadow-lg active:scale-95 transition-transform">
                    Đóng Hành Trang ({equippedItems.length}/2)
                  </button>
                </div>
              </div>
            </div>
          )}

          {mapData.isolatedIsland.status === 'active' && (
              <div 
                  className="fixed right-4 md:right-8 z-50 animate-bounce transition-all"
                  style={{ bottom: 'calc(110px + env(safe-area-inset-bottom, 0px))' }}
              >
                  <button 
                      onClick={() => startIslandSession(mapData.isolatedIsland)}
                      className="relative group flex flex-col items-center hover:-translate-y-2 transition-transform duration-300"
                  >
                      <div className="bg-red-900/90 backdrop-blur border-4 border-red-500 rounded-full w-20 h-20 md:w-24 md:h-24 flex items-center justify-center text-4xl md:text-5xl shadow-[0_0_30px_rgba(239,68,68,0.8)]">
                          {mapData.isolatedIsland.icon}
                      </div>
                      <div className="absolute -bottom-4 right-0 md:right-auto md:left-1/2 md:-translate-x-1/2 bg-red-600 text-white text-[10px] md:text-xs font-black px-4 py-1.5 rounded-full border-2 border-red-800 shadow-lg whitespace-nowrap">
                          {mapData.isolatedIsland.label} ({mapData.isolatedIsland.words.length})
                      </div>
                  </button>
              </div>
          )}

          <div className="relative w-full max-w-lg mt-8 flex flex-col items-center z-10 pt-4">
              {mapData.islands.map((island, index) => {
                  const isActive = island.status === 'active';
                  const isCompleted = island.status === 'completed';
                  const isBoss = island.type === 'big_boss' || island.type === 'final_boss';
                  
                  const isLeft = index % 2 === 0;
                  const hasNext = index < mapData.islands.length - 1;
                  
                  let pathColor = "rgba(255,255,255,0.2)";
                  let pathDash = "8 8";
                  let pathStroke = "4";
                  
                  if (island.status === 'completed' && mapData.islands[index + 1]?.status === 'completed') {
                      pathColor = "#4ade80"; 
                      pathDash = "0"; 
                      pathStroke = "6";
                  } else if (island.status === 'completed' && mapData.islands[index + 1]?.status === 'active') {
                      pathColor = "#facc15"; 
                      pathDash = "8 8"; 
                      pathStroke = "6";
                  }

                  return (
                      <div 
                          key={island.id} 
                          ref={isActive ? activeIslandRef : null}
                          className="relative w-full flex justify-center h-28 mb-14"
                      >
                          {hasNext && (
                              <svg 
                                  className="absolute top-[50%] left-1/2 -translate-x-1/2 w-[12rem] md:w-[16rem] h-[10.5rem] md:h-[11rem] -z-10 pointer-events-none"
                                  viewBox="0 0 100 100" preserveAspectRatio="none"
                              >
                                  <path 
                                      d={isLeft ? "M 0,0 C 0,50 100,50 100,100" : "M 100,0 C 100,50 0,50 0,100"} 
                                      fill="none" 
                                      stroke={pathColor} 
                                      strokeWidth={pathStroke} 
                                      strokeDasharray={pathDash}
                                      strokeLinecap="round"
                                  />
                              </svg>
                          )}

                          <div className={`relative flex flex-col items-center justify-center ${isLeft ? '-translate-x-[6rem] md:-translate-x-[8rem]' : 'translate-x-[6rem] md:translate-x-[8rem]'}`}>
                              <button
                                  onClick={() => startIslandSession(island)}
                                  disabled={island.status === 'locked'}
                                  className={`
                                      relative rounded-full flex items-center justify-center text-5xl md:text-6xl transition-all duration-300
                                      ${isBoss ? 'w-28 h-28 md:w-32 md:h-32 text-6xl md:text-7xl' : 'w-20 h-20 md:w-24 md:h-24'}
                                      ${isActive ? 'border-yellow-400 bg-yellow-500/80 shadow-[0_10px_40px_rgba(250,204,21,0.6)] animate-bounce cursor-pointer scale-110' : ''}
                                      ${isCompleted ? 'border-green-400 bg-green-800/80 shadow-[0_5px_20px_rgba(74,222,128,0.4)] cursor-pointer hover:scale-105 grayscale-0 opacity-100' : ''}
                                      ${island.status === 'locked' ? 'border-gray-400 bg-gray-800/50 grayscale opacity-50 cursor-not-allowed' : ''}
                                      border-4 backdrop-blur
                                  `}
                              >
                                  <span className="z-10 drop-shadow-lg">{island.icon}</span>

                                  {isCompleted && (
                                      <div className="absolute -top-1 -right-1 bg-green-500 rounded-full w-6 h-6 md:w-8 md:h-8 flex items-center justify-center text-white border-2 border-white shadow-md text-xs md:text-sm z-20">
                                          ⭐
                                      </div>
                                  )}

                                  {island.status === 'locked' && (
                                      <div className="absolute inset-0 flex items-center justify-center z-20">
                                          <span className="text-2xl md:text-3xl drop-shadow-md">🔒</span>
                                      </div>
                                  )}
                              </button>

                              <div className={`absolute -bottom-6 bg-white text-gray-800 text-[10px] md:text-xs font-black px-3 md:px-4 py-1.5 rounded-full shadow-xl border-2 whitespace-nowrap z-20
                                  ${isActive ? 'border-yellow-400 text-yellow-600' : isCompleted ? 'border-green-500 text-green-700' : 'border-gray-300 text-gray-500'}
                              `}>
                                  {island.label} {isCompleted && '(Ôn Tập)'}
                              </div>
                          </div>
                      </div>
                  );
              })}
          </div>
        </div>
      )}

      {/* 2. GIAO DIỆN KẾT QUẢ KHI VƯỢT ĐẢO */}
      {appState === 'result' && (
        <div className="p-4 relative max-w-md mx-auto mt-6 pb-10">
          {showConfetti && (
            <div className="fixed inset-0 pointer-events-none z-50">
              <Confetti width={window.innerWidth} height={window.innerHeight} recycle={true} numberOfPieces={160} gravity={0.15} />
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl border border-gray-50 dark:border-gray-700 text-center">
            <div className="text-6xl mb-3">{accuracy >= 80 ? '🏆' : accuracy >= 50 ? '💪' : '📖'}</div>
            <h2 className="text-3xl font-black text-gray-800 dark:text-gray-100 mb-1">
               {currentIslandConfig?.type === 'isolated' ? 'THOÁT ĐẢO HOANG!' : 'ĐÃ CHINH PHỤC ĐẢO!'}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 font-medium mb-6">Bạn đã hoàn thành {pool.length} từ của {currentIslandConfig?.label}</p>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-2xl">
                <p className="text-2xl font-black text-green-600 dark:text-green-400">{stats.correct}</p>
                <p className="text-xs font-bold text-green-500 mt-0.5">Đúng</p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-2xl">
                <p className="text-2xl font-black text-red-500 dark:text-red-400">{stats.wrong}</p>
                <p className="text-xs font-bold text-red-400 mt-0.5">Sai</p>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-2xl">
                <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{accuracy}%</p>
                <p className="text-xs font-bold text-indigo-400 mt-0.5">Chính xác</p>
              </div>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-2xl p-4 mb-4">
              <p className="text-sm font-bold text-yellow-600 dark:text-yellow-400 mb-1">⭐ EXP nhận được</p>
              <p className="text-3xl font-black text-yellow-500">+{expGained} EXP</p>
            </div>

            {userData && (
              <div className="mb-6">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden mt-4">
                  <div className={`bg-gradient-to-r from-indigo-400 to-purple-600 h-full rounded-full transition-all duration-700`} style={{ width: `100%` }} />
                </div>
              </div>
            )}

            <button onClick={() => setAppState('map')} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg transition-transform active:scale-95 mb-3">
              Trở Về Bản Đồ
            </button>
          </div>
        </div>
      )}

      {/* 3. GIAO DIỆN HỌC / QUIZ TRONG ĐẢO (PLAYING VIEW) */}
      {appState === 'playing' && currentTask && (
        <div className="p-4 max-w-2xl mx-auto mt-2 md:mt-4 pb-32 dark:text-gray-100 relative">
          
          {showCombo && (
            <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center combo-zoom animate-[ping_0.5s_ease-out]">
                <h1 className="text-5xl md:text-7xl font-black drop-shadow-[0_8px_8px_rgba(0,0,0,0.5)] whitespace-nowrap px-4 text-center flex justify-center items-center gap-2 md:gap-4">
                  <span>🔥</span>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-red-500 to-yellow-500">{comboMsg}</span>
                  <span>🔥</span>
                </h1>
              </div>
            </div>
          )}

          <div className="mb-6 px-2">
            <div className="flex justify-between items-center mb-2">
              <button
                onClick={async () => { const ok = await showConfirm("Rời Đảo", "Bạn có chắc chắn muốn rời đảo? Tiến trình trên đảo sẽ không được lưu."); if(ok) setAppState('map'); }}
                className="font-bold text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-900/30 px-3 py-1 rounded-lg text-sm transition-colors active:scale-95"
              >
                ✖ Rời đảo
              </button>
              
              <span className="font-bold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">{currentIslandConfig?.label}</span>

              {combo >= 2 && (
                <span className="font-bold text-orange-500 text-sm animate-pulse inline-flex items-center gap-1 whitespace-nowrap">
                  🔥 Combo x{combo}
                </span>
              )}
              <span className="font-black text-indigo-600 dark:text-indigo-400">
                {Math.round((Object.values(progress).reduce((a, b) => {
                  const val = b > (currentIslandConfig.skipFlashcard ? 1 + currentIslandConfig.targetSteps : currentIslandConfig.targetSteps) ? (currentIslandConfig.skipFlashcard ? 1 + currentIslandConfig.targetSteps : currentIslandConfig.targetSteps) : b;
                  return a + (currentIslandConfig.skipFlashcard ? Math.max(0, val - 1) : val);
                }, 0) / (currentIslandConfig.skipFlashcard ? pool.length * currentIslandConfig.targetSteps : pool.length * currentIslandConfig.targetSteps)) * 100) || 0}%
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mb-2 mt-2">
              {sessionExpMultiplier > 1 && (
                <span className="text-[11px] font-black px-2 py-1 rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">⚡ EXP x{sessionExpMultiplier}</span>
              )}
              {(shieldAvailable || shieldUsed) && (
                <span className={`text-[11px] font-black px-2 py-1 rounded-lg ${shieldAvailable ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                  🛡️ Lá chắn: {shieldAvailable ? 'Sẵn sàng' : 'Đã dùng'}
                </span>
              )}
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 h-3 rounded-full overflow-hidden">           
              <div className="bg-indigo-500 dark:bg-indigo-400 h-full transition-all duration-500 ease-out" 
                   style={{ width: `${Math.round((Object.values(progress).reduce((a, b) => {
                     const val = b > (currentIslandConfig.skipFlashcard ? 1 + currentIslandConfig.targetSteps : currentIslandConfig.targetSteps) ? (currentIslandConfig.skipFlashcard ? 1 + currentIslandConfig.targetSteps : currentIslandConfig.targetSteps) : b;
                     return a + (currentIslandConfig.skipFlashcard ? Math.max(0, val - 1) : val);
                   }, 0) / (currentIslandConfig.skipFlashcard ? pool.length * currentIslandConfig.targetSteps : pool.length * currentIslandConfig.targetSteps)) * 100) || 0}%` }}></div>         
            </div>       
          </div>       

          {currentTask.type === 'flashcard' ? (         
            <div className="text-center animate-fade-in px-2">           
              <h3 className="text-indigo-500 dark:text-indigo-400 font-black mb-4 uppercase tracking-widest text-sm">Hãy ghi nhớ từ này</h3>                      
              <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] shadow-xl shadow-indigo-100/50 dark:shadow-none border-2 border-indigo-100 dark:border-gray-700 flex flex-col items-center relative text-center">              
                <p className="text-6xl md:text-7xl font-black text-gray-800 dark:text-gray-100 my-6 break-words">{currentTask.vocab.word}</p>              
                {currentTask.vocab.reading !== currentTask.vocab.word && (                  
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-2">{currentTask.vocab.reading}</p>              
                )}              
                <div className="w-full border-t-2 border-dashed border-gray-100 dark:border-gray-700 my-4"></div>              
                <p className="text-2xl font-black text-gray-700 dark:text-gray-200 mb-6">{currentTask.vocab.meaning}</p>                            
                
                <button                  
                  onClick={() => playAudio(currentTask.vocab.word, currentTask.vocab.tag === 'Tiếng Trung' ? 'zh-CN' : 'ja-JP')}                  
                  className="w-16 h-16 bg-indigo-50 dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 rounded-full hover:bg-indigo-100 dark:hover:bg-gray-600 flex items-center justify-center transition-colors shadow-sm mb-2 active:scale-90"                  
                  title="Nghe phát âm"              
                >                  
                  <span className="text-3xl">🔊</span>              
                </button>           
              </div>                      
              <button              
                onClick={handleFlashcardNext}              
                className="mt-8 bg-indigo-600 hover:bg-indigo-700 text-white py-4 px-8 rounded-2xl w-full font-black text-lg shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"           
              >                
                ĐÃ NHỚ (TIẾP TỤC)              
                <span className="hidden md:flex items-center justify-center bg-white/20 px-2 py-1 rounded-lg text-sm ml-2">Enter ↵</span>           
              </button>         
            </div>       
          ) : (         
            <div className="animate-fade-in px-2">           
              <div className="bg-white dark:bg-gray-900 rounded-[2rem] shadow-xl shadow-indigo-100/50 dark:shadow-none p-6 md:p-10 border border-gray-50 dark:border-gray-700 relative overflow-hidden">              
                <div className="text-center mb-6">                  
                  <p className="text-sm font-bold text-indigo-500 uppercase tracking-wider mb-2">                    
                    {currentTask.askType === 'word' ? 'Chọn Nghĩa Tiếng Việt' : 'Chọn Tiếng Nhật'}                  
                  </p>                  
                  <h2 className="text-4xl md:text-5xl font-black text-gray-800 dark:text-gray-100 py-4 break-words">                    
                    {currentTask.vocab[currentTask.askType]}                  
                  </h2>              
                </div>                            
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">                  
                  {currentTask.options.map((opt, i) => {                      
                    let stateClass = "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-gray-700 hover:border-indigo-200 dark:hover:border-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200";                      
                    if (selectedAnswer) {                          
                      if (opt === currentTask.vocab[currentTask.answerType]) stateClass = "bg-green-500 border-green-600 text-white shadow-lg shadow-green-200 scale-[1.02]";                          
                      else if (opt === selectedAnswer) stateClass = "bg-red-500 border-red-600 text-white shadow-lg shadow-red-200 scale-[0.98]";                          
                      else stateClass = "bg-gray-100 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 opacity-50";                      
                    }                      
                    return (                          
                      <button                             
                        key={i}                             
                        onClick={() => handleOptionClick(opt)}                             
                        disabled={!!selectedAnswer}                             
                        className={`relative p-4 md:p-5 text-lg md:text-xl font-bold rounded-2xl border-2 transition-all duration-300 ease-in-out w-full text-center flex items-center justify-center ${stateClass}`}                          
                      >                            
                        <span className="hidden md:flex absolute left-4 w-7 h-7 items-center justify-center rounded-lg border-2 border-current opacity-40 text-sm font-black">                                
                          {i + 1}                            
                        </span>                            
                        <span className="w-full text-center">{opt}</span>                          
                      </button>                      
                    );                  
                  })}              
                </div>           
              </div>           
              
              {selectedAnswer && (               
                <div className={`fixed bottom-[calc(56px+env(safe-area-inset-bottom))] md:bottom-0 left-0 w-full border-t-4 z-40 p-4 md:p-6 animate-fade-in shadow-[0_-10px_20px_rgba(0,0,0,0.05)] transition-colors duration-300 ${selectedAnswer === currentTask.vocab[currentTask.answerType] ? 'bg-green-50 dark:bg-green-900 border-green-400 dark:border-green-700' : 'bg-red-50 dark:bg-red-900 border-red-400 dark:border-red-700'}`}>                   
                  <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">                       
                    <div className="flex items-start md:items-center gap-3 md:gap-5 w-full md:w-auto">                           
                      <div className={`text-3xl md:text-5xl hidden sm:block ${selectedAnswer === currentTask.vocab[currentTask.answerType] ? 'text-green-500' : 'text-red-500'}`}>                               
                        {selectedAnswer === currentTask.vocab[currentTask.answerType] ? '✅' : '❌'}                           
                      </div>                           
                      <div className="text-center sm:text-left w-full sm:w-auto">                               
                        <p className={`font-black text-lg md:text-xl mb-1 ${selectedAnswer === currentTask.vocab[currentTask.answerType] ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>                                   
                          {selectedAnswer === currentTask.vocab[currentTask.answerType] ? 'Tuyệt vời!' : 'Sai rồi! Bị trừ máu! Phải làm lại từ này.'}                               
                        </p>                               
                        <div className="text-gray-800 dark:text-gray-100 text-base md:text-lg flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">                                   
                          <span className="font-black text-2xl text-indigo-900 dark:text-indigo-300">{currentTask.vocab.word}</span>                                   
                          {currentTask.vocab.reading !== currentTask.vocab.word && (                                       
                            <span className="font-bold text-blue-600 dark:text-blue-400">({currentTask.vocab.reading})</span>                                   
                          )}                                   
                          <span className="font-medium text-gray-700 dark:text-gray-300 sm:before:content-['-'] sm:before:mr-2">                                       
                            {currentTask.vocab.meaning}                                   
                          </span>                               
                        </div>                           
                      </div>                       
                    </div>                       
                    <button                            
                      onClick={handleNextAfterAnswer}                            
                      className={`w-full md:w-auto font-black text-lg py-4 px-8 rounded-2xl shadow-lg transition-transform active:scale-95 flex justify-center items-center gap-2 ${selectedAnswer === currentTask.vocab[currentTask.answerType] ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'} text-white`}                       
                    >                           
                      TIẾP TỤC                           
                      <span className="hidden md:flex items-center justify-center bg-white/20 px-2 py-1 rounded-lg text-sm ml-2">                               
                        Enter ↵                            
                      </span>                       
                    </button>                   
                  </div>               
                </div>           
              )}         
            </div>       
          )}     
        </div>
      )}
    </div>
  ); 
}