# 진행 현황 — 육십육 (SIXTYSIX)

> 무엇을 했고, 무엇을 하는 중이고, 무엇이 남았는가를 한 문서에 모은다.
> 최종 갱신: 2026-10-07 · 카카오 로그인 및 Preview 실계정 업무 흐름 검수 (32~33장)
>
> 결정의 근거는 [`v2/V2-SCOPE.md`](v2/V2-SCOPE.md), 작업 방법과 함정은 [`HANDOFF.md`](HANDOFF.md) 에 있다.
> 이 문서는 **상태**만 다룬다. 충돌하면 V2-SCOPE 를 따른다.

---

## 0. 현재 상태 (2026-10-07)

| 항목 | 상태 |
|---|---|
| 서비스 | 같은 날 시작한 최대 30명 코호트와 66일 습관을 인증하는 모바일 웹 |
| V1 | 완료·동결. 비교 기준 |
| V2 데모 | localStorage·시뮬레이터 기반 6화면 |
| V2 실제 계정 | 로그인·계정·모집·본인 활동·알림·운영자 화면과 API 구현 |
| DB | migration 001~009, 앱·소유자·worker 권한 분리 |
| Preview | 카카오 실계정 로그인·운영 모집·참여·인증·면제권·앱 알림 검수 완료. 날짜 전환은 검수 코호트만 조정 (33장) |
| worker | 수동 시작/알림 처리·재실행 중복 방지 확인. schedule 성공은 있으나 수 시간 간격 관측, 정시성 미확보 (33장) |
| 다음 | 예약 실행 지연 원인 점검·운영용 스케줄러 결정, 별도 Production DB·인증 구성. 이메일은 도메인 미보유로 보류 |

### 이번 로컬 점검

- V2 Vitest **27개 파일·268개 통과**, 프런트·서버 타입 검사와 프로덕션 빌드 통과.
- OpenAPI **47개 경로·21개 계약 사례 통과**.
- 새 통합 명령 `npm --prefix qa run test:v2`로 모바일 **69개 상태/흐름 통과**(활동 42·알림 12·운영자 15). 360/390/430px, 페이지 오류 없음. 테스트 API 응답 기반이며 실제 공급자·DB E2E와 구분한다.
- 수정한 문서 7개의 로컬 파일 링크와 `git diff --check` 통과.
- 실제 DB/HTTP 140개와 Preview HTTP 22개는 이전 검증 기록이다. 이번 문서 정리에서 원격 DB·배포·공급자·worker 상태를 재조회하지 않았다.
- V1 Playwright 210개는 이전 등록 목록 기준이다. 이번에는 V1 회귀를 재실행하지 않았다.
- README는 구조·실행 방법, HANDOFF는 작업 원칙, 이 문서는 진행 상태를 담당하도록 정리했다. 기능 문서의 이전 단계 수치는 해당 시점의 기록으로 읽는다.

### 미커밋 변경 검토 순서

정리 시작 시 추적 파일 수정 17개·미추적 파일 102개였다. HEAD는 `d9a89fd`이며 앱 Preview는 미커밋 소스로 배포된 기록이 있다. 아래는 검토 분류이며 독립적으로 빌드 가능한 커밋 경계는 아니다. 이후 사용자 요청으로 전체 변경의 커밋·push·Preview 배포를 진행한다 (29장).

| 분류 | 주요 경로 | 검토 기준 |
|---|---|---|
| 서버·계약 | `sixtysix-v2/server/`, `api/`, `tsconfig.server.json`, `backend/openapi.json`, `backend/auth-spike/`, `backend/scripts/`의 미추적 검증 도구 | 의존성·타입·OpenAPI·DB 통합 검증. worker의 기존 커밋 포함 범위와 구분 |
| 계정·업무 UI | `src/auth/`, `cohorts/`, `records/`, `notifications/`, `admin/`, 새 화면·흐름 테스트, App·기존 화면·스타일 변경 | 데모 분리·권한/만료·재시도 및 모바일 검수 |
| 빌드·배포 | V2 package/lock, Vite·Vitest·Vercel 설정, `.vercelignore`, `.env.example`, `.gitignore` | 환경변수 예시·비밀 파일 제외·API/SPA 산출물 |
| QA | `qa/scripts/`, `qa/package.json`, `qa/README.md` | 실제 API를 호출하지 않는 모바일 검수 명령 |
| 문서·디자인 | 루트 문서, 각 README, `v2/`의 기능 문서·디자인 계획·fixture | 확정 범위와 제안 구분, 상태 중복 제거 |
| 개발 도구 | `sixtysix-v2/.agents/`, `skills-lock.json` | 앱 실행 의존성이 아닌 개발 보조 자산. 저장소 포함 여부 별도 검토 |

통합된 앱은 공유 서비스와 설정에 의존하므로 검토 분류대로 파일을 일부만 커밋하면 누락이 생길 수 있다. 소스 기준을 확정할 때 전체 의존 관계를 함께 확인한다. 실제 비밀 파일·빌드 산출물은 제외한다.

### 남은 작업

1. worker 예약 실행의 수 시간 지연을 점검하고, 운영에 필요한 실행 주기와 스케줄러를 확정한다. 수동 검수 성공을 정시 실행 보장으로 해석하지 않는다.
2. 별도 Production DB·권한·인증 키·콜백을 구성한 뒤 공개 전 동일 흐름을 확인한다. Preview DB를 Production에 재사용하지 않는다.
3. 카카오 강제 재인증의 비밀번호 입력 이후 완료 및 동의 취소 경로는 별도 실검수가 남았다. 일반 로그인·로그아웃·세션 복원은 완료했다.
4. 개발 도구 Vite/Vitest와 관련 의존성 audit 7건의 버전 호환성을 검토한다. 실행 의존성은 0건이다 (30장).
5. 이메일 발송 도메인과 사진 업로드·타인 피드·남은 화면은 범위에 따라 후속 진행한다.

### 과거 기록 읽는 법

아래 2026-10-05 재개 점검과 1~8장은 데모 단계의 상태를 포함한다. 10~28장은 이후 확장 순서대로 쌓은 이력이며, 각 장의 ‘다음’은 작성 당시 기준이다. 공급자 설정과 비밀값 보존 절차는 28장을 따른다.

### 2026-10-05 작업 재개 점검

> 아래는 재개 당시 기록이다. 후속 검증과 권한 분리 결과는 19~25장을 우선한다.


- `npm test`: 22개 파일, 220개 통과. `npm run build`: 프런트·서버 타입 검사 및 프로덕션 빌드 통과.
- 서버 구현은 `sixtysix-v2/server/`, API 진입점은 `sixtysix-v2/api/`, DB migration·OpenAPI·통합 검증 도구는 `backend/`에 있다.
- 로그인/계정(`/login`, `/account`), 공개 모집(`/recruitment`), 본인 활동(`/activity/:membershipId`)은 기존 localStorage 데모와 분리된다.
- 마지막 작업은 [실제 인증·면제권 연결](v2/CHECKIN-RECORD-IMPLEMENTATION.md). 해당 문서는 아직 구현 중 상태다. 이번에는 DB/HTTP 통합, 공급자 로그인, 모바일 브라우저, 원격 배포를 재검증하지 않았다.
- 인증·모집·활동 관련 코드와 문서가 다수 미커밋/미추적 상태로 남아 있다. 작업 재개 시 이 파일들을 보존한다.
- Preview DB 연결과 공급자/배포 미완료 상태는 아래 단계별 기록 기준이다. 이번 점검은 원격 환경을 조회하지 않았다.
- 아래 단계도와 1~8장의 화면 수·테스트 수는 데모 단계 기록이다. 현재 요약은 이 절, 서버 확장 이력은 10~18장을 우선한다.

```
01 V1 진단 ✅ → 02 V2 범위 ✅ → Gate 1·2·3 ✅ → 03 Figma 이전 ✅ → 04 와이어프레임 ✅
→ 05 디자인 고도화 ✅(홈·코호트) → 08 React ◐ 6/11 → 06 디자인 최종 점검 ☐ → 07 문서 갱신 ☐ → 09 QA·배포 ☐
```

---

## 1. 프로젝트 개요

### 1.1 무엇을 푸는가

습관 챌린지 단톡방에 들어갔다가 조용히 나온 경험에서 출발했다.

| 문제 | 육십육의 답 |
|---|---|
| 인증이 채팅에 묻혀 내가 어디까지 왔는지 안 보인다 | 홈과 기록에 항상 떠 있는 **66칸 진행판** |
| 며칠 빠지면 복귀할 명분이 없어 이탈한다 | 내보내지 않는 **휴면 상태**와 인증 한 번이면 되는 복귀 |
| 랭킹·공지가 수작업이라 유실된다 | 자동 산정 랭킹과 공지 |
| 66일이 끝나도 남는 게 없다 | 완주 배지와 졸업 화면, 다음 코호트 |

개인 트래커도, 채팅방도, 랭킹 경쟁 앱도 아니다. **같은 날 시작한 코호트의 소속감으로 완주율을 만드는 커뮤니티**다.

### 1.2 V2 의 중심 (결정 1)

**가설 1 — 코호트 소속감이 완주율을 올린다 — 을 검증 가능한 프로토타입으로 만드는 것.**
V1 은 코호트가 「18명 + 내가 했나」 하드코딩이라 살아 있지 않았다. V2 는 결정론적 시뮬레이터로 29명이 실제로 움직이고, 시계가 흐르면 코호트 현황·랭킹·휴면이 전부 따라 바뀐다.

> 시뮬레이션 결과이지 가설을 검증한 데이터가 아니다. 포트폴리오에는 **「검증 가능한 프로토타입으로 전환했다」** 로 쓴다.

### 1.3 링크

| | |
|---|---|
| 라이브 (V1.1) | https://sixtysix-taupe.vercel.app |
| 라이브 (V2 미리보기) | https://sixtysix-v2.vercel.app — 6/11 화면 |
| GitHub | https://github.com/jaejinu/sixtysix |
| Figma (작업 파일) | `wwn6VrLIgZENhkjshPGjy6` — `00_TOKENS` · `01_V1_CURRENT` · `02_BRAND` · `03_V2_WIREFRAME` |
| Figma (옛 파일) | `wXlbUU8EH8os9fgDA9omoB` — **손대지 않는다** |
| Vercel | `sixtysix` (V1, 루트 `sixtysix/`) · `sixtysix-v2` (V2, 루트 `sixtysix-v2/`, Vite) — 같은 저장소, `main` 푸시 시 각각 자동 배포 |

> `sixtysix.vercel.app` 은 **다른 사람 사이트**다. V1 공개 주소는 `sixtysix-taupe.vercel.app`.

### 1.4 기술 구성

| | V1 | V2 |
|---|---|---|
| 화면 | HTML · CSS · JS (프레임워크 없음) | React 19 · TypeScript · Vite 5 · react-router 7 |
| 상태 | localStorage | 도메인(순수 함수) + 시뮬레이터 + Clock + localStorage |
| 테스트 | Playwright 210개 (360·390·430px) | Vitest 169개 (도메인 · 저장소 · 화면 · 흐름) |
| 배포 | Vercel `sixtysix`, `main` 푸시 시 자동 | Vercel `sixtysix-v2`, `main` 푸시 시 자동 (V2 폴더가 바뀐 경우만) |

### 1.5 폴더

```
66/
├── PROGRESS.md        ← 이 문서 (상태)
├── HANDOFF.md         인계 문서 (원칙 · 작업 방법 · 함정)
├── README.md          포트폴리오용
├── sixtysix/          V1.1 — 배포 중 · 동결
├── qa/                V1 Playwright 회귀 테스트 210개
├── sixtysix-v2/       V2 — 지금 개발 대상
│   └── src/
│       ├── domain/          Gate 1 — 타입 · 정책 · 셀렉터 · 불변식 (now 는 인자로만)
│       ├── simulator/       Gate 2 — 29명 결정론적 코호트
│       ├── infrastructure/  Gate 3 — Clock · 시간대 · 저장소 경계 · 저장값 검증
│       ├── app/             세계 구성 · AppProvider · 데모 시드
│       └── ui/              화면 · 컴포넌트 · 디자인 토큰
├── v2/                V2 기획 문서 7개
└── brand/             로고 · 파비콘 · 앱 아이콘 원본
```

---

## 2. 단계별 진행

| 단계 | 내용 | 상태 | 날짜 · 커밋 |
|---|---|---|---|
| V1 | 12화면 · 상태 6개 · 정책 10개 MVP | ✅ | 09-09 `33f6de4` |
| V1.1 | 정합성 버그 3건 수정 후 동결 | ✅ | 09-09 `10fd1a6` · 태그 `v1.1` |
| 01 | V1 자기 진단 — 문제 8건 (P1-A ~ P3-H) | ✅ | 09-09 `v2/V1-DIAGNOSIS.md` |
| 02 | V2 범위 결정 | ✅ | 09-09 `v2/V2-SCOPE.md` |
| Gate 1 | 도메인 모델 · 불변식 16개 | ✅ | 09-09 `97d3e42` |
| Gate 2 | 시뮬레이터 · 멤버 원형 6종 · 복귀 특화 momentum | ✅ | 09-10 `224a1c1` |
| Gate 3 | Clock · 시간대 · Demo/Real 세계 분리 | ✅ | 09-10 `d0ff5c1` |
| 03 | Figma V1 이전 — 12화면 + 홈 상태 5종 | ✅ | 09-10 `6c5c140` |
| — | 로고 C안 「이어짐」 · 타이포 확정 · 텍스트 스타일 13종 | ✅ | 09-10 `c00cb45` `67ab008` `29fa587` |
| 04 | V2 와이어프레임 구조 결정 · 저충실도 6화면 | ✅ | 09-10 `ed1cfdc` |
| 05 | 디자인 고도화 — 홈 · 코호트 (나머지는 구현하며 확정) | ✅ | 09-10 `5b0d397` |
| 08 | React 구현 | ◐ **6/11 화면** | 09-11 ~ 09-30 |
| 06 | V2 디자인 최종 점검 | ☐ | 09 전에 |
| 07 | V2 `.md` 문서 갱신 | ☐ | 09 전에 |
| — | V2 미리보기 배포 (별도 Vercel 프로젝트) | ✅ | 10-05 `65aa8c7` |
| 09 | 구현 QA · V2 정식 공개 | ☐ | |

> 강의 순서는 06 → 07 → 08 이지만, React 를 04단계 구조가 잠긴 뒤 바로 시작했고
> 06·07 은 화면이 다 나온 뒤 09 전에 한 번에 한다.

---

## 3. 완료한 것

### 3.1 V1 (동결)

- 12화면 · 사용자 상태 6개(`0일차 · 연속 중 · 오늘 완료 · 끊김 · 휴면 · 완주`) · 정책 10개
- V1.1 에서 고친 버그 3건 — 온보딩 습관·코호트 불일치 / 코호트 참여가 저장 안 됨 / 랭킹에서 나만 면제권을 인증으로 셈
- 근본 원인 — 테스트 156건이 「화면에 뭐가 보이는가」만 봤다. `state.spec.js` 로 저장 상태 층을 더해 210건

### 3.2 V2 기획 (01 · 02 · 04)

| 문서 | 내용 |
|---|---|
| `V1-DIAGNOSIS.md` | 직접 써보며 찾은 문제 8건 + 03단계 발견 2건(사진 위 텍스트 대비, 카운터가 입력과 무관) |
| `V2-SCOPE.md` | 확정 결정 7개 (아래) · 미결정 목록 |
| `GATE1-DOMAIN.md` · `GATE1-SELECTORS.md` | 저장 사실 / 파생 경계, 파생 함수 목록 |
| `V2-WIREFRAME.md` | 하단 탭에 코호트 신설, 화면 12 → 11 |
| `FIGMA-V1-TRANSFER.md` | 03단계 결과 |
| `GPT-HANDOFF.md` | ChatGPT 상의용 프롬프트 |

**확정된 결정**

| # | 결정 |
|---|---|
| 1 | V2 중심은 가설 1 을 검증 가능한 프로토타입으로 만드는 것 |
| 2 | V1 은 버그 3건만 고치고 동결 |
| 3 | 구현 순서 Domain → Simulator → Clock. 앞 Gate 가 통과해야 다음 |
| 4 | 최초 방문은 DemoClock. Demo / Real 저장 영역 분리 |
| 5 | 성취 지표는 `stayedToEnd` · `filled66` · `perfect66`. `completed` 는 쓰지 않음 |
| 6 | `cohortMomentum` 은 복귀 특화. 연속 참여 중인 멤버에게는 적용 안 함 |
| 7 | 타이포 — Pretendard · 행간 140% · 자간 −3%. Anton 숫자만 행간 100% |

### 3.3 V2 Gate 1 ~ 3

| Gate | 내용 | 통과 기준 |
|---|---|---|
| 1 Domain | 저장 사실 / 파생 분리, 불변식 16개 | Checkin 목록 하나로 모든 수치 계산 · `V1_D23_BASELINE` 재현 (checkins 20 · passes 1 · filled 21 · streak 9 · rank 4) |
| 2 Simulator | 결정론 · 경로 의존 · 원형 6종 · 복귀 momentum | 같은 seed = 같은 결과. 파라미터 동결(`frozen.test.ts`) |
| 3 Clock | RealClock / DemoClock · 시간대 명시 · 세계 분리 | 도메인에 `new Date()` 0건. 4개 시간대에서 동일 결과 |

Gate 2 A/B (같은 seed, momentum 계수 0 → 0.35) — 3일 내 복귀율 81.6% → 86.9%, 휴면 경험 9명 → 7명, **steady 원형 57.6 → 57.6 (안 움직임 = 메커니즘이 깨끗하다)**.

### 3.4 디자인 · 브랜드 (03 · 05)

- Figma `01_V1_CURRENT` — V1.1 박제. 12화면 + 홈 상태 5종. 실제 SVG 아이콘 25종, 이미지 10장
- 로고 C안 「이어짐」 — 두 개의 6 이 맞물린 마크. 기본형·소형 두 벌, 파비콘·앱 아이콘 별도 (`brand/`)
- 타이포 확정, `V2 / …` 텍스트 스타일 13종
- 05단계 — Hero 대비는 「사진과 면을 분리」, AvatarGrid 30칸은 이니셜 원

### 3.5 V2 React 화면 (08) — 6 / 11

| 화면 | 되는 것 | 푼 진단 |
|---|---|---|
| 온보딩 | 습관 6종 → 그 습관의 코호트. **그날이 1일차** | P2-D · V1 버그 1 |
| 홈 | 상태 6종 · Hero · 코호트 현황(계산값) · 오늘의 인증 레일(내 인증 포함) | P1-A · P1-C |
| 코호트 | 오늘 / 피드 / 멤버 30명 · AvatarGrid · 범례 | P3-G · P3-H |
| 기록 | 66칸 진행판 ↔ 날짜 목록 양방향 연동 · 방향키 이동 | P2-F |
| 인증 작성 | 마감까지 남은 시간 · 사진 · 한 줄 · 공개 범위 · 남길 수 없을 때 안내 | P1-B |
| 마이 | 배지 8종(획득 시점 파생) · 데모 시계 · 시작 지점 전환 | P2-D |

공통 — `DemoClockBar` 로 데모 시간임을 화면에 밝히고 ±1일 이동. 상태·코호트·연속이 전부 따라 바뀐다.

### 3.6 2026-09-30 정리 (커밋 3개, 푸시 완료)

**① `81bc0fe` 디자인 전면 정리** — 규칙은 `sixtysix-v2/src/ui/styles/components.css` 머리 주석

| 규칙 | 내용 |
|---|---|
| 글자 크기 | Page 30 › Section 24 › Card 20 › Body 16 › Label 14 › Meta 12. **12 미만 없음** |
| 숫자 | `<Num size="count">` — Display 단계 이름만. 목록용 `list`(20) 추가 |
| 위계 | 헤더 제목 20 < 섹션 24 로 뒤집혀 있던 것 → 헤더 Page 30. 입력 이름표는 `.field__label`(16) |
| 간격 | 블록 사이 24 · 블록 안 12 · 한 덩어리 안 4~8 |
| 면 | 큰 면 20/20 · 타일 16/16 · 입력·안내 12 |
| 기타 | `<b>` 700 차단 · `word-break: keep-all` · 하단 탭 콘텐츠 정렬 · 안전 영역 · 하드코딩 색 토큰화 |

동기화 충돌본 `invariants 2.ts` 삭제.

**② `052c9a9` 문서** — README · HANDOFF 를 V2 기준으로 갱신.

**③ `b7988a0` 흐름 정합성 6건**

| 문제 | 수정 |
|---|---|
| 인증 화면이 목록 첫 번째 습관을 말함 | 내 코호트의 습관. 날짜는 귀속 일차의 날짜 |
| 온보딩 「0일차 · 8/17」 vs 실제 오늘 1일차 | 문구와 시작일이 같은 `joinDate` 에서. 04:00 전에도 1일차. 「처음부터」도 시작일 이동 |
| 실제 시간 모드에서 시계가 멈춤 | 30초 · 탭 복귀 시 다시 읽음 |
| 세계 전환 시 이전 세계 설정이 따라옴 | 첫 실행과 전환이 같은 `fromStored()` |
| 중복 · 기간 종료 후 인증 | 도메인 `getCheckinAvailability()` 를 화면·버튼·쓰기 경로가 공유 + 리듀서 이중 방어 |
| 저장값 형태 검증 없음 | `infrastructure/validate.ts` — 깨진 항목만 버림 |

새 테스트 36개. 고친 곳 8군데를 하나씩 되돌리는 뮤테이션을 돌려 **8/8 모두 실패로 잡힘**.

---

## 4. V2 배포 (2026-10-05 완료)

**방침** — V1 주소는 동결된 비교 기준으로 남기고, V2 는 **별도 프로젝트**로 올린다.
배포는 Git 푸시로만 한다. `vercel --prod` 직접 배포는 쓰지 않는다.

| | V1 | V2 |
|---|---|---|
| Vercel 프로젝트 | `sixtysix` | `sixtysix-v2` (`prj_DX0fg9DaTyWW2nSzVspxHGrC8uta`) |
| 주소 | https://sixtysix-taupe.vercel.app | https://sixtysix-v2.vercel.app |
| Root Directory | `sixtysix/` | `sixtysix-v2/` |
| 프레임워크 | Other (정적) | Vite (`npm run build` → `dist/`) |
| 저장소 · 브랜치 | `jaejinu/sixtysix` · `main` | 같음 |

**동작 방식**

- 한 저장소에 프로젝트가 둘이다. `main` 에 푸시하면 **둘 다** 빌드를 시도한다
- V2 는 `sixtysix-v2/vercel.json` 의 `ignoreCommand` 로 **V2 폴더가 안 바뀐 푸시는 건너뛴다**
  - 비교 기준은 `HEAD^` 가 아니라 마지막 성공 배포 `VERCEL_GIT_PREVIOUS_SHA` — 여러 커밋을 한 번에 올려도 놓치지 않는다
  - 이전 배포가 없거나 SHA 를 못 찾으면 빌드한다 (안전한 쪽)
- SPA 라우팅 — 모든 경로를 `index.html` 로 (`/record` 같은 직접 진입 확인함)
- 로컬 연결 — `sixtysix-v2/.vercel/` (gitignore). `vercel link` 가 만든 `.env.local`(OIDC 토큰)도 `sixtysix-v2/.gitignore` 가 막는다

**첫 배포 확인 (`65aa8c7`)** — 온보딩 → 홈 D+1 · 직접 진입 `/record` 66칸 · Pretendard·Anton 로드 · 콘솔 오류 0 · 4xx/5xx 0

> V2 는 아직 5화면이 없다. 지금 주소는 **미리보기**다. 정식 공개(README 메인 링크 교체)는 09단계.

---

## 5. 해야 할 것

### 5.1 바로 다음 (우선순위 순)

| # | 할 일 | 메모 |
|---|---|---|
| 1 | **졸업** 화면 | 실제 기록에서 계산 (P3-G). 「22명 완주」 같은 지어낸 숫자 금지 — 시뮬레이터 값. 홈 완주 상태 버튼이 지금은 기록으로 보내고 있다 → 졸업으로 |
| 2 | **인증 상세** | 응원 · 저장 · 신고. `Reaction` 타입은 도메인에 있고 아직 안 씀 |
| 3 | **챌린지 탐색** · **챌린지 상세** | 진입점은 마이 한 곳으로 (P3-H). 검색 · 카테고리 · 정렬 |
| 4 | **공지** | 마이 하위, 진입점 1곳 |
| 5 | 마이에 공지 · 탐색 흡수 | 와이어프레임 3.5 |

> 이전 문서들에 「남은 화면 4개」로 적혀 있었는데, 와이어프레임 11화면 기준으로는 **공지까지 5개**다.

### 5.2 09단계 전에

- **06 디자인 최종 점검** — 남은 5화면도 9/30 규칙(글자 단계 · 간격 3단 · 면)을 따르는지, 360 · 390 · 430px
- **07 문서 갱신** — `sixtysix-project.md` · `sixtysix-design-rull.md` 의 V2 판 (V1 원본은 동결이므로 별도 파일 검토)
- **V2 브라우저 회귀 테스트** — 지금 V2 는 Vitest(jsdom)만 있다. `qa/` 는 V1 전용. V2 용 Playwright 흐름 · 레이아웃 · 스크린샷 층이 필요
- **09 QA · 정식 공개** — README 메인 링크를 V2 로, V1 은 비교 기준 링크로

### 5.3 아직 결정하지 않은 것 (V2-SCOPE · 와이어프레임)

| 질문 | 상태 |
|---|---|
| 실제 사진 업로드 (P2-E) | 미정. 효과는 크지만 IndexedDB 저장 설계가 따라온다. 08 여력 보고 판단 |
| 탐색의 위치 | 마이 하위로 가닥. 확정 필요 |
| 코호트 탭 세그먼트 기본값 | 「오늘」로 두었다. 사용자 테스트에서 확인 |
| 66칸 상세 진입 | 11×6 유지 확정 · 목록 연동으로 구현함. 날짜 상세 화면을 따로 둘지는 미정 |

> 결정은 사용자가 ChatGPT 와 상의해서 내린다(강의 02단계 원칙). AI 가 대신 정하지 않는다.

### 5.4 디자인 · 브랜드 숙제

- **Figma 폰트** — 텍스트 스타일 9개의 폰트를 Pretendard 로 바꾸기 (SemiBold 굵기도). MCP 로는 Pretendard 를 못 불러와서 **사람이 Figma 앱에서** 해야 한다
- **워드마크** 「육십육」 손으로 그리기 — 이응 두 개와 마크의 볼 두 개를 같은 원으로
- **소형 글자 자간 제안** — 결정 7 의 −3% 를 12px 에도 그대로 쓰고 있다. 빽빽하면 작은 글자만 −2% 로 완화하는 안 (결정 변경이므로 상의 필요)
- Anton 자간 −3% 눈 검수 (결정 7 예외 2) — 붙어 보이면 디스플레이만 −2%

### 5.5 알려진 작은 것들

| 항목 | 위치 |
|---|---|
| 프로필 이름 「재진」 하드코딩 | `app/world.ts` · `MyScreen.tsx` |
| 마이 하단 「코호트 보기」 버튼이 하단 탭과 중복 | `MyScreen.tsx` |
| 홈 텍스트 전용 인증 카드에 빈 공간이 큼 | `.vcard--text` |
| ESLint 없음 | `sixtysix-v2/` |
| `qa/test-results/.last-run 2.json` — 동기화 충돌본으로 보임 (gitignore 대상이라 저장소엔 없음) | 로컬 |

---

## 6. 절대 어기면 안 되는 원칙 (요약)

전문과 이유는 `HANDOFF.md` 3장.

1. **V1 과 Figma `01_V1_CURRENT` 는 동결** — 문제를 알아도 고치지 않는다. 「왜 바꿨는가」를 보여주는 기준점이다
2. **저장은 사실만, 판단과 요약은 파생** — `total` 이라는 이름을 쓰지 않는다. `checkins`(랭킹) · `filled`(진행판) · `passes`
3. **시뮬레이터 파라미터 동결** — `frozen.test.ts` 가 지킨다
4. **지표 정의는 `simulator/metrics.ts` 한 곳에만**
5. **테스트는 표시 · 저장 상태 · 파생 값 · 흐름 네 층** — 첫 실행에 다 통과하면 뮤테이션으로 정말 무는지 확인한다
6. **숫자를 지어내지 않는다** — 화면의 수치는 시뮬레이터나 도메인이 계산한 값
7. **화면이 정책 숫자를 따로 갖지 않는다** — 한 줄 40자, 마감 04:00, 면제권 3회는 `policies.ts` 에서 읽는다

---

## 7. 실행

```bash
# V2 (지금 개발 대상)
cd sixtysix-v2
npm ci
npm run dev          # http://localhost:5173
npm test             # 169개
npm run typecheck
npm run build

# V1.1 (동결)
cd sixtysix && python3 -m http.server 8900      # file:// 로 열면 안 됨
cd qa && npm install && npx playwright install chromium && npm test   # 210개

# 배포 — main 에 푸시하면 자동
git push origin main
```

---

## 8. 문서 지도

| 알고 싶은 것 | 문서 |
|---|---|
| 지금 어디까지 왔나 | **이 문서** |
| 원칙 · 작업 방법 · Figma 함정 | `HANDOFF.md` |
| 왜 그렇게 정했나 | `v2/V2-SCOPE.md` |
| V1 의 무엇이 문제였나 | `v2/V1-DIAGNOSIS.md` |
| V2 화면 구조 | `v2/V2-WIREFRAME.md` |
| 도메인 모델 · 파생 함수 | `v2/GATE1-DOMAIN.md` · `v2/GATE1-SELECTORS.md` |
| V2 코드 구조 · 테스트 층 | `sixtysix-v2/README.md` |
| 로고 규정 | `brand/README.md` |
| V1 화면 명세 · 디자인 규정 | `sixtysix/sixtysix-project.md` · `sixtysix/sixtysix-design-rull.md` |

## 9. Figma 디자인 시스템·아키텍처 정리 (2026-10-05)

디자인 작업의 개요·범위·단계·검수·최신 기록은 **[v2/DESIGN-WORKPLAN.md](v2/DESIGN-WORKPLAN.md)** 에서 계속 갱신한다.

기존 작업 파일 `wwn6VrLIgZENhkjshPGjy6`에서 기반을 먼저 정리한 뒤, **기본 컴포넌트와 홈 제안 화면**까지 확장했다. 아래 기반 수치는 최초 정리 시점의 기록이며 최신 산출물은 이 절 하단과 디자인 작업 문서에서 관리한다.

| 페이지 | 내용 | 바로가기 |
|---|---|---|
| `00_START_HERE` | 파일 안내, 디자인 4계층, 내비게이션 구조, 작업 순서 | [안내 보드](https://www.figma.com/design/wwn6VrLIgZENhkjshPGjy6?node-id=30-2) |
| `04_V2_FOUNDATIONS` | 색상·타이포·간격·모바일 폭 기준표 3개 | [색상](https://www.figma.com/design/wwn6VrLIgZENhkjshPGjy6?node-id=31-3) · [타이포](https://www.figma.com/design/wwn6VrLIgZENhkjshPGjy6?node-id=31-151) · [레이아웃](https://www.figma.com/design/wwn6VrLIgZENhkjshPGjy6?node-id=32-2) |
| `05_V2_COMPONENT_ARCHITECTURE` | 컴포넌트 속성·상태 계약, 패턴 분류, 11개 화면 책임 | [컴포넌트](https://www.figma.com/design/wwn6VrLIgZENhkjshPGjy6?node-id=33-3) · [화면 구조](https://www.figma.com/design/wwn6VrLIgZENhkjshPGjy6?node-id=33-83) |

- 실제 파일에서 확인된 기존 자산은 `00_TOKENS` 아이콘 11개, V1 보존 페이지, V2 홈 와이어프레임이었다. 이전 문서의 브랜드 페이지·스타일 등록 기록과 실제 파일이 달랐으며, 이번 작업에서 기존 노드를 삭제하거나 덮어쓰지 않았다.
- 빈 `Page 1`을 `00_START_HERE`로 재사용하고 파일 맨 앞에 배치했다.
- 변수: `V2 / Primitives` 64개 + `V2 / Semantic` 79개 = **143개**. 의미 변수는 기본값을 alias로 참조하며 실제 CSS 변수 구문과 사용 범위를 등록했다.
- 스타일: **텍스트 14개 + 그림자 1개**. 텍스트 스타일의 크기는 변수에 연결했다.
- 검증: 변수 alias·scope·WEB syntax·스타일 크기 바인딩 오류 0건. 보드 6개의 시각 검수 완료.
- 폰트 제한: Pretendard는 도구에서 로드할 수 없다. 한글 9개 스타일은 기존 대체 규칙에 따라 Noto Sans KR로 만들고 목표 Pretendard 굵기를 설명에 기록했다. Figma 앱에서 스타일의 패밀리와 굵기를 교체한 뒤 최종 타이포 검수가 필요하다.
- 코드 기준값은 BASELINE, Hero 축소·작은 설명 글씨·44px 조작 영역 등 개선 항목은 REVIEW로 분리했다. 앱 코드는 변경하지 않았다.

후속 디자인 작업 완료 (2026-10-05):

- [기본 컴포넌트 보드](https://www.figma.com/design/wwn6VrLIgZENhkjshPGjy6?node-id=42-2): Button·Field·Toggle·Segment·Badge 5종, 32개 상태와 편집 속성.
- [홈 제안 보드](https://www.figma.com/design/wwn6VrLIgZENhkjshPGjy6?node-id=44-182): 재사용 패턴 7개, 360·390·430px 화면, [전체 스크롤 콘텐츠](https://www.figma.com/design/wwn6VrLIgZENhkjshPGjy6?node-id=44-473). 사진 축소와 카드 안 인증 버튼으로 오늘 행동과 코호트 현황을 앞당겼다.
- 추가 제안 변수 4개로 현재 총 147개. 스타일 14개 유지. 상태·조작 크기·세 폭의 내부 넘침 검수 오류 0건, 렌더링 검수 완료.
- 작업 개요를 MD에 선행 작성하고 단계별 상태·결정·노드 링크·검수 결과를 갱신했다. 이번 디자인 작업에서는 앱 코드를 변경하지 않았다.

홈 상태 확장 완료: [08_V2_HOME_STATES](https://www.figma.com/design/wwn6VrLIgZENhkjshPGjy6?node-id=50-3)에 카드 6개 상태와 신규 화면 5종 × 360·390·430px를 만들었다. 종료와 완주, 빈칸과 남은 기간, 휴면과 복귀 후 표시를 구분했다. 수치는 기존 selector를 실행한 [상태 fixture](v2/design-home-state-fixtures.json) 기준이며, 15개 화면 레이아웃·스타일·조작 크기 검수 오류 0건이다. 상세 링크와 한계는 디자인 작업 문서 11장에 기록했다.

다음: Pretendard 최종 검수, 코호트·기록·인증 작성 디자인 확장과 B0 기능 계약 정리 → 확정 디자인의 React 반영.

## 10. 기능 현황·백엔드 준비 (2026-10-05)

[v2/FUNCTIONAL-BACKEND-PLAN.md](v2/FUNCTIONAL-BACKEND-PLAN.md)에 실제 구현 기능과 데모 의존 기능, 데이터/API 초안, 권한·동시 요청 처리, 단계별 완료 조건을 정리했다.

- 현재는 localStorage + 가상 멤버 29명. 실제 시간 모드도 서버 서비스가 아니다.
- 면제권은 모델·명령이 있지만 V2 사용 UI가 연결되지 않았다. 인증 수정·졸업 전용 화면·실제 사진 업로드·로그인·알림은 미구현이다.
- 백엔드 계약(B0)은 지금 시작할 수 있다. 코호트 모집/예약, 최종 늦은 인증 창, 면제권 완료 표현, 인증·공개 범위를 먼저 정리한다.
- 첫 연결은 로그인 → 코호트 참여 → 인증 저장 → 홈·기록·피드 동기화. 서버/DB 구현·기술 스택 선정은 이번 문서화 작업에 포함하지 않았다.

### B0 구체 명세 갱신

[v2/BACKEND-B0-SPEC.md](v2/BACKEND-B0-SPEC.md)에 정책 결정표, 첫 개발 범위, 시간·상태 전이, DB 제약과 트랜잭션, API·오류, T01~T07 작업 순서와 수용 사례 28개를 작성했다.

- **사용자 확정:** 이메일 인증번호 + 카카오 로그인, 공개 모집부터 시작.
- 계정 연결/충돌/해제, 모집 취소·탈퇴·중도 이탈·신고·문의·운영자 기능을 첫 범위에 반영했다.
- 마지막 날 늦은 인증은 기존 테스트에서 허용하고 있어 유지한다. 홈 CTA 불일치와 정확히 04:00의 분류 차이를 수정 대상으로 기록했다.
- B0 문서 초안과 확정된 방향은 준비됐다. 세부 권장 정책은 제안 상태다. 다음은 기술 구성 선정과 OpenAPI·DB 스키마 작성이며, 서버 구현·실제 서비스 개설은 아직 하지 않았다.

## 11. T02 기술 구성·DB/API 계약 (2026-10-05)

- [기술 구성](v2/BACKEND-TECH-ARCHITECTURE.md): Node/TypeScript/Fastify/PostgreSQL 개발 기준. Better Auth는 이메일 미제공 카카오·양방향 수단 연결 검증 후 최종 고정하는 우선 후보.
- [백엔드 계약 폴더](backend/README.md): 초기 업무 SQL, OpenAPI 44개 작업, 재현 가능한 검증 스크립트·의존성 lockfile.
- 검증: PostgreSQL 스키마 생성, 제약 거부 20개 및 UTF-16 경계 통과. OpenAPI 구조/참조 검증과 입력 계약 14개 통과.
- 한계: HTTP 서버·실제 인증·동시 명령 트랜잭션·운영 DB/메일/배포는 미구현. 이번 검증은 런타임 기능 완료나 공개 준비 완료를 의미하지 않는다.
- 다음: **T03a 인증 호환성 spike → B1 서버 골격·인증 연결 → B2 실제 코호트 참여 → B3 인증/면제 저장**. 세부 모집/보관 정책은 기존 권장안 상태를 유지한다.

## 12. Vercel 백엔드·DB 연결 기반 (2026-10-05)

[VERCEL-BACKEND-SETUP.md](v2/VERCEL-BACKEND-SETUP.md)에 실제 연결 절차를 정리했다. 사용자 배포 조건에 따라 기존 `sixtysix-v2` 프로젝트에 API 함수를 추가하고 Neon PostgreSQL 연결을 권장한다.

- 구현: `/v1/health`, `/v1/ready`, `/v1/habits`, API/SPA 경로 분리, 서버 DB pool·transaction, checksum/잠금/이력 기반 migration runner, 비밀값 예시 및 ignore 규칙.
- 검증: 테스트 175개, 프런트/서버 타입 검사·Vite 빌드, 임시 DB 최초 migration/재실행과 실제 카탈로그 API 조회 통과.
- Vercel 로컬 Preview 빌드·생성된 API 함수/중첩 경로 rewrite/SPA 산출물 검증 통과. 실제 배포는 미수행.
- 확인: Vercel 프로젝트에 등록된 환경 변수 없음. 실제 Neon DB·메일·카카오 연결 및 배포는 미수행. React 화면은 아직 데모 저장소 사용.
- 다음: Preview용 Neon 연결·migration → 인증 호환성 검증/실제 로그인 → 참여·인증 저장. outbox는 Vercel에 맞게 작업 함수와 스케줄로 구현한다.

## 13. 실제 Preview DB·인증 호환성 검증 (2026-10-05)

- **Neon DB 생성·연결 완료:** `sixtysix-v2-preview`, Free, Singapore. Vercel Preview에만 연결하고 업무 테이블 17개·migration 이력 적용. 로컬 API → 원격 DB 읽기 검증 완료. Production DB/배포는 미수행.
- [인증 검증 결과](v2/AUTH-SPIKE-RESULTS.md): Better Auth 1.7.7 실제 handler를 메모리 DB·가짜 공급자 응답으로 실행, 12개 동작 재현. 이메일 없는 카카오·역방향 OTP 연결·수단 해제에서 제품 정책 불일치 3개를 확인해 기본 구성 직접 채택 보류.
- **브라우저 검증 기반 추가:** `/v1/auth/context`, 서명 쿠키·CSRF 토큰·Origin/만료/변조 검사. 이는 로그인 세션이 아니며 실제 쓰기 라우트 연결과 인증 세션 검사는 후속.
- 검증: 기존 169개 + 서버 12개 사례 통과, API 계약 14개·인증 후보 재현 12개 통과. 프런트/서버 타입 검사·빌드 확인.
- 사용자 준비 상태: 카카오 앱·메일 발송 서비스 미개설. 다음은 런타임 DB 권한 분리, provider identity 중심 인증 adapter/엔진 선정 및 로그인 구현, 카카오·메일 공급자 설정이다.

## 14. 계정·세션 인증 코어 (2026-10-05)

- [개요·구현·후속 명세](v2/AUTH-CORE-IMPLEMENTATION.md)를 먼저 작성하고 결과 갱신. 이메일/카카오를 `provider + subject`로 관리하는 PostgreSQL 인증 코어 구현. 참고 이메일에 의한 자동 병합 없음.
- 검증된 서버 증명에서 사용자·세션 생성, 최근 재인증, 양방향 수단 연결·해제, 마지막 수단 보호, 로그아웃·정지/탈퇴 요청 계정 차단. 증명은 브라우저·목적·세션/intent에 바인딩하며 한 번만 소비한다.
- `002_auth_core.sql`을 실제 Neon Preview에 적용. 기존 업무 17개 + 인증 3개 테이블. Production·앱 배포는 미수행.
- 검증: 실제 PostgreSQL 통합 17개(동시 최초 로그인/연결/해제와 전체 rollback 포함), 기존 181개, 타입 검사·빌드 통과.
- **완료 경계:** 서버 내부 계정·세션 코어. OTP 발송/검증, 카카오 OAuth, HTTP 로그인/세션 쿠키, React 로그인은 아직 미구현이다. 테스트 증명을 실제 공급자 인증 완료로 간주하지 않는다.
- 다음: 이메일 OTP·분산 제한·발송 adapter → 카카오 state/콜백 → HTTP/화면 연결. 배포 전 런타임 DB 역할 분리·감사·개인정보 정리 정책을 구현한다.

## 15. 이메일 로그인 API·발송 adapter (2026-10-05)

- [개요·구현·검증 기록](v2/EMAIL-AUTH-IMPLEMENTATION.md): 인증번호 요청·검증·로그아웃 HTTP API를 기존 인증 코어에 연결했다. 6자리/5분/오답 3회, DB HMAC 저장, 브라우저·이메일·IP 공유 제한, CSRF/Origin 및 세션 쿠키 적용.
- Resend 발송 adapter 준비: 고정 endpoint·timeout·멱등 키·오류 비밀값 제거. 키/발신자 미설정은 503. 실제 계정 개설·메일 발송은 하지 않았다.
- Neon Preview에 `003_email_login.sql` 적용. 업무 17 + 인증 5 = 22개 테이블. 기존 migration checksum 유지, 원격 읽기 검증 완료.
- 검증: DB/HTTP 통합 31개, Vitest 186개, API 계약 14개, 타입 검사·Vite 및 Vercel 로컬 Preview 빌드·산출물 검사 통과.
- **미완료:** 이메일 재인증/연결용 HTTP 흐름, 카카오 OAuth, `/me`·React 로그인, 공급자 실계정 검수, 런타임 DB 역할·감사·데이터 정리. 원격 앱/Production 배포는 하지 않았다.
- 다음: 카카오 OAuth와 재인증/연결 흐름 → 로그인 UI·현재 사용자 연결. 실제 이메일은 Resend/발송 도메인 설정 후 검수한다.

## 16. 카카오 OAuth·인증 수단 HTTP 흐름 (2026-10-05)

- [구현 기록](v2/KAKAO-AUTH-IMPLEMENTATION.md): state hash·브라우저 결합·1회 소비·S256 PKCE·provider ID 정밀도 보존, 카카오 로그인/재인증/연결 구현. 이메일 재인증/연결도 서버 intent 기반으로 확장했다.
- HTTP: 카카오 시작·callback, 기존 수단 재인증 intent, 새 수단 연결 intent/complete, 해제. 로그인만 새 세션 쿠키를 발급하고 재인증/연결은 같은 세션을 유지한다.
- Neon Preview `004_auth_intents_oauth.sql` 적용, 기존 checksum 유지. 테이블 24개. 실제 공급자 호출·Production·앱 배포는 미수행.
- 검증: PostgreSQL/HTTP 통합 45개, Vitest 191개, API 계약 14개, 타입 검사·Vite/Vercel 로컬 Preview 빌드 및 함수/라우팅 산출물 통과.
- 다음: `/v1/me`·로그인/연결 UI·callback 결과 처리. 실제 카카오 앱/메일 도메인 설정과 실계정 검수, 런타임 역할·감사·만료 데이터 정리는 공개 서비스 전에 진행한다.

### Git 공개 가능성 확인

[읽기 전용 점검](v2/PUBLIC-REPOSITORY-REVIEW.md): 당시 작업 경로 244개, 로컬 Git 이력 텍스트 blob 211개에서 토큰 패턴/현재 비밀값 일치 발견 0건. `.env`/`.vercel` 제외 확인. 문서·디자인 링크·커밋 정보 공개 범위는 별도로 고려하며 visibility/commit/push는 변경하지 않았다.

## 17. 현재 사용자 조회·로그인/계정 화면 (2026-10-05)

- [구현·검증·문제 가능성](v2/LOGIN-UI-IMPLEMENTATION.md): `GET /v1/me`, `/login`·`/account`, OTP·카카오 callback·재인증·명시적 연결/해제·로그아웃을 연결했다. 실제 계정과 데모 기록은 분리했다.
- Vitest 204개·PostgreSQL/HTTP 47개·계약 14개, 타입 검사·Vite/Vercel 로컬 빌드와 API/SPA 산출물 검사 통과.
- 공급자 실계정 검수·런타임 DB 역할 분리·감사/정리·실제 코호트 업무는 남아 있다. 새 migration·원격 앱 배포·commit/push·공개 전환은 하지 않았다.
- 모바일 360/390/430px의 로그인·코드·계정·오류 12개 상태 검수 완료(테스트 API 응답). 가로 넘침 없음, 입력/버튼 44px 이상.
- 다음: 공개 모집 조회·참여 트랜잭션 구현. 배포 전 공급자 설정과 최소 권한 DB 연결을 검증한다.

## 18. 공개 모집·참여·시작 전 취소 (2026-10-05)

- [개요·구현·검증](v2/COHORT-JOIN-IMPLEMENTATION.md): 공개 모집 목록/상세, 참여/취소 API와 React `/recruitment` 연결. 실제 계정의 참여와 데모 기록을 분리한다.
- 사용자·코호트 잠금으로 정원/슬롯 보호, 성공 응답 멱등 저장, 시작 최소 인원 판정/outbox, 취소/종료 슬롯 정리, 참여/취소 감사 이벤트 구현.
- Vitest 212개·실제 DB/HTTP 58개·계약 14개, 타입 검사·Vite/Vercel 로컬 빌드. 모바일 18개 상태 검수 완료.
- 최소 인원 운영 기본값 미확정. 코호트별 DB 설정값 사용. 실제 모집 등록·배포·새 migration·commit/push 미수행.
- 다음: 실제 인증/면제권 저장과 홈·기록 연결. 공개 전 공급자 실계정 검수·DB 역할 분리·운영자 모집·남용 제한·outbox/정리 작업 필요.

## 19. 실제 인증·면제권·활동 기록 검증 완료 (2026-10-05)

- [구현·검증 기록](v2/CHECKIN-RECORD-IMPLEMENTATION.md): `/activity/:membershipId`의 본인 홈·66일 기록, 인증/면제권 저장, 날짜·늦은 접수 재확인, 동일 요청 재시도 연결 완료.
- 임시 로컬 PostgreSQL DB/HTTP **68개**, Vitest **225개**, API 계약 **14개**, 프런트·서버 타입 검사·프로덕션 빌드 통과.
- 모바일 360/390/430px **42개 상태/흐름** 검수 통과. 가로 넘침·페이지 오류 없음. 재현 도구: `qa/scripts/activity-mobile.cjs` (테스트 API 응답 사용).
- 세션 만료/접근 거부 후 비공개 기록과 이전 계정 초안이 남는 문제 수정. 추가 회귀 5개는 수정 전 실패, 수정 후 통과 확인.
- 원격 DB·실제 회원/모집 데이터·공급자·배포·commit/push는 변경하지 않았다. 실제 공급자 로그인부터 서버 저장까지의 브라우저 검수는 후속이다.
- 다음: 공급자 설정/실계정 검수 및 최소 권한 DB 역할·운영 모집/남용 제한·outbox/만료 데이터 정리 → 배포 검증.

## 20. Preview 런타임 DB 권한 분리 (2026-10-05)

- [구현·적용·복구 절차](v2/RUNTIME-DB-IMPLEMENTATION.md): 명시적 테이블/열 grant, 역할 설정·권한 검증 도구, 샘플 사진 잠금 전용 함수, APP_DATABASE_URL 전용 앱 연결 구현.
- 기존 68개 기능 테스트를 별도 런타임 로그인으로 전환했다. 금지 권한·재적용·역할 멤버십·필수 객체·동시 잠금 사례 포함 DB/HTTP **89개**, Vitest **231개**, 프런트·서버 타입 검사·빌드 통과.
- 기존 Neon Preview에 migration **005**와 `sixtysix_runtime_preview` 적용. 001~004 checksum 유지, 테스트 회원/코호트 생성 없음. 런타임 pooled 연결로 API 읽기와 권한 검증 통과.
- Vercel Preview: **APP_DATABASE_URL Secret만 남김**. 소유자 비밀값을 자동 주입하던 Marketplace 프로젝트 연결 해제, Neon 리소스는 Available로 보존. Production·원격 앱 배포·commit/push 미수행.
- 비밀값은 Git 제외·권한 600인 admin/runtime 로컬 파일로 분리했다. 기존 배포의 환경은 소급 변경되지 않으므로 공개 전 새 배포와 이전 배포의 접근/비밀값 수명 점검이 필요하다.
- 사용자 확인: Resend 발송 도메인·카카오 앱은 아직 준비 전. 실제 공급자 검수는 준비 후 진행한다.
- 다음 독립 작업: 인증 감사 기록·만료 데이터 정리, 업무 남용 제한·outbox 처리.

## 21. 인증 감사·만료 데이터 정리 (2026-10-05)

- [구현·실행 절차](v2/AUTH-AUDIT-CLEANUP.md): 중요 인증 변경과 감사 저장을 같은 transaction으로 묶고 비밀값 없이 고정 사유만 기록한다. 미확인 세션 쿠키는 감사 쓰기를 만들지 않는다.
- 인증 임시 데이터 7종에 만료/회수 후 24시간 유예, 전체 기본 100행·최대 500행, 참조/잠금 보호를 적용했다. CLI 기본은 dry-run이며 자동 스케줄은 추가하지 않았다.
- DB/HTTP **102개**, Vitest **238개 / 23개 파일**, API 계약 **14개**, 프런트·서버 타입 검사·빌드 통과. 유예 기간 변이 테스트도 실패를 감지했다.
- Neon Preview migration **006** 및 제한된 함수 실행 grant 적용. 런타임 권한 25테이블·4함수 검증, 원격 dry-run 0행. 기존 migration checksum 유지.
- 원격 실제 삭제·앱 배포·Production 변경·commit/push 미수행. 실제 공급자 검수는 준비 후 진행한다.
- 다음: 업무 API 남용 제한·outbox 처리. 운영 데이터 보관 정책 및 정리 스케줄은 후속.

## 22. 업무 API 요청 제한 (2026-10-05)

- [정책·구현·검증](v2/BUSINESS-RATE-LIMITS.md): 참여·취소·인증·면제권 요청이 계정별 새 요청 20회/분·120회/시간을 공유한다. 성공 응답 재조회는 별도 60회/분으로 정상 재시도와 폭주 제한을 함께 보장한다.
- 업무 거부와 키 충돌도 집계하고, 429/Retry-After로 대기 시간을 전달한다. 기존 화면의 입력·멱등 키 유지와 수동 재시도 흐름을 검증했다.
- 제한된 DB 계정의 DB/HTTP **109개**, Vitest **240개 / 23개 파일**, API 계약 **14개**, 타입 검사·빌드 통과. 제한값 변이는 4개 테스트가 감지했다.
- 기존 카운터·정리 함수 재사용. migration·권한 추가·원격 변경·앱 배포·commit/push 없음.
- 다음: outbox 처리 → 공급자 준비 후 실제 로그인 검수 → Preview 앱 배포.

## 23. outbox 처리·앱 내부 알림 (2026-10-05)

- 사용자 선택에 따라 첫 처리 채널을 앱 내부 알림으로 구현했다. [작업·실행 기록](v2/OUTBOX-IMPLEMENTATION.md).
- 코호트 시작/모집 취소 이벤트의 60초 임대·토큰 검사·중단 복구·지수 재시도·5회 실패 보관 구현. 알림 저장·완료·감사가 원자적이며 재실행 중복을 방지한다.
- 별도 worker 역할은 함수 4개만 실행하고 앱은 worker 함수를 사용할 수 없다. 계정 → 내 알림(`/notifications`), 본인 최신 50개 조회 API 연결.
- DB/HTTP **121개**, Vitest **250개 / 25개 파일**, API 계약 **17개 / 47경로**, 타입 검사·빌드, 모바일 **12개 검수** 통과. 임대 토큰 비교 제거 변이를 탐지했다.
- Preview migration **007**, 앱 SELECT·worker 전용 역할 적용. 001~006 checksum 유지, 26테이블·8함수 권한 검증. 원격 상태 전부 0건이며 실제 처리/알림 생성은 하지 않았다.
- 수동 CLI만 제공. 자동 스케줄·외부 발송·앱 배포·Production·commit/push 미수행.
- 다음: 운영자 모집 생성/관리. 공급자 준비 후 실계정 검수·앱 배포·worker 실행 주기 연결.

## 24. 운영자 모집 생성·관리 (2026-10-05)

- [구현·검증 기록](v2/OPERATOR-COHORTS.md): admin 전용 개설·목록·시작 전 취소 및 `/admin/cohorts` 관리 화면 연결.
- 변경은 최근 5분 재인증·CSRF·멱등 키·요청 한도를 검사한다. 미래 04:00 KST 시작, 정원/최소 인원·동일 기수 중복 검증. 취소 사유·감사·outbox·멱등 응답을 원자적으로 저장한다.
- DB/HTTP **132개**, Vitest **259개 / 26개 파일**, API 계약 **21개 / 47경로**, 타입 검사·빌드·모바일 **15개 검수** 통과. admin 검사 제거 변이를 3개 테스트가 감지했다.
- Preview migration **008** 및 제한된 함수 실행 grant 적용. 001~007 checksum 유지, 26테이블·11함수 권한 검증, outbox 0건.
- 실제 운영자 지정·모집 생성·알림 처리·앱 배포·Production·commit/push 미수행. 가입 계정을 자동 승격하지 않는다.
- 다음: 자동 시작 판단·outbox 스케줄 연결. 공급자 준비 후 실계정/운영자 검수·Preview 앱 배포.

## 25. 자동 시작 판단·알림 스케줄 준비 (2026-10-06)

- 사용자 선택: GitHub Actions **5분 간격**. [구현·활성화 절차](v2/SCHEDULED-WORKER.md).
- worker 전용 시작 배치·상태 함수와 통합 tick 구현. 기존 앱 시작 판단과 같은 잠금으로 중복 방지, outbox 중단 복구·처리 한도·90초 예산·실패 상태 노출 적용.
- DB/HTTP **140개**, Vitest **268개 / 27개 파일**, 타입 검사·빌드·actionlint 통과. 최소 인원 경계 변이 탐지 및 복원 검증.
- Preview migration **009**와 worker grant 적용, 001~008 checksum 유지. 26테이블·13함수 권한 검증, 원격 조회 모두 0건.
- GitHub `preview-worker` 환경(main만), worker Secret, `WORKER_SCHEDULE_ENABLED=false` 준비 완료. workflow는 로컬이며 **예약 실행은 아직 비활성**이다.
- 실제 모집 판단·알림 처리·Production·commit/push·앱 배포 미수행.
- 다음 최종 단계: workflow/worker 파일 main 반영 → 수동 조회 실행 → 5분 자동 실행 활성화. main push의 연결된 Vercel 배포 영향과 기존 미커밋 범위를 먼저 확인한다.

## 26. Preview worker 자동 실행 활성화 (2026-10-06)

- 사용자 승인으로 worker·DB migration·권한 도구·운영 문서만 `d9a89fd`로 main에 반영했다. 앱 UI/API 미커밋 구현은 보존했다.
- workflow `active`, `WORKER_SCHEDULE_ENABLED=true`. `2-57/5 * * * *`로 5분 간격, Preview worker 계정만 사용한다.
- [조회 실행](https://github.com/jaejinu/sixtysix/actions/runs/37333104927) 및 [실제 처리 모드](https://github.com/jaejinu/sixtysix/actions/runs/37333740790) 성공. 모집 대상·알림·실패 모두 0건. 첫 schedule 이벤트는 아직 미관측이며 수동 검증과 구분한다.
- 연결된 Vercel V1 배포 완료. V2는 Ignored Build Step으로 건너뜀. Production DB 변경 없음.
- 중지: 저장소 변수 `WORKER_SCHEDULE_ENABLED=false`. 다음 예약 job부터 차단된다.
- 다음: 공급자 준비 후 실계정·운영자/카탈로그 검수·Preview 앱 배포.

## 27. V2 앱 Preview 배포·원격 검증 (2026-10-06)

- [Preview 앱](https://sixtysix-v2-a27l26dip-dbwowls12345-3437s-projects.vercel.app) 배포 완료. Vercel 배포 `dpl_EeiXP4YTF7ehJfJMYRm9zbbm1AC6`, 상태 READY. Vercel 보호 로그인 필요 가능.
- 로컬 미커밋 앱 구현을 CLI로 배포했다. 기존 main/Production 주소는 변경하지 않았다. 앱 소스는 아직 미커밋 상태이므로 HEAD만으로 이번 배포를 재현할 수 없다.
- 배포 dry-run에서 `.env.preview-*` 포함을 발견해 `.vercelignore`로 제외했다. 실제 비밀 파일은 업로드하지 않았다. 첫 제외 규칙은 전체 파일을 제외하여 빈 배포가 실패했고, 수정한 뒤 128개 실제 파일(빈 디렉터리 포함 manifest 139개)을 검증하고 성공했다.
- `backend/scripts/verify-vercel-upload.cjs`: 필수 소스·업로드 범위·비밀/생성 파일 제외 검사. 정상 목록 통과, 빈 목록·비밀 파일 추가 목록 거부 확인.
- 로컬/원격 프런트·서버 타입 검사·빌드 통과. 원격 Preview DB 앱 권한·카탈로그 읽기 검증 통과.
- `backend/scripts/verify-preview-http.cjs` 원격 19개 검사 통과: health/ready/habits/cohorts, 잘못된 쿼리 400, 미존재 API 404, 인증 미설정 경로 5개 503, JS/CSS 자산, SPA 6개 경로. 실제 브라우저 조작 검수와 구분한다.
- 실행용 의존성 `npm audit --omit=dev` 0건. 전체 빌드의 개발 의존성 경고 5건은 기존 후속 항목이다.
- Preview 환경은 APP_DATABASE_URL만 존재. 인증 context·OTP 비밀값, APP_ORIGIN, 메일·카카오 설정 미완료. 실제 로그인·운영자 지정·모집 seed는 하지 않았다.
- worker는 활성화 유지. 이번 확인 시 첫 schedule 이벤트는 아직 미관측이며 수동 성공 2건만 확인했다.
- 다음: 공급자 준비 후 위 Preview의 인증 환경 설정·재배포·실계정 로그인 및 운영자/카탈로그 검수. Production 승격은 별도다.

## 28. 인증 기반 설정 완료·저장 후 중단 (2026-10-06)

사용자가 진행 상황과 남은 작업 저장을 요청했다. 아래가 다음 세션의 재개 기준이다.

### 완료

- 고정 검수 주소: **https://sixtysix-v2-auth-preview.vercel.app**. 기존 Production 주소는 유지했다.
- 최신 Preview: `https://sixtysix-v2-9lfs95usx-dbwowls12345-3437s-projects.vercel.app`, 배포 `dpl_DnAJZUi6rqNX4F2ur2G2L6B1mFqK`, 재배포 READY 및 고정 alias 연결 완료.
- Vercel Preview에 `APP_ORIGIN`, `AUTH_CONTEXT_SECRET`, `AUTH_OTP_SECRET` 등록. 기존 `APP_DATABASE_URL` 유지. 두 비밀값은 각각 독립된 48바이트 난수로 생성했고 출력하지 않았다. 앱 환경에 owner/worker 자격 증명을 추가하지 않았다.
- 로컬 비밀 파일 `sixtysix-v2/.env.preview-auth`는 mode 600, Git ignore 및 Vercel 업로드 제외 검증 완료. 비밀값을 문서에 복사하거나 재생성하지 않는다.
- 원격 HTTP **22개 검사 통과**: 기존 공개 API/DB/자산/SPA + context 200/보안 쿠키, 계정·알림·관리자 비로그인 401, 카카오 미설정 503, Origin 누락·다른 출처 로그아웃 403, 정상 context의 익명 로그아웃 204. 실제 로그인·메일 발송·사용자 데이터 생성은 하지 않았다.
- 재검증 명령: `node backend/scripts/verify-preview-http.cjs https://sixtysix-v2-auth-preview.vercel.app --context-ready`. 아직 공급자 키가 없다는 전제의 검사이며, 공급자 연결 뒤 카카오 시작 기대값을 변경해야 한다.
- 새 비밀 파일 생성 후 업로드 목록 재검증: 실제 파일 128개, 비밀 파일 0개. worker는 활성화 유지하되 마지막 조회에서 schedule 이벤트는 미관측(수동 성공 2건)이다.

### 남은 작업 순서

1. **카카오 앱 준비/설정:** 개발자 콘솔의 앱과 REST API 키·활성화된 client secret이 필요하다. 사용자 계정에서 준비한 키는 Vercel `sixtysix-v2`의 **Preview** 환경에 `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`으로 등록한다. 채팅에 키를 받지 않는다.
2. 카카오 로그인 활성화 및 현재 코드가 요청하는 `profile_nickname` 동의항목 설정을 확인한다. 정확한 redirect URI는 `https://sixtysix-v2-auth-preview.vercel.app/v1/auth/kakao/callback`. 공식 [플랫폼 키·redirect 설정](https://developers.kakao.com/docs/ko/app-setting/app) 참고.
3. 공급자 키 등록 후 Preview 재배포 → 위 고정 alias를 새 배포로 연결 → 실제 브라우저 로그인/동의 취소/재시도/로그아웃/세션 복원 검수. Vercel 배포 보호는 유지하며 검수자가 접근할 수 있는지 확인한다. 현재 fake-provider 테스트 성공을 실계정 성공으로 간주하지 않는다.
4. 실계정 확보 후 명시적으로 검수할 계정을 지정해 운영자 권한·모집 개설/취소·참여/인증·앱 알림 흐름을 확인한다. 임의 계정 자동 승격이나 모집 seed를 넣지 않는다.
5. worker 예약 이벤트의 실제 실행/실패 여부를 다시 확인한다. 미실행이 지속되면 Actions 설정·schedule 지연을 점검한다.
6. 앱/API와 배포 보조 도구의 미커밋 변경을 검토하고 재현 가능한 소스 기준으로 정리한다. main push는 Vercel에 연결되므로 기존 worker 커밋 범위와 구분한다. 개발 의존성 audit 경고 5건은 별도 후속이다.

### 이메일 보류 결정

- 사용자 답변: **아직 도메인이 없음**. 도메인을 임의 구매하거나 다른 프로젝트 도메인을 사용하지 않는다.
- 추후 본인 소유 발송 도메인을 마련하고 Resend에서 DNS 검증 → 해당 도메인 발송용 키와 발신 주소를 Preview의 `RESEND_API_KEY`, `AUTH_EMAIL_FROM`에 등록 → 재배포 → 수신 실검수 순서다. [Resend 도메인 안내](https://resend.com/docs/dashboard/domains/introduction), [API 키 안내](https://resend.com/docs/dashboard/api-keys/introduction).
- 현재 이메일과 카카오 공급자 키 모두 미등록이다. 준비 완료는 인증 기반/검수 주소에 한정된다.

Git HEAD는 `d9a89fd`이며 이번 인증 설정/검증 도구/문서와 앱 변경은 로컬 미커밋 상태다. 이번 저장 요청으로 commit/push·Production 승격은 하지 않았다.

## 29. 소스 정리 커밋·배포 (2026-10-06)

사용자가 커밋·push·배포를 요청했다. 기존 앱/API·문서·검증 도구와 개발 보조 자산을 함께 소스 기준으로 남긴다. 로컬 비밀 파일과 생성 산출물은 Git/배포에서 제외한다.

- 로컬 검증: Vitest 268개·타입 검사·빌드·OpenAPI 21개, 모바일 69개 통과.
- main push는 연결된 Vercel 자동 배포를 유발할 수 있다. 별도 CLI 배포는 Preview 대상으로 실행하고 고정 인증 검수 alias에 연결한다.
- 공급자 키 설정·실계정 검수는 남아 있다. 이번 배포는 이를 완료한 것으로 간주하지 않는다.
- 앱·문서·도구 120개 파일을 `2b182de`로 커밋하고 main에 push했다.
- 첫 CLI Preview 빌드는 성공했다. Git 연동 빌드는 `.vercelignore`가 Git 이력을 제외한 뒤 ignoreCommand가 실행되어 실패했다. Git 이력이 없는 경우 정상 빌드(종료 코드 1)로 진행하도록 수정했다.
- 배포 설정 수정은 `70a7000`으로 main에 반영했다. 변경 없음·변경 있음·SHA 없음·Git 이력 없음·알 수 없는 SHA의 5개 분기 검증 통과.
- Git 연동 V1·V2 배포 성공. V2 Production `dpl_38qFYq4ttGhQZycrvCsRSJast6U9`는 READY이며 `https://sixtysix-v2.vercel.app`에 연결됐다. 공개 주소에서 `/home`·`/v1/health`는 200, `/v1/ready`·`/v1/auth/context`는 503이다. Production DB·인증 환경은 이번에 설정하지 않았으며 실제 계정 기능 검수는 Preview에서 진행한다.
- CLI Preview `dpl_DKKDkswVYFCvX1KjuzHn9kEnXcxU` 배포 성공. `https://sixtysix-v2-859a0u55j-dbwowls12345-3437s-projects.vercel.app`에 고정 alias `https://sixtysix-v2-auth-preview.vercel.app`를 연결했다.
- 커밋 대상 120개 파일에서 현재 로컬 비밀값 일치·비밀 파일 경로 발견 0건, CLI 업로드 128개 파일 검사 통과.
- 원격 빌드의 의존성 audit 보고는 7건(중간 3·높음 2·심각 2)으로 이전 5건 기록과 다르다. 이 보고는 개발 의존성 포함이며, 이번 배포에서 버전 변경은 하지 않았다. 원인·실행 의존성 영향 확인은 후속이다.

- 고정 Preview 원격 HTTP **22개 검사 통과**: DB·공개 API·인증 context·비로그인 차단·Origin 방어·자산·SPA. 공급자 실계정 로그인은 미검증이다.

## 30. 카카오 설정 착수·운영 점검 (2026-10-06)

- Vercel Preview의 카카오 키 2개는 아직 미등록이다. Chrome에 카카오 개발자 콘솔을 열었으나 계정 로그인 화면이므로 사용자 직접 로그인 대기 상태다. 비밀번호·인증번호는 채팅으로 받지 않는다.
- 카카오 공식 설정 문서: https://developers.kakao.com/docs/ko/kakaologin/prerequisite . REST API 키·활성 client secret, 로그인 활성화, `profile_nickname` 동의항목 및 28장의 redirect URI를 확인한다.
- worker 변수 `WORKER_SCHEDULE_ENABLED=true`. 실제 schedule 이벤트 [2026-10-06 07:09 KST](https://github.com/jaejinu/sixtysix/actions/runs/37380589888), [11:17 KST](https://github.com/jaejinu/sixtysix/actions/runs/37403430637) 모두 성공했다. 수동 실행만 확인했던 상태에서 갱신한다. 관측된 실행 간격은 5분과 다르므로 정시성이 필요한 운영 전 실행 지연을 따로 확인한다.
- V2 `npm audit` 7건 재확인: 개발·테스트 의존성인 Vite·Vitest 및 관련 패키지. `npm audit --omit=dev`는 0건이다. Vite/Vitest의 주요 버전 변경이 포함된 수정 제안이 있어 자동 강제 업데이트는 하지 않았다. 개발 도구 취약점 해소와 호환성 검증은 후속이다.
- 공급자 설정·실계정 로그인·운영자 지정·새 모집·Production 환경은 이번 점검에서 변경하지 않았다.

## 31. V1 기존 주소 404 복구 (2026-10-07)

- 사용자 신고 주소 `https://sixtysix-taupe.vercel.app/`에서 404를 재현했다. Vercel 상태 READY와 실제 사이트 정상 응답은 별개였다.
- 원인: 저장소 공통 `.vercelignore`의 `sixtysix/` 제외 규칙이 Git 연동 V1 배포 소스까지 제거했다. 두 앱 루트를 모두 보존하도록 수정했다. V1 앱 코드는 변경하지 않았다.
- `backend/scripts/verify-vercel-upload.cjs`는 두 앱의 업로드를 허용하고 V1 `index.html` 누락도 차단한다. 정상 목록 146개 파일 통과 및 V1 진입점 제거 시 거부 검증.
- 수정 커밋 `2ef770a` main push 완료. V1·V2 Git 연동 배포 모두 성공. V1 Production 직접 배포 `dpl_4ASDYuYjChLJPYNP85i8kwamhNZg`도 완료하고 기존 주소에 연결했다.
- 공개 주소의 HTML·CSS·JS·이미지 18개 HTTP 200 및 로컬 원본 바이트 일치 확인. 원격 Chromium 360/390/430px에서 온보딩 → 인증 작성 → 홈 확인 모두 통과, 페이지 오류 0개. 인증 검수는 격리 브라우저 localStorage 데모만 사용했다.
- 다음 배포에서는 READY 확인과 함께 실제 공개 주소의 HTML·자산·브라우저 동작까지 검증한다.

## 32. 카카오 앱·Preview 공급자 연결 (2026-10-07)

- 사용자 승인 운영자명 ‘재진’, 앱 ‘육십육’ ID `1600591` 생성 확인. 카카오 로그인 ON, OpenID Connect OFF.
- Preview 전용 REST API 키 `SIXTYSIX Preview`와 활성 Client Secret을 발급해 Vercel `sixtysix-v2`의 Preview Secret `KAKAO_CLIENT_ID`·`KAKAO_CLIENT_SECRET`에 등록했다. 실제 비밀값은 출력·문서·Git에 남기지 않았다.
- 로그인 redirect URI는 `https://sixtysix-v2-auth-preview.vercel.app/v1/auth/kakao/callback`이다.
- 계정 식별은 공급자 ID만 사용하므로 사용하지 않는 `profile_nickname` scope 요청을 제거했다. 닉네임·이메일 동의항목을 새로 활성화하지 않는다. 28·30장의 닉네임 설정 안내는 이 변경으로 대체한다.
- Vitest 268개·프런트/서버 타입 검사·빌드 통과. 원격 검증 도구에 `--kakao-ready` 추가: 임시 OAuth state 1개를 만들고 카카오 인가 redirect·콜백·PKCE·최소 scope를 확인한다. 실계정 로그인 성공과 구분한다.

### 공급자 연결 검증 결과

- 소스 `b9f801b` 커밋·main push 완료. Preview `dpl_FrPJ8iU84jY2fQfBXeGJE5VKf3M6` (`https://sixtysix-v2-j9s62q2w7-dbwowls12345-3437s-projects.vercel.app`) READY, 고정 `https://sixtysix-v2-auth-preview.vercel.app` 연결 완료.
- `--kakao-ready` 원격 검사 22개 통과. 카카오 인가 redirect가 503에서 302로 바뀌었고 정확한 콜백·PKCE·추가 scope 없음 확인.
- Chrome에서 카카오 ‘회원번호 제공’ 동의 화면 → 로그인 → ‘내 계정’·카카오 로그인 수단 표시 확인. 새로고침 후 세션 유지, 로그아웃 후 로그인 화면 복귀, 카카오 재로그인 성공까지 확인. 검수 사용자의 Preview 계정이 실제 생성되었다.
- 닉네임·이메일 추가 동의 없음, 운영자 자동 승격·모집 데이터 생성 없음. Production 카카오 키는 등록하지 않았다. 기존 V1 주소는 HTTP 200으로 재확인.
- 다음: 검수할 운영자 계정을 명시적으로 지정한 뒤 모집·참여·인증·알림 전체 흐름을 검수한다. Production DB·인증 구성 및 이메일은 별도 후속이다.

## 33. Preview 실계정 업무 흐름 검수 (2026-10-07)

사용자가 방금 로그인한 카카오 계정을 검수용 운영자로 지정하고 전체 흐름을 진행하도록 승인했다. 고정 Preview의 실제 Chrome 세션·배포 API·Neon DB로 검수했다. 앱 소스는 `b9f801b` 기반의 기존 Preview 배포이며 이번 작업은 Preview 데이터와 문서만 변경했다.

### 확인 결과

- `/v1/me`의 로그인 계정과 DB 카카오 identity를 대조한 뒤 해당 계정에만 admin 역할을 부여하고 감사 이벤트를 남겼다. `/admin/cohorts` 접근 성공.
- `[검수용] 15분 독서` 카탈로그와 `검수 취소 20261007`, `검수 시작 20261007` 모집을 UI에서 개설했다. 정원 2명·최소 1명·최초 시작일 10월 8일 오전 4시.
- 첫 모집 참여 확정·참여자 1명·다른 모집 참여 불가 표시 확인. 시작 전에는 인증 작성이 제공되지 않았다.
- 운영 취소 요청의 5분 인증 만료 차단 확인. 카카오 ‘다시 인증’은 비밀번호 입력 화면까지 확인했고 입력 이후는 검수하지 않았다. 앱 로그아웃→일반 카카오 재로그인으로 새 세션을 만든 뒤 기존 화면의 동일 요청 재시도가 성공했다. 취소 감사 이벤트는 1건이다.
- 취소 후 참여 슬롯 해제·공개 모집에서 취소 모집 제외·두 번째 모집 참여 성공. worker 수동 실행으로 취소 알림 1건 전달, 알림의 공개 모집 링크 확인.
- 검수 시작 모집의 시작 시각만 당일 오전 4시로 조정하고 감사 이벤트를 남겼다. worker 수동 실행에서 `due=1`, `started=1`, 알림 전달 1건. 시작 알림에서 본인의 실제 활동 화면으로 이동 성공.
- 1일차에 ‘나만 보기’ 인증 1건 저장. 새로고침 후 본문·공개 범위·인증 1회·채운 날 1일 유지, 같은 날 추가 인증/면제권 UI 없음.
- 검수 모집 날짜를 하루 더 앞당겨 2일차를 만들고 면제권 1회 저장. UI와 DB 모두 **인증 1회·면제권 1회·채운 날 2일·남은 면제권 2회** 확인. DB 일차별 기록은 정확히 2건이며 현재 참여 슬롯은 두 번째 모집 1건이다.
- worker를 다시 실행해 시작 0·추가 전달 0 확인. outbox 전달 완료 총 2건, ready/leased/deferred/failed 모두 0. 앱에서 시작·취소 알림 각각 1건 확인.

### 검수 데이터와 한계

- 시작 모집 ID: `cfeacf8c-fae7-4025-b667-ff4b2068fca6`, 활동 ID: `46607ded-7824-465d-9b35-9150a36685db`. 취소 모집 ID: `926d49f1-e286-4638-9d3b-a21f153fc022`.
- 검수 자료를 확인할 수 있도록 카탈로그·모집·기록·운영자 역할은 Preview에 보존했다. Production 데이터/권한은 변경하지 않았다.
- 날짜 변경은 이 검수 모집에 한정했고 `qa.fixture.start_shifted`, `qa.fixture.day_shifted` 감사 이벤트를 기록했다. 기존 인증의 생성 시각은 보존했기 때문에 날짜 이동 후 1일차가 ‘늦은 인증’으로 표시된다. 이는 합성 검수의 결과이며 실제 자정/오전 4시 경계나 지각 접수 제한을 통과한 증거가 아니다.
- 실제 예약 실행은 [10월 7일 09:12 KST](https://github.com/jaejinu/sixtysix/actions/runs/37550709160), [15:04 KST](https://github.com/jaejinu/sixtysix/actions/runs/37579585924) 성공을 추가 확인했다. cron 선언은 5분 간격이지만 최근 실행 간격은 수 시간이다. 위 업무 검수의 시작/알림은 로컬 worker 수동 실행 결과이며 예약 정시성 검증과 구분한다.
- 다음 우선순위는 예약 실행 지연 조사와 운영용 실행 경로 확정이다. 그다음 별도 Production DB·인증·카카오 콜백을 구성한다.
