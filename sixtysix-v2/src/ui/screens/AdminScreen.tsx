import { useEffect,useRef,useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../auth/api';
import { adminApi,adminMessage,type AdminApi,type CreateCohort } from '../../admin/api';
import type { Cohort } from '../../cohorts/api';
import { AppHeader } from '../components/AppHeader';
type Command={kind:'create';body:CreateCohort;key:string}|{kind:'cancel';id:string;reason:string;key:string};
const labels={scheduled:'모집 예정',recruiting:'모집 중',active:'진행 중',ended:'종료',cancelled:'모집 취소'};
export function AdminScreen({api=adminApi}:{api?:AdminApi}){
  const [allowed,setAllowed]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [items,setItems]=useState<Cohort[]>([]),[habits,setHabits]=useState<Array<{id:string;name:string}>>([]),[cursor,setCursor]=useState<string|null>(null);
  const [habitId,setHabit]=useState(''),[generation,setGeneration]=useState(''),[startDate,setStart]=useState(''),[opens,setOpens]=useState(''),[capacity,setCapacity]=useState('30'),[minimum,setMinimum]=useState('');
  const [cancelId,setCancelId]=useState(''),[reason,setReason]=useState('');
  const [confirm,setConfirm]=useState<Command|null>(null),[pending,setPending]=useState<Command|null>(null);
  const [retryAt,setRetryAt]=useState(0),[now,setNow]=useState(Date.now());
  const confirmationHeading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{if(confirm){confirmationHeading.current?.focus({preventScroll:true});confirmationHeading.current?.scrollIntoView?.({block:'start'});}},[confirm]);
  const alive=useRef(false),locked=useRef(false),revision=useRef(0);const wait=Math.max(0,Math.ceil((retryAt-now)/1000));
  function failure(e:unknown){
    setError(adminMessage(e));
    if(e instanceof ApiError&&(e.status===401||(e.status===403&&e.code!=='REAUTH_REQUIRED'))){setAllowed(false);setItems([]);setHabits([]);setPending(null);setConfirm(null);setReason('');setGeneration('');setHabit('');setStart('');setOpens('');setCancelId('');setCursor(null);setNotice('');}
  }
  async function refresh(){const r=++revision.current;const page=await api.list();const catalog=await api.habits();if(alive.current&&r===revision.current){setItems(page.items);setCursor(page.nextCursor);setHabits(catalog.items);setAllowed(true);}}
  useEffect(()=>{alive.current=true;void refresh().catch(e=>{if(alive.current)failure(e);}).finally(()=>{if(alive.current)setBusy(false);});return()=>{alive.current=false;revision.current++;};},[api]);
  useEffect(()=>{if(!retryAt)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[retryAt]);
  async function run(action:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await action();}catch(e){if(alive.current)failure(e);}finally{locked.current=false;if(alive.current)setBusy(false);}}
  async function execute(command:Command){
    setConfirm(null);setPending(command);setNotice('');
    try{
      await (command.kind==='create'?api.create(command.body,command.key):api.cancel(command.id,command.reason,command.key));
      if(!alive.current)return;setPending(null);setNotice(command.kind==='create'?'모집을 개설했어요.':'모집을 취소했어요. 참여자 안내를 등록했어요.');
      if(command.kind==='create'){setGeneration('');setStart('');setOpens('');}else{setCancelId('');setReason('');}
    }catch(e){if(e instanceof ApiError){if(e.retryAfter){setRetryAt(Date.now()+e.retryAfter*1000);setNow(Date.now());}if(e.status>=400&&e.status<500&&e.status!==429&&e.code!=='REAUTH_REQUIRED')setPending(null);}throw e;}
    try{await refresh();}catch(e){if(e instanceof ApiError&&(e.status===401||e.status===403))throw e;setError('변경은 완료됐지만 목록을 불러오지 못했어요. 아래에서 새로고침해주세요.');}
  }
  const disabled=busy||!!pending||!!confirm||wait>0;
  function confirmCreate(){
    const time=new Date(`${opens}:00+09:00`);
    if(!habitId||!generation.trim()||!startDate||!opens||!Number.isFinite(time.getTime())||!minimum){setError('모든 모집 정보를 입력해주세요.');return;}
    setError('');setConfirm({kind:'create',key:crypto.randomUUID(),body:{habitId,policyVersion:1,generation:generation.trim(),startDate,recruitmentOpensAt:time.toISOString(),capacity:Number(capacity),minParticipants:Number(minimum)}});
  }
  const title=(id:string)=>{const c=items.find(c=>c.id===id);return c?`${habits.find(h=>h.id===c.habitId)?.name??'습관'} · ${c.generation}`:'';};
  return <><AppHeader/><main className="screen account-screen" aria-busy={busy}>
    <h1 className="account-title">모집 운영</h1><p className="meta">모집을 만들거나 시작 전에 취소할 수 있어요. 변경 전 최근 5분 이내 재인증이 필요해요.</p>
    {error&&<p role="alert" className="account-message account-message--error">{error}</p>}
    {notice&&<p role="status" className="account-message">{notice}</p>}
    {busy&&<p role="status">권한과 모집을 확인하고 있어요.</p>}
    {pending&&<section className="card account-stack"><h2 className="section__title">처리 결과 확인</h2><p>같은 내용으로 다시 확인하면 중복 처리되지 않아요.</p>{wait>0&&<p>{wait}초 후 다시 확인할 수 있어요.</p>}<button className="btn btn--primary btn--block" disabled={busy||wait>0} onClick={()=>void run(()=>execute(pending))}>같은 요청 다시 확인</button></section>}
    {allowed&&<Link className="btn btn--ghost btn--block" to="/account" target="_blank" rel="noopener noreferrer">계정에서 재인증하기</Link>}
    {confirm&&<section className="card account-stack" aria-label="운영 변경 확인"><h2 ref={confirmationHeading} tabIndex={-1} className="section__title">{confirm.kind==='create'?'모집 개설 확인':'모집 취소 확인'}</h2>{confirm.kind==='create'?<><p>{habits.find(h=>h.id===confirm.body.habitId)?.name} · {confirm.body.generation}</p><p>{confirm.body.startDate} 오전 4시 시작</p><p>모집 시작: {new Date(confirm.body.recruitmentOpensAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p><p>정원 {confirm.body.capacity}명 · 최소 {confirm.body.minParticipants}명</p></>:<><p>{title(confirm.id)}</p><p>{confirm.reason}</p><p>취소 후 되돌릴 수 없어요. 참여자에게 앱 내부 알림을 등록해요.</p></>}
      <button className="btn btn--primary btn--block" disabled={busy} onClick={()=>void run(()=>execute(confirm))}>{confirm.kind==='create'?'모집 개설 확정':'모집 취소 확정'}</button><button className="btn btn--ghost btn--block" disabled={busy} onClick={()=>setConfirm(null)}>돌아가서 수정</button>
    </section>}
    {allowed&&<>
      <form className="card account-stack" onSubmit={e=>{e.preventDefault();confirmCreate();}}><h2 className="section__title">새 모집</h2>
        <fieldset className="account-stack" disabled={disabled} style={{border:0,padding:0,margin:0,minWidth:0}}>
          <label className="field">습관<select aria-label="습관" className="account-input" required value={habitId} onChange={e=>setHabit(e.target.value)}><option value="">습관 선택</option>{habits.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
          <label className="field">기수 이름<input className="account-input" required maxLength={40} value={generation} onChange={e=>setGeneration(e.target.value)}/></label>
          <label className="field">시작일 · 한국 시간 오전 4시<input className="account-input" required type="date" value={startDate} onChange={e=>setStart(e.target.value)}/></label>
          <label className="field">모집 시작 · 한국 시간<input className="account-input" required type="datetime-local" value={opens} onChange={e=>setOpens(e.target.value)}/></label>
          <label className="field">정원 · 최대 30명<input className="account-input" required type="number" min={1} max={30} value={capacity} onChange={e=>setCapacity(e.target.value)}/></label>
          <label className="field">최소 시작 인원<input className="account-input" required type="number" min={1} max={Number(capacity)||30} value={minimum} onChange={e=>setMinimum(e.target.value)}/></label>
          <p className="meta">시작 시 최소 인원에 못 미치면 모집이 취소돼요. 모집 마감은 시작 시각이에요.</p>
          <button className="btn btn--primary btn--block" type="submit">모집 내용 확인</button>
        </fieldset>
      </form>
      <section className="account-stack" aria-label="운영 모집 목록"><h2 className="section__title">모집 목록</h2>{items.length===0&&<p>아직 만든 모집이 없어요.</p>}
        {items.map(c=><article key={c.id} className="card account-stack"><h3>{title(c.id)}</h3><p>{labels[c.status]} · {c.startDate} 오전 4시 시작</p><p>참여 {c.participantCount}명 · 정원 {c.capacity}명 · 최소 {c.minParticipants}명</p>{c.cancellationReason&&<p>취소 사유: {c.cancellationReason}</p>}
          {(c.status==='scheduled'||c.status==='recruiting')&&<button className="btn btn--ghost btn--block" disabled={disabled} onClick={()=>{setCancelId(c.id);setReason('');}}>이 모집 취소</button>}
        </article>)}
        {cursor&&<button className="btn btn--ghost btn--block" disabled={disabled} onClick={()=>void run(async()=>{const page=await api.list(cursor);setItems(current=>[...current,...page.items.filter(c=>!current.some(old=>old.id===c.id))]);setCursor(page.nextCursor);})}>모집 더 보기</button>}
      </section>
      {cancelId&&<form className="card account-stack" onSubmit={e=>{e.preventDefault();if(reason.trim())setConfirm({kind:'cancel',id:cancelId,reason:reason.trim(),key:crypto.randomUUID()});}}><h2 className="section__title">{title(cancelId)} 취소</h2><label className="field">참여자에게 공개할 취소 사유<textarea className="account-input" required maxLength={200} disabled={disabled} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="btn btn--ghost btn--block" disabled={disabled}>취소 내용 확인</button></form>}
    </>}

    <button className="btn btn--ghost btn--block" disabled={disabled} onClick={()=>void run(refresh)}>운영 권한·목록 새로고침</button>
    <Link className="btn btn--ghost btn--block" to="/account">계정으로 돌아가기</Link>
  </main></>;
}
