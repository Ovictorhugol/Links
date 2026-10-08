import bundled from './catalog.initial.json';
import { validateLinkAddress } from '../server/public/link-address.mjs';

export type Category = string;
export type LinkItem = { id: string; name: string; description: string; url: string; category: Category; logo: string };
export type Catalog = { version: number; displayVersion?: number; links: LinkItem[]; categoryIcons?: Record<string,string> };
export const initialCatalog: Catalog = bundled;
export const initialLinks: LinkItem[] = bundled.links.map(item => ({...item}));
export function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
export function readLinks(catalog: Catalog = initialCatalog): LinkItem[] {
  return catalog.links.map(item => ({...item}));
}
export function validateCatalog(value: unknown): Catalog {
  const catalog = value as Catalog;
  if (!catalog || !Number.isSafeInteger(catalog.version) || catalog.version < 1 || !Array.isArray(catalog.links) || catalog.links.length < 1 || catalog.links.length > 500) throw new Error('Catálogo inválido.');
  if(catalog.displayVersion !== undefined && (!Number.isSafeInteger(catalog.displayVersion) || catalog.displayVersion < 0 || catalog.displayVersion > catalog.version))throw new Error('Contador de publicações inválido.');
  const ids = new Set<string>();
  for(const item of catalog.links) {
    if(!item || typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(item.id) || ids.has(item.id)) throw new Error('Identificador de link inválido ou repetido.');
    ids.add(item.id);
    for(const field of ['name','description','category','url','logo'] as const) if(typeof item[field] !== 'string' || item[field].length > (field === 'logo' ? 1500000 : 4096)) throw new Error('Campo de link inválido.');
    if(!item.name.trim() || !item.category.trim() || item.category === 'Todos') throw new Error('Nome e categoria são obrigatórios; Todos é uma categoria reservada.');
    const url = new URL(item.url);
    if(!['https:','http:','file:'].includes(url.protocol)) throw new Error('Endereço de link inválido.');
    validateLinkAddress(item.url);
    const localLogo = item.logo === '/donato-eye.svg' || initialCatalog.links.some(link => link.logo === item.logo);
    if(!localLogo && !/^https:\/\//.test(item.logo) && !/^data:image\/(?:png|jpeg|webp|x-icon);base64,[A-Za-z0-9+/=]+$/.test(item.logo)) throw new Error('Ícone inválido.');
  }
  if(catalog.categoryIcons !== undefined) {
    if(!catalog.categoryIcons || typeof catalog.categoryIcons !== 'object' || Array.isArray(catalog.categoryIcons) || Object.keys(catalog.categoryIcons).length > 501)throw new Error('Invalid category icons.');
    for(const [name,logo] of Object.entries(catalog.categoryIcons)) {
      if(!name.trim() || name.length > 4096 || ['__proto__','constructor','prototype'].includes(name))throw new Error('Invalid category name.');
      validateCatalog({version:1,links:[{...initialLinks[0],logo}]});
    }
  }
  return catalog;
}
