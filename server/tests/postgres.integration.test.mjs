import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { settings } from '../config.mjs';
import { openPostgresStore } from '../postgres-store.mjs';
import { ensureDefaultAdmin } from '../auth.mjs';
import { createApp } from '../app.mjs';

test('RDS: publicação, concorrência, histórico, sessões e leitura por outra instância', {skip:process.env.DONATO_TEST_POSTGRES !== '1'},async () => {
  const configuration = settings().postgres;
  const schema = `donato_test_${randomBytes(8).toString('hex')}`;
  const store = await openPostgresStore({...configuration,schema});
  let other;
  let server;
  try {
    await ensureDefaultAdmin(store);
    other = await openPostgresStore({...configuration,schema});
    const current = await store.draft();
    const extra = {id:'test-link',name:'TESTE RDS',description:'Teste isolado',url:String.raw`\\servidor\GERAL\Área da equipe\Lista.xlsx`,category:'Trabalho',logo:'/donato-eye.svg'};
    const icons = {Todos:'/donato-eye.svg'};
    const outcomes = await Promise.allSettled([store.save([...current.links,extra],current.revision,icons),other.save([{...extra,id:'other-link'},...current.links],current.revision,icons)]);
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length,1);
    assert.equal(outcomes.find(outcome => outcome.status === 'rejected').reason.status,409);
    const saved = await other.draft();
    const publications = await Promise.allSettled([store.publish(saved.revision,1,'admin'),other.publish(saved.revision,1,'admin')]);
    assert.equal(publications.filter(outcome => outcome.status === 'fulfilled').length,1);
    assert.equal(publications.find(outcome => outcome.status === 'rejected').reason.status,409);
    assert.equal((await other.published()).version,2);
    assert.deepEqual((await other.published()).categoryIcons,icons);
    const history = await other.history();
    assert.equal(history[0].changes.added.length,1);
    assert.equal(history[0].changes.categoryIcons[0].category,'Todos');
    assert.equal(history[1].changes.baseline,true);
    assert.equal((await other.published()).links.length,12);
    const names = (await other.published()).links.map(link => link.name);
    assert.deepEqual(names,[...names].sort((a,b) => a.localeCompare(b,'pt-BR')));
    assert.equal((await other.published()).links.find(link => ['test-link','other-link'].includes(link.id)).url,'file://servidor/GERAL/%C3%81rea%20da%20equipe/Lista.xlsx');
    await assert.rejects(store.save([],(await store.draft()).revision));
    assert.equal((await store.published()).version,2);
    const restored = await other.restore(1,saved.revision);
    await store.publish(restored.revision,2,'admin');
    assert.equal((await other.published()).version,3);
    assert.equal((await other.history()).length,3);
    const config = {origin:'',secure:false};
    server = await createApp(store,config);server.listen(0,'127.0.0.1');await once(server,'listening');
    config.origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${config.origin}/api/admin/login`,{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin'})});
    assert.equal(response.status,200);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const login = await response.json();
    assert.equal((await fetch(`${config.origin}/api/admin/draft`,{headers:{Cookie:cookie}})).status,200);
    assert.equal((await (await fetch(`${config.origin}/api/links`)).json()).version,3);
    const hash = /donato_session=([a-f0-9]+)/.exec(cookie)[1];
    const { tokenHash } = await import('../auth.mjs');
    assert.equal((await other.findSession(tokenHash(hash))).username,'admin');
    assert.equal((await fetch(`${config.origin}/api/admin/logout`,{method:'POST',headers:{Origin:config.origin,Cookie:cookie,'X-CSRF-Token':login.csrf,'Content-Type':'application/json'},body:'{}'})).status,200);
    assert.equal(await other.findSession(tokenHash(hash)),null);
  } finally {
    if(server) {server.closeAllConnections();await new Promise(resolve => server.close(resolve));}
    if(other)await other.close();
    // Only the random schema created by this test is removed; the application schema is untouched.
    if(!/^donato_test_[a-f0-9]{16}$/.test(schema))throw new Error('Schema de teste inesperado.');
    await store.pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await store.close();
  }
});
