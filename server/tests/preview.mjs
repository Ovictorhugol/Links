// Local-only fixture for browser tests. Never used by admin:start.
import { openStore } from '../store.mjs';
import { hashPassword } from '../auth.mjs';
import { createApp } from '../app.mjs';

const store = openStore(':memory:');
store.db.prepare('INSERT INTO admins VALUES (?, ?)').run('test-admin',await hashPassword('Test-only-password-2026'));
const server = await createApp(store,{origin:'http://127.0.0.1:3031',secure:false});
server.listen(3031,'127.0.0.1',() => console.log('Fixture de testes: banco em memória, somente localhost:3031.'));
