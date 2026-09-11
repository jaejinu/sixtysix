import { useApp } from '../../app/AppProvider';
import { SERVICE_TIME_ZONE, zonedParts } from '../../infrastructure/timezone';

/**
 * 데모 시계를 화면이 밝힌다.
 * V1 은 마이 깊숙이 숨겨 뒀고, 그래서 "왜 날짜가 안 바뀌죠" 가 나왔다.
 */
export function DemoClockBar() {
  const { isDemo, now, today, advanceDemoDays } = useApp();
  if (!isDemo) return null;

  const p = zonedParts(now.getTime(), SERVICE_TIME_ZONE);

  return (
    <div className="demo-bar">
      <svg viewBox="0 0 24 24" className="demo-bar__icon" aria-hidden="true" fill="currentColor">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.2l3.6 2.1-1 1.7L11 13V7z" />
      </svg>
      <p className="demo-bar__text">
        데모 시간 · {p.year}년 {p.month}월 {p.day}일 (D+{today})
      </p>
      <div className="demo-bar__actions">
        <button type="button" className="demo-bar__btn" onClick={() => advanceDemoDays(-1)}
                aria-label="하루 전으로">−1일</button>
        <button type="button" className="demo-bar__btn" onClick={() => advanceDemoDays(1)}
                aria-label="하루 뒤로">+1일</button>
      </div>
    </div>
  );
}
