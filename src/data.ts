export type Category = 'Trabalho' | 'Ferramentas Microsoft';
export type LinkItem = { id: string; name: string; description: string; url: string; category: Category; favorite: boolean; logo: string };
export const initialLinks: LinkItem[] = [
  {id:'eaglesoft',name:'EAGLESOFT',description:'Acesso ao sistema Eaglesoft.',url:'https://eaglesoft.com.br/login',category:'Trabalho',favorite:false,logo:'/logos/eaglesoft.png'},
  {id:'onedrive',name:'ONEDRIVE',description:'Seus arquivos e documentos na nuvem.',url:'https://institutodonato1-my.sharepoint.com/',category:'Ferramentas Microsoft',favorite:false,logo:'/logos/onedrive.png'},
  {id:'notificacao',name:'NOTIFICAÇÃO',description:'Formulário de notificações.',url:'https://docs.google.com/forms/d/1R-rHU_fResEN2FWSOqrXim0e1f6p4c1nh6-obrCUjEE/viewform?edit_requested=true',category:'Trabalho',favorite:false,logo:'/logos/notificacao.png'},
  {id:'modulos',name:'MODULOS',description:'Acesso aos módulos ConecteW.',url:'https://modulos.conectew.com.br/',category:'Trabalho',favorite:false,logo:'/logos/modulos.png'},
  {id:'word',name:'WORD',description:'Crie e edite seus documentos.',url:'https://office.live.com/start/Word.aspx?omkt=pt-BR',category:'Ferramentas Microsoft',favorite:false,logo:'/logos/word.png'},
  {id:'wareline',name:'WARELINE WEB',description:'Sistema Wareline na rede local.',url:'https://dho.local.conectew.com.br/',category:'Trabalho',favorite:false,logo:'/logos/wareline.png'},
  {id:'teams',name:'TEAMS',description:'Conversas, reuniões e colaboração.',url:'https://www.microsoft.com/pt-br/microsoft-teams/log-in',category:'Ferramentas Microsoft',favorite:false,logo:'/logos/teams.png'},
  {id:'excel',name:'EXCEL',description:'Planilhas para organizar seu trabalho.',url:'https://office.live.com/start/Excel.aspx?ui=pt-BR',category:'Ferramentas Microsoft',favorite:false,logo:'/logos/excel.png'},
  {id:'suporte',name:'SUPORTE TI',description:'Solicite ajuda à equipe de tecnologia.',url:'http://suporte.donatoholhos.com.br',category:'Trabalho',favorite:false,logo:'/logos/suporte.png'},
  {id:'powerpoint',name:'POWER POINT',description:'Crie e apresente suas ideias.',url:'https://office.live.com/start/PowerPoint.aspx?omkt=pt-BR',category:'Ferramentas Microsoft',favorite:false,logo:'/logos/powerpoint.png'},
  {id:'outlook',name:'OUTLOOK',description:'E-mails e comunicação da equipe.',url:'https://outlook.office365.com/mail/inbox',category:'Ferramentas Microsoft',favorite:false,logo:'/logos/outlook.png'},
];
export function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
// Fixed catalog: storage keeps only order and favorites, never old names or URLs.
export function readLinks(): LinkItem[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('centraldesk.work.preferences') || 'null');
    if (Array.isArray(saved)) {
      const remaining = new Map(initialLinks.map(item => [item.id,item]));
      const ordered: LinkItem[] = [];
      for (const preference of saved) { const item = remaining.get(preference?.id); if(item) { ordered.push({...item,favorite:preference.favorite === true}); remaining.delete(item.id); } }
      return [...ordered,...remaining.values()];
    }
  } catch { /* Keep the supplied catalog available when storage fails. */ }
  return initialLinks.map(item => ({...item}));
}
