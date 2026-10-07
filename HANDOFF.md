# 인계 문서 — 육십육 (SIXTYSIX)

## 재개 순서

1. [PROGRESS.md](PROGRESS.md) 0장에서 현재 상태와 이번 검증 범위를 읽습니다. 카카오 실계정 로그인 완료 결과와 최신 재개 지점은 32장에 있습니다. V1 주소 복구는 31장, 이메일 보류는 28장을 확인합니다.
2. [V2-SCOPE.md](v2/V2-SCOPE.md)에서 범위와 확정 정책을 확인합니다.
3. [V2 README](sixtysix-v2/README.md), [backend README](backend/README.md), [QA README](qa/README.md)에서 구조·실행 방법을 확인합니다.
4. 아래 작업 원칙을 지키고, PROGRESS의 미커밋 변경 분류를 참고해 작업 범위를 정합니다.

## 작업 원칙

- `sixtysix/`와 Figma의 V1 스냅샷은 동결된 비교 기준입니다.
- 사실을 저장하고 진행률·랭킹·배지는 파생합니다. 인증 수와 면제권을 포함한 채운 날 수를 구분합니다.
- 데모 localStorage와 실제 계정·DB는 분리합니다. 데모의 실제 시간 모드도 서버 계정과 별개입니다.
- 시뮬레이터의 고정 파라미터와 지표 정의를 보존합니다.
- 앱/검증 도구는 `2b182de`, 배포 설정 수정은 `70a7000`에 반영했습니다. 새 작업 전 Git 상태를 확인하고 `.env.preview-*`의 비밀값을 보존합니다. 배포 업로드는 `.vercelignore`와 업로드 검사 도구로 검증합니다.
- main push는 Vercel 배포에 연결됩니다. Preview 배포가 Git HEAD만으로 재현되는지 확인합니다.

## 이전 작업 기록

아래는 데모·디자인 단계의 작업 기록입니다. 당시의 테스트 수·다음 작업·폴더 구성은 현재 상태가 아닙니다. 현재 상태는 PROGRESS 0장, 기능 확장 이력은 10장 이후를 읽습니다.

### 코드 점검에서 발견한 후속 수정 항목

2026-09-30 전부 해결했다. 흐름 테스트 `src/ui/__tests__/appFlow.test.tsx` 가 각각을 붙잡고, 고친 곳을 하나씩 되돌리는 뮤테이션 8종이 모두 실패로 잡혔다.

| 우선순위 | 문제 | 근거 / 다음 검증 |
|---|---|---|
| ✅ | 인증 화면 습관명 고정 | `getHabitOf(내 멤버십)` 으로 읽는다. 날짜도 달력의 오늘이 아니라 **귀속 일차의 날짜**(`getDayDate`) |
| ✅ | 온보딩 시작 안내 불일치 | 안내 문구와 시작일이 같은 값 `joinDate`(`getJoinDate`) 에서 나온다. 04:00 전에 시작해도 1일차. 「처음부터 시작하기」도 시작일을 옮긴다 (기록만 비우면 D+23 휴면이었다) |
| ✅ | 실제 시간 자동 갱신 없음 | 실제 세계에서만 30초마다 · 탭이 다시 보일 때 now 를 다시 읽는다. 데모 시계는 그대로 |
| ✅ | Demo/Real 설정 복원 불완전 | 첫 실행과 세계 전환이 같은 `fromStored()` 를 탄다. 실제 세계로 넘어가 온보딩에 갇히지 않게 「데모 시간으로 돌아가기」 |
| ✅ | 인증 쓰기 방어 | 도메인 `getCheckinAvailability()` 가 before · ended · filled 를 판정하고, 화면·홈 버튼·쓰기 경로가 같은 값을 본다. 리듀서가 같은 날 두 번째 쓰기를 한 번 더 막는다(더블클릭). 한 줄 길이도 쓰기 경로에서 검사 |
| ✅ | 저장소 구조 검증 | `infrastructure/validate.ts` — 깨진 항목만 버리고 멀쩡한 사실은 살린다. 설정값(습관·시작일·공개 범위)도 형태를 확인한다 |
| ✅ | 불변식 파일 중복 | `invariants 2.ts` 삭제함 (2026-09-30). `c70ce4e` 에 동기화 충돌본이 실수로 커밋돼 있었다 |

### 디자인 정리 (2026-09-30)

V2 화면 6개의 글자 크기·여백·면 규칙을 하나로 맞췄다. 규칙은 `sixtysix-v2/src/ui/styles/components.css` 머리 주석에 있다.

| 규칙 | 내용 |
|---|---|
| 글자 크기 | 결정 7 의 단계만 쓴다. Page 30 › Section 24 › Card 20 › Body 16 › Label 14 › Meta 12. **12 미만 없음** (11·13·15·22px 를 전부 걷어냈다) |
| 숫자 | `<Num size="count">` 처럼 Display 단계 이름만 받는다. 임의 px 불가. 목록용 `list`(20) 를 추가했다 — V1 `.num--sm` 과 같은 값 |
| 제목 위계 | 헤더 제목이 20, 그 안 섹션 제목이 24 로 뒤집혀 있었다 → 헤더를 Page 30 으로. 인증 작성의 입력 이름표는 섹션 제목(24)이 아니라 `.field__label`(16) |
| 간격 | 블록 사이 24 · 블록 안 12 · 한 덩어리 안 4~8. 전부 16 이던 것을 나눴다. Hero + 행동 버튼은 `.stack`(12) 으로 묶는다 |
| 면 | 큰 면 여백 20 · 라운드 20 / 타일·목록 여백 16 · 라운드 16 / 입력·안내·행 라운드 12 |
| 굵기 | `<b>` 가 브라우저 기본 700 으로 새던 것을 SemiBold 로 막았다 |
| 줄바꿈 | `word-break: keep-all` — 「전 / 부 인증」처럼 낱말이 쪼개지던 것 |
| 하단 고정 UI | 탭바를 콘텐츠 좌우 끝에 맞췄다. 행동 바 배경을 화면과 같게, 비활성 버튼에 테두리. 안전 영역(`env(safe-area-inset-bottom)`) 반영 |

함정 — `.hero__metrics dd span` 처럼 `span` 을 잡는 선택자는 `Num`(역시 span) 까지 잡아 숫자가 14px 로 줄어든다. `span:not(.num)` 으로 쓴다.

당시 개발 순서: 남은 화면(졸업·탐색·인증 상세·챌린지 상세·공지) → V2 브라우저 QA → 정식 공개. 미리보기 배포 연결의 진행 상태는 `PROGRESS.md` 4장을 확인한다.
범위 결정은 `v2/V2-SCOPE.md`를 따른다.

---

## 0. 이전 진행 기록 요약 (현재 상태는 PROGRESS.md)

| | |
|---|---|
| 무엇 | 같은 날 시작한 30명 코호트와 66일 습관을 인증·완주하는 모바일 웹 |
| 지금 단계 | 강의 `beginner-mvp-v2` **08단계 (React 구현) 진행 중** |
| V1 | **동결됨** (`v1.1` 태그). 고치지 않는다 |
| V2 | Gate 1~3 + **React 홈·코호트 동작함**. 테스트 126개 |
| 다음 할 일 | 남은 화면 구현 (기록·인증 작성·마이·졸업·온보딩) → 09 QA·배포 |

**이하 단계·테스트 수·다음 할 일은 과거 기록이다. 현재 작업 목록은 `PROGRESS.md` 0장과 28장을 따른다.**

---

## 1. 링크

| | |
|---|---|
| 라이브 (V1.1) | https://sixtysix-taupe.vercel.app |
| 라이브 (V2 미리보기) | https://sixtysix-v2.vercel.app — Vercel `sixtysix-v2`, 루트 `sixtysix-v2/`. 상세는 `PROGRESS.md` 4장 |
| GitHub | https://github.com/jaejinu/sixtysix |
| Figma (V1 스냅샷) | https://www.figma.com/design/wXlbUU8EH8os9fgDA9omoB |
| Vercel 프로젝트 | `sixtysix` (배포 루트 `sixtysix/`, `main` 푸시 시 자동 배포) |

---

## 2. 폴더 구조

```
66/
├── HANDOFF.md          ← 이 문서
├── README.md           포트폴리오용 루트 README
│
├── sixtysix/           V1.1 — 배포 대상. **동결. 고치지 않는다**
│   ├── index.html · css/ · js/ · assets/images/ (webp 10장)
│   ├── sixtysix-design-rull.md    디자인 규정 1,600줄
│   └── sixtysix-project.md        화면상세 명세 2,040줄
│
├── qa/                 V1.1 Playwright 회귀 테스트 (210개)
│
├── sixtysix-v2/        V2 도메인. React·UI 없음
│   └── src/domain/ · src/simulator/ · src/infrastructure/   (121개 테스트)
│
└── v2/                 V2 기획 문서
    ├── V1-DIAGNOSIS.md      V1 자기 진단 (문제 8건 + 이후 발견 3건)
    ├── V2-SCOPE.md          ★ 결정 기록. 여기가 단일 기준
    ├── GATE1-DOMAIN.md      도메인 모델
    ├── GATE1-SELECTORS.md   파생 함수 목록 + 방화벽
    ├── FIGMA-V1-TRANSFER.md ★ 03단계 결과
    ├── V2-WIREFRAME.md      ★ 04단계 구조 결정서
    └── GPT-HANDOFF.md       ChatGPT 상의용 프롬프트
```

**`v2/V2-SCOPE.md` 가 모든 결정의 단일 기준이다.** 충돌하면 그 문서를 따른다.

---

## 3. 절대 어기면 안 되는 원칙 5개

### ① V1 은 동결됐다

`sixtysix/` 를 고치지 않는다. V1.1 은 고칠 대상이 아니라 **비교 기준점**이다.
Gate 1~3 에서 문제를 알아냈어도 V1 에 반영하지 않는다.

### ② Figma `01_V1_CURRENT` 도 박제다

Gate 1~3 결과를 여기 반영하지 않는다. 어색한 밀도와 구조도 그대로 둔다.

```
V1_CURRENT   = 실제 V1.1 이 무엇이었는가
V2_WIREFRAME = 그 문제를 이해한 뒤 무엇으로 바꿀 것인가
```

두 층이 분리돼야 포트폴리오에서 **"왜 바꿨는가"** 가 보인다.

### ③ 저장은 사실만, 판단과 요약은 파생

V1 정합성 버그 3건이 전부 *파생될 수 있는 값을 저장하고 서로 어긋난 것*이었다.
`total` 이라는 이름을 코드와 화면 어디에도 쓰지 않는다.

```
checkins  실제 인증 수    → 랭킹
filled    인증 + 면제권    → 66칸 진행판
passes    면제권 사용 수
```

### ④ 시뮬레이터 파라미터는 동결됐다

`sixtysix-v2/src/simulator/__tests__/frozen.test.ts` 가 지킨다.
"더 그럴듯한 숫자"를 만들려고 다시 만지지 않는다. 한 숫자라도 움직이면 테스트가 실패한다.

### ⑤ 지표 정의는 한 곳에만

`src/simulator/metrics.ts`. 복귀율을 두 곳에서 다르게 계산했다가
40% · 62% · 81.6% 세 숫자가 같은 이름으로 문서에 남은 적이 있다.

---

## 4. 지금까지 한 일

### V1 (완료 · 동결)

12화면 · 사용자 상태 6개 · 정책 10개. 프레임워크 없이 HTML·CSS·JS.
`v1.1` 태그에서 정합성 버그 3건을 고치고 동결했다.

| 고친 버그 | 내용 |
|---|---|
| 온보딩 습관·코호트 불일치 | 러닝을 골라도 `cohortId` 가 독서로 남아 있었다 |
| 코호트 참여가 상태를 안 바꿈 | Toast 만 띄우고 저장하지 않았다 |
| 랭킹 공정성 | 나만 면제권을 인증으로 세어 3위·4위가 뒤바뀌었다 |

**근본 원인**: 테스트 156건이 전부 "화면에 뭐가 보이는가"만 검사했다.
`qa/tests/state.spec.js` 로 저장 상태 정합성 층을 만들어 210건이 됐다.

### V2 Gate 1~3 (완료)

| Gate | 내용 | 통과 기준 |
|---|---|---|
| 1. Domain | 저장 사실 / 파생 경계, 불변식 16개 | Checkin 목록 하나로 모든 수치 계산 |
| 2. Simulator | 결정론 + 경로 의존, 원형 6종, 복귀 특화 momentum | 같은 seed = 같은 결과 |
| 3. Clock | RealClock / DemoClock, 시간대 명시, 세계 분리 | 도메인에 `new Date()` 0건 |

**121개 테스트 통과. Asia/Seoul · UTC · America/New_York · Pacific/Auckland 에서 동일.**

Gate 2 A/B 결과 (같은 seed, 계수만 `0 → 0.35`)

| 지표 | off | on |
|---|---:|---:|
| 3일 내 복귀율 | 81.6% | 86.9% |
| 휴면 경험 인원 | 9명 | 7명 |
| 평균 채운 날 | 39.5 | 41.3 |
| steady 원형 평균 | 57.6 | 57.6 |

**steady 가 안 움직이는 게 메커니즘이 깨끗하다는 증거다.**
이건 시뮬레이션 결과이지 가설 1을 검증한 데이터가 아니다.
포트폴리오에는 **"검증 가능한 프로토타입으로 전환했다"** 로 쓴다.

---

## 5. 실행 방법

```bash
# V1.1 로컬
cd sixtysix && python3 -m http.server 8900        # file:// 로 열면 안 됨

# V1.1 회귀 테스트 (210개, 360·390·430px)
cd qa && npm install && npx playwright install chromium && npm test

# V2 도메인 테스트 (121개)
cd sixtysix-v2 && npm install && npm test && npm run typecheck

# 배포 — main 에 푸시하면 자동. vercel --prod 는 쓰지 않는다
git push origin main
```

`sixtysix/` 안을 고쳐야 배포에 반영된다. `qa/` · `v2/` · `sixtysix-v2/` 는 배포되지 않는다.

---

## 6. 다음에 할 일 (04단계)

### 6.1 03단계는 끝났다

Figma `01_V1_CURRENT` 에 **12화면 + `HOME / States` 5종**이 모두 들어갔다.
프레임 목록·높이·차이는 `v2/FIGMA-V1-TRANSFER.md` 에 있다. 여기서 반복하지 않는다.

**여기서 확정된 것**

- 프레임 규칙: `NAME / Full Scroll 430×N` + `Viewport Guide 430×932`
  + 고정 요소는 **뷰포트 하단(y=837)** 에 두고 프레임 맨 아래로 보내지 않는다
- 높이는 필요한 만큼만. 932 안에 끝나면 늘리지 않는다(공지)
- 스크린샷이 아니라 오토레이아웃 프레임 + Text Layer 로 재구성
- 레이어 이름에 원래 컴포넌트명과 규격을 남긴다
  (`TodayHero 394×426`, `icon / fa-house`, `image / habit-reading.webp`)

**대체한 것**

| | |
|---|---|
| 폰트 | Pretendard 없음 → **Noto Sans KR** (400→Regular, 500→Medium, 600·700→Bold) |
| 아이콘 | Font Awesome 폰트 못 씀 → **실제 SVG 벡터 컴포넌트 25종** (`00_TOKENS`) |
| 이미지 | 실제 파일 10장 (PNG 로 변환해 업로드) |

폰트 대체 때문에 프레임 높이가 화면당 **2~3% 짧다.** 맞출 방법이 없다. 기록만 해 뒀다.

### 6.1-b 로고 (확정됨)

`brand/` 폴더와 Figma `02_BRAND` 페이지. **C안 「이어짐」** — 두 개의 6 이 맞물린 마크.

- 마크는 **두 벌**이다. 기본형(획 17)과 소형(획 22, ≤24px). 하나로 모든 크기를 감당하지 않는다.
- 앱 아이콘과 파비콘도 여백·획이 다르다. 브라우저 실측 결과 하나로는 16px 에서 뭉갰다.
- 워드마크 「육십육」 은 **아직 Noto Sans KR Bold 에 자간만 좁힌 상태**다.
  05단계에서 손으로 그린다. 방향은 정해져 있다 — 육십육의 이응 두 개와 마크의 볼 두 개를 같은 원으로.
- 규정·기하·적용 방법은 `brand/README.md` 에 있다. 여기서 반복하지 않는다.

**V1 에는 적용하지 않는다.** 동결 원칙 그대로다.

### 6.1-c 타이포그래피 (확정)

**Pretendard · 행간 140% · 자간 −3%** 가 V2 전체 기본값이다 (`v2/V2-SCOPE.md` 결정 7).

- **예외**: Anton(숫자)은 행간 **100%** 유지. 140% 를 주면 `D+23`(96px) 줄상자가 134px 이 되어 Hero 가 무너진다.
- 행간 1.2 → 1.4 로 **섹션 제목이 화면당 30~40px 늘어난다.** 04단계 와이어프레임은 이 값으로 그린다.
- Anton 자간 −3% 는 눈으로 확인한다. 글리프가 붙으면 디스플레이만 −2% 로 되돌린다.

> ⚠️ **Figma UI 에서는 Pretendard 가 정상 선택된다. 코드로만 안 된다.**
> 플러그인 실행 환경에 로컬 폰트가 하나도 없다(Apple SD Gothic Neo 조차).
> 그래서 **코드로 만든 텍스트는 전부 Noto Sans KR 로 떨어진다.**
>
> **해결**: `V2 / …` 텍스트 스타일 13종을 만들어 뒀다. 앞으로 생성하는 텍스트는 이 스타일을 쓴다.
> 사용자가 **스타일 9개의 폰트만** Pretendard 로 바꾸면 전부 따라온다 (Display 4종은 Anton, 변경 불필요).
> 굵기도 함께 지정해야 한다 — Noto 에 SemiBold 가 없어 Bold 로 대체돼 있다.
> 견본은 `02_BRAND` 페이지 `TYPE SCALE` 보드.

**적용 현황 (2026-09-10, 새 파일 `wwn6VrLIgZENhkjshPGjy6`)**

- `01_V1_CURRENT` 텍스트 109개 전부 행간 140% · 자간 −3% 로 맞췄다. Anton 29개만 예외대로 행간 100%.
- 폰트는 **아직 Noto Sans KR·Inter·Anton 그대로**다. MCP 로 `loadFontAsync({family:'Pretendard'})` 를 호출하면
  `The font "Pretendard Regular" could not be loaded. The font family "Pretendard" does not exist.` 가 난다.
  대체 폰트로 바꾸지 않았다. 데스크톱 앱이나 Font Helper 로 Pretendard 가 잡히면 패밀리만 바꾸면 된다.
- 앞으로 그리는 화면도 같은 값으로 시작한다. 한글 = Pretendard, 행간 140%, 자간 −3%, 숫자(Anton) 행간 100%.

### 6.1-d 04단계 구조 결정 (확인 대기)

전문 `v2/V2-WIREFRAME.md`. Figma `03_V2_WIREFRAME`.

**가장 큰 변경 — 하단 탭에 코호트를 넣는다.**

```
V1   홈 · 피드 · 기록 · 마이
V2   홈 · 코호트 · 기록 · 마이
```

V2 중심이 가설 1(코호트 소속감)인데 V1 탭에는 그 말이 없었다.
여기서 진단 두 건이 파생됐다 — 탐색 진입점 3곳(P3-H), 랭킹 화면 밀도(P3-G).
피드와 랭킹은 같은 대상(우리 30명)의 다른 뷰라 코호트 탭 세그먼트로 합쳤다.

- 홈 = **나의 오늘** / 코호트 = **우리 30명** 으로 역할을 나눈다
- 화면 12 → 11. 화면 수를 줄이는 게 목적이 아니라 겹치는 화면을 합친 것
- 신설 요소: `DemoClockBar` · `CohortToday(계산값)` · `CheerFeed` · `AvatarGrid 30칸` · `DeadlineBar` · 온보딩 `StartChoice`
- 모든 변경이 진단 항목(P1-A ~ P3-H)에 붙어 있다. 근거 없는 변경은 없다

**이 구조가 잠기기 전에는 08단계 React 를 시작하지 않는다.**

### 6.2 Figma 를 또 만질 때 — 검증된 방법과 함정

```bash
# 아이콘 — Font Awesome 실제 SVG
cd <scratch> && npm pack @fortawesome/fontawesome-free@6.5.2
tar -xzf fortawesome-fontawesome-free-6.5.2.tgz
# package/svgs/solid/<name>.svg 에서 viewBox 와 d 를 뽑는다
```

```js
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><path d="${d}"/></svg>`;
const node = figma.createNodeFromSvg(svg);
node.rescale(24 / Math.max(vw, vh));          // 24px 기준 정규화
const comp = figma.createComponentFromNode(node);
comp.name = `icon / fa-${name}`;
comp.fills = [];                              // ★ 안 비우면 흰 사각형이 찍힌다
```

`00_TOKENS` 에 **25개**가 있다. 부족하면 같은 방법으로 추가한다.
인스턴스 색은 내부 VECTOR 의 `fills` 를 바꾼다.

```
magnifying-glass · bullhorn · pen-to-square · chevron-right · chevron-left · circle-check
moon · align-left · rotate-right · circle-info · house · layer-group · calendar-check
user · heart · bookmark · seedling · fire · fire-flame-curved · flag-checkered
mountain-sun · trophy · ranking-star · award · clock · pause · shield-halved
```

이미지는 `upload_assets` 에 `nodeIds` 를 주면 기존 노드 fill 로 바로 들어간다.

> ⚠️ **WebP 로 올리면 안 된다.** Figma 가 `IMAGE` fill 로 받아들이고 업로드도 200 을 주지만
> **화면에는 회색으로 렌더된다.** 한 번 걸렸다.
> `sips -s format png in.webp --out out.png` 로 변환해서 올린다.

**함정 목록 (전부 실제로 밟았다)**

- `use_figma` 호출 전 `skill://figma/figma-use/SKILL.md` 를 반드시 읽는다.
- `figma.createAutoLayout()` 은 **기본 흰색 배경**이 있다. 컨테이너는 `fills = []` 로 비운다.
- `createComponentFromNode()` 도 **흰색 fill 이 남는다.** 아이콘 컴포넌트에 `fills = []`.
  원본 컴포넌트만 고치면 배치된 인스턴스가 전부 따라 고쳐진다.
- **`layoutSizingHorizontal = 'FILL'` 은 `appendChild` 뒤에만 된다.** 순서를 뒤집으면 throw.
- `nameRow.remove()` 는 **자식까지 같이 지운다.** 안에 있던 배지를 먼저 꺼내야 한다.
- 부모가 오토레이아웃이 아니면 `layoutPositioning = 'ABSOLUTE'` 가 실패한다. 그냥 `x`/`y`.
- 오토레이아웃 안에서 절대배치 요소의 좌표를 잡을 때는 **모든 자식을 넣은 뒤에** 계산한다.
  중간에 `it.y` 를 읽으면 이후 reflow 로 어긋난다(졸업 타임라인에서 100px 밀렸다).
- **`SectionHeader` 는 반드시 `layoutSizingHorizontal = 'FILL'` + `SPACE_BETWEEN`.**
- 정확한 값은 실행 중인 V1.1 에서 `getComputedStyle` 로 **실측**한다. 문서를 옮겨 적지 않는다.
- 만든 뒤 반드시 `get_screenshot` 으로 실제 화면과 대조한다.
  구조·순서·간격만 맞추고 **디자인은 개선하지 않는다.**

### 6.3 그다음 (04단계 이후)

```
03. Figma V1 이전        ✅ 완료
04. V2 Wireframe         ✅ 구조 결정서 + 저충실도 6화면
05. Figma 디자인 고도화   ✅ 홈·코호트 (나머지는 구현하며 확정)
06. V2 디자인 최종 점검   (09 전에)
07. V2 .md 업데이트       (09 전에)
08. React·TypeScript      ← 지금 여기. 검증된 Domain+Simulator+Clock 을 화면에 연결
09. 구현 QA와 V2 배포
```

**React 는 04단계가 잠긴 뒤에 시작한다.** 먼저 하면 V2 Wireframe 에서 구조가 바뀌어 두 번 이사한다.

04단계에서 등장할 새 화면·상태 (Gate 1~3 근거)

- 실제 시간 / 데모 시간 표시 (DemoClock 임을 화면에 밝혀야 함)
- 동적으로 변하는 코호트 현황 (V1 은 `18 + 내가 했나` 하드코딩)
- 내 인증이 섞인 피드 (V1 은 내 인증이 피드에 안 나타남)
- 30명 코호트 화면 (V1 은 8명)
- 복귀 상황

**03단계에서 넘어온 숙제 두 개** (`v2/V1-DIAGNOSIS.md` §3.5)

1. 사진 위 텍스트 대비 — Scrim 을 텍스트 블록 높이까지 올리거나 텍스트 영역을 별도 면으로 분리.
   `#F04E2C` 는 배경 대비 3.4:1 이라 원래 텍스트용이 아니다.
   **V2 는 이미지를 먼저 넣고 화면을 만든다.**
2. 파생 값 검사 층 — 인증 작성 카운터가 입력과 무관한 숫자를 보여줬는데
   테스트 210건이 못 잡았다. V2 검사 대상은 **표시 / 저장 상태 / 파생 값** 세 층.

---

## 7. V2 에서 결정된 것 (요약)

전문은 `v2/V2-SCOPE.md`.

| # | 결정 |
|---|---|
| 1 | V2 중심은 **가설 1(코호트 소속감)을 검증 가능한 프로토타입으로 만드는 것** |
| 2 | V1 은 버그 3건만 고치고 동결 |
| 3 | Gate 순서 Domain → Simulator → Clock. 앞이 통과해야 다음 |
| 4 | 최초 방문은 **DemoClock** 기본. Demo/Real 저장 영역 분리 |
| 5 | 성취 지표는 `stayedToEnd` / `filled66` / `perfect66`. `completed` 는 쓰지 않음 |
| 6 | `cohortMomentum` 은 **복귀 특화**. 연속 참여 중인 멤버에게는 적용 안 함 |

**아직 안 정한 것**

- 화면 12개를 유지할 것인가 (공지 흡수 검토, 랭킹·졸업은 삭제 아닌 역할 강화로 합의)
- 실제 사진 업로드를 넣을 것인가
- 탐색을 어디에 둘 것인가
- 66칸 상세 진입 방식 (11×6 유지 확정, 진행판↔날짜 목록 연동 우선 검토)

---

## 8. 알아두면 시간 아끼는 것들

- **ChatGPT 와 상의하는 흐름이다.** 강의 02단계가 "AI 가 대신 결정하게 하지 말라"고 명시한다.
  결정이 필요하면 `v2/GPT-HANDOFF.md` 형식으로 정리해 사용자가 ChatGPT 와 상의한다.
- **테스트가 통과했다고 믿지 않는다.** Gate 1 에서 32개가 첫 실행에 다 통과했을 때
  일부러 규칙을 깨뜨려(변이 테스트) 방화벽이 실제로 잡는지 확인했다. 같은 습관을 유지한다.
- **다른 에이전트의 코드 지적을 그대로 받지 않는다.** ChatGPT 가 지적한 버그 3건은
  전부 코드로 직접 확인한 뒤 고쳤다. 그중 하나는 지적보다 더 심각했다.
- **숫자를 지어내지 않는다.** V1 졸업 화면의 "22명 완주"는 근거 없이 적은 숫자였다.
  V2 에서는 시뮬레이터가 계산한 값을 쓴다.
- Vercel 공개 주소는 `sixtysix-taupe.vercel.app` 이다.
  `sixtysix.vercel.app` 은 **다른 사람 사이트**이고,
  `sixtysix-...-projects.vercel.app` 은 로그인을 요구한다.
