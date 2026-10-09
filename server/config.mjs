import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
export function settings(env = process.env) {
  const privateFile = new URL('./.env.local',import.meta.url);
  const local = env === process.env && existsSync(privateFile) ? parseEnv(readFileSync(privateFile,'utf8')) : {};
  const values = {...local,...env};
  const engine = env.DONATO_DB_ENGINE || (env.DONATO_DB_PATH ? 'sqlite' : values.DONATO_DB_ENGINE || (values.PGHOST ? 'postgres' : 'sqlite'));
  if(!['sqlite','postgres'].includes(engine))throw new Error('DONATO_DB_ENGINE deve ser postgres ou sqlite.');
  const port = Number(env.DONATO_PORT || 3030);
  if(!Number.isInteger(port) || port < 1 || port > 65535)throw new Error('DONATO_PORT inválida.');
  const origin = new URL(env.DONATO_ORIGIN || `http://127.0.0.1:${port}`);
  if(!['https:','http:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)throw new Error('DONATO_ORIGIN deve conter somente a origem, por exemplo https://links.empresa.com.br.');
  if(origin.protocol !== 'https:' && !['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw new Error('Use HTTPS para acesso pela rede. HTTP é permitido somente para testes locais.');
  const postgres = {host:values.PGHOST,port:Number(values.PGPORT || 5432),database:values.PGDATABASE || 'linksdonato',user:values.PGUSER || 'postgres',password:values.PGPASSWORD,caPath:resolve(values.PGSSLROOTCERT || 'deployment/certificates/global-bundle.pem'),schema:values.DONATO_PG_SCHEMA || 'donato_links'};
  if(values.PGPASSWORD_FILE)postgres.password = readFileSync(resolve(values.PGPASSWORD_FILE),'utf8').replace(/[\r\n]+$/,'');
  if(engine === 'postgres' && (!postgres.host || !postgres.password || !Number.isInteger(postgres.port) || postgres.port < 1 || postgres.port > 65535 || !/^[a-z][a-z0-9_]{0,62}$/.test(postgres.schema)))throw new Error('Configure PGHOST, PGPASSWORD (ou PGPASSWORD_FILE), PGPORT e DONATO_PG_SCHEMA para o PostgreSQL.');
  postgres.initializeSchema = values.DONATO_PG_INITIALIZE_SCHEMA !== '0';
  return {port,host:env.DONATO_HOST || '127.0.0.1',origin:origin.origin,secure:origin.protocol === 'https:',engine,postgres,dbPath:resolve(env.DONATO_DB_PATH || 'server/data/donato.sqlite')};
}
