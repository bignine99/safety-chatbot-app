// lib/firebase/config.ts (수정본)

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// [핵심 수정] 하드코딩된 Config 객체 대신 환경 변수에서 값을 읽어옵니다.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_MEASUREMENT_ID
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// "rag1" 하드코딩 제거
export const db = getFirestore(app, process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID!);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");

// Analytics 관련 코드는 없는 상태 유지