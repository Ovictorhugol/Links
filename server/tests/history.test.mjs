import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialCatalog } from '../catalog.mjs';
import { catalogChanges, publicationHistory } from '../history.mjs';

test('renomear categoria agrupa seus links e preserva outras edições individuais',() => {
  const a = {...initialCatalog.links[0],id:'a',category:'Donato'};
  const b = {...a,id:'b',name:'Segundo'};
  const previous = {links:[a,b],categoryIcons:{Donato:'/donato-eye.svg'}};
  const current = {links:[{...a,category:'DONATO'},{...b,category:'DONATO',url:'https://example.com/novo',description:'Nova descrição'}],categoryIcons:{DONATO:'/donato-eye.svg'}};
  const changes = catalogChanges(current,previous);
  assert.deepEqual(changes.categories,[{before:'Donato',after:'DONATO',iconChanged:false}]);
  assert.deepEqual(changes.categoryIcons,[]);
  assert.equal(changes.updated.length,1);
  assert.equal(changes.updated[0].id,'b');
  assert.deepEqual(changes.updated[0].fields.map(field => field.field),['description','url']);
  const partial = catalogChanges({...current,links:[a,current.links[1]]},previous);
  assert.deepEqual(partial.categories,[]);
  assert.ok(partial.updated[0].fields.some(field => field.field === 'category'));
  const changedIcon = catalogChanges({...current,categoryIcons:{DONATO:'/logos/word.png'}},previous);
  assert.equal(changedIcon.categories[0].iconChanged,true);
});

test('histórico identifica inclusões, remoções, campos editados e ícones sem devolver imagens grandes',() => {
  const previous = {...initialCatalog,categoryIcons:{Donato:'/donato-eye.svg',Todos:'/logos/excel.png'}};
  const current = {...previous,links:previous.links.slice(1).map((link,index) => index === 0 ? {...link,name:'Nome novo',url:'https://example.com/novo',logo:'data:image/png;base64,AAAA'} : link),categoryIcons:{Donato:'/logos/word.png',Equipe:'/donato-eye.svg'}};
  current.links.push({...previous.links[0],id:'novo',name:'Atalho novo'});
  const changes = catalogChanges(current,previous);
  assert.equal(changes.baseline,false);
  assert.deepEqual(changes.added.map(link => link.id),['novo']);
  assert.deepEqual(changes.removed.map(link => link.id),[previous.links[0].id]);
  assert.deepEqual(changes.updated[0].fields,[{field:'name',before:previous.links[1].name,after:'Nome novo'},{field:'url',before:previous.links[1].url,after:'https://example.com/novo'},{field:'logo'}]);
  assert.deepEqual(changes.categoryIcons,[{category:'Donato',kind:'updated'},{category:'Todos',kind:'removed'},{category:'Equipe',kind:'added'}]);
  assert.equal(JSON.stringify(changes).includes('base64'),false);
});

test('primeira publicação é referência, alterações de metadados não inventam edições',() => {
  assert.equal(catalogChanges(initialCatalog).baseline,true);
  const changes = catalogChanges({...initialCatalog,version:99,displayVersion:0},initialCatalog);
  assert.deepEqual(changes.updated,[]);assert.deepEqual(changes.added,[]);assert.equal(changes.orderChanged,false);
  assert.equal(catalogChanges({...initialCatalog,links:[...initialCatalog.links].reverse()},initialCatalog).orderChanged,true);
});

test('última publicação entre as vinte exibidas ainda é comparada com sua antecessora',() => {
  const rows = Array.from({length:21},(_,index) => {
    const version = 21-index;
    return {version,catalog_json:JSON.stringify({...initialCatalog,version,displayVersion:version-1,links:initialCatalog.links.map((link,i) => i === 0 ? {...link,name:`Nome ${version}`} : link)}),author:'admin',createdAt:'2026-10-08T00:00:00Z'};
  });
  const history = publicationHistory(rows);
  assert.equal(history.length,20);
  assert.equal(history[0].displayVersion,20);
  assert.equal(history.at(-1).changes.baseline,false);
  assert.deepEqual(history.at(-1).changes.updated[0].fields,[{field:'name',before:'Nome 1',after:'Nome 2'}]);
});
