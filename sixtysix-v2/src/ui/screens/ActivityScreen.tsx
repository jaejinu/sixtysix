import { useEffect,useRef,useState } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { LEGEND } from '../components/ProgressBoard';
import { activityApi,activityMessage,type ActivityApi } from '../../records/api';
import type { Home,RecordView,CheckinInput,Target,DayCell } from '../../records/types';
import { ApiError } from '../../auth/api';
type Command={kind:'checkin'|'pass';body:CheckinInput|Target;key:string};
const labels:Record<DayCell['status'],string>={done:'인증 완료',late:'늦은 인증',pass:'면제권',miss:'미인증',today:'오늘',future:'남은 날'};
function Board({days,selected,onSelect}:{days:DayCell[];selected:number;onSelect:(day:number)=>void}){
  const ref=useRef<HTMLDivElement>(null);
  return <div className="board" role="group" aria-label="66일 서버 기록. 방향키로 날짜 이동" ref={ref} onKeyDown={event=>{
    const delta:Record<string,number>={ArrowRight:1,ArrowLeft:-1,ArrowDown:11,ArrowUp:-11};if(delta[event.key]===undefined)return;event.preventDefault();const next=Math.min(66,Math.max(1,selected+delta[event.key]!));onSelect(next);ref.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus();
  }}>{days.map(day=><button type="button" key={day.day} data-day={day.day} className={`cell cell--${day.status}${selected===day.day?' is-selected':''}`} tabIndex={day.day===selected?0:-1} aria-pressed={day.day===selected} aria-label={`${day.day}일차, ${labels[day.status]}`} onClick={()=>onSelect(day.day)}><span className="sr-only">{day.day}</span></button>)}</div>;
}
export function ActivityScreen({membershipId,api=activityApi}:{membershipId:string;api?:ActivityApi}){
  const [home,setHome]=useState<Home|null>(null);const [record,setRecord]=useState<RecordView|null>(null);const [tab,setTab]=useState<'home'|'record'>('home');
  const [text,setText]=useState('');const [visibility,setVisibility]=useState<'cohort'|'private'>('cohort');const [selected,setSelected]=useState(1);
  const [busy,setBusy]=useState(true);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [confirm,setConfirm]=useState<Command|null>(null);const [pending,setPending]=useState<Command|null>(null);
  const [retryAt,setRetryAt]=useState(0);const [now,setNow]=useState(Date.now());const lock=useRef(false);const mounted=useRef(false);const revision=useRef(0);
  function clearAccountContent(){setHome(null);setRecord(null);setPending(null);setConfirm(null);setText('');setVisibility('cohort');setNotice('');}
  async function refresh(){
    const rev=++revision.current;
    try{
      const value=await api.home(membershipId);const history=await api.record(membershipId);
      if(mounted.current&&rev===revision.current){setHome(value);setRecord(history);}
    }catch(e){
      // A failed network refresh may keep cached content, but loss of access
      // must remove private history and any command captured by the old account.
      if(mounted.current&&rev===revision.current&&e instanceof ApiError&&[401,403,404].includes(e.status)){
        clearAccountContent();setError(activityMessage(e));
      }
      throw e;
    }
  }
  useEffect(()=>{mounted.current=true;void refresh().catch(e=>{if(mounted.current)setError(activityMessage(e));}).finally(()=>{if(mounted.current)setBusy(false);});return()=>{mounted.current=false;revision.current++;};},[api,membershipId]);
  useEffect(()=>{if(!retryAt)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[retryAt]);
  async function run(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action();}catch(e){setError(activityMessage(e));}finally{setBusy(false);lock.current=false;}}
  // Refresh only when no write/confirmation is in flight. A captured command is
  // immutable, so refreshing never silently changes its day, body or request key.
  useEffect(()=>{const tick=()=>{if(!lock.current&&!pending&&!confirm&&document.visibilityState==='visible')void refresh().catch(()=>{});};const timer=setInterval(tick,30000);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};},[api,membershipId,pending,confirm]);
  async function submit(command:Command){
    setConfirm(null);setPending(command);setNotice('');revision.current++;
    try{
      const result=await api.write(membershipId,command.key,command.kind,command.body);
      setPending(null);setRecord(null);setHome(result.home);setText('');setNotice(command.kind==='pass'?'면제권을 사용했어요.':'인증을 저장했어요.');
    }catch(e){
      if(e instanceof ApiError){
        if(e.retryAfter){setRetryAt(Date.now()+e.retryAfter*1000);setNow(Date.now());}
        if(e.status>=400&&e.status<500&&e.status!==429){setPending(null);setConfirm(null);if(e.status===401){clearAccountContent();}else{try{await refresh();}catch{setHome(null);setRecord(null);}}}
      }
      throw e;
    }
    await refresh();
  }
  function prepare(kind:'checkin'|'pass'){
    if(!home?.availability.ok)return;const target={expectedTargetDay:home.availability.targetDay,expectedLate:home.availability.late};
    setNotice('');setConfirm({kind,key:crypto.randomUUID(),body:kind==='pass'?target:{...target,text:text.trim(),samplePhotoRef:null,visibility}});
  }
  const wait=Math.max(0,Math.ceil((retryAt-now)/1000));const disabled=busy||!!pending||wait>0;const day=record?.days.find(d=>d.day===selected);const entry=record?.entries.find(e=>e.cohortDay===selected);
  return <><AppHeader/><main className="screen account-screen activity-screen" aria-busy={busy}>
    <div className="account-intro"><p className="meta">내 실제 참여 기록</p><h1 className="account-title">{tab==='home'?'오늘의 습관':'66일 기록'}</h1>{home&&<p>{home.habit.name} · {home.cohort.generation}</p>}</div>
    <div className="account-actions" aria-label="참여 화면"><button className="btn btn--ghost" aria-pressed={tab==='home'} onClick={()=>setTab('home')}>내 홈</button><button className="btn btn--ghost" aria-pressed={tab==='record'} onClick={()=>setTab('record')}>내 기록</button></div>
    {error&&<p role="alert" className="account-message account-message--error">{error}</p>}{notice&&<p role="status" className="account-message">{notice}</p>}{busy&&<p role="status">서버에서 확인하고 있어요.</p>}
    {pending&&<section className="card account-stack"><h2 className="section__title">저장 결과 확인</h2><p>이미 저장됐을 수 있어요. 같은 내용과 요청으로 다시 확인해주세요.</p>{wait>0&&<p>{wait}초 뒤 다시 확인할 수 있어요.</p>}<button className="btn btn--primary btn--block" disabled={busy||wait>0} onClick={()=>void run(()=>submit(pending))}>같은 요청 다시 확인</button></section>}
    {confirm&&<section className="card account-stack" role="group" aria-label="저장 전 확인"><h2 className="section__title">{confirm.body.expectedTargetDay}일차 · {confirm.body.expectedLate?'늦은 접수':'정상 접수'}</h2>
      <p>{confirm.kind==='pass'?'면제권 1회를 사용할까요? 취소하거나 인증으로 바꿀 수 없어요.':`“${(confirm.body as CheckinInput).text}” 내용을 저장할까요?`}</p>
      <button className="btn btn--primary btn--block" disabled={disabled} onClick={()=>void run(()=>submit(confirm))}>{confirm.kind==='pass'?'면제권 사용 확정':'인증 저장 확정'}</button><button className="btn btn--ghost btn--block" disabled={busy} onClick={()=>setConfirm(null)}>다시 작성</button></section>}
    {home&&tab==='home'&&<>
      <section className="card account-stack"><h2 className="section__title">{home.displayDay===0?'시작을 기다리고 있어요':`${home.displayDay}일차 · ${home.todayStatus==='checkin'?'오늘 인증 완료':home.todayStatus==='pass'?'오늘 면제권 사용':'나의 진행'}`}</h2>
        <p>인증 {home.progress.checkins}회 · 채운 날 {home.progress.filled}/66일</p><p>연속 {home.progress.streak}일 · 남은 면제권 {home.progress.passesLeft}회</p>
        {home.availability.ok?<p>{home.availability.targetDate} · {home.availability.targetDay}일차 {home.availability.late?'늦은 인증':'인증'}을 남길 수 있어요.</p>:<p>{activityMessage(new ApiError(home.availability.reason,409))}</p>}
      </section>
      {home.availability.ok&&!confirm&&<section className="card account-stack" aria-label="인증 작성"><h2 className="section__title">{home.action.label}</h2><p className="meta">{new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',hour12:false}).format(new Date(home.availability.closesAt))}까지 · 한국 시간</p>
        <label className="field"><span className="field__label" id="activity-text-label">오늘의 한 줄</span><textarea aria-labelledby="activity-text-label" className="account-input" rows={3} maxLength={40} value={text} disabled={disabled} onChange={e=>setText(e.target.value)}/><span className="meta">{text.length}/40칸 · 이모지는 두 칸일 수 있어요.</span></label>
        <label className="field"><span className="field__label" id="activity-visibility-label">공개 범위</span><select aria-labelledby="activity-visibility-label" className="account-input" value={visibility} disabled={disabled} onChange={e=>setVisibility(e.target.value as 'cohort'|'private')}><option value="cohort">코호트에 공개</option><option value="private">나만 보기</option></select></label>
        <p className="meta">나만 보기의 본문은 본인만 볼 수 있어요. 인증 여부와 횟수는 코호트 집계에 포함돼요. 이번 화면은 사진 없이 한 줄로 기록해요.</p>
        <button className="btn btn--primary btn--block" disabled={disabled||!text.trim()} onClick={()=>prepare('checkin')}>인증 내용 확인</button>
        <button className="btn btn--ghost btn--block" disabled={disabled||home.progress.passesLeft===0} onClick={()=>prepare('pass')}>면제권 사용</button>
      </section>}
    </>}
    {tab==='record'&&record&&<><section className="account-stack"><h2 className="section__title">채운 날 {record.progress.filled}/66일</h2><p>인증 {record.progress.checkins} · 면제권 {record.progress.passes} · 최장 연속 {record.progress.bestStreak}일</p><Board days={record.days} selected={selected} onSelect={setSelected}/><ul className="legend">{LEGEND.map(([key,label])=><li key={key} className="legend__item"><span className={`cell cell--${key} legend__swatch`} aria-hidden="true"/>{label}</li>)}</ul></section>
      <section className="card account-stack" aria-label="선택한 날 기록"><h2 className="section__title">{selected}일차 · {day?.date}</h2><p>{day&&labels[day.status]}</p>{entry?.kind==='checkin'&&<><p className="activity-body">{entry.text}</p><p className="meta">{entry.visibility==='private'?'나만 보기':'코호트 공개'}{entry.hidden?' · 운영자 숨김':''}{entry.samplePhotoRef?' · 샘플 사진 포함':''}</p></>}{entry?.kind==='pass'&&<p>면제권을 사용한 날이에요.</p>}</section></>}
    <button className="btn btn--ghost btn--block" disabled={busy||!!confirm} onClick={()=>void run(refresh)}>최신 홈·기록 확인</button>
    <Link className="account-demo-link" to="/account">로그인·계정 관리</Link><Link className="account-demo-link" to="/recruitment">공개 모집 보기</Link>
  </main></>;
}
