import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// -----------------------------------------------------------------
// ❗️❗️❗️ 여기가 핵심입니다 ❗️❗️❗️
// .env.local을 믿지 않고, 실제 값을 "하드코딩"합니다.
// (image_682b85.png / image_67b3a1.jpg에서 가져온 값)
// -----------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyC5Bxs3yN4FZ--J3DV-Eudu2Zoi3PBjPy0",
  authDomain: "safety-chatbot-project.firebaseapp.com",
  projectId: "safety-chatbot-project",
  storageBucket: "safety-chatbot-project.firebasestorage.app",
  messagingSenderId: "712711322235",
  appId: "1:712711322235:web:f8e9b7dcb238ba956e40de",
  measurementId: "G-EYYYES0QWV"
};
// -----------------------------------------------------------------

// ❗️❗️❗️ [수정됨] 23번째 줄의 주석 '//'을 제거했습니다. ❗️❗️❗️
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// ❗️❗️❗️ [최종 수정] ❗️❗️❗️
// (default) DB가 아닌, "safety-db251106" DB를 명시적으로 지정합니다.
export const db = getFirestore(app, "safety-db251106");
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");

export { app, firebaseConfig };