import { useEffect,useRef,useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../auth/api';
import { notificationApi,type NotificationApi,type Notification } from '../../notifications/api';
import { AppHeader } from '../components/AppHeader';
export function NotificationScreen({api=notificationApi}:{api?:NotificationApi}){
  const [items,setItems]=useState<Notification[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState('');
  const active=useRef(false),locked=useRef(false),version=useRef(0);
  async function refresh(){
    if(locked.current)return;locked.current=true;const revision=++version.current;setBusy(true);setError('');
    try{const result=await api.list();if(active.current&&revision===version.current)setItems(result.items);}
    catch(e){if(active.current&&revision===version.current){setItems([]);setError(e instanceof ApiError&&e.status===401?'로그인 후 알림을 확인해주세요.':'알림을 불러오지 못했어요. 잠시 후 다시 확인해주세요.');}}
    finally{if(revision===version.current){locked.current=false;if(active.current)setBusy(false);}}
  }
  useEffect(()=>{active.current=true;void refresh();return()=>{active.current=false;version.current++;locked.current=false;};},[api]);
  return <><AppHeader/><main className="screen account-screen">
    <h1 className="account-title">내 알림</h1><p className="meta">코호트 시작과 모집 취소 안내를 최근 50개까지 확인할 수 있어요.</p>
    {error&&<p role="alert">{error}</p>}
    {busy&&<p role="status">알림을 확인하고 있어요.</p>}
    {!busy&&!error&&items.length===0&&<p>아직 받은 알림이 없어요.</p>}
    {items.map(item=><article className="card account-stack" key={item.id}>
      <h2 className="section__title">{item.type==='cohort.started'?'코호트가 시작됐어요':'모집이 취소됐어요'}</h2>
      <p>{item.habitName} · {item.generation}</p>
      <p>{item.type==='cohort.started'?'내 활동에서 진행 상황을 확인하고 인증을 남겨보세요.':'이번 코호트는 시작하지 않아요. 공개 모집에서 다른 기수를 확인해주세요.'}</p>
      <time className="meta" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</time>
      <Link className="btn btn--ghost btn--block" to={item.type==='cohort.started'?`/activity/${item.membershipId}`:'/recruitment'}>{item.type==='cohort.started'?'내 활동 보기':'공개 모집 보기'}</Link>
    </article>)}
    <button className="btn btn--ghost btn--block" disabled={busy} onClick={()=>void refresh()}>알림 새로고침</button>
    <Link className="btn btn--ghost btn--block" to="/account">로그인·계정 관리</Link>
  </main></>;
}
