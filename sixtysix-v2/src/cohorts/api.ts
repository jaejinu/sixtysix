import { createApiTransport, ApiError, authMessage, type Me } from '../auth/api.js';
export type Membership=Me['memberships'][number];
export interface Cohort {
  id:string;habitId:string;generation:string;policyVersion:number;startsAt:string;startDate:string;
  durationDays:number;capacity:number;minParticipants:number;participantCount:number;recruitmentOpensAt:string;
  status:'scheduled'|'recruiting'|'active'|'ended'|'cancelled';finalSubmissionAt:string;canJoin:boolean;cancellationReason:string|null;
}
export interface CohortPage {items:Cohort[];nextCursor:string|null}
export interface RecruitmentApi {
  list(cursor?:string):Promise<CohortPage>;
  detail(id:string):Promise<Cohort>;
  habits():Promise<{items:Array<{id:string;name:string;goal:string}>}>;
  me():Promise<Me>;
  join(id:string,key:string):Promise<Membership>;
  cancel(id:string,key:string):Promise<Membership>;
}
export function createRecruitmentApi(transport:typeof fetch=(...args)=>fetch(...args)):RecruitmentApi {
  const {request,write}=createApiTransport(transport);
  return {list:cursor=>request(`/cohorts${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`),
    detail:id=>request(`/cohorts/${encodeURIComponent(id)}`),habits:()=>request('/habits'),me:()=>request('/me'),
    join:(cohortId,key)=>write('/memberships',{cohortId},'POST',key),
    cancel:(id,key)=>write(`/memberships/${encodeURIComponent(id)}/cancel`,{confirm:true},'POST',key)};
}
export const recruitmentApi=createRecruitmentApi();
export function recruitmentMessage(error:unknown){
  const messages:Record<string,string>={TEMPORARILY_UNAVAILABLE:'지금은 모집 서비스를 이용할 수 없어요. 잠시 후 다시 시도해주세요.',COHORT_FULL:'모집 정원이 찼어요. 다른 기수를 확인해주세요.',
    JOIN_CLOSED:'참여·취소 가능한 시간이 지났거나, 취소한 기수예요. 최신 모집 상태를 확인해주세요.',
    ACTIVE_MEMBERSHIP_EXISTS:'이미 참여 중이거나 시작을 기다리는 코호트가 있어요.',
    IDEMPOTENCY_CONFLICT:'요청 정보가 일치하지 않아요. 참여 상태를 확인한 뒤 새로 시작해주세요.'};
  return error instanceof ApiError&&messages[error.code]?messages[error.code]!:authMessage(error);
}
