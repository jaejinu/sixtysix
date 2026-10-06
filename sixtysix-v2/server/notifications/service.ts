import type { Pool } from 'pg';
import { inTransaction } from '../database.js';
import { requireAccountSession } from '../auth/identity-core.js';
export class NotificationService {
  constructor(private readonly pool:Pick<Pool,'connect'>){}
  async list(token:string){
    return inTransaction(this.pool,async client=>{
      const {user_id:userId}=await requireAccountSession(client,token);
      const {rows}=await client.query(`SELECT n.id,n.event_type AS type,n.membership_id AS "membershipId",
        c.generation,h.name AS "habitName",n.created_at AS "createdAt"
        FROM sixtysix.notifications n JOIN sixtysix.cohorts c ON c.id=n.cohort_id
        JOIN sixtysix.habits h ON h.id=c.habit_id
        WHERE n.user_id=$1 ORDER BY n.created_at DESC,n.id DESC LIMIT 50`,[userId]);
      return {items:rows.map(row=>({...row,createdAt:row.createdAt.toISOString()}))};
    });
  }
}
