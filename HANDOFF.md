# 인계 문서 — 육십육 (SIXTYSIX)

> 다른 세션에서 이어받을 때 **이 문서를 먼저 읽는다.**
> 최종 갱신: 2026-09-10 · 커밋 `3df3fda`

---

## 0. 30초 요약

| | |
|---|---|
| 무엇 | 같은 날 시작한 30명 코호트와 66일 습관을 인증·완주하는 모바일 웹 |
| 지금 단계 | 강의 `beginner-mvp-v2` **03단계 (Figma V1 이전) 완료** → 04단계 시작 |
| V1 | **동결됨** (`v1.1` 태그). 고치지 않는다 |
| V2 | Gate 1~3 완료 (도메인·시뮬레이터·Clock). React 아직 없음 |
| 다음 할 일 | **04단계 V2 Wireframe** (`v2/V2-SCOPE.md` 기준) |

**지금 당장 할 일은 6장에 있다.**

---

## 1. 링크

| | |
|---|---|
| 라이브 (V1.1) | https://sixtysix-taupe.vercel.app |
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
04. V2 Wireframe         ← 지금 여기. Gate 1~3 결과를 근거로 새 화면·상태 설계
05. Figma 디자인 고도화   직접 손으로 하는 구간
06. V2 디자인 최종 점검
07. V2 .md 업데이트
08. React·TypeScript 구현  ← 검증된 Domain+Simulator+Clock 을 화면에 연결
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
