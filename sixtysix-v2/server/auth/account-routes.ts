import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool } from '../database.js';
import { AuthContextError, contextConfig, issueContext, oauthBrowserBinding } from './browser-context.js';
import { authBrowser, defaultAuthServices, requestIp } from './email-routes.js';
import { AuthIntents, type IntentRow } from './auth-intents.js';
import { KakaoLogin } from './kakao-login.js';
import { kakaoProvider, KakaoError } from './kakao-provider.js';
import { IdentityCore, IdentityError } from './identity-core.js';
import type { EmailLogin } from './email-login.js';
import { readSessionCookie, sessionCookie } from './session-cookie.js';

export interface AccountServices {
  intents(): AuthIntents;
  kakao(): KakaoLogin;
  email(): Pick<EmailLogin, 'issueIntent'>;
  core(): Pick<IdentityCore, 'unlink' | 'me'>;
}
const defaults: AccountServices = {
  intents: () => new AuthIntents(getPool()),
  kakao: () => { const provider = kakaoProvider(); return new KakaoLogin(getPool(), contextConfig().secret, provider); },
  email: defaultAuthServices.email,
  core: defaultAuthServices.core,
};
const empty = { type:'object',additionalProperties:false,properties:{} };
const uuid = { type:'string',format:'uuid' };
function requiredToken(request: FastifyRequest) {
  const token = readSessionCookie(contextConfig(), request.headers.cookie);
  if (!token) throw new IdentityError('UNAUTHENTICATED');
  return token;
}
export function registerAccountRoutes(app: FastifyInstance, services: AccountServices = defaults) {
  app.get('/v1/me', {schema:{querystring:empty}}, async request => {
    const token=requiredToken(request);
    return services.core().me(token);
  });
  const guard = async (request: FastifyRequest) => { authBrowser(request); requiredToken(request); };
  async function present(intent: IntentRow, request: FastifyRequest) {
    if (intent.provider === 'email') {
      const challenge = await services.email().issueIntent(intent.id, requiredToken(request), authBrowser(request));
      return { id:intent.id,provider:intent.provider,expiresAt:intent.expires_at.toISOString(),
        nextAction:'ENTER_CODE',challengeId:challenge.challengeId,authorizationUrl:null };
    }
    // URL points to our start endpoint. State is only issued when navigation begins.
    return { id:intent.id,provider:intent.provider,expiresAt:intent.expires_at.toISOString(),
      nextAction:'REDIRECT',challengeId:null,authorizationUrl:`${contextConfig().origin}/v1/auth/kakao/start?intentId=${intent.id}` };
  }
  app.post<{ Body:{identityId:string} }>('/v1/me/reauth-intents', {
    onRequest:guard, schema:{ querystring:empty, body:{ type:'object',additionalProperties:false,required:['identityId'],properties:{identityId:uuid} } },
  }, async (request, reply) => reply.code(201).send(await present(await services.intents().beginReauth(requiredToken(request), request.body.identityId, authBrowser(request).binding), request)));

  app.post<{ Body:{provider:'email'|'kakao';email?:string} }>('/v1/me/identities/link-intents', {
    onRequest:guard, schema:{ querystring:empty,body:{ oneOf:[
      { type:'object',additionalProperties:false,required:['provider','email'],properties:{provider:{const:'email'},email:{type:'string',format:'email',maxLength:254}} },
      { type:'object',additionalProperties:false,required:['provider'],properties:{provider:{const:'kakao'}} },
    ] } },
  }, async (request, reply) => reply.code(201).send(await present(await services.intents().beginLink(requiredToken(request), request.body.provider, authBrowser(request).binding, request.body.email), request)));

  app.post<{ Params:{intentId:string} }>('/v1/me/identities/link-intents/:intentId/complete', {
    onRequest:guard, schema:{querystring:empty,params:{type:'object',required:['intentId'],properties:{intentId:uuid}},body:empty},
  }, async request => services.intents().complete(requiredToken(request), request.params.intentId, authBrowser(request).binding));

  app.delete<{ Params:{identityId:string} }>('/v1/me/identities/:identityId', {
    onRequest:guard, schema:{querystring:empty,params:{type:'object',required:['identityId'],properties:{identityId:uuid}}},
  }, async (request, reply) => { await services.core().unlink(requiredToken(request), request.params.identityId); return reply.code(204).send(); });

  app.get<{ Querystring:{ returnTo?:string;intentId?:string } }>('/v1/auth/kakao/start', {
    schema:{querystring:{type:'object',additionalProperties:false,properties:{returnTo:{type:'string',enum:['/home','/my','/onboarding']},intentId:uuid}}},
  }, async (request, reply) => {
    const config = contextConfig();
    if (request.headers['sec-fetch-site'] === 'cross-site' || (request.headers.origin && request.headers.origin !== config.origin)) throw new AuthContextError(403);
    const context = issueContext(config, request.headers.cookie);
    const binding = oauthBrowserBinding(config, context.cookie);
    const url = await services.kakao().start({binding,ip:requestIp(request)}, request.query.returnTo,
      request.query.intentId, readSessionCookie(config, request.headers.cookie), request.headers['user-agent']);
    reply.header('Set-Cookie', context.cookie).header('Referrer-Policy','no-referrer');
    return reply.code(302).redirect(url);
  });

  app.get<{ Querystring:{state:string;code?:string;error?:string;error_description?:string} }>('/v1/auth/kakao/callback', {
    schema:{ querystring:{ type:'object',additionalProperties:false,required:['state'],properties:{
      state:{type:'string',minLength:1,maxLength:128},code:{type:'string',minLength:1,maxLength:4096},
      error:{type:'string',minLength:1,maxLength:256},error_description:{type:'string',maxLength:2048},
    },oneOf:[{required:['code'],not:{required:['error']}},{required:['error'],not:{required:['code']}}] } },
  }, async (request, reply) => {
    reply.header('Referrer-Policy','no-referrer');
    try {
      const config = contextConfig();
      const result = await services.kakao().callback(request.query, oauthBrowserBinding(config, request.headers.cookie), readSessionCookie(config, request.headers.cookie));
      if (result.session) reply.header('Set-Cookie', sessionCookie(config, result.session.token, result.session.expiresAt));
      return reply.code(302).redirect(result.returnTo);
    } catch (error) {
      const code = error instanceof KakaoError || error instanceof IdentityError ? error.code :
        error instanceof AuthContextError && error.status === 403 ? 'INVALID_OAUTH_STATE' : 'TEMPORARILY_UNAVAILABLE';
      return reply.code(302).redirect(`/my?authError=${code}`);
    }
  });
}
