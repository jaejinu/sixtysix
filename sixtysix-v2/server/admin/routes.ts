import type { FastifyInstance,FastifyRequest } from 'fastify';
import { getPool } from '../database.js';
import { contextConfig } from '../auth/browser-context.js';
import { readSessionCookie } from '../auth/session-cookie.js';
import { authBrowser } from '../auth/email-routes.js';
import { IdentityError } from '../auth/identity-core.js';
import { AdminService,type CreateCohort } from './service.js';
const uuid={type:'string',format:'uuid'},empty={type:'object',additionalProperties:false,properties:{}};
function token(request:FastifyRequest){const token=readSessionCookie(contextConfig(),request.headers.cookie);if(!token)throw new IdentityError('UNAUTHENTICATED');return token;}
export function registerAdminRoutes(app:FastifyInstance,service=()=>new AdminService(getPool())){
  app.get<{Querystring:{cursor?:string}}>('/v1/admin/cohorts',{schema:{querystring:{type:'object',additionalProperties:false,properties:{cursor:{type:'string',minLength:1,maxLength:256}}}}},async request=>service().list(token(request),request.query.cursor));
  const guard=async(request:FastifyRequest)=>{token(request);authBrowser(request);};
  const headers={type:'object',required:['idempotency-key'],properties:{'idempotency-key':uuid}};
  app.post<{Body:CreateCohort}>('/v1/admin/cohorts',{onRequest:guard,schema:{headers,querystring:empty,body:{type:'object',additionalProperties:false,required:['habitId','policyVersion','generation','startDate','recruitmentOpensAt','capacity','minParticipants'],properties:{habitId:uuid,policyVersion:{const:1},generation:{type:'string',minLength:1,maxLength:40},startDate:{type:'string',format:'date'},recruitmentOpensAt:{type:'string',format:'date-time'},capacity:{type:'integer',minimum:1,maximum:30},minParticipants:{type:'integer',minimum:1,maximum:30}}}}},async(request,reply)=>reply.code(201).send(await service().command(token(request),request.headers['idempotency-key'] as string,{kind:'create',body:request.body})));
  app.post<{Params:{cohortId:string};Body:{reason:string}}>('/v1/admin/cohorts/:cohortId/cancel',{onRequest:guard,schema:{headers,querystring:empty,params:{type:'object',required:['cohortId'],properties:{cohortId:uuid}},body:{type:'object',additionalProperties:false,required:['reason'],properties:{reason:{type:'string',minLength:1,maxLength:200}}}}},async request=>service().command(token(request),request.headers['idempotency-key'] as string,{kind:'cancel',id:request.params.cohortId,reason:request.body.reason}));
}
