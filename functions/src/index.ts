// functions/src/index.ts (최종 v8 - 원본 아키텍처 복원 및 모든 버그 수정)

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

// [핵심] commonjs 방식을 위해 require 사용
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdf = require("pdf-parse");

// [핵심] 2개의 Vertex AI 라이브러리를 모두 사용합니다.
// 1. 임베딩(벡터화)용 (구형)
import {
  PredictionServiceClient,
  helpers,
  protos, // [v8 수정] protos 타입을 명시적으로 임포트
} from "@google-cloud/aiplatform";
// 2. Gemini 답변 생성용 (신형)
import {
  VertexAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google-cloud/vertexai";

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

// --- 3. Vertex AI SDK 초기화 (2개 모두) ---

// 3a. 임베딩용 클라이언트 (구형)
function initEmbeddingClient() {
  const clientOptions = {
    apiEndpoint: "us-central1-aiplatform.googleapis.com",
  };
  return new PredictionServiceClient(clientOptions);
}

// 3b. Gemini 답변용 클라이언트 (신형)
const vertexAI = new VertexAI({
  project: process.env.GCLOUD_PROJECT || "",
  location: "us-central1",
});
const generativeModel = vertexAI.getGenerativeModel({
  model: "gemini-1.5-flash-001",
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
  ],
});
// --- 초기화 종료 ---

// 4. Vertex AI Embedding 생성 함수 (구형 SDK 방식)
async function getEmbedding(text: string): Promise<number[]> {
  const client = initEmbeddingClient();
  const project = process.env.GCLOUD_PROJECT;
  const endpoint = `projects/${project}/locations/us-central1/publishers/google/models/text-embedding-004`;

  // [v8 수정] 타입을 명확히 지정
  const instances: protos.google.protobuf.IValue[] = [
    helpers.toValue({ content: text }) as protos.google.protobuf.IValue,
  ];
  const request: protos.google.cloud.aiplatform.v1.IPredictRequest = {
    endpoint,
    instances,
  };

  try {
    // [v8 수정] 배열 구조화 제거, 직접 response 받기
    const response = await client.predict(request);

    if (
      !response[0].predictions ||
      !response[0].predictions.length ||
      // [v8 수정] 타입 캐스팅 및 nullish 확인
      !(response[0].predictions[0] as protos.google.protobuf.IValue)
        .structValue?.fields?.embeddings
    ) {
      throw new Error("Invalid Vertex AI Embedding response structure (v8)");
    }

    const first = response[0].predictions[0] as protos.google.protobuf.IValue;
    const embeddingsValue = first.structValue!.fields!.embeddings!;

    const vector =
      embeddingsValue.structValue?.fields?.values?.listValue?.values?.map(
        (v) => v.numberValue ?? 0 // [v8 수정] || 0 -> ?? 0
      ) ?? [];

    return vector;
  } catch (error) {
    logger.error("Error getting embedding (v8):", error);
    throw new Error("Failed to get embedding from Vertex AI (v8).");
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
    // ... (이 함수 내용은 수정사항 없음) ...
    const { bucket, name: filePath } = event.data;
    if (!filePath || !filePath.endsWith(".pdf")) {
      logger.info(`Not a PDF file, skipping: ${filePath}`);
      return;
    }
    logger.info(`Processing file: ${filePath}`);
    try {
      const file = getStorage().bucket(bucket).file(filePath);
      const [fileBuffer] = await file.download();
      const data = await pdf(fileBuffer);
      const pdfText = data.text;
      if (!pdfText) {
        logger.warn("PDF text content is empty.");
        return;
      }
      logger.info(`PDF text extracted. Length: ${pdfText.length}`);
      const textChunks = chunkText(pdfText, 1000, 100);
      logger.info(`Text chunked into ${textChunks.length} pieces.`);
      const db = getFirestore(process.env.FIRESTORE_DATABASE_ID!);
      const batch = db.batch();
      let vectorCount = 0;
      for (const chunk of textChunks) {
        const embedding = await getEmbedding(chunk);
        vectorCount++;
        const docRef = db.collection("knowledgeChunks").doc();
        batch.set(docRef, {
          originalFilePath: filePath,
          text: chunk,
          embedding: embedding,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
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
    const resp = result.response;

    // [v8 수정] response.text() 대신 직접 파싱
    const candidates = resp.candidates ?? [];
    const answer = candidates
      .flatMap((c) => c.content?.parts ?? [])
      .map((p: any) => p?.text ?? "")
      .join("")
      .trim();

    return answer || "제공된 정보만으로는 답변할 수 없습니다.";
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
    // ... (이 함수 내용은 v7과 동일, HttpsError 및 .get() 수정됨) ...
    const question = request.data.question;
    if (typeof question !== "string" || question.trim().length === 0) {
      throw new HttpsError(
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

      const query = chunksCollection.findNearest(
        "embedding",
        queryVector,
        {
          limit: 5,
          distanceMeasure: "DOT_PRODUCT",
        }
      );
      const snapshot = await query.get();

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
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        "RAG 파이프라인 처리 중 오류가 발생했습니다."
      );
    }
  }
);