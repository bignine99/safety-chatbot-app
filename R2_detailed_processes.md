상세 개발 과정 (RAG 앱 표준 작업 절차 v1.0)
이 문서는 PDF 파일을 업로드하여 Firestore 벡터 데이터베이스를 구축하고, Cloud Function을 통해 RAG(검색 증강 생성) 파이프라인을 실행하는 웹 앱의 표준 개발 과정을 상세히 기록합니다. 이 절차는 70회 이상의 배포 실패에서 얻은 교훈을 바탕으로 재정립되었습니다.

0단계: 인프라 구축 및 환경 설정 (코딩 전)
모든 오류의 90%는 이 0단계의 설정 누락으로 인해 발생합니다. 코딩 전에 인프라를 완벽하게 구축해야 합니다.

요구사항
모든 Firebase 백엔드 서비스 (인증, DB, 스토리지) 활성화.

rag1이라는 이름의 Non-default Firestore 데이터베이스 생성.

Cloud Function이 Vertex AI를 사용할 수 있도록 IAM 권한 설정.

로컬 개발 환경이 Storage에 접근할 수 있도록 CORS 정책 설정.

구현 내용
Firebase 프로젝트 생성 및 업그레이드

Firebase Console에서 새 프로젝트(예: rag1-be5b0)를 생성합니다.

즉시 Blaze(종량제) 요금제로 업그레이드합니다. (Vertex AI API는 유료 서비스입니다.)

핵심 서비스 활성화

Authentication: 빌드 > Authentication > 시작하기를 누르고, 익명 로그인 제공업체를 활성화합니다.

Storage: 빌드 > Storage > 시작하기를 눌러 기본 버킷(예: rag1-be5b0.firebasestorage.app)을 생성합니다. (이 주소를 정확히 복사해 둡니다.)

Firestore Database:

빌드 > Firestore Database > 데이터베이스 만들기를 클릭합니다.

[핵심] 데이터베이스 ID로 (default) 대신 **rag1**을 입력합니다. (이것이 5 NOT_FOUND 오류를 피하는 첫걸음입니다.)

nam5 (us-central) 리전을 선택하고 프로덕션 모드로 생성합니다.

Google Cloud (GCP) 권한 설정 (IAM)

Google Cloud Console로 이동하여 동일한 프로젝트를 선택합니다.

API 및 서비스 > 라이브러리에서 Vertex AI API (aiplatform.googleapis.com)를 검색하여 **사용 설정**합니다.

IAM 및 관리자 > IAM으로 이동합니다.

rag1-be5b0@appspot.gserviceaccount.com (App Engine default service account)라는 주 구성원을 찾습니다.

이 계정에 연필 아이콘을 눌러 다음 두 가지 역할을 추가합니다:

Vertex AI 사용자 (Embedding 모델 호출 권한)

Cloud Datastore 사용자 (Firestore DB 읽기/쓰기 권한)

Storage CORS 정책 설정 (로컬 개발용)

로컬에 cors.json 파일을 생성합니다.

JSON

[
  {
    "origin": ["http://localhost:3000"],
    "method": ["GET", "POST", "PUT", "DELETE", "HEAD"],
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"],
    "maxAgeSeconds": 3600
  }
]
Google Cloud SDK (gsutil)가 설치된 터미널에서 2단계에서 복사한 정확한 버킷 주소로 명령을 실행합니다.

Bash

gsutil cors set cors.json gs://rag1-be5b0.firebasestorage.app
1단계: 클라이언트 UI 및 Firebase 연동
목표: Next.js 프론트엔드(app/admin/page.tsx)를 구축하고, rag1 데이터베이스에 정확히 연결하여 파일 업로드 및 메타데이터 저장을 구현합니다.

요구사항
PDF 파일을 선택하고 업로드할 수 있는 UI 페이지 생성.

window is not defined 오류 없이 Next.js SSR 환경에서 Firebase SDK 초기화.

파일 업로드 성공 시, rag1 데이터베이스의 papers 컬렉션에 메타데이터 저장.

구현 내용
Next.js 프로젝트 설정

create-next-app으로 프로젝트를 생성하고, app/admin/page.tsx 파일을 생성합니다.

Firebase 클라이언트 SDK 설정 (lib/firebase/config.ts)

Firebase Console에서 **웹 앱(</>)**을 등록하고 firebaseConfig 객체를 복사합니다.

lib/firebase/config.ts 파일을 생성하여 SDK를 초기화합니다.

[핵심 1 - SSR 오류 해결] getAnalytics는 window 객체가 필요하므로 서버에서 충돌합니다. Analytics 관련 코드를 모두 주석 처리하거나 제거합니다.

[핵심 2 - 5 NOT_FOUND 해결] getFirestore(app) 대신 getFirestore(app, "rag1")을 사용하여 rag1 데이터베이스 ID를 명시적으로 지정합니다.

TypeScript

// lib/firebase/config.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = { ... }; // 콘솔에서 복사한 값

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// "rag1" 데이터베이스 ID를 명시적으로 지정
export const db = getFirestore(app, "rag1");
export const auth = getAuth(app);
export const storage = getStorage(app);
파일 업로드 UI 구현 (app/admin/page.tsx)

파일 상단에 'use client';를 선언합니다.

[핵심 3 - SSR 오류 해결] lib/firebase/config 외에, page.tsx 파일 내부에 중복으로 getAnalytics를 호출하는 '유령' 코드가 없는지 반드시 확인하고 제거합니다.

useEffect 훅을 사용하여 페이지 로드 시 signInAnonymously(auth)를 호출합니다.

handleUpload 함수를 구현합니다:

storagePath를 papers/${user.uid}/${file.name}로 정의합니다.

uploadBytesResumable을 사용하여 storageRef에 파일을 업로드합니다.

uploadTask.on()의 성공 콜백(마지막 인자)에서 getDownloadURL을 호출합니다.

addDoc(collection(db, 'papers'), { ... })를 호출하여 rag1의 papers 컬렉션에 메타데이터(fileName, storagePath, uploader 등)를 저장합니다.

2단계: 서버 측 RAG 파이프라인 구축 (Cloud Function)
목표: 1단계에서 파일이 Storage에 업로드되면, Cloud Function을 트리거하여 PDF 파싱, 벡터화, knowledgeChunks 컬렉션 저장을 자동 수행합니다.

요구사항
Storage 이벤트(onObjectFinalized)로 트리거되는 함수 작성.

pdf-parse 모듈 호환성 문제를 해결하여 PDF 텍스트 추출.

Vertex AI (text-embedding-004)를 통해 텍스트 조각을 벡터화.

rag1 데이터베이스의 knowledgeChunks 컬렉션에 벡터 저장.

구현 내용
Functions 환경 설정

firebase init functions를 실행하고 TypeScript를 선택합니다.

functions/package.json: pdf-parse@1.1.1 버전을 명시적으로 설치합니다. (최신 버전은 모듈 호환성 오류 발생)

JSON

"dependencies": {
  "@google-cloud/aiplatform": "...",
  "firebase-admin": "...",
  "firebase-functions": "...",
  "pdf-parse": "1.1.1" // [핵심] 호환성을 위해 1.1.1 버전 고정
}
functions/tsconfig.json: pdf-parse와의 호환을 위해 module 설정을 수정합니다.

JSON

{
  "compilerOptions": {
    "module": "commonjs", // "NodeNext" 대신 "commonjs" 사용
     ...
  }
}
RAG 파이프라인 함수 작성 (functions/src/index.ts)

[핵심 1 - pdf-parse 해결] import 대신 require 구문을 사용하여 모듈을 로드합니다.

TypeScript

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdf = require("pdf-parse");
initializeApp()로 Admin SDK를 초기화합니다.

onObjectFinalized 함수를 정의하고, 0단계에서 생성한 버킷 이름(rag1-be5b0.firebasestorage.app)을 명시합니다.

getEmbedding 함수: PredictionServiceClient를 사용하여 Vertex AI text-embedding-004 모델을 호출하는 로직을 구현합니다.

[핵심 2 - 5 NOT_FOUND 해결] PDF 파싱 후 Firestore에 데이터를 쓸 때, getFirestore() 대신 getFirestore("rag1")을 사용하여 rag1 데이터베이스 ID를 명시적으로 지정합니다.

TypeScript

// ... (PDF 파싱 및 텍스트 분할) ...

// [!!! 핵심 수정 !!!] "rag1" 데이터베이스를 명시적으로 지정
const db = getFirestore("rag1");
const batch = db.batch();

for (const chunk of textChunks) {
  const embedding = await getEmbedding(chunk);
  const docRef = db.collection("knowledgeChunks").doc();
  batch.set(docRef, {
    originalFilePath: filePath,
    text: chunk,
    embedding: embedding, // 벡터 저장
    createdAt: FieldValue.serverTimestamp(),
  });
}

await batch.commit(); // rag1 DB의 knowledgeChunks에 일괄 저장
logger.info("Successfully created embeddings and saved to Firestore.");
Functions 배포 (필수 절차)

index.ts 수정 후, 반드시 수동으로 컴파일해야 배포에 반영됩니다.

Bash

cd functions  # 1. functions 폴더로 이동
npm run build # 2. TypeScript를 JavaScript(lib/index.js)로 컴파일
cd ..         # 3. 루트 폴더로 복귀
컴파일 후 Firebase에 함수를 배포합니다. Skipped가 아닌 Updating function...이 표시되는지 확인합니다.

Bash

firebase deploy --only functions
3단계: 보안 규칙 및 인덱스 설정
목표: 클라이언트와 서버의 데이터 접근 권한을 명확히 분리하고, 벡터 검색을 위한 인덱스를 설정합니다.

요구사항
클라이언트는 papers 컬렉션에 자기 소유의 메타데이터만 생성/읽기/삭제할 수 있어야 합니다.

knowledgeChunks 컬렉션은 서버(Cloud Function)만 쓰기 가능해야 합니다.

규칙과 인덱스가 (default)가 아닌 rag1 데이터베이스에 배포되어야 합니다.

구현 내용
firebase.json 설정

프로젝트 루트의 firebase.json 파일에 database 필드를 추가하여 모든 Firestore 관련 배포가 rag1을 대상으로 하도록 지정합니다.

JSON

{
  "firestore": {
    "database": "rag1", // [핵심] 규칙/인덱스를 "rag1" DB에 배포
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  ...
}
firestore.rules (보안 규칙)

papers 컬렉션은 인증된 사용자가 uploader 필드를 자신의 ID와 일치시킬 때만 생성하도록 허용합니다. (타임스탬프 등 추가 필드를 허용하여 400 Bad Request 방지)

knowledgeChunks 컬렉션은 클라이언트의 쓰기(write)를 명시적으로 차단(if false;)합니다.

rules_version = '2';
service cloud.firestore {
  // [핵심] (default)가 아닌 "rag1" DB에 적용됨
  match /databases/{database}/documents { 

    match /papers/{paperId} {
      allow create: if request.auth != null
                    && request.resource.data.uploader == request.auth.uid;
      allow read, delete: if request.auth != null
                          && resource.data.uploader == request.auth.uid;
    }
    // 컬렉션 그룹 조회를 위한 'list' 규칙 (필요시)
    match /papers {
      allow list: if request.auth != null;
    }

    match /knowledgeChunks/{chunkId} {
      allow read: if request.auth != null;
      allow write: if false; // [핵심] 오직 서버(Admin SDK)만 쓰기 허용
    }
  }
}
firestore.indexes.json (벡터 인덱스)

knowledgeChunks 컬렉션의 embedding 필드에 대한 벡터 인덱스를 정의합니다. (현재 Firestore는 ASCENDING 등으로 임시 설정 후, 콘솔에서 벡터로 직접 수정해야 할 수 있습니다.)

JSON

{
  "indexes": [
    {
      "collectionId": "knowledgeChunks",
      "fields": [
        {
          "fieldPath": "embedding",
          "order": "ASCENDING" // 임시 설정 (이후 콘솔에서 벡터 인덱스로 변경)
        }
      ],
      "queryScope": "COLLECTION"
    }
  ]
}
규칙 및 인덱스 배포

firebase.json이 rag1을 가리키는지 확인한 후, 규칙을 배포합니다.

Bash

firebase deploy --only firestore


===========================


4단계: RAG 검색 및 답변 함수 구축 (Callable Function)
목표: 클라이언트(웹 앱)에서 사용자 질문(Query)을 받아, 2단계에서 구축한 knowledgeChunks 벡터 DB를 검색하고, 검색된 컨텍스트를 기반으로 Vertex AI(Gemini)가 최종 답변을 생성하여 반환하는 Callable Cloud Function을 구축합니다.

요구사항
onCall (클라이언트 호출 가능) 함수를 새로 생성합니다. (예: askRAG)

functions/src/index.ts에 Vertex AI의 Generative Model (Gemini) SDK를 추가합니다.

함수는 2단계와 동일한 getEmbedding 함수를 사용하여 사용자 질문을 벡터화해야 합니다.

함수는 rag1 데이터베이스에 연결하여 knowledgeChunks 컬렉션에 대해 **벡터 검색(findNearest)**을 수행해야 합니다.

검색된 텍스트 조각(Context)과 원본 질문을 조합하여, 정교한 프롬프트를 통해 Gemini 모델이 답변을 생성하도록 요청해야 합니다.

구현 내용
Functions 환경 설정 (functions/package.json)

onCall 함수와 Vertex AI Generative SDK를 사용하기 위해 관련 라이브러리를 dependencies에 추가합니다.

JSON

"dependencies": {
  "@google-cloud/aiplatform": "...",
  "@google-cloud/vertexai": "^1.0.0", // [신규] Gemini 모델 사용을 위해 추가
  "firebase-admin": "...",
  "firebase-functions": "...",
  "pdf-parse": "1.1.1"
}
npm install을 functions 폴더 내에서 실행합니다.

firebase.json에 함수 리전 명시

onCall 함수가 클라이언트 SDK에서 올바르게 호출되려면, firebase.json의 functions 설정에 region을 명시하는 것이 좋습니다.

JSON

{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "region": "us-central1", // [권장] 함수 실행 리전 명시
      ...
    }
  ],
  ...
}
RAG 답변 함수 작성 (functions/src/index.ts)

기존 index.ts 파일 하단에 askRAG 함수와 getGenerativeAnswer 헬퍼 함수를 추가합니다.

TypeScript

// functions/src/index.ts

// 1. ... (기존 import ...
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {PredictionServiceClient} from "@google-cloud/aiplatform";

// [신규] onCall 함수 및 Vertex AI Generative SDK 임포트
import {onCall} from "firebase-functions/v2/https";
import {VertexAI, HarmCategory, HarmBlockThreshold} from "@google-cloud/vertexai";

// ... (기존 pdf-parse, initializeApp, chunkText, initVertexAI, getEmbedding 함수 ...

// [신규] 5-1. Vertex AI (Gemini) 초기화 및 답변 생성 함수
const vertexAI = new VertexAI({project: "rag1-be5b0", location: "us-central1"});
const generativeModel = vertexAI.getGenerativeModel({
  model: "gemini-1.5-flash-001", // 사용할 Gemini 모델
  safetySettings: [
    {category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE},
  ],
});

async function getGenerativeAnswer(context: string, question: string): Promise<string> {
  const prompt = `
    당신은 "논문 분석 RAG 봇"입니다.
    주어진 "컨텍스트" 정보만을 기반으로 사용자의 "질문"에 대해 답변해야 합니다.
    컨텍스트에 답변이 없으면 "제공된 정보만으로는 답변할 수 없습니다."라고 응답하십시오.
    추측하거나 외부 지식을 사용하지 마십시오.

    ---
    [컨텍스트]
    ${context}
    ---
    [질문]
    ${question}
    ---
    [답변]
  `;

  try {
    const result = await generativeModel.generateContent(prompt);
    const response = result.response;
    return response.text();
  } catch (error) {
    logger.error("Error getting generative answer:", error);
    throw new Error("Gemini 모델 호출에 실패했습니다.");
  }
}

// [신규] 5-2. 클라이언트가 호출할 메인 RAG 함수
export const askRAG = onCall(
  { memory: "1GiB", timeoutSeconds: 60, region: "us-central1" },
  async (request) => {
    const question = request.data.question;
    if (typeof question !== "string" || question.trim().length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "질문(question)이 필요합니다.");
    }

    logger.info(`Received question: ${question}`);

    try {
      // [핵심 1: DB 연결] "rag1" 데이터베이스에 연결
      const db = getFirestore("rag1");

      // [핵심 2: 질문 벡터화]
      const queryVector = await getEmbedding(question);
      logger.info("Question vectorized.");

      // [핵심 3: 벡터 검색]
      const chunksCollection = db.collection("knowledgeChunks");
      const snapshot = await chunksCollection.findNearest("embedding", queryVector, {
        limit: 5, // 가장 유사한 5개의 조각을 가져옴
        distanceMeasure: "DOT_PRODUCT" // 또는 COSINE
      });

      if (snapshot.empty) {
        logger.warn("No relevant chunks found.");
        return { answer: "관련된 정보를 찾을 수 없습니다." };
      }

      // [핵심 4: 컨텍스트 조합]
      const context = snapshot.docs.map((doc) => doc.data().text).join("\n\n");
      logger.info(`Context retrieved: ${context.substring(0, 100)}...`);

      // [핵심 5: 답변 생성]
      const finalAnswer = await getGenerativeAnswer(context, question);
      logger.info(`Answer generated: ${finalAnswer.substring(0, 50)}...`);

      return { answer: finalAnswer };

    } catch (error) {
      logger.error("Error in askRAG pipeline:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError("internal", "RAG 파이프라인 처리 중 오류가 발생했습니다.");
    }
  }
);

// ... (기존 generateEmbeddings 함수 ...)
5단계: 클라이언트 UI 연동 (질문/답변 인터페이스)
목표: app/admin/page.tsx 페이지에 질문 입력창과 답변 표시 영역을 추가하고, 4단계에서 만든 askRAG 함수를 호출하여 실시간으로 답변을 받아옵니다.

요구사항
app/admin/page.tsx에 질문용 <input>과 답변 표시용 <div> 추가.

lib/firebase/config.ts에 Functions 클라이언트 SDK 추가.

askRAG 함수를 호출하고, 로딩 상태를 관리하며, 결과를 화면에 렌더링.

구현 내용
Firebase Client SDK 설정 (lib/firebase/config.ts)

클라이언트에서 Cloud Function을 호출할 수 있도록 getFunctions를 config 파일에 추가하고 export 합니다.

[주의] getFunctions 호출 시, 4-2단계에서 firebase.json에 명시한 region (예: us-central1)을 동일하게 지정해주는 것이 좋습니다.

TypeScript

// lib/firebase/config.ts (수정본)

import { initializeApp, getApps, getApp } from "firebase/app";
// ...
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions"; // [신규] Functions SDK 임포트

const firebaseConfig = { ... };

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app, "rag1");
export const auth = getAuth(app);
export const storage = getStorage(app);

// [신규] Functions 서비스 초기화 (리전 지정)
export const functions = getFunctions(app, "us-central1"); 

// ... (Analytics 관련 코드는 제거된 상태) ...
질문/답변 UI 및 로직 추가 (app/admin/page.tsx)

기존 업로드 UI 하단에 RAG 질문 UI를 추가합니다.

TypeScript

// app/admin/page.tsx (기존 코드에 이어서 수정)

// 1. ... (기존 'use client' 및 import ...
import { auth, storage, db, functions } from '@/lib/firebase/config'; // [수정] functions 임포트

// 4. Firebase에서 필요한 기능들
import { signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from "firebase/functions"; // [신규] Callable 함수 호출 도구

// 5. 관리자 페이지 컴포넌트
export default function AdminPage() {
  // ... (기존 user, file, uploadProgress, message 상태) ...

  // [신규] RAG 질문/답변을 위한 상태
  const [question, setQuestion] = useState<string>(''); // 사용자 질문
  const [ragAnswer, setRagAnswer] = useState<string>(''); // RAG 답변
  const [isAsking, setIsAsking] = useState<boolean>(false); // 로딩 상태

  // ... (기존 useEffect, handleFileChange, handleUpload 함수 ...) ...

  // [신규] 8-1. RAG 질문 실행 함수
  const handleAskQuestion = async () => {
    if (question.trim().length === 0 || !user) {
      setRagAnswer('질문을 입력해주세요.');
      return;
    }

    setIsAsking(true);
    setRagAnswer('생각 중...');

    try {
      // 4단계에서 만든 "askRAG" 함수를 이름으로 호출
      const askRAGCallable = httpsCallable(functions, 'askRAG');
      const result: any = await askRAGCallable({ question: question });

      setRagAnswer(result.data.answer);

    } catch (error: any) {
      console.error("Error calling askRAG function:", error);
      setRagAnswer('답변 생성 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setIsAsking(false);
    }
  };

  // 9. 화면에 보여줄 HTML (JSX)
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', display: 'flex', gap: '40px' }}>

      {/* --- 1. 업로드 영역 --- */}
      <div style={{ flex: 1, borderRight: '1px solid #ccc', paddingRight: '20px' }}>
        <h1>RAG 논문 업로드 (Admin)</h1>

        {user ? (
          <p>로그인 상태: 익명 (ID: {user.uid})</p>
        ) : (
          <p>로그인 중...</p>
        )}

        <input type="file" accept=".pdf" onChange={handleFileChange} />

        <button
          onClick={handleUpload}
          disabled={!file || !user}
          style={{ marginLeft: '10px', padding: '5px 10px' }}
        >
          업로드 시작
        </button>

        {uploadProgress > 0 && (
          <div style={{ marginTop: '10px' }}>
            <p>업로드 중: {Math.round(uploadProgress)}%</p>
            <progress value={uploadProgress} max="100" style={{ width: '300px' }} />
          </div>
        )}

        {message && (
          <p style={{ marginTop: '20px', color: message.startsWith('오류') ? 'red' : 'green' }}>
            {message}
          </p>
        )}
      </div>

      {/* --- 2. [신규] RAG 질문 영역 --- */}
      <div style={{ flex: 1 }}>
        <h2>논문 RAG 봇</h2>
        <p>업로드된 PDF의 내용을 기반으로 질문하세요.</p>

        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="예: Earned Schedule이란 무엇인가요?"
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
        />
        <button
          onClick={handleAskQuestion}
          disabled={isAsking || !user}
          style={{ marginTop: '10px', padding: '5px 10px' }}
        >
          {isAsking ? '답변 생성 중...' : '질문하기'}
        </button>

        {ragAnswer && (
          <div style={{ marginTop: '20px', padding: '10px', border: '1px solid #eee', background: '#f9f9f9', whiteSpace: 'pre-wrap' }}>
            <strong>답변:</strong>
            <p>{ragAnswer}</p>
          </div>
        )}
      </div>
    </div>
  );
}
배포 및 테스트
Functions 배포 (필수): index.ts에 askRAG 함수가 추가되었으므로, functions 폴더에서 npm run build를 실행한 후, 루트 폴더에서 firebase deploy --only functions를 실행하여 새 함수를 배포합니다.

클라이언트 재시작: npm run dev를 다시 시작하여 page.tsx와 config.ts의 변경 사항을 반영합니다.

테스트: http://localhost:3000/admin에 접속하여, 업로드된 논문의 내용을 기반으로 질문을 입력하고 "질문하기" 버튼을 클릭합니다. knowledgeChunks에서 검색된 컨텍스트를 기반으로 Gemini가 생성한 답변이 나타나야 합니다.


===========================

6단계: Cloud Function 최적화 (콜드 스타트 해결)
목표: generateEmbeddings 및 askRAG 함수의 "콜드 스타트" (느린 초기 시작) 문제를 해결하여, 사용자가 파일 업로드 후 또는 질문 시 즉각적인 응답을 받을 수 있도록 속도를 향상시킵니다.

구현: 함수에 minInstances: 1 옵션을 설정하여, 항상 최소 1개의 함수 인스턴스가 "웜(Warm)" 상태로 대기하도록 강제합니다. (Blaze 요금제이므로 약간의 추가 비용이 발생할 수 있으나, 사용자 경험에 필수적입니다.)

functions/src/index.ts 파일 수정

onObjectFinalized (generateEmbeddings)와 onCall (askRAG) 함수의 옵션 객체에 minInstances: 1 속성을 각각 추가합니다.

generateEmbeddings 함수 수정:

TypeScript

// ...
// 5. [핵심] Storage에 파일이 업로드되면 실행될 메인 함수
export const generateEmbeddings = onObjectFinalized(
  {
    bucket: "rag1-be5b0.firebasestorage.app", // 0단계에서 확인한 버킷 주소
    memory: "1GiB",
    timeoutSeconds: 300,
    minInstances: 1, // [신규] 콜드 스타트 방지를 위한 최소 인스턴스
  },
  async (event) => {
// ...
askRAG 함수 수정:

TypeScript

// ...
// [신규] 5-2. 클라이언트가 호출할 메인 RAG 함수
export const askRAG = onCall(
  { 
    memory: "1GiB", 
    timeoutSeconds: 60, 
    region: "us-central1",
    minInstances: 1, // [신규] 콜드 스타트 방지를 위한 최소 인스턴스
  },
  async (request) => {
// ...
수정된 함수 강제 재배포

functions/src/index.ts 파일을 저장합니다.

터미널에서 functions 폴더로 이동하여 수동으로 재컴파일합니다.

Bash

cd functions
npm run build
cd ..
루트 폴더에서 함수를 강제로 재배포합니다.

Bash

firebase deploy --only functions --force

============================

7단계: Next.js 프론트엔드 프로덕션 배포 (Firebase Hosting)
목표: localhost:3000에서만 접근 가능했던 관리자 페이지(app/admin/page.tsx)를 실제 인터넷 URL(예: https://[프로젝트명].web.app)에 배포하여 어디서든 접근하고 사용할 수 있게 합니다.

구현: Next.js App Router(동적 서버 렌더링)와 가장 잘 통합되는 Firebase App Hosting을 사용하여 배포합니다.

GitHub 리포지토리 준비

현재 로컬 컴퓨터에 있는 이 프로젝트(paper-rag-app) 전체를 GitHub 리포지토리에 push합니다. (App Hosting은 GitHub 연동을 통해 CI/CD를 자동화합니다.)

Firebase App Hosting 설정

Firebase Console로 이동합니다.

왼쪽 메뉴에서 빌드(Build) > Hosting을 클릭합니다.

"App Hosting" (파란색 아이콘의 새 버전)을 선택하고 시작하기를 누릅니다. (기존 "웹 호스팅"이 아닙니다.)

"GitHub로 계속"을 선택하고, 1단계에서 준비한 리포지토리를 Firebase가 접근할 수 있도록 승인하고 연결합니다.

배포 설정 및 자동 배포

Firebase가 리포지토리를 분석한 후, next.config.mjs 파일을 감지하고 "Next.js 앱"임을 자동으로 인식합니다.

배포 리전(예: us-central1)을 선택하고 "배포"를 클릭합니다.

이 과정을 통해 GitHub Actions가 리포지토리에 자동으로 설정되며, 코드가 push될 때마다 앱이 자동으로 빌드 및 배포됩니다.

최종 테스트

배포가 완료되면(몇 분 정도 소요될 수 있습니다), Firebase 콘솔에 https://rag1-be5b0.web.app (또는 유사한) 형태의 라이브 URL이 표시됩니다.

이 URL에 접속하여 관리자 페이지가 정상적으로 로드되는지, 그리고 파일 업로드와 RAG 질문하기 기능이 모두 정상적으로 작동하는지 최종 테스트합니다.


8단계: Next.js 프론트엔드 프로덕션 배포 (Firebase Hosting)
목표: localhost:3000에서만 접근 가능했던 관리자 페이지(app/admin/page.tsx)를 실제 인터넷 URL(예: https://[프로젝트명].web.app)에 배포하여 어디서든 접근하고 사용할 수 있게 합니다.

구현: Next.js App Router(동적 서버 렌더링)와 가장 잘 통합되는 Firebase App Hosting을 사용하여 배포합니다.

1. GitHub 리포지토리 준비
현재 로컬 컴퓨터에 있는 이 "골든 템플릿" 프로젝트(paper-rag-app) 전체를 GitHub 리포지토리에 push합니다. (App Hosting은 GitHub 연동을 통해 CI/CD를 자동화합니다.)

2. Firebase App Hosting 설정
Firebase Console로 이동합니다.

왼쪽 메뉴에서 빌드(Build) > Hosting을 클릭합니다.

"App Hosting" (파란색 아이콘의 새 버전)을 선택하고 시작하기를 누릅니다. (기존 "웹 호스팅"이 아닙니다.)

"GitHub로 계속"을 선택하고, 1단계에서 준비한 리포지토리를 Firebase가 접근할 수 있도록 승인하고 연결합니다.

3. 배포 설정 및 자동 배포
Firebase가 리포지토리를 분석한 후, next.config.mjs 파일을 감지하고 "Next.js 앱"임을 자동으로 인식합니다.

배포 리전(예: us-central1)을 선택하고 "배포"를 클릭합니다.

이 과정을 통해 GitHub Actions가 리포지토리에 자동으로 설정되며, 코드가 main 브랜치에 push될 때마다 앱이 자동으로 빌드 및 배포됩니다.

4. 최종 테스트
배포가 완료되면(몇 분 정도 소요될 수 있습니다), Firebase 콘솔에 https://[YOUR_PROJECT_ID].web.app (또는 유사한) 형태의 라이브 URL이 표시됩니다.

이 URL에 접속하여 관리자 페이지가 정상적으로 로드되는지, 그리고 파일 업로드와 RAG 질문하기 기능이 모두 정상적으로 작동하는지 최종 테스트합니다.


===========================================

"안전 챗봇" 프로젝트를 위한 '재사용 워크플로우' 시작하기
이 문서는 paper-rag-app (Next.js + Genkit 통합 템플릿)을 사용하여 "안전 챗봇" 같은 신규 프로젝트를 10분 안에 시작하는 상세 절차를 기술합니다.

1단계: (콘솔) Firebase 및 Google Cloud 백엔드 준비
새 프로젝트를 위한 인프라를 생성합니다. 코딩 전에 이 단계가 완벽하게 끝나야 합니다.

Firebase 프로젝트 생성:

Firebase Console에서 "Safety-Chatbot-Project"(예시)라는 새 프로젝트를 만듭니다.

즉시 Blaze(종량제) 요금제로 업그레이드합니다. (Vertex AI 사용에 필수)

Firebase 서비스 활성화:

Authentication: 시작하기 -> 로그인 제공업체에서 익명 로그인을 활성화합니다.

Firestore Database: 데이터베이스 만들기 -> 프로덕션 모드로 (default) 데이터베이스를 생성합니다.

Storage: 시작하기를 눌러 기본 버킷을 활성화합니다.

Storage CORS 설정 (필수):

로컬 개발 환경(localhost:3000)에서 Storage로 파일을 업로드하기 위해 CORS 설정이 필수입니다.

로컬 컴퓨터에 cors.json 파일을 (임시로) 생성합니다.

JSON

[
  {
    "origin": ["http://localhost:3000"],
    "method": ["GET", "POST", "PUT", "DELETE", "HEAD"],
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"],
    "maxAgeSeconds": 3600
  }
]
Google Cloud SDK가 설치된 로컬 터미널(CMD 또는 PowerShell)에서 다음 명령어를 실행하여 정책을 적용합니다. (버킷 주소는 Firebase Storage에서 확인)

Bash

gsutil cors set cors.json gs://safety-chatbot-project.firebasestorage.app
Google Cloud IAM 및 API 설정:

Google Cloud Console로 이동하여 Safety-Chatbot-Project가 선택되었는지 확인합니다.

API 활성화: API 및 서비스 > 라이브러리에서 **Vertex AI API**를 검색하여 사용 설정합니다.

IAM 역할 부여: IAM 및 관리자 > IAM으로 이동합니다.

App Engine default service account (또는 ...@appspot.gserviceaccount.com으로 끝나는) 계정을 찾아 수정을 누릅니다.

+ 다른 역할 추가를 눌러 다음 3가지 역할을 추가하고 저장합니다.

Vertex AI 사용자 (AI 모델 호출 권한)

Cloud Datastore 사용자 (Firestore 읽기/쓰기 권한)

Storage 객체 관리자 (Storage 파일 읽기/쓰기 권한)

웹 앱 등록:

Firebase Console 프로젝트 설정 > 내 앱에서 **</> (웹 앱)**을 등록합니다.

SDK 설정 및 구성에서 표시되는 firebaseConfig 객체 정보를 복사해 둡니다. (다음 단계에서 사용)

2단계: (로컬) "골든 템플릿" 복제 및 기본 설정
이제 로컬 컴퓨터에서 코드를 준비합니다.

템플릿 복제(Clone):

05 Code 등 원하는 상위 폴더에서 터미널을 엽니다.

git clone 명령어로 템플릿을 새 프로젝트 이름(Safety-Chatbot-App)으로 복제합니다.

Bash

git clone https://github.com/bignine99/paper-rag-app.git Safety-Chatbot-App
폴더 이동 및 코드 열기:

방금 생성된 폴더로 이동합니다.

Bash

cd Safety-Chatbot-App
VS Code로 이 폴더를 엽니다.

Bash

code .
의존성 설치:

VS Code 내의 터미널을 열고 (Ctrl+``) npm install`을 실행하여 모든 패키지를 설치합니다.

Bash

npm install
(중요) 이 템플릿은 genkit CLI가 package.json에 빠져있을 수 있습니다. 만일을 대비해 수동으로 설치합니다.

Bash

npm install genkit
3단계: (로컬) 핵심 인증 설정 (.env.local 및 service-account.json)
이 단계는 Next.js 서버(Genkit)가 Google Cloud에 인증하기 위한 가장 중요한 단계입니다.

service-account-key.json 생성:

Google Cloud Console > IAM 및 관리자 > 서비스 계정으로 이동합니다.

(선택) + 서비스 계정 만들기를 눌러 이 앱 전용 계정(예: safety-chatbot-server)을 만들고, 1단계-4항에서 부여한 3가지 역할(Vertex AI, Datastore, Storage)을 동일하게 부여합니다.

(권장) 방금 만든 safety-chatbot-server 계정을 클릭 -> 키 탭 -> 키 추가 -> 새 키 만들기 -> JSON 선택 후 만들기를 누릅니다.

...json 파일이 다운로드됩니다.

비밀 키 배치:

다운로드한 JSON 파일의 이름을 **service-account-key.json**으로 변경합니다.

이 파일을 Safety-Chatbot-App 프로젝트 최상위 루트 (VS Code 탐색기 맨 위, package.json과 같은 위치)에 복사해 넣습니다.

.env.local 파일 생성:

프로젝트 최상위 루트에 **.env.local**이라는 새 파일을 생성합니다.

아래 내용을 모두 복사하여 붙여넣습니다.

[... ]로 표시된 부분을 1단계-5항에서 복사한 firebaseConfig 값과 방금 설정한 값으로 정확하게 채워 넣습니다.

코드 스니펫

# .env.local

# 1. 클라이언트용 (Public) 환경 변수 - (1단계-5항의 firebaseConfig 값)
NEXT_PUBLIC_FIREBASE_API_KEY="[AIzaSy...]"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="[safety-chatbot-project.firebaseapp.com]"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="[safety-chatbot-project]"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="[safety-chatbot-project.firebasestorage.app]"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="[712...]"
NEXT_PUBLIC_FIREBASE_APP_ID="[1:712...]"
NEXT_PUBLIC_MEASUREMENT_ID="[G-...]"

# 2. 서버/Genkit용 (Secret) 환경 변수
GCLOUD_PROJECT="[safety-chatbot-project]"
VERTEX_LOCATION="us-central1"

# 3. (필수) 서버 인증을 위한 서비스 계정 키 파일 경로
# 2단계에서 생성한 JSON 파일의 경로를 지정합니다.
GOOGLE_APPLICATION_CREDENTIALS="./service-account-key.json"
보안 설정 (.gitignore):

.gitignore 파일을 엽니다.

파일 맨 아래에 다음 두 줄이 반드시 포함되어 있는지 확인하여, 비밀 키가 GitHub에 유출되지 않도록 합니다.

코드 스니펫

# 로컬 환경 변수 파일
.env.local

# Google Cloud 서비스 계정 키
*.json
4단계: (로컬) 개발 서버 실행 및 개발 시작
이제 모든 설정이 완료되었습니다.

개발 서버 시작:

VS Code 터미널에서 다음 명령어를 실행합니다.

Bash

npm run dev
이 명령어 하나가 Next.js 웹서버와 Genkit AI 백엔드를 동시에 실행합니다. (별도의 genkit start는 필요 없습니다.)

웹 앱 확인:

브라우저에서 **http://localhost:3000**으로 접속합니다.

Next.js 기본 템플릿 화면("To get started, edit the page.tsx file.")이 보이면 성공입니다.

(localhost:4000이나 /api/genkit 같은 별도의 Genkit UI는 이 템플릿에 존재하지 않습니다.)

개발 시작:

이제 src/app/page.tsx 파일을 엽니다.

기존 템플릿 코드를 모두 지우고, "안전 챗봇"을 위한 UI(파일 업로드 버튼, 채팅창) 개발을 시작합니다.
















