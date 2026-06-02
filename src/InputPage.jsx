import React, { useState } from 'react'; 
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore'; 
import { db } from './firebase'; 

function InputPage({ vocabList, user, isAdmin }) {   
  const [word, setWord] = useState('');   
  const [reading, setReading] = useState('');   
  const [meaning, setMeaning] = useState('');   
  const [tag, setTag] = useState('JLPT N5');   
  const [isLoading, setIsLoading] = useState(false);   
  const [viewFilter, setViewFilter] = useState('All');   
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);   
  const [editForm, setEditForm] = useState({ word: '', reading: '', meaning: '' });   

  const isPureKana = (str) => /^[\u3040-\u309F\u30A0-\u30FF\u30FC]+$/.test(str.trim());   
  const isKanaWord = isPureKana(word) && word.trim() !== '';   

  const playAudio = (text, langStr = 'ja-JP') => {     
    const speech = new SpeechSynthesisUtterance(text);     
    speech.lang = langStr;     
    window.speechSynthesis.speak(speech);   
  };   

  const handleWordChange = (e) => {     
    const val = e.target.value;     
    setWord(val);     
    if (isPureKana(val) && val !== '') setReading(val);     
    else if (val === '') setReading('');   
  };   

  const handleSubmit = async (e) => {     
    e.preventDefault();     
    const finalReading = isPureKana(word) ? word : reading;     
    if (!word || !finalReading || !meaning) return;          
    
    setIsLoading(true);     
    try {       
      const targetCollection = isAdmin ? "vocabularies" : "suggestions";       
      await addDoc(collection(db, targetCollection), {         
        userId: user.uid,         
        userEmail: user.email,         
        word: word.trim(),         
        reading: finalReading.trim(),         
        meaning: meaning.trim(),         
        tag: tag,         
        correctCount: 0,         
        wrongCount: 0,         
        createdAt: new Date(),         
        srsLevel: 0,         
        nextReview: new Date(),         
        lastReviewed: null       
      });       
      setWord(''); setReading(''); setMeaning('');              
      
      if (!isAdmin) {         
        alert("Đóng góp thành công! Admin sẽ duyệt trước khi hiển thị trong kho từ chung.");       
      }     
    } catch (error) { 
      console.error("Lỗi:", error); 
    }     
    setIsLoading(false);   
  };   

  const handleDelete = async (id) => {     
    if (window.confirm("Bạn chắc chắn muốn xóa khỏi kho không?")) {       
      try {         
        await deleteDoc(doc(db, "vocabularies", id));       
      } catch (error) { 
        console.error("Lỗi:", error); 
      }     
    }   
  };   

  const handleEditClick = (v) => {     
    setEditingId(v.id);     
    setEditForm({ word: v.word, reading: v.reading, meaning: v.meaning });   
  };   

  const handleCancelEdit = () => {     
    setEditingId(null);   
  };   

  const handleSaveEdit = async (id) => {     
    if (!editForm.word || !editForm.reading || !editForm.meaning) {       
      alert("Vui lòng không để trống!");       
      return;     
    }     
    try {       
      await updateDoc(doc(db, "vocabularies", id), {         
        word: editForm.word.trim(),         
        reading: editForm.reading.trim(),         
        meaning: editForm.meaning.trim()       
      });       
      setEditingId(null);      
    } catch (error) {       
      console.error("Lỗi cập nhật:", error);     
    }   
  };   

  const uniqueTags = ['All', ...new Set(vocabList.map(v => v.tag || 'Chung'))];   
  
  // Sắp xếp: Từ nào nhập trước (cũ nhất) sẽ lên đầu
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredVocabList = (viewFilter === 'All'     
    ? vocabList     
    : vocabList.filter(v => (v.tag || 'Chung') === viewFilter))
    .filter((v) => {
      if (!normalizedSearchTerm) return true;
      const haystacks = [v.word, v.reading, v.meaning, v.tag]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      return haystacks.some((value) => value.includes(normalizedSearchTerm));
    })    
    .sort((a, b) => {       
      const getTime = (dateVal) => {         
        if (!dateVal) return 0;         
        if (dateVal.seconds) return dateVal.seconds * 1000;         
        if (dateVal instanceof Date) return dateVal.getTime();         
        return new Date(dateVal).getTime() || 0;       
      };       
      return getTime(a.createdAt) - getTime(b.createdAt);     
    });   

  return (     
    <div className="grid lg:grid-cols-2 gap-8 items-start dark:text-gray-100">              
      <div className="flex flex-col gap-6">         
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">           
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">Nhập Thủ Công</h2>           
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">             
            <div>               
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cấp / Chủ Đề</label>               
              <select value={tag} onChange={(e) => setTag(e.target.value)} className="w-full p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-gray-700 dark:text-gray-200 cursor-pointer">                 
                <option value="Chung">Từ (Chung)</option>                 
                <option value="JLPT N5">JLPT N5</option>                 
                <option value="JLPT N4">JLPT N4</option>                 
                <option value="JLPT N3">JLPT N3</option>                 
                <option value="JLPT N2">JLPT N2</option>                 
                <option value="JLPT N1">JLPT N1</option>                 
                <option value="Hàng không / Sân bay">Hàng không / Sân bay</option>                 
                <option value="Giao tiếp công việc">Giao tiếp công việc</option>               
              </select>             
            </div>             
            <div>               
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Từ vựng (Kanji/Hiragana)</label>               
              <input className="w-full p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-lg dark:text-white" value={word} onChange={handleWordChange} required placeholder="VD: 日本" />             
            </div>             
            {!isKanaWord && (               
              <div className="animate-fade-in">                 
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cách đọc</label>                 
                <input className="w-full p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-lg dark:text-white" value={reading} onChange={(e) => setReading(e.target.value)} required placeholder="VD: にほん" />               
              </div>             
            )}             
            <div>               
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nghĩa tiếng Việt</label>               
              <input className="w-full p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-lg dark:text-white" value={meaning} onChange={(e) => setMeaning(e.target.value)} required placeholder="VD: Nhật Bản" />             
            </div>             
            <button type="submit" disabled={isLoading} className="mt-2 w-full p-4 bg-gray-900 hover:bg-black text-white font-bold rounded-2xl transition-all shadow-lg active:scale-95 disabled:opacity-70">               
              {isLoading ? 'Đang xử lý...' : (isAdmin ? '+ Thêm vào kho từ' : '+ Gửi đóng góp')}             
            </button>           
          </form>         
        </div>       
      </div>       
      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col h-full max-h-[85vh]">         
        <div className="flex flex-col gap-4 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">           
          <div className="flex justify-between items-end">             
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Kho từ vựng chung</h2>             
            <span className="text-sm font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 px-3 py-1 rounded-full">               
              {filteredVocabList.length} từ             
            </span>           
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tìm nhanh để sửa từ</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo từ vựng, cách đọc, nghĩa hoặc chủ đề..."
              className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm md:text-base dark:text-white"
            />
          </div>                    
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2">             
            {uniqueTags.map(t => (               
              <button                  
                key={t}                 
                onClick={() => setViewFilter(t)}                 
                className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${viewFilter === t ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 shadow-md' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}               
              >                 
                {t === 'All' ? 'Tất cả' : t}               
              </button>             
            ))}           
          </div>         
        </div>                  
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">           
          {filteredVocabList.map(v => (             
            <div key={v.id}>               
              {editingId === v.id ? (                 
                <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border-2 border-indigo-500 shadow-md flex flex-col gap-3 relative animate-fade-in">                   
                  <div>                     
                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400">Từ vựng / Kanji:</label>                     
                    <input                        
                      className="w-full p-2 mt-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm dark:text-white"                        
                      value={editForm.word}                        
                      onChange={(e) => setEditForm({...editForm, word: e.target.value})}                      
                    />                   
                  </div>                   
                  <div>                     
                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400">Cách đọc:</label>                     
                    <input                        
                      className="w-full p-2 mt-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm dark:text-white"                        
                      value={editForm.reading}                        
                      onChange={(e) => setEditForm({...editForm, reading: e.target.value})}                      
                    />                   
                  </div>                   
                  <div>                     
                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400">Nghĩa tiếng Việt:</label>                     
                    <input                        
                      className="w-full p-2 mt-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm dark:text-white"                        
                      value={editForm.meaning}                        
                      onChange={(e) => setEditForm({...editForm, meaning: e.target.value})}                      
                    />                   
                  </div>                   
                  <div className="flex gap-2 justify-end mt-2">                     
                    <button onClick={handleCancelEdit} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-sm font-bold transition-colors">Hủy</button>                     
                    <button onClick={() => handleSaveEdit(v.id)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold transition-colors">Lưu</button>                   
                  </div>                 
                </div>               
              ) : (                 
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 flex flex-col gap-2 hover:bg-white dark:hover:bg-gray-800 hover:border-indigo-100 dark:hover:border-indigo-400 hover:shadow-md transition-all relative group">                                      
                  {isAdmin && (                     
                    <div className="absolute top-3 right-3 flex gap-2 z-10">                       
                      <button                          
                        onClick={() => handleEditClick(v)}                          
                        className="w-8 h-8 flex items-center justify-center bg-blue-100 text-blue-500 rounded-full hover:bg-blue-500 hover:text-white transition-all shadow-sm"                         
                        title="Sửa"                       
                      >✏️</button>                       
                      <button                          
                        onClick={() => handleDelete(v.id)}                          
                        className="w-8 h-8 flex items-center justify-center bg-red-100 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-sm"                         
                        title="Xóa"                       
                      >🗑️</button>                     
                    </div>                   
                  )}                   
                  <div className="flex justify-between items-start pr-20">                     
                    <div>                       
                      <div className="flex items-center gap-2">                         
                        <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{v.word}</p>                         
                        <button onClick={() => playAudio(v.word, v.tag === 'Tiếng Trung' ? 'zh-CN' : 'ja-JP')} className="text-lg text-blue-400 hover:text-blue-600 transition-colors" title="Nghe phát âm">🔊</button>                       
                      </div>                       
                      {v.word !== v.reading && <p className="text-sm text-gray-500 dark:text-gray-400">{v.reading}</p>}                       
                      <p className="text-gray-700 dark:text-gray-300 font-medium mt-1">{v.meaning}</p>                     
                    </div>                   
                  </div>                                      
                  <div className="flex gap-2 text-xs font-bold mt-2">                     
                    <span className="text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900 px-2 py-1 rounded">Đúng: {v.correctCount || 0}</span>                     
                    <span className="text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900 px-2 py-1 rounded">Sai: {v.wrongCount || 0}</span>                   
                  </div>                 
                </div>               
              )}             
            </div>           
          ))}                      
          {filteredVocabList.length === 0 && (             
            <div className="text-center text-gray-400 py-10 mt-10">               
              <div className="text-5xl mb-4">📭</div>               
              <p>{normalizedSearchTerm ? 'Không tìm thấy từ phù hợp.' : 'Chưa có từ nào trong danh mục này.'}</p>             
            </div>           
          )}         
        </div>       
      </div>     
    </div>   
  ); 
}

export default InputPage;