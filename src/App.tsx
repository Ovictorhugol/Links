import { useEffect, useRef, useState } from 'react';
import { ArrowDownAZ, ArrowUpRight, BriefcaseBusiness, Check, Grid2X2, LayoutGrid, List, Menu, Search, X } from 'lucide-react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import { normalize, type Category, type LinkItem } from './data';
import { useCatalog } from './useCatalog';

function Brand({item}: {item: LinkItem}) {
  const [failed,setFailed] = useState(false);
  useEffect(() => setFailed(false),[item.logo]);
  return <span className={`brand brand-${item.id}`} aria-hidden="true">{failed ? <b>{item.name.charAt(0)}</b> : <img src={item.logo} alt="" onError={() => setFailed(true)}/>}</span>;
}
function CategoryIcon({name,logo}: {name:string;logo?:string}) {
  const [failed,setFailed] = useState(false);
  useEffect(() => setFailed(false),[logo]);
  if(logo && !failed)return <img className="category-icon" src={logo} alt="" aria-hidden="true" onError={() => setFailed(true)}/>;
  return name === 'Todos' ? <LayoutGrid size={18}/> : name === 'Ferramentas Microsoft' ? <Grid2X2 size={18}/> : <BriefcaseBusiness size={18}/>;
}
export default function App() {
  const {links,categoryIcons,version,lastSync,status,detail} = useCatalog();
  const [query,setQuery] = useState('');
  const [category,setCategory] = useState<Category | 'Todos' | null>('Todos');
  const [view,setView] = useState<'grid' | 'list'>('grid');
  const [sort,setSort] = useState('az');
  const [toast,setToast] = useState('');
  const [sidebar,setSidebar] = useState(() => window.innerWidth > 650);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if(category && category !== 'Todos' && !links.some(item => item.category === category))setCategory('Todos'); },[links,category]);
  useEffect(() => { try { localStorage.removeItem('centraldesk.links'); localStorage.removeItem('centraldesk.work.preferences'); } catch { /* Legacy storage does not affect the catalog. */ } },[]);
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
  const filtered = links.filter(item => (category === null || category === 'Todos' || item.category === category) && normalize(`${item.name} ${item.description} ${item.url} ${item.category}`).includes(normalize(query))).sort((a,b) => sort === 'za' ? b.name.localeCompare(a.name,'pt-BR') : a.name.localeCompare(b.name,'pt-BR'));
  function resetFilters() { setQuery(''); }
  function selectCategory(value: Category | 'Todos') { setCategory(current => current === value ? null : value);resetFilters(); }
  async function launch(item: LinkItem) {
    const file = new URL(item.url).protocol === 'file:';
    if(file && !isTauri()) {setToast('Para abrir arquivos e pastas compartilhadas, use o aplicativo instalado no Windows.');return;}
    try {
      if(file)await invoke('open_catalog_file',{id:item.id});
      else if(isTauri())await openUrl(item.url);
      else window.open(item.url,'_blank','noopener,noreferrer');
    } catch {setToast(file ? 'Não foi possível abrir o arquivo ou pasta. Verifique o acesso à rede, o mapeamento da unidade e suas permissões.' : 'Não foi possível abrir o link. Verifique sua conexão ou o navegador padrão.');}
  }
  return <div className={`app ${sidebar ? '' : 'sidebar-hidden'}`}>
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="icon-button sidebar-toggle" aria-label={sidebar ? 'Recolher menu lateral' : 'Expandir menu lateral'} title={sidebar ? 'Recolher menu lateral' : 'Expandir menu lateral'} aria-expanded={sidebar} aria-controls="sidebar-categories" onClick={() => setSidebar(!sidebar)}><Menu size={22}/></button>
        <a className="logo donato-logo" href="#" aria-label="Donato Hospital de Olhos — todos os links" onClick={event => {event.preventDefault();selectCategory('Todos');}}><img src="/donato-eye.svg" alt=""/><span>DONATO<small>HOSPITAL DE OLHOS</small></span></a>
      </div>
      <span className="nav-label">CATEGORIAS</span>
      <nav id="sidebar-categories" aria-label="Categorias">
        {[...new Set(links.map(item => item.category))].map(name => <button key={name} className={`nav-item ${category === name ? 'active' : ''}`} onClick={() => selectCategory(name)} title={name} aria-pressed={category === name}><CategoryIcon name={name} logo={categoryIcons[name]}/><span className="nav-text">{name}</span><span className="count">{links.filter(item => item.category === name).length}</span></button>)}
        <button className={`nav-item ${category === 'Todos' ? 'active' : ''}`} onClick={() => selectCategory('Todos')} title="Todos" aria-pressed={category === 'Todos'}><CategoryIcon name="Todos" logo={categoryIcons.Todos}/><span className="nav-text">Todos</span><span className="count">{links.length}</span></button>
      </nav>
    </aside>
    <div className="main-shell">
      <main>
        <div className="search-row"><div className="search-box"><Search size={20}/><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Pesquisar sistemas ou ferramentas..." aria-label="Pesquisar atalhos"/>{query ? <button className="icon-button" aria-label="Limpar pesquisa" onClick={() => setQuery('')}><X size={16}/></button> : <kbd>Ctrl K</kbd>}</div></div>
        <section className="collection">
          <div className="collection-toolbar"><div className="collection-title"><div className="category-pills" aria-label="Filtro rápido"><button className={category === 'Todos' ? 'selected' : ''} onClick={() => selectCategory('Todos')} aria-pressed={category === 'Todos'}>Todos</button></div><span>{filtered.length} atalhos</span></div><div className="view-controls"><div className="sort-control"><ArrowDownAZ size={15}/><select aria-label="Ordenar atalhos" value={sort} onChange={event => setSort(event.target.value)}><option value="az">Nome: A–Z</option><option value="za">Nome: Z–A</option></select></div><span className="toolbar-divider"/><div className="view-toggle"><button className={view === 'grid' ? 'selected' : ''} onClick={() => setView('grid')} aria-label="Visualização em cards" aria-pressed={view === 'grid'}><Grid2X2 size={17}/></button><button className={view === 'list' ? 'selected' : ''} onClick={() => setView('list')} aria-label="Visualização em lista" aria-pressed={view === 'list'}><List size={19}/></button></div></div></div>
          <div className={`links-${view}`}>{filtered.map(item => <article key={item.id} className="link-card">
            <div className="card-top"><Brand item={item}/></div>
            <a className="card-body" href={item.url} target="_blank" rel="noopener noreferrer" draggable={false} aria-label={`Acessar ${item.name}`} onClick={event => {event.preventDefault();void launch(item);}}><h3>{item.name}</h3><p>{item.description}</p></a>
            <div className="card-bottom"><span className="tag tag-trabalho">{item.category}</span><button className="open-card" aria-label={`Abrir ${item.name}`} onClick={() => launch(item)}><ArrowUpRight size={17}/></button></div>
          </article>)}</div>
          {filtered.length === 0 && <div className="empty-state"><Search size={30}/><h3>Nenhum atalho por aqui</h3><p>Tente outro termo ou selecione outra categoria.</p></div>}
        </section>
      </main>
      <div className="status-bar catalog-status"><span><span className="local-dot"/>{links.length} atalhos · catálogo v{version}</span><div className="sync-status"><span role="status" title={detail || undefined}>{status}{lastSync ? ` · última sincronização: ${new Date(lastSync * 1000).toLocaleString('pt-BR')}` : ''}</span></div></div>
    </div>
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}<button className="icon-button" onClick={() => setToast('')} aria-label="Dispensar aviso"><X size={16}/></button></div>}
  </div>;
}
