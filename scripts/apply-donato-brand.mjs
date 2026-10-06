import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
const colors = {
  '#7460d6':'#0878b9','#6451c4':'#06649c','#a392e8':'#67abd4',
  '#eeebfa':'#e8f3fb','#e2dbf8':'#d4eaf7','#e3ddf7':'#cde5f4',
  '#ede9fa':'#e5f2fa','#f1edfa':'#edf6fc','#f0edfa':'#eaf4fb',
  '#f1eff8':'#edf6fc','#f7f5fc':'#f2f8fc','#f6f4fa':'#f2f8fc',
  '#cfc6ef':'#b7d9ec','#55408a08':'#0878b908','#f1edfc':'#edf6fc',
  '#f1edfb':'#edf6fc','#9c86c3':'#4589b0','#e7dff4':'#d2e7f4',
  '#33214518':'#08466b18','#77618e':'#397b9f','#f0edf8':'#edf6fc',
  '#ece8fa':'#e4f1f9','#8671ce':'#0878b9','#b7a7dc':'#8dbdd9',
  '#f0edf9':'#edf6fc','#29203d50':'#14384c50',
};
for (const path of ['src/styles.css','src/brands.css']) {
  let css = await readFile(path,'utf8');
  css = css.replace(/--purple/g,'--accent');
  for(const [oldColor,newColor] of Object.entries(colors)) css = css.replaceAll(oldColor,newColor);
  await writeFile(path,css);
}
await mkdir('public',{recursive:true});
await copyFile('artifacts/donato-eye.svg','public/donato-eye.svg');
const logo = await readFile('artifacts/donato-eye.svg','utf8');
const paths = logo.slice(logo.indexOf('>')+1,logo.lastIndexOf('</svg>'));
await writeFile('app-icon.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 120 120"><g transform="translate(0 20)">${paths}</g></svg>\n`);
console.log('Paleta azul Donato aplicada; SVG original copiado e centralizado para o ícone.');
