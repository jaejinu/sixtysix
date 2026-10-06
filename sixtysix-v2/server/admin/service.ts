import type { Pool,PoolClient } from 'pg';
import { inTransaction } from '../database.js';
import { requireAccountSession,digest,IdentityError } from '../auth/identity-core.js';
import { reserveBusinessLimits } from '../business-limits.js';
import { lockCohorts,cohortView,finalAt,cursorOf,type CohortRow } from '../cohorts/service.js';
export interface CreateCohort {habitId:string;policyVersion:1;generation:string;startDate:string;recruitmentOpensAt:string;capacity:number;minParticipants:number}
export class AdminError extends Error {
  constructor(readonly code:'INVALID_REQUEST'|'NOT_FOUND'|'COHORT_EXISTS'|'JOIN_CLOSED'|'IDEMPOTENCY_CONFLICT'){super(code);}
}
export class AdminService {
  constructor(private readonly pool:Pick<Pool,'connect'>){}
  private async access(client:PoolClient,token:string,fresh:boolean){
    const session=await requireAccountSession(client,token);
    try{await client.query('SELECT sixtysix.require_admin($1,$2)',[session.token_hash,fresh]);}
    catch(e){const error=e as {code?:string;message?:string};if(error.code==='P0001'&&['UNAUTHENTICATED','FORBIDDEN','REAUTH_REQUIRED'].includes(error.message??''))throw new IdentityError(error.message as 'UNAUTHENTICATED'|'FORBIDDEN'|'REAUTH_REQUIRED');throw e;}
    return session;
  }
  async list(token:string,cursor?:string){
    const after=cursorOf(cursor);
    return inTransaction(this.pool,async client=>{
      await this.access(client,token,false);
      const selected=(await client.query<{id:string}>(`SELECT id FROM sixtysix.cohorts
        WHERE ($1::timestamptz IS NULL OR (starts_at,id)<($1::timestamptz,$2::uuid)) ORDER BY starts_at DESC,id DESC LIMIT 51`,after??[null,null])).rows;
      const {rows,now}=await lockCohorts(client,selected.slice(0,50).map(r=>r.id));
      const page=selected.slice(0,50).map(r=>rows.find(c=>c.id===r.id)!);const last=page.at(-1);
      return {items:page.map(row=>cohortView(row,now,false,false)),nextCursor:selected.length>50&&last?Buffer.from(JSON.stringify([last.starts_at.toISOString(),last.id])).toString('base64url'):null};
    });
  }
  async command(token:string,key:string,input:{kind:'create';body:CreateCohort}|{kind:'cancel';id:string;reason:string}){
    const body=input.kind==='create'?{habitId:input.body.habitId.toLowerCase(),policyVersion:input.body.policyVersion,generation:input.body.generation.trim(),startDate:input.body.startDate,recruitmentOpensAt:new Date(input.body.recruitmentOpensAt).toISOString(),capacity:input.body.capacity,minParticipants:input.body.minParticipants}:{reason:input.reason.trim()};
    const id=input.kind==='cancel'?input.id.toLowerCase():undefined;
    const path=id?`/v1/admin/cohorts/${id}/cancel`:'/v1/admin/cohorts';
    const result=await inTransaction(this.pool,async client=>{
      const {user_id:userId,token_hash:hashToken}=await this.access(client,token,true);
      const hash=digest(JSON.stringify(['POST',path,body]));
      const cached=(await client.query('SELECT request_hash,response_body FROM sixtysix.idempotency_records WHERE user_id=$1 AND scope=$2 AND key=$3',[userId,'business',key])).rows[0];
      const replay=!!cached&&cached.request_hash===hash;await reserveBusinessLimits(client,userId,replay);
      if(cached)return replay?cached.response_body:new AdminError('IDEMPOTENCY_CONFLICT');
      const stored=(await client.query(input.kind==='create'?'SELECT sixtysix.admin_create_cohort($1,$2,$3) AS value':'SELECT sixtysix.admin_cancel_cohort($1,$2,$3,$4) AS value',input.kind==='create'?[hashToken,key,JSON.stringify(body)]:[hashToken,key,id,input.reason.trim()])).rows[0].value;
      if(stored.error)return new AdminError(stored.error);
      const row:CohortRow={...stored,starts_at:new Date(stored.starts_at),recruitment_opens_at:new Date(stored.recruitment_opens_at),launch_decided_at:stored.launch_decided_at?new Date(stored.launch_decided_at):null,cancelled_at:stored.cancelled_at?new Date(stored.cancelled_at):null,participant_count:Number((await client.query('SELECT count(*) FROM sixtysix.memberships WHERE cohort_id=$1 AND cancelled_at IS NULL AND left_at IS NULL',[stored.id])).rows[0].count)};
      const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
      const response=cohortView(row,now,false,false);
      await client.query(`INSERT INTO sixtysix.idempotency_records(user_id,scope,key,request_hash,response_status,response_body,expires_at)
        VALUES($1,'business',$2,$3,$4,$5,$6)`,[userId,key,hash,input.kind==='create'?201:200,JSON.stringify(response),new Date(Math.max(now.getTime()+90*86400000,finalAt(row).getTime()+86400000))]);
      return response;
    });if(result instanceof AdminError)throw result;return result;
  }
}
