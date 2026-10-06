import { readFile } from 'node:fs/promises';
const config = JSON.parse(await readFile('src-tauri/tauri.conf.json','utf8'));
const exePath = process.argv[2] || `src-tauri/target/release/${config.mainBinaryName}.exe`;
const exe = await readFile(exePath);
const ico = await readFile('src-tauri/icons/icon.ico');
const pe = exe.readUInt32LE(0x3c);
if(exe.toString('ascii',pe,pe+2) !== 'PE')throw new Error('Invalid Windows executable');
const optional = pe + 24;
const directories = optional + (exe.readUInt16LE(optional) === 0x20b ? 112 : 96);
const sectionTable = optional + exe.readUInt16LE(pe+20);
const sectionCount = exe.readUInt16LE(pe+6);
function offset(rva) {
  for(let index=0;index<sectionCount;index++) {
    const section = sectionTable + index*40;
    const address = exe.readUInt32LE(section+12);
    const size = Math.max(exe.readUInt32LE(section+8),exe.readUInt32LE(section+16));
    if(rva >= address && rva < address+size)return exe.readUInt32LE(section+20)+rva-address;
  }
  throw new Error('Resource address not found');
}
const root = offset(exe.readUInt32LE(directories+16));
function entries(relative) {
  const base = root+relative;
  const count = exe.readUInt16LE(base+12)+exe.readUInt16LE(base+14);
  return Array.from({length:count},(_,index) => {
    const entry = base+16+index*8;
    return {id:exe.readUInt32LE(entry),target:exe.readUInt32LE(entry+4)};
  });
}
const iconType = entries(0).find(entry => entry.id === 3);
if(!iconType)throw new Error('Executable has no RT_ICON resources');
const embedded = [];
function collect(target) {
  if(target & 0x80000000) {
    for(const entry of entries(target & 0x7fffffff))collect(entry.target);
  } else {
    const resource = root+target;
    const start = offset(exe.readUInt32LE(resource));
    embedded.push(exe.subarray(start,start+exe.readUInt32LE(resource+4)));
  }
}
collect(iconType.target);
const count = ico.readUInt16LE(4);
for(let index=0;index<count;index++) {
  const entry = 6+index*16;
  const start = ico.readUInt32LE(entry+12);
  const expected = ico.subarray(start,start+ico.readUInt32LE(entry+8));
  if(!embedded.some(image => image.equals(expected)))throw new Error(`Icon image ${index+1} differs from Donato ICO`);
}
const original = await readFile('artifacts/donato-eye.svg');
if(!original.equals(await readFile('public/donato-eye.svg')))throw new Error('Sidebar SVG differs from supplied Donato logo');
console.log(`${exePath}: ${count} icon images verified against Donato ICO; original SVG preserved.`);
