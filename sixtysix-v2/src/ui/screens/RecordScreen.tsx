import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/AppProvider';
import { AppHeader } from '../components/AppHeader';
import { Num } from '../components/Num';
import { ProgressBoard, LEGEND } from '../components/ProgressBoard';
import { getProgress, getDayStatus, getFilledDays } from '../../domain/selectors/progress';
import { getCheckinByDay, getCheckinKind } from '../../domain/selectors/checkin';
import { policyFor } from '../../domain/policies';

export function RecordScreen() {
  const { world, ctx, myMembershipId, today, cohort } = useApp();
  const facts = world.facts;
  const [selected, setSelected] = useState<number | null>(null);

  const progress = getProgress(facts, myMembershipId, ctx);
  const filled = getFilledDays(facts, myMembershipId, today);
  const policy = policyFor(cohort.policyVersion);

  // 진행판에서 고른 날짜로 목록을 움직인다 (P2-F)
  const itemRefs = useRef(new Map<number, HTMLLIElement>());
  useEffect(() => {
    if (selected === null) return;
    itemRefs.current.get(selected)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selected]);

  const days = Array.from({ length: today }, (_, i) => today - i);

  return (
    <>
      <AppHeader title="기록" sub={`66일 중 ${progress.filled}일을 채웠어요`} />
      <main className="screen">
        <h1 className="sr-only">기록</h1>

        <section className="section">
          <ProgressBoard
            facts={facts}
            membershipId={myMembershipId}
            ctx={ctx}
            totalDays={cohort.durationDays}
            selectedDay={selected}
            onSelect={setSelected}
          />
          <ul className="legend">
            {LEGEND.map(([k, label]) => (
              <li key={k} className="legend__item">
                <span className={`cell cell--${k} legend__swatch`} aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
          <p className="meta">
            칸을 누르면 아래 목록이 그 날짜로 이동해요. 방향키로도 옮길 수 있어요.
          </p>
        </section>

        <section className="stat-row">
          <div className="stat">
            <span className="stat__label">현재 연속</span>
            <span className="stat__value"><Num size={26}>{progress.streak}</Num>일</span>
          </div>
          <div className="stat">
            <span className="stat__label">채운 날</span>
            <span className="stat__value"><Num size={26}>{progress.filled}</Num>일</span>
            <span className="stat__sub">인증 {progress.checkins} · 면제권 {progress.passes}</span>
          </div>
          <div className="stat">
            <span className="stat__label">남은 면제권</span>
            <span className="stat__value"><Num size={26}>{progress.passesLeft}</Num>회</span>
            <span className="stat__sub">{policy.passLimit}회 중</span>
          </div>
        </section>

        <section className="section">
          <h2 className="section__title">내 인증</h2>
          <ul className="record-list">
            {days.map((day) => {
              const st = getDayStatus(day, facts, myMembershipId, ctx);
              const c = getCheckinByDay(facts, myMembershipId, day);
              const kind = c ? getCheckinKind(c, cohort, filled) : null;
              const on = selected === day;
              return (
                <li
                  key={day}
                  ref={(el) => { if (el) itemRefs.current.set(day, el); }}
                  className={on ? 'record is-selected' : 'record'}
                  onClick={() => setSelected(day)}
                >
                  <span className="record__day">
                    <Num size={20}>{day}</Num>
                    <i>일차</i>
                  </span>
                  <span className="record__body">
                    {c ? (
                      <>
                        <span className="record__text">{c.text}</span>
                        <span className="record__badges">
                          {kind?.late && <span className="badge">늦은 인증</span>}
                          {kind?.simple && <span className="badge">간단 인증</span>}
                          {c.visibility === 'private' && <span className="badge">나만 보기</span>}
                        </span>
                      </>
                    ) : st === 'pass' ? (
                      <span className="record__text record__text--muted">면제권을 썼어요</span>
                    ) : st === 'today' ? (
                      <span className="record__text record__text--muted">아직 오늘 인증 전이에요</span>
                    ) : (
                      <span className="record__text record__text--muted">이 날은 비어 있어요</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </>
  );
}
