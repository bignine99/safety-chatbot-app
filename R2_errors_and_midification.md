Rag 개발 과정의 오류 분석 및 재발 방지 교훈
우리가 겪었던 어려움은 단 하나의 오류가 아니라, **'인프라 초기 설정', '클라이언트-서버 통신', '모듈 호환성', '배포 시스템'**이라는 네 가지 영역에서 발생한 치명적인 실수들이 연쇄적으로 작용하여 서로를 가린 결과였습니다.

1. 인프라 초기 설정 및 접속 오류 (모든 문제의 시작점)
1-1. 잘못된 Storage 주소 사용 (무한 대기 오류)
발생 오류: net::ERR_FAILED, 400 (Bad Request) 또는 파일 업로드 중 무한 대기 상태가 지속되었습니다.
실수 원인: Firebase Console이 명확하게 storageBucket: "rag1-be5b0.firebasestorage.app"와(과) 같이 .firebasestorage.app 주소를 제공했음에도, 이를 무시하고 이전에 사용되던 *.appspot.com 주소를 추측하여 사용했습니다.
근본 교훈: 공식 설정 값은 추측하지 말고 반드시 교차 확인해야 합니다. 특히 firebaseConfig 객체에 명시된 storageBucket 주소가 콘솔 값과 단 한 글자도 틀리지 않는지 확인하는 것이 모든 초기 통신 문제 방지의 핵심입니다.

1-2. CORS 정책 설정 누락 (웹 보안 차단 오류)
발생 오류: Storage 주소를 수정한 후에도, 브라우저 콘솔에서 blocked by CORS policy 또는 400 (Bad Request) 오류가 발생했습니다.
실수 원인: 웹 브라우저(http://localhost:3000)는 보안을 위해 다른 도메인(Firebase Storage 서버)으로 리소스를 보낼 때, 서버가 허용했는지 확인하는 CORS(Cross-Origin Resource Sharing) 정책이 필요합니다. 이 정책을 gsutil CLI를 통해 버킷에 적용하는 절차를 누락했습니다.
근본 교훈: 로컬 개발을 시작하기 전, gsutil CLI를 사용하여 Storage 버킷에 cors.json 정책을 적용하는 절차를 SOP의 0단계에 명시해야 합니다.

===========================

2. 보안 및 권한 오류 (연쇄 추락의 원인)

2-1. Firestore 보안 규칙의 과도한 엄격성 (400 Bad Request)
발생 오류: 파일 업로드 성공 후, 프론트엔드(admin/page.tsx)가 Firestore에 '장부'(papers 컬렉션)를(을) 기록하려 할 때 400 (Bad Request) 오류가 발생했습니다.
실수 원인: firestore.rules에서 allow create 규칙이 uploader 필드 외에 uploadDate: serverTimestamp()와(과) 같이 코드가 자동으로 추가하는 필드를 허용하지 않았기 때문에, 규칙 위반으로 간주되어 요청이 거부되었습니다.
근본 교훈: 보안 규칙은 서버가 자동으로 추가하는 필드(예: serverTimestamp())를 포함한 모든 필드를 처리할 수 있도록 유연하게 작성해야 합니다. 클라이언트가 작성하는 필드뿐만 아니라, request.resource.data에 포함될 모든 필드를 고려해야 합니다.

2-2. IAM 서비스 계정 권한 부족 (5 NOT_FOUND)
발생 오류: 400 Bad Request 오류가 해결된 후에도, 백엔드 함수(generateEmbeddings)가 Firestore 접근 시 Error: 5 NOT_FOUND (권한 없음) 오류로 추락했습니다.
실수 원인: RAG 파이프라인의 코드를 실행하는 "진짜 일꾼"은 rag1-be5b0@appspot.gserviceaccount.com (App Engine default service account)입니다. 제가 이 계정이 아닌, 다른 관리 계정에만 권한을 주거나, 권한이 이미 있다고 잘못 판단했습니다.
근본 교훈: 0단계에서 rag1-be5b0@appspot.gserviceaccount.com 계정에 Vertex AI 사용자와 Cloud Datastore 사용자 역할을 반드시 부여해야 합니다. 이 계정이 백엔드 로직을 실행하는 주체입니다.

========================

3. 모듈 호환성 및 배포 환경 충돌 오류 (최종 난관)

3-1. pdf-parse 모듈 충돌 (pdf is not a function)
발생 오류: PDF 파일을 읽는 generateEmbeddings 함수가 TypeError: pdf is not a function 오류로 추락했습니다.
실수 원인: pdf-parse 같은 구형 라이브러리와 Next.js/TypeScript의 최신 모듈 시스템(NodeNext)이 충돌했기 때문입니다. import pdf from 'pdf-parse' (이)라는 코드가 서버 런타임에서 함수가 아닌 객체를 반환한 것입니다.
근본 교훈: 호환성 문제가 발생하는 구형 라이브러리는 tsconfig.json을(를) commonjs 방식으로 설정하고, npm install pdf-parse@1.1.1과 같이 검증된 구형 버전을 강제 설치하여 호환성을 확보해야 합니다.

3-2. 배포 시스템의 캐시 무효화 실패
발생 오류: 코드를 수정하고 firebase deploy를(을) 실행해도 오류가 해결되지 않고 이전 오류가 반복되었습니다.
실수 원인: firebase deploy가(이) 로컬 변경 사항을 놓치고 i firestore: skipping upload...처럼 배포를 건너뛰거나, npm run build 실패로 lib/index.js (완성품)이(가) 갱신되지 않았기 때문입니다.
근본 교훈: "캐시"는 개발자의 적입니다. 해결되지 않는 오류 발생 시에는 **rmdir /s /q node_modules**로 로컬 환경을 초기화하고, **firebase deploy --only firestore,functions --force**와(과) 같이 --force 옵션을(를) 사용하여 강제로 덮어쓰기를 진행해야 합니다.

=============================

4. [신규] 클라이언트/서버 간 DB 불일치 오류 (55번의 5 NOT_FOUND)
발생 오류 (클라이언트): POST ... /databases/(default) ... 400 (Bad Request)

발생 오류 (서버): Error in RAG pipeline: Error: 5 NOT_FOUND: ... at WriteBatch.commit

실수 원인:

Firebase 콘솔 이미지(image_40cbe8.png)는 우리가 **rag1**이라는 ID의 데이터베이스를 생성했음을 명확히 보여줍니다. (default) 데이터베이스는 존재하지 않았습니다.

firebase.json의 "database": "rag1" 설정은 CLI가 규칙/색인을 배포할 대상을 지정할 뿐, 애플리케이션 코드가 연결할 DB를 지정하지 않습니다.

클라이언트 코드(lib/firebase/config.ts)의 getFirestore(app)와 서버 코드(functions/src/index.ts)의 getFirestore()는 모두 존재하지 않는 (default) 데이터베이스를 호출했습니다.

근본 교훈: Firestore에서 (default)가 아닌 이름(rag1)으로 데이터베이스를 생성한 경우, 모든 코드(Client/Server)에서 DB ID를 명시적으로 지정해야 합니다.

클라이언트: export const db = getFirestore(app, "rag1");

서버 (admin): const db = getFirestore("rag1");

================================

5. [신규] Next.js SSR 및 브라우저 API 충돌 오류
발생 오류: ReferenceError: window is not defined

실수 원인:

getAnalytics(app) (Firebase Analytics)는 브라우저(window 객체)가 있어야만 실행되는 브라우저 전용 API입니다.

Next.js App Router는 기본적으로 페이지를 서버에서 먼저 렌더링(SSR)하려고 시도합니다.

서버 환경(Node.js)에는 window 객체가 없으므로, getAnalytics가 포함된 파일(lib/firebase/config.ts 또는 app/admin/page.tsx)이 서버에서 평가되는 순간 앱이 충돌했습니다.

근본 교훈: Next.js(App Router) 환경에서는 서버에서 실행될 수 있는 코드와 클라이언트에서만 실행되어야 하는 코드를 엄격히 분리해야 합니다. getAnalytics처럼 브라우저 전용 API는 if (typeof window !== 'undefined') { ... } 블록으로 감싸거나, useEffect 내부(클라이언트 마운트 시)에서만 호출하거나, (이번 경우처럼) 기능에 불필요하다면 아예 제거하여 SSR 충돌을 원천적으로 방지해야 합니다.

================================

6. [신규] "유령 캐시" 및 개발 환경 오염 오류 (최종 디버깅)
발생 오류: window is not defined 오류가 config.ts 파일을 수정해도 계속 발생했습니다.

실수 원인 (1): 오류 로그는 app\admin\page.tsx:26:31을 정확히 가리켰습니다. config.ts를 수정한 후에도, page.tsx 파일 상단에 getAnalytics를 호출하는 중복된 '유령' 코드가 남아있었습니다. config.ts만 수정하고 실제 오류 발생 지점인 page.tsx를 확인하지 않았습니다.

실수 원인 (2): functions/src/index.ts를 수정(getFirestore("rag1"))하고 배포해도 서버 로그에 5 NOT_FOUND가 계속 발생. 배포 로그에 functions[...] Skipped (No changes detected)가 찍힌 것을 간과했습니다. CLI는 *.ts가 아닌 컴파일된 lib/index.js의 변경만 감지합니다.

실수 원인 (3): rmdir .next로 캐시를 삭제해도 '유령' 코드가 계속 실행. npm run dev 실행 시 Detected additional lockfiles 경고가 발생했으나 무시했습니다. 프로젝트 폴더 상위의 C:\Users\cho에 package-lock.json이 존재하여 Next.js가 프로젝트 루트(root)를 혼동했습니다.

근본 교훈:

오류 로그의 파일 경로와 줄 번호를 신뢰해야 합니다.

Cloud Functions (TypeScript) 수정 시, cd functions -> npm run build로 수동 컴파일을 해야 배포가 됨을 인지해야 합니다.

npm run dev 실행 시 나오는 경고(Warning)를 절대 무시하지 말아야 합니다. lockfile 경고는 환경 전체가 꼬였다는 가장 강력한 신호입니다.

7. [신규] "유령 캐시" 오진과 코드 구문 오류 (60~70회 수정의 늪)
우리가 60~70회의 수정을 반복하며 "뱅글 뱅글 도는" 지옥을 경험한 것은, "유령 캐시"나 "모듈 충돌" 때문이 아니었습니다.

**발생 오류:** `embedContent`, `text()`, `[Symbol.iterator]` 오류가 `npm install`, 캐시 삭제, `Reload Window`, `Restart TS server`, `tsconfig.json` 수정, `package.json` 버전 수정 등 **모든 환경 초기화 조치에도 불구하고** 계속 재발했습니다.

**잘못된 진단 (총체적 오진):**
AI(나)는 이 현상을 "유령 캐시" 또는 "모듈 충돌"로 **완전히 오진**했습니다. 이 잘못된 진단 하에, `ESM`으로 전환(Turn 54), `typescript` 버전 다운그레이드(Turn 58) 및 업그레이드(Turn 60), 라이브러리 병합(Turn 56) 및 분리(Turn 63) 등 **환경 설정만**을 60~70회에 걸쳐 수정하도록 제안하며 "뱅글 뱅글 도는" 혼란을 가중시켰습니다.

**진짜 근본 원인 (3가지 명백한 코드 구문 오류):**
"유령"은 없었습니다. 문제는 **AI(나)가 제공한 `index.ts` (v1~v7) 코드 자체의 명백한 버그**였습니다.

1.  **`client.predict` 구문 오류:** `const [response] = await client.predict(request)`는 잘못된 구문이었습니다. `predict`는 배열을 반환하지 않으므로 `const response = await client.predict(request)`로 받고 `response[0]`로 접근해야 했습니다. 이 잘못된 구조화 할당이 `[Symbol.iterator]` 오류를 유발했습니다.
2.  **`response.text()` API 오용:** `vertexai` 라이브러리는 `response.text()`라는 헬퍼를 보장하지 않습니다. `response.candidates[0].content.parts[0].text`로 직접 객체 구조를 파싱하는 것이 올바른 방법이었습니다.
3.  **`findNearest` 쿼리 누락:** `chunksCollection.findNearest(...)`는 쿼리 객체를 반환할 뿐, `.get()`을 호출해야 실행된다는 것을 (v3~v7 코드에서) 간과했습니다.

**근본 교훈 (가장 뼈아픈 교훈):**

* **환경을 의심하기 전에 코드를 의심하라.** 60~70회의 수정은 환경 문제가 아니라, 명백한 **구문 오류(Syntax Error)**와 **API 오용(API Misuse)**을 "캐시" 탓으로 돌린 **총체적인 오진** 때문이었습니다.
* **오류 메시지는 정직하다.** `embedContent`나 `text` 속성이 없다는 메시지는 캐시가 아니라 **정말로 그 타입에 해당 속성이 없다**는 뜻이었습니다 (AI가 `aiplatform`과 `vertexai`를 혼용하거나 잘못된 타입 추론을 유도했기 때문에).
* **해결책은 `v8` 코드에 있다.** 원본 KB의 아키텍처(`aiplatform` + `vertexai` 분리, `commonjs` 사용)를 존중하고, 그 위에 명백한 구문 오류 3가지를 수정한 **`v8` 코드**가 최종 해결책이었습니다.


===============================================

2025-11-06: genkit 명령어 실행 오류 및 프로젝트 구조 진단
Next.js 통합 템플릿(paper-rag-app)을 클론한 후, AI 서버(Genkit)를 실행하는 과정에서 심각한 혼란과 일련의 명령어 오류가 발생했다. 이 기록은 해당 오류의 원인을 진단하고 올바른 프로젝트 실행 방식을 찾는 과정을 상세히 기술한다.

1. 초기 증상: genkit 명령어 실행 불가
프로젝트 클론(git clone) 및 패키지 설치(npm install) 후, AI 개발자 UI를 실행하기 위해 genkit start 관련 명령어를 시도했으나 모두 실패했다.

시도 1: genkit start

오류: 'genkit'은(는) 내부 또는 외부 명령, 실행할 수 있는 프로그램, 또는 배치 파일이 아닙니다.

분석: genkit CLI가 시스템 전역(Path)에 설치되어 있지 않음.

시도 2: npx genkit start

오류: npm error could not determine executable to run

분석: npx가 프로젝트 내부(node_modules)에서도 genkit 실행 파일을 찾지 못함.

시도 3: npm run g:start

오류: npm error Missing script: "g:start"

분석: package.json에 g:start라는 스크립트가 정의되어 있지 않음 (잘못된 추측).

2. 1차 진단: genkit CLI 패키지 누락
npx가 실행 파일을 찾지 못하는 문제를 해결하기 위해, node_modules 내부를 직접 확인했다.

조사: dir .\node_modules\.bin\

결과: genkit 또는 genkit.cmd 실행 파일이 목록에 존재하지 않음을 확인.

조치: genkit CLI가 dependencies가 아닌 devDependencies에 필요하다고 판단, 수동으로 설치를 시도했다.

Bash

npm install genkit
결과: 설치는 성공했으나, 이후 npx genkit start 및 .\node_modules\.bin\genkit start 명령어가 여전히 동일한 오류를 발생시켰다. dir 목록에서도 genkit.cmd는 발견되지 않았다.

3. 2차 진단: Next.js 실행 방식과의 충돌
genkit 명령어에 대한 집착을 버리고, package.json의 표준 스크립트를 테스트했다.

시도 1: npm start

결과: next start가 실행되었으나, Error: Could not find a production build in the '.next' directory. 오류 발생.

분석: npm start는 "프로덕션(배포) 서버"를 실행하는 명령어이며, npm run build가 선행되어야 한다. 우리가 원하는 "개발 모드"가 아님.

시도 2: npm run dev

결과: 성공. Next.js 개발 서버가 http://localhost:3000에서 정상적으로 시작됨.

4. 최종 원인 분석 및 해결: "통합 Next.js" 아키텍처
npm run dev가 성공했음에도 불구하고, http://localhost:4000 (Genkit UI 기본 주소) 접속이 실패(ERR_CONNECTION_REFUSED)했다. 이로 인해 이 템플릿의 아키텍처를 근본적으로 파악할 수 있었다.

잘못된 가정: 이 프로젝트는 genkit start(AI 서버)와 npm run dev(웹 서버)를 별도로 실행하는 2-서버 구조일 것이라고 잘못 가정했다.

진짜 구조: 이 템플릿은 genkit CLI를 전혀 사용하지 않는다. 대신, Genkit(AI SDK)이 Next.js 앱 내부에 라이브러리로 포함되어 npm run dev 명령어 하나로 웹 서버와 AI 백엔드 로직이 동시에 실행되는 "통합 서버" 아키텍처이다.

결론:

genkit.cmd 파일이 없었던 것은 오류가 아니라 의도된 설계였다.

localhost:4000 접속 실패는 당연한 결과였다. AI 서버는 3000번 포트에서 Next.js와 함께 실행 중이다.

localhost:3000/genkit 또는 /api/genkit의 404 오류는, 이 템플릿이 Genkit의 개발자 UI를 포함하지 않고, 순수 API 백엔드로만 작동한다는 것을 의미한다.

5. 교훈 및 표준 절차 확립
교훈: 이 템플릿(paper-rag-app)은 별도의 genkit start 명령어가 필요 없다. 모든 것은 npm run dev 하나로 시작된다.

표준 절차:

git clone ...

npm install

(필요시) npm install genkit (라이브러리로서의 genkit 설치)

.env.local 및 service-account-key.json 설정

npm run dev 실행

http://localhost:3000에 접속하여 src/app/page.tsx 파일 수정을 통해 프론트엔드 개발을 시작한다. AI 백엔드는 이미 백그라운드에서 실행 대기 중이다.


======251107==================================

알겠습니다. 오늘 우리가 겪은 16번이 넘는 끔찍한 실패의 여정은, 향후 프로젝트 진행 시 가장 완벽한 가이드가 될 것입니다.

이 내용은 errors_and_modifications.md 파일에 "오늘의 교훈"으로 반드시 추가해야 할, 매우 가치 있는 자산입니다.

다음은 errors_and_modifications.md 파일에 업데이트할 내용입니다.

2025-11-07: 프로젝트 실행 및 인증/배포 실패 대서사시
git clone으로 템플릿을 복제한 후, npm run dev를 실행하고 업로드 기능을 활성화하기까지 16번이 넘는 실패를 겪었다. 이 기록은 모든 실패의 원인과 해결 과정을 상세히 기술하여, 다시는 동일한 실수를 반복하지 않도록 한다.

1. 프로젝트 실행 오류: genkit start vs npm run dev
초기 목표는 Next.js 웹 서버와 Genkit AI 서버를 개별적으로 실행하는 것이었으나, 이는 템플릿의 아키텍처를 완전히 오해한 것이었다.

시도 1: genkit start

오류: 'genkit'은(는) 내부 또는 외부 명령...

원인: genkit CLI가 전역 또는 로컬 node_modules/.bin에 설치되어 있지 않았다. npm install genkit로 수동 설치해도 문제는 동일했다.

시도 2: npm start

오류: Error: Could not find a production build...

원인: npm start는 next start를 실행하며, 이는 **프로덕션(배포)**용 명령어다.

시도 3: npm run dev

성공: http://localhost:3000에서 Next.js 기본 페이지가 로드되었다.

시도 4: Genkit UI 접속 (실패)

http://localhost:4000, http://localhost:3000/genkit, http://localhost:3000/api/genkit 모두 404 또는 ERR_CONNECTION_REFUSED를 반환했다.

최종 교훈 (아키텍처 확정):

이 템플릿은 genkit start를 사용하는 별도의 AI 서버가 없다.

npm run dev 명령어 하나가 Next.js 웹 서버와 **Genkit AI 백엔드 로직(API)**을 동시에 실행하는 "통합 서버" 방식이다.

AI 플로우를 테스트하는 별도의 Genkit UI는 존재하지 않으며, 모든 기능은 http://localhost:3000의 웹 UI를 통해서만 테스트해야 한다.

2. 인증 오류: auth/invalid-api-key (10번 이상의 실패)
http://localhost:3000/admin 페이지 접속 시, Firebase: Error (auth/invalid-api-key) 오류가 10번 이상 반복되었다.

실패 1 (원인 진단): .env.local의 apiKey와 Firebase Console의 apiKey가 다른 것으로 추측했다.

검증: 두 키(...Py0)는 동일했다.

실패 2 (원인 진단): Google Cloud Console에서 ...Py0 키가 "키 제한"으로 설정된 것을 발견했다.

조치: "키 제한 안함"으로 변경하고 저장했다.

실패 3 (캐시 문제): 여전히 invalid-api-key 오류가 발생했다.

조치: rmdir /s /q .next 명령어로 Next.js의 캐시를 삭제하고 서버를 재시작했으나 실패했다.

실패 4 (근본 원인): Next.js가 어떤 이유로든 .env.local 파일 자체를 올바르게 읽지 못하고 있었다. getAuth(app)가 apiKey: undefined로 실행되고 있었다.

최종 교훈 (하드코딩):

.env.local을 신뢰할 수 없을 때, lib/firebase/config.ts 파일에 firebaseConfig 객체를 직접 하드코딩하는 것이 가장 확실한 해결책이다.

process.env.NEXT_PUBLIC_...을 사용하는 모든 코드를 제거하고, 실제 문자열 값으로 대체하여 .env 파일 의존성을 완전히 제거했다.

3. 배포 오류: 잘못된 프로젝트에 배포 (rag1 vs safety-chatbot-project)
인증 문제가 해결된 후, firebase deploy --only storage,firestore를 실행했을 때 rag1-be5b0라는 엉뚱한 프로젝트에 배포가 시도되었다.

원인: 로컬 CLI가 paper-rag-app 템플릿의 예전 프로젝트(.firebaserc 파일)를 기억하고 있었다.

해결: firebase use safety-chatbot-project 명령어를 실행하여 로컬 CLI의 활성 프로젝트를 올바른 프로젝트로 즉시 전환했다.

최종 교훈:

템플릿을 복제(clone)한 후, 가장 먼저 firebase use [내_프로젝트_ID]를 실행하여 배포 대상을 명확히 지정해야 한다.

4. 업로드 실패: "Uploading... 100%" (16번의 실패)
인증, Storage 업로드는 성공했으나, Uploading... 100%에서 멈추며 Firestore 쓰기가 실패했다. 이 문제는 세 가지 설정이 모두 틀어진 "3-Way Failure"였다.

증상: papers 컬렉션이 생성되지 않았다. alert 창으로 Missing or insufficient permissions 오류를 확인했다.

실패 A (Code): lib/firebase/config.ts

문제: export const db = getFirestore(app); 코드가 (default) 데이터베이스를 가리켰으나, 우리 프로젝트에는 (default) DB가 없고 rag1과 safety-db251106만 존재했다.

해결: export const db = getFirestore(app, "safety-db251106");로 수정하여, "실존하는" 데이터베이스를 명시적으로 가리키도록 변경했다.

실패 B (Config): firebase.json

문제: 배포 설정 파일이 firestore.rules를 (default) 또는 rag1이라는 "엉뚱한" 데이터베이스에 적용하려 했다.

해결: "database": "(default)"를 "database": "safety-db251106"로 수정하여, "실존하는" 데이터베이스에 규칙이 배포되도록 변경했다.

실패 C (Rules): firestore.rules

문제: allow create: if false; 또는 AI가 생성한 복잡한 match /users/... 규칙으로 인해 papers 컬렉션 쓰기가 차단되었다.

해결: match /papers/{documentId} { allow create: if request.auth != null; } 라는 단순하고 올바른 규칙으로 덮어쓰고 배포했다.

최종 교훈 (RAG 프로젝트의 핵심):

config.ts (클라이언트 코드)가 가리키는 DB ID.

firebase.json (배포 설정)이 가리키는 DB ID.

firestore.rules (보안 규칙)가 허용하는 컬렉션 경로.

이 세 가지가 100% 일치하지 않으면, 인증과 스토리지가 성공해도 Firestore 쓰기는 반드시 실패한다.

5. 기타 오류: admin 폴더 및 패키지 누락
오류: src/app/admin 폴더가 존재하지 않았다.

해결: app/admin/page.tsx 경로에 "클린 버전"의 업로드 코드를 새로 생성했다.

오류: Module not found: Can't resolve 'react-dropzone'

원인: admin/page.tsx가 의존하는 패키지가 누락되었다.

해결: npm install react-dropzone을 실행하여 설치했다.

오류: shadcn-ui 패키지 이름이 변경됨.

해결: npx shadcn-ui@latest add... 대신 npx shadcn@latest add...를 사용했다.




















