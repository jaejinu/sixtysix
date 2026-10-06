export interface Identity { id:string;provider:'email'|'kakao';label:string;usable:boolean }
export interface Me {
  profile:{id:string;displayName:string};identities:Identity[];
  preferences:{defaultVisibility:'cohort'|'private'};
  memberships:Array<{id:string;cohortId:string;joinedAt:string;cancelledAt:string|null;leftAt:string|null}>;
  currentMembershipId:string|null;
}
export interface Challenge { challengeId:string;expiresAt:string;message:string }
export interface Intent { id:string;provider:'email'|'kakao';expiresAt:string;nextAction:'ENTER_CODE'|'REDIRECT';challengeId:string|null;authorizationUrl:string|null }
export interface Verified { purpose:'login'|'reauth'|'link';nextAction:'SIGNED_IN'|'REAUTHENTICATED'|'COMPLETE_LINK';intentId:string|null }
export class ApiError extends Error {
  constructor(readonly code:string,readonly status:number,readonly retryAfter=0){super(code);}
}
export interface AuthApi {
  me():Promise<Me>;
  code(email:string):Promise<Challenge>;
  verify(challengeId:string,code:string):Promise<Verified>;
  reauth(identityId:string):Promise<Intent>;
  link(provider:'email'|'kakao',email?:string):Promise<Intent>;
  complete(intentId:string):Promise<Identity[]>;
  unlink(identityId:string):Promise<void>;
  logout():Promise<void>;
}
export function createApiTransport(transport:typeof fetch=(...args)=>fetch(...args)) {
  async function request<T>(path:string,method='GET',body?:unknown,csrf?:string,key?:string):Promise<T> {
    let response:Response;
    try { response=await transport(`/v1${path}`,{method,credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15_000),
      headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(key?{'Idempotency-Key':key}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})}); }
    catch {throw new ApiError('NETWORK_ERROR',0);}
    if(!response.ok){
      const payload=await response.json().catch(()=>null) as {error?:{code?:string}}|null;
      const retry=Number(response.headers.get('Retry-After'));
      throw new ApiError(payload?.error?.code ?? 'TEMPORARILY_UNAVAILABLE',response.status,
        Number.isFinite(retry)?Math.min(86400,Math.max(0,retry)):0);
    }
    if(response.status===204)return undefined as T;
    try{return await response.json() as T;}catch{throw new ApiError('TEMPORARILY_UNAVAILABLE',503);}
  }
  async function write<T>(path:string,body?:unknown,method='POST',key?:string) {
    // Read a fresh CSRF token before each write. Never retry mutations automatically.
    const context=await request<{csrfToken:string}>('/auth/context');
    if(typeof context.csrfToken!=='string')throw new ApiError('TEMPORARILY_UNAVAILABLE',503);
    return request<T>(path,method,body,context.csrfToken,key);
  }
  return {request,write};
}
export function createAuthApi(transport:typeof fetch=(...args)=>fetch(...args)):AuthApi {
  const {request,write}=createApiTransport(transport);
  return {me:()=>request('/me'),code:email=>write('/auth/code',{email}),
    verify:(challengeId,code)=>write('/auth/verify',{challengeId,code}),
    reauth:identityId=>write('/me/reauth-intents',{identityId}),
    link:(provider,email)=>write('/me/identities/link-intents',provider==='email'?{provider,email}:{provider}),
    complete:id=>write(`/me/identities/link-intents/${encodeURIComponent(id)}/complete`,{}),
    unlink:id=>write(`/me/identities/${encodeURIComponent(id)}`,undefined,'DELETE'),logout:()=>write('/auth/logout')};
}
export const authApi=createAuthApi();
export function authMessage(error:unknown):string {
  const code=error instanceof ApiError?error.code:'TEMPORARILY_UNAVAILABLE';
  const messages:Record<string,string>={
    INVALID_CHALLENGE:'인증번호가 틀렸거나 만료됐어요. 확인 후 다시 입력하거나 새 번호를 요청해주세요.',
    INVALID_OAUTH_STATE:'카카오 로그인 요청이 만료되었어요. 다시 시작해주세요.',
    REAUTH_REQUIRED:'계정을 보호하기 위해 기존 로그인 수단으로 다시 인증해주세요.',
    IDENTITY_ALREADY_LINKED:'다른 계정에 연결된 로그인 수단이에요. 해당 계정으로 로그인해주세요.',
    LAST_IDENTITY:'로그인 수단이 하나뿐이에요. 다른 수단을 연결한 뒤 해제해주세요.',
    UNAUTHENTICATED:'로그인이 만료되었어요. 다시 로그인해주세요.',
    FORBIDDEN:'인증을 완료하지 못했어요. 취소했거나 요청이 만료되었다면 다시 시작해주세요.',
    RATE_LIMITED:'요청이 많아요. 표시된 대기 시간이 지난 뒤 다시 시도해주세요.',
    NETWORK_ERROR:'연결을 확인한 뒤 다시 시도해주세요. 이전 요청이 처리되었을 수 있어요.',
    INVALID_REQUEST:'입력한 내용을 확인해주세요.',NOT_FOUND:'로그인 수단을 찾을 수 없어요. 계정 정보를 다시 확인해주세요.',
    TEMPORARILY_UNAVAILABLE:'지금은 계정 서비스를 이용할 수 없어요. 잠시 후 다시 시도해주세요.',
  };
  return messages[code] ?? messages.TEMPORARILY_UNAVAILABLE!;
}
