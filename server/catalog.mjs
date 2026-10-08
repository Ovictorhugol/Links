import { readFileSync } from 'node:fs';
import { validateLinkAddress } from './public/link-address.mjs';

export const initialCatalog = JSON.parse(readFileSync(new URL('../src/catalog.initial.json',import.meta.url),'utf8'));
export const MAX_BODY = 8 * 1024 * 1024;
const localIcons = new Set(['/donato-eye.svg',...initialCatalog.links.map(item => item.logo)]);
export class HttpError extends Error {
  constructor(status,message) { super(message);this.status = status; }
}
export function validateLinks(value) {
  if(!Array.isArray(value) || !value.length || value.length > 500) throw new HttpError(400,'O catálogo precisa ter entre 1 e 500 links.');
  const ids = new Set();
  const links = value.map(item => {
    if(!item || typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(item.id) || ids.has(item.id)) throw new HttpError(400,'Identificador inválido ou repetido.');
    ids.add(item.id);
    for(const key of ['name','description','url','category','logo']) {
      if(typeof item[key] !== 'string' || Buffer.byteLength(item[key]) > (key === 'logo' ? 750000 : 4096)) throw new HttpError(400,'Campo inválido ou muito grande.');
    }
    if(!item.name.trim() || !item.category.trim() || item.category.trim() === 'Todos') throw new HttpError(400,'Informe nome e categoria. Todos é reservado.');
    let address;
    try { address = validateLinkAddress(item.url); } catch(error) { throw new HttpError(400,error.message || 'Endereço de link inválido.'); }
    if(!localIcons.has(item.logo)) {
      if(item.logo.startsWith('https://')) {
        let icon;
        try { icon = new URL(item.logo); } catch { throw new HttpError(400,'Endereço do ícone inválido.'); }
        if(!icon.hostname || icon.username || icon.password) throw new HttpError(400,'Endereço do ícone inválido.');
      } else {
        const match = /^data:image\/(png|jpeg|webp|x-icon);base64,([A-Za-z0-9+/]+={0,2})$/.exec(item.logo);
        if(!match || Buffer.from(match[2],'base64').length > 512 * 1024) throw new HttpError(400,'Use um ícone embutido, imagem HTTPS ou imagem enviada de até 512 KB.');
      }
    }
    return {id:item.id,name:item.name.trim(),description:item.description.trim(),url:address,category:item.category.trim(),logo:item.logo};
  });
  if(Buffer.byteLength(JSON.stringify({version:Number.MAX_SAFE_INTEGER,links})) > MAX_BODY) throw new HttpError(400,'Catálogo excede 8 MB. Reduza o tamanho dos ícones.');
  return links.sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
}

export function validateCategoryIcons(value = {}) {
  if(!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 501)throw new HttpError(400,'Ícones de categorias inválidos.');
  const result = Object.create(null);
  for(const [category,logo] of Object.entries(value)) {
    if(!category.trim() || category.length > 4096 || ['__proto__','constructor','prototype'].includes(category))throw new HttpError(400,'Nome de categoria inválido.');
    validateLinks([{...initialCatalog.links[0],logo}]);
    result[category] = logo;
  }
  if(Buffer.byteLength(JSON.stringify(result)) > MAX_BODY / 2)throw new HttpError(400,'Ícones de categorias excedem 4 MB.');
  return result;
}
