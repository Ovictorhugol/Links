import pg from 'pg';
import { readFileSync } from 'node:fs';
import { publicationHistory } from './history.mjs';
import { initialCatalog, validateLinks, validateCategoryIcons, HttpError, MAX_BODY } from './catalog.mjs';

export async function openPostgresStore(config,seed = initialCatalog) {
  if(!/^[a-z][a-z0-9_]{0,62}$/.test(config.schema))throw new Error('Schema PostgreSQL inválido.');
  const schema = `"${config.schema}"`;
  const pool = new pg.Pool({host:config.host,port:config.port,database:config.database,user:config.user,password:config.password,
    ssl:{ca:readFileSync(config.caPath,'utf8'),rejectUnauthorized:true,servername:config.host},max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,statement_timeout:15000});
  pool.on('error',error => console.error('Conexão PostgreSQL indisponível:',error.code || 'erro de conexão'));
  async function transaction(work) {
    const client = await pool.connect();
    try {await client.query('BEGIN');const result = await work(client);await client.query('COMMIT');return result;}
    catch(error) {await client.query('ROLLBACK').catch(() => {});throw error;}
    finally {client.release();}
  }
  async function lockInitialization(client) {await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`donato-links:${config.schema}`]);}
  async function replaceLinks(client,links) {
    await client.query(`DELETE FROM ${schema}.draft_links`);
    if(links.length) {
      await client.query(`INSERT INTO ${schema}.draft_links (id,name,description,url,category,logo,position)
        SELECT value->>'id',value->>'name',value->>'description',value->>'url',value->>'category',value->>'logo',(ordinality - 1)::integer
        FROM json_array_elements($1::json) WITH ORDINALITY AS l(value,ordinality)`,[JSON.stringify(links)]);
    }
  }
  // State is locked for every edit/publication, also when multiple API instances share the RDS.
  async function state(client,lock = false) {
    const row = (await client.query(`SELECT revision,published_version FROM ${schema}.state WHERE id = 1${lock ? ' FOR UPDATE' : ''}`)).rows[0];
    if(!row)throw new HttpError(503,'O banco ainda não foi inicializado. Execute a migração.');
    return {revision:Number(row.revision),publishedVersion:Number(row.published_version)};
  }
  async function published(client = pool) {
    const row = (await client.query(`SELECT catalog_json FROM ${schema}.releases ORDER BY version DESC LIMIT 1`)).rows[0];
    if(!row)throw new HttpError(503,'Catálogo ainda não inicializado.');
    return JSON.parse(row.catalog_json);
  }
  async function readDraft(client,current) {
    const links = (await client.query(`SELECT id,name,description,url,category,logo FROM ${schema}.draft_links ORDER BY position`)).rows;
    const categoryIcons = JSON.parse((await client.query(`SELECT category_icons FROM ${schema}.state WHERE id = 1`)).rows[0].category_icons);
    const publicCatalog = await published(client);
    return {...current,displayVersion:publicCatalog.displayVersion ?? current.publishedVersion,links,categoryIcons,unpublished:JSON.stringify(links) !== JSON.stringify(publicCatalog.links) || JSON.stringify(categoryIcons) !== JSON.stringify(publicCatalog.categoryIcons || {})};
  }
  try {
    await transaction(async client => {
      await lockInitialization(client);
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema};
        CREATE TABLE IF NOT EXISTS ${schema}.state (id integer PRIMARY KEY CHECK(id = 1),revision bigint NOT NULL,published_version bigint NOT NULL);
        ALTER TABLE ${schema}.state ADD COLUMN IF NOT EXISTS category_icons text NOT NULL DEFAULT '{}';
        CREATE TABLE IF NOT EXISTS ${schema}.draft_links (id text PRIMARY KEY,name text NOT NULL,description text NOT NULL,url text NOT NULL,category text NOT NULL,logo text NOT NULL,position integer NOT NULL);
        CREATE TABLE IF NOT EXISTS ${schema}.releases (version bigint PRIMARY KEY,catalog_json text NOT NULL,created_at text NOT NULL,author text NOT NULL);
        CREATE TABLE IF NOT EXISTS ${schema}.admins (username text PRIMARY KEY,password_hash text NOT NULL);
        CREATE TABLE IF NOT EXISTS ${schema}.sessions (token_hash text PRIMARY KEY,username text NOT NULL REFERENCES ${schema}.admins(username),csrf text NOT NULL,expires bigint NOT NULL);
        CREATE INDEX IF NOT EXISTS sessions_expiry ON ${schema}.sessions(expires);`);
      if(seed && !(await client.query(`SELECT id FROM ${schema}.state WHERE id = 1`)).rowCount) {
        const links = validateLinks(seed.links);
        if(!Number.isSafeInteger(seed.version) || seed.version < 1)throw new Error('Versão inicial inválida.');
        await client.query(`INSERT INTO ${schema}.state (id,revision,published_version) VALUES (1,1,$1)`,[seed.version]);
        await replaceLinks(client,links);
        await client.query(`UPDATE ${schema}.state SET category_icons = $1 WHERE id = 1`,[JSON.stringify(validateCategoryIcons(seed.categoryIcons))]);
        await client.query(`INSERT INTO ${schema}.releases VALUES ($1,$2,$3,$4)`,[seed.version,JSON.stringify({version:seed.version,links,categoryIcons:validateCategoryIcons(seed.categoryIcons)}),new Date().toISOString(),'Catálogo inicial']);
      }
    });
  } catch(error) {await pool.end();throw error;}
  async function save(links,revision,categoryIcons) {
    const validated = validateLinks(links);
    const icons = categoryIcons === undefined ? undefined : validateCategoryIcons(categoryIcons);
    return transaction(async client => {
      const current = await state(client,true);
      if(current.revision !== revision)throw new HttpError(409,'Outro administrador alterou o rascunho. Recarregue antes de salvar.');
      await replaceLinks(client,validated);
      if(icons !== undefined)await client.query(`UPDATE ${schema}.state SET category_icons = $1 WHERE id = 1`,[JSON.stringify(icons)]);
      await client.query(`UPDATE ${schema}.state SET revision = revision + 1 WHERE id = 1`);
      return readDraft(client,{...current,revision:current.revision + 1});
    });
  }
  return {
    engine:'postgres',pool,published,
    draft:() => transaction(async client => readDraft(client,await state(client,true))),save,
    publish:(revision,publishedVersion,username) => transaction(async client => {
      const current = await state(client,true);
      if(current.revision !== revision || current.publishedVersion !== publishedVersion)throw new HttpError(409,'O catálogo mudou. Recarregue antes de publicar.');
      const draft = await readDraft(client,current);
      if(!draft.unpublished)throw new HttpError(400,'Não há alterações para publicar.');
      if(current.publishedVersion >= Number.MAX_SAFE_INTEGER)throw new HttpError(400,'Limite de versões atingido.');
      const catalog = {version:publishedVersion + 1,displayVersion:draft.displayVersion + 1,links:validateLinks(draft.links),categoryIcons:validateCategoryIcons(draft.categoryIcons)};
      if(Buffer.byteLength(JSON.stringify(catalog)) > MAX_BODY)throw new HttpError(400,'Catálogo e ícones excedem 8 MB. Reduza as imagens.');
      await client.query(`INSERT INTO ${schema}.releases VALUES ($1,$2,$3,$4)`,[catalog.version,JSON.stringify(catalog),new Date().toISOString(),username]);
      await client.query(`UPDATE ${schema}.state SET published_version = $1 WHERE id = 1`,[catalog.version]);
      return {...draft,publishedVersion:catalog.version,displayVersion:catalog.displayVersion,unpublished:false};
    }),
    history:async () => publicationHistory((await pool.query(`SELECT version,catalog_json,created_at AS "createdAt",author FROM ${schema}.releases ORDER BY version DESC LIMIT 21`)).rows),
    restore:async (version,revision) => {
      if(!Number.isSafeInteger(version) || version < 1)throw new HttpError(400,'Versão inválida.');
      const release = (await pool.query(`SELECT catalog_json FROM ${schema}.releases WHERE version = $1`,[version])).rows[0];
      if(!release)throw new HttpError(404,'Publicação não encontrada.');
      const catalog = JSON.parse(release.catalog_json);
      return save(catalog.links,revision,catalog.categoryIcons || {});
    },
    hasAdmins:async () => (await pool.query(`SELECT username FROM ${schema}.admins LIMIT 1`)).rowCount > 0,
    getAdmin:async username => (await pool.query(`SELECT username,password_hash FROM ${schema}.admins WHERE username = $1`,[username])).rows[0] || null,
    insertDefaultAdmin:async hash => (await pool.query(`INSERT INTO ${schema}.admins (username,password_hash) SELECT 'admin',$1 WHERE NOT EXISTS (SELECT 1 FROM ${schema}.admins) ON CONFLICT DO NOTHING`,[hash])).rowCount > 0,
    upsertAdmin:async (username,hash) => pool.query(`INSERT INTO ${schema}.admins VALUES ($1,$2) ON CONFLICT(username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,[username,hash]),
    deleteUserSessions:async username => pool.query(`DELETE FROM ${schema}.sessions WHERE username = $1`,[username]),
    saveSession:async (hash,username,csrf,expires) => transaction(async client => {
      await client.query(`DELETE FROM ${schema}.sessions WHERE expires <= $1`,[Date.now()]);
      await client.query(`INSERT INTO ${schema}.sessions VALUES ($1,$2,$3,$4)`,[hash,username,csrf,expires]);
    }),
    findSession:async hash => (await pool.query(`SELECT username,csrf FROM ${schema}.sessions WHERE token_hash = $1 AND expires > $2`,[hash,Date.now()])).rows[0] || null,
    deleteSession:async hash => pool.query(`DELETE FROM ${schema}.sessions WHERE token_hash = $1`,[hash]),
    importSnapshot:snapshot => transaction(async client => {
      await lockInitialization(client);
      if((await client.query(`SELECT id FROM ${schema}.state WHERE id = 1`)).rowCount)throw new Error('O RDS já tem um catálogo inicializado. Migração cancelada para preservar os dados.');
      const links = validateLinks(snapshot.links);
      for(const release of snapshot.releases) {
        const catalog = JSON.parse(release.catalog_json);validateLinks(catalog.links);
        if(!Number.isSafeInteger(catalog.version) || catalog.version !== release.version)throw new Error('Histórico local inválido.');
        await client.query(`INSERT INTO ${schema}.releases VALUES ($1,$2,$3,$4)`,[release.version,release.catalog_json,release.created_at,release.author]);
      }
      await client.query(`INSERT INTO ${schema}.state (id,revision,published_version) VALUES (1,$1,$2)`,[snapshot.state.revision,snapshot.state.published_version]);
      await replaceLinks(client,links);
      await client.query(`UPDATE ${schema}.state SET category_icons = $1 WHERE id = 1`,[JSON.stringify(validateCategoryIcons(snapshot.categoryIcons))]);
      for(const admin of snapshot.admins)await client.query(`INSERT INTO ${schema}.admins VALUES ($1,$2)`,[admin.username,admin.password_hash]);
      return {version:snapshot.state.published_version,links:links.length,releases:snapshot.releases.length};
    }),
    close:() => pool.end(),
  };
}
