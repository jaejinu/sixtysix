import { useState } from 'react';
import { useApp } from '../../app/AppProvider';
import { AppHeader } from '../components/AppHeader';
import { Num } from '../components/Num';
import { getCohortParticipation, getRanking } from '../../domain/selectors/ranking';
import { getMemberState } from '../../domain/selectors/progress';
import { getCohortName } from '../../domain/selectors/membership';
import type { MemberState } from '../../domain/types';

type Seg = 'today' | 'feed' | 'members';

/** 원 = 사람, 네모 = 날. 66칸 진행판과 모양으로 역할을 나눈다. */
const STATE_CLASS: Record<string, string> = {
  done: 'is-done', late: 'is-late', dormant: 'is-dormant',
};

export function CohortScreen() {
  const { world, myMembershipId, today, now, cohort } = useApp();
  const facts = world.facts;
  const [seg, setSeg] = useState<Seg>('today');

  const part = getCohortParticipation(facts, cohort, today, now);
  const percent = part.total > 0 ? Math.round((part.done / part.total) * 100) : 0;
  const ranking = getRanking(facts, cohort, now);
  const ctx = { now, cohort: cohort };

  const cells = facts.memberships
    .filter((m) => m.cohortId === cohort.id)
    .map((m) => {
      const checkin = facts.checkins.find((c) => c.membershipId === m.id && c.cohortDay === today);
      const st: MemberState = getMemberState(facts, m.id, ctx);
      const name = world.nameByMembership.get(m.id) ?? '?';
      const mine = m.id === myMembershipId;
      const kind = checkin ? 'done' : st === 'dormant' ? 'dormant' : 'pending';
      return { id: m.id, name, mine, kind, initial: mine ? '나' : name.slice(0, 1) };
    });

  const feed = facts.checkins
    .filter((c) => c.cohortDay === today && c.visibility === 'cohort')
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const me = ranking.find((r) => r.membershipId === myMembershipId);

  return (
    <>
      <AppHeader title="코호트" sub={`${getCohortName(facts, cohort)} · ${part.total}명`} />
      <main className="screen">
        <h1 className="sr-only">코호트</h1>

        <div className="segmented" role="tablist">
          {([['today','오늘'],['feed','피드'],['members','멤버']] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={seg === k}
                    className={seg === k ? 'segmented__item is-active' : 'segmented__item'}
                    onClick={() => setSeg(k)}>{label}</button>
          ))}
        </div>

        {seg === 'today' && (
          <>
            <section className="card">
              <p className="figure">
                <Num size={36}>{part.done}</Num>
                <span className="figure__label">/ {part.total}명이 오늘 인증했어요</span>
              </p>
              <div className="bar" role="img" aria-label={`${percent}퍼센트`}>
                <span className="bar__fill" style={{ width: `${percent}%` }} />
              </div>
              <p className="meta">늦은 인증 {part.late} · 휴면 {part.dormant} · 아직 {part.pending}</p>
            </section>

            <section className="section">
              <div className="card__head">
                <h2 className="section__title">우리의 오늘</h2>
                <span className="meta">원은 사람, 네모는 날</span>
              </div>
              <ul className="avatar-grid">
                {cells.map((c) => (
                  <li key={c.id}
                      className={`avatar ${STATE_CLASS[c.kind] ?? ''} ${c.mine ? 'is-me' : ''}`}
                      title={`${c.name} — ${c.kind === 'done' ? '인증 완료' : c.kind === 'dormant' ? '휴면' : '아직'}`}>
                    {c.initial}
                  </li>
                ))}
              </ul>
            </section>

            {me && (
              <section className="card card--mine">
                <p className="card__title">나 — {me.rank}위</p>
                <p className="meta">{me.checkins}일 인증 · 연속 {me.streak}일</p>
              </section>
            )}
          </>
        )}

        {seg === 'feed' && (
          <ul className="feed">
            {feed.length === 0 && <li className="meta">오늘은 아직 인증이 없어요.</li>}
            {feed.map((c) => (
              <li key={c.id} className="post">
                <div className="post__head">
                  <b>{world.nameByMembership.get(c.membershipId) ?? '멤버'}</b>
                  {c.membershipId === myMembershipId && <span className="badge badge--me">나</span>}
                </div>
                <p className="post__text">{c.text}</p>
                {c.photoRef && <img className="post__img" src={`/images/${c.photoRef}.webp`} alt="" loading="lazy" />}
              </li>
            ))}
          </ul>
        )}

        {seg === 'members' && (
          <ul className="member-list">
            {ranking.map((r) => (
              <li key={r.membershipId} className={r.membershipId === myMembershipId ? 'rank is-me' : 'rank'}>
                <span className="rank__no">{r.rank}</span>
                <span className="rank__name">{world.nameByMembership.get(r.membershipId) ?? '멤버'}</span>
                <span className="rank__meta">연속 {r.streak}일</span>
                <span className="rank__value"><Num size={18}>{r.checkins}</Num>일</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
