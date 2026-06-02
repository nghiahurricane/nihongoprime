import React, { useState, useEffect, useRef, useMemo } from 'react'; 
import { doc, setDoc, updateDoc, increment } from 'firebase/firestore'; 
import { db } from './firebase'; 
import { getAuth } from 'firebase/auth'; 
import { useNavigate } from 'react-router-dom';
import Confetti from 'react-confetti';
import { useDialog } from './DialogContext'; 
import { EXP_REWARDS } from './Expsystem';

import correctSound from './assets/sounds/correct.wav';
import wrongSound from './assets/sounds/wrong.wav';
import comboSound from './assets/sounds/combo.wav';

function QuizPage({ vocabList, onFinishLesson, onQuestProgress, addExp, userData, sfxVolume = 0.8 }) {   
  const auth = getAuth();   
  const user = auth.currentUser;  
  const navigate = useNavigate();
  const { showAlert, showConfirm } = useDialog(); 

  const correctAudio = useRef(null);     
  const wrongAudio = useRef(null);   
  const comboAudio = useRef(null);
  const combo10ReachedRef = useRef(false);

  // FIX: DI CHUYỂN TẤT CẢ USESTATE LÊN TRƯỚC USEEFFECT ĐỂ TRÁNH LỖI INITIALIZATION
  const [appState, setAppState] = useState('setup');    
  const [filterTag, setFilterTag] = useState('All');   
  const [questionLimit, setQuestionLimit] = useState(10);   
  const [isHardcore, setIsHardcore] = useState(false);   
  const [quizMode, setQuizMode] = useState('normal'); 
  const [timeLeft, setTimeLeft] = useState(60);

  const [currentQuiz, setCurrentQuiz] = useState(null);   
  const [selectedAnswer, setSelectedAnswer] = useState(null);   
  const [questionsAnswered, setQuestionsAnswered] = useState(0);   
  const [score, setScore] = useState(0);   
  const [filteredPool, setFilteredPool] = useState([]);   

  const [combo, setCombo] = useState(0);
  const [showCombo, setShowCombo] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [comboMsg, setComboMsg] = useState("");
  const [expGained, setExpGained] = useState(0);
  const [useXpBoost, setUseXpBoost] = useState(false);
  const [useShieldToken, setUseShieldToken] = useState(false);
  const [sessionExpMultiplier, setSessionExpMultiplier] = useState(1);
  const [shieldAvailable, setShieldAvailable] = useState(false);
  const [shieldUsed, setShieldUsed] = useState(false);

  useEffect(() => {
    if (correctAudio.current) correctAudio.current.volume = sfxVolume;
    if (wrongAudio.current) wrongAudio.current.volume = sfxVolume;
    if (comboAudio.current) comboAudio.current.volume = Math.min(1, sfxVolume + 0.1);
  }, [sfxVolume, appState]);
  
  const learnedVocabList = useMemo(() => {
    return vocabList.filter(v => {
      const srs = Number(v.srsLevel) || 0;
      const correct = Number(v.correctCount) || 0;
      return srs > 0 || correct > 0;
    });
  }, [vocabList]);

  const currentAvailableList = useMemo(() => {
    return filterTag === 'All' ? learnedVocabList : learnedVocabList.filter(v => v.tag === filterTag);
  }, [filterTag, learnedVocabList]);

  const uniqueTags = ['All', ...new Set(vocabList.map(v => v.tag || 'Chung'))];   

  const shuffleArray = (array) => array.sort(() => Math.random() - 0.5);   
  
  const playAudio = (text, langStr = 'ja-JP') => {     
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);     
    speech.lang = langStr;     
    window.speechSynthesis.speak(speech);   
  };   

  const startSession = async () => {     
    if (currentAvailableList.length < 4) {       
      await showAlert("Chưa Đủ Từ Đã Học!", "Cần ít nhất 4 từ đã học trong chủ đề này để thuật toán trộn Test hoạt động. Hãy sang Bản Đồ học thêm nhé!");       
      return;     
    }     
    
    setFilteredPool(currentAvailableList);     
    setQuestionsAnswered(0);     
    setScore(0);     
    setCombo(0);
    setShowCombo(false);
    setShowConfetti(false);
    setExpGained(0);
    combo10ReachedRef.current = false;

    const userRef = doc(db, 'users', user.uid);
    const inventory = userData?.inventory || {};
    const wantXpBoost = useXpBoost && (inventory.xpBoost || 0) > 0;
    const wantShield = useShieldToken && (inventory.shieldToken || 0) > 0;
    const updates = {};

    if (wantXpBoost) updates['inventory.xpBoost'] = increment(-1);
    if (wantShield) updates['inventory.shieldToken'] = increment(-1);

    if (Object.keys(updates).length > 0) {
      try {
        await updateDoc(userRef, updates);
      } catch (error) {
        console.error('Lỗi trừ vật phẩm phiên test:', error);
      }
    }

    setSessionExpMultiplier(wantXpBoost ? 1.5 : 1);
    setShieldAvailable(wantShield);
    setShieldUsed(false);
        
    if (quizMode === 'time_attack') {
        setTimeLeft(60);
    }

    setAppState('playing');     
    setTimeout(() => generateQuiz(currentAvailableList), 50);    
  };   
  
  const generateQuiz = (pool) => {     
    const weightedPool = [];     
    pool.forEach(vocab => {       
      const weight = Math.max(1, (vocab.wrongCount * 2) - vocab.correctCount + 2);       
      for (let i = 0; i < weight; i++) weightedPool.push(vocab);     
    });     
    const randomVocab = weightedPool[Math.floor(Math.random() * weightedPool.length)];     
    let askType, answerType;     
    if (isHardcore) {       
      askType = 'meaning';       
      answerType = 'word';     
    } else {       
      const types = ['word', 'reading', 'meaning'];       
      askType = types[Math.floor(Math.random() * types.length)];       
      answerType = types[Math.floor(Math.random() * types.length)];       
      while (answerType === askType) {         
        answerType = types[Math.floor(Math.random() * types.length)];       
      }     
    }     
    const expectedAnswer = randomVocab[answerType];     
    const allUniqueAnswers = [...new Set(vocabList.map(v => v[answerType]))];     
    const wrongAnswersPool = allUniqueAnswers.filter(ans => ans !== expectedAnswer);     
    const finalOptions = shuffleArray([expectedAnswer, ...shuffleArray(wrongAnswersPool).slice(0, 3)]);     
    
    setCurrentQuiz({        
      vocab: randomVocab, askType, answerType,        
      questionText: randomVocab[askType],        
      expectedAnswer, options: finalOptions      
    });     
    setSelectedAnswer(null);    
  };   
  
  const handleOptionClick = async (option) => {     
    if (selectedAnswer) return;     
    setSelectedAnswer(option);     
    const isCorrect = option === currentQuiz.expectedAnswer;     
    
    const quizStatsMapRef = doc(db, 'users', user.uid, 'quizStatsMap', 'default');
    
    let lastReviewed = new Date();     

    if (isCorrect) {       
      setScore(prev => prev + 1);       
      const earned = Math.round(EXP_REWARDS.QUIZ_CORRECT * sessionExpMultiplier);
      setExpGained(prev => prev + earned);
      if (addExp) addExp(earned);

      setCombo(prev => {
        const newCombo = prev + 1;
        if (newCombo >= 10) combo10ReachedRef.current = true;
        if (newCombo === 10 && onQuestProgress) {
          onQuestProgress({ type: 'combo_10' });
        }
        const hitComboMilestone = newCombo % 5 === 0;
        if (hitComboMilestone) {
          setComboMsg(`COMBO ${newCombo}!`);
          setShowCombo(true);
          if (comboAudio.current) {
            comboAudio.current.currentTime = 0;
            comboAudio.current.play().catch(()=>{});
          }
        } else if (correctAudio.current) {
          correctAudio.current.currentTime = 0;
          correctAudio.current.play().catch(()=>{});
        }
        return newCombo;
      });

      if (quizMode === 'time_attack') {
          setTimeLeft(prev => prev + 2); 
      }

      await setDoc(quizStatsMapRef, {
        [currentQuiz.vocab.id]: {
          correctCount: increment(1),
          lastReviewed
        }
      }, { merge: true });       

    } else {       
      if (combo > 0 && shieldAvailable && !shieldUsed) {
        setShieldUsed(true);
        setShieldAvailable(false);
        setComboMsg('🛡️ CHẶN VỠ COMBO!');
        setShowCombo(true);
      } else {
        setCombo(0);
        setShowCombo(false);
      }

      if (quizMode === 'time_attack') {
          setTimeLeft(prev => Math.max(0, prev - 3)); 
      }

      await setDoc(quizStatsMapRef, {
        [currentQuiz.vocab.id]: {
          wrongCount: increment(1),
          lastReviewed
        }
      }, { merge: true });       
      if (wrongAudio.current) { 
        wrongAudio.current.currentTime = 0; 
        wrongAudio.current.play().catch(()=>{}); 
      }     
    }     
    if (currentQuiz.answerType !== 'meaning') {       
      const lang = currentQuiz.vocab.tag === 'Tiếng Trung' ? 'zh-CN' : 'ja-JP';       
      playAudio(currentQuiz.expectedAnswer, lang);     
    }   
  };   
  
  const handleNext = () => {     
    setShowCombo(false); 
    const nextCount = questionsAnswered + 1;     
    setQuestionsAnswered(nextCount);     
    if (quizMode === 'normal' && nextCount >= questionLimit) {       
      if (onFinishLesson) onFinishLesson({ type: 'quiz_session', reachedCombo10: combo10ReachedRef.current });
      setAppState('result');     
    } else {       
      generateQuiz(filteredPool);     
    }   
  };   

  useEffect(() => {
    let timer;
    if (appState === 'playing' && quizMode === 'time_attack') {
        timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                  if (onFinishLesson) onFinishLesson({ type: 'quiz_session', reachedCombo10: combo10ReachedRef.current });
                    setAppState('result');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }
    return () => clearInterval(timer);
  }, [appState, quizMode, onFinishLesson]);

  useEffect(() => {     
    const handleKeyDown = (e) => {       
      if (appState !== 'playing' || !currentQuiz) return;       
      if (!selectedAnswer) {         
        if (['1', '2', '3', '4'].includes(e.key)) {           
          const index = parseInt(e.key) - 1;           
          if (currentQuiz.options[index]) {             
            handleOptionClick(currentQuiz.options[index]);           
          }         
        }       
      } else {         
        if (e.key === 'Enter') {           
          handleNext();         
        }       
      }     
    };     
    window.addEventListener('keydown', handleKeyDown);     
    return () => window.removeEventListener('keydown', handleKeyDown);   
  }, [appState, currentQuiz, selectedAnswer, questionsAnswered, questionLimit, filteredPool, quizMode, combo]);   

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (appState === 'playing') {
        e.preventDefault();
        e.returnValue = 'Bạn có chắc chắn muốn thoát? Kết quả bài Test sẽ không được lưu!';
      }
    };

    const handleLinkClick = async (e) => {
      if (appState === 'playing') {
        const target = e.target.closest('a'); 
        if (target) {
          e.preventDefault();
          e.stopPropagation();
          const ok = await showConfirm("Chưa Xong Test!", "Bạn đang làm bài dở dang. Bạn có chắc chắn muốn thoát không?");
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

  return (
    <>
      <audio ref={correctAudio} src={correctSound} preload="auto" />       
      <audio ref={wrongAudio} src={wrongSound} preload="auto" />              
      <audio ref={comboAudio} src={comboSound} preload="auto" />

      {appState === 'setup' && (
        <div className="max-w-5xl mx-auto mt-2 md:mt-6 px-3 md:px-4 pb-36 md:pb-24">         
          <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-3xl shadow-xl shadow-indigo-100/60 border border-gray-100 dark:border-gray-700 text-center">           
            <div className="text-5xl md:text-6xl mb-2 md:mb-3">🎮</div>           
            <h2 className="text-xl md:text-2xl font-black text-gray-800 dark:text-gray-100 mb-4">Thiết lập Test</h2>                      
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-left">             
              <div>               
                <label className="block font-bold text-gray-700 dark:text-gray-200 text-sm mb-2">Chọn Chủ đề (Chỉ từ đã học):</label>               
                <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 p-3 rounded-xl font-bold text-indigo-700 dark:text-indigo-300 outline-none">                 
                  <option value="All">Tổng (Đã học {learnedVocabList.length}/{vocabList.length})</option>                 
                  {uniqueTags.filter(t => t !== 'All').map(tag => {
                    const totalCount = vocabList.filter(v => v.tag === tag).length;
                    const learnedCount = learnedVocabList.filter(v => v.tag === tag).length;
                    return (
                      <option key={tag} value={tag}>{tag} (Đã học {learnedCount}/{totalCount})</option>
                    )
                  })}               
                </select>             
              </div>             

              <div>               
                <div className="flex items-center justify-between mb-2">
                  <label className="block font-bold text-gray-700 dark:text-gray-200 text-sm">Số lượng câu hỏi:</label>
                  {quizMode === 'time_attack' && (
                    <span className="text-[11px] font-bold text-blue-500 dark:text-blue-300">Không áp dụng tính giờ</span>
                  )}
                </div>
                <select
                  value={questionLimit}
                  onChange={(e) => setQuestionLimit(Number(e.target.value))}
                  disabled={quizMode === 'time_attack'}
                  className={`w-full border p-3 rounded-xl font-bold outline-none transition-colors ${quizMode === 'time_attack' ? 'bg-gray-100 dark:bg-gray-700/70 border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-400 cursor-not-allowed' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-indigo-700 dark:text-indigo-300'}`}
                >                 
                  <option value={5}>5 câu</option>                 
                  <option value={10}>10 câu</option>                 
                  <option value={20}>20 câu</option>                 
                  <option value={50}>50 câu</option>               
                </select>             
              </div>             

              <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/30 p-3 rounded-xl border border-blue-100 dark:border-blue-800">
                <div>
                  <label className="font-bold text-blue-600 dark:text-blue-300 text-sm cursor-pointer block" htmlFor="time-attack-toggle">⏱️ Thử Thách Tính Giờ</label>
                  <span className="text-xs text-blue-500 dark:text-blue-300">60s. Đúng +2s, Sai -3s</span>
                </div>
                <input type="checkbox" id="time-attack-toggle" checked={quizMode === 'time_attack'} onChange={(e) => setQuizMode(e.target.checked ? 'time_attack' : 'normal')} className="w-6 h-6 accent-blue-600 cursor-pointer" />
              </div>

              <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/30 p-3 rounded-xl border border-red-100 dark:border-red-800">               
                <div>                 
                  <label className="font-bold text-red-600 dark:text-red-300 text-sm cursor-pointer block" htmlFor="hardcore-toggle">Chế độ Hardcore</label>                 
                  <span className="text-xs text-red-500 dark:text-red-300">Hỏi nghĩa Việt, bắt chọn Kanji</span>               
                </div>               
                <input type="checkbox" id="hardcore-toggle" checked={isHardcore} onChange={(e) => setIsHardcore(e.target.checked)} className="w-6 h-6 accent-red-600 cursor-pointer" />             
              </div>
            </div>

            {currentAvailableList.length < 4 && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm font-bold mt-4 text-center">
                ⚠️ Chưa đủ điều kiện: Bạn mới có {currentAvailableList.length} từ đã học ở chủ đề này. Cần tối thiểu 4 từ đã học để mở khóa Quiz!
              </div>
            )}

            <div className="bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 p-3 rounded-xl mt-3 space-y-2 text-left">
              <p className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-300">Vật phẩm phiên test</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className={`flex items-center justify-between rounded-lg p-2 border ${((userData?.inventory?.xpBoost || 0) > 0) ? 'border-orange-200 bg-orange-50 dark:border-orange-700 dark:bg-orange-900/30' : 'border-gray-200 bg-gray-100 dark:border-gray-600 dark:bg-gray-700/60 opacity-60'}`}>
                  <div>
                    <p className="font-bold text-sm text-orange-700 dark:text-orange-300">⚡ Bùa EXP x1.5 (1 phiên)</p>
                    <p className="text-xs text-gray-500 dark:text-gray-300">Sở hữu: {userData?.inventory?.xpBoost || 0}</p>
                  </div>
                  <input type="checkbox" checked={useXpBoost && (userData?.inventory?.xpBoost || 0) > 0} disabled={(userData?.inventory?.xpBoost || 0) === 0} onChange={(e) => setUseXpBoost(e.target.checked)} className="w-5 h-5 accent-orange-500" />
                </label>

                <label className={`flex items-center justify-between rounded-lg p-2 border ${((userData?.inventory?.shieldToken || 0) > 0) ? 'border-indigo-200 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/30' : 'border-gray-200 bg-gray-100 dark:border-gray-600 dark:bg-gray-700/60 opacity-60'}`}>
                  <div>
                    <p className="font-bold text-sm text-indigo-700 dark:text-indigo-300">🛡️ Lá Chắn Sai (chặn vỡ combo 1 lần)</p>
                    <p className="text-xs text-gray-500 dark:text-gray-300">Sở hữu: {userData?.inventory?.shieldToken || 0}</p>
                  </div>
                  <input type="checkbox" checked={useShieldToken && (userData?.inventory?.shieldToken || 0) > 0} disabled={(userData?.inventory?.shieldToken || 0) === 0} onChange={(e) => setUseShieldToken(e.target.checked)} className="w-5 h-5 accent-indigo-500" />
                </label>
              </div>
            </div>
          </div>       
          
          <div className="fixed left-0 right-0 bottom-[calc(70px+env(safe-area-inset-bottom))] md:bottom-6 z-40 px-3 md:px-6 pointer-events-none">
            <div className="max-w-5xl mx-auto pointer-events-auto">
              <button 
                onClick={startSession} 
                disabled={currentAvailableList.length < 4}
                className={`w-full font-black text-lg py-4 rounded-2xl transition-transform ${currentAvailableList.length < 4 ? 'bg-gray-400 text-gray-200 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-[0_14px_28px_rgba(79,70,229,0.32)] active:scale-95'}`}
              >               
                {currentAvailableList.length < 4 ? 'CHƯA ĐỦ ĐIỀU KIỆN' : 'BẮT ĐẦU TEST'}
              </button>
            </div>
          </div>
        </div>
      )}

      {appState === 'result' && (
        <div className="max-w-md mx-auto mt-10 text-center bg-white p-8 rounded-3xl shadow-xl border border-gray-50 animate-fade-in">         
          <Confetti width={window.innerWidth} height={window.innerHeight} recycle={true} numberOfPieces={220} gravity={0.1} />
          
          <h2 className="text-3xl font-black text-gray-800 mb-2">KẾT QUẢ</h2>         
          <p className="text-gray-500 font-medium mb-8">Chủ đề: {filterTag} | {quizMode === 'time_attack' ? 'Tính giờ' : `${questionLimit} câu`}</p>                  
          <div className="relative w-40 h-40 mx-auto bg-indigo-50 rounded-full flex items-center justify-center border-8 border-indigo-100 mb-6">           
            <span className="text-4xl font-black text-indigo-600">
               {quizMode === 'time_attack' ? `${score}` : `${score}/${questionLimit}`}
            </span>         
          </div>                  
          
          {quizMode === 'time_attack' && <p className="text-indigo-500 font-bold mb-2">Đã hoàn thành {score} câu!</p>}
          <p className="text-sm font-black text-yellow-600 mb-2">+{expGained} EXP</p>
          <p className="text-xl font-bold text-gray-700 mb-8">
            {quizMode === 'normal' 
              ? (Math.round((score / questionLimit) * 100) < 50 ? "Cần ôn tập thêm nhé!" : Math.round((score / questionLimit) * 100) < 80 ? "Rất tốt, sắp hoàn hảo rồi!" : "Quá xuất sắc!")
              : (score < 10 ? "Tay còn hơi chậm, cố lên nhé!" : score < 25 ? "Phản xạ rất nhanh nhẹn!" : "Tốc độ thần thánh!")}
          </p>                  
          
          <button onClick={() => setAppState('setup')} className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-lg transition-transform active:scale-95">           
            Hoàn Tất        
          </button>       
        </div>
      )}

      {appState === 'playing' && currentQuiz && (
        <div className="max-w-2xl mx-auto mt-2 md:mt-4 pb-48 md:pb-32 dark:text-gray-100 relative">       
          {showCombo && (
            <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center combo-zoom">
                <h1 className="text-5xl md:text-7xl font-black drop-shadow-[0_8px_8px_rgba(0,0,0,0.5)] whitespace-nowrap px-4 text-center flex justify-center items-center gap-2 md:gap-4">
                  <span>🔥</span>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-red-500 to-yellow-500">{comboMsg}</span>
                  <span>🔥</span>
                </h1>
              </div>
            </div>
          )}
          
          <div className="mb-4 md:mb-6 px-2">         
            <div className="flex justify-between items-center mb-2">           
              <button 
                onClick={async () => { const ok = await showConfirm("Hủy Bài Test", "Bạn có chắc chắn muốn thoát? Kết quả bài Test này sẽ bị hủy bỏ."); if(ok) setAppState('setup'); }} 
                className="font-bold text-red-500 hover:text-red-700 bg-red-50 dark:bg-red-900/30 px-3 py-1 rounded-lg text-sm transition-colors active:scale-95"
              >
                ✖ Thoát
              </button>
              
              {combo >= 2 && (
                  <span className="font-bold text-orange-500 text-sm animate-pulse inline-flex items-center gap-1 whitespace-nowrap">
                      🔥 Combo x{combo}
                  </span>
              )}

              <span className="font-black text-indigo-600 dark:text-indigo-300">
                {quizMode === 'time_attack' ? `⏳ ${timeLeft}s` : `Câu ${questionsAnswered + 1} / ${questionLimit}`}
              </span>         
            </div>         
            <div className="flex flex-wrap gap-2 mb-2">
              {sessionExpMultiplier > 1 && (
                <span className="text-[11px] font-black px-2 py-1 rounded-lg bg-orange-100 text-orange-700">⚡ EXP x{sessionExpMultiplier}</span>
              )}
              {(shieldAvailable || shieldUsed) && (
                <span className={`text-[11px] font-black px-2 py-1 rounded-lg ${shieldAvailable ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600'}`}>
                  🛡️ Lá chắn: {shieldAvailable ? 'Sẵn sàng' : 'Đã dùng'}
                </span>
              )}
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 md:h-3 rounded-full overflow-hidden">           
              <div className={`h-full transition-all duration-300 ${quizMode === 'time_attack' ? (timeLeft <= 10 ? 'bg-red-500' : 'bg-orange-400') : 'bg-indigo-500 dark:bg-indigo-400'}`} style={{ width: `${quizMode === 'time_attack' ? Math.min(100, (timeLeft / 60) * 100) : ((questionsAnswered) / questionLimit) * 100}%` }}></div>         
            </div>       
          </div>       
          
          <div className="bg-white dark:bg-gray-900 rounded-3xl md:rounded-4xl shadow-xl shadow-indigo-100/50 p-4 md:p-10 border border-gray-50 dark:border-gray-700 relative overflow-hidden">                  
            <div className="text-center mb-6 relative">           
              <p className="text-xs md:text-sm font-bold text-indigo-500 uppercase tracking-wider mb-2">             
                {currentQuiz.askType === 'word' ? 'Kanji / Từ vựng' : currentQuiz.askType === 'reading' ? 'Cách đọc Hiragana' : 'Nghĩa tiếng Việt'}           
              </p>           
              <h2 className="text-4xl md:text-6xl font-black text-gray-800 py-2 md:py-4 flex justify-center items-center gap-2 md:gap-4 break-words">             
                {currentQuiz.questionText}             
                {currentQuiz.askType !== 'meaning' && (               
                  <button onClick={() => playAudio(currentQuiz.questionText, currentQuiz.vocab.tag === 'Tiếng Trung' ? 'zh-CN' : 'ja-JP')} className="text-xl md:text-2xl bg-blue-50 text-blue-500 rounded-full w-10 h-10 md:w-12 md:h-12 flex items-center justify-center hover:bg-blue-100 active:scale-90 transition-all flex-shrink-0">🔊</button>             
                )}           
              </h2>         
            </div>         
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">           
              {currentQuiz.options.map((option, index) => {             
                let stateClass = "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-gray-700 hover:border-indigo-200 dark:hover:border-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200";             
                if (selectedAnswer) {               
                  if (option === currentQuiz.expectedAnswer) stateClass = "bg-green-500 border-green-600 text-white shadow-lg shadow-green-200 scale-[1.02]";               
                  else if (option === selectedAnswer) stateClass = "bg-red-500 border-red-600 text-white shadow-lg shadow-red-200 scale-[0.98]";               
                  else stateClass = "bg-gray-100 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 opacity-50";             
                }             
                return (               
                  <button                  
                    key={index}                  
                    onClick={() => handleOptionClick(option)}                  
                    disabled={!!selectedAnswer}                  
                    className={`relative p-4 md:p-5 text-lg md:text-xl font-bold rounded-2xl border-2 transition-all duration-300 ease-in-out w-full text-center flex items-center justify-center ${stateClass}`}               
                  >                 
                    <span className="hidden md:flex absolute left-4 w-7 h-7 items-center justify-center rounded-lg border-2 border-current opacity-40 text-sm font-black">                   
                      {index + 1}                 
                    </span>                 
                    <span className="w-full text-center">{option}</span>               
                  </button>             
                );           
              })}         
            </div>       
          </div>       
          
          {selectedAnswer && (         
            <div className={`fixed bottom-[calc(56px+env(safe-area-inset-bottom))] md:bottom-0 left-0 w-full border-t-4 z-40 p-4 md:p-6 animate-fade-in shadow-[0_-10px_20px_rgba(0,0,0,0.05)] transition-colors duration-300 ${isCorrect ? 'bg-green-50 dark:bg-green-900 border-green-400 dark:border-green-700' : 'bg-red-50 dark:bg-red-900 border-red-400 dark:border-red-700'}`}>           
              <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">                                        
                <div className="flex items-start md:items-center gap-3 md:gap-5 w-full md:w-auto">               
                  <div className={`text-3xl md:text-5xl hidden sm:block ${isCorrect ? 'text-green-500' : 'text-red-500'}`}>                 
                    {isCorrect ? '✅' : '❌'}               
                  </div>               
                  <div className="text-center sm:text-left w-full sm:w-auto">                 
                    <p className={`font-black text-lg md:text-xl mb-1 ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>                   
                      {isCorrect ? 'Chính xác!' : 'Sai rồi nhé!'}                 
                    </p>                 
                    <div className="text-gray-800 text-base md:text-lg flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">                   
                      <span className="font-black text-2xl text-indigo-900">{currentQuiz.vocab.word}</span>                   
                      {currentQuiz.vocab.reading !== currentQuiz.vocab.word && (                     
                        <span className="font-bold text-blue-600">({currentQuiz.vocab.reading})</span>                   
                      )}                   
                      <span className="font-medium text-gray-700 sm:before:content-['-'] sm:before:mr-2">                     
                        {currentQuiz.vocab.meaning}                   
                      </span>                 
                    </div>               
                  </div>             
                </div>             
                <button                
                  onClick={handleNext}                
                  className={`w-full md:w-auto font-black text-lg py-4 px-8 rounded-2xl shadow-lg transition-transform active:scale-95 flex justify-center items-center gap-2 ${isCorrect ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}             
                >               
                  {quizMode === 'normal' && (questionsAnswered + 1 >= questionLimit) ? 'KẾT QUẢ' : 'TIẾP TỤC'}               
                  <span className="hidden md:flex items-center justify-center bg-white/20 px-2 py-1 rounded-lg text-sm ml-2">                 
                    Enter                
                  </span>             
                </button>           
              </div>         
            </div>       
          )}     
        </div>
      )}
    </>
  ); 
}

export default QuizPage;