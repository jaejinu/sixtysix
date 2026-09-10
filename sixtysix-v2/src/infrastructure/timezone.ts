/**
 * 서비스 시간대.
 *
 * 브라우저 로컬 시간대에 기대면 해외에서 열었을 때 04:00 마감 규칙이 어긋난다.
 * 코호트가 한국 기준으로 운영되므로 정책에 시간대를 명시하고 여기서만 변환한다.
 */

export const SERVICE_TIME_ZONE = 'Asia/Seoul';

export interface ZonedParts {
  readonly year: number;
  readonly month: number; // 1..12
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** epoch ms 를 해당 시간대의 벽시계 값으로 바꾼다 */
export function zonedParts(epochMs: number, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(new Date(epochMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const hour = get('hour');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    // Intl 이 자정을 24 로 주는 구현이 있다
    hour: hour === 24 ? 0 : hour,
    minute: get('minute'),
  };
}

/**
 * 해당 시간대의 벽시계 값을 epoch ms 로 바꾼다.
 * day 가 그 달의 마지막 날을 넘어도 Date.UTC 가 알아서 넘긴다.
 */
export function epochForZonedTime(
  year: number, month: number, day: number, hour: number, minute: number, timeZone: string,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const p = zonedParts(guess, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return guess - (asUtc - guess);
}

/** 날짜만 비교한다. 시각은 무시한다. */
export function zonedDayNumber(epochMs: number, timeZone: string): number {
  const p = zonedParts(epochMs, timeZone);
  return Math.round(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000);
}

export function dayNumberOfIsoDate(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}
