# 카카오·계정 연결 구현

## 개요

2026-10-05. 기존 이메일 로그인·인증 코어에 카카오 OAuth와 재인증/연결 HTTP 흐름을 추가한다. 최초 로그인, 기존 수단 재인증, 새 수단 연결을 서버가 기록한 목적별로 처리한다. 카카오 이메일은 계정 검색에 사용하지 않는다.

## 구현 기준

- OAuth state는 무작위 256비트, DB에는 hash만 저장. 5분 만료·브라우저 바인딩·1회 소비 후 서버 코드 교환.
- 카카오 REST API 키·client secret과 고정 callback 주소를 사용한다. 공급자 토큰·오류 원문은 응답/URL/로그/DB에 저장하지 않는다.
- 인가 URL과 복귀 URL을 고정 allowlist로 제한한다. 카카오 재인증은 prompt=login, 시작한 세션과 기존 provider ID 일치를 요구한다.
- 이메일/카카오 연결 intent는 사용자·현재 세션·브라우저·목적·대상 수단에 바인딩한다. 검증 후 별도 complete 호출에서만 연결한다.
- 이메일 로그인용 공개 요청에 purpose를 추가하지 않는다. 이메일 재인증/연결은 인증된 intent 라우트로만 시작한다.
- 카카오 앱이 아직 없으므로 가짜 공급자 HTTP와 실제 PostgreSQL로 검증한다. 실제 카카오 동의·메일 배달·React 로그인 UI는 별도 검수다.

## 구현 결과

- [`kakao-provider.ts`](../sixtysix-v2/server/auth/kakao-provider.ts): 고정 카카오 authorize/token/user-me endpoint, S256 PKCE, client secret, 요청별 10초 timeout, redirect 추적 금지, 원문 오류 제거. provider ID를 Node 22 JSON source context로 읽어 64비트 숫자의 정밀도를 보존한다. 참고 이메일·닉네임·토큰을 버리고 ID만 반환한다.
- [`kakao-login.ts`](../sixtysix-v2/server/auth/kakao-login.ts): state hash·5분 만료·브라우저 결합·DB 원자적 선점. provider 호출 전에 state를 소비하므로 동시 콜백이 코드를 두 번 교환하지 않는다. 실패/취소 뒤 재시도는 새 흐름으로 시작한다.
- [`auth-intents.ts`](../sixtysix-v2/server/auth/auth-intents.ts): 사용자 세션·브라우저·기존/새 대상 수단에 결합된 intent. 재인증은 선택한 기존 identity와 일치할 때만 같은 세션의 최근 인증 시각을 갱신한다. 연결 검증은 서버 proof만 보관하며 complete 호출이 실제 연결을 수행한다.
- [`account-routes.ts`](../sixtysix-v2/server/auth/account-routes.ts): 카카오 시작/콜백, 재인증 intent, 연결 intent/complete, 수단 해제 HTTP 구현. 이메일 검증 라우트도 저장된 intent의 목적을 읽어 재인증/연결을 처리한다. 재인증/연결은 세션 쿠키를 새 로그인으로 교체하지 않는다.
- [`004_auth_intents_oauth.sql`](../backend/db/004_auth_intents_oauth.sql): auth_intents·oauth_states, 기존 이메일 challenge 목적/intent 확장. **실제 Neon Preview 적용 완료**, 기존 001~003 checksum 유지. 총 업무/인증 테이블 24개, public migration 이력 별도.
- 요청 제한은 공통 DB limiter로 분리했다. OAuth 시작은 브라우저 시간당 20건·IP 시간당 100건, intent 생성은 세션 10분당 20건. 이메일 제한은 이전 정책을 유지한다.

카카오 규격은 [공식 REST API 문서](https://developers.kakao.com/docs/ko/kakaologin/rest-api)를 확인했다. `prompt=login`은 카카오 인앱 브라우저에서 지원하지 않아 알려진 KAKAOTALK User-Agent의 재인증 시작을 거부한다. 이 검사는 공급자의 실제 재인증 행위를 보증하지 않으므로 지원 브라우저·실계정 검수는 별도로 필요하다. 공급자의 OIDC 메타데이터에 S256 지원이 명시되어 이를 요청하지만, 아직 실앱 PKCE 왕복을 검수하지 않았다.

## 검증

- 실제 PostgreSQL/HTTP 통합 **45개 통과**: 기존 31개 + OAuth/intent 14개. state 재사용·다른 브라우저·만료·취소·동시 callback·교환 실패·잘못된 복귀 URL, 양방향 연결·재인증, 다른 provider ID와 세션, provider 호출 중 로그아웃, HTTP 쿠키/연결/해제/마지막 수단 보호, OAuth 공유 제한을 확인했다.
- Vitest **191개 통과**: provider 요청 형식·PKCE 대응·64비트 ID·이메일 없는 응답·비정상 ID·설정 누락·원문 오류 제거·HTTP 시작 방어 포함.
- OpenAPI 46경로·입력 계약 14개, 프런트/서버 타입 검사·Vite 및 **Vercel 로컬 Preview 빌드/산출물 검증 통과**.
- 실제 외부 카카오/메일 호출은 하지 않았다. provider는 fake HTTP/port, DB는 로컬 임시 DB로 테스트했다. 원격은 migration과 스키마·조회 API 읽기 검증만 수행한다.

## 실서비스 설정과 완료 경계

서버 환경 변수는 기존 `APP_ORIGIN`, `AUTH_CONTEXT_SECRET` 외에 `KAKAO_CLIENT_ID`(REST API 키), `KAKAO_CLIENT_SECRET`이다. callback은 환경 변수 origin에서 `${APP_ORIGIN}/v1/auth/kakao/callback`으로 고정한다. 카카오 개발자 콘솔에 정확히 같은 주소를 등록해야 한다. 클라이언트가 callback 주소를 고를 수 없고 VITE_ 변수로 키를 노출하지 않는다.

인가 scope는 `profile_nickname`, 이메일은 요청하거나 로그인 조건으로 삼지 않는다. OIDC ID 토큰은 로그인 근거로 사용하지 않는다. 서비스 로그아웃/수단 해제는 내부 세션·identity 처리이며 카카오 계정 자체 로그아웃/앱 연결 해제 API 호출과 다르다.

카카오 성공 복귀는 `/home`, `/my`, `/onboarding`만 허용한다. 연결/재인증 복귀는 `/my?auth=COMPLETE_LINK|REAUTHENTICATED&intentId=...`, 실패는 `/my?authError=공개코드`. React가 아직 이 결과를 처리하지 않으므로 화면 연결은 다음 단계다.

## 장애·동시성 경계

provider HTTP 호출 동안 DB transaction을 유지하지 않는다. state 소비 뒤 네트워크/DB 오류가 나면 새 흐름을 요청한다. 원문 코드는 DB에 남기지 않으며 API 응답에서 복구용 proof/token을 공개하지 않는다.

intent 생성·proof 저장·코어 변경은 단계별 트랜잭션이다. 완료 표시 전 장애가 나도 코어의 proof/link intent 단일 소비가 중복 변경을 막는다. 실패 시 만료 대기 중인 intent/proof가 남을 수 있어 자동 정리 작업이 필요하다. 단계별 장애에서 자동 재발급/재시도 성공을 보장하지 않는다.

## 다음 작업

1. `/v1/me` 현재 사용자·수단 조회, 로그인/재인증/연결 화면과 callback 결과 처리.
2. 카카오 앱·메일 발송 도메인 및 키 설정, 지원 브라우저에서 실제 로그인·동의 취소·PKCE·재인증 E2E.
3. 공개 서비스 전 런타임 DB 역할 분리, 인증 감사 기록, 만료/실패 데이터 정리·개인정보 보관/삭제 정책.

현재는 공급자 계정 미개설·키 미등록이며 앱/Production 배포를 하지 않았다. 소스 공개 가능성 검토는 [별도 기록](PUBLIC-REPOSITORY-REVIEW.md)이다.

### 로그인 화면 연결 후속 — 2026-10-05

[`/v1/me`·로그인/계정 UI](LOGIN-UI-IMPLEMENTATION.md)를 구현했다. OTP·카카오 callback·재인증·연결/해제·로그아웃을 서버 API에 연결하고 데모 데이터와 분리했다. Vitest 204개·DB/HTTP 47개 통과. 실제 공급자 검수·운영 DB 권한 분리·실제 모집/참여 저장은 후속이다.
