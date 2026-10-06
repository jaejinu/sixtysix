import { EmailAuthError, type CodeMailer } from './email-login.js';

export function resendMailer(env: NodeJS.ProcessEnv = process.env, transport: typeof fetch = fetch): CodeMailer {
  const key = env.RESEND_API_KEY;
  const from = env.AUTH_EMAIL_FROM;
  if (!key || !from || /[\r\n]/.test(from)) throw new EmailAuthError('TEMPORARILY_UNAVAILABLE');
  return {
    async send({ id, email, code }) {
      try {
        const response = await transport('https://api.resend.com/emails', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `login-code/${id}` },
          body: JSON.stringify({ from, to: [email], subject: '육십육 로그인 인증번호',
            text: `육십육 로그인 인증번호는 ${code}입니다.\n5분 안에 입력해주세요.\n요청하지 않았다면 이 이메일을 무시해주세요.` }),
        });
        if (!response.ok) throw new Error('SEND_FAILED');
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string' || !body.id) throw new Error('SEND_FAILED');
      } catch {
        // Provider payloads may contain addresses/secrets. Never propagate them.
        throw new EmailAuthError('TEMPORARILY_UNAVAILABLE');
      }
    },
  };
}
