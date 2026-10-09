import cli from '@tauri-apps/cli';
import {readdir, stat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {publishMsi} from './publish-msi.mjs';

async function installers(directory,found = new Map()) {
  let entries;
  try {entries = await readdir(directory,{withFileTypes:true});}
  catch(error) {if(error.code === 'ENOENT')return found;throw error;}
  for(const entry of entries) {
    if(entry.isDirectory() && !['deps','build','incremental','.fingerprint','diagnostics'].includes(entry.name)) {
      await installers(join(directory,entry.name),found);
    } else if(entry.isFile() && entry.name.endsWith('.msi')) {
      const path = join(directory,entry.name);
      found.set(path,(await stat(path,{bigint:true})).mtimeNs);
    }
  }
  return found;
}

try {
  const args = process.argv.slice(2);
  const buildsInstaller = ['build','bundle'].includes(args[0]);
  const target = resolve(process.env.CARGO_TARGET_DIR || 'src-tauri/target');
  const before = buildsInstaller ? await installers(target) : new Map();
  await cli.run(args,'npm run tauri');
  if(buildsInstaller) {
    for(const [path,modified] of await installers(target)) {
      if(before.get(path) !== modified)await publishMsi(path);
    }
  }
} catch(error) {
  console.error(error.message);
  process.exitCode = 1;
}
