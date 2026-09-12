import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../app/AppProvider';
import { Num } from '../components/Num';
import { getDeadline, getLateWindowEnd, resolveCheckinTarget } from '../../domain/selectors/time';
import { getFilledDays } from '../../domain/selectors/progress';
import { policyFor } from '../../domain/policies';
import { SERVICE_TIME_ZONE, zonedParts } from '../../infrastructure/timezone';
import type { Visibility } from '../../domain/types';

const PHOTOS = ['habit-reading', 'habit-journal', 'habit-english', 'habit-water', 'habit-stretch'];

function hhmm(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

export function ComposeScreen() {
  const { world, myMembershipId, today, now, addCheckin, state, cohort } = useApp();
  const nav = useNavigate();

  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>(state.defaultVisibility);

  const policy = policyFor(cohort.policyVersion);
  const max = policy.textMaxLength;   // 화면이 숫자를 따로 갖지 않는다
  const filled = getFilledDays(world.facts, myMembershipId, today);
  const target = resolveCheckinTarget(now, cohort, filled);

  // 마감까지 남은 시간. P1-B — V1 은 04:00 마감을 문서에만 적어 두고 화면에 없었다.
  const deadline = getDeadline(cohort, target.cohortDay);
  const lateEnd = getLateWindowEnd(cohort, target.cohortDay);
  const inLateWindow = target.late;
  const until = (inLateWindow ? lateEnd : deadline).getTime() - now.getTime();
  const window = (inLateWindow ? lateEnd.getTime() - deadline.getTime() : 24 * 3600_000);
  const ratio = Math.max(0, Math.min(1, until / window));

  const p = zonedParts(now.getTime(), SERVICE_TIME_ZONE);

  return (
    <main className="screen screen--bar">
      <h1 className="sr-only">오늘 인증 남기기</h1>

      <header className="detail-header">
        <button type="button" className="icon-btn" onClick={() => nav(-1)} aria-label="뒤로">←</button>
        <p className="detail-header__title">오늘 인증</p>
        <span className="icon-btn" aria-hidden="true" />
      </header>

      <p className="compose__day">
        <Num size={64}>D+{target.cohortDay}</Num>
        <span className="meta">{p.year}년 {p.month}월 {p.day}일 · {world.facts.habits[0]?.name}</span>
      </p>

      {/* 마감까지 남은 시간 — 「오늘 안에」라는 긴장이 여기서 나온다 */}
      <section className={inLateWindow ? 'deadline is-late' : 'deadline'}>
        <p className="deadline__text">
          {inLateWindow
            ? <>어제({target.cohortDay}일차) 늦은 인증 창구 · <b>{hhmm(until)}</b> 남음</>
            : <>마감까지 <b>{hhmm(until)}</b> 남았어요</>}
        </p>
        <div className="bar" role="img" aria-label={`${Math.round(ratio * 100)}퍼센트 남음`}>
          <span className="bar__fill" style={{ width: `${ratio * 100}%` }} />
        </div>
        <p className="meta">
          {inLateWindow
            ? '연속 기록은 이어지고, 피드에는 늦은 인증으로 표시돼요.'
            : '마감은 내일 새벽 4시예요. 밤 습관도 그날로 인정돼요.'}
        </p>
      </section>

      <section className="section">
        <h2 className="section__title">사진 고르기</h2>
        <p className="meta">고르지 않으면 간단 인증으로 남아요.</p>
        <ul className="photo-grid">
          {PHOTOS.map((ref) => (
            <li key={ref}>
              <button
                type="button"
                className={photo === ref ? 'photo is-on' : 'photo'}
                aria-pressed={photo === ref}
                onClick={() => setPhoto(photo === ref ? null : ref)}
              >
                <img src={`/images/${ref}.webp`} alt="" loading="lazy" />
                {photo === ref && <span className="photo__check" aria-hidden="true">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2 className="section__title">한 줄 남기기</h2>
        <div className="oneline">
          <input
            type="text"
            maxLength={max}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="오늘 무엇을 했는지 한 줄로 남겨보세요"
            aria-label="오늘의 한 줄"
          />
          {/* 카운터는 입력 길이에서 파생한다. V1 은 0자인데 40 을 보여줬다 (§3.5) */}
          <span className="oneline__count">{text.length} / {max}</span>
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">공개 범위</h2>
        <div className="scope">
          <span>
            <b>{visibility === 'cohort' ? '코호트에 공개' : '나만 보기'}</b>
            <i>{visibility === 'cohort' ? '우리 코호트 30명이 볼 수 있어요' : '피드에 올라가지 않아요'}</i>
          </span>
          <button
            type="button" role="switch"
            aria-checked={visibility === 'cohort'}
            aria-label="공개 범위를 코호트 공개로"
            className={visibility === 'cohort' ? 'toggle is-on' : 'toggle'}
            onClick={() => setVisibility(visibility === 'cohort' ? 'private' : 'cohort')}
          />
        </div>
      </section>

      <div className="sticky-bar">
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={text.trim().length === 0}
          onClick={() => {
            addCheckin({ text: text.trim(), visibility, ...(photo ? { photoRef: photo } : {}) });
            nav('/home');
          }}
        >
          인증 남기기
        </button>
      </div>
    </main>
  );
}
