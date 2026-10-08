import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { settings } from '../config.mjs';

test('leitor das máquinas acessa somente a publicação atual, com TLS e sem escrita', {skip:process.env.DONATO_TEST_POSTGRES !== '1'},async () => {
  const configuration = JSON.parse(readFileSync(new URL('../data/client-rds.json',import.meta.url),'utf8'));
  const client = new pg.Client({...configuration.postgres,ssl:{ca:readFileSync(settings().postgres.caPath,'utf8'),rejectUnauthorized:true,servername:configuration.postgres.host},connectionTimeoutMillis:10000});
  try {
    await client.connect();
    assert.equal(configuration.postgres.user,'donato_links_reader');
    assert.equal((await client.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only,'on');
    const catalog = JSON.parse((await client.query('SELECT catalog_json FROM donato_links.published_catalog')).rows[0].catalog_json);
    assert.ok(catalog.version >= 1);assert.ok(catalog.links.length > 0);
    const permissions = (await client.query(`SELECT has_table_privilege(current_user,'donato_links.admins','SELECT') AS admins,
      has_table_privilege(current_user,'donato_links.draft_links','UPDATE') AS writes,
      has_table_privilege(current_user,'donato_links.published_catalog','SELECT') AS reads`)).rows[0];
    assert.deepEqual(permissions,{admins:false,writes:false,reads:true});
    await assert.rejects(client.query('SELECT username FROM donato_links.admins'),error => error.code === '42501');
    await assert.rejects(client.query('UPDATE donato_links.draft_links SET name = name WHERE false'),error => ['42501','25006'].includes(error.code));
  } finally {await client.end();}
});
