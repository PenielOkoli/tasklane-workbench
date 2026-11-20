import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { ActionError } from './engine';
import { reviewSchema, type Review } from './review-contracts';

const name = 'tasklane_studio_review';
const cookieFlags = () => `HttpOnly; Path=/; SameSite=Strict${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
function reviewKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new ActionError(503, 'The studio needs its server session key.');
  return createHash('sha256').update(`studio-review:${secret}`).digest();
}

export function reviewCookie(review: Review) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', reviewKey(), nonce);
  const compressed = deflateSync(JSON.stringify(reviewSchema.parse(review)));
  const encrypted = Buffer.concat([nonce, cipher.update(compressed), cipher.final(), cipher.getAuthTag()]);
  const value = encrypted.toString('base64url');
  if (value.length > 3600) throw new ActionError(409, 'This review reached the demo storage limit. Export it before starting a new one.');
  return `${name}=${value}; ${cookieFlags()}; Max-Age=86400`;
}

export function readReview(request: Request, sessionId: string): Review | null {
  const cookie = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  if (!cookie) return null;
  const key = reviewKey();
  try {
    const value = cookie.slice(name.length + 1);
    if (value.length > 3600) return null;
    const bytes = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(-16));
    const compressed = Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]);
    const review = reviewSchema.parse(JSON.parse(inflateSync(compressed, { maxOutputLength: 16000 }).toString()));
    return review.sessionId === sessionId && review.expiresAt > Date.now() ? review : null;
  } catch {
    return null;
  }
}
