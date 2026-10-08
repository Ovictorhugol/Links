import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { initialCatalog, validateLinks, validateCategoryIcons, HttpError, MAX_BODY } from './catalog.mjs';
import { accounts } from './accounts.mjs';
import { publicationHistory } from './history.mjs';

export function openStore(path,seed = initialCatalog) {
  if(path !== ':memory:')mkdirSync(dirname(path),{recursive:true});
  const db = new DatabaseSync(path,{timeout:5000});
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL, published_version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS draft_links (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, url TEXT NOT NULL, category TEXT NOT NULL, logo TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS releases (version INTEGER PRIMARY KEY, catalog_json TEXT NOT NULL, created_at TEXT NOT NULL, author TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admins (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, username TEXT NOT NULL REFERENCES admins(username), csrf TEXT NOT NULL, expires INTEGER NOT NULL);`);
  if(!db.prepare('PRAGMA table_info(state)').all().some(column => column.name === 'category_icons'))db.exec("ALTER TABLE state ADD COLUMN category_icons TEXT NOT NULL DEFAULT '{}'");
  function transaction(callback) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = callback();db.exec('COMMIT');return result; }
    catch(error) { db.exec('ROLLBACK');throw error; }
  }
  function replaceLinks(links) {
    db.exec('DELETE FROM draft_links');
    const insert = db.prepare('INSERT INTO draft_links VALUES (?, ?, ?, ?, ?, ?, ?)');
    links.forEach((link,index) => insert.run(link.id,link.name,link.description,link.url,link.category,link.logo,index));
  }
  if(!db.prepare('SELECT id FROM state WHERE id = 1').get()) {
    const links = validateLinks(seed.links);
    if(!Number.isSafeInteger(seed.version) || seed.version < 1)throw new Error('Versão inicial inválida.');
    transaction(() => {
      db.prepare('INSERT INTO state (id,revision,published_version) VALUES (1, 1, ?)').run(seed.version);
      replaceLinks(links);
      db.prepare('UPDATE state SET category_icons = ? WHERE id = 1').run(JSON.stringify(validateCategoryIcons(seed.categoryIcons)));
      db.prepare('INSERT INTO releases VALUES (?, ?, ?, ?)').run(seed.version,JSON.stringify({version:seed.version,links,categoryIcons:validateCategoryIcons(seed.categoryIcons)}),new Date().toISOString(),'Catálogo inicial');
    });
  }
  function published() {
    return JSON.parse(db.prepare('SELECT catalog_json FROM releases ORDER BY version DESC LIMIT 1').get().catalog_json);
  }
  function draft() {
    const state = db.prepare('SELECT revision, published_version AS publishedVersion FROM state WHERE id = 1').get();
    const links = db.prepare('SELECT id, name, description, url, category, logo FROM draft_links ORDER BY position').all();
    const categoryIcons = JSON.parse(db.prepare('SELECT category_icons FROM state WHERE id = 1').get().category_icons);
    const publicCatalog = published();
    return {...state,displayVersion:publicCatalog.displayVersion ?? state.publishedVersion,links,categoryIcons,unpublished:JSON.stringify(links) !== JSON.stringify(publicCatalog.links) || JSON.stringify(categoryIcons) !== JSON.stringify(publicCatalog.categoryIcons || {})};
  }
  function save(links,revision,categoryIcons) {
    const validated = validateLinks(links);
    const icons = categoryIcons === undefined ? undefined : validateCategoryIcons(categoryIcons);
    return transaction(() => {
      if(db.prepare('SELECT revision FROM state WHERE id = 1').get().revision !== revision) throw new HttpError(409,'Outro administrador alterou o rascunho. Recarregue antes de salvar.');
      replaceLinks(validated);
      if(icons !== undefined)db.prepare('UPDATE state SET category_icons = ? WHERE id = 1').run(JSON.stringify(icons));
      db.exec('UPDATE state SET revision = revision + 1 WHERE id = 1');
      return draft();
    });
  }
  function publish(revision,publishedVersion,username) {
    return transaction(() => {
      const current = draft();
      if(current.revision !== revision || current.publishedVersion !== publishedVersion) throw new HttpError(409,'O catálogo mudou. Recarregue antes de publicar.');
      if(!current.unpublished)throw new HttpError(400,'Não há alterações para publicar.');
      if(current.publishedVersion >= Number.MAX_SAFE_INTEGER)throw new HttpError(400,'Limite de versões atingido.');
      const catalog = {version:current.publishedVersion + 1,displayVersion:current.displayVersion + 1,links:validateLinks(current.links),categoryIcons:validateCategoryIcons(current.categoryIcons)};
      if(Buffer.byteLength(JSON.stringify(catalog)) > MAX_BODY)throw new HttpError(400,'Catálogo e ícones excedem 8 MB. Reduza as imagens.');
      db.prepare('INSERT INTO releases VALUES (?, ?, ?, ?)').run(catalog.version,JSON.stringify(catalog),new Date().toISOString(),username);
      db.prepare('UPDATE state SET published_version = ? WHERE id = 1').run(catalog.version);
      return draft();
    });
  }
  return {...accounts(db),engine:'sqlite',db,published,draft,save,publish,history:() => publicationHistory(db.prepare('SELECT version, catalog_json, created_at AS createdAt, author FROM releases ORDER BY version DESC LIMIT 21').all()),
    restore(version,revision) {
      if(!Number.isSafeInteger(version) || version < 1)throw new HttpError(400,'Versão inválida.');
      const release = db.prepare('SELECT catalog_json FROM releases WHERE version = ?').get(version);
      if(!release)throw new HttpError(404,'Publicação não encontrada.');
      const catalog = JSON.parse(release.catalog_json);
      return save(catalog.links,revision,catalog.categoryIcons || {});
    },close:() => db.close()};
}
