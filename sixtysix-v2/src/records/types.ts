import type { Cohort,Membership } from '../cohorts/api.js';
export type Availability={ok:true;targetDay:number;targetDate:string;late:boolean;closesAt:string}|{ok:false;reason:'BEFORE_START'|'ALREADY_FILLED'|'ENDED'|'CANCELLED'|'LEFT'};
export interface Progress {checkins:number;filled:number;lates:number;simples:number;privates:number;streak:number;bestStreak:number;emptyCells:number;passes:number;passesLeft:number;percent:number}
export interface Entry {id:string;membershipId:string;cohortDay:number;createdAt:string;kind:'checkin'|'pass';text?:string;samplePhotoRef?:string|null;visibility?:'cohort'|'private';late?:boolean;simple?:boolean;returning?:boolean;hidden?:boolean}
export interface Home {
  serverNow:string;membership:Membership;cohort:Cohort;habit:{id:string;name:string;shortName:string;goal:string;imageRef:string;timeOfDay:'morning'|'evening'};
  policyVersion:number;cohortDay:number;displayDay:number;state:'day0'|'ongoing'|'done'|'broken'|'dormant'|'ended';todayStatus:'empty'|'checkin'|'pass'|'unavailable';availability:Availability;progress:Progress;
  participation:{day:number;done:number;late:number;dormant:number;pending:number;participantCount:number};
  action:{type:'CHECKIN'|'LATE_CHECKIN'|'VIEW_RECORD'|'WAIT'|'BROWSE_COHORTS';label:string};
}
export interface DayCell {day:number;date:string;status:'done'|'late'|'pass'|'miss'|'today'|'future';entryId:string|null}
export interface RecordView {serverNow:string;membershipId:string;days:DayCell[];entries:Entry[];progress:Progress}
export interface Target {expectedTargetDay:number;expectedLate:boolean}
export interface CheckinInput extends Target {text:string;samplePhotoRef:string|null;visibility:'cohort'|'private'}
export interface WriteResult {entry:Entry;home:Home;invalidate:Array<'home'|'record'|'feed'|'members'|'outcome'>}
