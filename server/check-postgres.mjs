import pg from 'pg';
import { readFileSync } from 'node:fs';
import { settings } from './config.mjs';
const config = settings().postgres;
const client = new pg.Client({host:config.host,port:config.port,database:config.database,user:config.user,password:config.password,connectionTimeoutMillis:10000,
  ssl:{ca:readFileSync(config.caPath,'utf8'),rejectUnauthorized:true,servername:config.host}});
try {
  await client.connect();
  const row = (await client.query('SELECT current_database() AS database, ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()')).rows[0];
  console.log(`RDS conectado: banco ${row.database}, TLS ${row.ssl ? 'ativo e certificado validado' : 'inativo'}.`);
} finally {await client.end();}
