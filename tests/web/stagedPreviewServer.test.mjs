import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStagedPreviewServer} from '../../tools/staged_preview_server.mjs';

async function fixture(t, basePath) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sol-staged-preview-'));
  const assets = {
    'index.html': `<meta http-equiv="refresh" content="0;url=${basePath}releases/test-release/index.html">`,
    'releases/test-release/index.html': '<script type="module" src="app.js"></script>',
    'releases/test-release/app.js': 'export const realApplicationEntry = true;',
    'releases/test-release/textures/moon.u16': Buffer.from([1, 0, 2, 0]),
  };
  for (const [name, bytes] of Object.entries(assets)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), {recursive:true});
    fs.writeFileSync(file, bytes);
  }
  const server = createStagedPreviewServer(root, basePath);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('sol-staged-preview-'));
    fs.rmSync(root, {recursive:true, force:true});
  });
  return {origin:`http://127.0.0.1:${server.address().port}`, assets};
}

for (const basePath of ['/', '/sol/']) {
  test(`complete staged preview serves bootstrap and immutable assets under ${basePath}`, async t => {
    const {origin, assets} = await fixture(t, basePath);
    const bootstrap = await fetch(origin + basePath);
    assert.equal(bootstrap.status, 200, 'release bootstrap must resolve at the manifest base path');
    const destination = /url=([^"<]+)/.exec(await bootstrap.text())[1];
    assert.equal(destination, basePath + 'releases/test-release/index.html');
    for (const name of Object.keys(assets).filter(name => name.startsWith('releases/'))) {
      const response = await fetch(origin + basePath + name);
      assert.equal(response.status, 200, name);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(assets[name]), name);
    }
  });
}

test('staged preview does not serve the artifact outside its declared base path', async t => {
  const {origin} = await fixture(t, '/sol/');
  for (const route of ['/', '/index.html', '/releases/test-release/app.js', '/solitude/index.html', '/sol/%2e%2e/index.html']) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 404, route);
  }
});

test('staged preview rejects malformed manifest mount paths before listening', () => {
  for (const basePath of ['', 'sol/', '/sol', '/sol//', '/../', '/sol/./', '/sol\\/', '/sol?query/', '/%73ol/']) {
    assert.throws(() => createStagedPreviewServer(os.tmpdir(), basePath), /normalized absolute URL path/);
  }
});
