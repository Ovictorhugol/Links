import pg from 'pg';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {settings} from './config.mjs';

const config = settings().postgres;
const username = 'donato_links_admin_portable';
const file = resolve('server/data/admin-portable-rds.json');
const quote = value => '"'+value.replaceAll('"','""')+'"';
const client = new pg.Client({...config,ssl:{ca:readFileSync(config.caPath,'utf8'),rejectUnauthorized:true,servername:config.host},connectionTimeoutMillis:10000});
try {
  await client.connect();
  const existing = (await client.query('SELECT rolname FROM pg_roles WHERE rolname=$1',[username])).rowCount > 0;
  const saved = existsSync(file) ? JSON.parse(readFileSync(file,'utf8')) : null;
  if(existing && (!saved || saved.user !== username || saved.host !== config.host || saved.database !== config.database))throw new Error('Portable account already exists. Recover its saved configuration before packaging.');
  const password = saved?.password || randomBytes(36).toString('base64url');
  if(!/^[A-Za-z0-9_-]{40,100}$/.test(password))throw new Error('Invalid portable account credential.');
  await client.query('BEGIN');
  if(!existing)await client.query(`CREATE ROLE ${quote(username)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
  await client.query(`GRANT CONNECT ON DATABASE ${quote(config.database)} TO ${quote(username)}`);
  await client.query(`GRANT USAGE ON SCHEMA ${quote(config.schema)} TO ${quote(username)}`);
  for(const table of ['state','draft_links','releases','admins','sessions'])await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${quote(config.schema)}.${quote(table)} TO ${quote(username)}`);
  mkdirSync(dirname(file),{recursive:true});
  writeFileSync(file,JSON.stringify({host:config.host,port:config.port,database:config.database,user:username,password,schema:config.schema},null,2),{mode:0o600});
  await client.query('COMMIT');
  console.log('Portable administrator account configured with catalog table access.');
} catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
finally {await client.end();}
