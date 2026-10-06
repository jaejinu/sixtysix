# 이메일 인증번호 구현

## 개요

2026-10-05. 인증 코어 다음 단계로 이메일 로그인 API를 구현한다. `/v1/auth/code` → `/v1/auth/verify` → HttpOnly 서비스 세션, `/v1/auth/logout`을 연결한다. 외부 이메일 공급자는 교체 가능한 인터페이스로 분리하고 Resend HTTP adapter를 준비한다. 공급자 계정·발송 도메인·키 설정과 실메일 검수는 아직 없다.

## 구현 기준

- 코드: 암호학적 무작위 6자리, 유효 5분, 오답 최대 3회. 원문 대신 별도 서버 비밀키의 HMAC만 DB 저장한다.
- 브라우저 검증 쿠키·CSRF·Origin 확인 후 발급/검증/로그아웃. 코드와 내부 증명은 응답·로그에 노출하지 않는다.
- 발급 제한은 DB에서 이메일·브라우저·IP별 공유한다. 이메일 60초 대기 및 시간당 5건, 브라우저 시간당 10건, IP 시간당 30건을 개발 기본값으로 둔다. 검증은 브라우저 10분당 30회, IP 10분당 120회. 429에 Retry-After를 제공한다.
- 발송 완료 전에는 코드 사용 불가. 공급자 호출 실패·타임아웃은 503, 발송 건은 실패 처리한다. 공급자 수락은 실제 배달 보장이 아니다.
- 동시에 정답을 제출해도 한 번만 검증 증명을 만들고 한 세션만 발급한다. 오답 횟수는 실패 응답에서도 커밋한다.
- 현재 공개 발급은 로그인 목적만 지원한다. 재인증/수단 연결 목적을 클라이언트가 임의 지정할 수 없다.

## 구현 결과

- [`EmailLogin`](../sixtysix-v2/server/auth/email-login.ts): 발급·HMAC 저장·공유 제한·오답/만료/바인딩 검사·서버 증명 발급·기존 IdentityCore 세션 연결.
- [`email-routes.ts`](../sixtysix-v2/server/auth/email-routes.ts): `POST /v1/auth/code` 202, `/v1/auth/verify` 200, `/v1/auth/logout` 204. 요청 필드 제한, CSRF/Origin, 429 Retry-After, HTTPS `__Host-sixtysix.session` 쿠키.
- [`resend-mailer.ts`](../sixtysix-v2/server/auth/resend-mailer.ts): 고정 HTTPS endpoint·10초 timeout·challenge 기반 멱등 키·공급자 오류 정보 제거. [Resend 공식 요청 형식](https://resend.com/docs/api-reference/emails/send-email)을 기준으로 작성했다. 발송 계정 개설·유료 계약·실제 발송은 하지 않았다.
- [`003_email_login.sql`](../backend/db/003_email_login.sql): email_challenges와 auth_rate_limits. **실제 Neon Preview 적용 완료**, 기존 001/002 checksum 유지. 총 테이블 22개(업무 17 + 인증 5), public migration 이력 별도.
- 요청 IP는 Vercel 배포에서만 플랫폼의 `x-forwarded-for`를 사용한다. 로컬에서는 socket IP를 사용하고 임의 forwarded header를 무시한다. 여러 IP/잘못된 형식은 거부하며 IPv6 표기를 정규화한다. 근거: [Vercel 요청 헤더](https://vercel.com/docs/headers/request-headers). 프록시 구성을 변경하면 신뢰 경계를 다시 검증해야 한다.

## 검증 결과

- 실제 PostgreSQL 통합 테스트 **31개 통과**(기존 계정 코어 17 + 이메일/HTTP 14). 6건 동시 오답, 복수 인스턴스 정답 중복, 발송 지연·실패, 주소 정규화, 만료·재사용·다른 브라우저, 이메일/브라우저/IP 발송 제한, 브라우저 회전 후 IP 검증 제한을 포함한다.
- HTTP 통합: CSRF·Origin 거부, 임의 purpose 입력 거부, 202→200→204, Retry-After, HttpOnly/Secure 쿠키, DB 세션 폐기 확인.
- Vitest **186개 통과**. 추가 5개는 공급자 요청/오류/timeout 처리, 설정 누락 503, IP 신뢰 경계, 세션 쿠키를 검증한다. timeout 테스트는 공급자 오류를 주입하며 실제 10초 네트워크 지연은 재현하지 않는다.
- 프런트·서버 타입 검사, Vite 빌드, **Vercel 로컬 Preview 빌드와 API/SPA rewrite·함수 산출물 확인 통과**. OpenAPI 46경로·입력 계약 14개 통과.
- 원격에서는 스키마·migration 이력·기존 조회 API만 읽기 검증한다. 실제 이메일 주소·테스트 계정은 로컬 임시 DB에만 저장하고 DB를 정리했다. 외부 이메일은 발송하지 않았다.

## 설정과 장애 처리

서버 환경 변수: `DATABASE_URL`, `APP_ORIGIN`, `AUTH_CONTEXT_SECRET`, **`AUTH_OTP_SECRET`(별도 난수 32자 이상)**, **`RESEND_API_KEY`**, **`AUTH_EMAIL_FROM`**. [예시](../sixtysix-v2/.env.example). 비밀값은 채팅·저장소·VITE_ 변수에 넣지 않는다. 인증/발송 변수는 아직 Vercel에 등록하지 않았다. 미설정 요청은 503이며 개발용 번호 반환이나 로그 출력으로 대체하지 않는다.

발송 DB 기록은 먼저 커밋하고 외부 호출을 실행한다. `pending`/`failed` 코드는 사용 불가하고, 공급자 수락 뒤 DB가 `sent`로 바뀌어야 사용할 수 있다. 외부 수락 이후 DB 장애가 나면 이메일이 도착해도 사용할 수 없으므로 새 코드를 요청한다. 자동 재발송 worker는 아직 없다.

정답 검증 시 코드 소비와 내부 증명 생성을 한 트랜잭션으로 커밋한다. 이후 계정 코어에서 증명을 소비해 세션을 발급한다. 이 단계에 장애가 나거나 응답을 잃으면 기존 코드로 세션을 재발급하지 않고 새 코드를 요청한다. 증명·세션 토큰은 HTTP 본문에 반환하지 않는다. 로그아웃은 DB 세션 폐기 성공 후 브라우저 쿠키를 만료한다.

발송 제한은 첫 허용 요청부터 시작하는 고정 구간이다. 새 코드를 요청해도 이전 코드는 각자의 5분 만료까지 남는다(각 코드 3회, 시간당 발급 5건, 검증 총량 제한). 정책 변경 시 별도 invalidate 규칙을 추가한다.

## 다음 작업

후속 갱신: [카카오 OAuth와 이메일/카카오 재인증·연결 HTTP](KAKAO-AUTH-IMPLEMENTATION.md)를 구현했다. 아래 1~2는 코드/가짜 공급자·DB 검증까지 완료됐으며 실계정·화면 연결은 남아 있다.

1. 카카오 OAuth state·콜백·서버 코드 교환과 provider ID 검증. 이메일 없는 계정 지원 및 자동 병합 방지 유지.
2. 이메일 재인증/수단 연결용 challenge와 HTTP intent 라우트. 현재 `/auth/code`는 **로그인만** 처리하며 purpose를 클라이언트에서 받지 않는다.
3. 로그인 화면·현재 사용자 조회 연결. React 앱은 아직 데모 저장소 사용.
4. Resend 계정·발송 도메인 검증·카카오 앱·redirect URI 설정 후 실계정 E2E.
5. 공개 배포 전 런타임 DB 역할 분리, 인증 감사 기록, 만료 challenge/증명/세션·rate bucket 정리 작업, 개인정보 보관·삭제 정책. 현재는 운영 배포하지 않았다.
