// functions/src/index.ts

// 1. 초기화 및 라이브러리 임포트
import * as logger from "firebase-functions/logger";
import {onObjectFinalized} from "firebase-functions/v2/storage";
import {initializeApp} from "firebase-admin/app";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";

// 2. Vertex AI(Embedding) 가져오기
import {PredictionServiceClient} from "@google-cloud/aiplatform";

// [최종 수정] pdf-parse@1.1.1 버전과 100% 호환되는 "require" 방식 사용
// (이 코드가 'pdf is not a function' 오류를 해결합니다.)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdf = require("pdf-parse");

// 3. Firebase Admin SDK 초기화
initializeApp();

/** PDF 텍스트를 의미 있는 단위(Chunk)로 분할하는 함수 */
function chunkText(text: string, chunkSize = 2000): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.substring(i, i + chunkSize));
    i += chunkSize;
  }
  return chunks;
}

// Vertex AI Embedding 생성 함수 (0단계 IAM 권한과 연결됨)
function initVertexAI() {
  const location = "us-central1";
  const clientOptions = { apiEndpoint: `${location}-aiplatform.googleapis.com` };
  return new PredictionServiceClient(clientOptions);
}
async function getEmbedding(text: string) {
  const client = initVertexAI();
  const project = "rag1-be5b0";
  const location = "us-central1";
  const endpoint = `projects/${project}/locations/${location}/publishers/google/models/text-embedding-004`;
  const instances = [{content: text}];
  const request = {
    endpoint: endpoint,
    instances: instances.map((instance) => ({
        structValue: { fields: { content: { stringValue: instance.content } } }
    })),
  };
  try {
    const [response] = await client.predict(request);
    const values = response.predictions?.[0]?.structValue?.fields?.embeddings?.structValue?.fields?.values?.listValue?.values;
    if (values) {
      return values.map((v: any) => v.numberValue || 0);
    }
    throw new Error("Invalid embedding response structure");
  } catch (error) {
    logger.error("Error getting embedding:", error);
    // 이 오류는 0-2단계 IAM 권한 부족 시 발생합니다.
    throw error;
  }
}

// 5. [핵심] Storage에 파일이 업로드되면 실행될 메인 함수
export const generateEmbeddings = onObjectFinalized(
  {
    bucket: "rag1-be5b0.firebasestorage.app", // 0단계에서 확인한 버킷 주소
    memory: "1GiB",
    timeoutSeconds: 300,
  },
  async (event) => {
    logger.info("RAG Pipeline Started:", event.data.name);

    const filePath = event.data.name; // 예: papers/yAH3uRmcpJZ9UubmJ7jWwROIPfj1/파일명.pdf
    if (!filePath || !filePath.startsWith("papers/") || !event.data.bucket) {
      logger.info("Not a knowledge file, skipping.");
      return null;
    }

    const fileBucket = getStorage().bucket(event.data.bucket);
    const file = fileBucket.file(filePath);
    const fileBuffer = (await file.download())[0];

    try {
      // --- 2. PDF 파싱 (v1.1.1 버전은 Buffer를 직접 함수에 전달하면 됨)
      const pdfData = await pdf(fileBuffer);
      const pdfText = pdfData.text;
      logger.info(`PDF Parsed: ${pdfText.length} characters.`);

      // --- 3. 텍스트 분할 (Text -> Chunks)
      const textChunks = chunkText(pdfText);
      logger.info(`Text Chunked: ${textChunks.length} chunks.`);

      // --- 4. Firestore 일괄 쓰기(Batch) 준비 ---
      // [!!! 핵심 수정 !!!] (default)가 아닌 "rag1" 데이터베이스를 명시적으로 지정합니다.
      const db = getFirestore("rag1");
      const batch = db.batch();

      // --- 5. 각 조각(Chunk)을 벡터화하고 Batch에 추가 ---
      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];

        const embedding = await getEmbedding(chunk);

        const docRef = db.collection("knowledgeChunks").doc();
        batch.set(docRef, {
          originalFilePath: filePath,
          chunkNumber: i,
          text: chunk,
          embedding: embedding, // 벡터 필드
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // --- 6. Batch 쓰기 실행 (DB에 저장) ---
      await batch.commit();
      logger.info("Successfully created embeddings and saved to Firestore.");

      return null;

    } catch (error) {
      logger.error("Error in RAG pipeline:", error);
      return null;
    }
  }
);