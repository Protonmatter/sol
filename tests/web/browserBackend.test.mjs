import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {browserBackendFromArgs,browserBackendArgs,assertBrowserBackend,captureBrowserCapabilities} from '../../tools/browser_backend.mjs';

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
