# 육십육 습관 챌린지 모바일 웹 디자인 규정 v1.0

> 문서명: `sixtysix-design-rull.md`
> 작성일: 2026-09-08
> 상태: 구현 기준안
> 기준 화면: 430px 모바일
> 적용 대상: 모바일 웹, HTML/CSS/JavaScript 프론트엔드 구현
> 기준 문서: `beginner-design-rull.md`(WE:RUN 공통 디자인 규정)

## 0. 기준 자료와 문서 목적

### 0.1 기준 자료

- 공통 디자인 규정: `beginner-design-rull.md` (WE:RUN 모바일 웹 디자인 규정 v1.0)
- 화면상세 기준: `beginner-project.md` (PawMate 통합 명세 v1.0)
- 학생 기획: `sixtysix-plan.md` (육십육 기획 문서 v1.0)
- 실행 지시서: `beginner-student.md`

이 문서는 공통 디자인 규정의 레이아웃, 타이포그래피, 간격, 형태, 접근성과 QA 기준을 그대로 유지한 상태에서 **대표·액센트·배경 컬러 세 가지와 콘텐츠 컴포넌트의 이름·적용 예시만** 육십육 서비스에 맞게 바꾼 문서다.

### 0.2 자료 우선순위

값이나 표현이 충돌하면 다음 순서로 판단한다.

1. 접근성 및 실제 모바일 웹 동작
2. 사용자가 확정한 대표·액센트·배경 컬러
3. 공통 디자인 규정 `beginner-design-rull.md`의 토큰과 컴포넌트 계약
4. 이 문서에서 정의한 육십육 전용 컴포넌트 계약
5. 화면별 명시적 예외

### 0.3 문서의 목표

이 문서만으로 다음 작업을 수행할 수 있어야 한다.

- 육십육의 시각 언어 재현
- 430px 기준 모바일 웹 화면 구현
- 390px 및 360px 화면 대응
- 공통 컴포넌트 재사용
- 홈, 피드, 기록, 마이 및 상세·입력 화면 구성
- 온보딩, Modal, 인증 작성, 졸업 상태 구현
- 접근성, 반응형, 모션, 이미지 실패 및 데이터 상태 대응
- 시각·기능 회귀 테스트

### 0.4 공통 규정에서 유지한 것과 바꾼 것

| 구분 | 내용 |
|---|---|
| 그대로 유지 | 430px 앱 셸, 394px 콘텐츠 폭, 18px 좌우 여백, 48px 섹션 간격, 타입 스케일, 간격·라운드 토큰, 4탭 BottomNavigation, StickyActionBar, 44px 터치 영역, Modal·Empty·Loading·Error·Toast 원칙, 이미지·Overlay 원칙, Slider 규칙, 접근성, 구현 규칙, 금지 규칙, QA 체크리스트 |
| 바꾼 것 | 대표 컬러(라임 → 코랄), 액센트 컬러(오렌지 → 딥 그린), 배경 컬러(다크 → 웜 화이트)와 그에 따른 텍스트·Surface·Border 파생 토큰, 콘텐츠 카드 컴포넌트의 이름과 적용 예시 |
| 추가한 것 | 66칸 진행판 `ProgressGrid`, 카드뉴스형 콘텐츠 디자인 규칙(16장) |

---

## 1. 디자인 방향

### 1.1 핵심 인상

육십육은 다음 조합을 핵심 디자인 언어로 사용한다.

- 아침의 라이트 습관 커뮤니티 앱
- 코랄 레드를 사용한 강한 행동 유도와 진행 표현
- 실제 생활 맥락이 드러나는 자연광 사진
- Anton을 사용한 D+N, 스트릭, 66 카운트의 강한 숫자 표현
- Pretendard를 사용한 읽기 쉬운 한국어 정보 구조
- 둥근 Surface와 pill 형태의 행동 컨트롤
- 66칸이 코랄로 채워지는 진행판이 서비스의 키 비주얼

### 1.2 구현 원칙

- 절대좌표로 화면을 복사하지 않는다.
- 관련된 요소는 Flex, Grid로 구현한다.
- 공통 색상, 폰트, 간격, 라운드는 토큰으로 사용한다.
- 이미지 중심 화면에서도 제목, 메타 정보, 행동이 HTML 문서 구조에 남아 있어야 한다.
- 모든 화면에 같은 섹션을 강제하지 않는다.
- 같은 역할의 컴포넌트가 화면마다 다른 수치를 사용하지 않게 한다.
- 유사한 값은 이 문서의 정규화된 토큰으로 통합한다.

### 1.3 네이티브 UI와 모바일 웹의 구분

다음 요소는 웹 DOM으로 직접 그리지 않는다.

- iOS 상태바의 시간, 신호, Wi-Fi, 배터리
- iOS Home Indicator
- 운영체제 권한 팝업

모바일 웹에서는 브라우저와 기기가 표시하는 영역을 존중하고 `env(safe-area-inset-*)`로 안전영역을 처리한다.

---

## 2. 레이아웃 시스템

### 2.1 기준 폭

| 구간 | 화면 폭 | 좌우 여백 | 콘텐츠 폭 |
|---|---:|---:|---:|
| Minimum | 360–389px | 16px | `100% - 32px` |
| Compact | 390–399px | 18px | `100% - 36px` |
| Reference | 400–430px | 18px | `100% - 36px` |
| Wide | 431px 이상 | 중앙 430px 셸 | 최대 394px |

- 기준 화면은 `430px`이다.
- 430px에서 기본 콘텐츠 폭은 `394px`이다.
- 앱 셸은 430px를 초과하지 않고 큰 화면에서 중앙 정렬한다.
- 피드 인증 이미지, 66칸 진행판, 저장 인증 Grid처럼 명시된 컴포넌트만 430px 전체 폭을 사용할 수 있다.
- 본문에서 의도하지 않은 수평 스크롤이 발생하면 안 된다.

### 2.2 페이지 셸

```css
.app-shell {
  width: 100%;
  max-width: 430px;
  min-height: 100dvh;
  margin-inline: auto;
  color: var(--color-text-primary);
  background: var(--color-bg-app);
  overflow-x: clip;
}

.content-container {
  width: 100%;
  padding-inline: var(--space-page-x);
}

@media (max-width: 389px) {
  :root { --space-page-x: 16px; }
}

@media (min-width: 390px) {
  :root { --space-page-x: 18px; }
}
```

### 2.3 세로 구조

- Header 아래 첫 콘텐츠 간격: 27–31px을 화면 성격에 맞춰 사용한다.
- 홈의 주요 섹션 간격: `48px`
- 섹션 헤더와 콘텐츠 간격: `15px`
- 카드 Slider 기본 간격: `12px`
- 세로 리스트 기본 간격: `10–12px`
- 제목과 설명 간격: `7–8px`
- 설명과 CTA 간격: `16px`
- 하단 고정 UI가 있으면 본문에 해당 높이와 safe area만큼 패딩을 추가한다.

### 2.4 기본 섹션 구조

```text
Section
├─ SectionHeader (제목 + 선택적 전체 보기)
├─ 15px 간격
└─ Content (Slider · List · Grid · Card)
```

- 섹션 사이 간격은 48px을 기본으로 한다.
- 섹션 하나에 서로 다른 카드 유형을 섞지 않는다.
- 콘텐츠가 하나뿐인 섹션에는 Slider를 쓰지 않는다.

---

## 3. 컬러 토큰

사용자가 확정한 세 가지 색상은 다음과 같다. 이 세 가지 외에 새로운 유채색을 추가하지 않는다.

| 역할 | 값 | 이름 |
|---|---|---|
| 대표 컬러 | `#F04E2C` | 코랄 레드 |
| 액센트 컬러 | `#1F6F5F` | 딥 그린 |
| 배경 컬러 | `#FBF8F2` | 웜 화이트 |

```css
:root {
  /* App background — 사용자 확정 배경 컬러 */
  --color-bg-app: #fbf8f2;
  --color-bg-app-deep: #f3efe7;
  --color-bg-surface: #ffffff;
  --color-bg-surface-strong: #ffffff;
  --color-bg-surface-subtle: #f1eee8;
  --color-bg-overlay: rgba(0, 0, 0, 0.42);
  --color-bg-floating: rgba(26, 26, 26, 0.88);

  /* Focus theme — 인증 작성 화면 */
  --color-bg-focus: #ffffff;
  --color-text-focus: #1a1a1a;

  /* Brand — 사용자 확정 대표 컬러와 명도 변형 */
  --color-brand-primary: #f04e2c;
  --color-brand-pressed: #c63a1e;
  --color-brand-text: #c63a1e;
  --color-brand-foreground: #1a1a1a;
  --color-brand-soft: #fdeee9;

  /* Accent — 사용자 확정 액센트 컬러 */
  --color-accent: #1f6f5f;
  --color-accent-pressed: #185446;
  --color-accent-soft: #e8f0ee;

  /* Text */
  --color-text-primary: #1a1a1a;
  --color-text-secondary: #4a4a4a;
  --color-text-muted: #6e6e6e;
  --color-text-disabled: #9a9a9a;
  --color-text-white: #ffffff;
  --color-text-on-brand: #1a1a1a;
  --color-text-on-accent: #ffffff;

  /* Border */
  --color-border-default: #e4e0d8;
  --color-border-strong: #cfcabf;
  --color-border-subtle: rgba(26, 26, 26, 0.08);
  --color-border-inverse: rgba(255, 255, 255, 0.24);

  /* Semantic */
  --color-success: #1f6f5f;
  --color-warning: #ffcc00;
  --color-danger: #b3261e;
  --color-info: #4a4a4a;

  /* Focus */
  --color-focus-ring: #c63a1e;
}
```

### 3.1 파생 값의 근거

`--color-brand-pressed`, `--color-brand-text`, `--color-accent-pressed`는 새로운 색이 아니라 **사용자가 선택한 대표·액센트 컬러의 명도 변형**이다. 공통 규정이 라임에 Primary와 Pressed 두 값을 두는 방식과 같다.

`--color-brand-soft`와 `--color-accent-soft`는 대표·액센트 컬러를 배경 컬러에 섞어 만든 저채도 면이며, 배지 배경과 선택 상태 배경에만 쓴다. 파스텔 계열을 새로 만든 값이 아니다.

`--color-bg-surface-subtle`, `--color-border-default`, `--color-border-strong`은 유채색이 아닌 **밝은 그레이 계열**이며 카드 구분, 비활성 상태, 섹션 구분에만 사용한다.

### 3.2 대비 검증 결과

| 조합 | 대비 | 판정 | 허용 용도 |
|---|---:|---|---|
| `#1A1A1A` / `#FBF8F2` | 16.4:1 | 통과 | 본문, 제목 |
| `#4A4A4A` / `#FBF8F2` | 8.4:1 | 통과 | 보조 텍스트 |
| `#6E6E6E` / `#FBF8F2` | 4.8:1 | 통과 | 메타 정보 최소값 |
| `#1A1A1A` / `#F04E2C` | 4.8:1 | 통과 | Primary 버튼 텍스트 |
| `#C63A1E` / `#FBF8F2` | 4.6:1 | 통과 | 대표 컬러 텍스트, 링크 |
| `#FFFFFF` / `#1F6F5F` | 6.0:1 | 통과 | 액센트 버튼 텍스트 |
| `#1F6F5F` / `#FBF8F2` | 5.7:1 | 통과 | 완료 상태 텍스트 |
| `#FFFFFF` / `#B3261E` | 6.1:1 | 통과 | 오류 버튼 텍스트 |
| `#FFFFFF` / `#F04E2C` | 3.6:1 | **미달** | 16px 텍스트에 사용 금지 |
| `#F04E2C` / `#FBF8F2` | 3.4:1 | **미달** | 텍스트 금지, 테두리·아이콘·큰 숫자만 |
| `#FFCC00` / `#FBF8F2` | 1.4:1 | **미달** | 텍스트·아이콘 색 금지, 배지 배경만 |

### 3.3 컬러 사용 규칙

- Primary CTA와 선택 상태는 `--color-brand-primary`를 사용한다.
- 대표 컬러 배경 위 텍스트는 `--color-text-on-brand`(`#1A1A1A`)를 사용한다. 흰 텍스트를 쓰지 않는다.
- 대표 컬러를 **텍스트 색으로 쓸 때는** `--color-brand-text`(`#C63A1E`)를 사용한다.
- 액센트 컬러는 **인증 완료, 복귀, 성공 상태**에만 사용한다. 장식이나 일반 강조에 쓰지 않는다.
- 본문 배경은 `--color-bg-app`, 카드 기본 배경은 `--color-bg-surface`(흰색)다.
- 섹션 구분과 비활성 면은 `--color-bg-surface-subtle`을 사용한다.
- 투명도는 색상값을 새로 만들지 않고 기존 Semantic Color에 opacity를 적용한다.
- 상태를 색상 하나만으로 구분하지 않는다. 라벨, 아이콘 또는 텍스트를 함께 사용한다.
- 경고 `#FFCC00`은 배지 배경으로만 쓰고 그 위에는 `#1A1A1A` 텍스트를 얹는다.
- 오류는 `#B3261E`를 쓰고 대표 컬러와 혼동되지 않도록 반드시 아이콘과 문구를 함께 제공한다.

### 3.4 금지 색상

- 민트, 연두, 연분홍, 연보라, 하늘색, 연노랑, 피치 등 파스텔 계열을 카드 배경, 섹션 배경, 배지, 장식 요소에 사용하지 않는다.
- 대표·액센트 컬러 외의 유채색을 새로 만들지 않는다.
- 밝은 보조 면이 필요하면 `--color-bg-surface-subtle` 또는 `--color-border-default` 계열만 사용한다.

---

## 4. 타이포그래피

### 4.1 글꼴

```css
:root {
  --font-family-ui: "Pretendard", -apple-system, BlinkMacSystemFont,
    "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  --font-family-display: "Anton", "Arial Narrow", sans-serif;

  --font-weight-light: 300;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
}
```

- 기본 UI와 한글 본문은 Pretendard를 사용한다.
- **D+N, 스트릭 일수, 66 카운트, 총 인증 수, 남은 일수**는 Anton을 사용한다. 공통 규정 4.1의 "D-Day와 Countdown은 Anton"을 육십육의 진행 숫자에 그대로 적용한 것이며 규정 변경이 아니다.
- Anton을 일반 본문이나 버튼에 사용하지 않는다.
- Anton 숫자는 단위와 분리하고 단위는 Pretendard로 표현한다.

### 4.2 타입 스케일

```css
:root {
  --font-size-display-hero: 96px;
  --font-size-display-count: 64px;
  --font-size-display-stat: 36px;
  --font-size-page-title: 30px;
  --font-size-section-title: 24px;
  --font-size-stat: 26px;
  --font-size-card-title: 20px;
  --font-size-body: 16px;
  --font-size-label: 14px;
  --font-size-meta: 12px;

  --line-height-display: 1;
  --line-height-heading: 1.2;
  --line-height-default: 1.3;
  --line-height-body: 1.45;

  --letter-spacing-heading: -0.02em;
  --letter-spacing-default: -0.03em;
  --letter-spacing-display: -0.02em;
}
```

| 역할 | 글꼴 | 크기/두께 | 행간 | 자간 |
|---|---|---:|---:|---:|
| 인증 작성 화면 D+N | Anton | 96px/Regular | 1 | -0.02em |
| 홈 히어로 D+N·졸업 66 | Anton | 64px/Regular | 1 | -0.02em |
| 기록 대표 수치 | Anton | 36px/Regular | 1 | -0.02em |
| 상세 Hero 제목 | Pretendard | 30px/600 | 1.2 | -0.02em |
| 섹션·화면 제목 | Pretendard | 24px/600 | 1.3 | -0.02em |
| 강조 통계(스트릭·총 인증) | Anton | 26px/Regular | 1–1.3 | -0.02em |
| 카드 제목 | Pretendard | 20px/500–600 | 1.3 | -0.03em |
| 기본 본문·CTA | Pretendard | 16px/400–600 | 1.3–1.45 | -0.03em |
| 라벨·보조 정보 | Pretendard | 14px/400–600 | 1.3 | -0.03em |
| 메타 정보 | Pretendard | 12px/400–500 | 1.3 | -0.03em |

### 4.3 금지 및 보정 규칙

- 10px와 11px 텍스트는 사용하지 않고 최소 12px로 보정한다.
- 한 컴포넌트 안에서 같은 역할의 메타 글자 크기를 혼용하지 않는다.
- 긴 제목 때문에 글자 크기를 줄이지 않는다. 줄 수와 콘텐츠 길이를 제한한다.
- 인증 일수, 스트릭, 남은 면제권, 시작일처럼 중요한 숫자는 말줄임 처리하지 않는다.

---

## 5. 간격, 라운드, 아이콘, 모션

### 5.1 간격 토큰

```css
:root {
  --space-0: 0;
  --space-1: 2px;
  --space-2: 4px;
  --space-3: 6px;
  --space-4: 8px;
  --space-5: 10px;
  --space-6: 12px;
  --space-7: 14px;
  --space-8: 16px;
  --space-9: 18px;
  --space-10: 20px;
  --space-12: 24px;
  --space-16: 32px;
  --space-24: 48px;

  --space-page-x: 18px;
  --space-section-y: 48px;
  --space-slider-gap: 12px;
}
```

### 5.2 라운드 토큰

```css
:root {
  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-card: 16px;
  --radius-media: 20px;
  --radius-modal: 24px;
  --radius-control: 50px;
  --radius-pill: 999px;
}
```

- 일반 카드: 16px
- 사진 중심 카드: 20px
- 보조 Surface, 규칙 카드: 12px
- 66칸 진행판 타일: 4px
- Modal: 24px
- CTA, Chip, Floating Navigation: pill 형태
- 유사한 라운드를 카드마다 새로 만들지 않는다.

### 5.3 아이콘

- 기본 아이콘 시각 크기: 24px
- BottomNavigation 아이콘: 약 24×24px
- 작은 카드 아이콘: 12–16px
- 아이콘 버튼 터치 영역: 최소 44×44px
- 프로젝트 전체의 기능 아이콘은 **Font Awesome**으로 통일한다.
- CSS 도형, 이모지, 텍스트 특수문자 또는 임의로 직접 제작한 SVG를 기능 아이콘으로 사용하지 않는다.
- 같은 기능에는 항상 같은 Font Awesome 아이콘을 사용한다.
- 서비스 로고와 66칸 진행판의 데이터 시각화는 고유 그래픽으로 SVG 또는 CSS Grid를 사용할 수 있다.
- 아이콘만 있는 버튼은 한국어 `aria-label`을 제공한다.

#### 기능별 고정 아이콘

| 기능 | Font Awesome |
|---|---|
| 홈 | `fa-house` |
| 피드 | `fa-layer-group` |
| 기록 | `fa-calendar-check` |
| 마이 | `fa-user` |
| 인증 남기기 | `fa-pen-to-square` |
| 사진 선택 | `fa-image` |
| 응원 | `fa-heart` |
| 저장 | `fa-bookmark` |
| 신고 | `fa-flag` |
| 공유 | `fa-share-nodes` |
| 뒤로 가기 | `fa-chevron-left` |
| 더보기·전체 보기 | `fa-chevron-right` |
| 탐색·검색 | `fa-magnifying-glass` |
| 공지 | `fa-bullhorn` |
| 랭킹 | `fa-ranking-star` |
| 배지 | `fa-award` |
| 면제권 | `fa-shield-halved` |
| 스트릭 | `fa-fire` |
| 완주·졸업 | `fa-trophy` |
| 설정 | `fa-gear` |
| 알림 시간 | `fa-clock` |
| 공개 범위 | `fa-lock` / `fa-lock-open` |
| 늦은 인증 | `fa-moon` |
| 간단 인증 | `fa-align-left` |
| 복귀 | `fa-rotate-right` |
| 휴면 | `fa-pause` |
| 닫기 | `fa-xmark` |
| 오류 | `fa-circle-exclamation` |
| 완료 | `fa-circle-check` |

### 5.4 모션

```css
:root {
  --duration-fast: 120ms;
  --duration-base: 220ms;
  --duration-slow: 360ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
```

- 눌림: 120ms
- 선택·Toggle 전환: 220ms
- Modal·화면 전환: 220–360ms
- 66칸 진행판 채움 전환: 220ms
- `prefers-reduced-motion: reduce`에서는 자동재생과 큰 이동을 제거한다.

---

## 6. 공통 내비게이션 컴포넌트

### 6.1 AppHeader

| 속성 | 값 |
|---|---:|
| 전체 폭 | 430px |
| 높이 | 46px |
| 패딩 | 10px 18px |
| 로고 | 약 72×22px |
| 우측 아이콘 | 24px |
| 아이콘 간격 | 18px |

- 좌측에는 육십육 텍스트 로고를 둔다.
- 우측에는 현재 화면에 필요한 아이콘을 최대 2개 배치한다.
- 홈 Header 우측은 `fa-magnifying-glass`(챌린지 탐색)와 `fa-bullhorn`(공지)를 고정으로 둔다.
- 아이콘의 실제 버튼 영역은 44×44px 이상으로 확장한다.
- 로고는 `--color-brand-primary`를 사용한다.
- Header가 고정이면 콘텐츠 시작 위치에 Header 높이를 반영한다.

### 6.2 DetailHeader

| 속성 | 값 |
|---|---:|
| 콘텐츠 폭 | 394px |
| 시각 높이 | 32px |
| 실제 높이 | 최소 52px |
| 좌우 위치 | 18px |
| 제목 | 24px/600 |
| 아이콘 | 24px |

- 좌측은 뒤로 가기, 우측은 공유 또는 화면별 행동이다.
- 제목은 가운데 정렬하며 한 줄을 유지한다.
- 제목이 길면 아이콘 영역을 침범하지 않는 최대 폭을 설정한다.
- 챌린지 상세, 인증 작성, 인증 상세, 랭킹, 공지, 졸업 화면에서 사용한다.

### 6.3 SectionHeader

| 속성 | 값 |
|---|---:|
| 폭 | 394px |
| 높이 | 약 30px |
| 제목 | 24px/600 |
| 전체 보기 | 14px/400 |

- 제목은 좌측, 전체 보기는 우측에 배치한다.
- 전체 보기는 텍스트와 `fa-chevron-right`를 함께 사용한다.
- 전체 보기 터치 영역은 최소 44px 높이로 확장한다.
- SectionHeader와 콘텐츠 사이는 15px을 기본으로 한다.

### 6.4 BottomNavigation

| 속성 | 값 |
|---|---:|
| 폭 | 398px |
| 높이 | 85px |
| 좌우 여백 | 16px |
| 내부 패딩 | 16px |
| 라운드 | pill |
| 탭 수 | 4개 |

- 탭: 홈, 피드, 기록, 마이 (공통 규정 6.4의 기본 4탭을 예외 없이 사용한다)
- 아이콘과 라벨을 세로로 배치한다.
- 라벨은 12px, 활성 탭은 600, 비활성 탭은 500을 사용한다.
- 활성 탭은 `--color-brand-primary`, 비활성 탭은 `--color-text-white` 또는 Muted를 사용한다.
- 현재 경로에 해당하는 탭만 활성화한다.
- `position: fixed`로 앱 셸 하단에 배치한다.
- 하단 safe area를 포함한다.
- 본문에 Navigation 높이와 safe area만큼 하단 패딩을 제공한다.

```css
.bottom-nav {
  position: fixed;
  left: 50%;
  bottom: calc(10px + env(safe-area-inset-bottom));
  width: min(calc(100% - 32px), 398px);
  min-height: 85px;
  transform: translateX(-50%);
  border-radius: var(--radius-pill);
  background: var(--color-bg-floating);
}
```

#### 4탭 구조에서 탐색 화면의 진입 경로

챌린지 탐색은 하단 탭을 갖지 않는다. 대신 다음 세 경로를 항상 제공한다.

1. 홈 AppHeader 우측 `fa-magnifying-glass`
2. 홈 `추천 습관` 섹션 헤더의 `전체 보기`
3. 졸업 화면의 `다음 코호트 찾기` CTA

---

## 7. 버튼, Chip, Toggle

### 7.1 Button Variant

| Variant | 기본 크기 | 스타일 | 용도 |
|---|---:|---|---|
| Primary | 394×48px | 코랄 배경, `#1A1A1A` 텍스트 | 핵심 CTA |
| Accent | 높이 48px | 딥 그린 배경, 흰색 텍스트 | 인증 완료·복귀 확정 |
| Secondary | 높이 48px | Surface 배경, 테두리 | 보조 행동 |
| Outline | 높이 33–44px | 코랄 테두리, `#C63A1E` 텍스트 | 응원, 선택 보조 |
| Compact | 높이 34px | 코랄 또는 Surface | 카드 내부 행동 |
| Text | 최소 44px 터치영역 | 배경 없음 | 더보기, 취소 |
| Icon | 44×44px 이상 | 배경 선택 | 탐색, 공지, 공유 |
| Danger | 높이 44–48px | `#B3261E` 배경, 흰색 텍스트 | 신고 확정 |

### 7.2 Primary Button

- 기본 폭: 콘텐츠 폭 100%
- 높이: 48px
- 배경: `--color-brand-primary`
- 텍스트: 16px/600, `--color-text-on-brand`
- 라운드: 50px
- 버튼 문구는 동사 중심의 한 줄로 작성한다.
- 아이콘이 있으면 텍스트와 간격 8px을 사용한다.

### 7.3 Compact Button

| 이름 | 크기 | 구현 규칙 |
|---|---:|---|
| 응원 보내기 | 94×33px | 코랄 Outline, 16px/600, pill |
| 참여하기 | 96×34px | 코랄, 16px/600, radius 12px |
| 예약하기 | 152×34px | 코랄, 16px/600 |

- 시각 높이가 44px보다 작으면 투명한 hit area를 확장한다.
- 카드 내부 행동은 카드 전체 링크와 중복하지 않는다.

### 7.4 StickyActionBar

- 화면 하단 전체 폭을 사용한다.
- 높이: 88–93px
- 배경: `--color-bg-app-deep`
- 상단 테두리: `--color-border-default` 1px
- 좌우 패딩: 18px
- 상단 패딩: 14px
- 하단 패딩: `20px + safe-area` 이상
- 단일 CTA는 남은 폭을 사용한다.
- 이중 CTA는 동일 폭으로 배치한다.
- BottomNavigation과 동시에 표시하지 않는다.

### 7.5 FilterChip

- 높이: 34px
- 패딩: 8px 14px
- 간격: 6px
- 글자: 14px/500
- 라운드: pill
- 선택: 코랄 배경 + `#1A1A1A` 텍스트
- 미선택: `--color-bg-surface` 배경 + `--color-border-default` 테두리
- 여러 개일 경우 텍스트 길이에 맞춰 폭을 결정한다.
- 카테고리가 많으면 가로 스크롤을 사용한다.

### 7.6 Badge와 Status Pill

- 높이: 20–31px
- 글자: 12–14px
- 좌우 패딩: 7–14px
- 배경과 텍스트를 함께 사용해 상태를 표현한다.
- 아이콘을 반드시 함께 사용해 색상만으로 상태를 전달하지 않는다.

#### 육십육 상태 배지 정의

| 상태 | 배경 | 텍스트 | 아이콘 | 라벨 |
|---|---|---|---|---|
| 인증 완료 | `--color-accent-soft` | `--color-accent` | `fa-circle-check` | 인증 완료 |
| 늦은 인증 | `--color-bg-surface-subtle` | `--color-text-secondary` | `fa-moon` | 늦은 인증 |
| 간단 인증 | `--color-bg-surface-subtle` | `--color-text-secondary` | `fa-align-left` | 간단 인증 |
| 비공개 | `--color-bg-surface-subtle` | `--color-text-secondary` | `fa-lock` | 나만 보기 |
| 복귀 | `--color-brand-soft` | `--color-brand-text` | `fa-rotate-right` | 복귀 |
| 휴면 | `--color-bg-surface-subtle` | `--color-text-muted` | `fa-pause` | 휴면 |
| 면제권 사용 | `--color-warning` | `#1A1A1A` | `fa-shield-halved` | 면제권 |
| D+N | `--color-brand-primary` | `#1A1A1A` | 없음 | D+23 |

- `D+23`, `면제권 2회 남음`, `30명 중 18명`처럼 실제 의미가 있는 숫자와 상태만 사용한다.
- 장식용 순번은 사용하지 않는다.

### 7.7 Toggle

| 속성 | 값 |
|---|---:|
| 크기 | 44×26px |
| Knob | 20×20px |
| 내부 여백 | 3px |
| 라운드 | 13px |

- On: 코랄 배경, Knob 우측
- Off: `--color-border-strong` 배경, Knob 좌측
- `button`과 `role="switch"`를 사용한다.
- `aria-checked`를 실제 상태와 동기화한다.
- 라벨 전체를 눌러도 Toggle이 동작하게 한다.

### 7.8 Button State

```text
default → pressed → focus
        ↘ disabled
        ↘ loading → success | error
```

- 모바일에서 hover를 핵심 피드백으로 사용하지 않는다.
- Pressed 상태는 `--color-brand-pressed`로 배경을 바꾸거나 scale을 미세하게 변경한다.
- Focus Ring은 2px 이상이며 `--color-focus-ring`을 사용한다.
- Loading 상태에서 버튼 폭이 바뀌지 않게 한다.
- Disabled는 시각 상태와 실제 상호작용을 함께 차단한다.

---

## 8. 콘텐츠 카드 컴포넌트

공통 규정의 WE:RUN 카드를 육십육의 콘텐츠 역할로 재해석했다. 기하 구조와 수치는 원본 계약을 유지하고 이름과 내용만 바꿨다.

| 공통 규정 컴포넌트 | 육십육 컴포넌트 | 재해석 내용 |
|---|---|---|
| `ActivityHero` | `TodayHero` | 러닝 기록 → 오늘 인증 상태와 D+N |
| `CoursePreviewCard` · `MagazineCard` | `VerticalMediaCard` | 180×250 세로형 하나로 정규화, 두 가지 변형 |
| `RunnerAvatar` | `MemberAvatar` | 러너 → 코호트 멤버, Story 링은 오늘 인증 여부 |
| `ScheduleImageCard` | `BadgeImageCard` | 일정 → 배지 획득·졸업 오버레이 카드 |
| `RaceCountdownCard` | `CohortCountdownCard` | 대회 D-Day → 코호트 시작 D-Day |
| `ChallengeListItem` | `HabitListItem` | 챌린지 목록 → 온보딩 습관 선택 목록 |
| `CrewCard` | `CohortMemberCard` | 크루 → 코호트 멤버 2열 카드 |
| `FeedPost` | `CheckinPost` | 러닝 게시물 → 인증 게시물 |
| `SuggestedCrewSection` | `CohortMemberSection` | 추천 크루 → 코호트 멤버 미리보기 |
| `ScheduleCard` | `CohortScheduleCard` | 일정 → 코호트 기간·정원 요약 |
| `CourseListCard` | `CohortListCard` · `NoticeListCard` | 코스 목록 → 코호트 목록, 공지 목록 |
| `ProductCard` | `NextCohortCard` | 상품 → 다음 코호트 예약 카드 |

### 8.1 TodayHero

| 속성 | 값 |
|---|---:|
| 이미지 카드 | 394×426px |
| 라운드 | 16px |
| 카드와 CTA 간격 | 12px |
| CTA | 394×48px |

구조:

```text
TodayHero
├─ Background Image
├─ Image Scrim (하단 텍스트 영역 한정)
├─ Status Badge (오늘 인증 / 휴면 / 완주)
├─ D+N (Anton 64px)
├─ 습관명 + 코호트명
└─ Metric Stack
   ├─ 스트릭
   ├─ 총 인증
   └─ 남은 일수
```

- 상태 배지: 20px 높이, 아이콘 + 라벨
- D+N: Anton 64px, `--color-brand-primary`
- 습관명: 20px/600, 흰색
- 코호트·스트릭: 14px/400, 흰색 88%
- Metric 라벨: 12px, Metric 값: Anton 26px
- 사용자 상태 6개(0일차·연속 중·오늘 완료·끊김·휴면·완주)에 따라 배지, D+N 문구, Metric 구성, CTA가 바뀐다.
- 이미지마다 텍스트 대비를 확인한다.
- 카드 전체를 링크로 사용하지 않는다. CTA는 카드 아래 독립 Primary Button으로 둔다.

### 8.2 VerticalMediaCard

| 속성 | 값 |
|---|---:|
| 카드 | 180×250px |
| 라운드 | 20px |
| Slider 간격 | 12px |
| 430px 노출 | 약 2.1개 |

변형 A `CheckinStoryCard` — 오늘 인증한 코호트 멤버

- 이미지가 카드 전체를 채운다.
- 하단 Scrim 위에 닉네임 14px/600, `D+23 · 스트릭 9` 12px/400
- 상단 좌측에 상태 배지를 둔다. 인증 완료 `fa-circle-check`, 늦은 인증 `fa-moon`, 복귀 `fa-rotate-right`.
- 카드 전체를 인증 상세 링크로 사용한다.

변형 A-1 `CheckinStoryCard` 간단 인증 — 사진이 없는 인증

- **다른 사진으로 자리를 채우지 않는다.** 사진 없이 남긴 인증에 무관한 이미지를 넣으면 표시와 내용이 어긋난다.
- 배경 `--color-bg-surface`, 좌측 4px `--color-border-strong` 세로선으로 인용 블록처럼 표현한다.
- 상단에 `간단 인증` 배지, 가운데에 남긴 한 줄 16px(최대 4줄), 하단에 닉네임과 메타를 둔다.
- 피드의 간단 인증 블록과 같은 시각 언어를 쓴다.

변형 B `HabitPreviewCard` — 추천 습관

- 이미지가 카드 전체를 채운다.
- 하단 Scrim 위에 습관명 16px/600, `9/14 시작 · 12/30명` 12px/400
- 카드 전체를 챌린지 상세 링크로 사용한다.

공통 규칙

- 가로 스크롤과 Scroll Snap을 사용한다.
- 이미지가 카드 폭을 넘어가지 않도록 `overflow: hidden`을 적용한다.
- 제목은 한 줄, 메타는 한 줄로 제한한다.

### 8.3 MemberAvatar

- 전체 크기: 약 78×104px
- 외부 링: 78×78px
- 실제 이미지: 68×68px
- 이미지와 이름 간격: 8px
- 이름: 14px/400/가운데 정렬
- 오늘 인증을 마친 멤버는 `--color-brand-primary` 링을 사용한다.
- 휴면 멤버는 링 없이 60% 불투명도로 표시하고 이름 아래 `휴면` 배지를 둔다.
- 이름은 한 줄로 제한하고 전체 이름을 접근 가능한 이름으로 제공한다.
- 피드 게시물 헤더에서는 44×44px 원형으로 축소해 사용한다.

### 8.4 BadgeImageCard

| 속성 | 값 |
|---|---:|
| 카드 | 394×250px |
| 라운드 | 20px |

- 이미지가 전체 카드를 채운다.
- 배지명과 획득 조건은 좌측 하단에 배치한다.
- 배지명: 20px/500
- 조건: 16px/400
- 하단에 제한된 Gradient Scrim을 사용한다.
- 홈의 `이번 주 배지`와 졸업 화면의 `완주 배지`에 사용한다.
- 카드 전체를 배지 상세 또는 졸업 화면 링크로 사용한다.

### 8.5 CohortCountdownCard

| 속성 | 값 |
|---|---:|
| 카드 | 250×320px |
| Slider 간격 | 12px |
| D-Day | Anton 64px |

- 430px 화면에서 약 1.5개 카드가 보이게 한다.
- 이미지가 카드 전체를 채운다.
- D-Day는 `--color-brand-primary`, 습관명은 20px, 시작일은 14px을 사용한다.
- 텍스트는 이미지 하단에 배치하고 Scrim을 사용한다.
- 시작일과 D-Day는 실제 데이터에서 계산한다.
- 챌린지 탐색 화면 상단의 `곧 시작하는 코호트`에 사용한다.

### 8.6 HabitListItem

| 속성 | 값 |
|---|---:|
| 카드 | 394×80px |
| 썸네일 | 100×80px |
| 간격 | 15px |
| 라운드 | 20px |

- `grid-template-columns: 100px minmax(0, 1fr)` 구조를 사용한다.
- 습관명: 20px/500, 최대 1줄
- 참여 정보: 14px/400, 최대 1줄 (`주 7회 인증 · 하루 15분`)
- 온보딩 1단계 습관 선택에 사용한다.
- 선택 시 좌측에 2px 코랄 테두리와 `fa-circle-check`를 함께 표시한다.

### 8.7 CohortMemberCard

| 속성 | 값 |
|---|---:|
| 카드 | 191×182px |
| 간격 | 12px |
| 패딩 | 14px 12px |
| 라운드 | 12px |

- 394px 안에 2열로 배치한다.
- 닉네임: 16px/600
- 메타: 14px/400 (`D+23 · 스트릭 23`)
- 상태 배지 1개를 함께 표시한다.
- 행동: Outline `응원 보내기` 버튼
- 멤버 이미지는 원형으로 표시한다.

### 8.8 CheckinPost

| 영역 | 크기/규칙 |
|---|---|
| 전체 | 430px 폭 |
| 작성자 Header | 약 69px, 좌우 18px |
| 미디어 | 430×336px 풀블리드 |
| 반응·본문 | 약 102px |

- 닉네임: 20px/500
- 게시 메타: 14px/400/Muted (`오늘 07:12 · D+23`)
- 미디어 내부 D+N: Anton 26px, 좌측 하단 Scrim 위
- 응원·저장 수치: 14px
- 한 줄 인증 본문: 16px/400, 최대 2줄
- 게시물 간 기본 간격: 48px
- 이미지 영역은 풀블리드, 텍스트 영역은 좌우 18px을 사용한다.
- 응원, 저장, 상세 보기는 각각 독립 버튼과 접근 가능한 이름을 갖는다.
- 간단 인증(사진 없음)은 미디어 영역 대신 높이 140px의 `--color-bg-surface` 인용 블록을 사용하고 `간단 인증` 배지를 표시한다.

### 8.9 CohortMemberSection

- 섹션 폭: 394px
- SectionHeader 높이: 31px
- Header와 카드 사이: 10px
- 카드 2개, 각 191×182px
- 카드 간격: 12px
- 모바일에서 카드 2열이 유지되지 않는 최소 폭에서는 가로 스크롤로 전환한다.

### 8.10 CohortScheduleCard

| 속성 | 값 |
|---|---:|
| 카드 | 394×144px |
| 패딩 | 16px |
| 라운드 | 16px |

- 상단 Badge Row 높이: 26px (`모집 중`, `D-6`, `정원 12/30`)
- 코호트명: 20px/500
- 기간·정원: 14px/400
- 참여 통계: 14px/400, `--color-brand-text`
- 챌린지 상세 상단 요약에 사용한다.

### 8.11 CohortListCard · NoticeListCard

| 속성 | 값 |
|---|---:|
| 카드 | 394×102px |
| 패딩 | 12px 14px 12px 12px |
| 라운드 | 16px |
| 썸네일 | 78×78px |
| 썸네일 라운드 | 12px |
| 간격 | 14px |

`CohortListCard` — 챌린지 탐색 결과

- 코호트명: 16px/600, 한 줄
- 시작일·정원·기간: 12px, 각 한 줄
- 카드 전체를 챌린지 상세 링크로 사용한다.

`NoticeListCard` — 공지 목록

- 공지 제목: 16px/600, 최대 1줄
- 작성일·분류: 12px
- 카드 전체를 공지 상세 상태 링크로 사용한다.

### 8.12 NextCohortCard

| 영역 | 값 |
|---|---:|
| 전체 | 180×244px |
| 이미지 | 180×110px |
| 정보 영역 | 높이 86px, padding 12px 14px |
| CTA 영역 | 높이 48px |
| 라운드 | 20px |

- 분류: 12px/500/Muted (`같은 습관 재도전` 또는 `새 습관`)
- 코호트명: 16px/600, 최대 2줄
- 시작일: 16px/600
- 예약 Button: 높이 34px
- 졸업 화면의 `다음 코호트` 섹션에 사용한다.

---

## 9. 상세 정보와 데이터 컴포넌트

### 9.1 RuleInfoCard

- 2열 Grid
- 각 카드: 188×94px
- 열 간격: 18px
- 행 간격: 16px
- 라운드: 16px
- 라벨: 14px/500, `--color-text-muted`
- 값: 20px/500
- 설명: 12px/400
- 챌린지 상세의 인증 마감, 면제권, 정원, 기간에 사용한다.

### 9.2 ProgressStatCard

- 3열 Grid
- 각 카드: 122×90px
- 카드 간격: 14px
- 라운드: 12px
- 라벨: 14px
- 값: Anton 26px
- 설명: 12px
- 기록 화면의 현재 스트릭, 총 인증, 남은 면제권에 사용한다.

### 9.3 PolicyNoteCard

- 폭: 392–394px
- 기본 높이: 콘텐츠에 따라 최소 103px
- 패딩: 17px 20px
- 라운드: 12px
- 배경: `--color-bg-surface-subtle`
- 좌측 4px 코랄 세로선
- 제목: 20px/500
- 본문: 14px/400
- 제목과 본문 간격: 7px
- 챌린지 상세의 규칙 설명, 공지 본문, 면제권 안내에 사용한다.

### 9.4 MonthlyStatCard

- 폭: 392–394px
- 기본 높이: 171px
- 패딩: 17px 20px
- 라운드: 12px
- 배경: `--color-bg-surface`
- 제목: 20px
- 수치: Anton 22px
- 라벨: 12px
- 3열 × 2행 Metric Grid를 사용한다 (인증 일수, 늦은 인증, 간단 인증, 면제권 사용, 나만 보기, 응원 받은 수).
- 여섯 지표는 모두 같은 기간을 기준으로 한다. 전체 기간 값을 월별 카드에 섞지 않는다.
- 수치와 단위는 의미 있는 문장으로 스크린리더에 제공한다.

### 9.5 MyProfileStatsCard

| 속성 | 값 |
|---|---:|
| 카드 | 394×149px |
| 패딩 | 18px 20px |
| 라운드 | 20px |

- 상단에 3개의 통계를 배치한다 (총 인증, 현재 스트릭, 획득 배지).
- 통계 값: Anton 26px
- 통계 라벨: 14px
- Divider 아래에 `66일 중 21일 완료` 문구와 Progress Bar를 제공한다.
- Progress는 색상뿐 아니라 현재값과 백분율을 텍스트로 제공한다.

### 9.6 SavedCheckinTile

- 크기: 142×142px
- 3열 Grid
- 카드 간격: 2px
- 이미지 높이: 약 100px
- 날짜: Anton 15px
- 상태 라벨: 최소 12px
- 인증 사진이 있으면 이미지 위에 날짜를 표시한다.
- 간단 인증은 이미지 대신 `--color-bg-surface-subtle` 면에 한 줄 텍스트를 2줄까지 표시한다.
- 430px 전체 폭 Grid를 사용할 수 있다.
- 기록 화면의 `저장한 인증` 목록에 사용한다.

### 9.7 ProgressGrid (신규 컴포넌트)

66일 진행판이다. 공통 규정에 대응 컴포넌트가 없어 새로 정의한다.

| 속성 | 값 |
|---|---:|
| 전체 폭 | 394px |
| 열 수 | 11열 |
| 행 수 | 6행 |
| 타일 | 약 34×34px |
| 간격 | 2px |
| 라운드 | 4px |

- 타일은 **표시 전용**이며 클릭 대상으로 만들지 않는다. 34px는 44px 터치 기준을 충족하지 못하기 때문이다.
- 날짜별 상세는 진행판 아래 `인증 기록` 목록에서 진입한다.
- 상태를 색상만으로 구분하지 않는다.

| 타일 상태 | 배경 | 추가 표시 |
|---|---|---|
| 인증 완료 | `--color-brand-primary` | 없음 |
| 늦은 인증 | `--color-brand-primary` | 우하단 3px `#1A1A1A` 점 |
| 면제권 사용 | `--color-bg-surface` | 1px `--color-warning` 테두리 + 대각선 |
| 미인증 | `--color-bg-surface-subtle` | 없음 |
| 오늘 | 현재 상태 배경 | 2px `--color-text-primary` 테두리 |
| 미래 | `transparent` | 1px `--color-border-default` 테두리 |

- Grid 전체에 `role="img"`와 `aria-label`을 제공한다. 예: `66일 중 21일 인증 완료, 면제권 1일 사용, 오늘은 23일차입니다.`
- Grid 아래에 범례를 텍스트로 제공한다.
- 인증 직후 해당 타일이 채워질 때 220ms 전환을 사용한다.

### 9.8 CohortTimeline

- 좌측에 회차, 중앙에 선과 Dot, 우측에 제목·설명을 배치한다.
- 현재 단계의 Dot과 회차는 `--color-brand-primary`를 사용한다.
- 제목: 20px/500
- 설명: 14px/400, `--color-text-muted`
- Dot만으로 현재 상태를 전달하지 않는다. 현재 단계에 `진행 중` 라벨을 함께 둔다.
- 졸업 화면의 `시작 → 7일 → 21일 → 반환점 33일 → 50일 → 완주 66일`에 사용한다.

---

## 10. 설정 컴포넌트

### 10.1 SettingsGroup

- 폭: 394px
- Group Label: 14px/500, `--color-brand-text`
- Label과 Card 간격: 10px
- Card 배경: `--color-bg-surface`
- Card 라운드: 16px
- Row 사이에 Subtle Divider를 사용할 수 있다.

### 10.2 SettingsRow

| 속성 | 값 |
|---|---:|
| 폭 | 394px |
| 기본 높이 | 55px |
| Toggle 포함 높이 | 60px |
| 패딩 | 17px 16px |

- 좌측 라벨: 16px/400
- 우측 현재값: 14px/400, `--color-text-muted`
- Chevron: 14×14px
- 전체 Row를 링크 또는 버튼으로 사용한다.
- 단순 정보 Row는 불필요한 Chevron을 사용하지 않는다.
- 첫 Row와 마지막 Row만 Card 외곽 라운드의 영향을 받는다.

---

## 11. Modal, Empty, Loading, Error

### 11.1 ConfirmModal

| 속성 | 값 |
|---|---:|
| Modal | 340×320px |
| 라운드 | 24px |
| Primary | 292×52px |
| Secondary | 292×44px |

- 배경: `--color-bg-surface`
- 테두리: `--color-border-default`
- 제목: 20px/700
- 설명: 14px/400, 가운데 정렬
- Primary는 사용자의 현재 과업을 지속하는 행동을 배치한다.
- 되돌릴 수 없는 행동은 Secondary Text Action으로 낮게 강조한다.
- 배경 Scrim, 포커스 트랩, Escape 닫기, 포커스 복귀를 구현한다.
- 사용처: 면제권 사용 확인, 인증 신고 확인, 코호트 참여 확인

### 11.2 Loading

- 300ms 이내의 짧은 작업에는 로딩 UI를 노출하지 않는다.
- 카드 목록은 실제 카드와 같은 구조의 Skeleton을 사용한다.
- Button Loading 상태에서도 크기가 바뀌지 않는다.
- 진행 수치는 업데이트로 레이아웃이 흔들리지 않게 고정 폭을 사용한다.

### 11.3 Empty

- 빈 이유, 현재 상태, 다음 행동을 제공한다.
- 장식 이미지는 메시지보다 우선하지 않는다.
- 빈 상태 CTA는 실제 생성 또는 탐색 경로로 연결한다.
- 사용자를 탓하는 문장을 쓰지 않는다.

### 11.4 Error

- 오류 원인과 사용자가 할 수 있는 행동을 설명한다.
- 재시도 가능한 오류에는 재시도 버튼을 제공한다.
- 이미지 실패 시 카드 크기와 텍스트 구조를 유지한다.
- 오류가 BottomNavigation과 화면 이동을 막지 않게 한다.
- 오류 색상 `#B3261E`는 반드시 `fa-circle-exclamation`과 함께 사용한다.

### 11.5 Toast

- 하단 고정 UI 위 12px에 표시한다.
- 폭: 최대 394px, 높이 48px 이상
- 배경: `--color-bg-floating`, 텍스트: 흰색 14px
- 표시 시간: 기본 3초, 실행 취소가 있으면 5초
- 실행 취소는 Toast 우측 Text Action으로 둔다.
- `role="status"`와 `aria-live="polite"`를 사용한다.

---

## 12. 기능 특화 컴포넌트

### 12.1 OnboardingSlide

| 속성 | 값 |
|---|---:|
| 기준 화면 | 430×932px |
| 풀블리드 이미지 높이 | 약 520px |
| 콘텐츠 시작 | 좌측 18px |
| CTA | 341×52px |

- 풀블리드 이미지를 사용한다.
- Eyebrow는 `--color-brand-text`, 제목은 24px/600 Pretendard를 사용한다.
- 큰 숫자를 보여주는 슬라이드에서만 Anton 64px을 사용한다.
- 설명은 Pretendard 16px을 사용한다.
- CTA는 화면 하단 중앙 정렬한다.
- Indicator의 비활성 점은 8×8px, 활성 Indicator는 24×8px이다.
- 전체 슬라이드를 클릭해 넘기는 동작만 제공하지 말고 명시적 CTA를 제공한다.
- 자동 전환은 사용하지 않는다.

### 12.2 CheckinComposer

인증 작성 화면에서 사용하는 독립 화면 상태다.

| 컴포넌트 | 값 |
|---|---:|
| 화면 | 430×932px |
| D+N 숫자 | Anton 96px |
| 날짜 라벨 | 14px |
| 사진 선택 Grid | 3열, 각 110×110px |
| 선택된 사진 | 394×250px |
| 한 줄 입력 | 394×46px |
| 공개 범위 Row | 394×55px |

- 배경: `--color-bg-focus`
- 텍스트: `--color-text-focus`
- 화면 상단에 오늘 날짜와 D+N을 크게 배치해 지금 무엇을 남기는지 즉시 알 수 있게 한다.
- 입력 중에도 D+N 위치가 흔들리지 않게 한다.
- StickyActionBar에 `인증 남기기` 단일 CTA를 둔다.
- 사진을 고르지 않아도 제출할 수 있고, 이 경우 `간단 인증`으로 저장된다.

### 12.3 OneLineInput

| 속성 | 값 |
|---|---:|
| 전체 | 394×46px |
| 패딩 | 12px 16px |
| 라운드 | 12px |
| 배경 | `--color-bg-surface-subtle` |
| 글자 수 표시 | 우측 12px |

- Placeholder: 14px/500, `--color-text-muted`
- 최대 40자, 남은 글자 수를 실시간으로 표시한다.
- 40자를 넘기면 입력을 막고 오류 문구를 표시한다.
- 빈 입력은 제출하지 않는다.
- 전송 중 중복 제출을 방지한다.

### 12.4 HelpQuickMenu

- 크기: 232×68px
- 패딩: 14px 16px
- 간격: 12px
- 라운드: 18px
- 배경: `--color-bg-surface`, 테두리 `--color-border-default`
- 제목: 16px/500
- 설명: 12px/400
- 아이콘: 29×29px
- 전체 Menu를 하나의 버튼으로 사용한다.
- 끊김·휴면 상태 홈에서 `면제권 쓰기`와 `복귀 인증하기`를 나란히 제공한다.

---

## 13. 이미지와 Overlay

### 13.1 이미지 사용

- 실제 습관 생활, 코호트 모임, 기록, 휴식 맥락이 드러나는 이미지를 사용한다.
- `object-fit: cover`를 기본으로 한다.
- 피사체가 잘리지 않도록 컴포넌트별 `object-position`을 지정한다.
- WebP를 사용한다.
- 화면에 필요한 해상도보다 지나치게 큰 이미지를 내려받지 않는다.
- 중요한 이미지는 구체적인 한국어 대체 텍스트를 제공한다.
- 텍스트와 같은 의미를 반복하는 이미지는 빈 대체 텍스트를 사용할 수 있다.
- 첫 Hero 이미지만 우선 로드하고 나머지는 `loading="lazy"`를 사용한다.
- 이미지 안에 UI 문구, 로고, 읽어야 하는 텍스트를 넣지 않는다.
- 적용된 실제 규격: 가로 이미지 `1100×689`(16:10), 세로 이미지 `900×1125`(4:5), WebP 품질 82, 10장 합계 약 596KB.

### 13.2 Overlay와 Gradient

- 이미지 위 텍스트가 있으면 제한된 Scrim 또는 Gradient를 허용한다.
- Gradient는 텍스트가 있는 영역에 집중한다.
- 텍스트 그림자만으로 대비 문제를 해결하지 않는다.
- 슬라이드마다 이미지가 달라지는 경우 각 이미지에서 대비를 확인한다.
- 기본 Overlay는 검정 42%를 기준으로 하되 이미지별로 조정할 수 있다.
- 배경이 라이트 테마로 바뀌어도 이미지 위 Scrim은 검정을 유지한다. 사진 위 흰 텍스트의 대비를 확보하기 위한 것이며 앱 배경색과 무관하다.

### 13.3 이미지 실패 대응

- 이미지 실패 시 카드 크기와 텍스트 구조를 유지한다.
- 대체 Surface는 `--color-bg-surface-subtle` 배경에 24px `fa-image` 아이콘을 가운데 배치한다.
- 대체 Surface에 문구를 넣지 않는다. 카드의 제목과 설명이 이미 정보를 전달한다.
- 대체 Surface를 정상 상태의 placeholder로 사용하지 않는다.

---

## 14. Slider와 인터랙션

### 14.1 Slider 기본

- 기본 간격: 12px
- CSS Scroll Snap을 우선한다.
- 터치 드래그와 키보드 입력을 지원한다.
- 마지막 카드 뒤에 불필요한 빈 영역이 없어야 한다.
- 페이지 전체가 아니라 Slider 컨테이너만 가로 스크롤되어야 한다.
- Scrollbar는 시각적으로 숨길 수 있지만 스크롤 기능은 유지한다.

### 14.2 카드 노출 수

| Slider | 카드 폭 | 430px 노출 |
|---|---:|---:|
| CheckinStoryCard | 180px | 약 2.1개 |
| HabitPreviewCard | 180px | 약 2.1개 |
| CohortCountdownCard | 250px | 약 1.5개 |
| CohortMemberCard | 191px | 2개 고정 2열 |

### 14.3 자동재생

- 사용자가 조작하는 Slider는 자동재생하지 않는다.
- 육십육 MVP에는 자동재생 Slider가 없다.
- 모션 감소 설정에서는 모든 전환을 최소화한다.

---

## 15. 화면별 조합 규칙

### 15.1 홈(오늘)

권장 순서:

1. AppHeader
2. TodayHero + Primary Button
3. (끊김·휴면 상태에 한해) HelpQuickMenu
4. 코호트 오늘 현황 Section
5. CheckinStoryCard Slider
6. BadgeImageCard
7. NoticeListCard 배너
8. HabitPreviewCard Slider
9. BottomNavigation

- 섹션 간격은 48px을 유지한다.
- 각 섹션은 SectionHeader를 사용한다.
- BottomNavigation이 콘텐츠를 가리지 않게 한다.
- 사용자 상태에 따라 2·3번 구성이 바뀐다. 나머지 섹션 순서는 고정한다.

### 15.2 피드

1. AppHeader
2. FilterChip Row
3. CheckinStoryCard Slider
4. CheckinPost
5. CohortMemberSection
6. CheckinPost
7. BottomNavigation

- 인증 이미지는 풀블리드다.
- 게시물 메타와 본문만 좌우 18px을 적용한다.
- 게시물 간 간격은 48px이다.

### 15.3 기록

1. AppHeader
2. ProgressGrid + 범례
3. ProgressStatCard 3열
4. MonthlyStatCard
5. FilterChip Row (내 인증 / 저장한 인증 / 배지)
6. SavedCheckinTile Grid 또는 인증 기록 목록
7. BottomNavigation

- ProgressGrid는 430px 전체 폭이 아니라 394px 콘텐츠 폭을 사용한다.
- SavedCheckinTile Grid는 430px 전체 폭 3열을 사용한다.

### 15.4 마이

1. AppHeader
2. Profile Header
3. MyProfileStatsCard
4. Highlight Shortcut 3개 (랭킹, 배지, 공지)
5. 배지 Grid
6. SettingsGroup
7. BottomNavigation

### 15.5 챌린지 상세

1. DetailHeader
2. Full Image Hero
3. CohortScheduleCard
4. RuleInfoCard 2×2
5. PolicyNoteCard(규칙 요약)
6. CohortMemberSection
7. StickyActionBar

- BottomNavigation과 StickyActionBar를 동시에 사용하지 않는다.

### 15.6 인증 작성

1. DetailHeader
2. CheckinComposer
3. StickyActionBar

- 완료 후 같은 화면에서 완료 상태로 전환한 뒤 홈으로 돌아간다.

### 15.7 인증 상세

1. DetailHeader
2. 인증 이미지 또는 간단 인증 블록
3. 작성자 정보와 상태 배지
4. 한 줄 본문
5. 응원·저장·신고 행동 Row
6. 같은 날 다른 인증 2개
7. StickyActionBar (`응원 보내기`)

### 15.8 탐색·랭킹·공지·졸업

- 탐색: DetailHeader + 검색 입력 + FilterChip + CohortCountdownCard Slider + CohortListCard 목록
- 랭킹: DetailHeader + 코호트 요약 + 순위 목록 + 내 위치 하이라이트
- 공지: DetailHeader + NoticeListCard 목록 + PolicyNoteCard 상세
- 졸업: DetailHeader + BadgeImageCard + CohortTimeline + NextCohortCard 2개

---

## 16. 카드뉴스형 콘텐츠 디자인 규칙

육십육의 카드형 콘텐츠는 사각 박스 안에 제목과 설명만 넣는 형태로 반복하지 않는다. 각 카드 유형은 역할, 이미지 비율, 이미지 위치, 텍스트 위계, 행동을 다르게 갖는다.

| 카드 유형 | 사용처 | 크기·비율 | 이미지 위치 | 텍스트 위계 | 행동 |
|---|---|---|---|---|---|
| Hero형 | 홈 오늘 인증 히어로 | 394×426, 16:10 원본 | 카드 전체, 하단 Scrim | D+N Anton 64 → 습관명 20 → 코호트·스트릭 14 | 인증 남기기 |
| 세로형 | 스토리 레일, 추천 습관 | 180×250, 4:5 | 카드 전체, 하단 Scrim | 이름·습관명 14~16 → 메타 12 | 인증 상세 / 챌린지 상세 |
| 가로형 | 코호트 목록, 공지 | 394×102 | 좌측 썸네일 78×78 | 제목 16 → 메타 12 | 챌린지 상세 / 공지 상세 |
| 오버레이형 | 배지 획득, 졸업 | 394×250, 16:10 | 카드 전체, 하단 Scrim | 배지명 20 → 조건 16 | 배지·졸업 상세 |
| 피드형 | 코호트 피드 인증 | 430×336 풀블리드 | 본문 상단 풀블리드 | 작성자 20 → 메타 14 → 한 줄 16 | 응원·저장·상세 |
| 카운트다운형 | 곧 시작하는 코호트 | 250×320 | 카드 전체, 하단 Scrim | D-Day Anton 64 → 습관명 20 → 시작일 14 | 챌린지 상세 |
| 이미지 없음 | 66칸 진행판, 통계, 랭킹, 설정, 규칙 | 콘텐츠에 따름 | 없음 | 숫자 Anton 26~36, 라벨 12~14 | 없음 또는 화면 이동 |

### 16.1 필수 규칙

- 이미지가 있는 카드에는 카드 내용과 직접 관련된 생성 이미지를 반드시 사용한다.
- 아이콘이나 단색 배경으로 이미지 역할을 대신하지 않는다.
- 같은 이미지를 관련 없는 여러 카드에 반복 사용하지 않는다.
- 모든 카드를 같은 박스 형태로 복제하지 않는다. 위 표의 유형 구분을 지킨다.
- 이미지 위에 텍스트를 배치할 때는 텍스트 영역에 한정된 Scrim을 사용한다.
- 카드 제목은 최대 2줄, 설명은 최대 2줄로 제한한다.
- 카드 전체가 링크면 내부에 별도 링크나 버튼을 중첩하지 않는다.

### 16.2 이미지를 쓰지 않는 경우

다음 UI는 이미지가 정보 전달에 도움이 되지 않으므로 억지로 카드뉴스로 만들지 않는다.

- 66칸 진행판과 통계 수치
- 코호트 랭킹 목록
- 설정 화면의 Row
- 인증 작성의 입력 폼
- 규칙 요약 텍스트

이 경우 숫자 위계, 여백, 구분선으로 정보를 정리하고 카드 배경은 `--color-bg-surface` 또는 `--color-bg-surface-subtle`을 사용한다.

---

## 17. 콘텐츠 규칙

| 요소 | 제한 |
|---|---|
| 화면 제목 | 최대 1줄 |
| 섹션 제목 | 최대 1줄, 불가피하면 2줄 |
| 카드 제목 | 1–2줄 |
| 카드 설명 | 2줄 |
| 인증 한 줄 | 최대 40자, 2줄 |
| CTA | 한 줄 |
| 탭 라벨 | 한 줄 |
| 메타 정보 | 기본 한 줄 |

- 말줄임은 전체 내용을 확인할 경로가 있을 때만 사용한다.
- 인증 일수, 스트릭, 면제권 잔여, 시작일, 오류 정보는 말줄임 처리하지 않는다.
- 장식용 `01`, `02`, `03`은 사용하지 않는다.
- D+N, 스트릭, 진행률처럼 의미가 있는 숫자는 사용한다.
- 버튼 문구는 `인증 남기기`, `면제권 쓰기`, `코호트 참여하기`처럼 행동을 명확히 표현한다.
- 정책을 규칙 문장 그대로 노출하지 않고 지금 상황에 맞는 문장으로 바꿔 쓴다.

---

## 18. 접근성

- 논리 화면마다 하나의 H1을 사용한다.
- 제목 단계를 건너뛰지 않는다.
- 모든 인터랙션 요소는 키보드 포커스를 받을 수 있어야 한다.
- Focus Ring을 제거하지 않는다. 2px `--color-focus-ring`을 사용한다.
- 기본 터치 영역은 최소 44×44px이다.
- 인접한 터치 대상 사이는 8px 이상을 권장한다.
- 일반 본문은 최소 4.5:1, 큰 텍스트와 UI 경계는 최소 3:1 대비를 확보한다.
- 대표 컬러와 액센트 컬러로 표현한 상태는 색상과 함께 라벨 또는 아이콘을 사용한다.
- 66칸 진행판은 `role="img"`와 요약 `aria-label`을 제공한다.
- Slider는 현재 위치와 전체 개수를 전달한다.
- Modal은 포커스 트랩과 포커스 복귀를 구현한다.
- 인증 완료, 응원, 저장, 오류는 Live Region으로 알린다.
- 글자 확대 200%에서도 인증 남기기를 완료할 수 있어야 한다.
- `prefers-reduced-motion`을 존중한다.

---

## 19. 구현 규칙

### 19.1 컴포넌트 이름

```text
Navigation/AppHeader
Navigation/DetailHeader
Navigation/SectionHeader
Navigation/BottomNav
Button/Primary
Button/Accent
Button/Secondary
Button/Outline
Button/Compact
Button/Icon
Button/Danger
Chip/Filter
Badge/Status
Control/Toggle
Card/TodayHero
Card/VerticalMedia
Card/BadgeImage
Card/CohortCountdown
Card/HabitListItem
Card/CohortMember
Card/CohortSchedule
Card/CohortList
Card/NoticeList
Card/NextCohort
Card/RuleInfo
Card/ProgressStat
Card/PolicyNote
Card/MonthlyStat
Feed/CheckinPost
Profile/MyProfileStats
Profile/MemberAvatar
Record/ProgressGrid
Record/SavedCheckinTile
Record/CohortTimeline
Overlay/ConfirmModal
Overlay/Toast
Compose/CheckinComposer
Compose/OneLineInput
Guide/HelpQuickMenu
Onboarding/OnboardingSlide
```

### 19.2 HTML

- 링크 이동은 `a`, 상태 변경은 `button`을 사용한다.
- 클릭 가능한 `div`를 만들지 않는다.
- 카드 전체 링크 안에 또 다른 링크나 버튼을 중첩하지 않는다.
- 목록은 `ul`, `ol`과 `li`를 우선 검토한다.
- 날짜와 시각은 `time` 요소를 사용한다.
- 이미지 너비와 높이를 지정해 Layout Shift를 줄인다.

### 19.3 CSS

- 이 문서의 토큰을 사용한다.
- 페이지 전용 값을 재사용 컴포넌트에 하드코딩하지 않는다.
- 텍스트 컨테이너에 불필요한 고정 높이를 사용하지 않는다.
- 고정 높이는 버튼, 아이콘, 미디어, 진행판 타일처럼 범위가 명확한 요소에 사용한다.
- `100vh` 대신 `100dvh`를 우선한다.
- `overflow: hidden`은 필요한 카드 내부에 한정한다.
- Slider가 있는 화면에서 앱 셸 전체를 `overflow-x: auto`로 만들지 않는다.

### 19.4 JavaScript

- 클릭, 터치 드래그, 키보드가 같은 상태 모델을 사용한다.
- Slider 이동값을 카드 개수에 하드코딩하지 않는다.
- 인증 남기기, 응원, 저장, 면제권 사용은 중복 제출을 방지한다.
- 상태 변경 직후 UI와 `localStorage`가 같은 값을 갖게 한다.
- 데이터 오류가 전체 내비게이션을 막지 않게 한다.

---

## 20. 금지 규칙

- 화면 전체를 절대좌표로 구현하지 않는다.
- iOS 상태바와 Home Indicator를 웹 UI로 그리지 않는다.
- 10px와 11px 일반 텍스트를 사용하지 않는다.
- 아이콘의 시각 크기만큼만 터치 영역을 만들지 않는다.
- 대표 컬러와 Pressed 값을 같은 상태에 임의로 혼용하지 않는다.
- 대표 컬러 배경 위에 흰 텍스트를 사용하지 않는다.
- 카드마다 유사하지만 다른 라운드를 새로 만들지 않는다.
- 이미지 위 텍스트를 Overlay 없이 배치하지 않는다.
- BottomNavigation과 StickyActionBar를 같은 화면 하단에 중복하지 않는다.
- 모든 섹션에 Slider나 이미지를 강제하지 않는다.
- 자동 Slider를 사용하지 않는다.
- 장식용 번호를 정보 구조로 사용하지 않는다.
- 특정 화면과 관계없이 하단 탭을 항상 활성화하지 않는다.
- 사용자가 선택하지 않은 파스텔 계열을 보조색으로 추가하지 않는다.
- 이모지를 기능 아이콘이나 상태 아이콘으로 사용하지 않는다.
- 66칸 진행판 타일을 44px 미만 크기로 클릭 대상으로 만들지 않는다.
- 액센트 컬러를 완료·복귀 이외의 장식에 사용하지 않는다.

---

## 21. QA 체크리스트

### 21.1 필수 화면 폭

- 360px
- 390×844px
- 430×932px
- 431px 이상에서 중앙 430px 셸

### 21.2 시각 QA

- 좌우 18px 정렬선이 일관적인가?
- 홈 섹션 간격이 48px로 유지되는가?
- 카드 폭과 Slider 노출 수가 규정과 맞는가?
- 이미지의 피사체와 텍스트가 잘리지 않는가?
- BottomNavigation이 콘텐츠를 가리지 않는가?
- 풀블리드 피드와 394px 콘텐츠가 올바르게 구분되는가?
- Anton 수치가 업데이트돼도 레이아웃이 흔들리지 않는가?
- 66칸 진행판의 6개 타일 상태가 색상 외 표시로도 구분되는가?
- 대표 컬러 위 텍스트가 검정으로 유지되는가?
- 선택하지 않은 파스텔 색상이 화면에 없는가?

### 21.3 인터랙션 QA

- 카드 전체 링크와 내부 행동이 충돌하지 않는가?
- Slider가 터치와 키보드로 동작하는가?
- 마지막 Slider 뒤에 빈 영역이 없는가?
- 뒤로 가기와 공유가 올바른 역할을 사용하는가?
- Toggle 상태와 실제 설정이 동기화되는가?
- Modal이 열린 동안 배경과 포커스가 제어되는가?
- 인증 남기기 중 중복 제출이 차단되는가?
- 면제권 사용 후 잔여 수와 스트릭이 즉시 갱신되는가?
- 상태 6개 전환이 홈에 정확히 반영되는가?

### 21.4 접근성 QA

- 터치 영역이 최소 44×44px인가?
- Focus Ring이 보이는가?
- 텍스트와 배경 대비가 충분한가?
- 이미지 대체 텍스트가 적절한가?
- 200% 확대에서 인증 남기기를 완료할 수 있는가?
- 모션 감소 설정을 존중하는가?
- 스크린리더가 진행판, Toggle, Modal, 인증 수치를 이해할 수 있는가?

### 21.5 자동 검증

- 홈, 피드, 기록, 마이 기본 이동을 확인한다.
- 390px과 430px에서 화면을 비교한다.
- 긴 한글 습관명, 이미지 실패, 빈 데이터, 손상된 localStorage를 테스트한다.

---

## 22. 완료 정의

새 화면 또는 컴포넌트는 다음 조건을 모두 만족해야 한다.

- 이 문서의 토큰과 컴포넌트를 사용했다.
- 430px 기준 시각 언어를 유지했다.
- 390px과 360px에서 레이아웃을 검증했다.
- Default, Pressed, Focus, Disabled, Loading 상태를 필요한 범위에서 구현했다.
- 빈 상태와 오류 상태를 고려했다.
- 터치 영역, 대비, 포커스, 대체 텍스트를 확인했다.
- 긴 텍스트와 이미지 실패를 확인했다.
- BottomNavigation과 고정 CTA가 콘텐츠를 가리지 않는다.
- 대표·액센트·배경 컬러 외의 유채색을 추가하지 않았다.
- 화면별 예외가 있으면 이유와 적용 범위를 기록했다.

---

## 23. 변경 관리

- 버전은 `Major.Minor` 형식으로 관리한다.
- 토큰 삭제, 컴포넌트 구조 변경, 접근성 기준 변경은 Major 변경이다.
- Variant 추가, 새 화면 조합, 설명 보완은 Minor 변경이다.
- 변경 시 날짜, 변경 이유, 영향받는 컴포넌트와 마이그레이션 방법을 기록한다.

### 변경 이력

| 버전 | 날짜 | 변경 내용 |
|---|---|---|
| 1.0 | 2026-09-08 | `beginner-design-rull.md`를 기준으로 육십육 전용 디자인 규정 작성. 대표·액센트·배경 컬러 교체, 라이트 테마 파생 토큰 정의, 콘텐츠 카드 재해석, `ProgressGrid` 신규 정의, 카드뉴스형 콘텐츠 규칙(16장) 추가 |
