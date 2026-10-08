import pg from 'pg';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { settings } from './config.mjs';

const config = settings().postgres;
const file = resolve('server/data/client-rds.json');
const username = 'donato_links_reader';
const quote = value => `"${value.replaceAll('"','""')}"`;
const client = new pg.Client({...config,ssl:{ca:readFileSync(config.caPath,'utf8'),rejectUnauthorized:true,servername:config.host},connectionTimeoutMillis:10000});
try {
  await client.connect();
  const existing = (await client.query('SELECT rolname FROM pg_roles WHERE rolname = $1',[username])).rowCount > 0;
  const saved = existsSync(file) ? JSON.parse(readFileSync(file,'utf8')) : null;
  if(existing && (!saved || saved.postgres?.user !== username || saved.postgres?.host !== config.host))throw new Error('O usuário leitor já existe, mas sua configuração local não foi encontrada. Recupere a configuração antes de executar novamente.');
  const password = saved?.postgres.password || randomBytes(36).toString('base64url');
  if(!/^[A-Za-z0-9_-]{40,100}$/.test(password))throw new Error('Credencial do leitor inválida.');
  await client.query('BEGIN');
  if(!existing)await client.query(`CREATE ROLE ${quote(username)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
  await client.query(`CREATE OR REPLACE VIEW ${quote(config.schema)}.published_catalog AS SELECT version,catalog_json FROM ${quote(config.schema)}.releases ORDER BY version DESC LIMIT 1`);
  await client.query(`GRANT CONNECT ON DATABASE ${quote(config.database)} TO ${quote(username)}`);
  await client.query(`GRANT USAGE ON SCHEMA ${quote(config.schema)} TO ${quote(username)}`);
  await client.query(`GRANT SELECT ON ${quote(config.schema)}.published_catalog TO ${quote(username)}`);
  await client.query(`ALTER ROLE ${quote(username)} SET default_transaction_read_only = on`);
  const settings = {source:'postgres',catalogUrl:null,pollIntervalMinutes:60,postgres:{host:config.host,port:config.port,database:config.database,user:username,password}};
  mkdirSync(dirname(file),{recursive:true});
  // Write the generated credential before committing so a filesystem failure rolls back role creation.
  writeFileSync(file,JSON.stringify(settings,null,2) + '\n',{mode:0o600});
  await client.query('COMMIT');
  console.log('Usuário leitor configurado. Arquivo para as máquinas: server/data/client-rds.json.');
} catch(error) {await client.query('ROLLBACK').catch(() => {});throw error;}
finally {await client.end();}
