import type { Pool,PoolClient } from 'pg';
import { inTransaction } from '../database.js';
import { reserveBusinessLimits } from '../business-limits.js';
import { requireAccountSession,digest } from '../auth/identity-core.js';
import { lockCohorts,finalAt } from '../cohorts/service.js';
import { project,entryView,type Snapshot,type MemberRow,type EntryRow } from './projection.js';
import type { Availability,CheckinInput,Target,WriteResult } from '../../src/records/types.js';
export class EntryError extends Error {
  constructor(readonly code:'NOT_FOUND'|'INVALID_TEXT'|'INVALID_MEDIA'|'IDEMPOTENCY_CONFLICT'|'TARGET_CHANGED'|'BEFORE_START'|'ALREADY_FILLED'|'ENDED'|'CANCELLED'|'LEFT'|'PASS_EXHAUSTED',readonly availability?:Availability){super(code);}
}
export class EntryService {
  constructor(private readonly pool:Pick<Pool,'connect'>){}
  private async snapshot(client:PoolClient,userId:string,id:string):Promise<Snapshot|EntryError>{
    const found=(await client.query<MemberRow>('SELECT * FROM sixtysix.memberships WHERE id=$1 AND user_id=$2',[id,userId])).rows[0];
    if(!found)return new EntryError('NOT_FOUND');
    const {rows,now}=await lockCohorts(client,[found.cohort_id]);const cohort=rows[0]!;
    const member=(await client.query<MemberRow>('SELECT * FROM sixtysix.memberships WHERE id=$1 FOR UPDATE',[id])).rows[0]!;
    const habit=(await client.query(`SELECT id,name,short_name AS "shortName",goal,image_ref AS "imageRef",time_of_day AS "timeOfDay" FROM sixtysix.habits WHERE id=$1`,[cohort.habit_id])).rows[0];
    const entries=(await client.query<EntryRow>('SELECT * FROM sixtysix.day_entries WHERE membership_id=$1 ORDER BY cohort_day',[id])).rows;
    const participants=(await client.query<{id:string}>('SELECT id FROM sixtysix.memberships WHERE cohort_id=$1 AND cancelled_at IS NULL AND left_at IS NULL ORDER BY id',[cohort.id])).rows.map(r=>r.id);
    // Aggregation only needs days/kinds/timestamps; never reads another person's body/photo.
    const allEntries=(await client.query<EntryRow>('SELECT membership_id,cohort_day,kind,created_at FROM sixtysix.day_entries WHERE membership_id=ANY($1::uuid[])',[participants])).rows;
    return {now,cohort,member,habit,entries,participants,allEntries};
  }
  async read(token:string,id:string,view:'home'|'record'){
    const result=await inTransaction(this.pool,async client=>{
      const session=await requireAccountSession(client,token);const s=await this.snapshot(client,session.user_id,id.toLowerCase());
      if(s instanceof EntryError)return s;return project(s)[view];
    });if(result instanceof EntryError)throw result;return result;
  }
  async write(token:string,id:string,key:string,kind:'checkin'|'pass',input:CheckinInput|Target):Promise<WriteResult>{
    id=id.toLowerCase();
    const body=kind==='checkin'?{text:(input as CheckinInput).text.trim(),samplePhotoRef:(input as CheckinInput).samplePhotoRef,visibility:(input as CheckinInput).visibility,expectedTargetDay:input.expectedTargetDay,expectedLate:input.expectedLate}:{expectedTargetDay:input.expectedTargetDay,expectedLate:input.expectedLate};
    const result=await inTransaction(this.pool,async client=>{
      const {user_id:userId}=await requireAccountSession(client,token);
      const hash=digest(JSON.stringify(['POST',`/v1/memberships/${id}/${kind==='checkin'?'checkins':'passes'}`,body]));
      const cached=(await client.query('SELECT request_hash,response_body FROM sixtysix.idempotency_records WHERE user_id=$1 AND scope=$2 AND key=$3',[userId,'business',key])).rows[0];
      const replay=!!cached&&cached.request_hash===hash;
      await reserveBusinessLimits(client,userId,replay);
      if(cached)return replay?cached.response_body as WriteResult:new EntryError('IDEMPOTENCY_CONFLICT');
      const s=await this.snapshot(client,userId,id);if(s instanceof EntryError)return s;
      const available=project(s).home.availability;
      if(!available.ok)return new EntryError(available.reason,available);
      if(available.targetDay!==body.expectedTargetDay||available.late!==body.expectedLate)return new EntryError('TARGET_CHANGED',available);
      if(kind==='pass'&&s.entries.filter(e=>e.kind==='pass').length>=3)return new EntryError('PASS_EXHAUSTED');
      if('text' in body){
        if(!body.text||body.text.length>40||body.text.includes('\0'))return new EntryError('INVALID_TEXT');
        if(body.samplePhotoRef!==null){
          const media=await client.query('SELECT sixtysix.lock_active_sample_photo($1) AS allowed',[body.samplePhotoRef]);
          if(!media.rows[0]?.allowed)return new EntryError('INVALID_MEDIA');
        }
      }
      const row=(await client.query<EntryRow>(`INSERT INTO sixtysix.day_entries(membership_id,cohort_day,kind,created_at,body,sample_photo_ref,visibility)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[id,available.targetDay,kind,s.now,'text' in body?body.text:null,'text' in body?body.samplePhotoRef:null,'text' in body?body.visibility:null])).rows[0]!;
      s.entries.push(row);s.allEntries.push(row);
      const response:WriteResult={entry:entryView(row,s.cohort,s.entries),home:project(s).home,invalidate:['home','record','feed','members','outcome']};
      await client.query(`INSERT INTO sixtysix.idempotency_records(user_id,scope,key,request_hash,response_status,response_body,expires_at) VALUES ($1,'business',$2,$3,201,$4,$5)`,[userId,key,hash,JSON.stringify(response),new Date(Math.max(s.now.getTime()+90*86400000,finalAt(s.cohort).getTime()+86400000))]);
      await client.query(`INSERT INTO sixtysix.audit_events(actor_id,action,target_type,target_id,request_id) VALUES ($1,$2,'day_entry',$3,$4)`,[userId,`entry.${kind}`,row.id,key]);
      return response;
    });if(result instanceof EntryError)throw result;return result;
  }
}
