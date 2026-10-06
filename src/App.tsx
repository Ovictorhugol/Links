import { useEffect, useRef, useState } from 'react';
import { ArrowDownAZ, ArrowUpRight, BriefcaseBusiness, Check, Grip, Grid2X2, LayoutGrid, List, Menu, Search, Star, X } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import { normalize, readLinks, type Category, type LinkItem } from './data';

function Brand({item}: {item: LinkItem}) {
  const [failed,setFailed] = useState(false);
  return <span className={`brand brand-${item.id}`} aria-hidden="true">{failed ? <b>{item.name.charAt(0)}</b> : <img src={item.logo} alt="" onError={() => setFailed(true)}/>}</span>;
}
export default function App() {
  const [links,setLinks] = useState(readLinks);
  const [query,setQuery] = useState('');
  const [category,setCategory] = useState<Category | 'Todos' | null>('Todos');
  const [view,setView] = useState<'grid' | 'list'>('grid');
  const [sort,setSort] = useState('manual');
  const [toast,setToast] = useState('');
  const [dragged,setDragged] = useState<string | null>(null);
  const [sidebar,setSidebar] = useState(() => window.innerWidth > 650);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { try { localStorage.setItem('centraldesk.work.preferences',JSON.stringify(links.map(({id,favorite}) => ({id,favorite})))); localStorage.removeItem('centraldesk.links'); } catch { setToast('Não foi possível salvar suas preferências neste dispositivo.'); } },[links]);
  useEffect(() => { if(toast) { const timer = setTimeout(() => setToast(''),4000); return () => clearTimeout(timer); } },[toast]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {event.preventDefault();searchRef.current?.focus();}
      if(isTauri() && !event.repeat && (event.key === 'F11' || event.key === 'Escape')) {
        event.preventDefault();
        const appWindow = getCurrentWindow();
        void (async () => {
          const fullscreen = await appWindow.isFullscreen();
          if(event.key === 'F11' || fullscreen)await appWindow.setFullscreen(event.key === 'F11' ? !fullscreen : false);
        })().catch(() => setToast('Não foi possível alterar o modo de tela cheia.'));
      }
    };
    window.addEventListener('keydown',handler);return () => window.removeEventListener('keydown',handler);
  },[]);
  const filtered = links.filter(item => (category === null || category === 'Todos' || item.category === category) && normalize(`${item.name} ${item.description} ${item.url} ${item.category}`).includes(normalize(query))).sort((a,b) => sort === 'az' ? a.name.localeCompare(b.name,'pt-BR') : sort === 'za' ? b.name.localeCompare(a.name,'pt-BR') : 0);
  function resetFilters() { setQuery(''); }
  function selectCategory(value: Category | 'Todos') { setCategory(current => current === value ? null : value);resetFilters(); }
  const toggleFavorite = (id: string) => setLinks(items => items.map(item => item.id === id ? {...item,favorite:!item.favorite} : item));
  async function launch(item: LinkItem) { try { if(isTauri()) await openUrl(item.url); else window.open(item.url,'_blank','noopener,noreferrer'); } catch {setToast('Não foi possível abrir o link. Verifique sua conexão ou o navegador padrão.');} }
  function drop(targetId: string) { if(!dragged || dragged === targetId || sort !== 'manual')return; setLinks(items => {const result = [...items];const from = result.findIndex(item => item.id === dragged);const to = result.findIndex(item => item.id === targetId);if(from < 0 || to < 0)return items;const [item] = result.splice(from,1);result.splice(to,0,item);return result;});setDragged(null); }
  return <div className={`app ${sidebar ? '' : 'sidebar-hidden'}`}>
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="icon-button sidebar-toggle" aria-label={sidebar ? 'Recolher menu lateral' : 'Expandir menu lateral'} title={sidebar ? 'Recolher menu lateral' : 'Expandir menu lateral'} aria-expanded={sidebar} aria-controls="sidebar-categories" onClick={() => setSidebar(!sidebar)}><Menu size={22}/></button>
        <a className="logo donato-logo" href="#" aria-label="Donato Hospital de Olhos — todos os links" onClick={event => {event.preventDefault();selectCategory('Todos');}}><img src="/donato-eye.svg" alt=""/><span>DONATO<small>HOSPITAL DE OLHOS</small></span></a>
      </div>
      <span className="nav-label">CATEGORIAS</span>
      <nav id="sidebar-categories" aria-label="Categorias">
        <button className={`nav-item ${category === 'Trabalho' ? 'active' : ''}`} onClick={() => selectCategory('Trabalho')} title="Trabalho" aria-pressed={category === 'Trabalho'}><BriefcaseBusiness size={18}/><span className="nav-text">Trabalho</span><span className="count">{links.filter(item => item.category === 'Trabalho').length}</span></button>
        <button className={`nav-item ${category === 'Ferramentas Microsoft' ? 'active' : ''}`} onClick={() => selectCategory('Ferramentas Microsoft')} title="Ferramentas Microsoft" aria-pressed={category === 'Ferramentas Microsoft'}><Grid2X2 size={18}/><span className="nav-text">Ferramentas Microsoft</span><span className="count">{links.filter(item => item.category === 'Ferramentas Microsoft').length}</span></button>
        <button className={`nav-item ${category === 'Todos' ? 'active' : ''}`} onClick={() => selectCategory('Todos')} title="Todos" aria-pressed={category === 'Todos'}><LayoutGrid size={18}/><span className="nav-text">Todos</span><span className="count">{links.length}</span></button>
      </nav>
    </aside>
    <div className="main-shell">
      <main>
        <div className="search-row"><div className="search-box"><Search size={20}/><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Pesquisar sistemas ou ferramentas..." aria-label="Pesquisar atalhos"/>{query ? <button className="icon-button" aria-label="Limpar pesquisa" onClick={() => setQuery('')}><X size={16}/></button> : <kbd>Ctrl K</kbd>}</div></div>
        <section className="collection">
          <div className="collection-toolbar"><div className="collection-title"><div className="category-pills" aria-label="Filtro rápido"><button className={category === 'Todos' ? 'selected' : ''} onClick={() => selectCategory('Todos')} aria-pressed={category === 'Todos'}>Todos</button></div><span>{filtered.length} atalhos</span></div><div className="view-controls"><div className="sort-control"><ArrowDownAZ size={15}/><select aria-label="Ordenar atalhos" value={sort} onChange={event => setSort(event.target.value)}><option value="manual">Ordem personalizada</option><option value="az">Nome: A–Z</option><option value="za">Nome: Z–A</option></select></div><span className="toolbar-divider"/><div className="view-toggle"><button className={view === 'grid' ? 'selected' : ''} onClick={() => setView('grid')} aria-label="Visualização em cards" aria-pressed={view === 'grid'}><Grid2X2 size={17}/></button><button className={view === 'list' ? 'selected' : ''} onClick={() => setView('list')} aria-label="Visualização em lista" aria-pressed={view === 'list'}><List size={19}/></button></div></div></div>
          <div className={`links-${view}`}>{filtered.map(item => <article key={item.id} className={`link-card ${dragged === item.id ? 'dragging' : ''}`} draggable={sort === 'manual'} onDragStart={event => {setDragged(item.id);event.dataTransfer.setData('text/plain',item.id);}} onDragOver={event => event.preventDefault()} onDrop={event => {event.preventDefault();drop(item.id);}} onDragEnd={() => setDragged(null)}>
            <div className="card-top"><Brand item={item}/><div className="card-actions"><button className={`favorite-button ${item.favorite ? 'is-favorite' : ''}`} aria-label={`${item.favorite ? 'Remover' : 'Adicionar'} ${item.name} ${item.favorite ? 'dos' : 'aos'} favoritos`} onClick={() => toggleFavorite(item.id)}><Star size={16} fill={item.favorite ? 'currentColor' : 'none'}/></button></div></div>
            <a className="card-body" href={item.url} target="_blank" rel="noopener noreferrer" draggable={false} aria-label={`Acessar ${item.name}`} onClick={event => {event.preventDefault();void launch(item);}}><h3>{item.name}</h3><p>{item.description}</p></a>
            <div className="card-bottom"><span className="tag tag-trabalho">{item.category}</span><button className="open-card" aria-label={`Abrir ${item.name}`} onClick={() => launch(item)}><ArrowUpRight size={17}/></button></div>
          </article>)}</div>
          {filtered.length === 0 && <div className="empty-state"><Search size={30}/><h3>Nenhum atalho por aqui</h3><p>Tente outro termo ou selecione outra categoria.</p></div>}
        </section>
        <footer className="content-footer"><span><Grip size={14}/>{sort === 'manual' ? 'Arraste os cards para deixar tudo do seu jeito.' : 'Selecione a ordem personalizada para reorganizar.'}</span></footer>
      </main>
      <div className="status-bar"><span><span className="local-dot"/>{links.length} atalhos de trabalho</span></div>
    </div>
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}<button className="icon-button" onClick={() => setToast('')} aria-label="Dispensar aviso"><X size={16}/></button></div>}
  </div>;
}
