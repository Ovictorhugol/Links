import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../store.mjs';
import { createApp } from '../app.mjs';
import { hashPassword, ensureDefaultAdmin } from '../auth.mjs';

const extra = {id:'portal-novo',name:'Portal novo',description:'Portal da equipe',url:'https://example.com/portal',category:'Equipe',logo:'/donato-eye.svg'};
test('inclusão, renomeação e publicação sempre colocam os links em ordem alfabética',async t => {
  const f = await fixture(t);await f.login();
  let draft = (await f.request('/api/admin/draft')).data;
  const added = ['Zulu','ábaco','Acesso novo'].map((name,index) => ({...extra,id:`alphabetical-${index}`,name}));
  let saved = (await f.request('/api/admin/draft','PUT',{revision:draft.revision,links:[...draft.links,...added].reverse()})).data;
  const names = saved.links.map(link => link.name);
  assert.deepEqual(names,[...names].sort((a,b) => a.localeCompare(b,'pt-BR')));
  assert.equal(names[0],'ábaco');assert.equal(names.at(-1),'Zulu');
  saved = (await f.request('/api/admin/draft','PUT',{revision:saved.revision,links:saved.links.map(link => link.id === added[0].id ? {...link,name:'AAA renomeado'} : link)})).data;
  assert.equal(saved.links[0].name,'AAA renomeado');
  await f.request('/api/admin/publish','POST',{revision:saved.revision,publishedVersion:saved.publishedVersion});
  const published = (await f.request('/api/links')).data;
  assert.deepEqual(published.links,saved.links);
});
test('contador exibido reinicia em zero e próximas publicações mantêm a sincronização crescente',async t => {
  const f = await fixture(t);await f.login();
  const original = f.store.published();
  f.store.db.prepare('UPDATE releases SET catalog_json = ? WHERE version = ?').run(JSON.stringify({...original,displayVersion:0}),original.version);
  const draft = (await f.request('/api/admin/draft')).data;
  assert.equal(draft.displayVersion,0);
  const history = (await f.request('/api/admin/history')).data;
  assert.equal(history[0].displayVersion,0);
  const saved = (await f.request('/api/admin/draft','PUT',{links:[...draft.links,extra],revision:draft.revision})).data;
  const published = (await f.request('/api/admin/publish','POST',{revision:saved.revision,publishedVersion:saved.publishedVersion})).data;
  assert.equal(published.displayVersion,1);
  assert.equal(published.publishedVersion,original.version + 1);
  assert.deepEqual((await f.request('/api/admin/history')).data.map(release => release.displayVersion),[1,0]);
});
test('ícones do menu passam por rascunho, publicação e restauração sem mudar os links',async t => {
  const f = await fixture(t);await f.login();
  let draft = (await f.request('/api/admin/draft')).data;
  const icons = {Trabalho:'/donato-eye.svg',Todos:'/logos/excel.png'};
  const saved = await f.request('/api/admin/draft','PUT',{links:draft.links,revision:draft.revision,categoryIcons:icons});
  assert.equal(saved.status,200);assert.equal(saved.data.unpublished,true);
  assert.deepEqual((await f.request('/api/links')).data.categoryIcons,{});
  draft = saved.data;
  assert.equal((await f.request('/api/admin/publish','POST',{revision:draft.revision,publishedVersion:draft.publishedVersion})).status,200);
  assert.deepEqual((await f.request('/api/links')).data.categoryIcons,icons);
  const legacy = await f.request('/api/admin/draft','PUT',{links:draft.links,revision:draft.revision});
  assert.deepEqual(legacy.data.categoryIcons,icons);
  const invalid = await f.request('/api/admin/draft','PUT',{links:draft.links,revision:legacy.data.revision,categoryIcons:{Todos:'javascript:alert(1)'}});
  assert.equal(invalid.status,400);
  const restored = await f.request('/api/admin/restore','POST',{version:1,revision:legacy.data.revision});
  assert.deepEqual(restored.data.categoryIcons,{});
  assert.deepEqual(restored.data.links,draft.links);
});
async function fixture(t,path = ':memory:',useDefault = false) {
  const store = openStore(path);
  if(useDefault)await ensureDefaultAdmin(store.db);
  else store.db.prepare('INSERT INTO admins VALUES (?, ?)').run('admin',await hashPassword('Test-only-password-2026'));
  const config = {origin:'',secure:false};
  const server = await createApp(store,config);server.listen(0,'127.0.0.1');await once(server,'listening');
  config.origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections();await new Promise(resolve => server.close(resolve));store.close(); });
  let cookie = '';let csrf = '';
  async function request(path,method = 'GET',value,headers = {}) {
    const response = await fetch(`${config.origin}${path}`,{method,headers:{Origin:config.origin,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf,...headers},body:value === undefined ? undefined : JSON.stringify(value)});
    const result = await response.json();
    const setCookie = response.headers.get('set-cookie');if(setCookie)cookie = setCookie.split(';')[0];
    if(result.csrf)csrf = result.csrf;
    return {status:response.status,data:result,response};
  }
  const login = () => request('/api/admin/login','POST',{username:'admin',password:useDefault ? 'admin' : 'Test-only-password-2026'});
  return {store,request,login,origin:config.origin};
}

test('login padrão admin/admin funciona e inicializar novamente não redefine uma conta existente',async t => {
  const f = await fixture(t,':memory:',true);
  assert.equal((await f.login()).status,200);
  f.store.db.prepare('UPDATE admins SET password_hash = ? WHERE username = ?').run(await hashPassword('Custom-password-2026'),'admin');
  assert.equal(await ensureDefaultAdmin(f.store.db),false);
  assert.equal((await f.login()).status,401);
  assert.equal((await f.request('/api/admin/login','POST',{username:'admin',password:'Custom-password-2026'})).status,200);
});

test('aplicativos leem apenas o catálogo publicado; rascunhos não alteram a versão pública',async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/admin/draft')).status,401);
  const initial = (await f.request('/api/links')).data;
  assert.deepEqual((await f.request('/catalog/links.json')).data,initial);
  assert.equal((await f.login()).status,200);
  const current = (await f.request('/api/admin/draft')).data;
  const saved = await f.request('/api/admin/draft','PUT',{revision:current.revision,links:[...current.links,extra]});
  assert.equal(saved.status,200);assert.equal(saved.data.unpublished,true);
  assert.deepEqual((await f.request('/api/links')).data,initial);
  const published = await f.request('/api/admin/publish','POST',{revision:saved.data.revision,publishedVersion:saved.data.publishedVersion});
  assert.equal(published.status,200);
  const result = (await f.request('/api/links')).data;
  assert.equal(result.version,initial.version + 1);assert.equal(result.links.find(link => link.id === extra.id).id,extra.id);
  assert.equal((await f.request('/api/admin/history')).data[0].author,'admin');
});
test('autenticação, logout e proteção contra requisições de outra origem',async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/admin/login','POST',{username:'admin',password:'wrong'})).status,401);
  assert.equal((await f.request('/api/admin/login','POST',{username:'admin',password:'Test-only-password-2026'},{Origin:'https://attacker.example'})).status,403);
  const login = await f.login();assert.equal(login.status,200);
  assert.match(login.response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  assert.equal((await f.request('/api/admin/draft','PUT',{revision:1,links:[extra]},{'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await f.request('/api/admin/logout','POST',{})).status,200);
  assert.equal((await f.request('/api/admin/session')).status,401);
});
test('conflitos entre administradores não sobrescrevem o rascunho nem publicam dados antigos',async t => {
  const f = await fixture(t);await f.login();
  const current = f.store.draft();
  const saved = await f.request('/api/admin/draft','PUT',{revision:current.revision,links:[...current.links,extra]});
  assert.equal(saved.status,200);
  assert.equal((await f.request('/api/admin/draft','PUT',{revision:current.revision,links:current.links})).status,409);
  assert.equal((await f.request('/api/admin/publish','POST',{revision:current.revision,publishedVersion:current.publishedVersion})).status,409);
  assert.equal(f.store.draft().links.find(link => link.id === extra.id).id,extra.id);
});
test('catálogos inválidos e campos executáveis são rejeitados sem alterar os links',async t => {
  const f = await fixture(t);await f.login();
  for(const links of [[],[extra,extra],[{...extra,url:'javascript:alert(1)'}],[{...extra,logo:'file:///C:/secret'}],[{...extra,logo:'https://user:pass@example.com/icon.png'}],[{...extra,category:'Todos'}]]) {
    assert.equal((await f.request('/api/admin/draft','PUT',{revision:1,links})).status,400);
    assert.equal(f.store.draft().revision,1);
  }
});
test('publica arquivos e pastas compartilhadas no mesmo catálogo dos sites',async t => {
  const f = await fixture(t);await f.login();
  const draft = f.store.draft();
  const saved = await f.request('/api/admin/draft','PUT',{revision:draft.revision,links:[...draft.links,{...extra,url:String.raw`\\servidor\GERAL\Área da equipe\Lista.xlsx`}]});
  assert.equal(saved.status,200);
  assert.equal(saved.data.links.find(link => link.id === extra.id).url,'file://servidor/GERAL/%C3%81rea%20da%20equipe/Lista.xlsx');
  assert.equal((await f.request('/api/admin/publish','POST',{revision:saved.data.revision,publishedVersion:saved.data.publishedVersion})).status,200);
  assert.equal((await f.request('/api/links')).data.links.find(link => link.id === extra.id).url,saved.data.links.find(link => link.id === extra.id).url);
});
test('histórico restaura conteúdo em rascunho e uma nova publicação aumenta a versão',async t => {
  const f = await fixture(t);await f.login();
  let current = f.store.save([...f.store.draft().links,extra],1);
  current = f.store.publish(current.revision,current.publishedVersion,'admin');
  const restored = await f.request('/api/admin/restore','POST',{revision:current.revision,version:1});
  assert.equal(restored.status,200);assert.equal(restored.data.unpublished,true);
  assert.equal(f.store.published().version,2);
  f.store.publish(restored.data.revision,2,'admin');assert.equal(f.store.published().version,3);
  assert.equal(f.store.published().links.some(link => link.id === extra.id),false);
});
test('publicações e rascunhos sobrevivem ao reinício do processo',async () => {
  const directory = await mkdtemp(join(tmpdir(),'donato-server-test-'));
  const path = join(directory,'catalog.sqlite');
  let store = openStore(path);
  try {
    const saved = store.save([...store.draft().links,extra],1);
    store.publish(saved.revision,saved.publishedVersion,'admin');store.close();
    store = openStore(path);
    assert.equal(store.published().version,2);assert.equal(store.published().links.find(link => link.id === extra.id).id,extra.id);
    assert.equal(store.draft().unpublished,false);
  } finally {store.close();await rm(directory,{recursive:true,force:true});}
});
test('tentativas de login repetidas são limitadas',async t => {
  const f = await fixture(t);
  for(let index = 0;index < 10;index++)assert.equal((await f.request('/api/admin/login','POST',{username:'admin',password:'wrong'})).status,401);
  assert.equal((await f.login()).status,429);
});
