import type { Pool, PoolClient } from 'pg';
import { inTransaction } from '../database.js';
import { reserveBusinessLimits } from '../business-limits.js';
import { digest, requireAccountSession } from '../auth/identity-core.js';

export class CohortError extends Error {
  constructor(readonly code:'INVALID_REQUEST'|'NOT_FOUND'|'COHORT_FULL'|'JOIN_CLOSED'|'ACTIVE_MEMBERSHIP_EXISTS'|'IDEMPOTENCY_CONFLICT') { super(code); }
}
export interface CohortRow {
  id:string; habit_id:string; generation:string; policy_version:number; starts_at:Date;
  recruitment_opens_at:Date; capacity:number; min_participants:number; launch_decided_at:Date|null;
  cancelled_at:Date|null; cancellation_reason:string|null; participant_count:number;
}
interface Member {id:string;cohort_id:string;joined_at:Date;cancelled_at:Date|null;left_at:Date|null}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const finalAt=(row:CohortRow)=>new Date(row.starts_at.getTime()+(66*24+12)*3600000);
export const membershipView=(row:Member)=>({id:row.id,cohortId:row.cohort_id,joinedAt:row.joined_at.toISOString(),cancelledAt:row.cancelled_at?.toISOString()??null,leftAt:row.left_at?.toISOString()??null});
export type Membership=ReturnType<typeof membershipView>;
export function cohortView(row:CohortRow,now:Date,occupied:boolean,previous:boolean){
  const status=row.cancelled_at?'cancelled':now>finalAt(row)?'ended':now>=row.starts_at?'active':now<row.recruitment_opens_at?'scheduled':'recruiting';
  return {id:row.id,habitId:row.habit_id,generation:row.generation,policyVersion:row.policy_version,
    startsAt:row.starts_at.toISOString(),startDate:new Date(row.starts_at.getTime()+9*3600000).toISOString().slice(0,10),
    durationDays:66,capacity:row.capacity,minParticipants:row.min_participants,participantCount:row.participant_count,
    recruitmentOpensAt:row.recruitment_opens_at.toISOString(),status,finalSubmissionAt:finalAt(row).toISOString(),
    canJoin:status==='recruiting'&&row.participant_count<row.capacity&&!occupied&&!previous,cancellationReason:row.cancellation_reason};
}
export function cursorOf(value?:string):[string,string]|null {
  if(!value)return null;
  try {
    if(value.length>256||!/^[A-Za-z0-9_-]+$/.test(value))throw Error();
    const parsed:unknown=JSON.parse(Buffer.from(value,'base64url').toString());
    if(!Array.isArray(parsed)||parsed.length!==2||typeof parsed[0]!=='string'||typeof parsed[1]!=='string'||!uuid.test(parsed[1])||new Date(parsed[0]).toISOString()!==parsed[0])throw Error();
    return [parsed[0],parsed[1]];
  }catch{throw new CohortError('INVALID_REQUEST');}
}
export async function lockCohorts(client:PoolClient,ids:string[]){
    // All participants, cancellations and launch decisions use this same order.
    const rows=await client.query<CohortRow>(`SELECT c.* FROM sixtysix.cohorts c WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,[[...new Set(ids)]]);
    const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
    for(const row of rows.rows){
      row.participant_count=Number((await client.query(`SELECT count(*) FROM sixtysix.memberships WHERE cohort_id=$1 AND cancelled_at IS NULL AND left_at IS NULL`,[row.id])).rows[0].count);
      if(!row.cancelled_at&&!row.launch_decided_at&&now>=row.starts_at){
        const cancelled=row.participant_count<row.min_participants;
        await client.query(`UPDATE sixtysix.cohorts SET launch_decided_at=$2::timestamptz,cancelled_at=CASE WHEN $3::boolean THEN $2::timestamptz ELSE NULL END,cancellation_reason=CASE WHEN $3 THEN 'MIN_PARTICIPANTS' ELSE NULL END WHERE id=$1`,[row.id,now,cancelled]);
        await client.query(`INSERT INTO sixtysix.outbox(event_type,dedupe_key,payload) VALUES ($1,$2,$3)`,[cancelled?'cohort.cancelled':'cohort.started',`cohort.launch:${row.id}`,JSON.stringify({cohortId:row.id,participantCount:row.participant_count})]);
        row.launch_decided_at=now;if(cancelled){row.cancelled_at=now;row.cancellation_reason='MIN_PARTICIPANTS';}
      }
    }
    return {rows:rows.rows,now};
  }

export class CohortService {
  constructor(private readonly pool:Pick<Pool,'connect'>){}
  private lock=lockCohorts;
  private async slot(client:PoolClient,userId?:string){
    if(!userId)return undefined;
    return (await client.query<{membership_id:string;cohort_id:string}>(`SELECT s.membership_id,m.cohort_id FROM sixtysix.user_cohort_slots s JOIN sixtysix.memberships m ON m.id=s.membership_id WHERE s.user_id=$1`,[userId])).rows[0];
  }
  private async cleanSlot(client:PoolClient,userId:string|undefined,slot:Awaited<ReturnType<CohortService['slot']>>,rows:CohortRow[],now:Date){
    if(!slot)return false;
    const old=rows.find(row=>row.id===slot.cohort_id)!;
    if(old.cancelled_at||now>finalAt(old)){
      await client.query('DELETE FROM sixtysix.user_cohort_slots WHERE user_id=$1',[userId]);return false;
    }
    return true;
  }
  async list(input:{habitId?:string;cursor?:string;limit?:number},token?:string){
    const cursor=cursorOf(input.cursor);const limit=input.limit??20;
    return inTransaction(this.pool,async client=>{
      const userId=token?(await requireAccountSession(client,token)).user_id:undefined;
      const slot=await this.slot(client,userId);
      const candidates=await client.query<{id:string}>(`SELECT id FROM sixtysix.cohorts WHERE cancelled_at IS NULL AND starts_at>clock_timestamp()
        AND ($1::uuid IS NULL OR habit_id=$1) AND ($2::timestamptz IS NULL OR (starts_at,id)>($2::timestamptz,$3::uuid))
        ORDER BY starts_at,id LIMIT $4`,[input.habitId??null,cursor?.[0]??null,cursor?.[1]??null,limit+1]);
      const {rows,now}=await this.lock(client,[...candidates.rows.map(row=>row.id),...(slot?[slot.cohort_id]:[])]);
      const occupied=await this.cleanSlot(client,userId,slot,rows,now);
      const previous=userId?(await client.query<{cohort_id:string}>('SELECT cohort_id FROM sixtysix.memberships WHERE user_id=$1',[userId])).rows:[];
      const ordered=candidates.rows.map(item=>rows.find(row=>row.id===item.id)!).filter(Boolean);
      const page=ordered.slice(0,limit);const last=page.at(-1);
      return {items:page.map(row=>cohortView(row,now,occupied,previous.some(m=>m.cohort_id===row.id))),
        nextCursor:ordered.length>limit&&last?Buffer.from(JSON.stringify([last.starts_at.toISOString(),last.id])).toString('base64url'):null};
    });
  }
  async detail(id:string,token?:string){
    id=id.toLowerCase();
    const result=await inTransaction(this.pool,async client=>{
      const userId=token?(await requireAccountSession(client,token)).user_id:undefined;
      const slot=await this.slot(client,userId);
      const {rows,now}=await this.lock(client,[id,...(slot?[slot.cohort_id]:[])]);
      const occupied=await this.cleanSlot(client,userId,slot,rows,now);const row=rows.find(r=>r.id===id);
      if(!row)return new CohortError('NOT_FOUND');
      const previous=userId?!!(await client.query('SELECT id FROM sixtysix.memberships WHERE user_id=$1 AND cohort_id=$2',[userId,id])).rowCount:false;
      return cohortView(row,now,occupied,previous);
    });
    if(result instanceof CohortError)throw result;return result;
  }
  async command(token:string,key:string,input:{kind:'join';cohortId:string}|{kind:'cancel';membershipId:string}){
    input=input.kind==='join'?{kind:'join',cohortId:input.cohortId.toLowerCase()}:{kind:'cancel',membershipId:input.membershipId.toLowerCase()};
    const result=await inTransaction(this.pool,async client=>{
      const {user_id:userId}=await requireAccountSession(client,token);
      const path=input.kind==='join'?'/v1/memberships':`/v1/memberships/${input.membershipId}/cancel`;
      const hash=digest(JSON.stringify(['POST',path,input.kind==='join'?{cohortId:input.cohortId}:{confirm:true}]));
      const cached=(await client.query('SELECT request_hash,response_body FROM sixtysix.idempotency_records WHERE user_id=$1 AND scope=$2 AND key=$3',[userId,'business',key])).rows[0];
      const replay=!!cached&&cached.request_hash===hash;
      await reserveBusinessLimits(client,userId,replay);
      if(cached)return replay?cached.response_body as Membership:new CohortError('IDEMPOTENCY_CONFLICT');
      const target=input.kind==='cancel'?(await client.query<Member>('SELECT * FROM sixtysix.memberships WHERE id=$1 AND user_id=$2',[input.membershipId,userId])).rows[0]:undefined;
      if(input.kind==='cancel'&&!target)return new CohortError('NOT_FOUND');
      const id=input.kind==='join'?input.cohortId:target!.cohort_id;
      const slot=await this.slot(client,userId);
      const {rows,now}=await this.lock(client,[id,...(slot?[slot.cohort_id]:[])]);
      const occupied=await this.cleanSlot(client,userId,slot,rows,now);const row=rows.find(r=>r.id===id);
      if(!row)return new CohortError('NOT_FOUND');
      let changed:Member;
      if(input.kind==='join'){
        if(row.cancelled_at||now<row.recruitment_opens_at||now>=row.starts_at)return new CohortError('JOIN_CLOSED');
        if(occupied)return new CohortError('ACTIVE_MEMBERSHIP_EXISTS');
        if((await client.query('SELECT id FROM sixtysix.memberships WHERE user_id=$1 AND cohort_id=$2',[userId,id])).rowCount)return new CohortError('JOIN_CLOSED');
        if(row.participant_count>=row.capacity)return new CohortError('COHORT_FULL');
        changed=(await client.query<Member>('INSERT INTO sixtysix.memberships(user_id,cohort_id,joined_at) VALUES ($1,$2,$3) RETURNING *',[userId,id,now])).rows[0]!;
        await client.query('INSERT INTO sixtysix.user_cohort_slots(user_id,membership_id) VALUES ($1,$2)',[userId,changed.id]);
      }else{
        if(target!.left_at||(!target!.cancelled_at&&(row.cancelled_at||now>=row.starts_at)))return new CohortError('JOIN_CLOSED');
        changed=target!.cancelled_at?target!:(await client.query<Member>('UPDATE sixtysix.memberships SET cancelled_at=$2 WHERE id=$1 RETURNING *',[target!.id,now])).rows[0]!;
        await client.query('DELETE FROM sixtysix.user_cohort_slots WHERE user_id=$1 AND membership_id=$2',[userId,changed.id]);
      }
      const body=membershipView(changed);
      await client.query(`INSERT INTO sixtysix.idempotency_records(user_id,scope,key,request_hash,response_status,response_body,expires_at)
        VALUES ($1,'business',$2,$3,$4,$5,$6)`,[userId,key,hash,input.kind==='join'?201:200,JSON.stringify(body),new Date(Math.max(now.getTime()+90*86400000,finalAt(row).getTime()+86400000))]);
      await client.query(`INSERT INTO sixtysix.audit_events(actor_id,action,target_type,target_id,request_id) VALUES ($1,$2,'membership',$3,$4)`,[userId,`membership.${input.kind}`,body.id,key]);
      return body;
    });
    // Expected rejections commit admission counters and launch/slot maintenance. Unexpected
    // failures roll back membership, slot, success receipt and audit together.
    if(result instanceof CohortError)throw result;return result;
  }
}
