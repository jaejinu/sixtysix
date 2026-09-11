import { Link } from 'react-router-dom';
import { useApp } from '../../app/AppProvider';
import { AppHeader } from '../components/AppHeader';
import { DemoClockBar } from '../components/DemoClockBar';
import { Num } from '../components/Num';
import { DEMO_COHORT } from '../../app/catalog';
import { getProgress, getMemberState } from '../../domain/selectors/progress';
import { getCohortParticipation } from '../../domain/selectors/ranking';
import { getCheckins } from '../../domain/selectors/checkin';
import { getHabitOf, getCohortName } from '../../domain/selectors/membership';

/** 상태별 문안. 정책 문장을 그대로 노출하지 않는다 (유지 목록). */
const COPY: Record<string, { title: string; desc: string; cta: string; badge: string }> = {
  day0:    { title: '오늘이 첫날이에요',       desc: '30명이 같은 날 시작했어요.',                 cta: '첫 인증 남기기', badge: '오늘 시작' },
  ongoing: { title: '오늘 인증만 남았어요',     desc: '이어가는 중이에요. 오늘 남기면 하루 더예요.', cta: '인증 남기기',   badge: '오늘 인증 전' },
  done:    { title: '오늘 인증을 남겼어요',     desc: '내일 또 만나요.',                            cta: '코호트 피드 보기', badge: '인증 완료' },
  broken:  { title: '어제는 쉬었어요',          desc: '오늘 인증하면 다시 이어져요.',               cta: '오늘 인증 남기기', badge: '어제 미인증' },
  dormant: { title: '한동안 인증이 없었어요',   desc: '기록은 그대로 있어요. 오늘 한 번이면 다시 시작이에요.', cta: '복귀 인증하기', badge: '휴면' },
  ended:   { title: '66일이 끝났어요',          desc: '기록을 돌아볼 시간이에요.',                  cta: '졸업 화면 보기', badge: '완주' },
};

export function HomeScreen() {
  const { world, ctx, myMembershipId, today, now, addCheckin } = useApp();
  const facts = world.facts;

  const progress = getProgress(facts, myMembershipId, ctx);
  const state = getMemberState(facts, myMembershipId, ctx);
  const copy = COPY[state] ?? COPY.ongoing!;
  const habit = getHabitOf(facts, myMembershipId);
  const cohortName = getCohortName(facts, DEMO_COHORT);

  const part = getCohortParticipation(facts, DEMO_COHORT, today, now);
  const percent = part.total > 0 ? Math.round((part.done / part.total) * 100) : 0;

  const todayCheckins = facts.checkins
    .filter((c) => c.cohortDay === today && c.visibility === 'cohort')
    .slice()
    .sort((a, b) => (a.membershipId === myMembershipId ? -1 : b.membershipId === myMembershipId ? 1 : 0));

  const mineToday = getCheckins(facts, myMembershipId, today).some((c) => c.cohortDay === today);

  return (
    <>
      <AppHeader />
      <main className="screen">
        <h1 className="sr-only">오늘</h1>
        <DemoClockBar />

        {/* Hero — 사진과 면을 분리한다. 사진 위에 텍스트를 올리지 않는다 (V1-DIAGNOSIS §3.5) */}
        <section className="hero">
          <div className="hero__photo">
            <img src={`/images/${habit.imageRef}.webp`} alt="" width={394} height={200} />
            <span className="badge badge--float">{copy.badge}</span>
          </div>
          <div className="hero__body">
            <p className="hero__day">
              <Num size={64}>D+{today}</Num>
              <span className="hero__unit">/ {DEMO_COHORT.durationDays}일</span>
            </p>
            <h2 className="hero__title">{copy.title}</h2>
            <p className="hero__desc">{copy.desc}</p>
            <dl className="hero__metrics">
              <div><dt>연속</dt><dd><Num size={26}>{progress.streak}</Num><span>일</span></dd></div>
              <div><dt>채운 날</dt><dd><Num size={26}>{progress.filled}</Num><span>일</span></dd></div>
              <div><dt>남은 날</dt><dd><Num size={26}>{progress.remaining}</Num><span>일</span></dd></div>
            </dl>
          </div>
        </section>

        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={mineToday}
          onClick={() => addCheckin({ text: '오늘도 15분 읽었다', visibility: 'cohort' })}
        >
          {mineToday ? '오늘 인증 완료' : copy.cta}
        </button>

        {/* 코호트 현황 — V1 은 18 을 하드코딩했다. 이제 계산값이다 (P1-C) */}
        <section className="card">
          <div className="card__head">
            <h2 className="card__title">오늘 우리 코호트</h2>
            <Link to="/cohort" className="link">코호트 보기 →</Link>
          </div>
          <p className="figure">
            <Num size={36}>{part.done}</Num>
            <span className="figure__label">{part.total}명 중 오늘 인증 완료</span>
          </p>
          <div className="bar" role="img" aria-label={`${percent}퍼센트`}>
            <span className="bar__fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="meta">
            늦은 인증 {part.late}명 · 휴면 {part.dormant}명 · 아직 {part.pending}명
          </p>
        </section>

        {/* 오늘의 인증 — 내 인증이 포함된다 (P1-A) */}
        <section className="section">
          <div className="card__head">
            <h2 className="section__title">오늘의 인증</h2>
            <Link to="/cohort" className="link">전체 보기 →</Link>
          </div>
          {todayCheckins.length === 0 ? (
            <p className="meta">아직 아무도 인증하지 않았어요.</p>
          ) : (
            <ul className="rail">
              {todayCheckins.slice(0, 8).map((c) => {
                const mine = c.membershipId === myMembershipId;
                return (
                  <li key={c.id} className="vcard">
                    {c.photoRef
                      ? <img className="vcard__img" src={`/images/${c.photoRef}.webp`} alt="" loading="lazy" />
                      : <span className="vcard__quote">{c.text}</span>}
                    {c.photoRef ? <span className="vcard__scrim" /> : null}
                    {mine ? <span className="badge badge--me">나</span> : null}
                    <span className={c.photoRef ? 'vcard__body' : 'vcard__body vcard__body--ink'}>
                      <b>{world.nameByMembership.get(c.membershipId) ?? '멤버'}</b>
                      <i>D+{c.cohortDay}</i>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="sample-note">
          {cohortName} · 가상 멤버 29명과 함께하는 데모입니다.
        </p>
      </main>
    </>
  );
}
