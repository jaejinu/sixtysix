# 인증 호환성 검증 — T03a

> 2026-10-05 · Better Auth 1.7.7 고정. **기본 구성 직접 채택 보류**.
> 사용자 요구: 이메일 인증번호·카카오 모두 제공, 명시적 계정 연결, 카카오 이메일 미제공 허용.

## 1. 실행 결과

[`backend/auth-spike/compatibility.test.mjs`](../backend/auth-spike/compatibility.test.mjs)는 실제 Better Auth handler·OTP 플러그인·Kakao provider를 실행한다. 이메일은 테스트 메모리함에만 저장하고 카카오 token/profile HTTP 응답은 가짜 응답으로 대체한다. 외부 메일이나 실제 카카오 로그인을 수행하지 않는다.

```sh
npm --prefix backend ci
npm --prefix backend run test:auth-spike
```

| 검증 | 관찰 결과 | 제품 계약과의 관계 |
|---|---|---|
| OTP 발급·검증·세션 | 성공, hash 저장·HttpOnly/Secure 쿠키 | 기본 기능 가능 |
| OTP 재사용·3회 오답·만료 | 거부 | 기대 동작 |
| 이메일을 주는 카카오 사용자 | provider 계정·세션 생성 | 가짜 HTTP 응답에서 성공 |
| 이메일을 주지 않는 카카오 사용자 | `email_not_found`, 세션 없음 | **GAP 1** |
| 이메일 계정 뒤 같은 이메일 카카오 로그인 | `disableImplicitLinking`으로 `account_not_linked` | 기대 동작 |
| 카카오 계정 뒤 같은 이메일 OTP 로그인 | 연결 절차 없이 기존 카카오 user로 로그인 | **GAP 2** |
| 로그인 상태에서 다른 이메일 카카오 명시적 연결 | 기존 user 유지 | 기대 동작 |
| OTP+카카오 계정에서 카카오 해제 | `FAILED_TO_UNLINK_LAST_ACCOUNT` | **GAP 3** |
| 타인 소유 카카오 연결 | 거부, 기존 소유자 유지 | 기대 동작 |
| OAuth state 재사용 | 추가 세션 생성 거부 | 기대 동작 |
| 로그아웃 | 현재 세션 제거 | 기대 동작 |

테스트 **12개 통과**는 위 관찰을 재현했다는 뜻이다. GAP 테스트는 제품 요구 충족을 뜻하지 않는다. 메모리 adapter를 사용하므로 DB 동시성·분산 rate limit·메일 배달·카카오 실계정 동의·운영 차단/탈퇴는 검증하지 않았다.

## 2. 원인과 결정

설치 패키지의 OAuth callback은 이메일이 없으면 일반 로그인 처리를 거부한다. email OTP는 provider identity가 아닌 `user.email`로 기존 계정을 찾는다. 따라서 OAuth 자동 연결 설정만으로 반대 방향인 OTP 진입을 제한할 수 없다. OTP 로그인은 별도 account 행을 만들지 않아 기본 마지막 계정 해제 판단과도 어긋난다.

관련 공식 기능: [Kakao provider](https://better-auth.com/docs/authentication/kakao), [이메일 OTP](https://better-auth.com/docs/plugins/email-otp), [계정 연결](https://better-auth.com/docs/concepts/users-accounts). 제품 적합성 판단은 문구 추측이 아니라 위 실행 결과에 근거한다.

**결정:** Better Auth 기본 라우트를 운영에 노출하지 않는다. 검증용 개발 의존성으로만 유지한다. 이메일 없는 카카오를 거부하거나 이메일만으로 수단을 합치는 방향으로 제품 요구를 변경하지 않는다. 후속으로 [인증 코어](AUTH-CORE-IMPLEMENTATION.md)와 별도 migration을 구현해 Preview에 적용했다. 공급자 검증/HTTP 연결은 아직 후속이다.

후속 구현은 서비스의 `provider + providerSubject`를 계정 소유권의 기준으로 삼아야 한다. OTP로 검증한 주소와 카카오에서 받은 참고 이메일을 구분한다. 연결 시 기존 로그인 수단 재인증과 새 수단 검증을 모두 요구하고, 해제 가능 여부는 실제 사용 가능한 수단으로 계산한다. 이 경계를 지원하는 adapter/인증 엔진을 재선정하거나 필요한 서비스 계층을 구현한 뒤 같은 사례를 **제품 기대 결과**로 다시 검증한다. 가짜 이메일로 충돌을 숨기거나 라이브러리 비공개 API로 세션을 강제로 발급하지 않는다.

## 3. 엔진 선택과 독립적으로 구현한 기반

`GET /v1/auth/context`와 [`browser-context.ts`](../sixtysix-v2/server/auth/browser-context.ts)를 추가했다.

- 브라우저별 서명 쿠키와 그 쿠키에 결합된 CSRF 토큰, 수명 15분.
- HTTPS의 HttpOnly/Secure/SameSite=Lax 및 `__Host-` 쿠키. 로컬 HTTP는 별도 이름.
- 변조·중복 쿠키·다른 브라우저의 토큰·다른 Origin·만료 거부.
- 비밀값 누락/짧은 값/잘못된 운영 origin은 503. 키나 원문 오류를 반환하지 않음.
- 기존 문맥은 만료까지 재사용해 새 탭이 기존 탭의 토큰을 무효화하지 않음.

설정은 `APP_ORIGIN`, `AUTH_CONTEXT_SECRET`이다. **이 문맥은 익명 브라우저 검증이며 로그인 세션이 아니다.** 이후 상태 변경 라우트가 `verifyContext`를 호출해야 하고, 로그인 후 사용자·세션·최근 재인증 검사는 추가로 필요하다. 현재 실제 로그인 라우트는 미구현이다.

## 4. 외부 서비스 준비

사용자 확인: 별도 Neon DB·카카오 개발자 앱·메일 발송 서비스가 아직 없었다. DB는 기존 Vercel Marketplace 연결로 무료 검수용 리소스를 생성했고 Preview 연결·업무 테이블 17개 적용을 완료했다. 최신 상태는 [Vercel 설정 문서](VERCEL-BACKEND-SETUP.md)를 따른다.

카카오 앱 생성·서비스 도메인·redirect URI 등록과 메일 발송 도메인 검증은 필요하다. 비밀키는 채팅에 붙이지 않고 Vercel 환경 변수/로컬 제외 파일에 둔다. 아직 선택되지 않은 메일 공급자 계정이나 유료 플랜은 생성하지 않았다.
