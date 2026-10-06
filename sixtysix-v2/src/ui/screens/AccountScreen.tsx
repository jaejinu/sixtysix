import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, authApi, authMessage, type AuthApi, type Identity, type Intent, type Me } from '../../auth/api';
import { AppHeader } from '../components/AppHeader';

type Flow={purpose:'login'|'reauth'|'link';challengeId:string;expiresAt:string;email?:string;identityId?:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function AccountScreen({api=authApi,redirect=(url:string)=>window.location.assign(url)}:{api?:AuthApi;redirect?:(url:string)=>void}) {
  const nav=useNavigate();const location=useLocation();
  const [me,setMe]=useState<Me|null>(null);const [loading,setLoading]=useState(true);
  const [email,setEmail]=useState('');const [code,setCode]=useState('');const [flow,setFlow]=useState<Flow|null>(null);
  const [completeId,setCompleteId]=useState<string|null>(null);const [removing,setRemoving]=useState<Identity|null>(null);
  const [busy,setBusy]=useState(false);const lock=useRef(false);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [waitUntil,setWaitUntil]=useState(0);const [now,setNow]=useState(Date.now());
  const [blockedUntil,setBlockedUntil]=useState(0);
  const initialQuery=useRef(location.search);
  const wait=Math.max(0,Math.ceil((Math.max(waitUntil,blockedUntil)-now)/1000));
  const remaining=flow?Math.max(0,Math.ceil((Date.parse(flow.expiresAt)-now)/1000)):0;

  useEffect(()=>{
    let active=true;
    const params=new URLSearchParams(initialQuery.current);
    if(params.has('authError'))setError(authMessage(new ApiError(params.get('authError')!,400)));
    if(params.get('auth')==='COMPLETE_LINK' && uuid.test(params.get('intentId')??''))setCompleteId(params.get('intentId'));
    if(params.get('auth')==='REAUTHENTICATED')setNotice('인증 결과를 확인하고 있어요.');
    // URL parameters never establish login; only the cookie-backed /me response does.
    api.me().then(value=>{
      if(active){setMe(value);if(params.get('auth')==='SIGNED_IN')setNotice('로그인했어요.');
        if(params.get('auth')==='REAUTHENTICATED')setNotice('계정 정보를 확인했어요. 연결 또는 해제를 다시 진행해주세요.');}
    }).catch(reason=>{
      if(active){setMe(null);setCompleteId(null);setNotice('');
        if(!(reason instanceof ApiError && reason.status===401))setError(authMessage(reason));}
    }).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[api]);
  useEffect(()=>{if(location.search)nav(location.pathname,{replace:true});},[location.pathname,location.search,nav]);
  useEffect(()=>{
    if(!flow && Math.max(waitUntil,blockedUntil)<=Date.now())return;
    const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);
  },[flow,waitUntil,blockedUntil]);

  async function run(action:()=>Promise<void>){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');
    try{await action();}catch(reason){
      setError(authMessage(reason));
      if(reason instanceof ApiError){
        if(reason.retryAfter){setBlockedUntil(Date.now()+reason.retryAfter*1000);setNow(Date.now());}
        if(reason.status===401){setMe(null);setFlow(null);setCompleteId(null);setRemoving(null);setCode('');}
      }
    }finally{lock.current=false;setBusy(false);}
  }
  function goKakao(url:string){
    const target=new URL(url,window.location.origin);
    if(target.origin!==window.location.origin || target.pathname!=='/v1/auth/kakao/start')throw new ApiError('FORBIDDEN',403);
    redirect(`${target.pathname}${target.search}`);
  }
  function acceptIntent(intent:Intent,purpose:'reauth'|'link',details:{email?:string;identityId?:string}){
    if(intent.nextAction==='REDIRECT' && intent.authorizationUrl){goKakao(intent.authorizationUrl);return;}
    if(!intent.challengeId)throw new ApiError('TEMPORARILY_UNAVAILABLE',503);
    setFlow({purpose,challengeId:intent.challengeId,expiresAt:intent.expiresAt,...details});setCode('');
    setWaitUntil(Date.now()+60_000);setNow(Date.now());setNotice('이메일로 인증번호를 요청했어요.');
  }
  async function sendLogin(address:string){
    const result=await api.code(address.trim());
    setFlow({purpose:'login',challengeId:result.challengeId,expiresAt:result.expiresAt,email:address.trim()});setCode('');
    setWaitUntil(Date.now()+60_000);setNow(Date.now());setNotice('이메일을 확인해주세요. 인증번호는 5분 동안 유효해요.');
  }
  async function resend(){
    if(!flow)return;
    if(flow.purpose==='login')await sendLogin(flow.email!);
    else if(flow.purpose==='reauth')acceptIntent(await api.reauth(flow.identityId!),'reauth',{identityId:flow.identityId!});
    else acceptIntent(await api.link('email',flow.email!),'link',{email:flow.email!});
  }
  async function verify(){
    if(!flow)return;
    const result=await api.verify(flow.challengeId,code);
    setFlow(null);setCode('');
    if(result.nextAction==='COMPLETE_LINK' && result.intentId){setCompleteId(result.intentId);setNotice('새 로그인 수단을 확인했어요. 연결을 완료해주세요.');}
    else{
      setMe(await api.me());setNotice(result.nextAction==='SIGNED_IN'?'로그인했어요.':'본인 확인을 완료했어요. 연결 또는 해제를 진행해주세요.');
      nav('/account',{replace:true});
    }
  }
  const disabled=busy||loading||blockedUntil>now;
  return <>
    <AppHeader />
    <main className="screen account-screen" aria-busy={busy||loading}>
      <div className="account-intro">
        <p className="meta">육십육 계정</p>
        <h1 className="account-title">{loading?'계정 확인 중':me?'내 계정':'작은 반복을, 함께 이어가요'}</h1>
        <p className="account-description">{me?'로그인 수단을 안전하게 관리하세요.':'이메일 인증번호 또는 카카오로 시작하세요.'}</p>
      </div>
      {error && <p className="account-message account-message--error" role="alert">{error}</p>}
      {notice && <p className="account-message" role="status">{notice}</p>}
      {wait>0 && <p className="meta">다시 요청하기까지 {wait}초</p>}
      {loading && <p role="status">로그인 상태를 확인하고 있어요.</p>}
      {!loading && !me && !flow && <section className="card account-stack" aria-label="로그인">
        <form className="account-stack" onSubmit={event=>{event.preventDefault();void run(()=>sendLogin(email));}}>
          <label className="field"><span className="field__label">이메일</span>
            <input className="account-input" type="email" autoComplete="email" required maxLength={254} value={email}
              placeholder="you@example.com" disabled={disabled} onChange={event=>setEmail(event.target.value)} />
          </label>
          <button className="btn btn--primary btn--block" disabled={disabled||wait>0} type="submit">이메일로 인증번호 받기</button>
        </form>
        <span className="account-divider">또는</span>
        <button className="btn btn--ghost btn--block" disabled={disabled} type="button" onClick={()=>void run(async()=>goKakao('/v1/auth/kakao/start?returnTo=/my'))}>카카오로 로그인</button>
        <p className="meta">처음 로그인하면 계정이 만들어져요. 기존 계정에 다른 로그인 수단을 추가하려면 먼저 기존 수단으로 로그인해주세요.</p>
      </section>}

      {flow && <section className="card account-stack" aria-labelledby="code-heading">
        <h2 id="code-heading" className="section__title">{flow.purpose==='reauth'?'본인 확인':'인증번호 입력'}</h2>
        {flow.email && <p className="account-address">{flow.email}</p>}
        <form className="account-stack" onSubmit={event=>{event.preventDefault();void run(verify);}}>
          <label className="field"><span className="field__label">6자리 인증번호</span>
            <input className="account-input account-input--code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6}
              value={code} disabled={disabled||remaining===0} onChange={event=>setCode(event.target.value.replace(/\D/g,''))} aria-describedby="code-help" />
          </label>
          <p className="meta" id="code-help">{remaining>0?`${Math.floor(remaining/60)}분 ${remaining%60}초 남았어요. 오답 3회 시 새 번호를 요청해주세요.`:'인증번호가 만료됐어요. 새 번호를 요청해주세요.'}</p>
          <button className="btn btn--primary btn--block" type="submit" disabled={disabled||remaining===0||!/^\d{6}$/.test(code)}>인증번호 확인</button>
        </form>
        <button className="btn btn--ghost btn--block" disabled={disabled||wait>0} type="button" onClick={()=>void run(resend)}>새 인증번호 요청</button>
        <button className="btn btn--ghost btn--block" disabled={disabled} type="button" onClick={()=>{setFlow(null);setCode('');setError('');}}>취소</button>
      </section>}

      {!loading && me && <>
        <section className="card account-stack" aria-label="실제 계정 정보">
          <h2 className="section__title">{me.profile.displayName}</h2>
          <p>{me.currentMembershipId?'참여 정보가 등록되어 있어요.':'아직 참여 중인 코호트가 없어요.'}</p>
          <p className="meta">코호트 참여는 공개 모집에서 관리해요. 실제 인증과 기록은 아래 참여 기록에서 확인하세요. 둘러보기의 샘플 기록은 이 계정에 저장되지 않아요.</p>
        </section>
        {completeId && <section className="card account-stack" aria-label="연결 완료">
          <h2 className="section__title">로그인 수단 연결</h2>
          <p>검증한 로그인 수단을 이 계정에 추가할까요?</p>
          <button className="btn btn--primary btn--block" disabled={disabled} onClick={()=>void run(async()=>{
            const identities=await api.complete(completeId);setMe({...me,identities});setCompleteId(null);setNotice('로그인 수단을 연결했어요.');
          })}>연결 완료하기</button>
          <button className="btn btn--ghost btn--block" disabled={disabled} onClick={()=>setCompleteId(null)}>나중에 하기</button>
        </section>}
        <section className="account-stack" aria-labelledby="identities-heading">
          <h2 id="identities-heading" className="section__title">로그인 수단</h2>
          <ul className="account-stack">{me.identities.map(identity=><li className="card account-stack" key={identity.id}>
            <div><p><strong>{identity.provider==='email'?'이메일':'카카오'}</strong></p><p className="account-address meta">{identity.label}</p></div>
            <div className="account-actions">
              <button className="btn btn--ghost" disabled={disabled||!!flow} onClick={()=>void run(async()=>acceptIntent(await api.reauth(identity.id),'reauth',{identityId:identity.id}))}>다시 인증</button>
              <button className="btn btn--ghost" disabled={disabled||me.identities.filter(i=>i.usable).length<2} onClick={()=>setRemoving(identity)}>연결 해제</button>
            </div>
            {removing?.id===identity.id && <div className="account-stack" role="group" aria-label="연결 해제 확인">
              <p>이 로그인 수단을 해제할까요? 다른 기기의 로그인도 종료돼요.</p>
              <button className="btn btn--ghost account-danger" disabled={disabled} onClick={()=>void run(async()=>{
                await api.unlink(identity.id);setRemoving(null);setMe(await api.me());setNotice('로그인 수단을 해제했어요.');
              })}>해제하기</button>
              <button className="btn btn--ghost" disabled={disabled} onClick={()=>setRemoving(null)}>취소</button>
            </div>}
          </li>)}</ul>
          {me.identities.filter(i=>i.usable).length<2 && <p className="meta">마지막 로그인 수단은 해제할 수 없어요.</p>}
        </section>
        {!flow && !completeId && <section className="card account-stack" aria-labelledby="link-heading">
          <h2 id="link-heading" className="section__title">다른 로그인 수단 연결</h2>
          <p className="meta">다른 계정의 기록은 합쳐지지 않아요. 인증이 만료됐다면 위에서 기존 수단으로 다시 인증해주세요.</p>
          <form className="account-stack" onSubmit={event=>{event.preventDefault();void run(async()=>acceptIntent(await api.link('email',email.trim()),'link',{email:email.trim()}));}}>
            <label className="field"><span className="field__label">연결할 이메일</span><input type="email" className="account-input" autoComplete="email" maxLength={254} required value={email} disabled={disabled} onChange={event=>setEmail(event.target.value)} /></label>
            <button className="btn btn--ghost btn--block" type="submit" disabled={disabled||wait>0}>이메일 연결</button>
          </form>
          {!me.identities.some(identity=>identity.provider==='kakao') && <button className="btn btn--ghost btn--block" disabled={disabled} onClick={()=>void run(async()=>acceptIntent(await api.link('kakao'),'link',{}))}>카카오 연결</button>}
        </section>}
        {me.memberships.length>0&&<section className="card account-stack" aria-label="실제 참여 기록"><h2 className="section__title">참여 기록</h2>{me.memberships.map((m,index)=><Link key={m.id} className="btn btn--ghost btn--block" to={`/activity/${m.id}`}>{m.id===me.currentMembershipId?'현재 참여 홈·기록':`지난 참여 ${index+1} 기록`}</Link>)}</section>}
        <button className="btn btn--ghost btn--block" disabled={disabled} onClick={()=>void run(async()=>{
          await api.logout();setMe(null);setFlow(null);setCompleteId(null);setRemoving(null);setEmail('');setCode('');setNotice('로그아웃했어요.');nav('/login',{replace:true});
        })}>로그아웃</button>
      </>}
      {!loading && <button className="btn btn--ghost btn--block" disabled={disabled} onClick={()=>void run(async()=>{setMe(await api.me());setNotice('계정 정보를 새로 확인했어요.');})}>계정 상태 다시 확인</button>}
      {me&&<Link className="btn btn--ghost btn--block" to="/admin/cohorts">모집 운영</Link>}
      {me&&<Link className="btn btn--ghost btn--block" to="/notifications">내 알림</Link>}
      <Link className="btn btn--primary btn--block" to="/recruitment">공개 모집 둘러보기</Link>
      <Link className="account-demo-link" to="/home">샘플 기록 둘러보기</Link>
    </main>
  </>;
}
