/**
 * Clock — "지금 몇 시인가"만 답한다.
 *
 * 04:00 귀속 규칙은 여기 넣지 않는다.
 *   Clock  = 지금 몇 시인가
 *   Policy = 이 시각이 어느 cohortDay 에 귀속되는가
 *
 * Clock 이 일차를 계산하기 시작하면 Gate 1 의 정책 경계가 다시 흐려진다.
 *
 * 그리고 Clock 은 세계를 새로 만드는 장치가 아니다.
 * 이미 결정된 세계를 어디까지 보여줄지 정하는 커튼이다.
 */
import { SERVICE_TIME_ZONE, epochForZonedTime, zonedParts } from './timezone.js';

export interface Clock {
  /** epoch milliseconds */
  now(): number;
}

export class RealClock implements Clock {
  now(): number {
    return Date.now();
  }
}

export class DemoClock implements Clock {
  private currentTime: number;

  constructor(currentTime: number) {
    this.currentTime = currentTime;
  }

  now(): number {
    return this.currentTime;
  }

  set(time: number): void {
    this.currentTime = time;
  }

  /** 서비스 시간대 기준으로 날짜를 옮긴다. 벽시계 시각은 유지한다. */
  advanceByDays(days: number, timeZone: string = SERVICE_TIME_ZONE): void {
    const p = zonedParts(this.currentTime, timeZone);
    this.currentTime = epochForZonedTime(p.year, p.month, p.day + days, p.hour, p.minute, timeZone);
  }
}

/** 도메인 셀렉터는 Date 를 받는다. 경계에서 한 번만 변환한다. */
export function nowDate(clock: Clock): Date {
  return new Date(clock.now());
}

/** 서비스 시간대의 벽시계 값으로 DemoClock 을 만든다 */
export function demoClockAt(
  year: number, month: number, day: number, hour = 9, minute = 0,
  timeZone: string = SERVICE_TIME_ZONE,
): DemoClock {
  return new DemoClock(epochForZonedTime(year, month, day, hour, minute, timeZone));
}
