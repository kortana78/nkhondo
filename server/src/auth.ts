// Name-only guest auth: JWT sessions (HS256, hand-rolled on node:crypto),
// scrypt-hashed recovery codes, name rules + EN/Chichewa profanity filter.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const NAME_RE = /^[A-Za-z0-9_ ]{3,16}$/;

let badwords: string[] = [];
try {
  const dir = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(dir, '..', 'data', 'badwords.json'), 'utf8');
  badwords = JSON.parse(raw) as string[];
} catch {
  badwords = [];
}

/** Validate a trimmed display name. Returns an error key or null. */
export function validateName(name: string): string | null {
  const n = name.trim();
  if (n.length < 3) return 'too_short';
  if (n.length > 16) return 'too_long';
  if (!NAME_RE.test(n)) return 'bad_chars';
  const low = n.toLowerCase();
  for (const w of badwords) {
    if (w && low.includes(w.toLowerCase())) return 'blocked';
  }
  return null;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface TokenPayload { sub: string; v: number; iat: number }

export function signToken(secret: string, sub: string, version: number): string {
  const h = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const p = b64url(Buffer.from(JSON.stringify({ sub, v: version, iat: Math.floor(Date.now() / 1000) } satisfies TokenPayload)));
  const sig = b64url(createHmac('sha256', secret).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}

export function verifyToken(secret: string, token: string): TokenPayload | null {
  try {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    const expect = b64url(createHmac('sha256', secret).update(`${h}.${p}`).digest());
    const a = Buffer.from(s);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as TokenPayload;
    if (typeof payload.sub !== 'string' || typeof payload.v !== 'number') return null;
    return payload;
  } catch {
    return null;
  }
}

/** 12-char recovery code, e.g. XK7Q-9M2P-4ZDW. */
export function makeRecoveryCode(): string {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const b = randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += abc[b[i] % abc.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

function scryptHash(secret: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return new Promise((res, rej) => {
    scrypt(secret, salt, 32, (err, key) => {
      if (err) rej(err);
      else res(`scrypt$${salt}$${(key as Buffer).toString('hex')}`);
    });
  });
}

export function hashRecoveryCode(code: string): Promise<string> {
  return scryptHash(code.toUpperCase().replace(/[^A-Z0-9]/g, ''));
}

export function checkRecoveryCode(code: string, hash: string): Promise<boolean> {
  const norm = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const parts = hash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return Promise.resolve(false);
  return new Promise((res) => {
    scrypt(norm, parts[1], 32, (err, key) => {
      if (err) { res(false); return; }
      const a = Buffer.from((key as Buffer).toString('hex'));
      const b = Buffer.from(parts[2]);
      res(a.length === b.length && timingSafeEqual(a, b));
    });
  });
}

export function makeTag(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}
