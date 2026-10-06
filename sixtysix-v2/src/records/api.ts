import { ApiError,authMessage,createApiTransport } from '../auth/api';
import type { Home,RecordView,CheckinInput,Target,WriteResult } from './types';
export interface ActivityApi {home(id:string):Promise<Home>;record(id:string):Promise<RecordView>;write(id:string,key:string,kind:'checkin'|'pass',body:CheckinInput|Target):Promise<WriteResult>}
export function createActivityApi(transport:typeof fetch=(...args)=>fetch(...args)):ActivityApi{
  const {request,write}=createApiTransport(transport);
  return {home:id=>request(`/memberships/${encodeURIComponent(id)}/home`),record:id=>request(`/memberships/${encodeURIComponent(id)}/record`),
    write:(id,key,kind,body)=>write(`/memberships/${encodeURIComponent(id)}/${kind==='checkin'?'checkins':'passes'}`,body,'POST',key)};
}
export const activityApi=createActivityApi();
export function activityMessage(error:unknown){const messages:Record<string,string>={TARGET_CHANGED:'접수 대상이 바뀌었어요. 입력은 보관했으니 새 날짜와 늦은 인증 여부를 확인해주세요.',ALREADY_FILLED:'이미 기록이 있는 날이에요. 최신 기록을 확인해주세요.',BEFORE_START:'아직 시작 전이에요.',ENDED:'접수 기간이 끝났어요. 저장한 기록은 볼 수 있어요.',CANCELLED:'취소된 참여에는 기록을 남길 수 없어요.',LEFT:'이탈한 참여에는 기록을 남길 수 없어요.',PASS_EXHAUSTED:'면제권 3회를 모두 사용했어요.',INVALID_TEXT:'한 줄을 공백 제외 1~40칸으로 입력해주세요. 이모지는 두 칸일 수 있어요.',INVALID_MEDIA:'선택한 샘플 사진을 사용할 수 없어요.',NOT_FOUND:'내 참여 기록을 찾을 수 없어요.',IDEMPOTENCY_CONFLICT:'요청 정보가 달라졌어요. 최신 기록을 확인한 뒤 다시 작성해주세요.',TEMPORARILY_UNAVAILABLE:'기록 서비스를 이용할 수 없어요. 잠시 후 다시 시도해주세요.'};return error instanceof ApiError&&messages[error.code]?messages[error.code]!:authMessage(error);}
