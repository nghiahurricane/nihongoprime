import React, { createContext, useContext, useState, useCallback } from 'react';

const DialogContext = createContext();

export const useDialog = () => useContext(DialogContext);

export const DialogProvider = ({ children }) => {
  const [dialog, setDialog] = useState({
    isOpen: false,
    type: 'alert', // 'alert' | 'confirm'
    title: '',
    message: '',
    resolve: null,
  });

  const showAlert = useCallback((title, message) => {
    return new Promise((resolve) => {
      setDialog({
        isOpen: true,
        type: 'alert',
        title,
        message,
        resolve,
      });
    });
  }, []);

  const showConfirm = useCallback((title, message) => {
    return new Promise((resolve) => {
      setDialog({
        isOpen: true,
        type: 'confirm',
        title,
        message,
        resolve,
      });
    });
  }, []);

  const handleClose = (result) => {
    if (dialog.resolve) dialog.resolve(result);
    setDialog({ ...dialog, isOpen: false });
  };

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      
      {dialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 md:p-8 max-w-sm w-full border border-gray-100 dark:border-gray-700 transform transition-all scale-100 opacity-100">
            
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0 ${dialog.type === 'alert' ? 'bg-blue-100 text-blue-500 dark:bg-blue-900/30' : 'bg-yellow-100 text-yellow-500 dark:bg-yellow-900/30'}`}>
                {dialog.type === 'alert' ? 'ℹ️' : '⚠️'}
              </div>
              <h3 className="text-xl font-black text-gray-800 dark:text-gray-100 leading-tight">
                {dialog.title}
              </h3>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 font-medium mb-8 leading-relaxed">
              {dialog.message}
            </p>
            
            <div className="flex gap-3 justify-end">
              {dialog.type === 'confirm' && (
                <button 
                  onClick={() => handleClose(false)} 
                  className="px-5 py-2.5 rounded-xl font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-95"
                >
                  Hủy Bỏ
                </button>
              )}
              <button 
                onClick={() => handleClose(true)} 
                className={`px-5 py-2.5 rounded-xl font-bold text-white transition-colors active:scale-95 shadow-md ${dialog.type === 'alert' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                {dialog.type === 'alert' ? 'Đã hiểu' : 'Xác nhận'}
              </button>
            </div>
            
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};