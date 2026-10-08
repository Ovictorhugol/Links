import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { HttpError, MAX_BODY } from './catalog.mjs';
import { getSession, createSession, verifyPassword, hashPassword, tokenHash } from './auth.mjs';

export async function createApp(store,config) {
  const dummyHash = await hashPassword('unavailable-account-secret');
  const attempts = new Map();
  const staticFiles = new Map([
    ['/admin/',[new URL('./public/index.html',import.meta.url),'text/html; charset=utf-8']],
    ['/admin/panel.css',[new URL('./public/panel.css',import.meta.url),'text/css; charset=utf-8']],
    ['/admin/panel.js',[new URL('./public/panel.js',import.meta.url),'text/javascript; charset=utf-8']],
    ['/admin/link-address.mjs',[new URL('./public/link-address.mjs',import.meta.url),'text/javascript; charset=utf-8']],
    ['/donato-eye.svg',[new URL('../public/donato-eye.svg',import.meta.url),'image/svg+xml']],
  ]);
  const published = await store.published();
  for(const link of published.links)if(link.logo.startsWith('/logos/'))staticFiles.set(link.logo,[new URL(`../public${link.logo}`,import.meta.url),'image/png']);
  // Embedded logo previews remain available even after their original links are removed.
  const seed = JSON.parse(await readFile(new URL('../src/catalog.initial.json',import.meta.url),'utf8'));
  for(const link of seed.links)staticFiles.set(link.logo,[new URL(`../public${link.logo}`,import.meta.url),'image/png']);
  function send(res,status,data) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data)); }
  async function body(req) {
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))throw new HttpError(415,'Envie conteúdo JSON.');
    if(Number(req.headers['content-length'] || 0) > MAX_BODY)throw new HttpError(413,'Conteúdo excede 8 MB.');
    let size = 0;
    const chunks = [];
    for await(const chunk of req) { size += chunk.length;if(size > MAX_BODY)throw new HttpError(413,'Conteúdo excede 8 MB.');chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400,'JSON inválido.'); }
  }
  function cookie(token,expired = false) { return `donato_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${expired ? 0 : 28800}${config.secure ? '; Secure' : ''}`; }
  return createServer({requestTimeout:30000,headersTimeout:15000,maxHeaderSize:16384},async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const path = new URL(req.url,'http://localhost').pathname;
      if(req.method === 'GET' && ['/api/links','/catalog/links.json'].includes(path))return send(res,200,await store.published());
      if(req.method === 'GET' && path === '/health') {await store.published();return send(res,200,{ok:true,databaseEngine:store.engine});}
      if(req.method === 'GET' && (path === '/' || path === '/admin')) { res.writeHead(302,{Location:'/admin/'});return res.end(); }
      if(req.method === 'GET' && staticFiles.has(path)) {
        const [file,type] = staticFiles.get(path);
        const data = await readFile(file);
        res.writeHead(200,{'Content-Type':type});return res.end(data);
      }
      if(!path.startsWith('/api/admin/'))throw new HttpError(404,'Endereço não encontrado.');
      if(req.method !== 'GET') {
        if(req.headers.origin !== config.origin || req.headers['sec-fetch-site'] === 'cross-site')throw new HttpError(403,'Origem da requisição inválida.');
      }
      if(path === '/api/admin/login' && req.method === 'POST') {
        const address = req.socket.remoteAddress;
        const now = Date.now();
        for(const [key,entry] of attempts)if(entry.until < now)attempts.delete(key);
        const entry = attempts.get(address) || {count:0,until:now + 15 * 60000};
        if(entry.count >= 10) { res.setHeader('Retry-After',Math.ceil((entry.until - now)/1000));throw new HttpError(429,'Muitas tentativas. Tente novamente em 15 minutos.'); }
        entry.count++;attempts.set(address,entry);
        const value = await body(req);
        const admin = typeof value?.username === 'string' ? await store.getAdmin(value.username) : null;
        const valid = await verifyPassword(value?.password,admin?.password_hash || dummyHash);
        if(!admin || !valid)throw new HttpError(401,'Usuário ou senha incorretos.');
        attempts.delete(address);
        const session = await createSession(store,admin.username);
        res.setHeader('Set-Cookie',cookie(session.token));
        return send(res,200,{username:session.username,csrf:session.csrf});
      }
      const session = await getSession(store,req.headers.cookie);
      if(!session)throw new HttpError(401,'Entre no painel para continuar.');
      if(req.method !== 'GET' && req.headers['x-csrf-token'] !== session.csrf)throw new HttpError(403,'Sessão inválida. Recarregue o painel.');
      if(path === '/api/admin/session' && req.method === 'GET')return send(res,200,session);
      if(path === '/api/admin/logout' && req.method === 'POST') {
        const token = /donato_session=([a-f0-9]{64})/.exec(req.headers.cookie)?.[1];
        if(token)await store.deleteSession(tokenHash(token));
        res.setHeader('Set-Cookie',cookie('',true));return send(res,200,{ok:true});
      }
      if(path === '/api/admin/draft' && req.method === 'GET')return send(res,200,await store.draft());
      if(path === '/api/admin/draft' && req.method === 'PUT') {
        const value = await body(req);return send(res,200,await store.save(value?.links,value?.revision,value?.categoryIcons));
      }
      if(path === '/api/admin/publish' && req.method === 'POST') {
        const value = await body(req);return send(res,200,await store.publish(value?.revision,value?.publishedVersion,session.username));
      }
      if(path === '/api/admin/history' && req.method === 'GET')return send(res,200,await store.history());
      if(path === '/api/admin/restore' && req.method === 'POST') {
        const value = await body(req);return send(res,200,await store.restore(value?.version,value?.revision));
      }
      throw new HttpError(404,'Operação não encontrada.');
    } catch(error) {
      if(!(error instanceof HttpError))console.error('Falha no servidor:',error.message);
      if(!res.headersSent)send(res,error.status || 500,{error:error.status ? error.message : 'Não foi possível concluir a operação.'});
      else res.end();
    }
  });
}
