import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publishMsi} from '../../scripts/publish-msi.mjs';

test('published MSI cannot be replaced by a different build with the same filename',async () => {
  const root = await mkdtemp(join(tmpdir(),'donato-msi-test-'));
  try {
    const source = join(root,'app-0.3.7.msi');
    const destination = join(root,'share');
    await writeFile(source,'original MSI');
    await publishMsi(source,destination);
    await publishMsi(source,destination);
    await writeFile(source,'rebuilt MSI');
    await assert.rejects(publishMsi(source,destination),/immutable/);
    assert.equal(await readFile(join(destination,'app-0.3.7.msi'),'utf8'),'original MSI');
  } finally {await rm(root,{recursive:true,force:true});}
});
