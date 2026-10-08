import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { readLinks } from './data';
import { browserSnapshot, loadCatalog, syncCatalog, configured, type ClientConfig } from './catalog';

export function useCatalog() {
  const [links,setLinks] = useState(() => readLinks(isTauri() ? undefined : browserSnapshot().catalog));
  const [categoryIcons,setCategoryIcons] = useState<Record<string,string>>(() => browserSnapshot().catalog.categoryIcons || {});
  const [ready,setReady] = useState(false);
  const [config,setConfig] = useState<ClientConfig | null>(null);
  const [syncing,setSyncing] = useState(false);
  const [version,setVersion] = useState(() => {const catalog = browserSnapshot().catalog;return catalog.displayVersion ?? catalog.version;});
  const [lastSync,setLastSync] = useState<number | null>(null);
  const [status,setStatus] = useState('Carregando links locais…');
  const [detail,setDetail] = useState('');
  const busy = useRef(false);
  const mounted = useRef(false);
  const synchronize = useCallback(async () => {
    if(!config || !configured(config) || busy.current) return;
    busy.current = true;
    setSyncing(true);
    setStatus('Verificando atualizações…');
    try {
      const snapshot = await syncCatalog(config);
      if(!mounted.current) return;
      setLinks(readLinks(snapshot.catalog));
      setCategoryIcons(snapshot.catalog.categoryIcons || {});
      setVersion(snapshot.catalog.displayVersion ?? snapshot.catalog.version);
      setLastSync(snapshot.lastSync);
      setStatus('Links atualizados');
      setDetail('');
    } catch(error) {
      if(mounted.current) {
        setStatus('Atualização indisponível · links locais mantidos');
        setDetail(String(error));
      }
    } finally {
      busy.current = false;
      if(mounted.current) setSyncing(false);
    }
  },[config]);
  useEffect(() => {
    mounted.current = true;
    void loadCatalog().then(local => {
      if(!mounted.current) return;
      setLinks(readLinks(local.snapshot.catalog));
      setCategoryIcons(local.snapshot.catalog.categoryIcons || {});
      setVersion(local.snapshot.catalog.displayVersion ?? local.snapshot.catalog.version);
      setLastSync(local.snapshot.lastSync);
      setConfig(local.config);
      setStatus(local.warning ? 'Links locais · confira a configuração' : configured(local.config) ? 'Links locais disponíveis' : 'Links locais · atualização não configurada');
      setDetail(local.warning || '');
      setReady(true);
    }).catch(error => {
      if(mounted.current) { setStatus('Catálogo inicial disponível · falha ao ler dados locais');setDetail(String(error));setReady(true); }
    });
    return () => { mounted.current = false; };
  },[]);
  useEffect(() => {
    if(!ready || !config || !configured(config)) return;
    void synchronize();
    const timer = setInterval(() => void synchronize(),config.pollIntervalMinutes * 60000);
    return () => clearInterval(timer);
  },[ready,config,synchronize]);
  return {links,categoryIcons,ready,version,lastSync,status,detail,syncing,synchronize,configured:configured(config)};
}
