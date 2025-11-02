// app/admin/page.tsx (업로드 + RAG 질문 기능 포함 최종본)

// 1. "이 코드는 브라우저(클라이언트)에서 실행됩니다" 라는 선언입니다.
'use client';

// 2. React에서 필요한 도구들 (상태 관리, 이펙트)
import { useState, useEffect } from 'react';

// 3. config 파일에서 functions를 포함한 모든 Firebase 도구를 가져옵니다.
import { auth, storage, db, functions } from '@/lib/firebase/config';

// 4. Firebase에서 필요한 기능들
import { signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from "firebase/functions"; // Callable 함수 호출 도구

// 5. 관리자 페이지 컴포넌트
export default function AdminPage() {
  // --- 업로드 상태 변수 ---
  const [user, setUser] = useState<User | null>(null); // 로그인한 사용자 정보
  const [file, setFile] = useState<File | null>(null); // 선택된 파일
  const [uploadProgress, setUploadProgress] = useState<number>(0); // 업로드 진행률
  const [message, setMessage] = useState<string>(''); // 성공/실패 메시지

  // --- RAG 질문/답변 상태 변수 ---
  const [question, setQuestion] = useState<string>(''); // 사용자 질문
  const [ragAnswer, setRagAnswer] = useState<string>(''); // RAG 답변
  const [isAsking, setIsAsking] = useState<boolean>(false); // 로딩 상태

  // 6. [인증 처리] 페이지가 처음 로드될 때, 익명으로 로그인합니다.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        signInAnonymously(auth).catch((error) => {
          console.error("Anonymous sign-in failed:", error);
          setMessage('오류: 익명 로그인에 실패했습니다. ' + error.message);
        });
      }
    });

    return () => unsubscribe();
  }, []); // [] : 이 코드는 페이지가 처음 로드될 때 딱 한 번만 실행됩니다.

  // 7. 사용자가 파일 입력창에서 파일을 선택했을 때 실행되는 함수
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setMessage(''); // 이전 메시지 지우기
    }
  };

  // 8. "업로드 시작" 버튼을 클릭했을 때 실행되는 메인 함수
  const handleUpload = async () => {
    if (!file || !user) {
      setMessage('파일을 선택해주세요. 또는 로그인을 기다려주세요.');
      return;
    }

    setMessage(`업로드 시작: ${file.name}...`);
    setUploadProgress(0);

    try {
      // --- [A. Storage에 업로드] ---
      const storagePath = `papers/${user.uid}/${file.name}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error("Upload failed:", error);

          if (error.code === 'storage/unauthorized') {
            setMessage('오류: 파일 업로드 권한이 없습니다. storage.rules를 확인하세요.');
          } else {
            setMessage('업로드 실패: ' + error.message);
          }
        },
        async () => {
          // --- [B. 업로드 성공 시, Firestore에 메타데이터 저장] ---
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

          await addDoc(collection(db, 'papers'), {
            fileName: file.name,
            storagePath: storagePath,
            downloadURL: downloadURL,
            uploader: user.uid, 
            uploadDate: serverTimestamp(),
          });

          setMessage(`업로드 성공! "${file.name}" (이)가 RAG 시스템에 추가됩니다.`);
          setFile(null); // 파일 선택 초기화
        }
      );
    } catch (error: any) { 
      console.error("Error during upload process:", error);
      setMessage('업로드 처리 중 오류 발생: ' + error.message);
    }
  };

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