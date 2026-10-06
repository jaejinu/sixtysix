import type { BrowserContextConfig } from './browser-context.js';
import { IdentityError } from './identity-core.js';
const name = (config: BrowserContextConfig) => config.origin.startsWith('https:') ? '__Host-sixtysix.session' : 'sixtysix.session';
export function sessionCookie(config: BrowserContextConfig, token: string, expiresAt: Date) {
  return `${name(config)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))}${config.origin.startsWith('https:') ? '; Secure' : ''}`;
}
export function readSessionCookie(config: BrowserContextConfig, cookies?: string): string | undefined {
  const values = (cookies ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${name(config)}=`));
  if (!values.length) return undefined;
  if (values.length !== 1) throw new IdentityError('UNAUTHENTICATED');
  const value = values[0]!.slice(name(config).length + 1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new IdentityError('UNAUTHENTICATED');
  return value;
}
