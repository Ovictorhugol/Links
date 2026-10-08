import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

// Execute the same validation as the frontend, without maintaining a second schema.
const source = await readFile(new URL('../src/data.ts',import.meta.url),'utf8');
const bundled = JSON.parse(await readFile(new URL('../src/catalog.initial.json',import.meta.url),'utf8'));
const javascript = ts.transpile(source.replace("import bundled from './catalog.initial.json';",`const bundled = ${JSON.stringify(bundled)};`).replace("'../server/public/link-address.mjs'",JSON.stringify(new URL('../server/public/link-address.mjs',import.meta.url).href)),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
const { validateCatalog } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
try {
  const catalog = validateCatalog(JSON.parse(await readFile(resolve(process.argv[2] || 'public/catalog/links.json'),'utf8')));
  for(const link of catalog.links) {
    if(link.logo.startsWith('https://')) {
      const url = new URL(link.logo);
      if(url.username || url.password) throw new Error('Credenciais na URL do ícone.');
    }
    if(link.logo.startsWith('data:') && Buffer.from(link.logo.split(',')[1],'base64').length > 512 * 1024) throw new Error('Ícone excede 512 KB.');
  }
  if(Buffer.byteLength(JSON.stringify(catalog)) > 8 * 1024 * 1024) throw new Error('Catálogo excede 8 MB.');
  console.log(`Catálogo válido: versão ${catalog.version}, ${catalog.links.length} links.`);
} catch(error) {
  console.error(`Falha na validação: ${error.message}`);
  process.exitCode = 1;
}
