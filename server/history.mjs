const fields = ['name','description','url','category','logo'];
const linkSummary = ({id,name,description,url,category}) => ({id,name,description,url,category});

export function catalogChanges(current,previous) {
  const changes = {baseline:!previous,added:[],removed:[],updated:[],categories:[],categoryIcons:[],orderChanged:false};
  if(!previous)return changes;
  const before = new Map(previous.links.map(link => [link.id,link]));
  const after = new Map(current.links.map(link => [link.id,link]));
  const renamed = new Map();
  const oldCategories = new Set(previous.links.map(link => link.category));
  const newCategories = new Set(current.links.map(link => link.category));
  for(const category of oldCategories) {
    if(newCategories.has(category))continue;
    const members = previous.links.filter(link => link.category === category);
    const destination = after.get(members[0].id)?.category;
    if(!destination || oldCategories.has(destination) || !members.every(link => after.get(link.id)?.category === destination))continue;
    renamed.set(category,destination);
    changes.categories.push({before:category,after:destination,iconChanged:(previous.categoryIcons || {})[category] !== (current.categoryIcons || {})[destination]});
  }
  for(const link of current.links) {
    const old = before.get(link.id);
    if(!old) {changes.added.push(linkSummary(link));continue;}
    const changed = fields.filter(field => old[field] !== link[field] && !(field === 'category' && renamed.get(old.category) === link.category)).map(field => field === 'logo' ? {field} : {field,before:old[field],after:link[field]});
    if(changed.length)changes.updated.push({id:link.id,name:link.name,fields:changed});
  }
  for(const link of previous.links)if(!after.has(link.id))changes.removed.push(linkSummary(link));
  const oldIcons = previous.categoryIcons || {};
  const newIcons = current.categoryIcons || {};
  for(const category of new Set([...Object.keys(oldIcons),...Object.keys(newIcons)])) {
    if(renamed.has(category) || [...renamed.values()].includes(category))continue;
    if(oldIcons[category] !== newIcons[category])changes.categoryIcons.push({category,kind:!newIcons[category] ? 'removed' : !oldIcons[category] ? 'added' : 'updated'});
  }
  if(!changes.added.length && !changes.removed.length)changes.orderChanged = current.links.some((link,index) => previous.links[index]?.id !== link.id);
  return changes;
}

export function publicationHistory(rows) {
  const catalogs = rows.map(row => JSON.parse(row.catalog_json));
  return rows.slice(0,20).map(({catalog_json,...row},index) => ({
    ...row,version:Number(row.version),displayVersion:catalogs[index].displayVersion ?? Number(row.version),
    changes:catalogChanges(catalogs[index],catalogs[index + 1]),
  }));
}
