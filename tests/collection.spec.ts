import { test, expect } from '@playwright/test';

const expectedLinks = [
  ['EAGLESOFT','https://eaglesoft.com.br/login'],
  ['ONEDRIVE','https://institutodonato1-my.sharepoint.com/'],
  ['NOTIFICAÇÃO','https://docs.google.com/forms/d/1R-rHU_fResEN2FWSOqrXim0e1f6p4c1nh6-obrCUjEE/viewform?edit_requested=true'],
  ['MODULOS','https://modulos.conectew.com.br/'],
  ['WORD','https://office.live.com/start/Word.aspx?omkt=pt-BR'],
  ['WARELINE WEB','https://dho.local.conectew.com.br/'],
  ['TEAMS','https://www.microsoft.com/pt-br/microsoft-teams/log-in'],
  ['EXCEL','https://office.live.com/start/Excel.aspx?ui=pt-BR'],
  ['SUPORTE TI','http://suporte.donatoholhos.com.br'],
  ['POWER POINT','https://office.live.com/start/PowerPoint.aspx?omkt=pt-BR'],
  ['OUTLOOK','https://outlook.office365.com/mail/inbox'],
];

test('catálogo novo substitui dados antigos, preserva URLs e carrega logos locais',async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('centraldesk.links',JSON.stringify([{id:'gmail',name:'Gmail',url:'https://mail.google.com',category:'Trabalho',description:'Antigo',favorite:true,kind:'link',brand:'gmail'}]));
    (window as any).openedUrls = [];
    window.open = ((url: string) => { (window as any).openedUrls.push(url);return null; }) as typeof window.open;
  });
  await page.goto('/');
  await expect(page.locator('.link-card')).toHaveCount(11);
  await expect(page.locator('.link-card h3')).toHaveText(expectedLinks.map(([name]) => name).sort((a,b) => a.localeCompare(b,'pt-BR')));
  await expect(page.locator('.category-pills button')).toHaveText(['Todos']);
  await expect(page.getByRole('navigation')).toHaveCount(1);
  await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(3);
  await expect(page.getByRole('navigation')).toContainText('Trabalho');
  await expect(page.getByRole('button',{name:/Adicionar link|Um novo atalho|Editar atalho/})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/favoritos/i})).toHaveCount(0);
  await expect(page.getByText('Arraste os cards para deixar tudo do seu jeito.')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('centraldesk.links'))).toBeNull();
  await expect(page.locator('.brand img')).toHaveCount(11);
  await expect.poll(() => page.locator('.brand img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  for(const [name] of expectedLinks)await page.getByRole('button',{name:`Abrir ${name}`,exact:true}).click();
  expect(await page.evaluate(() => (window as any).openedUrls)).toEqual(expectedLinks.map(([,url]) => url));
});

test('pesquisa sem acentos, Todos e visualização em lista',async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('textbox',{name:'Pesquisar atalhos'})).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('textbox',{name:'Pesquisar atalhos'})).toBeFocused();
  await page.getByRole('textbox',{name:'Pesquisar atalhos'}).fill('notificacao');
  await expect(page.locator('.link-card')).toHaveCount(1);
  await expect(page.locator('.link-card')).toContainText('NOTIFICAÇÃO');
  await page.getByRole('button',{name:'Limpar pesquisa'}).click();
  await page.getByRole('button',{name:'Visualização em lista'}).click();
  await expect(page.locator('.links-list')).toBeVisible();
  await page.locator('.category-pills').getByRole('button',{name:'Todos',exact:true}).click();
  await expect(page.locator('.link-card')).toHaveCount(11);
  await page.reload();
  await page.getByRole('textbox',{name:'Pesquisar atalhos'}).fill('inexistente');
  await expect(page.getByText('Nenhum atalho por aqui')).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:/Trabalho/}).click();
  await expect(page.locator('.link-card')).toHaveCount(5);
});

test('ordem alfabética padrão ignora preferências antigas e remove ordem personalizada',async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('centraldesk.work.preferences',JSON.stringify([{id:'onedrive'},{id:'eaglesoft',url:'https://incorrect.example',name:'Alterado'},null]));
  });
  await page.goto('/');
  const names = expectedLinks.map(([name]) => name).sort((a,b) => a.localeCompare(b,'pt-BR'));
  await expect(page.locator('.link-card h3')).toHaveText(names);
  await expect(page.getByLabel('Ordenar atalhos')).toHaveValue('az');
  await expect(page.getByLabel('Ordenar atalhos').locator('option')).toHaveText(['Nome: A–Z','Nome: Z–A']);
  await expect(page.locator('.link-card[draggable="true"]')).toHaveCount(0);
  await page.getByLabel('Ordenar atalhos').selectOption('za');
  await expect(page.locator('.link-card h3')).toHaveText([...names].reverse());
  await page.getByRole('button',{name:'Visualização em lista'}).click();
  await expect(page.locator('.links-list h3')).toHaveText([...names].reverse());
  await page.reload();
  await expect(page.locator('.link-card h3')).toHaveText(names);
  expect(await page.evaluate(() => localStorage.getItem('centraldesk.work.preferences'))).toBeNull();
});

test('layout responsivo e prévia sem erros',async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror',error => errors.push(error.message));
  await page.goto('/');
  await page.screenshot({path:'artifacts/centraldesk-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('textbox',{name:'Pesquisar atalhos'})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/centraldesk-mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('card inteiro abre uma vez e funciona por teclado e em lista',async ({page}) => {
  await page.addInitScript(() => {
    (window as any).openedUrls = [];
    window.open = ((url: string) => { (window as any).openedUrls.push(url);return null; }) as typeof window.open;
  });
  await page.goto('/');
  const card = page.locator('.link-card').first();
  await card.click({position:{x:5,y:5}});
  expect(await page.evaluate(() => (window as any).openedUrls)).toEqual(['https://eaglesoft.com.br/login']);
  await page.getByRole('link',{name:'Acessar EAGLESOFT',exact:true}).focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as any).openedUrls)).toHaveLength(2);
  await page.getByRole('button',{name:'Visualização em lista'}).click();
  await card.click({position:{x:5,y:5}});
  expect(await page.evaluate(() => (window as any).openedUrls)).toHaveLength(3);
});

test('Ferramentas Microsoft agrupa seis links e funciona no menu compacto',async ({page}) => {
  await page.goto('/');
  const microsoft = page.getByRole('navigation',{name:'Categorias'}).getByRole('button',{name:/Ferramentas Microsoft/});
  await microsoft.click();
  await expect(page.locator('.link-card h3')).toHaveText(['EXCEL','ONEDRIVE','OUTLOOK','POWER POINT','TEAMS','WORD']);
  await expect(page.locator('.link-card .tag')).toHaveText(Array(6).fill('Ferramentas Microsoft'));
  await expect(microsoft).toHaveAttribute('aria-pressed','true');
  await page.getByRole('textbox',{name:'Pesquisar atalhos'}).fill('excel');
  await expect(page.locator('.link-card')).toHaveCount(1);
  await page.getByRole('button',{name:'Recolher menu lateral'}).click();
  await expect(microsoft).toBeVisible();
  await microsoft.click();
  await expect(page.locator('.link-card')).toHaveCount(11);
  await expect(microsoft).toHaveAttribute('aria-pressed','false');
  await microsoft.click();
  await expect(page.locator('.link-card')).toHaveCount(6);
  const label = microsoft.locator('.nav-text');
  const textFits = await label.evaluate(element => {
    const style = getComputedStyle(element);
    return element.scrollWidth <= element.clientWidth && element.getBoundingClientRect().height <= parseFloat(style.lineHeight) * 2 + 1;
  });
  expect(textFits).toBe(true);
  const allCategories = page.getByRole('navigation',{name:'Categorias'}).getByRole('button');
  await expect(allCategories.last()).toHaveText('Todos11');
  await allCategories.last().click();
  await expect(page.locator('.link-card')).toHaveCount(11);
  await expect(microsoft).toHaveAttribute('aria-pressed','false');
});

test('segundo clique desmarca a seleção e exibe todos os links',async ({page}) => {
  await page.goto('/');
  const nav = page.getByRole('navigation',{name:'Categorias'});
  const work = nav.getByRole('button',{name:/Trabalho/});
  await work.click();
  await expect(work).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.link-card')).toHaveCount(5);
  await work.click();
  await expect(work).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('.nav-item.active')).toHaveCount(0);
  await expect(page.locator('.link-card')).toHaveCount(11);
  const all = nav.getByRole('button',{name:/Todos/});
  await all.click();
  await expect(all).toHaveAttribute('aria-pressed','true');
  await all.click();
  await expect(all).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('.link-card')).toHaveCount(11);
  const quickAll = page.locator('.category-pills').getByRole('button',{name:'Todos',exact:true});
  await quickAll.click();
  await expect(quickAll).toHaveAttribute('aria-pressed','true');
  await quickAll.click();
  await expect(quickAll).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('.link-card')).toHaveCount(11);
});
