import { registerAdminRoutes } from './admin/routes.js';
import { AdminService,AdminError } from './admin/service.js';
import { registerNotificationRoutes } from './notifications/routes.js';
import { NotificationService } from './notifications/service.js';
import { registerEntryRoutes } from './entries/routes.js';
import { authAuditContext } from './auth/audit.js';
import { EntryError,EntryService } from './entries/service.js';
import { registerCohortRoutes } from './cohorts/routes.js';
import { CohortError, CohortService } from './cohorts/service.js';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { getPool } from './database.js';
import { AuthContextError, contextConfig, issueContext } from './auth/browser-context.js';
import { registerEmailRoutes, type AuthServices } from './auth/email-routes.js';
import { IdentityError } from './auth/identity-core.js';
import { EmailAuthError } from './auth/email-login.js';
import { registerAccountRoutes, type AccountServices } from './auth/account-routes.js';
import { KakaoError } from './auth/kakao-provider.js';

export interface DatabaseReader {
  ready(): Promise<void>;
  habits(): Promise<Array<{ id: string; name: string; shortName: string; goal: string; imageRef: string; timeOfDay: 'morning' | 'evening' }>>;
}

const database: DatabaseReader = {
  async ready() {
    // Verifies connectivity and the required business table, not merely SELECT 1.
    await getPool().query('SELECT id FROM sixtysix.habits LIMIT 0');
  },
  async habits() {
    const result = await getPool().query(`SELECT id, name, short_name AS "shortName", goal,
      image_ref AS "imageRef", time_of_day AS "timeOfDay"
      FROM sixtysix.habits WHERE retired_at IS NULL ORDER BY slug, id`);
    return result.rows;
  },
};

export function createApp(db: DatabaseReader = database, auth?: AuthServices, accounts?: AccountServices, cohorts?: () => CohortService, entries?: () => EntryService, notifications?: () => NotificationService, admin?: () => AdminService) {
  const app = Fastify({ bodyLimit: 16 * 1024, logger: false,
    requestIdHeader: false, genReqId: () => randomUUID(),
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  app.addHook('onRequest', (request, _reply, done) => {
    authAuditContext.run(request.id, done);
  });
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
  });
  app.setErrorHandler((error, request, reply) => {
    if(error instanceof AdminError){
      return reply.code(error.code==='INVALID_REQUEST'?400:error.code==='NOT_FOUND'?404:409).send({error:{code:error.code,message:'모집 설정과 운영 상태를 확인해주세요.',requestId:request.id}});
    }
    if(error instanceof EntryError){
      const status=error.code==='NOT_FOUND'?404:error.code==='INVALID_TEXT'||error.code==='INVALID_MEDIA'?400:409;
      return reply.code(status).send({error:{code:error.code,message:'기록과 접수 대상을 확인해주세요.',requestId:request.id,...(error.availability?{details:{availability:error.availability}}:{})}});
    }
    if (error instanceof CohortError) {
      const status=error.code==='INVALID_REQUEST'?400:error.code==='NOT_FOUND'?404:409;
      return reply.code(status).send({error:{code:error.code,message:'모집 상태를 확인한 뒤 다시 시도해주세요.',requestId:request.id}});
    }
    if (error instanceof IdentityError || error instanceof EmailAuthError || error instanceof KakaoError) {
      const statuses = { INVALID_CHALLENGE: 400, INVALID_OAUTH_STATE: 400, UNAUTHENTICATED: 401, REAUTH_REQUIRED: 403,
        FORBIDDEN: 403, NOT_FOUND: 404, IDENTITY_ALREADY_LINKED: 409, LAST_IDENTITY: 409,
        RATE_LIMITED: 429, TEMPORARILY_UNAVAILABLE: 503 };
      if (error instanceof EmailAuthError && error.retryAfter) reply.header('Retry-After', String(error.retryAfter));
      return reply.code(statuses[error.code]).send({ error: { code: error.code,
        message: error.code === 'INVALID_CHALLENGE' ? '인증번호를 확인하거나 다시 요청해주세요.' : '요청을 확인한 뒤 다시 시도해주세요.', requestId: request.id } });
    }
    if (error instanceof AuthContextError) {
      return reply.code(error.status).send({ error: { code: error.message,
        message: error.status === 403 ? '요청을 확인해주세요.' : '잠시 후 다시 시도해주세요.', requestId: request.id } });
    }
    const candidate = error as { statusCode?: number };
    const invalid = candidate.statusCode === 400 || candidate.statusCode === 413;
    // Do not return/log driver errors, SQL, request bodies, OTPs or tokens.
    reply.code(invalid ? 400 : 503).send({ error: {
      code: invalid ? 'INVALID_REQUEST' : 'TEMPORARILY_UNAVAILABLE',
      message: invalid ? '요청을 확인해주세요.' : '잠시 후 다시 시도해주세요.', requestId: request.id,
    } });
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: {
    code: 'NOT_FOUND', message: '요청한 항목을 찾을 수 없습니다.', requestId: request.id,
  } }));

  app.get('/v1/health', async () => ({ status: 'ok' }));
  registerEmailRoutes(app, auth);
  registerAccountRoutes(app, accounts);
  registerCohortRoutes(app, cohorts);
  registerEntryRoutes(app, entries);
  registerNotificationRoutes(app, notifications);
  registerAdminRoutes(app, admin);
  app.get('/v1/auth/context', async (request, reply) => {
    const result = issueContext(contextConfig(), request.headers.cookie);
    reply.header('Set-Cookie', result.cookie);
    return { csrfToken: result.csrfToken };
  });
  app.get('/v1/ready', async () => { await db.ready(); return { status: 'ok' }; });
  app.get('/v1/habits', {
    schema: {
      querystring: { type: 'object', additionalProperties: false, properties: {} },
      response: { 200: { type: 'object', additionalProperties: false, required: ['items'], properties: {
        items: { type: 'array', items: { type: 'object', additionalProperties: false,
          required: ['id', 'name', 'shortName', 'goal', 'imageRef', 'timeOfDay'], properties: {
            id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, shortName: { type: 'string' },
            goal: { type: 'string' }, imageRef: { type: 'string' },
            timeOfDay: { type: 'string', enum: ['morning', 'evening'] },
          } } },
      } } },
    },
  }, async () => ({ items: await db.habits() }));
  return app;
}
