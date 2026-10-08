import { initialCatalog } from './catalog.mjs';
export async function connectStore(config,seed = initialCatalog) {
  if(config.engine === 'postgres') {
    const { openPostgresStore } = await import('./postgres-store.mjs');
    return openPostgresStore(config.postgres,seed);
  }
  const { openStore } = await import('./store.mjs');
  return openStore(config.dbPath,seed);
}
