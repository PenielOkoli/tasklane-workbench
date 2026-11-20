import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { ActionError } from './engine';
import { runSchema, type Run } from './run-contracts';
export const RUN_COOKIE = 'tasklane_agent_run';
function key(secret = process.env.SESSION_SECRET) {
  if (!secret || secret.length < 32) throw new ActionError(503, 'The agent workspace needs its server session key.');
  return createHash('sha256').update(`agent-run:${secret}`).digest();
}
export function encodeRun(run: Run, secret?: string) {
  const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(secret), nonce);
  const ciphertext = Buffer.concat([cipher.update(deflateSync(Buffer.from(JSON.stringify(runSchema.parse(run))))), cipher.final()]);
  const value = Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64url');
  if (value.length > 3700) throw new ActionError(409, 'This run reached its checkpoint storage limit. Export the trace and start a shorter run.');
  return value;
}
export function decodeRun(value: string, sessionId: string, secret?: string): Run {
  const secretKey = key(secret);
  try {
    if (value.length > 3700) throw new Error('Oversize');
    const bytes = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', secretKey, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const decoded = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
    const run = runSchema.parse(JSON.parse(inflateSync(decoded, { maxOutputLength: 30000 }).toString('utf8')));
    if (run.sessionId !== sessionId || run.expiresAt <= Date.now()) throw new Error('Expired or foreign');
    return run;
  } catch { throw new ActionError(401, 'The saved run expired or could not be verified. Reset the agent session.'); }
}
export function runFromRequest(request: Request, sessionId: string) {
  const value = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${RUN_COOKIE}=`))?.slice(RUN_COOKIE.length + 1);
  return value ? decodeRun(value, sessionId) : null;
}
export function runCookie(run: Run) { return `${RUN_COOKIE}=${encodeRun(run)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`; }
export const clearRunCookie = () => `${RUN_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
