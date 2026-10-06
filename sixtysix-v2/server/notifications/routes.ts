import type { FastifyInstance } from 'fastify';
import { getPool } from '../database.js';
import { contextConfig } from '../auth/browser-context.js';
import { readSessionCookie } from '../auth/session-cookie.js';
import { IdentityError } from '../auth/identity-core.js';
import { NotificationService } from './service.js';
export function registerNotificationRoutes(app:FastifyInstance,service=()=>new NotificationService(getPool())){
  app.get('/v1/me/notifications',{schema:{querystring:{type:'object',additionalProperties:false,properties:{}}}},async request=>{
    const token=readSessionCookie(contextConfig(),request.headers.cookie);
    if(!token)throw new IdentityError('UNAUTHENTICATED');
    return service().list(token);
  });
}
