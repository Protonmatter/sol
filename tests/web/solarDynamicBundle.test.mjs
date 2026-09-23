import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {solarDynamicBundles} from '../../apps/web/js/solarDynamicManifest.js';
import {loadDynamicScene} from '../../apps/web/js/solarDynamicAssets.js';

test('shipped full-sphere model fields and independent pulse resources match all admitted hashes', async () => {
  const fetcher=async url=>new Response(await fs.readFile(url));
  const digest=async bytes=>new Uint8Array(createHash('sha256').update(new Uint8Array(bytes)).digest()).buffer;
  for(const id of ['quiet-v1','active-v1']){
    const scene=await loadDynamicScene(solarDynamicBundles[id],{fetcher,digest});
    assert.equal(scene.packet.recipe_id,id);
    assert.equal(scene.packet.recipe_hash,scene.manifest.recipe_hash);
    assert.equal(scene.analyticSurface,true,'compact attachment cores bypass coarse reference sampling');
    assert.equal(scene.surfaceData,null,'a reference raster must not silently drive the analytic surface');
    assert.equal(scene.selection.surface.referenceTextureUsed,false);
    assert.equal(scene.selection.surface.packet.sha256,scene.manifest.packet.sha256);
    assert.deepEqual(scene.manifest.surface.dimensions,[2048,1024]);
    assert.ok(scene.volumeData.some(x=>x>0));
    assert.equal(scene.analyticStrands,true,'diffuse volume and analytic strands have separate ownership');
    assert.equal(scene.pulseData,null,'analytic pulses do not allocate the unused voxel pulse atlas');
    assert.ok(scene.packet.strands.some(s=>s.pulse?.duration_s>0&&s.pulse?.amplitude>0),'coronal flow has finite localized strand pulses');
    assert.equal(scene.manifest.keyframes.length,25);
    assert.equal(scene.packet.field.lmax,32,'final data uses qualified harmonic resolution');
  }
});
