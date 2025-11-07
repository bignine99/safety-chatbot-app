// app/admin/page.tsx (최종 진단 코드)
'use client';

import { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { User, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

// ❗️ [핵심] lib/firebase/config.ts에서 직접 가져옵니다.
import { auth, db, storage } from '../../lib/firebase/config';

// ❗️ UI 부품들
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';
import { toast } from 'sonner';

export default function AdminPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<string>('KOSHA Guide');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // 1. 인증 상태 처리
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        signInAnonymously(auth).catch((error) => {
          console.error('익명 로그인 실패:', error);
          toast.error('인증 실패: ' + error.message);
        });
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const onDrop = (acceptedFiles: File[]) => {
    setFiles(acceptedFiles.filter((file) => file.type === 'application/pdf'));
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
  });

  const handleUpload = async () => {
    if (files.length === 0 || !category || !user) {
      toast.error('파일과 카테고리를 선택해야 합니다.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const file = files[0];
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
        console.error('Storage 업로드 실패:', error);
        toast.error(`업로드 실패: ${error.code}`);
        setIsUploading(false);
      },
      async () => {
        // 4. Firestore 쓰기
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          await addDoc(collection(db, 'papers'), {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            storagePath: storagePath,
            downloadURL: downloadURL,
            category: category,
            uploader: user.uid,
            createdAt: serverTimestamp(),
          });
          toast.success('파일 업로드 및 DB 저장 성공!');
          setFiles([]);
          
        } catch (error: any) {
          // ❗️❗️❗️ [핵심 수정] ❗️❗️❗️
          // 숨겨진 Firestore 오류를 강제로 띄웁니다.
          console.error('Firestore 쓰기 실패:', error);
          alert(`Firestore 쓰기 실패! 오류: ${error.message}`); // 👈 이 코드가 오류를 보여줄 것입니다.
          
        } finally {
          setIsUploading(false);
        }
      }
    );
  };

  // --- UI 렌더링 ---
  
  if (isAuthLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div>인증 확인 중...</div>
      </div>
    );
  }
  
  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm max-w-2xl w-full p-8 m-4">
        <h2 className="text-2xl font-semibold mb-4">파일 업로드</h2>
        <p className="text-muted-foreground mb-6">카테고리를 선택하고 PDF 문서를 업로드하여 챗봇을 학습시키세요.</p>

        <div className="mb-4">
          <label htmlFor="category" className="block text-sm font-medium mb-2">
            Knowledge Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full p-2 border rounded-md bg-background"
          >
            <option value="KOSHA Guide">KOSHA Guide</option>
            <option value="법규 및 지침">법규 및 지침</option>
            <option value="교육자료">교육자료</option>
            <option value="안전관리계획서">안전관리계획서</option>
            <option value="체크리스트">체크리스트</option>
            <option value="삽화 및 동영상">삽화 및 동영상</option>
            <option value="사건사고사례">사건사고사례</option>
            <option value="기타자료">기타자료</option>
          </select>
        </div>

        <div
          {...getRootProps()}
          className={`p-10 border-2 border-dashed rounded-md text-center cursor-pointer ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
          }`}
        >
          <input {...getInputProps()} />
          <p className="text-gray-500">Drag & drop a PDF file here, or click to select</p>
        </div>

        {files.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold">Selected File</h3>
            <div className="flex justify-between items-center p-3 my-2 border rounded-md">
              <span>{files[0].name}</span>
              <button onClick={() => setFiles([])} className="text-red-500 font-bold">X</button>
            </div>
            {isUploading && (
              <Progress value={uploadProgress} className="w-full" />
            )}
          </div>
        )}

        <Button
          onClick={handleUpload}
          disabled={files.length === 0 || isUploading || !user}
          className="w-full mt-6"
        >
          {isUploading ? `Uploading... ${uploadProgress.toFixed(0)}%` : '업로드 시작'}
        </Button>

        {!user && !isAuthLoading && (
          <p className="text-red-500 text-center mt-4">업로드를 위해 익명 인증이 필요합니다. 페이지를 새로고침하세요.</p>
        )}
      </div>
    </div>
  );
}