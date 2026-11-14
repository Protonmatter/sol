import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {browserBackendFromArgs,browserBackendArgs,assertBrowserBackend,captureBrowserCapabilities} from '../../tools/browser_backend.mjs';
import * as backendPolicy from '../../tools/browser_backend.mjs';

test('native Sun qualification covers all declared qualities while software retains the default',()=>{
  assert.equal(typeof backendPolicy.sunLookProbeResolutions,'function');
  assert.deepEqual(backendPolicy.sunLookProbeResolutions('native'),[1024,2048,4096]);
  assert.deepEqual(backendPolicy.sunLookProbeResolutions('swiftshader'),[1024]);
  assert.deepEqual(backendPolicy.sunLookProbeResolutions(),[1024]);
  assert.throws(()=>backendPolicy.sunLookProbeResolutions('automatic'),/Unsupported/);
});

test('physical1280 harness rejects invalid backend before any qualification work',()=>{
  const tool=new URL('../../tools/atmosphere_validation.mjs',import.meta.url);
  const result=spawnSync(process.execPath,[fileURLToPath(tool),'--backend=automatic'],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Unsupported browser backend/);
  const source=fs.readFileSync(tool,'utf8');
  assert.ok(source.includes('...browserBackendArgs(backend)'));
  assert.ok(source.indexOf('assertBrowserBackend(backend,evidence.gpu)')<source.indexOf('const actual=await page.evaluate('));
  assert.ok(source.includes('protocolTimeout:30000'));
});

test('backend option supports explicit values and rejects missing or ambiguous requests',()=>{
  assert.equal(browserBackendFromArgs([]),'swiftshader');
  assert.equal(browserBackendFromArgs(['--web-root=stage','--backend=native']),'native');
  assert.equal(browserBackendFromArgs(['--backend','native']),'native');
  assert.equal(browserBackendFromArgs(['--backend=swiftshader']),'swiftshader');
  for(const args of [['--backend'],['--backend='],['--backend','auto'],['--backend=native','--backend=swiftshader']])
    assert.throws(()=>browserBackendFromArgs(args));
});
test('startup native comparison requires an exact renderer pin before artifact or browser work',()=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../tools/startup_profile.mjs',import.meta.url)),
    '--backend=native','--expected-browser=Chrome/156.0.8078.80'],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/expected-renderer/);
});

test('browser backend preserves the original SwiftShader flags by default',()=>{
  assert.deepEqual(browserBackendArgs(),['--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle']);
  assert.deepEqual(browserBackendArgs('swiftshader','win32'),browserBackendArgs());
  assert.deepEqual(browserBackendArgs('native','win32'),['--use-angle=d3d11','--use-gl=angle']);
  assert.deepEqual(browserBackendArgs('native','linux'),['--use-gl=angle']);
  assert.throws(()=>browserBackendArgs('automatic'),/Unsupported/);
  assert.ok(!browserBackendArgs('native','win32').some(flag=>/swiftshader|disable-gpu/.test(flag)));
});

test('actual renderer identity rejects requested native mode with software or unknown execution',()=>{
  assert.equal(assertBrowserBackend('native',{renderer:'ANGLE (Qualcomm, Adreno 8c, D3D11)'}).kind,'native-device');
  assert.equal(assertBrowserBackend('swiftshader',{renderer:'ANGLE (Google, SwiftShader Device, Vulkan)'}).kind,'software');
  for(const renderer of ['SwiftShader','llvmpipe','Microsoft Basic Render Driver','ANGLE',''])
    assert.throws(()=>assertBrowserBackend('native',{renderer}),/not established/);
  for(const renderer of ['ANGLE (Qualcomm, Adreno, D3D11)','llvmpipe',''])
    assert.throws(()=>assertBrowserBackend('swiftshader',{renderer}),/not established/);
});

test('capability receipt reads the existing app context without allocating a fixture context',()=>{
  const calls=[],values={renderer:'Adreno D3D11',vendor:'Qualcomm',version:'WebGL 2',glsl:'GLSL ES3',texture:8192,renderbuffer:8192,viewport:[8192,8192],units:32};
  const gl={RENDERER:'renderer',VENDOR:'vendor',VERSION:'version',SHADING_LANGUAGE_VERSION:'glsl',MAX_TEXTURE_SIZE:'texture',MAX_RENDERBUFFER_SIZE:'renderbuffer',MAX_VIEWPORT_DIMS:'viewport',MAX_COMBINED_TEXTURE_IMAGE_UNITS:'units',
    isContextLost:()=>false,getExtension:()=>({UNMASKED_RENDERER_WEBGL:'renderer',UNMASKED_VENDOR_WEBGL:'vendor'}),
    getParameter:key=>values[key],getContextAttributes:()=>({alpha:false}),getSupportedExtensions:()=>['KHR_parallel_shader_compile','EXT_color_buffer_float']};
  const canvas={width:732,height:612,getContext:name=>{calls.push(name);return gl;}};
  const context=vm.createContext({performance:{now:()=>123},document:{getElementById:id=>{assert.equal(id,'orreryCanvas');return canvas;}}});
  const result=vm.runInContext(`(${captureBrowserCapabilities.toString()})()`,context);
  assert.deepEqual(calls,['webgl2']);assert.equal(result.renderer,'Adreno D3D11');assert.equal(result.unmasked_identity,true);
  assert.equal(result.canvas.width,732);assert.equal(result.max_texture_size,8192);assert.equal(result.observed_ms,123);
  gl.isContextLost=()=>true;assert.throws(()=>vm.runInContext(`(${captureBrowserCapabilities.toString()})()`,context),/unavailable/);
});


test('software fallback is an explicit opt-in and retains both existing backend defaults',()=>{
  assert.throws(()=>browserBackendFromArgs(['--backend=swiftshader-fallback']),/Unsupported/);
  assert.equal(browserBackendFromArgs(['--backend=swiftshader-fallback'],{allowSoftwareFallback:true}),'swiftshader-fallback');
  assert.deepEqual(browserBackendArgs('swiftshader-fallback'),['--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']);
  assert.deepEqual(backendPolicy.sunLookProbeResolutions('swiftshader-fallback'),[1024]);
});
const fallbackFeatures=()=>({gpu_compositing:'disabled_software',rasterization:'disabled_software','2d_canvas':'unavailable_software'});
test('software fallback requires the actual app renderer and browser compositor/raster readback',()=>{
  const capabilities={renderer:'ANGLE (Google, SwiftShader Device, Vulkan)',browser_feature_status:fallbackFeatures()};
  assert.equal(assertBrowserBackend('swiftshader-fallback',capabilities).kind,'software');
  for(const feature of ['gpu_compositing','rasterization','2d_canvas']){
    const status={...fallbackFeatures(),[feature]:'enabled'};
    assert.throws(()=>assertBrowserBackend('swiftshader-fallback',{...capabilities,browser_feature_status:status}),/software fallback/);
  }
  for(const status of [undefined,{},null])assert.throws(()=>assertBrowserBackend('swiftshader-fallback',{...capabilities,browser_feature_status:status}),/software fallback/);
  assert.throws(()=>assertBrowserBackend('swiftshader-fallback',{...capabilities,renderer:'ANGLE (Qualcomm, Adreno D3D11)'}),/not established/);
});
test('browser feature receipt uses the browser target, detaches and never warms legacy modes',async()=>{
  const calls=[],capabilities={renderer:'SwiftShader'};
  const browser={target:()=>({createCDPSession:async()=>({send:async(method)=>{calls.push(method);return {gpu:{featureStatus:fallbackFeatures()}};},detach:async()=>calls.push('detach')})})};
  assert.equal(await backendPolicy.withBrowserFeatureStatus('native',browser,capabilities),capabilities);
  assert.equal(await backendPolicy.withBrowserFeatureStatus('swiftshader',browser,capabilities),capabilities);
  assert.deepEqual(calls,[]);
  const result=await backendPolicy.withBrowserFeatureStatus('swiftshader-fallback',browser,capabilities);
  assert.deepEqual(result.browser_feature_status,fallbackFeatures());assert.equal(result.renderer,'SwiftShader');
  assert.deepEqual(calls,['SystemInfo.getInfo','detach']);assert.equal(capabilities.browser_feature_status,undefined);
});
test('browser feature failures detach their owner and remain failures',async()=>{
  let detached=0;
  const browser={target:()=>({createCDPSession:async()=>({send:async()=>{throw Error('controlled feature read failure');},detach:async()=>{detached++;}})})};
  await assert.rejects(()=>backendPolicy.withBrowserFeatureStatus('swiftshader-fallback',browser,{}),/controlled feature read failure/);assert.equal(detached,1);
  const noStatus={target:()=>({createCDPSession:async()=>({send:async()=>({gpu:{}}),detach:async()=>{detached++;}})})};
  await assert.rejects(()=>backendPolicy.withBrowserFeatureStatus('swiftshader-fallback',noStatus,{}),/feature status/);assert.equal(detached,2);
});


test('browser feature readback retains concurrent cleanup errors including falsy read failures',async()=>{
  const browser={target:()=>({createCDPSession:async()=>({send:async()=>{throw 0;},detach:async()=>{throw Error('controlled detach failure');}})})};
  await assert.rejects(()=>backendPolicy.withBrowserFeatureStatus('swiftshader-fallback',browser,{}),error=>{
    assert.ok(error instanceof AggregateError);assert.equal(error.errors[0],0);assert.match(String(error.errors[1]),/detach failure/);return true;
  });
  const detachOnly={target:()=>({createCDPSession:async()=>({send:async()=>({gpu:{featureStatus:fallbackFeatures()}}),detach:async()=>{throw Error('controlled detach failure');}})})};
  await assert.rejects(()=>backendPolicy.withBrowserFeatureStatus('swiftshader-fallback',detachOnly,{}),/detach failure/);
});


test('explicit browser feature readback captures all execution paths without mutating inputs',async()=>{
  assert.equal(typeof backendPolicy.readBrowserFeatureStatus,'function');
  for(const status of [fallbackFeatures(),{gpu_compositing:'enabled',rasterization:'enabled','2d_canvas':'enabled'}]){
    const calls=[],capabilities={renderer:'existing app renderer'};
    const browser={target:()=>({createCDPSession:async()=>({send:async method=>{calls.push(method);return {gpu:{featureStatus:status}};},detach:async()=>calls.push('detach')})})};
    const value=await backendPolicy.readBrowserFeatureStatus(browser,capabilities);
    assert.deepEqual(value.browser_feature_status,status);assert.notEqual(value.browser_feature_status,status);
    assert.equal(value.renderer,capabilities.renderer);assert.equal(capabilities.browser_feature_status,undefined);
    assert.deepEqual(calls,['SystemInfo.getInfo','detach']);
  }
});

test('explicit graphics readback rejects missing or malformed execution fields and detaches',async()=>{
  assert.equal(typeof backendPolicy.readBrowserFeatureStatus,'function');
  for(const status of [undefined,null,[],{},...Object.keys(fallbackFeatures()).flatMap(key=>[
    {...fallbackFeatures(),[key]:undefined},{...fallbackFeatures(),[key]:''},{...fallbackFeatures(),[key]:42},
  ])]){
    let detached=0;
    const browser={target:()=>({createCDPSession:async()=>({send:async()=>({gpu:{featureStatus:status}}),detach:async()=>{detached++;}})})};
    await assert.rejects(()=>backendPolicy.readBrowserFeatureStatus(browser,{}),/feature status/);
    assert.equal(detached,1);
  }
});

test('explicit graphics readback keeps falsy read failures and simultaneous detach failure',async()=>{
  assert.equal(typeof backendPolicy.readBrowserFeatureStatus,'function');
  for(const value of [undefined,null,false,0,'']){
    const browser={target:()=>({createCDPSession:async()=>({send:async()=>{throw value;},detach:async()=>{throw Error('detach failed');}})})};
    await assert.rejects(()=>backendPolicy.readBrowserFeatureStatus(browser,{}),error=>{
      assert.ok(error instanceof AggregateError);assert.equal(error.errors[0],value);assert.match(String(error.errors[1]),/detach failed/);return true;
    });
  }
});

test('actual startup readback records all-mode topology after the retained feedback read',async()=>{
  const source=fs.readFileSync(new URL('../../tools/startup_profile.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const start=source.indexOf('      run.gpu=await '),end=source.indexOf('      for(const operation of run.wasm)',start);
  assert.ok(start>source.indexOf('      Object.assign(run,observed);')&&end>start);
  // Execute the actual profiler readback/renderer-admission statements. The
  // expensive measured actions precede this boundary; I/O is a browser stub.
  for(const backend of ['native','swiftshader','swiftshader-fallback']){
    const calls=[],status=backend==='swiftshader-fallback'?fallbackFeatures():{gpu_compositing:'enabled',rasterization:'enabled','2d_canvas':'enabled'};
    const capabilities={renderer:backend==='native'?'ANGLE (Qualcomm, Adreno D3D11)':'ANGLE (Google, SwiftShader Device, Vulkan)'};
    const browser={target:()=>({createCDPSession:async()=>({send:async method=>{calls.push(method);return {gpu:{featureStatus:status}};},detach:async()=>calls.push('detach')})})};
    const run={},context=vm.createContext({assert,backend,browser,run,expectedRenderer:capabilities.renderer,
      page:{evaluate:async fn=>{assert.equal(fn,captureBrowserCapabilities);calls.push('read-app-context');return capabilities;}},
      captureBrowserCapabilities,assertBrowserBackend,...backendPolicy});
    await vm.runInContext('(async()=>{'+source.slice(start,end)+'})()',context);
    assert.deepEqual(run.gpu.browser_feature_status,status);
    assert.deepEqual(calls,['read-app-context','SystemInfo.getInfo','detach']);
  }
});
