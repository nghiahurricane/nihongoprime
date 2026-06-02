import { initializeApp } from "firebase/app"; 
import { getAnalytics } from "firebase/analytics"; 
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore"; 
import { getAuth, GoogleAuthProvider } from "firebase/auth"; 

const firebaseConfig = { 
  apiKey: "AIzaSyAr5wui3Isuw9rrdgDEKGySXjVlFmYSArY", 
  authDomain: "nihongoquizzz.firebaseapp.com", 
  projectId: "nihongoquizzz", 
  storageBucket: "nihongoquizzz.firebasestorage.app", 
  messagingSenderId: "631573217970", 
  appId: "1:631573217970:web:32c2b8a7667f41ce313fab", 
  measurementId: "G-6M0RN8W91Y" 
}; 

const app = initializeApp(firebaseConfig); 
export const analytics = getAnalytics(app);  
let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (error) {
  console.warn('Khong the khoi tao Firestore persistent cache, fallback ve bo nho tam.', error);
  dbInstance = getFirestore(app);
}

export const db = dbInstance;
export const auth = getAuth(app); 
export const provider = new GoogleAuthProvider();

// THÊM ĐOẠN NÀY ĐỂ ÉP GOOGLE LUÔN HIỆN BẢNG CHỌN TÀI KHOẢN (TRÁNH BỊ DÍNH 1 TÀI KHOẢN TRÊN ĐIỆN THOẠI)
provider.setCustomParameters({
  prompt: 'select_account'
});