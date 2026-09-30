/**
 * 흐름 정합성 — 화면이 말하는 것과 저장 상태가 같은가.
 *
 * 2026-09-30 점검에서 찾은 다섯 건을 여기서 붙잡아 둔다.
 * 전부 「테스트 133개가 통과하는데도」 있던 문제다. 화면 하나씩은 맞고 흐름에서 어긋났다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider, useApp, type AppValue } from '../../app/AppProvider';
import { App } from '../App';
import { ComposeScreen } from '../screens/ComposeScreen';
import { SERVICE_TIME_ZONE, epochForZonedTime } from '../../infrastructure/timezone';

let app!: AppValue;
function Probe() { app = useApp(); return null; }

/** 다시 마운트하면 앞 화면은 내린다. 저장소(localStorage)는 그대로 — 새로고침과 같다 */
function mount(path: string, ui: React.ReactNode = <App />) {
  cleanup();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider><Probe />{ui}</AppProvider>
    </MemoryRouter>,
  );
}

const myCheckins = () => app.world.facts.checkins.filter((c) => c.membershipId === app.myMembershipId);

beforeEach(() => localStorage.clear());

describe('온보딩 — 말한 날이 1일차다', () => {
  it('안내 문구의 시작일과 실제 시작일이 같다', () => {
    mount('/onboarding');
    // 데모 기본 시각 9월 8일 오전 9시
    expect(screen.getByText(/9월 8일이 1일차예요/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /아침 러닝/ }));
    fireEvent.click(screen.getByRole('button', { name: '아침 러닝으로 시작하기' }));

    expect(app.state.cohortStart).toBe('2026-09-08');
    expect(app.today).toBe(1);
    expect(document.querySelector('.hero__day')?.textContent).toMatch(/^D\+1\//);
    expect(screen.getByText('오늘이 첫날이에요')).toBeInTheDocument();
  });

  it('새벽 2시에 시작해도 0일차가 아니라 1일차다', () => {
    mount('/onboarding');
    act(() => app.setDemoAt(epochForZonedTime(2026, 9, 9, 2, 0, SERVICE_TIME_ZONE)));
    act(() => app.completeOnboarding('h-reading'));
    expect(app.today).toBe(1);
    expect(app.availability).toMatchObject({ ok: true, cohortDay: 1 });
  });
});

describe('인증 작성 — 내 코호트의 습관을 말한다', () => {
  it('아침 러닝을 고르면 인증 화면도 아침 러닝이다 (목록 첫 번째가 아니다)', () => {
    mount('/onboarding');
    act(() => app.completeOnboarding('h-running'));
    mount('/checkin', <ComposeScreen />);
    expect(screen.getByText(/2026년 9월 8일 · 아침 러닝/)).toBeInTheDocument();
    expect(screen.queryByText(/독서 15분/)).toBeNull();
  });
});

describe('쓰기 방어 — 버튼이 아니라 쓰기 경로가 막는다', () => {
  it('같은 날 두 번 남겨도 하나만 들어간다 (더블클릭)', () => {
    mount('/home');
    act(() => app.completeOnboarding('h-reading'));
    const before = myCheckins().length;

    act(() => {
      app.addCheckin({ text: '한 번', visibility: 'cohort' });
      app.addCheckin({ text: '두 번', visibility: 'cohort' });   // 같은 렌더 — 리듀서가 막는다
    });
    expect(myCheckins().length).toBe(before + 1);

    let r!: ReturnType<AppValue['addCheckin']>;
    act(() => { r = app.addCheckin({ text: '세 번', visibility: 'cohort' }); });
    expect(r).toEqual({ ok: false, reason: 'filled' });
    expect(myCheckins().length).toBe(before + 1);
  });

  it('이미 남긴 날 /checkin 에 직접 들어오면 작성 폼 대신 안내가 나온다', () => {
    mount('/home');
    act(() => app.completeOnboarding('h-reading'));
    act(() => { app.addCheckin({ text: '오늘도', visibility: 'cohort' }); });
    mount('/checkin', <ComposeScreen />);
    expect(screen.getByText('이 날 인증은 이미 남겼어요')).toBeInTheDocument();
    expect(screen.queryByLabelText('오늘의 한 줄')).toBeNull();
  });

  it('66일이 끝난 뒤에는 남길 수 없다', () => {
    mount('/home');
    act(() => app.completeOnboarding('h-reading'));   // 9/8 시작 → 66일차 11/12
    act(() => app.setDemoAt(epochForZonedTime(2026, 11, 20, 9, 0, SERVICE_TIME_ZONE)));

    let r!: ReturnType<AppValue['addCheckin']>;
    act(() => { r = app.addCheckin({ text: '늦었다', visibility: 'cohort' }); });
    expect(r).toEqual({ ok: false, reason: 'ended' });

    mount('/checkin', <ComposeScreen />);
    expect(screen.getByText('66일이 끝났어요')).toBeInTheDocument();
  });

  it('빈 한 줄 · 정책보다 긴 한 줄은 쓰기 경로에서 거절된다', () => {
    mount('/home');
    act(() => app.completeOnboarding('h-reading'));
    let r!: ReturnType<AppValue['addCheckin']>;
    act(() => { r = app.addCheckin({ text: '   ', visibility: 'cohort' }); });
    expect(r).toEqual({ ok: false, reason: 'text' });
    act(() => { r = app.addCheckin({ text: '가'.repeat(41), visibility: 'cohort' }); });
    expect(r).toEqual({ ok: false, reason: 'text' });
  });
});

describe('처음부터 시작하기 — 기록만 비우지 않는다', () => {
  it('진행 중 상태에서 처음부터를 누르면 1일차 · 인증 0회다', () => {
    mount('/home');
    act(() => app.startSeeded());
    expect(app.today).toBe(23);
    act(() => app.startFresh());
    expect(app.today).toBe(1);
    expect(myCheckins()).toHaveLength(0);
    expect(app.availability).toMatchObject({ ok: true, cohortDay: 1 });
  });
});

describe('세계 전환 — 설정까지 그 세계의 것으로', () => {
  it('데모와 실제는 습관 · 시작일 · 온보딩 여부를 따로 가진다', () => {
    mount('/home');
    act(() => app.completeOnboarding('h-running'));
    const demoStart = app.state.cohortStart;

    act(() => app.setWorld('real'));
    // 실제 세계에는 아직 아무것도 없다 — 데모의 러닝 설정을 들고 오지 않는다
    expect(app.state.onboarded).toBe(false);
    expect(app.state.habitId).toBe('h-reading');
    expect(myCheckins()).toHaveLength(0);

    act(() => app.completeOnboarding('h-english'));
    act(() => app.setWorld('demo'));
    expect(app.state.onboarded).toBe(true);
    expect(app.state.habitId).toBe('h-running');
    expect(app.state.cohortStart).toBe(demoStart);

    act(() => app.setWorld('real'));
    expect(app.state.habitId).toBe('h-english');
  });

  it('실제 세계로 넘어가 온보딩에 들어가도 데모로 돌아갈 길이 있다', () => {
    mount('/home');
    act(() => app.completeOnboarding('h-reading'));
    act(() => app.setWorld('real'));
    mount('/onboarding');
    fireEvent.click(screen.getByRole('button', { name: '데모 시간으로 돌아가기' }));
    expect(app.isDemo).toBe(true);
  });
});

describe('실제 시간은 흐른다', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('가만히 있어도 now 가 다시 읽힌다', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date(epochForZonedTime(2026, 9, 30, 9, 0, SERVICE_TIME_ZONE)));

    mount('/home');
    act(() => app.setWorld('real'));
    const t0 = app.now.getTime();

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(app.now.getTime() - t0).toBeGreaterThanOrEqual(60_000);
  });

  it('데모 시계는 사용자가 옮길 때만 움직인다', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    mount('/home');
    const t0 = app.now.getTime();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(app.now.getTime()).toBe(t0);
  });
});
