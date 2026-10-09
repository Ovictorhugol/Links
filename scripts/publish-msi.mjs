import {copyFile, mkdir, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {constants} from 'node:fs';

export const msiDestination = String.raw`\\192.168.10.22\donato_files\GERAL\TI`;

export async function publishMsi(source,destinationDirectory = msiDestination) {
  if(!source.toLowerCase().endsWith('.msi'))throw new Error('Only MSI installers can be published.');
  const original = await readFile(source);
  await mkdir(destinationDirectory,{recursive:true});
  const destination = join(destinationDirectory,basename(source));
  try {await copyFile(source,destination,constants.COPYFILE_EXCL);}
  catch(error) {
    if(error.code !== 'EEXIST')throw error;
    const existing = await readFile(destination);
    if(!original.equals(existing))throw new Error(`Published MSI is immutable: ${destination}. Increase the project version before publishing another build.`);
  }
  const copied = await readFile(destination);
  const hash = data => createHash('sha256').update(data).digest('hex');
  if(hash(original) !== hash(copied))throw new Error(`MSI copy verification failed: ${destination}`);
  console.log(`MSI copied and verified: ${destination}`);
}

if(process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if(!process.argv[2])throw new Error('Provide the path to the MSI installer.');
    await publishMsi(resolve(process.argv[2]));
  } catch(error) {console.error(error.message);process.exitCode = 1;}
}
