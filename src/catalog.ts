import { invoke, isTauri } from '@tauri-apps/api/core';
import { initialCatalog, validateCatalog, type Catalog } from './data';

export type Snapshot = { catalog: Catalog; lastSync: number | null };
export type ClientConfig = { source?: 'https' | 'postgres'; catalogUrl: string | null; pollIntervalMinutes: number };
export function configured(config: ClientConfig | null): boolean { return !!config && (config.source === 'postgres' || !!config.catalogUrl); }
export type LocalCatalog = { snapshot: Snapshot; config: ClientConfig; warning: string | null };
const cacheKey = 'centraldesk.catalog.v1';
const defaultConfig: ClientConfig = {catalogUrl:null,pollIntervalMinutes:60};
export function browserSnapshot(): Snapshot {
  try {
    const value = JSON.parse(localStorage.getItem(cacheKey) || 'null') as Snapshot;
    validateCatalog(value.catalog);
    if(value.catalog.version >= initialCatalog.version) return value;
  } catch { /* Keep the supplied catalog if the cache is missing or damaged. */ }
  return {catalog:initialCatalog,lastSync:null};
}
async function request(url: string): Promise<Response> {
  const response = await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error(`Servidor retornou HTTP ${response.status}.`);
  return response;
}
export async function loadCatalog(): Promise<LocalCatalog> {
  if(isTauri()) return invoke<LocalCatalog>('load_catalog');
  const snapshot = browserSnapshot();
  try {
    const config = await (await request('/client-config.json')).json() as ClientConfig;
    if(!Number.isInteger(config.pollIntervalMinutes) || config.pollIntervalMinutes < 1 || config.pollIntervalMinutes > 1440 || (config.catalogUrl !== null && (typeof config.catalogUrl !== 'string' || !/^(https:\/\/|\/[^/])/.test(config.catalogUrl)))) throw new Error('Configuração inválida.');
    return {snapshot,config,warning:null};
  } catch {
    return {snapshot,config:defaultConfig,warning:'Não foi possível ler a configuração de atualização.'};
  }
}
export async function syncCatalog(config: ClientConfig): Promise<Snapshot> {
  if(isTauri()) return invoke<Snapshot>('sync_catalog');
  if(!config.catalogUrl) throw new Error('Endereço do catálogo não configurado.');
  const text = await (await request(config.catalogUrl)).text();
  if(new TextEncoder().encode(text).length > 8 * 1024 * 1024) throw new Error('Catálogo muito grande.');
  const catalog = validateCatalog(JSON.parse(text));
  const previous = browserSnapshot();
  if(catalog.version < previous.catalog.version) throw new Error('Servidor retornou versão anterior.');
  const categoryItems = Object.entries(catalog.categoryIcons || {}).map(([name,logo]) => ({id:`category:${name}`,name,logo}));
  for(const item of [...catalog.links,...categoryItems]) {
    if(item.logo.startsWith('https://')) {
      try {
        const blob = await (await request(item.logo)).blob();
        if(blob.size > 512 * 1024 || !['image/png','image/jpeg','image/webp','image/x-icon'].includes(blob.type)) throw new Error('Ícone inválido.');
        item.logo = await new Promise<string>((resolve,reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch {
        item.logo = (item.id.startsWith('category:') ? previous.catalog.categoryIcons?.[item.id.slice(9)] : previous.catalog.links.find(link => link.id === item.id)?.logo) || '/donato-eye.svg';
      }
    }
  }
  if(catalog.categoryIcons)catalog.categoryIcons = Object.fromEntries(categoryItems.map(item => [item.name,item.logo]));
  const snapshot = {catalog,lastSync:Math.floor(Date.now()/1000)};
  localStorage.setItem(cacheKey,JSON.stringify(snapshot));
  return snapshot;
}
