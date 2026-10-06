import type { FastifyInstance, FastifyRequest } from 'fastify';
import { isIP } from 'node:net';
import { getPool } from '../database.js';
import { contextConfig, verifyContext } from './browser-context.js';
import { EmailAuthError, EmailLogin } from './email-login.js';
import { IdentityCore } from './identity-core.js';
import { resendMailer } from './resend-mailer.js';
import { readSessionCookie, sessionCookie } from './session-cookie.js';

export interface AuthServices {
  email(): Pick<EmailLogin, 'issue' | 'verify'>;
  core(): Pick<IdentityCore, 'logout'>;
}
export const defaultAuthServices = {
  email: () => {
    const secret = process.env.AUTH_OTP_SECRET;
    if (!secret || secret.length < 32) throw new EmailAuthError('TEMPORARILY_UNAVAILABLE');
    const mailer = resendMailer();
    return new EmailLogin(getPool(), secret, mailer);
  },
  core: () => new IdentityCore(getPool()),
};
export function requestIp(request: Pick<FastifyRequest, 'headers' | 'ip'>) {
  const candidate = process.env.VERCEL === '1' ? request.headers['x-forwarded-for'] : request.ip;
  if (typeof candidate !== 'string' || !isIP(candidate)) throw new EmailAuthError('TEMPORARILY_UNAVAILABLE');
  return isIP(candidate) === 6 ? new URL(`http://[${candidate}]/`).hostname : candidate;
}
export function authBrowser(request: Pick<FastifyRequest, 'headers' | 'ip'>) {
  const binding = verifyContext(contextConfig(), {
    origin: request.headers.origin ?? '', cookie: request.headers.cookie ?? '',
    csrfToken: typeof request.headers['x-csrf-token'] === 'string' ? request.headers['x-csrf-token'] : '',
  });
  // Vercel overwrites this header. Outside Vercel ignore all forwarded headers.
  // Never enable Fastify trustProxy globally for arbitrary caller headers.
  return { binding, ip: requestIp(request) };
}
const emptyQuery = { type: 'object', additionalProperties: false, properties: {} };
export function registerEmailRoutes(app: FastifyInstance, services: AuthServices = defaultAuthServices) {
  const guard = async (request: FastifyRequest) => { authBrowser(request); };
  app.post<{ Body: { email: string } }>('/v1/auth/code', {
    onRequest: guard,
    schema: { querystring: emptyQuery, body: { type: 'object', additionalProperties: false, required: ['email'],
      properties: { email: { type: 'string', format: 'email', maxLength: 254 } } },
    response: { 202: { type: 'object', additionalProperties: false, required: ['challengeId','expiresAt','message'], properties: {
      challengeId: { type: 'string', format: 'uuid' }, expiresAt: { type: 'string', format: 'date-time' }, message: { type: 'string' },
    } } } },
  }, async (request, reply) => reply.code(202).send(await services.email().issue(request.body.email, authBrowser(request))));

  app.post<{ Body: { challengeId: string; code: string } }>('/v1/auth/verify', {
    onRequest: guard,
    schema: { querystring: emptyQuery, body: { type: 'object', additionalProperties: false, required: ['challengeId','code'],
      properties: { challengeId: { type: 'string', format: 'uuid' }, code: { type: 'string', pattern: '^[0-9]{6}$' } } } },
  }, async (request, reply) => {
    const result = await services.email().verify(request.body.challengeId, request.body.code, authBrowser(request), readSessionCookie(contextConfig(), request.headers.cookie));
    if ('token' in result) reply.header('Set-Cookie', sessionCookie(contextConfig(), result.token, result.expiresAt));
    return { purpose: result.purpose, nextAction: result.nextAction, intentId: result.intentId };
  });

  app.post('/v1/auth/logout', { onRequest: guard, schema: { querystring: emptyQuery } }, async (request, reply) => {
    const config = contextConfig();
    const token = readSessionCookie(config, request.headers.cookie);
    if (token) await services.core().logout(token);
    reply.header('Set-Cookie', sessionCookie(config, '', new Date(0)));
    return reply.code(204).send();
  });
}
