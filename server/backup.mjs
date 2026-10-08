import { backup, DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { settings } from './config.mjs';

const target = process.argv[2];
if(!target)throw new Error('Informe o destino: npm run admin:backup -- C:\\backups\\donato.sqlite');
const config = settings();
if(config.engine === 'postgres')throw new Error('O banco ativo é PostgreSQL/RDS. Use snapshots do RDS ou pg_dump para backup; este comando exporta apenas SQLite.');
const destination = resolve(target);
if((process.platform === 'win32' ? destination.toLowerCase() === config.dbPath.toLowerCase() : destination === config.dbPath))throw new Error('O backup precisa ter um destino diferente do banco ativo.');
mkdirSync(dirname(destination),{recursive:true});
const db = new DatabaseSync(config.dbPath,{readOnly:true});
try { await backup(db,destination);console.log(`Backup concluído: ${destination}`); }
finally { db.close(); }
