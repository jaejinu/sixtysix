import type { ReactNode } from 'react';

/** Anton 숫자. 행간 100% 는 .num 에서 한 번만 정해진다 (결정 7). */
export function Num({ children, size }: { children: ReactNode; size: number }) {
  return <span className="num" style={{ fontSize: size }}>{children}</span>;
}
