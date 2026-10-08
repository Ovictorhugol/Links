import { validateLinkAddress } from './link-address.mjs';
const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let session = null;
let draft = null;
let history = [];
let dirty = false;
let busy = false;
let editing = null;
let uploadedIcon = '';
const embeddedIcons = [
  ['Donato','/donato-eye.svg'],['Eaglesoft','/logos/eaglesoft.png'],['OneDrive','/logos/onedrive.png'],['Notificação','/logos/notificacao.png'],['Módulos','/logos/modulos.png'],['Word','/logos/word.png'],['Wareline','/logos/wareline.png'],['Teams','/logos/teams.png'],['Excel','/logos/excel.png'],['Suporte','/logos/suporte.png'],['PowerPoint','/logos/powerpoint.png'],['Outlook','/logos/outlook.png'],
];
$('#icon-choice').innerHTML = embeddedIcons.map(([name,url]) => `<option value="${url}">${name}</option>`).join('') + '<option value="custom">Endereço HTTPS de uma imagem</option><option value="upload">Enviar imagem do computador</option>';
const menuIconButton = document.createElement('button');
menuIconButton.id = 'edit-menu-icons';menuIconButton.className = 'secondary';menuIconButton.textContent = 'Ícones do menu lateral';
$('#rename-category').after(menuIconButton);
$('#menu-icon-choice').innerHTML = '<option value="">Padrão</option>' + $('#icon-choice').innerHTML;
let menuUploadedIcon = '';

function notice(message,error = false) { $('#notice').textContent = message;$('#notice').className = error ? 'error' : '';$('#notice').hidden = false; }
async function api(path,method = 'GET',value) {
  const response = await fetch(`/api/admin/${path}`,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',...(session ? {'X-CSRF-Token':session.csrf} : {})},body:value === undefined ? undefined : JSON.stringify(value)});
  const data = await response.json();
  if(!response.ok) {
    if(response.status === 401 && path !== 'login')showLogin();
    throw new Error(data.error || 'Não foi possível concluir a operação.');
  }
  return data;
}
function showLogin() {
  session = null;$('#panel-view').hidden = true;$('#login-view').hidden = false;
  if($('#edit-dialog').open)$('#edit-dialog').close();
  if($('#rename-dialog').open)$('#rename-dialog').close();
  if($('#category-icon-dialog').open)$('#category-icon-dialog').close();
}
async function reload() {
  [draft,history] = await Promise.all([api('draft'),api('history')]);
  dirty = false;render();renderHistory();
}
function categories() { return [...new Set(draft.links.map(link => link.category))].sort((a,b) => a.localeCompare(b,'pt-BR')); }
function render() {
  $('#link-count').textContent = draft.links.length;
  $('#category-count').textContent = categories().length;
  $('#published-version').textContent = `v${draft.displayVersion ?? draft.publishedVersion}`;
  $('#draft-status').textContent = dirty ? 'Há alterações que ainda não foram salvas' : draft.unpublished ? 'Rascunho salvo · pronto para publicar' : 'Catálogo publicado · nenhuma alteração pendente';
  $('#draft-help').textContent = dirty ? 'Salve o rascunho para continuar depois, ou publique para enviar às máquinas.' : draft.unpublished ? 'Os aplicativos só recebem as mudanças após a publicação.' : 'Os aplicativos consultam esta versão ao abrir e a cada hora.';
  $('#save-draft').disabled = busy || !dirty;
  $('#publish').disabled = busy || (!dirty && !draft.unpublished);
  for(const id of ['reload','add-link','rename-category','edit-menu-icons','logout'])$(`#${id}`).disabled = busy;
  const selected = $('#category-filter').value;
  $('#category-filter').innerHTML = '<option value="">Todas as categorias</option>' + categories().map(name => `<option value="${escape(name)}">${escape(name)}</option>`).join('');
  $('#category-filter').value = categories().includes(selected) ? selected : '';
  $('#categories').innerHTML = categories().map(name => `<option value="${escape(name)}"></option>`).join('');
  renderTable();
}
function renderTable() {
  const query = $('#search').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const category = $('#category-filter').value;
  const links = draft.links.filter(link => (!category || link.category === category) && `${link.name} ${link.description} ${link.url} ${link.category}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query)).sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
  $('#links-table').innerHTML = links.map(link => {
    return `<tr><td><div class="link-title"><img src="${escape(link.logo)}" alt="" referrerpolicy="no-referrer"><div><strong>${escape(link.name)}</strong><small>${escape(link.description)}</small></div></div></td><td><span class="category-tag">${escape(link.category)}</span></td><td><span class="url-text" title="${escape(link.url)}">${escape(link.url)}</span></td><td><div class="row-actions"><button data-action="edit" data-id="${link.id}" aria-label="Editar ${escape(link.name)}" ${busy ? 'disabled' : ''}>Editar</button><button class="delete" data-action="delete" data-id="${link.id}" aria-label="Excluir ${escape(link.name)}" ${busy ? 'disabled' : ''}>Excluir</button></div></td></tr>`;
  }).join('');
  $('#empty').hidden = links.length > 0;
  for(const img of $('#links-table').querySelectorAll('img'))img.addEventListener('error',() => {img.src = '/donato-eye.svg';},{once:true});
}
function markDirty() { dirty = true;render(); }
async function action(work) {
  if(busy)return;
  busy = true;if(draft)render();
  try { await work(); }
  catch(error) { notice(error.message,true); }
  finally { busy = false;if(draft)render(); }
}
async function save() { draft = await api('draft','PUT',{links:draft.links,revision:draft.revision,categoryIcons:draft.categoryIcons || {}});dirty = false; }
$('#login-form').addEventListener('submit',async event => {
  event.preventDefault();
  const button = $('#login-form button');button.disabled = true;$('#login-error').textContent = '';
  try {
    const form = new FormData(event.currentTarget);
    session = await api('login','POST',{username:form.get('username'),password:form.get('password')});
    $('#login-form').reset();
    await reload();
    $('#account-name').textContent = session.username;$('#login-view').hidden = true;$('#panel-view').hidden = false;
  } catch(error) { $('#login-error').textContent = error.message; }
  finally { button.disabled = false; }
});
$('#logout').addEventListener('click',() => {
  if(dirty && !confirm('Há alterações não salvas. Deseja sair e descartá-las?'))return;
  void action(async () => {await api('logout','POST',{});draft = null;dirty = false;showLogin();});
});
$('#save-draft').addEventListener('click',() => void action(async () => {await save();notice('Rascunho salvo. As máquinas continuam com a versão publicada.');}));
$('#publish').addEventListener('click',() => {
  if(!confirm('Publicar as alterações para todos os aplicativos instalados?'))return;
  void action(async () => {
    if(dirty)await save();
    draft = await api('publish','POST',{revision:draft.revision,publishedVersion:draft.publishedVersion});
    history = await api('history');renderHistory();
    notice(`Versão ${draft.displayVersion ?? draft.publishedVersion} publicada. As máquinas receberão os links na próxima abertura ou consulta horária.`);
  });
});
$('#reload').addEventListener('click',() => {
  if(dirty && !confirm('Recarregar e descartar as alterações que não foram salvas?'))return;
  void action(async () => {await reload();notice('Catálogo recarregado.');});
});
$('#search').addEventListener('input',renderTable);
$('#category-filter').addEventListener('change',renderTable);
$('#links-table').addEventListener('click',event => {
  const button = event.target.closest('button[data-action]');
  if(!button || busy)return;
  const index = draft.links.findIndex(item => item.id === button.dataset.id);
  const link = draft.links[index];
  switch(button.dataset.action) {
    case 'edit':openEditor(link);break;
    case 'delete':
      if(draft.links.length === 1)return notice('Mantenha pelo menos um link no catálogo.',true);
      if(confirm(`Remover ${link.name} do rascunho? A remoção será enviada às máquinas quando você publicar.`)) {draft.links.splice(index,1);markDirty();}break;
  }
});
function currentIcon() {
  const choice = $('#icon-choice').value;
  return choice === 'custom' ? $('#icon-url').value.trim() : choice === 'upload' ? uploadedIcon : choice;
}
function updateIcon() {
  $('#icon-url-label').hidden = $('#icon-choice').value !== 'custom';
  $('#icon-file-label').hidden = $('#icon-choice').value !== 'upload';
  const icon = currentIcon();
  $('#icon-preview').src = icon.startsWith('https://') || icon.startsWith('data:image/') || embeddedIcons.some(([,path]) => path === icon) ? icon : '/donato-eye.svg';
}
$('#icon-preview').addEventListener('error',() => {$('#icon-preview').src = '/donato-eye.svg';});
function openEditor(link) {
  editing = link?.id || null;uploadedIcon = '';
  const form = $('#edit-form');form.reset();$('#edit-error').textContent = '';$('#icon-url').value = '';
  for(const key of ['id','name','url','description','category'])form.elements[key].value = link?.[key] || '';
  form.elements.id.readOnly = !!link;
  $('#edit-title').textContent = link ? 'Editar link' : 'Novo link';
  const logo = link?.logo || '/donato-eye.svg';
  if(logo.startsWith('https://')) {$('#icon-choice').value = 'custom';$('#icon-url').value = logo;}
  else if(logo.startsWith('data:')) {$('#icon-choice').value = 'upload';uploadedIcon = logo;}
  else $('#icon-choice').value = logo;
  updateIcon();$('#edit-dialog').showModal();form.elements.name.focus();
}
$('#add-link').addEventListener('click',() => openEditor());
for(const button of document.querySelectorAll('.close-dialog'))button.addEventListener('click',() => $('#edit-dialog').close());
$('#edit-form').elements.name.addEventListener('input',event => {
  if(!editing)$('#edit-form').elements.id.value = event.target.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64);
});
$('#icon-choice').addEventListener('change',updateIcon);$('#icon-url').addEventListener('input',updateIcon);
$('#icon-file').addEventListener('change',async event => {
  const file = event.target.files[0];if(!file)return;
  try {
    const mime = file.type === 'image/vnd.microsoft.icon' || (!file.type && /\.ico$/i.test(file.name)) ? 'image/x-icon' : file.type;
    if(file.size > 512 * 1024 || !['image/png','image/jpeg','image/webp','image/x-icon'].includes(mime))throw new Error('Use PNG, JPEG, WebP ou ICO de até 512 KB.');
    uploadedIcon = await new Promise((resolve,reject) => {const reader = new FileReader();reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;/,`data:${mime};`));reader.onerror = reject;reader.readAsDataURL(file);});
    $('#edit-error').textContent = '';updateIcon();
  } catch(error) {uploadedIcon = '';$('#edit-error').textContent = error.message;updateIcon();}
});
$('#edit-form').addEventListener('submit',event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const link = Object.fromEntries(['id','name','description','url','category'].map(key => [key,String(data.get(key)).trim()]));
  link.logo = currentIcon();
  try {
    if(draft.links.some(item => item.id === link.id && item.id !== editing))throw new Error('Esse identificador já existe. Escolha outro.');
    link.url = validateLinkAddress(link.url);
    event.currentTarget.elements.url.value = link.url;
    if(link.category === 'Todos')throw new Error('Todos é reservado para o filtro geral. Escolha outra categoria.');
    if($('#icon-choice').value === 'custom') {const icon = new URL(link.logo);if(icon.protocol !== 'https:' || icon.username || icon.password)throw new Error('O endereço do ícone deve usar HTTPS, sem credenciais.');}
    if(!link.logo)throw new Error('Selecione ou envie um ícone.');
    if(editing)draft.links[draft.links.findIndex(item => item.id === editing)] = link;
    else {if(draft.links.length >= 500)throw new Error('O catálogo aceita até 500 links.');draft.links.push(link);}
    $('#edit-dialog').close();markDirty();
  } catch(error) {$('#edit-error').textContent = error.message;}
});
$('#rename-category').addEventListener('click',() => {
  $('#old-category').innerHTML = categories().map(name => `<option value="${escape(name)}">${escape(name)}</option>`).join('');
  $('#new-category').value = '';$('#rename-error').textContent = '';$('#rename-dialog').showModal();
});
$('#cancel-rename').addEventListener('click',() => $('#rename-dialog').close());
$('#rename-form').addEventListener('submit',event => {
  event.preventDefault();const name = $('#new-category').value.trim();
  if(!name || name === 'Todos') {$('#rename-error').textContent = 'Informe um nome diferente de Todos.';return;}
  draft.links = draft.links.map(link => link.category === $('#old-category').value ? {...link,category:name} : link);
  const old = $('#old-category').value;
  if(old !== name && draft.categoryIcons?.[old]) {
    draft.categoryIcons[name] = draft.categoryIcons[old];delete draft.categoryIcons[old];
  }
  $('#rename-dialog').close();markDirty();
});
function showSection(name) {
  $('#catalog-section').hidden = name !== 'catalog';$('#history-section').hidden = name !== 'history';
  $('#show-catalog').classList.toggle('active',name === 'catalog');$('#show-history').classList.toggle('active',name === 'history');
}
$('#show-catalog').addEventListener('click',() => showSection('catalog'));
$('#show-history').addEventListener('click',() => showSection('history'));
function historyChanges(changes) {
  if(!changes || changes.baseline)return '<p class="history-note">Catálogo de referência. Não há publicação anterior disponível para comparação.</p>';
  const sections = [];
  const group = (title,items) => `<section class="change-group"><h3>${title}</h3><ul>${items.join('')}</ul></section>`;
  const link = item => `<li><strong>${escape(item.name)}</strong></li>`;
  if(changes.added.length)sections.push(group('Links adicionados',changes.added.map(link)));
  if(changes.removed.length)sections.push(group('Links removidos',changes.removed.map(link)));
  const labels = {name:'Nome',description:'Descrição',url:'Endereço',category:'Categoria',logo:'Ícone'};
  if(changes.updated.length)sections.push(group('Links editados',changes.updated.map(item => `<li><strong>${escape(item.name)}</strong><span class="change-link-meta">${item.fields.map(field => labels[field.field] || escape(field.field)).join(', ')}.</span></li>`)));
  const categories = (changes.categories || []).map(item => `<li><strong>${escape(item.before)} → ${escape(item.after)}</strong><span class="change-link-meta">Categoria renomeada${item.iconChanged ? ' e ícone alterado' : ''}.</span></li>`);
  categories.push(...changes.categoryIcons.map(item => `<li><strong>${escape(item.category)}</strong><span class="change-link-meta">${item.kind === 'removed' ? 'Ícone padrão restaurado.' : 'Ícone alterado.'}</span></li>`));
  if(categories.length)sections.push(group('Categorias alteradas',categories));
  if(changes.orderChanged)sections.push('<p class="history-note">Ordem dos atalhos alterada.</p>');
  return sections.join('') || '<p class="history-note">Nenhuma alteração no conteúdo do catálogo.</p>';
}
function renderHistory() {
  $('#history-list').innerHTML = history.map(release => {
    const current = release.version === draft.publishedVersion;
    return `<article class="history-row"><details class="history-details" ${current ? 'open' : ''}><summary><span><strong>Versão ${release.displayVersion ?? release.version}${current ? ' · publicada atualmente' : ''}</strong><span class="history-date">${escape(new Date(release.createdAt).toLocaleString('pt-BR'))} · ${escape(release.author)}</span></span><span class="history-chevron" aria-hidden="true">⌄</span></summary><div class="history-changes">${historyChanges(release.changes)}</div></details><button class="secondary" data-version="${release.version}">Restaurar como rascunho</button></article>`;
  }).join('');
}
$('#history-list').addEventListener('click',event => {
  const button = event.target.closest('button[data-version]');if(!button)return;
  if(!confirm('Substituir o rascunho por essa versão? A versão publicada permanece a mesma até você publicar novamente.'))return;
  void action(async () => {
    draft = await api('restore','POST',{version:Number(button.dataset.version),revision:draft.revision});dirty = false;showSection('catalog');notice('Versão restaurada como rascunho. Revise e publique para enviar às máquinas.');
  });
});
window.addEventListener('beforeunload',event => {if(dirty) {event.preventDefault();event.returnValue = '';}});
function currentMenuIcon() {
  const choice = $('#menu-icon-choice').value;
  return choice === 'custom' ? $('#menu-icon-url').value.trim() : choice === 'upload' ? menuUploadedIcon : choice;
}
async function normalizeMenuIcon(logo) {
  const svg = logo.startsWith('data:image/svg+xml') || (logo.startsWith('https://') && /\.svg$/i.test(new URL(logo).pathname));
  if(!svg)return logo;
  const image = new Image();
  image.crossOrigin = 'anonymous';
  await new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error('A imagem demorou para carregar. Envie o arquivo SVG pelo computador.')),15000);
    image.onload = () => {clearTimeout(timer);resolve();};
    image.onerror = () => {clearTimeout(timer);reject(new Error('Não foi possível converter o SVG desse endereço. Envie o arquivo SVG pelo computador.'));};
    image.src = logo;
  });
  const canvas = document.createElement('canvas');
  const scale = 256 / Math.max(image.naturalWidth,image.naturalHeight);
  canvas.width = Math.max(1,Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1,Math.round(image.naturalHeight * scale));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const png = canvas.toDataURL('image/png');
  if(png.length > 700000)throw new Error('A imagem convertida ficou muito grande. Use um SVG mais simples.');
  return png;
}
function previewMenuIcon() {
  const choice = $('#menu-icon-choice').value;
  $('#menu-icon-url-label').hidden = choice !== 'custom';$('#menu-icon-file-label').hidden = choice !== 'upload';
  $('#menu-icon-preview').src = currentMenuIcon() || '/donato-eye.svg';
}
function loadMenuIcon() {
  const logo = draft.categoryIcons?.[$('#menu-category').value] || '';
  menuUploadedIcon = '';$('#menu-icon-url').value = '';$('#menu-icon-file').value = '';$('#menu-icon-error').textContent = '';
  if(logo.startsWith('https://')) {$('#menu-icon-choice').value = 'custom';$('#menu-icon-url').value = logo;}
  else if(logo.startsWith('data:')) {$('#menu-icon-choice').value = 'upload';menuUploadedIcon = logo;}
  else $('#menu-icon-choice').value = logo;
  previewMenuIcon();
}
$('#edit-menu-icons').addEventListener('click',() => {
  $('#menu-category').innerHTML = [...categories(),'Todos'].map(name => `<option value="${escape(name)}">${escape(name)}</option>`).join('');
  loadMenuIcon();$('#category-icon-dialog').showModal();
});
$('#cancel-menu-icon').addEventListener('click',() => $('#category-icon-dialog').close());
$('#menu-category').addEventListener('change',loadMenuIcon);
$('#menu-icon-choice').addEventListener('change',previewMenuIcon);
$('#menu-icon-url').addEventListener('input',previewMenuIcon);
$('#menu-icon-preview').addEventListener('error',() => {if($('#menu-icon-preview').getAttribute('src') !== '/donato-eye.svg')$('#menu-icon-preview').src = '/donato-eye.svg';});
$('#menu-icon-file').addEventListener('change',async event => {
  const file = event.target.files[0];if(!file)return;
  try {
    const mime = file.type === 'image/vnd.microsoft.icon' || (!file.type && /\.ico$/i.test(file.name)) ? 'image/x-icon' : file.type;
    if(file.size > 512 * 1024 || !['image/svg+xml','image/png','image/jpeg','image/webp','image/x-icon'].includes(mime))throw new Error('Use SVG, PNG, JPEG, WebP ou ICO de até 512 KB.');
    const uploaded = await new Promise((resolve,reject) => {const reader = new FileReader();reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;/,`data:${mime};`));reader.onerror = reject;reader.readAsDataURL(file);});
    menuUploadedIcon = await normalizeMenuIcon(uploaded);
    $('#menu-icon-error').textContent = '';previewMenuIcon();
  } catch(error) {menuUploadedIcon = '';$('#menu-icon-error').textContent = error.message;previewMenuIcon();}
});
$('#category-icon-form').addEventListener('submit',async event => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    let logo = currentMenuIcon();
    const category = $('#menu-category').value;
    if($('#menu-icon-choice').value === 'custom') {const url = new URL(logo);if(url.protocol !== 'https:' || url.username || url.password)throw new Error('Use uma imagem HTTPS sem credenciais.');}
    if($('#menu-icon-choice').value === 'upload' && !logo)throw new Error('Envie uma imagem.');
    logo = await normalizeMenuIcon(logo);
    if(!$('#category-icon-dialog').open)return;
    draft.categoryIcons ||= {};
    if(logo)draft.categoryIcons[category] = logo;else delete draft.categoryIcons[category];
    $('#category-icon-dialog').close();markDirty();
  } catch(error) {$('#menu-icon-error').textContent = error.message;}
  finally {submit.disabled = false;}
});
try {
  session = await api('session');await reload();$('#account-name').textContent = session.username;$('#login-view').hidden = true;$('#panel-view').hidden = false;
} catch {showLogin();}
