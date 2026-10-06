import { useEffect,useRef,useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError,type Me } from '../../auth/api';
import { recruitmentApi,recruitmentMessage,type Cohort,type RecruitmentApi } from '../../cohorts/api';
import { AppHeader } from '../components/AppHeader';
type Command={kind:'join'|'cancel';id:string;key:string};
const date=(value:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',hour12:false}).format(new Date(value));
const statusLabel={scheduled:'모집 예정',recruiting:'모집 중',active:'진행 중',ended:'종료',cancelled:'모집 취소'};
export function RecruitmentScreen({api=recruitmentApi}:{api?:RecruitmentApi}){
  const [items,setItems]=useState<Cohort[]>([]);const [cursor,setCursor]=useState<string|null>(null);
  const [habits,setHabits]=useState<Array<{id:string;name:string;goal:string}>>([]);
  const [me,setMe]=useState<Me|null>(null);const [current,setCurrent]=useState<Cohort|null>(null);
  const [busy,setBusy]=useState(true);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [confirm,setConfirm]=useState<Command|null>(null);const [pending,setPending]=useState<Command|null>(null);
  const [retryAt,setRetryAt]=useState(0);const [now,setNow]=useState(Date.now());const lock=useRef(false);const alive=useRef(true);
  const wait=Math.max(0,Math.ceil((retryAt-now)/1000));
  const membership=me?.memberships.find(m=>m.id===me.currentMembershipId);
  async function refresh(){
    // Listing settles expired/cancelled slots before reading /me.
    const page=await api.list();const catalog=await api.habits();let user:Me|null=null;
    try{user=await api.me();}catch(e){if(!(e instanceof ApiError&&e.status===401))throw e;}
    const member=user?.memberships.find(m=>m.id===user.currentMembershipId);
    const detail=member?await api.detail(member.cohortId):null;
    if(alive.current){setItems(page.items);setCursor(page.nextCursor);setHabits(catalog.items);setMe(user);setCurrent(detail);}
  }
  useEffect(()=>{alive.current=true;void refresh().catch(e=>{if(alive.current)setError(recruitmentMessage(e));}).finally(()=>{if(alive.current)setBusy(false);});return()=>{alive.current=false;};},[api]);
  useEffect(()=>{if(!retryAt)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[retryAt]);
  async function run(action:()=>Promise<void>){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{await action();}catch(e){if(alive.current)setError(recruitmentMessage(e));}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function execute(command:Command){
    setConfirm(null);setNotice('');setPending(command);
    try{
      const result=command.kind==='join'?await api.join(command.id,command.key):await api.cancel(command.id,command.key);
      setPending(null);setNotice(command.kind==='join'?'참여가 확정됐어요. 시작일을 확인해주세요.':'참여를 취소했어요.');
      // Preserve the successful fact even if the subsequent refresh fails.
      if(me)setMe({...me,memberships:[...me.memberships.filter(m=>m.id!==result.id),result],currentMembershipId:command.kind==='join'?result.id:null});
      if(command.kind==='cancel')setCurrent(null);
    }catch(e){
      if(e instanceof ApiError){
        if(e.retryAfter){setRetryAt(Date.now()+e.retryAfter*1000);setNow(Date.now());}
        if(e.status>=400&&e.status<500&&e.status!==429){setPending(null);if(e.status===401){setMe(null);setCurrent(null);}}
      }
      throw e;
    }
    await refresh();
  }
  const title=(c:Cohort)=>`${habits.find(h=>h.id===c.habitId)?.name??'습관 챌린지'} · ${c.generation}`;
  const disabled=busy||!!pending||wait>0;
  return <><AppHeader/><main className="screen account-screen" aria-busy={busy}>
    <div className="account-intro"><p className="meta">66일을 함께 시작해요</p><h1 className="account-title">공개 모집</h1><p>참여 중이거나 시작을 기다리는 코호트는 한 번에 하나예요.</p></div>
    {error&&<p className="account-message account-message--error" role="alert">{error}</p>}
    {notice&&<p className="account-message" role="status">{notice}</p>}
    {busy&&<p role="status">서버에서 확인하고 있어요.</p>}
    {pending&&<section className="card account-stack" aria-label="요청 결과 확인"><h2 className="section__title">요청 결과를 확인해주세요</h2><p>서버에서 처리됐을 수 있어요. 같은 요청으로 다시 확인하면 중복 참여하지 않아요.</p>
      {wait>0&&<p className="meta">{wait}초 후 다시 확인할 수 있어요.</p>}
      <button className="btn btn--primary btn--block" disabled={busy||wait>0} onClick={()=>void run(()=>execute(pending))}>같은 요청 다시 확인</button></section>}
    {current&&membership&&<section className="card account-stack" aria-label="내 참여"><p className="meta">내 참여 · {statusLabel[current.status]}</p><h2 className="section__title">{title(current)}</h2><p>{date(current.startsAt)} 시작 · 한국 시간</p>
      <p>참여 {current.participantCount}명 / 정원 {current.capacity}명</p><p className="meta">실제 인증과 기록은 내 참여 홈에서 확인하세요. 샘플 기록은 이 참여에 저장되지 않아요.</p>
      <Link className="btn btn--primary btn--block" to={`/activity/${membership.id}`}>내 참여 홈·기록</Link>
      {(current.status==='recruiting'||current.status==='scheduled')&&<button className="btn btn--ghost btn--block" disabled={disabled} onClick={()=>setConfirm({kind:'cancel',id:membership.id,key:crypto.randomUUID()})}>참여 취소</button>}
    </section>}
    {confirm&&<section className="card account-stack" role="group" aria-label="참여 확인"><h2 className="section__title">{confirm.kind==='join'?'이 기수에 참여할까요?':'참여를 취소할까요?'}</h2><p>{confirm.kind==='join'?'시작 전까지만 취소할 수 있어요. 최소 인원이 모이지 않으면 모집이 취소돼요.':'취소한 같은 기수에는 다시 참여할 수 없어요. 다른 기수는 선택할 수 있어요.'}</p>
      <button className="btn btn--primary btn--block" disabled={disabled} onClick={()=>void run(()=>execute(confirm))}>{confirm.kind==='join'?'참여 확정':'취소 확정'}</button>
      <button className="btn btn--ghost btn--block" disabled={busy} onClick={()=>setConfirm(null)}>돌아가기</button></section>}
    {!busy&&!error&&!items.length&&<section className="card account-stack"><h2 className="section__title">모집을 준비하고 있어요</h2><p>현재 공개된 예정·모집 기수가 없어요.</p></section>}
    <ul className="account-stack">{items.map(c=><li key={c.id} className="card account-stack"><p className="meta">{statusLabel[c.status]}</p><h2 className="section__title">{title(c)}</h2><p>{date(c.startsAt)} 시작 · 66일</p><p>{c.participantCount}명 참여 / 최대 {c.capacity}명</p><p className="meta">최소 {c.minParticipants}명이 모이면 시작해요. 모든 시각은 한국 시간이에요.</p>
      {c.status==='scheduled'&&<p className="meta">{date(c.recruitmentOpensAt)} 모집 시작</p>}
      {me?<button className="btn btn--primary btn--block" disabled={disabled||!c.canJoin||!!me.currentMembershipId} onClick={()=>setConfirm({kind:'join',id:c.id,key:crypto.randomUUID()})}>{membership?.cohortId===c.id?'참여 완료':c.participantCount>=c.capacity?'정원 마감':c.canJoin?'참여하기':'참여 불가'}</button>:<Link className="btn btn--ghost btn--block" to="/login">로그인하고 참여하기</Link>}
    </li>)}</ul>
    {cursor&&<button className="btn btn--ghost btn--block" disabled={disabled} onClick={()=>void run(async()=>{const next=await api.list(cursor);setItems(prev=>[...prev,...next.items.filter(c=>!prev.some(p=>p.id===c.id))]);setCursor(next.nextCursor);})}>모집 더 보기</button>}
    <button className="btn btn--ghost btn--block" disabled={busy} onClick={()=>void run(refresh)}>모집·참여 상태 새로고침</button>
    <Link className="account-demo-link" to="/account">로그인·계정 관리</Link><Link className="account-demo-link" to="/home">샘플 기록 둘러보기</Link>
  </main></>;
}
