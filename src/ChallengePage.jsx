import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, increment } from 'firebase/firestore';
import { db } from './firebase';
import { useDialog } from './DialogContext'; // KẾT NỐI POPUP
// Đã sửa 'expSystem' thành 'Expsystem'
import { EXP_REWARDS, calcLevelFromExp, getLevelColor } from './Expsystem';

function ChallengePage({ vocabList, user, isAdmin, addExp }) {
  const [roomIdInput, setRoomIdInput] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [localState, setLocalState] = useState('menu'); 
  const [qIndex, setQIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  
  const { showAlert } = useDialog(); // SỬ DỤNG POPUP

  const shuffleArray = (array) => [...array].sort(() => Math.random() - 0.5);

  const playAudio = (text, langStr = 'ja-JP') => {
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = langStr;
    window.speechSynthesis.speak(speech);
  };

  useEffect(() => {
    if (!roomData?.roomId) return;
    const roomRef = doc(db, 'rooms', roomData.roomId);
    const unsubscribe = onSnapshot(roomRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRoomData({ roomId: docSnap.id, ...data });
        
        if (data.status === 'playing' && localState === 'lobby') {
          setLocalState('playing');
        } else if (data.status === 'finished' && localState !== 'result') {
          setLocalState('result');
        }
      } else {
        await showAlert("Lỗi Truy Cập", "Phòng đã bị đóng hoặc không tồn tại!");
        setLocalState('menu');
        setRoomData(null);
      }
    });
    return () => unsubscribe();
  }, [roomData?.roomId, localState, showAlert]);

  const handleCreateRoom = async () => {
    if (!roomIdInput.trim()) return await showAlert("Lỗi", "Vui lòng nhập mã phòng!");
    if (vocabList.length < 20) return await showAlert("Lỗi", "Kho từ phải có ít nhất 20 từ để tạo phòng!");

    const roomCode = roomIdInput.trim().toUpperCase();
    const roomRef = doc(db, 'rooms', roomCode);

    try {
      const selectedVocabs = shuffleArray(vocabList).slice(0, 20);
      const questions = selectedVocabs.map(v => {
        const types = ['word', 'reading', 'meaning'];
        const askType = types[Math.floor(Math.random() * types.length)];
        let answerType = types[Math.floor(Math.random() * types.length)];
        while(answerType === askType) answerType = types[Math.floor(Math.random() * types.length)];

        const expectedAnswer = v[answerType];
        const allUniqueAnswers = [...new Set(vocabList.map(item => item[answerType]))];
        const wrongAnswers = shuffleArray(allUniqueAnswers.filter(ans => ans !== expectedAnswer)).slice(0, 3);
        
        return {
          vocab: v,
          askType,
          answerType,
          questionText: v[askType],
          expectedAnswer,
          options: shuffleArray([expectedAnswer, ...wrongAnswers])
        };
      });

      await setDoc(roomRef, {
        hostId: user.uid,
        status: 'waiting',
        questions: questions,
        players: {
          [user.uid]: {
            name: user.displayName,
            avatar: user.photoURL,
            score: 0,
            finished: false
          }
        }
      });

      setRoomData({ roomId: roomCode });
      setLocalState('lobby');
    } catch (error) {
      console.error(error);
      await showAlert("Lỗi Hệ Thống", "Đã xảy ra lỗi khi tạo phòng!");
    }
  };

  const handleJoinRoom = async () => {
    if (!roomIdInput.trim()) return await showAlert("Lỗi", "Vui lòng nhập mã phòng!");
    const roomCode = roomIdInput.trim().toUpperCase();
    const roomRef = doc(db, 'rooms', roomCode);

    try {
      const snap = await getDoc(roomRef);
      if (!snap.exists()) return await showAlert("Lỗi", "Phòng không tồn tại!");
      if (snap.data().status !== 'waiting') return await showAlert("Lỗi", "Phòng đã bắt đầu hoặc đã kết thúc!");

      await updateDoc(roomRef, {
        [`players.${user.uid}`]: {
          name: user.displayName,
          avatar: user.photoURL,
          score: 0,
          finished: false
        }
      });

      setRoomData({ roomId: roomCode, ...snap.data() });
      setLocalState('lobby');
    } catch (error) {
      console.error(error);
      await showAlert("Lỗi Hệ Thống", "Lỗi tham gia phòng!");
    }
  };

  const handleStartGame = async () => {
    if (!roomData?.roomId) return;
    try {
      await updateDoc(doc(db, 'rooms', roomData.roomId), { status: 'playing' });
    } catch (error) {
      console.error(error);
    }
  };

  const handleAnswer = async (option) => {
    if (selectedAnswer) return;
    setSelectedAnswer(option);

    const currentQ = roomData.questions[qIndex];
    const isCorrect = option === currentQ.expectedAnswer;
    const roomRef = doc(db, 'rooms', roomData.roomId);

    if (isCorrect) {
      await updateDoc(roomRef, {
        [`players.${user.uid}.score`]: increment(10)
      });
    }

    if (currentQ.answerType !== 'meaning') {
      const lang = currentQ.vocab.tag === 'Tiếng Trung' ? 'zh-CN' : 'ja-JP';
      playAudio(currentQ.expectedAnswer, lang);
    }

    setTimeout(async () => {
      if (qIndex + 1 >= roomData.questions.length) {
        await updateDoc(roomRef, { [`players.${user.uid}.finished`]: true });
        // Trao EXP thách đấu: người có điểm cao nhất nhận CHALLENGE_WIN, còn lại nhận QUIZ_CORRECT * số câu đúng
        const leaderboard = getLeaderboard();
        const myScore = roomData.players[user.uid]?.score || 0;
        const topScore = leaderboard[0]?.score || 0;
        if (addExp) {
          if (myScore > 0 && myScore === topScore) {
            addExp(EXP_REWARDS.CHALLENGE_WIN);
          } else {
            addExp(Math.floor(myScore / 10) * EXP_REWARDS.QUIZ_CORRECT);
          }
        }
        setLocalState('result');
      } else {
        setQIndex(qIndex + 1);
      }
      setSelectedAnswer(null);
    }, 1000);
  };

  const getLeaderboard = () => {
    if (!roomData?.players) return [];
    return Object.values(roomData.players).sort((a, b) => b.score - a.score);
  };

  if (localState === 'menu') {
    return (
      <div className="max-w-md mx-auto mt-10 p-8 bg-white dark:bg-gray-800 rounded-3xl shadow-xl text-center">
        <div className="text-6xl mb-6">⚔️</div>
        <h2 className="text-3xl font-black text-gray-800 dark:text-gray-100 mb-2">Thách Đấu</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-8">Tham gia đấu trường thời gian thực</p>
        
        <input 
          value={roomIdInput} 
          onChange={(e) => setRoomIdInput(e.target.value)} 
          placeholder="Nhập mã phòng (VD: ROOM123)" 
          className="w-full p-4 mb-4 bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-center text-xl font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 focus:outline-none"
        />
        
        <div className="flex flex-col gap-3">
          <button onClick={handleJoinRoom} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-transform active:scale-95">
            Tham Gia Ngay
          </button>
          
          {isAdmin && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={handleCreateRoom} className="w-full bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 font-bold py-3 rounded-xl transition-colors hover:bg-red-100">
                Tạo Phòng Mới (Admin)
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (localState === 'lobby') {
    return (
      <div className="max-w-xl mx-auto mt-10 p-8 bg-white dark:bg-gray-800 rounded-3xl shadow-xl text-center">
        <p className="text-gray-500 font-bold tracking-widest uppercase">Mã Phòng</p>
        <h2 className="text-5xl font-black text-indigo-600 dark:text-indigo-400 tracking-widest my-4">{roomData.roomId}</h2>
        
        <div className="my-8">
          <p className="text-left font-bold text-gray-700 dark:text-gray-300 mb-4">Người chơi đã vào ({Object.keys(roomData.players || {}).length}):</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.values(roomData.players || {}).map((p, i) => (
              <div key={i} className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <img src={p.avatar} alt="avt" className="w-8 h-8 rounded-full" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                  {p.exp !== undefined && (() => {
                    const { level } = calcLevelFromExp(p.exp || 0);
                    const color = getLevelColor(level);
                    return <span className={`text-[10px] font-black bg-gradient-to-r ${color} text-white px-1.5 py-0.5 rounded-full`}>Lv.{level}</span>;
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {user.uid === roomData.hostId ? (
          <button onClick={handleStartGame} className="w-full bg-green-500 hover:bg-green-600 text-white font-black text-xl py-4 rounded-2xl shadow-lg transition-transform active:scale-95">
            BẮT ĐẦU TRẬN ĐẤU
          </button>
        ) : (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 font-bold rounded-xl animate-pulse">
            Đang chờ Admin bắt đầu trận đấu...
          </div>
        )}
      </div>
    );
  }

  if (localState === 'playing' && roomData?.questions) {
    const currentQ = roomData.questions[qIndex];
    return (
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-6 mt-4 items-start dark:text-gray-100">
        
        <div className="w-full md:w-1/3 bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700">
          <h3 className="font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-2 mb-4">🏆 Live Score</h3>
          <div className="flex flex-col gap-2">
            {getLeaderboard().map((p, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${p.finished ? 'opacity-50' : 'bg-gray-50 dark:bg-gray-700'}`}>
                <span className="font-black text-gray-400">{i + 1}</span>
                <img src={p.avatar} alt="avt" className="w-8 h-8 rounded-full" />
                <div className="flex-1 truncate">
                  <p className="font-bold text-sm text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                  {p.exp !== undefined && (() => {
                    const { level } = calcLevelFromExp(p.exp || 0);
                    const color = getLevelColor(level);
                    return <span className={`text-[10px] font-black bg-gradient-to-r ${color} text-white px-1.5 py-0.5 rounded-full`}>Lv.{level}</span>;
                  })()}
                </div>
                <span className="font-black text-indigo-600 dark:text-indigo-300">{p.score}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full md:w-2/3 bg-white dark:bg-gray-900 p-6 md:p-10 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700">
          <div className="flex justify-between font-bold text-gray-500 mb-6">
            <span>Mã: {roomData.roomId}</span>
            <span className="text-indigo-500">Câu {qIndex + 1} / {roomData.questions.length}</span>
          </div>

          <div className="text-center mb-8">
            <p className="text-xs md:text-sm font-bold text-indigo-500 uppercase tracking-wider mb-2">
              {currentQ.askType === 'word' ? 'Kanji / Từ vựng' : currentQ.askType === 'reading' ? 'Cách đọc Hiragana' : 'Nghĩa tiếng Việt'}
            </p>
            <h2 className="text-4xl md:text-6xl font-black text-gray-800 dark:text-gray-100 py-4 break-words">
              {currentQ.questionText}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {currentQ.options.map((opt, i) => {
              let stateClass = "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-gray-700 border-2 border-gray-200 dark:border-gray-600";
              if (selectedAnswer) {
                if (opt === currentQ.expectedAnswer) stateClass = "bg-green-500 border-green-600 text-white scale-[1.02] shadow-lg shadow-green-200 dark:shadow-none";
                else if (opt === selectedAnswer) stateClass = "bg-red-500 border-red-600 text-white scale-[0.98]";
                else stateClass = "bg-gray-100 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-400 opacity-50";
              }
              return (
                <button
                  key={i}
                  onClick={() => handleAnswer(opt)}
                  disabled={!!selectedAnswer}
                  className={`p-4 md:p-6 text-lg font-bold rounded-2xl transition-all duration-300 w-full text-center ${stateClass}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto mt-10 p-8 bg-white dark:bg-gray-800 rounded-3xl shadow-xl text-center">
      <div className="text-6xl mb-6">🏆</div>
      <h2 className="text-3xl font-black text-gray-800 dark:text-gray-100 mb-8">BẢNG XẾP HẠNG CHUNG CUỘC</h2>
      
      <div className="flex flex-col gap-4">
        {getLeaderboard().map((p, i) => (
          <div key={i} className={`flex items-center gap-4 p-4 rounded-2xl ${i === 0 ? 'bg-yellow-50 border-2 border-yellow-300 dark:bg-yellow-900/30' : 'bg-gray-50 dark:bg-gray-700'}`}>
            <span className={`text-2xl font-black w-8 ${i === 0 ? 'text-yellow-500' : 'text-gray-400'}`}>{i + 1}</span>
            <img src={p.avatar} alt="avt" className="w-12 h-12 rounded-full border-2 border-white dark:border-gray-600 shadow-sm" />
            <div className="flex-1 text-left">
              <p className="font-bold text-lg text-gray-800 dark:text-gray-100">{p.name}</p>
              {p.finished && <p className="text-xs text-green-500 font-bold">Đã hoàn thành</p>}
            </div>
            <span className="font-black text-2xl text-indigo-600 dark:text-indigo-400">{p.score} pt</span>
          </div>
        ))}
      </div>

      <button onClick={() => {setLocalState('menu'); setRoomData(null); setQIndex(0);}} className="mt-8 w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-lg transition-transform active:scale-95">
        Thoát Phòng
      </button>
    </div>
  );
}

export default ChallengePage;