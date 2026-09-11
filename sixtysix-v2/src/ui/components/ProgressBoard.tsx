import { useRef } from 'react';
import type { Facts, Ctx, DayStatus } from '../../domain/types';
import { getDayStatus } from '../../domain/selectors/progress';

/**
 * 66칸 진행판. 11열 × 6행은 키 비주얼이라 바꾸지 않는다.
 *
 * P2-F — V1 은 34px 타일이 44px 에 못 미친다고 클릭을 아예 없앴다.
 * 44px 은 WCAG 2.5.5 (AAA) 이고, AA 기준인 2.5.8 은 24px 이다. 34px 은 AA 를 통과한다.
 * 기능을 없애는 대신 방향키 이동을 붙여서 푼다 — 작은 표적의 진짜 해답은 크기가 아니라 키보드다.
 */
const LABEL: Record<DayStatus, string> = {
  done: '인증 완료', late: '늦은 인증', pass: '면제권', miss: '미인증', today: '오늘', future: '남은 날',
};

export function ProgressBoard({
  facts, membershipId, ctx, totalDays, selectedDay, onSelect,
}: {
  facts: Facts;
  membershipId: string;
  ctx: Ctx;
  totalDays: number;
  selectedDay: number | null;
  onSelect: (day: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  const statuses = days.map((d) => getDayStatus(d, facts, membershipId, ctx));
  const COLS = 11;

  // 로빙 탭인덱스 — 격자 전체가 탭 정지점 하나를 갖는다
  const focusDay = selectedDay ?? days.find((_, i) => statuses[i] === 'today') ?? 1;

  function move(from: number, delta: number) {
    const next = Math.min(totalDays, Math.max(1, from + delta));
    onSelect(next);
    ref.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus();
  }

  return (
    <div
      ref={ref}
      className="board"
      role="group"
      aria-label={`66일 진행판. 방향키로 날짜를 옮깁니다`}
      onKeyDown={(e) => {
        const d = selectedDay ?? focusDay;
        const map: Record<string, number> = {
          ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS,
        };
        const delta = map[e.key];
        if (delta === undefined) return;
        e.preventDefault();
        move(d, delta);
      }}
    >
      {days.map((day, i) => {
        const st = statuses[i]!;
        const on = selectedDay === day;
        return (
          <button
            key={day}
            type="button"
            data-day={day}
            className={`cell cell--${st}${on ? ' is-selected' : ''}`}
            tabIndex={day === focusDay ? 0 : -1}
            aria-label={`${day}일차, ${LABEL[st]}`}
            aria-pressed={on}
            onClick={() => onSelect(day)}
          >
            <span className="sr-only">{day}</span>
          </button>
        );
      })}
    </div>
  );
}

export const LEGEND: ReadonlyArray<readonly [DayStatus, string]> = [
  ['done', '인증 완료'], ['late', '늦은 인증'], ['pass', '면제권'],
  ['miss', '아직'], ['future', '남은 날'],
];
