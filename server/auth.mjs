import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { accounts } from './accounts.mjs';

const derive = promisify(scrypt);
const options = {N:32768,r:8,p:1,maxmem:64 * 1024 * 1024};
export async function hashPassword(password,{allowDefault = false} = {}) {
  if(typeof password !== 'string' || (password.length < 12 && !(allowDefault && password === 'admin')) || password.length > 256)throw new Error('A senha precisa ter entre 12 e 256 caracteres.');
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password,salt,64,options);
  return `${salt}:${hash.toString('hex')}`;
}
export async function ensureDefaultAdmin(db) {
  const repository = accounts(db);
  if(await repository.hasAdmins())return false;
  const hash = await hashPassword('admin',{allowDefault:true});
  return repository.insertDefaultAdmin(hash);
}
export async function verifyPassword(password,stored) {
  if(typeof password !== 'string' || password.length > 256)return false;
  const [salt,hash] = stored.split(':');
  const derived = await derive(password,salt,64,options);
  const expected = Buffer.from(hash,'hex');
  return expected.length === derived.length && timingSafeEqual(derived,expected);
}
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export async function createSession(db,username) {
  const token = randomBytes(32).toString('hex');
  const csrf = randomBytes(32).toString('hex');
  await accounts(db).saveSession(tokenHash(token),username,csrf,Date.now() + 8 * 60 * 60 * 1000);
  return {token,csrf,username};
}
export async function getSession(db,cookie = '') {
  const token = /(?:^|;\s*)donato_session=([a-f0-9]{64})(?:;|$)/.exec(cookie)?.[1];
  if(!token)return null;
  return accounts(db).findSession(tokenHash(token));
}
