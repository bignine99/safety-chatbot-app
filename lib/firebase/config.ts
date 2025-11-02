// lib/firebase/config.ts

// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics"; // 'isSupported' 임포트
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAPxe63MenlCXgNUpjs-kWZoZOJwPCAxwU",
  authDomain: "rag1-be5b0.firebaseapp.com",
  projectId: "rag1-be5b0",
  storageBucket: "rag1-be5b0.firebasestorage.app",
  messagingSenderId: "629359093891",
  appId: "1:629359093891:web:422a0cab6ba4595fb993b6",
  measurementId: "G-5WWX135WBV"
};

// [!!! SSR 안전 코드 수정 !!!]
// 중복 초기화를 방지하고, 'window' 객체가 있을 때만 Analytics를 초기화합니다.

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// [!!! 핵심 수정 !!!]
// (default)가 아닌 "rag1" 데이터베이스를 명시적으로 지정합니다.
export const db = getFirestore(app, "rag1");
export const auth = getAuth(app);
export const storage = getStorage(app);

// Analytics를 export할 변수를 미리 선언
export let analytics;

// typeof window !== 'undefined'는 코드가 브라우저에서 실행 중인지 확인
if (typeof window !== 'undefined') {
  // 브라우저 환경일 때만 Analytics 초기화
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}