import type { FastifyInstance,FastifyRequest } from 'fastify';
import { getPool } from '../database.js';
import { contextConfig } from '../auth/browser-context.js';
import { readSessionCookie } from '../auth/session-cookie.js';
import { IdentityError } from '../auth/identity-core.js';
import { authBrowser } from '../auth/email-routes.js';
import { EntryService } from './service.js';
import type { CheckinInput,Target } from '../../src/records/types.js';
const empty={type:'object',additionalProperties:false,properties:{}};
const params={type:'object',required:['membershipId'],properties:{membershipId:{type:'string',format:'uuid'}}};
function token(request:FastifyRequest){const value=readSessionCookie(contextConfig(),request.headers.cookie);if(!value)throw new IdentityError('UNAUTHENTICATED');return value;}
export function registerEntryRoutes(app:FastifyInstance,service:()=>EntryService=()=>new EntryService(getPool())){
  for(const view of ['home','record'] as const)app.get<{Params:{membershipId:string}}>(`/v1/memberships/:membershipId/${view}`,{schema:{params,querystring:empty}},async request=>{const session=token(request);return service().read(session,request.params.membershipId,view);});
  const target={expectedTargetDay:{type:'integer',minimum:1,maximum:66},expectedLate:{type:'boolean'}};
  for(const kind of ['checkin','pass'] as const)app.post<{Params:{membershipId:string};Body:CheckinInput|Target}>(`/v1/memberships/:membershipId/${kind==='checkin'?'checkins':'passes'}`,{
    onRequest:async request=>{token(request);authBrowser(request);},schema:{params,querystring:empty,headers:{type:'object',required:['idempotency-key'],properties:{'idempotency-key':{type:'string',format:'uuid'}}},body:{type:'object',additionalProperties:false,required:['expectedTargetDay','expectedLate',...(kind==='checkin'?['text','samplePhotoRef','visibility']:[])],properties:{...target,...(kind==='checkin'?{text:{type:'string',minLength:1},samplePhotoRef:{anyOf:[{type:'string',maxLength:200},{type:'null'}]},visibility:{enum:['cohort','private']}}:{})}}},
  },async(request,reply)=>reply.code(201).send(await service().write(token(request),request.params.membershipId,request.headers['idempotency-key'] as string,kind,request.body)));
}
