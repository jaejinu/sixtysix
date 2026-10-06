import type { FastifyInstance,FastifyRequest } from 'fastify';
import { getPool } from '../database.js';
import { contextConfig } from '../auth/browser-context.js';
import { readSessionCookie } from '../auth/session-cookie.js';
import { authBrowser } from '../auth/email-routes.js';
import { IdentityError } from '../auth/identity-core.js';
import { CohortService } from './service.js';
const empty={type:'object',additionalProperties:false,properties:{}};
const uuid={type:'string',format:'uuid'};
// Anonymous public reads work before provider setup; a supplied session is always validated.
function optionalToken(request:FastifyRequest){
  if(!/(?:^|;\s*)(?:__Host-)?sixtysix\.session=/.test(request.headers.cookie??''))return undefined;
  return readSessionCookie(contextConfig(),request.headers.cookie);
}
function token(request:FastifyRequest){const value=optionalToken(request);if(!value)throw new IdentityError('UNAUTHENTICATED');return value;}
export function registerCohortRoutes(app:FastifyInstance,service:()=>CohortService=()=>new CohortService(getPool())){
  app.get<{Querystring:{habitId?:string;cursor?:string;limit?:string}}>('/v1/cohorts',{schema:{querystring:{type:'object',additionalProperties:false,properties:{habitId:uuid,cursor:{type:'string',minLength:1,maxLength:256},limit:{type:'string',pattern:'^(?:[1-9]|[1-4][0-9]|50)$'}}}}},async request=>{
    const session=optionalToken(request);const {limit,...query}=request.query;
    return service().list({...query,...(limit?{limit:Number(limit)}:{})},session);
  });
  app.get<{Params:{cohortId:string}}>('/v1/cohorts/:cohortId',{schema:{querystring:empty,params:{type:'object',required:['cohortId'],properties:{cohortId:uuid}}}},async request=>{
    const session=optionalToken(request);return service().detail(request.params.cohortId,session);
  });
  const guard=async(request:FastifyRequest)=>{token(request);authBrowser(request);};
  const headers={type:'object',required:['idempotency-key'],properties:{'idempotency-key':uuid}};
  app.post<{Body:{cohortId:string}}>('/v1/memberships',{onRequest:guard,schema:{headers,querystring:empty,body:{type:'object',additionalProperties:false,required:['cohortId'],properties:{cohortId:uuid}}}},async(request,reply)=>reply.code(201).send(await service().command(token(request),request.headers['idempotency-key'] as string,{kind:'join',cohortId:request.body.cohortId})));
  app.post<{Params:{membershipId:string};Body:{confirm:true}}>('/v1/memberships/:membershipId/cancel',{onRequest:guard,schema:{headers,querystring:empty,params:{type:'object',required:['membershipId'],properties:{membershipId:uuid}},body:{type:'object',additionalProperties:false,required:['confirm'],properties:{confirm:{const:true}}}}},async request=>service().command(token(request),request.headers['idempotency-key'] as string,{kind:'cancel',membershipId:request.params.membershipId}));
}
