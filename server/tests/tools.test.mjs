import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { openStore } from '../store.mjs';
import { verifyPassword, createSession } from '../auth.mjs';
import { initialCatalog } from '../catalog.mjs';
import { settings } from '../config.mjs';

const execute = promisify(execFile);
test('configuração inicial importa catálogo existente e redefinir senha encerra sessões',async () => {
  const directory = await mkdtemp(join(tmpdir(),'donato-setup-test-'));
  const path = join(directory,'catalog.sqlite');
  const seedPath = join(directory,'seed.json');
  const password = randomBytes(24).toString('hex');
  const env = {...process.env,DONATO_DB_PATH:path,DONATO_ADMIN_USER:'test-admin',DONATO_ADMIN_PASSWORD:password};
  const script = fileURLToPath(new URL('../setup.mjs',import.meta.url));
  try {
    await writeFile(seedPath,JSON.stringify({...initialCatalog,version:7}));
    await execute(process.execPath,[script,'--catalog',seedPath],{env});
    let store = openStore(path);
    assert.equal(store.published().version,7);
    assert.equal(await verifyPassword(password,store.db.prepare('SELECT password_hash FROM admins').get().password_hash),true);
    await createSession(store.db,'test-admin');store.close();
    const nextPassword = randomBytes(24).toString('hex');
    await execute(process.execPath,[script],{env:{...env,DONATO_ADMIN_PASSWORD:nextPassword}});
    store = openStore(path);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,0);
    assert.equal(await verifyPassword(nextPassword,store.db.prepare('SELECT password_hash FROM admins').get().password_hash),true);
    store.close();
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('backup preserva dados confirmados mesmo com o banco aberto em WAL',async () => {
  const directory = await mkdtemp(join(tmpdir(),'donato-backup-test-'));
  const path = join(directory,'catalog.sqlite');
  const target = join(directory,'backup.sqlite');
  const store = openStore(path);
  try {
    const current = store.draft();current.links[0].description = 'Descrição publicada para testar backup';
    const saved = store.save(current.links,current.revision);store.publish(saved.revision,saved.publishedVersion,'test-admin');
    await execute(process.execPath,[fileURLToPath(new URL('../backup.mjs',import.meta.url)),target],{env:{...process.env,DONATO_DB_PATH:path}});
    const restored = openStore(target);
    assert.equal(restored.published().version,2);assert.equal(restored.published().links[0].description,current.links[0].description);restored.close();
    await assert.rejects(execute(process.execPath,[fileURLToPath(new URL('../backup.mjs',import.meta.url)),path],{env:{...process.env,DONATO_DB_PATH:path}}));
  } finally {store.close();await rm(directory,{recursive:true,force:true});}
});
test('configuração exige HTTPS para rede e valida a origem usada pelo painel',() => {
  assert.equal(settings({}).origin,'http://127.0.0.1:3030');
  assert.equal(settings({DONATO_ORIGIN:'https://links.example.com'}).secure,true);
  for(const origin of ['http://links.example.com','https://links.example.com/admin/','https://user:password@links.example.com'])assert.throws(() => settings({DONATO_ORIGIN:origin}));
});
