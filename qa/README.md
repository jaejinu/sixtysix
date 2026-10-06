# 육십육 회귀 테스트

`../sixtysix` 를 로컬 서버로 띄우고 Playwright 로 검증합니다.
배포 대상 폴더 **바깥**에 두어 Vercel 정적 배포가 `package.json` 을 집어들지 않게 했습니다.

현재 등록 테스트는 210개입니다(2026-09-30 `npm test -- --list` 확인). V1 전용이며 V2를 검사하지 않습니다.

## V2 모바일 검수

별도 터미널에서 `npm --prefix sixtysix-v2 run dev`로 V2 개발 서버를 실행한 뒤, 프로젝트 루트에서 실행합니다. QA 의존성과 Chromium이 처음이라면 아래 V1 실행 절차의 설치 명령을 먼저 사용하세요.

```bash
npm --prefix qa run test:v2                # 아래 3개 순차 실행, 실패 시 중단
npm --prefix qa run test:v2:activity       # 활동·인증·면제권·기록
npm --prefix qa run test:v2:notifications  # 알림·만료 시 기존 알림 제거
npm --prefix qa run test:v2:admin          # 모집 개설·취소·권한·재시도
```

| 검사 | 상태/흐름 수 | 산출물 |
|---|---:|---|
| 활동 | 42 | `test-results/activity-mobile/` |
| 알림 | 12 | `test-results/notifications-mobile/` |
| 운영자 | 15 | `test-results/admin-mobile/` |

360/390/430px에서 총 69개 상태·흐름을 검사합니다. 기본 서버 주소는 `http://127.0.0.1:5173`입니다. 다른 로컬 포트를 쓰면 각각 `ACTIVITY_BASE_URL`, `NOTIFICATIONS_QA_BASE`, `ADMIN_QA_BASE` 환경변수로 지정합니다. 원격 주소는 스크립트에서 거부합니다.

모든 API는 테스트 응답으로 대체합니다. 실제 공급자 로그인·DB·모집 변경을 검사하지 않으며, V2 전체 화면 E2E도 아닙니다. 로그인·모집 UI는 V2 Vitest 흐름 검사에 포함됩니다. 이번 실행 결과는 [PROGRESS.md](../PROGRESS.md)를 확인하세요.

## V1 실행

```bash
cd qa
npm install                 # 처음 한 번
npx playwright install chromium   # 처음 한 번
npm test                    # 360 · 390 · 430px 전부 실행
npm test -- --project=430   # 한 가지 폭만
npm run report              # HTML 리포트 열기
```

서버는 Playwright 가 `python3 -m http.server 8901` 로 자동 실행합니다.

## 구성

| 파일 | 검증 내용 |
|---|---|
| `tests/flows.spec.js` | `sixtysix-project.md` 15.7 자동 검증 시나리오 1~8, 10 |
| `tests/state.spec.js` | 습관·코호트 배정, 참여, 랭킹 기준, 공개 범위 등 저장 상태 정합성 |
| `tests/layout.spec.js` | 12화면 구조·접근성·수평 스크롤, 앱 셸 폭, 고정 UI 겹침, 탭 활성, 에셋 연결, 색상 토큰 |
| `tests/assets.spec.js` | 생성 이미지 10장의 존재와 정상 렌더 |
| `tests/visual.spec.js` | 390 · 430px 스크린샷 회귀 (이미지가 있을 때만 실행) |

## 이미지 10장을 넣기 전후

- **넣기 전**: `tests/assets.spec.js` 2건이 폭마다 실패합니다(총 6건). 이것이 남은 작업을 알려주는 게이트입니다.
  이미지 404 는 콘솔 오류 집계에서 제외되므로 나머지 테스트는 정상 통과합니다.
- **넣은 뒤**: 6건이 통과하고 `tests/visual.spec.js` 가 실행됩니다.
  첫 실행에서 기준 스크린샷이 만들어지므로 한 번은 아래를 실행하세요.

```bash
npm run update-snapshots
```

이후 UI 를 바꾸면 스크린샷 차이로 회귀를 잡아냅니다.

## 검사 항목

- 논리 화면마다 H1 하나
- 페이지 전체 수평 스크롤 없음
- BottomNavigation 과 StickyActionBar 동시 노출 없음
- 모든 터치 대상 44×44px 이상 (Chip · Compact · Toggle 의 투명 hit area 포함)
- 아이콘 전용 버튼의 접근 가능한 이름
- 66칸 진행판의 `role="img"` · 요약 `aria-label` · 색 외 표시 · 표시 전용
- Modal 포커스 트랩 · Escape 닫기 · 포커스 복귀
- 키보드만으로 인증 완료
- 브라우저 뒤로 가기 기록
- 확정 색상 토큰과 대표 컬러 위 검정 텍스트
- 외부 이미지 URL · placeholder 없음
- 이미지 실패 시 레이아웃 유지
- 새로고침 후 상태 유지, 손상된 `localStorage` 복구
