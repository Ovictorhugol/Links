import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const data = process.env.DONATO_ADMIN_DATA_DIR || join(root,'server/data/admin-launcher');
const url = 'http://127.0.0.1:3032';
const children = [];
let stopping = false;
let ownsLock = false;
const lock = join(data,'session.json');
function start(command,args,options = {}) {
  const child = spawn(command,args,{cwd:root,stdio:'ignore',windowsHide:true,...options});
  child.on('error',error => {console.error(error.message);void stop(1);});
  children.push(child);
  return child;
}
async function stop(code = 0) {
  if(stopping)return;
  stopping = true;
  for(const child of [...children].reverse()) {
    if(!child.pid || child.exitCode !== null || child.signalCode !== null)continue;
    await new Promise(resolve => {
      const killer = spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
      killer.on('error',resolve);killer.on('exit',resolve);
    });
  }
  if(ownsLock)await unlink(lock).catch(() => {});
  process.exitCode = code;
}
process.on('SIGINT',() => void stop());
process.on('SIGTERM',() => void stop());

try {
  await mkdir(data,{recursive:true});
  try {
    const previous = JSON.parse(await readFile(lock,'utf8'));
    try {process.kill(previous.launcher,0);console.log('O painel administrativo ja esta aberto.');process.exit(0);} catch {}
    await unlink(lock);
  } catch(error) {if(error.code !== 'ENOENT')throw error;}
  await writeFile(lock,JSON.stringify({launcher:process.pid}),{flag:'wx'});
  ownsLock = true;
  const browser = [process.env['ProgramFiles(x86)'],process.env.ProgramFiles,process.env.LOCALAPPDATA]
    .filter(Boolean).map(base => join(base,'Microsoft/Edge/Application/msedge.exe')).find(existsSync);
  if(!browser)throw new Error('Microsoft Edge nao encontrado.');
  console.log('Iniciando o painel Donato. Fechar sua janela encerra esta sessao.');
  const backend = start(process.execPath,['server/index.mjs'],{env:{...process.env,DONATO_PORT:'3032',DONATO_HOST:'127.0.0.1',DONATO_ORIGIN:url}});
  let ready = false;
  for(let attempt=0;attempt<90 && !stopping;attempt++) {
    if(backend.exitCode !== null)throw new Error('O servidor administrativo nao iniciou.');
    try {ready = (await fetch(url+'/health',{signal:AbortSignal.timeout(1000)})).ok;} catch {}
    if(ready)break;
    await new Promise(resolve => setTimeout(resolve,500));
  }
  if(!ready || stopping)throw new Error('O painel administrativo nao ficou disponivel.');
  const window = start(browser,[`--user-data-dir=${process.env.DONATO_ADMIN_BROWSER_PROFILE || join(process.env.LOCALAPPDATA,'DonatoLinks','admin-browser')}`,'--no-first-run','--no-default-browser-check','--disable-background-mode',`--app=${url}/admin/`],{stdio:'ignore',windowsHide:false});
  await writeFile(lock,JSON.stringify({launcher:process.pid,backend:backend.pid,browser:window.pid,url:url+'/admin/'}));
  await new Promise(resolve => {window.on('exit',resolve);window.on('error',resolve);});
  await stop();
} catch(error) {
  console.error(error.message);
  await writeFile(join(data,'error.log'),error.stack || error.message).catch(() => {});
  await stop(1);
}
