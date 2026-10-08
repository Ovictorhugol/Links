import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const initial = JSON.parse(readFileSync(new URL('../public/catalog/links.json',import.meta.url),'utf8'));

const newLink = {id:'novo-sistema',name:'NOVO SISTEMA',description:'Novo link central.',url:'https://example.com/novo',category:'Novos sistemas',logo:'/donato-eye.svg'};
const updated = {version:2,links:[...initial.links,newLink]};
test('rodapé acompanha o contador do painel, aceita v0 e mantém a proteção contra catálogo anterior',async ({page}) => {
  await configure(page);await page.clock.install();
  await page.addInitScript(catalog => {if(!localStorage.getItem('centraldesk.catalog.v1'))localStorage.setItem('centraldesk.catalog.v1',JSON.stringify({catalog,lastSync:1}));},{...initial,version:31});
  let catalog = {...updated,version:32,displayVersion:0};
  await page.route('**/test-catalog.json',route => route.fulfill({json:catalog}));
  await page.goto('/');
  await expect(page.locator('.catalog-status')).toContainText('catálogo v0');
  catalog = {...catalog,version:33,displayVersion:1};
  await page.clock.fastForward(60 * 60 * 1000);
  await expect(page.locator('.catalog-status')).toContainText('catálogo v1');
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('centraldesk.catalog.v1')!).catalog);
  expect(cached.version).toBe(33);expect(cached.displayVersion).toBe(1);
  catalog = {...catalog,version:32,displayVersion:2};
  await page.clock.fastForward(60 * 60 * 1000);
  await expect(page.getByRole('status')).toContainText('links locais mantidos');
  await expect(page.locator('.catalog-status')).toContainText('catálogo v1');
  await page.route('**/test-catalog.json',route => route.abort());
  await page.reload();
  await expect(page.locator('.catalog-status')).toContainText('catálogo v1');
});
test('ícone remoto de categoria é armazenado offline e preservado se a imagem ficar indisponível',async ({page}) => {
  await configure(page);
  let remote = true;
  const catalog = {...updated,categoryIcons:{Todos:'https://icons.example/menu.png'}};
  await page.route('https://icons.example/menu.png',route => remote ? route.fulfill({contentType:'image/png',body:readFileSync(new URL('../public/logos/word.png',import.meta.url))}) : route.abort());
  await page.route('**/test-catalog.json',route => route.fulfill({json:catalog}));
  await page.goto('/');
  const icon = page.getByRole('navigation').getByRole('button',{name:/Todos/}).locator('img.category-icon');
  await expect(icon).toHaveAttribute('src',/^data:image\/png;base64,/);
  remote = false;
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Links atualizados');
  await expect(icon).toHaveAttribute('src',/^data:image\/png;base64,/);
  await page.route('**/test-catalog.json',route => route.abort());
  await page.reload();
  await expect(page.getByRole('status')).toContainText('links locais mantidos');
  await expect(icon).toHaveAttribute('src',/^data:image\/png;base64,/);
});
test('arquivo compartilhado permanece no catálogo offline e informa abertura pelo aplicativo Windows',async ({page}) => {
  await configure(page);
  let online = true;
  const file = {...newLink,url:'file://servidor/GERAL/%C3%81rea%20da%20equipe/Lista.xlsx'};
  await page.route('**/test-catalog.json',route => online ? route.fulfill({json:{version:2,links:[...initial.links,file]}}) : route.abort());
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Links atualizados');
  await page.getByRole('button',{name:'Abrir NOVO SISTEMA',exact:true}).click();
  await expect(page.getByText('Para abrir arquivos e pastas compartilhadas, use o aplicativo instalado no Windows.')).toBeVisible();
  online = false;await page.reload();
  await expect(page.getByRole('status')).toContainText('links locais mantidos');
  await expect(page.getByRole('link',{name:'Acessar NOVO SISTEMA',exact:true})).toHaveAttribute('href',file.url);
});
async function configure(page: Page) {
  await page.route('**/client-config.json',route => route.fulfill({json:{catalogUrl:'/test-catalog.json',pollIntervalMinutes:60}}));
}

test('recebe novo catálogo, mantém a ordem alfabética e permanece disponível após reabrir offline',async ({page}) => {
  await configure(page);
  let online = true;
  let catalog = initial;
  await page.route('**/test-catalog.json',route => online ? route.fulfill({json:catalog}) : route.abort());
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Links atualizados');
  catalog = updated;
  await page.clock.fastForward(59 * 60 * 1000);
  await expect(page.locator('.link-card')).toHaveCount(11);
  await page.clock.fastForward(60 * 1000);
  await expect(page.locator('.link-card')).toHaveCount(12);
  await expect(page.getByRole('heading',{name:'NOVO SISTEMA'})).toBeVisible();
  await expect(page.locator('.link-card h3')).toHaveText(updated.links.map((item: {name:string}) => item.name).sort((a: string,b: string) => a.localeCompare(b,'pt-BR')));
  await expect(page.getByRole('navigation')).toContainText('Novos sistemas');
  await expect(page.getByRole('button',{name:'Atualizar agora'})).toHaveCount(0);
  online = false;
  await page.reload();
  await expect(page.getByRole('status')).toContainText('links locais mantidos');
  await expect(page.locator('.link-card')).toHaveCount(12);
  await expect(page.locator('.link-card h3')).toHaveText(updated.links.map((item: {name:string}) => item.name).sort((a: string,b: string) => a.localeCompare(b,'pt-BR')));
  await expect(page.locator('.brand img')).toHaveCount(12);
});

test('primeira abertura sem servidor usa os links e ícones embutidos',async ({page}) => {
  await configure(page);
  await page.route('**/test-catalog.json',route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('links locais mantidos');
  await expect(page.locator('.link-card')).toHaveCount(11);
  await expect.poll(() => page.locator('.brand img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
});

for(const [name,invalid] of [
  ['JSON inválido','{"version":'],
  ['lista vazia',JSON.stringify({version:3,links:[]})],
  ['IDs repetidos',JSON.stringify({version:3,links:[newLink,newLink]})],
  ['URL inválida',JSON.stringify({version:3,links:[{...newLink,url:'javascript:alert(1)'}]})],
  ['versão anterior',JSON.stringify(initial)],
] as const) {
  test(`mantém cache quando o servidor retorna ${name}`,async ({page}) => {
    await page.addInitScript(snapshot => localStorage.setItem('centraldesk.catalog.v1',JSON.stringify(snapshot)),{catalog:updated,lastSync:12345});
    await configure(page);
    await page.route('**/test-catalog.json',route => route.fulfill({contentType:'application/json',body:invalid}));
    await page.goto('/');
    await expect(page.getByRole('status')).toContainText('links locais mantidos');
    await expect(page.locator('.link-card')).toHaveCount(12);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('centraldesk.catalog.v1')!).catalog.version)).toBe(2);
  });
}

test('falha ao salvar atualização mantém os links anteriores na tela',async ({page}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) {
      if(key === 'centraldesk.catalog.v1')throw new DOMException('Quota exceeded','QuotaExceededError');
      return original.call(this,key,value);
    };
  });
  await configure(page);
  await page.route('**/test-catalog.json',route => route.fulfill({json:updated}));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('links locais mantidos');
  await expect(page.locator('.link-card')).toHaveCount(11);
});

test('remoções centrais são aplicadas e categoria removida volta para Todos',async ({page}) => {
  await page.clock.install();
  await configure(page);
  let catalog = updated;
  await page.route('**/test-catalog.json',route => route.fulfill({json:catalog}));
  await page.goto('/');
  await expect(page.locator('.link-card')).toHaveCount(12);
  await page.getByRole('navigation').getByRole('button',{name:/Novos sistemas/}).click();
  await expect(page.locator('.link-card')).toHaveCount(1);
  catalog = {version:3,links:initial.links};
  await page.clock.fastForward(60 * 60 * 1000);
  await expect(page.locator('.link-card')).toHaveCount(11);
  await expect(page.getByRole('navigation')).not.toContainText('Novos sistemas');
});

test('cache danificado usa catálogo inicial e informa ausência de configuração',async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('centraldesk.catalog.v1','{'));
  await page.goto('/');
  await expect(page.locator('.link-card')).toHaveCount(11);
  await expect(page.getByRole('status')).toContainText('atualização não configurada');
});

test('ícone remoto é armazenado e continua disponível após reabertura sem servidor',async ({page}) => {
  await configure(page);
  const catalog = {version:2,links:[...initial.links,{...newLink,logo:'https://icons.example/novo.png'}]};
  await page.route('https://icons.example/novo.png',route => route.fulfill({contentType:'image/png',body:readFileSync(new URL('../public/logos/word.png',import.meta.url))}));
  await page.route('**/test-catalog.json',route => route.fulfill({json:catalog}));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Links atualizados');
  const image = page.locator('.brand-novo-sistema img');
  await expect(image).toHaveAttribute('src',/^data:image\/png;base64,/);
  await page.route('**/test-catalog.json',route => route.abort());
  await page.route('https://icons.example/novo.png',route => route.abort());
  await page.reload();
  await expect(page.getByRole('status')).toContainText('links locais mantidos');
  await expect(image).toHaveAttribute('src',/^data:image\/png;base64,/);
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});
