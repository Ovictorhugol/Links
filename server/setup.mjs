import { createInterface } from 'node:readline/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { settings } from './config.mjs';
import { connectStore } from './database.mjs';
import { hashPassword } from './auth.mjs';

async function secret(question) {
  if(!process.stdin.isTTY)throw new Error('Use um terminal interativo ou defina DONATO_ADMIN_PASSWORD para provisionamento.');
  process.stdout.write(question);
  process.stdin.setRawMode(true);process.stdin.resume();
  return new Promise((resolve,reject) => {
    let password = '';
    function done(error) {
      process.stdin.off('data',input);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');
      if(error)reject(error);else resolve(password);
    }
    function input(chunk) {
      for(const char of chunk.toString('utf8')) {
        if(char === '\u0003')return done(new Error('Operação cancelada.'));
        if(char === '\r' || char === '\n')return done();
        if(char === '\u007f' || char === '\b') { if(password) { password = password.slice(0,-1);process.stdout.write('\b \b'); } }
        else if(char >= ' ' && password.length < 256) { password += char;process.stdout.write('*'); }
      }
    }
    process.stdin.on('data',input);
  });
}
try {
  const useDefault = process.argv.includes('--default');
  let username = useDefault ? 'admin' : process.env.DONATO_ADMIN_USER;
  if(!username) {
    const input = createInterface({input:process.stdin,output:process.stdout});
    username = (await input.question('Usuário administrador: ')).trim();input.close();
  }
  if(!/^[a-zA-Z0-9._-]{3,64}$/.test(username))throw new Error('Use um usuário com 3 a 64 letras, números, ponto, hífen ou sublinhado.');
  const password = useDefault ? 'admin' : process.env.DONATO_ADMIN_PASSWORD || await secret('Senha (mínimo 12 caracteres): ');
  if(!useDefault && !process.env.DONATO_ADMIN_PASSWORD && password !== await secret('Confirme a senha: '))throw new Error('As senhas não coincidem.');
  const hash = await hashPassword(password,{allowDefault:useDefault || (username === 'admin' && password === 'admin')});
  const catalogIndex = process.argv.indexOf('--catalog');
  const seed = catalogIndex >= 0 ? JSON.parse(readFileSync(resolve(process.argv[catalogIndex + 1]),'utf8')) : undefined;
  const store = await connectStore(settings(),seed);
  try {
    await store.upsertAdmin(username,hash);
    await store.deleteUserSessions(username);
    console.log('Administrador configurado. Inicie o painel com npm run admin:start.');
  } finally { await store.close(); }
} catch(error) { console.error(error.message);process.exitCode = 1; }
