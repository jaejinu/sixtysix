import { useNavigate } from 'react-router-dom';
import { useApp } from '../../app/AppProvider';
import { AppHeader } from '../components/AppHeader';
import { Num } from '../components/Num';
import { getProgress } from '../../domain/selectors/progress';
import { getEarnedBadges, BADGES } from '../../domain/selectors/badges';
import { getHabitOf, getCohortName } from '../../domain/selectors/membership';
import { SERVICE_TIME_ZONE, zonedParts } from '../../infrastructure/timezone';

export function MyScreen() {
  const {
    world, ctx, myMembershipId, isDemo, now,
    state, setDefaultVisibility, setWorld, startFresh, startSeeded, advanceDemoDays, cohort } = useApp();
  const facts = world.facts;
  const nav = useNavigate();

  const progress = getProgress(facts, myMembershipId, ctx);
  const earned = getEarnedBadges(facts, myMembershipId, ctx);
  const earnedIds = new Set(earned.map((e) => e.badgeId));
  const habit = getHabitOf(facts, myMembershipId);
  const cohortName = getCohortName(facts, cohort);
  const p = zonedParts(now.getTime(), SERVICE_TIME_ZONE);

  return (
    <>
      <AppHeader />
      <main className="screen">
        <h1 className="sr-only">마이</h1>

        <section className="profile">
          <img className="profile__avatar" src={`/images/${habit.imageRef}.webp`} alt="" width={64} height={64} />
          <div>
            <p className="profile__name">재진</p>
            <p className="meta">{cohortName}<br />{habit.goal} · {cohort.startDate} 시작</p>
          </div>
        </section>

        <section className="card">
          <div className="profile-stats">
            <div><Num size={26}>{progress.filled}</Num><span>채운 날</span></div>
            <div><Num size={26}>{progress.streak}</Num><span>현재 연속</span></div>
            <div><Num size={26}>{earned.length}</Num><span>배지</span></div>
          </div>
          <hr className="rule" />
          <p className="meta">66일 중 {progress.filled}일 완료 · {progress.percent}%</p>
          <div className="bar" role="img" aria-label={`${progress.percent}퍼센트`}>
            <span className="bar__fill" style={{ width: `${progress.percent}%` }} />
          </div>
        </section>

        <section className="section">
          <h2 className="section__title">내 배지</h2>
          <ul className="badge-grid">
            {BADGES.map((b) => {
              const on = earnedIds.has(b.id);
              const at = earned.find((e) => e.badgeId === b.id)?.earnedAtDay;
              return (
                <li key={b.id} className={on ? 'badge-tile is-on' : 'badge-tile'}>
                  <b>{b.name}</b>
                  <i>{on ? `${at}일차에 받음` : b.condition}</i>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="section">
          <h2 className="section__title">설정</h2>

          <div className="settings">
            <p className="settings__label">인증</p>
            <div className="settings__card">
              <div className="row">
                <span>공개 기본값</span>
                <button
                  type="button" role="switch"
                  aria-checked={state.defaultVisibility === 'cohort'}
                  aria-label="공개 기본값을 코호트 공개로"
                  className={state.defaultVisibility === 'cohort' ? 'toggle is-on' : 'toggle'}
                  onClick={() => setDefaultVisibility(state.defaultVisibility === 'cohort' ? 'private' : 'cohort')}
                />
              </div>
              <div className="row">
                <span>내 코호트</span>
                <i className="row__value">{cohortName}</i>
              </div>
            </div>
          </div>

          {/* 데모 컨트롤 — P2-D 를 문구가 아니라 분기로 푼 자리 */}
          <div className="settings">
            <p className="settings__label">데모</p>
            <div className="settings__card">
              <div className="row">
                <span>시계</span>
                <i className="row__value">
                  {isDemo ? `데모 · ${p.year}.${p.month}.${p.day}` : '실제 시간'}
                </i>
              </div>
              <div className="row">
                <span>날짜 이동</span>
                <span className="row__buttons">
                  <button type="button" className="chip" onClick={() => advanceDemoDays(-1)} disabled={!isDemo}>−1일</button>
                  <button type="button" className="chip" onClick={() => advanceDemoDays(1)} disabled={!isDemo}>+1일</button>
                </span>
              </div>
              <div className="row">
                <span>시계 모드</span>
                <span className="row__buttons">
                  <button type="button" className={isDemo ? 'chip is-on' : 'chip'} onClick={() => setWorld('demo')}>데모</button>
                  <button type="button" className={!isDemo ? 'chip is-on' : 'chip'} onClick={() => setWorld('real')}>실제</button>
                </span>
              </div>
            </div>
          </div>

          <div className="settings">
            <p className="settings__label">시작 지점</p>
            <div className="settings__card">
              <div className="row row--stack">
                <span>
                  <b>지금은 {state.checkins.length > 0 ? '진행 중인 상태' : '0일차'}로 보고 있어요</b>
                  <i>
                    온보딩을 마치면 그날이 1일차예요. 「둘러보기」는 데모 기준 코호트(독서 15분 · 8/17 시작)로
                    바꾸고 D+23 상태를 보여줍니다.
                  </i>
                </span>
              </div>
              <div className="row">
                <span className="row__buttons row__buttons--wide">
                  <button type="button" className="chip" onClick={startFresh}>처음부터 시작하기</button>
                  <button type="button" className="chip" onClick={startSeeded}>진행 중인 상태로 둘러보기</button>
                </span>
              </div>
            </div>
          </div>
        </section>

        <button type="button" className="btn btn--ghost btn--block" onClick={() => nav('/cohort')}>
          코호트 보기
        </button>

        <p className="sample-note">샘플 데이터로 만든 데모입니다. 로그인과 실제 알림은 없어요.</p>
      </main>
    </>
  );
}
