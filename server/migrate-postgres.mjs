import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { settings } from './config.mjs';
import { openPostgresStore } from './postgres-store.mjs';
import { ensureDefaultAdmin } from './auth.mjs';

const config = settings();
if(config.engine !== 'postgres')throw new Error('Configure DONATO_DB_ENGINE=postgres antes de migrar.');
const source = new DatabaseSync(resolve(process.argv[2] || 'server/data/donato.sqlite'),{readOnly:true});
let target;
try {
  source.exec('BEGIN');
  const snapshot = {
    state:source.prepare('SELECT revision,published_version FROM state WHERE id = 1').get(),
    links:source.prepare('SELECT id,name,description,url,category,logo FROM draft_links ORDER BY position').all(),
    releases:source.prepare('SELECT version,catalog_json,created_at,author FROM releases ORDER BY version').all(),
    categoryIcons:source.prepare('PRAGMA table_info(state)').all().some(column => column.name === 'category_icons') ? JSON.parse(source.prepare('SELECT category_icons FROM state WHERE id=1').get().category_icons) : {},
    admins:source.prepare('SELECT username,password_hash FROM admins').all(),
  };
  source.exec('COMMIT');
  target = await openPostgresStore(config.postgres,null);
  const result = await target.importSnapshot(snapshot);
  await ensureDefaultAdmin(target);
  console.log(`Migração concluída: ${result.links} links, ${result.releases} publicações, catálogo v${result.version}. Banco: ${config.postgres.database}.`);
} finally {source.close();if(target)await target.close();}
