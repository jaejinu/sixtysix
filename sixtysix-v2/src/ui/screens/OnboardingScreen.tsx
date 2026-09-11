import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../app/AppProvider';
import { HABITS, COHORT_START } from '../../app/catalog';
import type { HabitId } from '../../domain/types';

/**
 * P2-D — V1 은 온보딩을 마치면 곧바로 D+23 · 21일 기록이 있었고
 * 「데모는 23일차부터 시작해요」라는 문구로 얼버무렸다. 덮은 것이지 푼 게 아니다.
 *
 * 여기서는 온보딩을 마치면 **0일차**다.
 * 진행 중인 상태는 마이 > 데모 > 시작 지점에서만 들어간다.
 */
export function OnboardingScreen() {
  const { completeOnboarding } = useApp();
  const nav = useNavigate();
  const [picked, setPicked] = useState<HabitId | null>(null);

  const habit = HABITS.find((h) => h.id === picked);

  return (
    <main className="screen onboarding">
      <h1 className="sr-only">습관 고르기</h1>

      <div className="onboarding__media">
        <img src="/images/hero-morning-desk.webp" alt="" />
      </div>

      <p className="onboarding__eyebrow">66일 습관 챌린지</p>
      <h2 className="onboarding__title">어떤 습관을 66일 동안 이어볼까요?</h2>
      <p className="onboarding__desc">하나만 고르면 같은 날 시작하는 30명 코호트에 들어갑니다.</p>

      <ul className="habit-list">
        {HABITS.map((h) => {
          const on = picked === h.id;
          return (
            <li key={h.id}>
              <button
                type="button"
                className={on ? 'hitem is-on' : 'hitem'}
                aria-pressed={on}
                onClick={() => setPicked(h.id)}
              >
                <img src={`/images/${h.imageRef}.webp`} alt="" loading="lazy" />
                <span className="hitem__body">
                  <b>{h.name}</b>
                  <i>{h.goal}</i>
                </span>
                <span className="hitem__check" aria-hidden="true">{on ? '✓' : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="sample-note">
        샘플 데이터로 만든 데모입니다. 실제 코호트 매칭과 알림은 동작하지 않아요.
        {habit ? ` 「${habit.name}」 코호트는 ${COHORT_START}에 시작했어요.` : ''}
      </p>

      <div className="sticky-bar">
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={!picked}
          onClick={() => { completeOnboarding(picked!); nav('/home', { replace: true }); }}
        >
          {habit ? `${habit.name}으로 시작하기` : '이 습관으로 시작하기'}
        </button>
        <p className="onboarding__foot-note">
          0일차부터 시작해요. 진행 중인 상태는 마이 &gt; 데모에서 볼 수 있어요.
        </p>
      </div>
    </main>
  );
}
