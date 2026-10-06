import { mkdir, writeFile } from 'node:fs/promises';
const cdn = 'https://res.cdn.office.net/files/fabric-cdn-prod_20230815.001/assets/brand-icons/product/png';
const favicon = domain => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
const sources = {
  eaglesoft:[favicon('eaglesoft.com.br')],
  onedrive:[`${cdn}/onedrive_48x1.png`,favicon('onedrive.live.com')],
  notificacao:['https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_form_x128.png',favicon('forms.google.com')],
  modulos:[favicon('conectew.com.br')],
  word:[`${cdn}/word_48x1.png`,favicon('office.live.com')],
  wareline:[favicon('wareline.com.br')],
  teams:[`${cdn}/teams_48x1.png`,favicon('teams.microsoft.com')],
  excel:[`${cdn}/excel_48x1.png`,favicon('office.live.com')],
  suporte:[favicon('donatoholhos.com.br')],
  powerpoint:[`${cdn}/powerpoint_48x1.png`,favicon('office.live.com')],
  outlook:[`${cdn}/outlook_48x1.png`,favicon('outlook.office365.com')],
};
await mkdir('public/logos',{recursive:true});
const manifest = {};
await Promise.all(Object.entries(sources).map(async ([id,urls]) => {
  for(const url of urls) {
    try {
      const response = await fetch(url,{signal:AbortSignal.timeout(10000)});
      if(!response.ok)continue;
      const data = Buffer.from(await response.arrayBuffer());
      if(data.length < 100 || data.subarray(0,8).toString('hex') !== '89504e470d0a1a0a')continue;
      await writeFile(`public/logos/${id}.png`,data);
      manifest[id] = {source:url,width:data.readUInt32BE(16),height:data.readUInt32BE(20)};
      console.log(`${id}: ${manifest[id].width}x${manifest[id].height}`);
      return;
    } catch { /* Try the next public source. */ }
  }
  console.log(`${id}: logo unavailable; UI will use an initial`);
}));
await writeFile('public/logos/sources.json',JSON.stringify(manifest,null,2)+'\n');
