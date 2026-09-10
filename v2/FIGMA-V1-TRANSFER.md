# Figma V1 이전 (03단계)

> 강의 `beginner-mvp-v2.html` 03단계 「V1 디자인 Figma 이전」
> 파일: **[육십육 — V1 CURRENT (V1.1 스냅샷)](https://www.figma.com/design/wXlbUU8EH8os9fgDA9omoB)**
> 대상: V1.1 (`v1.1` 태그, https://sixtysix-taupe.vercel.app)

---

## 원칙 — 여기서는 아무것도 고치지 않는다

**`01_V1_CURRENT` 는 박제다.** Gate 1~3 에서 알아낸 것을 여기 반영하지 않는다.

| 알고 있지만 반영하지 않는 것 | 어디서 다룰 것인가 |
|---|---|
| 미래 데이터가 진행판에 새어 나왔다 | `02_V2_WIREFRAME` |
| 코호트가 실제로 30명 움직여야 한다 | `02_V2_WIREFRAME` |
| Demo / Real Clock 이 분리된다 | `02_V2_WIREFRAME` |
| 복귀 특화 cohortMomentum 이 존재한다 | `02_V2_WIREFRAME` |
| 내 인증이 피드에 없다 | `02_V2_WIREFRAME` |

두 층을 분리해야 포트폴리오에서 **"왜 바꿨는가"** 가 보인다.

```
V1_CURRENT     = 실제 V1.1 이 무엇이었는가
V2_WIREFRAME   = 그 문제를 이해한 뒤 무엇으로 바꿀 것인가
```

어색해 보이는 밀도와 구조도 그대로 보존한다. 그래야 V1 과 V2 를 정확히 비교할 수 있다.

---

## 파일 구성

| 페이지 | 내용 |
|---|---|
| `00_TOKENS` | V1.1 에서 실측한 색상 20개 · 치수 13개 변수 |
| `01_V1_CURRENT` | 화면 스냅샷 |

### 변수

실행 중인 V1.1 에서 `getComputedStyle` 로 뽑은 실측값이다. 문서를 옮겨 적은 것이 아니다.

```
V1 Color      bg/ · brand/ · accent/ · text/ · border/ · semantic/   20개
V1 Dimension  radius/ · space/ · size/                               13개
```

### 재현 방식

Screenshot 한 장을 넣지 않는다. 텍스트는 Text Layer 로, 카드·버튼·내비게이션은
오토레이아웃 프레임으로 다시 구성했다. 레이어 이름에 원래 컴포넌트명과 규격을 남긴다.

```
TodayHero  394×426
BottomNavigation  398×85  (fixed, 뷰포트 하단)
CheckinStoryCard / 도윤
icon / fa-magnifying-glass
image / hero-morning-desk.webp
```

---

## 대체한 것 두 가지

기록해 둔다. V2 에서 판단이 필요한 지점이다.

**1. 폰트** — Figma 에 Pretendard 가 없어 **Noto Sans KR** 로 대체했다.
V1 의 폰트 스택이 `"Pretendard", …, "Noto Sans KR", sans-serif` 이므로 실제 대체 폰트와 같다.
굵기는 400 → Regular, 500 → Medium, 600·700 → Bold 로 매핑했다.
Noto Sans KR 에 SemiBold(600) 가 없어 600 과 700 의 구분이 사라진다.

**2. 아이콘** — Font Awesome 글리프는 Figma 에서 폰트로 쓸 수 없다.
처음에는 `icon / fa-<name>` 자리표시 프레임으로 뒀다가, 실제 SVG 벡터 컴포넌트로 전부 교체했다(아래 참조).

**이미지 10장** 은 실제 파일을 올렸다. 다만 **WebP 는 Figma 가 `IMAGE` fill 로 받아들이지만 회색으로 렌더된다.**
`sips -s format png` 로 변환해 다시 올려야 한다. 이 함정에 한 번 걸렸다.

**아이콘**은 자리표시를 걷어내고 Font Awesome 6.5.2 의 실제 SVG 로 컴포넌트를 만들었다.
`npm pack @fortawesome/fontawesome-free` → `svgs/solid/*.svg` 에서 `viewBox` 와 `d` 를 뽑아
`figma.createNodeFromSvg()` 로 벡터를 만들고 24px 로 정규화한 뒤 컴포넌트화한다.
`00_TOKENS` 페이지에 **25개**가 있다.

> ⚠️ `createComponentFromNode()` 로 만든 컴포넌트는 **흰색 fill 이 남는다.**
> 베이지 배지 위에 놓으면 흰 사각형이 찍힌다. 컴포넌트에 `fills = []` 를 반드시 준다.
> 원본 컴포넌트만 고치면 배치된 인스턴스 전체가 함께 고쳐진다(로컬 override 가 없을 때).

---

## 프레임 구성 규칙 (확정)

**A. 전체 스크롤 + 뷰포트 가이드.** 화면을 두 벌 만들지 않는다.

```
HOME / Full Scroll  430×2245
├─ Viewport Guide / 430×932   기기 화면 경계. 잠금·숨김 가능한 별도 레이어
├─ AppHeader  (sticky top)
├─ main
│   └─ …
└─ BottomNavigation / fixed / viewport-bottom  398×85
```

**고정 요소는 프레임 맨 아래로 보내지 않는다.** 실제 동작 위치인 뷰포트 하단(y=837)에 두고
레이어 이름에 `fixed / viewport-bottom` 을 남긴다.

이래야 V2 와 비교할 때 다음을 바로 볼 수 있다.

- 첫 932px 안에 무엇이 보이는가
- 핵심 CTA 가 fold 안에 있는가
- 코호트 정보가 너무 아래로 밀렸는가
- 섹션 순서를 바꿔야 하는가

**높이는 필요한 만큼만 쓴다.** 무조건 늘리지 않는다.
콘텐츠가 932 안에 끝나는 화면(공지·온보딩·인증 작성)은 `430×932` 그대로 둔다.

## 진행 상황 — 완료 (2026-09-10)

| 화면 | 프레임 | 실제 높이 | 차이 |
|---|---|---|---|
| 홈 (오늘) — 연속 중 | `430×2245` | 2245 | — |
| 코호트 피드 | `430×3889` | 3889 | — |
| 기록 | `430×2526` | 2571 | −45 |
| 코호트 랭킹 | `430×1537` | 1579 | −42 |
| 마이 | `430×1633` | 1694 | −61 |
| 공지 | `430×932` | 600 | 뷰포트 유지 |
| 오늘 인증 작성 | `430×1104` | 1060 | +44 |
| 인증 상세 | `430×1080` | 1082 | −2 |
| 챌린지 탐색 | `430×2361` | 2381 | −20 |
| 챌린지 상세 | `430×1947` | 2006 | −59 |
| 졸업 | `430×1905` | 1985 | −80 |
| 온보딩 | `430×1195` | 1212 | −17 |

**높이 차이는 전부 폰트 대체 때문이다.** Pretendard → Noto Sans KR 로 바뀌면서
줄 높이가 화면당 2~3% 짧아진다. 구조·순서·간격은 동일하다.
맞출 방법이 없으므로 **차이를 기록해 두고 넘어간다.**

### 홈 상태 변형

`HOME / States` 라는 별도 프레임에 **5종**을 나열했다.
화면 전체를 5벌 복제하지 않고 **Hero + CTA + (끊김·휴면일 때) HelpQuickMenu** 만 잘랐다.

| 상태 | 이미지 | 배지 | CTA | HelpQuickMenu |
|---|---|---|---|---|
| 0일차 | `hero-morning-desk` | 오늘 시작 | 첫 인증 남기기 | — |
| 오늘 완료 | `hero-morning-desk` | 인증 완료 | 코호트 피드 보기 | — |
| 끊김 | `rest-window` | 어제 미인증 | 오늘 인증 남기기 | 면제권 쓰기 · 다시 시작하기 |
| 휴면 | `rest-window` | 휴면 | 복귀 인증하기 | 면제권 쓰기(불가) · 다시 시작하기 |
| 완주 | `graduation-66` | 완주 | 졸업 화면 보기 | — |

기본값 **연속 중**은 `HOME / Full Scroll` 프레임 자체이므로 여기 넣지 않았다.

### 이전 중 발견해 기록만 한 것

`v2/V1-DIAGNOSIS.md` §3.5 참조. **V1 에서 고치지 않는다.**

1. Hero Scrim 이 텍스트 블록 높이까지 올라오지 않아 사진 위 텍스트 대비가 부족하다
2. 인증 작성의 한 줄 카운터가 입력 0자·`maxlength 60` 인데 `40` 을 표시한다

---

## 검증 방법

각 화면을 만든 뒤 Figma 프레임 스크린샷과 브라우저 실제 화면을 나란히 비교한다.
구조·순서·간격이 다르면 고친다. **디자인을 개선하지 않는다.**
