import { getCheckinAvailability } from '../../src/domain/selectors/time.js';
import type { Availability,Entry,Home,Progress,RecordView } from '../../src/records/types.js';
import { cohortView,membershipView,type CohortRow } from '../cohorts/service.js';
export interface MemberRow {id:string;user_id:string;cohort_id:string;joined_at:Date;cancelled_at:Date|null;left_at:Date|null}
export interface EntryRow {id:string;membership_id:string;cohort_day:number;kind:'checkin'|'pass';created_at:Date;body:string|null;sample_photo_ref:string|null;visibility:'cohort'|'private'|null;hidden_at:Date|null}
export interface Snapshot {now:Date;cohort:CohortRow;member:MemberRow;habit:Home['habit'];entries:EntryRow[];participants:string[];allEntries:EntryRow[]}
const DAY=86400000;
export const dayDate=(cohort:CohortRow,day:number)=>new Date(cohort.starts_at.getTime()+(day-1)*DAY+9*3600000).toISOString().slice(0,10);
const late=(entry:EntryRow,cohort:CohortRow)=>entry.created_at.getTime()>=cohort.starts_at.getTime()+entry.cohort_day*DAY;
export function entryView(entry:EntryRow,cohort:CohortRow,entries:EntryRow[]):Entry {
  const base={id:entry.id,membershipId:entry.membership_id,cohortDay:entry.cohort_day,createdAt:entry.created_at.toISOString()};
  if(entry.kind==='pass')return {...base,kind:'pass'};
  return {...base,kind:'checkin',text:entry.body!,samplePhotoRef:entry.sample_photo_ref,visibility:entry.visibility!,late:late(entry,cohort),simple:entry.sample_photo_ref===null,
    returning:entry.cohort_day>1&&!entries.some(e=>e.cohort_day===entry.cohort_day-1),hidden:entry.hidden_at!==null};
}
export function project(s:Snapshot):{home:Home;record:RecordView}{
  const day=Math.floor((s.now.getTime()-s.cohort.starts_at.getTime())/DAY)+1;
  const visible=s.entries.filter(e=>e.cohort_day<=day);const filled=new Set(visible.map(e=>e.cohort_day));
  const checks=visible.filter(e=>e.kind==='checkin');const passes=visible.length-checks.length;
  let streak=0,bestStreak=0,run=0;
  for(let d=filled.has(day)?day:day-1;d>=1&&filled.has(d);d--)streak++;
  for(let d=1;d<=Math.min(day,66);d++){run=filled.has(d)?run+1:0;bestStreak=Math.max(bestStreak,run);}
  const progress:Progress={checkins:checks.length,filled:filled.size,lates:checks.filter(e=>late(e,s.cohort)).length,simples:checks.filter(e=>e.sample_photo_ref===null).length,privates:checks.filter(e=>e.visibility==='private').length,streak,bestStreak,emptyCells:66-filled.size,passes,passesLeft:Math.max(0,3-passes),percent:Math.round(filled.size/66*100)};
  const cohort=cohortView(s.cohort,s.now,true,true) as Home['cohort'];
  let availability:Availability;
  if(s.member.cancelled_at||s.cohort.cancelled_at)availability={ok:false,reason:'CANCELLED'};
  else if(s.member.left_at)availability={ok:false,reason:'LEFT'};
  else{
    const gate=getCheckinAvailability(s.now,cohort,filled);
    availability=gate.ok?{ok:true,targetDay:gate.cohortDay,targetDate:dayDate(s.cohort,gate.cohortDay),late:gate.late,closesAt:new Date(s.cohort.starts_at.getTime()+gate.cohortDay*DAY+(gate.late?12*3600000:0)).toISOString()}:
      {ok:false,reason:({before:'BEFORE_START',ended:'ENDED',filled:'ALREADY_FILLED'} as const)[gate.reason]};
  }
  const dormant=(days:Set<number>)=>day>7&&Array.from({length:7},(_,i)=>day-1-i).every(d=>!days.has(d));
  const state=day>66?'ended':day<1?'day0':filled.has(day)?'done':dormant(filled)?'dormant':day>1&&!filled.has(day-1)?'broken':checks.length?'ongoing':'day0';
  const participation={day:Math.max(0,Math.min(66,day)),done:0,late:0,dormant:0,pending:0,participantCount:s.participants.length};
  for(const id of s.participants){const entries=s.allEntries.filter(e=>e.membership_id===id&&e.cohort_day<=day);const today=entries.find(e=>e.cohort_day===participation.day);
    if(today){if(today.kind==='checkin'&&late(today,s.cohort))participation.late++;else participation.done++;}
    else if(dormant(new Set(entries.map(e=>e.cohort_day))))participation.dormant++;else participation.pending++;
  }
  const action:Home['action']=availability.ok?{type:availability.late?'LATE_CHECKIN':'CHECKIN',label:availability.late?'늦은 인증 남기기':'인증 남기기'}:
    availability.reason==='BEFORE_START'?{type:'WAIT',label:'시작을 기다리고 있어요'}:
    availability.reason==='CANCELLED'||availability.reason==='LEFT'?{type:'BROWSE_COHORTS',label:'공개 모집 보기'}:{type:'VIEW_RECORD',label:'기록 보기'};
  const home:Home={serverNow:s.now.toISOString(),membership:membershipView(s.member),cohort,habit:s.habit,policyVersion:s.cohort.policy_version,cohortDay:day,displayDay:Math.max(0,Math.min(66,day)),state,
    todayStatus:day<1||day>66||s.member.cancelled_at||s.member.left_at||s.cohort.cancelled_at?'unavailable':visible.find(e=>e.cohort_day===day)?.kind??'empty',availability,progress,participation,action};
  return {home,record:{serverNow:home.serverNow,membershipId:s.member.id,progress,entries:visible.map(e=>entryView(e,s.cohort,visible)),days:Array.from({length:66},(_,i)=>{
    const d=i+1,entry=visible.find(e=>e.cohort_day===d);return {day:d,date:dayDate(s.cohort,d),entryId:entry?.id??null,status:d>day?'future':entry?entry.kind==='pass'?'pass':late(entry,s.cohort)?'late':'done':d===day?'today':'miss'};
  })}};
}
