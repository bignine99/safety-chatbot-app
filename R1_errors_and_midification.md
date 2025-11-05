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

























