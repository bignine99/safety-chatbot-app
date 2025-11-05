// functions/src/index.ts (최종 수정본 v2 - 라이브러리 충돌 해결)

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

// PDF 파싱 라이브러리
// eslint-disable-next-line @typescript-eslint/no-var-requires
import pdf from "pdf-parse";

// [핵심 수정] 신형 @google-cloud/vertexai 라이브러리만 사용합니다.
import {
  VertexAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google-cloud/vertexai";
// [핵심 수정] 구형 @google-cloud/aiplatform 라이브러리 임포트 제거

// 1. Firebase Admin SDK 초기화
initializeApp();

// 2. 텍스트 분할 (Chunking) 헬퍼 함수
function chunkText(
  text: string,
  chunkSize = 1000,
  overlap = 100
): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    chunks.push(text.substring(i, end));
    i += chunkSize - overlap;
    if (end === text.length) break;
  }
  return chunks;
}

// --- 3. [수정] 신형 Vertex AI SDK 초기화 ---
const vertexAI = new VertexAI({
  project: process.env.GCLOUD_PROJECT || "",
  location: "us-central1",
});

// Gemini 답변용 모델
const generativeModel = vertexAI.getGenerativeModel({
  model: "gemini-1.5-flash-001",
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
  ],
});

// 임베딩(벡터화)용 모델
const embeddingModel = vertexAI.getGenerativeModel({
  model: "text-embedding-004",
});
// --- 초기화 종료 ---

// 4. Vertex AI Embedding 생성 함수 (신형 SDK로 수정)
async function getEmbedding(text: string): Promise<number[]> {
  try {
    const result = await embeddingModel.embedContent(text);
    const embedding = result.embedding;
    if (!embedding || !embedding.values) {
      throw new Error("Invalid Vertex AI Embedding response structure (v2)");
    }
    return embedding.values;
  } catch (error) {
    logger.error("Error getting embedding (v2):", error);
    throw new Error("Failed to get embedding from Vertex AI (v2).");
  }
}

// 5. Storage에 파일이 업로드되면 실행될 메인 함수 (벡터화)
export const generateEmbeddings = onObjectFinalized(
  {
    bucket: process.env.STORAGE_BUCKET || "",
    memory: "1GiB",
    timeoutSeconds: 300,
    minInstances: 1,
  },
  async (event) => {
    const { bucket, name: filePath } = event.data;
    if (!filePath || !filePath.endsWith(".pdf")) {
      logger.info(`Not a PDF file, skipping: ${filePath}`);
      return;
    }
    logger.info(`Processing file: ${filePath}`);

    try {
      // --- 1. Storage에서 PDF 파일 다운로드 ---
      const file = getStorage().bucket(bucket).file(filePath);
      const [fileBuffer] = await file.download();

      // --- 2. PDF 텍스트 추출 ---
      const data = await pdf(fileBuffer);
      const pdfText = data.text;
      if (!pdfText) {
        logger.warn("PDF text content is empty.");
        return;
      }
      logger.info(`PDF text extracted. Length: ${pdfText.length}`);

      // --- 3. 텍스트 분할 (Chunking) ---
      const textChunks = chunkText(pdfText, 1000, 100);
      logger.info(`Text chunked into ${textChunks.length} pieces.`);

      // --- 4. Firestore 일괄 쓰기(Batch) 준비 ---
      const db = getFirestore(process.env.FIRESTORE_DATABASE_ID!);
      const batch = db.batch();
      let vectorCount = 0;

      for (const chunk of textChunks) {
        // --- 5. 각 Chunk를 벡터로 변환 ---
        const embedding = await getEmbedding(chunk);
        vectorCount++;

        // --- 6. Batch에 쓰기 작업 추가 ---
        const docRef = db.collection("knowledgeChunks").doc();
        batch.set(docRef, {
          originalFilePath: filePath,
          text: chunk,
          embedding: embedding,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // --- 7. Firestore에 일괄 커밋 ---
      await batch.commit();
      logger.info(
        `Successfully created ${vectorCount} embeddings and saved to Firestore.`
      );
    } catch (error) {
      logger.error("Error in generateEmbeddings pipeline:", error);
    }
  }
);

// 6-1. Gemini 답변 생성 헬퍼 함수
async function getGenerativeAnswer(
  context: string,
  question: string
): Promise<string> {
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

// 6-2. 클라이언트가 호출할 메인 RAG 함수
export const askRAG = onCall(
  {
    memory: "1GiB",
    timeoutSeconds: 60,
    region: "us-central1",
    minInstances: 1,
  },
  async (request) => {
    const question = request.data.question;
    if (typeof question !== "string" || question.trim().length === 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "질문(question)이 필요합니다."
      );
    }

    logger.info(`Received question: ${question}`);

    try {
      const db = getFirestore(process.env.FIRESTORE_DATABASE_ID!);
      const queryVector = await getEmbedding(question);
      logger.info("Question vectorized.");

      const chunksCollection = db.collection("knowledgeChunks");
      const snapshot = await chunksCollection.findNearest(
        "embedding",
        queryVector,
        {
          limit: 5,
          distanceMeasure: "DOT_PRODUCT",
        }
      );

      if (snapshot.empty) {
        logger.warn("No relevant chunks found.");
        return { answer: "관련된 정보를 찾을 수 없습니다." };
      }

      const context = snapshot.docs
        .map((doc: any) => doc.data().text)
        .join("\n\n");
      logger.info(`Context retrieved: ${context.substring(0, 100)}...`);

      const finalAnswer = await getGenerativeAnswer(context, question);
      logger.info(`Answer generated: ${finalAnswer.substring(0, 50)}...`);

      return { answer: finalAnswer };
    } catch (error) {
      logger.error("Error in askRAG pipeline:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "RAG 파이프라인 처리 중 오류가 발생했습니다."
      );
    }
  }
);