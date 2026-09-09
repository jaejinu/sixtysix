# 육십육 (SIXTYSIX) — 66일 습관 챌린지 코호트

같은 날 시작한 30명 코호트와 함께 하나의 습관을 66일 동안 매일 인증하고 완주하는 습관 챌린지 커뮤니티 모바일 웹 MVP입니다.

라이브: https://sixtysix-taupe.vercel.app

## 문서

| 파일 | 내용 |
|---|---|
| `sixtysix-design-rull.md` | 육십육 전용 디자인 규정 (토큰, 컴포넌트 계약, 카드뉴스 규칙, QA 기준) |
| `sixtysix-project.md` | 화면상세 명세 (12화면, 정책 10개, 상태 6개, 샘플 데이터, 완료 정의) |
| `assets/images/IMAGE-PROMPTS.md` | 생성 이미지 10장의 프롬프트와 사용 화면 |

## 이미지 10장

`assets/images/` 에 생성 이미지 10장이 들어가 있습니다. 프롬프트는 `assets/images/IMAGE-PROMPTS.md` 에 남겨 두었습니다.

```text
assets/images/
├── hero-morning-desk.webp   1100×689   홈 히어로, 온보딩 1
├── habit-reading.webp        900×1125  독서 코호트, 피드, 프로필
├── habit-running.webp        900×1125  러닝 코호트, 카운트다운
├── habit-english.webp        900×1125  영어 코호트, 인증 사진
├── habit-water.webp          900×1125  물 코호트, 스토리
├── habit-journal.webp        900×1125  기록 코호트, 인증 사진
├── cohort-meetup.webp       1100×689   챌린지 상세 Hero, 공지
├── graduation-66.webp       1100×689   졸업, 배지, 완주 히어로
├── habit-stretch.webp        900×1125  스트레칭 코호트, 스토리
└── rest-window.webp         1100×689   끊김·휴면 히어로, 공지
```

WebP 품질 82, 10장 합계 약 596KB. 이미지를 교체할 때는 파일명과 비율(가로 16:10 / 세로 4:5)을 유지하세요.

## 로컬에서 보기

`file://`로 열지 말고 로컬 서버로 여세요. 이미지 상대 경로와 `localStorage`가 정상 동작합니다.

```bash
cd sixtysix
python3 -m http.server 8900
# http://localhost:8900 접속
```

## Vercel 배포

빌드 과정이 없는 정적 사이트라 별도 설정 파일이 필요 없습니다.

```bash
npm i -g vercel     # 처음 한 번
cd sixtysix
vercel              # 미리보기 배포
vercel --prod       # 운영 배포
```

- 프로젝트 루트를 `sixtysix` 폴더로 지정하세요.
- Framework Preset은 `Other`, Build Command와 Output Directory는 비워 둡니다.
- GitHub 저장소에 올려 두면 Vercel 대시보드에서 저장소를 연결하는 방식도 동일하게 동작합니다.

## 회귀 테스트

배포 대상 폴더 바깥의 `../qa` 에 Playwright 회귀 테스트가 있습니다.

```bash
cd ../qa
npm install && npx playwright install chromium   # 처음 한 번
npm test
```

이미지 10장을 넣기 전에는 `tests/assets.spec.js` 만 실패합니다. 자세한 내용은 `qa/README.md` 를 보세요.

## 데모 조작

- 사용자 상태 6개(0일차 · 연속 중 · 오늘 완료 · 끊김 · 휴면 · 완주)는 **마이 > 데모 > 데모 상태 전환**에서 바꿀 수 있습니다.
- 기본값은 D+23, 연속 9일, 채운 날 21일, 면제권 2회 남음, 오늘 미인증입니다.
- 인증, 응원, 저장, 설정은 `localStorage`에 저장되며 **마이 > 데모 > 저장 데이터 초기화**로 되돌립니다.

## 구조

```text
sixtysix/
├── index.html
├── css/
│   ├── tokens.css        디자인 토큰 (규정 3~5장)
│   ├── components.css    공통 컴포넌트 (규정 6~12장)
│   └── app.css           화면별 스타일 (규정 15장)
├── js/
│   ├── data.js           샘플 데이터
│   ├── state.js          상태 모델과 파생 값
│   ├── components.js     컴포넌트 렌더러
│   └── app.js            라우팅과 12화면
└── assets/images/
```

## 확정 색상

| 역할 | 값 |
|---|---|
| 대표 컬러 | `#F04E2C` 코랄 레드 |
| 액센트 컬러 | `#1F6F5F` 딥 그린 (인증 완료·복귀 전용) |
| 배경 컬러 | `#FBF8F2` 웜 화이트 |

대표 컬러 배경 위 텍스트는 `#1A1A1A`, 대표 컬러를 텍스트로 쓸 때는 `#C63A1E`를 사용합니다. 선택하지 않은 파스텔 계열은 쓰지 않고, 연한 보조 면은 `#F1EEE8` · `#E4E0D8` 회색 계열만 사용합니다.
