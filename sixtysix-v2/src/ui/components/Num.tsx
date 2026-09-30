import type { ReactNode } from 'react';

/** Anton 숫자. 행간 100% 는 .num 에서, 크기는 결정 7 의 Display 단계에서만 고른다. */
export type NumSize = 'hero' | 'count' | 'stat' | 'inline' | 'list';

export function Num({ children, size }: { children: ReactNode; size: NumSize }) {
  return <span className={`num num--${size}`}>{children}</span>;
}
