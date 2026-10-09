import {mkdir,copyFile,cp,readFile,writeFile,readdir,stat,rm} from 'node:fs/promises';
import {resolve,join,dirname,sep} from 'node:path';
import {settings} from '../server/config.mjs';

const root = process.cwd();
const destination = resolve('release/Admin-Donato-Portable');
const config = settings();
const portable = JSON.parse(await readFile(resolve('server/data/admin-portable-rds.json'),'utf8'));
if(config.engine !== 'postgres')throw new Error('Configure PostgreSQL before packaging the portable administrator.');
if(portable.user !== 'donato_links_admin_portable' || portable.host !== config.postgres.host || portable.database !== config.postgres.database || !portable.password)throw new Error('Run node server/setup-admin-portable.mjs before packaging.');
const packages = new Set();
async function includePackage(name,base = root) {
  if(packages.has(name))return;
  let directory = base;
  let source;
  while(directory !== dirname(directory)) {
    const candidate = join(directory,'node_modules',name);
    try {await stat(join(candidate,'package.json'));source = candidate;break;} catch {}
    directory = dirname(directory);
  }
  if(!source)throw new Error('Missing dependency: '+name);
  packages.add(name);
  await cp(source,join(destination,'node_modules',name),{recursive:true});
  const manifest = JSON.parse(await readFile(join(source,'package.json'),'utf8'));
  for(const dependency of Object.keys(manifest.dependencies || {}))await includePackage(dependency,source);
}
if(!destination.startsWith(root+sep) || destination !== join(root,'release','Admin-Donato-Portable'))throw new Error('Invalid package output directory.');
await rm(destination,{recursive:true,force:true});
await mkdir(destination,{recursive:true});
for(const folder of ['runtime','server','scripts','src','deployment/certificates'])await mkdir(join(destination,folder),{recursive:true});
await copyFile(process.execPath,join(destination,'runtime/node.exe'));
const license = await fetch('https://raw.githubusercontent.com/nodejs/node/'+process.version+'/LICENSE');
if(!license.ok)throw new Error('Could not obtain the Node redistribution license.');
await writeFile(join(destination,'runtime/LICENSE.txt'),await license.text());
const serverFiles = ['accounts','app','auth','catalog','config','database','history','index','postgres-store','store'];
for(const name of serverFiles)await copyFile(join(root,'server',name+'.mjs'),join(destination,'server',name+'.mjs'));
await cp(join(root,'server/public'),join(destination,'server/public'),{recursive:true});
await mkdir(join(destination,'public'),{recursive:true});
await copyFile(join(root,'public/donato-eye.svg'),join(destination,'public/donato-eye.svg'));
await cp(join(root,'public/logos'),join(destination,'public/logos'),{recursive:true});
await copyFile(join(root,'src/catalog.initial.json'),join(destination,'src/catalog.initial.json'));
await copyFile(join(root,'scripts/open-admin.mjs'),join(destination,'scripts/open-admin.mjs'));
await copyFile(config.postgres.caPath,join(destination,'deployment/certificates/global-bundle.pem'));
for(const name of ['Iniciar-Administrador.ps1','Abrir-Administrador.cmd'])await copyFile(join(root,'deployment/portable-admin',name),join(destination,name));
await copyFile(join(root,'src-tauri/icons/icon.ico'),join(destination,'donato-eye.ico'));
await writeFile(join(destination,'package.json'),JSON.stringify({name:'donato-admin-portable',private:true,type:'module'},null,2));
await writeFile(join(destination,'config.json'),JSON.stringify(portable,null,2));
await includePackage('pg');
await writeFile(join(destination,'LEIA-ME.txt'),[
  'ADMINISTRADOR DONATO PORTATIL - Windows x64',
  '1. Copie e extraia a pasta completa na outra maquina.',
  '2. Execute Abrir-Administrador.cmd.',
  '3. O pacote sera copiado para LOCALAPPDATA/DonatoAdminPortable/application.',
  '4. Um atalho Administrador Donato com o logo sera criado na area de trabalho.',
  '5. Entre no painel com seu login de administrador existente.',
  'O pacote usa o mesmo banco central. As alteracoes/publicacoes afetam o catalogo atual.',
  'Requer Microsoft Edge e acesso de rede ao banco na porta configurada.',
  'O acesso ao banco ja esta incluido; use este pacote somente em computadores de administradores.',
  'O painel abre em http://127.0.0.1:3032/admin/. Fechar sua janela encerra o servidor.',
  'Node esta incluido. Nao e necessario instalar Node, npm, Rust ou o aplicativo desktop.',
].join('\r\n'));
console.log('Portable administrator packaged: '+destination+'; '+packages.size+' runtime dependency packages.');
