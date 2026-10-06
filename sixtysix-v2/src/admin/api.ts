import { createApiTransport,ApiError } from '../auth/api';
import type { Cohort,CohortPage } from '../cohorts/api';
export interface CreateCohort {habitId:string;policyVersion:1;generation:string;startDate:string;recruitmentOpensAt:string;capacity:number;minParticipants:number}
export interface AdminApi {
  list(cursor?:string):Promise<CohortPage>;
  habits():Promise<{items:Array<{id:string;name:string}>}>;
  create(body:CreateCohort,key:string):Promise<Cohort>;
  cancel(id:string,reason:string,key:string):Promise<Cohort>;
}
export function createAdminApi(transport:typeof fetch=(...args)=>fetch(...args)):AdminApi{
  const {request,write}=createApiTransport(transport);
  return {list:cursor=>request(`/admin/cohorts${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`),habits:()=>request('/habits'),
    create:(body,key)=>write('/admin/cohorts',body,'POST',key),cancel:(id,reason,key)=>write(`/admin/cohorts/${encodeURIComponent(id)}/cancel`,{reason},'POST',key)};
}
export const adminApi=createAdminApi();
export function adminMessage(error:unknown){
  const messages:Record<string,string>={UNAUTHENTICATED:'로그인 후 다시 확인해주세요.',FORBIDDEN:'모집 운영 권한이 없어요.',REAUTH_REQUIRED:'계정 화면에서 로그인 수단을 재인증한 뒤 같은 요청을 다시 확인해주세요.',
    INVALID_REQUEST:'시작일·모집 시작·인원을 확인해주세요. 시작은 한국 시간 오전 4시이며 최소 인원은 정원 이하여야 해요.',NOT_FOUND:'모집 또는 사용 가능한 습관을 찾지 못했어요.',COHORT_EXISTS:'같은 습관에 동일한 기수 이름이 있어요.',JOIN_CLOSED:'이미 취소됐거나 시작한 모집은 취소할 수 없어요.',IDEMPOTENCY_CONFLICT:'이전 요청과 내용이 달라요. 모집 상태를 확인해주세요.',RATE_LIMITED:'요청이 많아요. 대기 시간이 지난 뒤 다시 확인해주세요.'};
  return error instanceof ApiError&&messages[error.code]?messages[error.code]!:'처리 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해주세요.';
}
