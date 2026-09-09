# 육십육 V2 — 도메인

`v2/V2-SCOPE.md` 결정 3의 Gate 1 구현이다.

## Gate 1 의 범위

포함: 타입 · 정책 · 파생 함수(selector) · 불변식 검증 · 단위 테스트

**일부러 제외한 것**

```
❌ React 컴포넌트
❌ localStorage repository
❌ DemoClock / RealClock
❌ 30명 코호트 시뮬레이터
```

Clock 을 먼저 넣으면 버그가 났을 때 데이터 문제인지 시뮬레이션 문제인지
날짜 문제인지 범인이 셋이 된다. Gate 1 에서는 `now` 를 인자로 받기만 한다.

## 실행

```bash
npm install
npm test        # 불변식 16개 + V1 baseline acceptance
npm run typecheck
```

## 종료 조건

1. 불변식 16개 통과
2. `V1_D23_BASELINE` fixture 에서
   `checkins 20 · passes 1 · filled 21 · streak 9 · rank 4` 재현

2번이 핵심이다. V1 과 V2 가 같은 사실에서 같은 수치를 내야
재설계 과정에서 정책을 바꾸지 않았다는 증거가 된다.
특히 rank 4 는 V1.1 에서 고친 랭킹 공정성 버그의 결과라
여기서 3 이 나오면 같은 실수를 반복한 것이다.
