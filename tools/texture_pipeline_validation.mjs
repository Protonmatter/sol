#!/usr/bin/env node
// Local texture qualification. Replays the pinned renderer upload function and
// separately observes real application cache ownership. Never acquires sources.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import puppeteer from 'puppeteer-core';
import {PNG} from 'pngjs';
import {createStagedPreviewServer} from './staged_preview_server.mjs';
import {closeOwnedBrowser} from './worker_coverage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const dimension = n => Number.isSafeInteger(n) && n > 0;

export function texturePayloadEstimate(width, height, mipmapped) {
  assert.ok(dimension(width) && dimension(height) && Number.isSafeInteger(width * height * 8), 'Invalid or unsafe texture dimensions');
  const base = width * height * 4;
  let total = base, levels = 1, w = width, h = height;
  while (mipmapped && (w > 1 || h > 1)) {
    w = Math.max(1, Math.floor(w / 2)); h = Math.max(1, Math.floor(h / 2));
    total += w * h * 4; levels++;
  }
  return {basis:'RGBA8 texel payload estimate; not observed VRAM or browser memory',
    width,height,bytes_per_texel:4,mip_levels:levels,base_bytes:base,mip_bytes:total-base,total_bytes:total};
}

export function projectUploadDimensions(dimensions, maxSize, palette) {
  assert.ok(Array.isArray(dimensions) && dimensions.length === 2 && dimensions.every(dimension), 'Invalid texture dimensions');
  assert.ok(dimension(maxSize), 'Invalid device texture limit');
  if (Math.max(...dimensions) <= maxSize) return [...dimensions];
  assert.ok(!palette, 'Device cannot preserve the scientific palette grid');
  const ratio = maxSize / Math.max(...dimensions);
  return dimensions.map(n => Math.max(1, Math.floor(n * ratio)));
}

export function createTextureFixtures() {
  return [
    {id:'gray-step',width:2,height:1,pixels:[0,0,0,255,255,255,255,255]},
    {id:'alpha-edge',width:2,height:1,pixels:[64,128,224,255,255,0,255,0],premultiply:true},
    {id:'palette',width:2,height:1,pixels:[20,100,220,255,240,40,60,255],nearest:true},
    {id:'gray-checker',width:2,height:2,pixels:[0,0,0,255,255,255,255,255,255,255,255,255,0,0,0,255]},
  ].map(({pixels,...fixture}) => {
    const png = new PNG({width:fixture.width,height:fixture.height}); png.data.set(pixels);
    return {...fixture,bytes:PNG.sync.write(png)};
  });
}

function relativePath(value, label = 'path') {
  assert.ok(typeof value === 'string' && value.length > 0 && !value.includes('\\')
    && !value.includes('%') && !value.includes(':') && !value.startsWith('/')
    && value.split('/').every(part => part && part !== '.' && part !== '..'), `Invalid ${label}`);
  return value;
}

export function readTextureStage(webRoot) {
  const root = fs.realpathSync(webRoot);
  const manifestBytes = fs.readFileSync(path.join(root,'web-release-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.schema_version,'web-release-manifest.v1');
  assert.equal(typeof manifest.namespace,'string','Invalid release namespace');
  const namespace = relativePath(manifest.namespace.replace(/\/$/,''),'release namespace');
  assert.ok(typeof manifest.base_path==='string' && /^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(manifest.base_path)
    && manifest.base_path.split('/').every(part=>part!=='.'&&part!=='..'),'Invalid release base path');
  assert.ok(Array.isArray(manifest.assets),'Release assets missing');
  const listed = new Map();
  for (const asset of manifest.assets) {
    relativePath(asset.path);
    assert.ok(!listed.has(asset.path),`Duplicate release path: ${asset.path}`);
    listed.set(asset.path,asset);
    // The later lifecycle pass executes the staged application, so bind every
    // served release file, including WASM and modules outside the texture slice.
    const file=fs.realpathSync(path.join(root,asset.path));
    assert.ok(file.startsWith(root+path.sep),'Staged path escapes root');
    const bytes=fs.readFileSync(file);
    assert.equal(bytes.length,asset.size,`Staged size mismatch: ${asset.path}`);
    assert.equal(digest(bytes),asset.sha256,`Staged hash mismatch: ${asset.path}`);
  }
  function read(relative) {
    const name = `${namespace}/${relativePath(relative)}`, entry = listed.get(name);
    assert.ok(entry,`${relative} is absent from selected release`);
    const file = fs.realpathSync(path.join(root,name));
    assert.ok(file.startsWith(root + path.sep),'Staged path escapes root');
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.length,entry.size,`Staged size mismatch: ${name}`);
    assert.equal(digest(bytes),entry.sha256,`Staged hash mismatch: ${name}`);
    return bytes;
  }
  const renderer = read('js/orrery.js'), demand = read('js/referenceDemand.js');
  const upload = renderer.toString('utf8').match(/function makeTexture\(img, repeatS, nearest = false, premultiplyAlpha = false\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(upload,'Pinned makeTexture function signature unavailable; review the harness before replay');
  const visualBytes = read('visual-assets.v1.json'), visual = JSON.parse(visualBytes);
  assert.equal(visual.schema_version,'visual-assets.v1');
  assert.ok(Array.isArray(visual.mapped_references),'Mapped reference inventory missing');
  const ids = new Set();
  const assets = visual.mapped_references.map(asset => {
    assert.ok(typeof asset.id === 'string' && !ids.has(asset.id),'Duplicate or invalid reference id'); ids.add(asset.id);
    texturePayloadEstimate(...asset.dimensions,false);
    const bytes = read(asset.path);
    assert.equal(bytes.length,asset.bytes,`Image size mismatch: ${asset.id}`);
    assert.equal(digest(bytes),asset.sha256,`Image hash mismatch: ${asset.id}`);
    return {id:asset.id,body:asset.body,role:asset.role,path:asset.path,sha256:asset.sha256,
      source_sha256:asset.source_sha256 ?? null,encoded_bytes:bytes.length,dimensions:asset.dimensions,
      color_interpretation:asset.color_interpretation,nodata:asset.nodata,size_verified:true,
      nearest:asset.role === 'sea-ice',premultiply:asset.nodata === 'alpha' && asset.role !== 'sea-ice'};
  });
  const policy = name => {
    const value = Number(demand.toString('utf8').match(new RegExp(`export const ${name} = (\\d+);`))?.[1]);
    assert.ok(dimension(value),`Cache policy ${name} unavailable`); return value;
  };
  return {root,manifest,namespace,upload,assets,renderer_sha256:digest(renderer),upload_sha256:digest(upload),
    demand_sha256:digest(demand),visual_inventory_sha256:digest(visualBytes),release_manifest_sha256:digest(manifestBytes),
    cache_policy:{ready_capacity:policy('MAX_REFERENCE_TEXTURES'),concurrent_requests:policy('MAX_REFERENCE_REQUESTS')}};
}

export function summarizeTextureSamples(samples) {
  const groups = new Map();
  const stats = values => {
    const sorted = [...values].sort((a,b) => a-b), count = sorted.length;
    return count ? {count,min:sorted[0],median:count % 2 ? sorted[(count-1)/2] : (sorted[count/2-1]+sorted[count/2])/2,max:sorted[count-1]} : null;
  };
  for (const sample of samples) {
    const key = `${sample.id}:${sample.phase}`;
    if (!groups.has(key)) groups.set(key,[]);
    if (!sample.error) for (const name of ['decode_api_ms','upload_api_ms','mipmap_api_ms'])
      assert.ok(Number.isFinite(sample[name]) && sample[name] >= 0,`Nonfinite or negative timing ${name}`);
    if(!sample.error&&sample.completion?.status==='signaled')assert.ok(Number.isFinite(sample.completion.wait_wall_ms)
      &&sample.completion.wait_wall_ms>=0,'Nonfinite or negative completion timing');
    groups.get(key).push(sample);
  }
  return [...groups.values()].map(group => {
    const valid = group.filter(s => !s.error && s.completion?.status === 'signaled');
    return {id:group[0].id,phase:group[0].phase,successful_samples:valid.length,failed_samples:group.length-valid.length,
      decode_api_ms:stats(valid.map(s => s.decode_api_ms)),upload_api_ms:stats(valid.map(s => s.upload_api_ms)),
      mipmap_api_ms:stats(valid.map(s => s.mipmap_api_ms)),completion_wait_wall_ms:stats(valid.map(s => s.completion.wait_wall_ms))};
  });
}

// Self-contained because Puppeteer serializes this function into a local page.
async function initializeReplay(upload) {
  const canvas = document.querySelector('canvas');
  const gl = canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true});
  if (!gl) throw new Error('WebGL2 unavailable');
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const extensions=gl.getSupportedExtensions()||[];
  const compression=extensions.filter(name=>/^(WEBGL_compressed_texture_|EXT_texture_compression_)/.test(name))
    .map(name=>({name,enabled:!!gl.getExtension(name)}));
  const capabilities = {
    renderer:debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor:debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    version:gl.getParameter(gl.VERSION),max_texture_size:gl.getParameter(gl.MAX_TEXTURE_SIZE),
    max_texture_units:gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    context_attributes:gl.getContextAttributes(),drawing_buffer_color_space:gl.drawingBufferColorSpace ?? null,
    unpack_color_space:gl.unpackColorSpace ?? null,timer_query:!!timer,
    compressed_texture_extensions:compression,
    compressed_texture_formats:Array.from(gl.getParameter(gl.COMPRESSED_TEXTURE_FORMATS)),extensions,
  };
  function compile(type, source) {
    const shader = gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  const program = gl.createProgram();
  for (const [type,source] of [[gl.VERTEX_SHADER,`#version 300 es
    void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0,1);}`],
  [gl.FRAGMENT_SHADER,`#version 300 es
    precision highp float;uniform sampler2D image;uniform vec2 uv;uniform float lod;
    uniform bool recover;out vec4 color;
    void main(){color=textureLod(image,uv,lod);if(recover&&color.a>0.0)color.rgb/=color.a;}`]]) {
    const shader=compile(type,source);gl.attachShader(program,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);gl.bindVertexArray(gl.createVertexArray());gl.disable(gl.DITHER);gl.disable(gl.BLEND);gl.viewport(0,0,1,1);
  const locations=Object.fromEntries(['image','uv','lod','recover'].map(name=>[name,gl.getUniformLocation(program,name)]));
  const pixels=(texture,uv=[.5,.5],lod=0,recover=false)=>{
    gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(locations.image,0);gl.uniform2fv(locations.uv,uv);
    gl.uniform1f(locations.lod,lod);gl.uniform1i(locations.recover,Number(recover));
    const start=performance.now();gl.drawArrays(gl.TRIANGLES,0,3);const draw_api_ms=performance.now()-start;
    const out=new Uint8Array(4),read=performance.now();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,out);
    return {rgba:Array.from(out),draw_api_ms,readback_completion_wall_ms:performance.now()-read};
  };
  async function completion() {
    const start=performance.now(),sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
    if(!sync)return {status:'unavailable',wait_wall_ms:performance.now()-start,polls:0};
    gl.flush();let polls=0,status='timeout';
    try {
      while(performance.now()-start<10000){
        // Yield before probing; browsers need an event-loop turn to publish signaled state.
        await new Promise(resolve=>setTimeout(resolve,1));polls++;
        const value=gl.clientWaitSync(sync,0,0);
        if(value===gl.ALREADY_SIGNALED||value===gl.CONDITION_SATISFIED){status='signaled';break;}
        if(value===gl.WAIT_FAILED||gl.isContextLost()){status='failed';break;}
      }
      return {status,wait_wall_ms:performance.now()-start,polls,
        meaning:'Wall time until upload/mipmap fence is observed; includes polling/scheduling, not GPU execution time'};
    } finally {gl.deleteSync(sync);}
  }
  window.textureReplay=async ({asset,url,phase,iteration=0,uv,lod=0,recover=false,deviceLimit=null})=>{
    const result={id:asset.id,phase,iteration,error:null,decode_api_ms:0,upload_api_ms:0,mipmap_api_ms:0,
      resize_api_ms:0,resize_calls:[],get_error_api_ms:0,source_dimensions:null,uploaded_dimensions:null,
      simulated_max_texture_size:deviceLimit,completion:null,gpu_elapsed:null};
    let objectUrl,image,texture,query;
    try {
      const fetchStart=performance.now();
      const response=await fetch(url,{redirect:'error'});if(!response.ok)throw new Error(`Local image HTTP ${response.status}`);
      const bytes=await response.arrayBuffer();result.local_fetch_body_ms=performance.now()-fetchStart;
      const hashStart=performance.now();
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
      result.hash_api_ms=performance.now()-hashStart;result.observed_sha256=hash;result.encoded_bytes=bytes.byteLength;
      if(asset.sha256&&hash!==asset.sha256)throw new Error('Decoded input hash differs from pinned source');
      objectUrl=URL.createObjectURL(new Blob([bytes],{type:response.headers.get('content-type')||'image/png'}));
      image=new Image();image.src=objectUrl;
      const decodeStart=performance.now();await image.decode();result.decode_api_ms=performance.now()-decodeStart;
      result.source_dimensions=[image.naturalWidth,image.naturalHeight];
      if(asset.dimensions&&result.source_dimensions.some((v,i)=>v!==asset.dimensions[i]))throw new Error('Decoded dimensions differ from pinned source');
      const proxy=new Proxy(gl,{get(target,name){
        if(name==='getParameter')return parameter=>parameter===gl.MAX_TEXTURE_SIZE&&deviceLimit!==null?deviceLimit:gl.getParameter(parameter);
        if(['texImage2D','generateMipmap','getError'].includes(name))return (...args)=>{
          if(name==='texImage2D'){
              const source=args[5];result.uploaded_dimensions=[source.width,source.height];
              result.unpack={flip_y:gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premultiply_alpha:gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
                colorspace_conversion:gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL),alignment:gl.getParameter(gl.UNPACK_ALIGNMENT),
                internal_format:args[2],format:args[3],type:args[4],source_kind:source.constructor.name};
          }
          const start=performance.now();try {
            return target[name](...args);
          } finally {result[{texImage2D:'upload_api_ms',generateMipmap:'mipmap_api_ms',getError:'get_error_api_ms'}[name]]+=performance.now()-start;}
        };
        const value=target[name];return typeof value==='function'?value.bind(target):value;
      }});
      const documentProxy={createElement(name){
        const node=document.createElement(name),get=node.getContext.bind(node);
        node.getContext=(type,...args)=>{
          const ctx=get(type,...args);if(!ctx||type!=='2d')return ctx;
          const draw=ctx.drawImage.bind(ctx);
          ctx.drawImage=(...values)=>{const start=performance.now();try{return draw(...values);}finally{
            const elapsed=performance.now()-start;result.resize_api_ms+=elapsed;
            result.resize_calls.push({width:node.width,height:node.height,draw_image_api_ms:elapsed,
              image_smoothing_enabled:ctx.imageSmoothingEnabled,image_smoothing_quality:ctx.imageSmoothingQuality,
              color_space:ctx.getContextAttributes?.().colorSpace??null});
          }};return ctx;
        };return node;
      }};
      const make=new Function('gl','document',`${upload};return makeTexture;`)(proxy,documentProxy);
      const drain=performance.now();gl.finish();result.preceding_finish_wall_ms=performance.now()-drain;
      if(timer){query=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,query);}
      const start=performance.now();
      try{texture=make(image,true,!!asset.nearest,!!asset.premultiply);}finally{
        result.factory_api_ms=performance.now()-start;if(query)gl.endQuery(timer.TIME_ELAPSED_EXT);
      }
      result.filters={min:gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER),mag:gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER),
        wrap_s:gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S),wrap_t:gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T)};
      result.completion=await completion();
      if(query){const disjoint=gl.getParameter(timer.GPU_DISJOINT_EXT),available=gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE);
        result.gpu_elapsed={status:disjoint?'disjoint':available?'available':'unavailable',nanoseconds:!disjoint&&available?gl.getQueryParameter(query,gl.QUERY_RESULT):null,
          scope:'Driver timer query brackets makeTexture, including any resize-related delays and its error query; not isolated upload/mip time'};
      }else result.gpu_elapsed={status:'unsupported',nanoseconds:null};
      result.first_sample=pixels(texture,uv,lod,recover);
      result.gl_error=gl.getError();if(result.gl_error!==gl.NO_ERROR)throw new Error(`Replay GL error ${result.gl_error}`);
      result.resource_timing=performance.getEntriesByName(url).slice(-1).map(entry=>({duration:entry.duration,transfer_size:entry.transferSize,
        encoded_body_size:entry.encodedBodySize,decoded_body_size:entry.decodedBodySize}))[0]??null;
    }catch(error){result.error=error.message;}
    finally{if(query)gl.deleteQuery(query);if(texture)gl.deleteTexture(texture);if(image)image.src='';if(objectUrl)URL.revokeObjectURL(objectUrl);}
    return result;
  };
  return capabilities;
}

function observeApplicationTextures() {
  const ledger={textures:[],images:[],resizes:[],observed_gl_errors:[],peak_live_mapped_handles:0};
  const ids=new WeakMap(),imageIds=new WeakMap(),canvasSource=new WeakMap();
  const raw=WebGL2RenderingContext.prototype;
  const sourceOf=source=>source instanceof HTMLImageElement?source.currentSrc||source.src:canvasSource.get(source)||null;
  const src=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
  Object.defineProperty(HTMLImageElement.prototype,'src',{...src,set(value){
    if(value){
      const record={id:ledger.images.length+1,url:new URL(value,document.baseURI).href,started_ms:performance.now(),status:'pending'};
      ledger.images.push(record);imageIds.set(this,record);
      const done=status=>{if(imageIds.get(this)!==record)return;record.status=status;record.load_decode_wall_ms=performance.now()-record.started_ms;
        record.dimensions=[this.naturalWidth,this.naturalHeight];};
      this.addEventListener('load',()=>done('loaded'),{once:true});this.addEventListener('error',()=>done('error'),{once:true});
    }else{
      const record=imageIds.get(this);if(record?.status==='pending'){record.status='cancelled';record.cancelled_ms=performance.now();}
      imageIds.delete(this);
    }
    src.set.call(this,value);
  }});
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(...args){
    const source=sourceOf(args[0]);if(source)canvasSource.set(this.canvas,source);
    const start=performance.now();try{return draw.apply(this,args);}finally{
      if(source)ledger.resizes.push({source,width:this.canvas.width,height:this.canvas.height,cpu_api_ms:performance.now()-start,
        smoothing:this.imageSmoothingEnabled,smoothing_quality:this.imageSmoothingQuality});
    }
  };
  const create=raw.createTexture,remove=raw.deleteTexture,upload=raw.texImage2D,mip=raw.generateMipmap,error=raw.getError;
  raw.createTexture=function(){const texture=create.call(this);if(texture){const record={id:ledger.textures.length+1,canvas_id:this.canvas.id,deleted:false,uploads:[]};
    ids.set(texture,record);ledger.textures.push(record);}return texture;};
  raw.deleteTexture=function(texture){const record=ids.get(texture);if(record){record.deleted=true;record.deleted_ms=performance.now();}return remove.call(this,texture);};
  raw.texImage2D=function(...args){
    const record=ids.get(this.getParameter(this.TEXTURE_BINDING_2D)),source=args.length===6?args[5]:null;
    const data={source:source?sourceOf(source):null,dimensions:source?[source.width,source.height]:[args[3],args[4]],
      level:args[1],internal_format:args[2],format:source?args[3]:args[6],type:source?args[4]:args[7],
      unpack:{flip_y:this.getParameter(this.UNPACK_FLIP_Y_WEBGL),premultiply_alpha:this.getParameter(this.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
        colorspace_conversion:this.getParameter(this.UNPACK_COLORSPACE_CONVERSION_WEBGL),alignment:this.getParameter(this.UNPACK_ALIGNMENT)}};
    const start=performance.now();try{return upload.apply(this,args);}finally{
      data.cpu_api_ms=performance.now()-start;if(record){record.uploads.push(data);record.source=data.source;}
      const live=ledger.textures.filter(t=>!t.deleted&&t.source?.includes('/textures/reference/')).length;
      ledger.peak_live_mapped_handles=Math.max(ledger.peak_live_mapped_handles,live);
    }
  };
  raw.generateMipmap=function(...args){const record=ids.get(this.getParameter(this.TEXTURE_BINDING_2D)),start=performance.now();
    try{return mip.apply(this,args);}finally{if(record){record.mipmapped=true;record.mipmap_api_ms=(record.mipmap_api_ms||0)+performance.now()-start;}}};
  raw.getError=function(){const result=error.call(this);if(result!==this.NO_ERROR)ledger.observed_gl_errors.push(result);return result;};
  window.__textureLedger=ledger;
}

async function applicationLifecycle(browser, origin, stage, checkpoint) {
  const page=await browser.newPage(),snapshots=[],errors=[];
  let phase='navigation';
  try {
    // Match browser_validation.mjs: page-scoped Fetch interception can strand
    // module-worker imports before the existing 10-second engine deadline.
    await localOnly(page,origin,false);await page.setViewport({width:1280,height:900});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.evaluateOnNewDocument(observeApplicationTextures);
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+stage.manifest.base_path,{waitUntil:'networkidle0',timeout:45000});
    phase='enter-system';
    await page.click('[data-mode="orrery"]');
    await page.waitForFunction(async()=>{
      const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
      const {store}=await import('./js/store.js'+q);return store.orrery.bodies.length===9||!!store.orrery.engineError;
    },{timeout:30000,polling:100});
    await page.evaluate(()=>{for(const id of ['orreryAnimate','orreryOptics','orreryTerrain']){const node=document.getElementById(id);
      if(node){node.checked=false;node.dispatchEvent(new Event('change'));}}});
    const settle=()=>page.waitForFunction(async()=>{
      const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
      const {store}=await import('./js/store.js'+q),s=store.orrery;
      return !!s.engineError||(s.bodies?.length===9&&Object.values(s.appearanceStatus).every(value=>value!=='loading'&&value!=='queued'));
    },{timeout:40000,polling:100});
    const snapshot=async label=>{
      const sample=await page.evaluate(async()=>{
        const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
        const {store}=await import('./js/store.js'+q),s=store.orrery;
        return {anchor:s.anchor,active:s.active,appearance_status:{...s.appearanceStatus},engine_error:s.engineError,
          ledger:structuredClone(window.__textureLedger)};
      });
      assert.equal(sample.engine_error,'','Application ephemeris error');
      const states=Object.values(sample.appearance_status);
      assert.ok(states.filter(s=>s==='ready').length<=stage.cache_policy.ready_capacity,'Ready cache exceeds policy');
      assert.ok(states.filter(s=>s==='loading').length<=stage.cache_policy.concurrent_requests,'Request count exceeds policy');
      assert.ok(!states.includes('unavailable'),'Mapped image unavailable in lifecycle tour');
      const uploads=sample.ledger.textures.flatMap(t=>t.uploads).filter(u=>u.source?.includes('/textures/reference/')).length;
      const mapped=sample.ledger.textures.filter(t=>t.source?.includes('/textures/reference/'));
      const live=mapped.filter(t=>!t.deleted);
      const payload=live.reduce((total,t)=>{const size=t.uploads.at(-1).dimensions;return total+texturePayloadEstimate(...size,!!t.mipmapped).total_bytes;},0);
      snapshots.push({label,anchor:sample.anchor,active:sample.active,appearance_status:sample.appearance_status,
        observed_mapped_uploads:uploads,observed_live_mapped_handles:live.length,observed_deleted_mapped_handles:mapped.length-live.length,
        estimated_live_rgba8_bytes:payload,estimate_basis:'Submitted dimensions plus mip chain; not observed VRAM',
        mapped_images_pending:sample.ledger.images.filter(i=>i.status==='pending'&&i.url.includes('/textures/reference/')).length});
      checkpoint({status:'running',phase,snapshots});
      return sample;
    };
    phase='earth-first-demand';await page.select('#orreryAnchor','Earth');await snapshot('earth-demand-requested');await settle();await snapshot('earth-first-demand');
    const initialUploads=snapshots.at(-1).observed_mapped_uploads;
    phase='leave-system';
    await page.click('[data-mode="sky"]');await snapshot('left-system-ready-cache');
    phase='warm-reentry';
    await page.click('[data-mode="orrery"]');await settle();await snapshot('earth-warm-reentry');
    assert.equal(initialUploads,snapshots.at(-1).observed_mapped_uploads,'Warm reentry uploaded a ready map again');
    for(const body of ['Mercury','Venus','Moon','Mars','Jupiter','Saturn','Uranus','Neptune','Earth']){
      phase=`tour-${body.toLowerCase()}`;
      await page.select('#orreryAnchor',body);await settle();await snapshot(`tour-${body.toLowerCase()}`);
    }
    const final=await snapshot('tour-complete');
    assert.ok(final.ledger.peak_live_mapped_handles<=stage.cache_policy.ready_capacity,'Transient texture cache exceeds policy');
    assert.ok(snapshots.at(-1).observed_deleted_mapped_handles>0,'Tour failed to exercise eviction');
    assert.deepEqual(errors,[],'Application page errors');assert.deepEqual(final.ledger.observed_gl_errors,[],'Application GL errors');
    return {scope:'Real staged mapped-image demand, warm reentry and eviction; terrain/optics/animation controls disabled during tour',
      cache_precondition:'New application page/context resources; browser HTTP image entries are warm from the preceding replay',
      image_timing_meaning:'Image src to load event includes fetch, decoder scheduling and decode; no pure decode or GPU timing claim',
      snapshots,ledger:final.ledger,errors};
  }catch(error){
    let diagnostic;
    try{diagnostic=await page.evaluate(async()=>{
      const script=document.querySelector('script[type="module"][src^="app.js"]');
      const q=script?new URL(script.src).search:'';
      const {store}=await import('./js/store.js'+q),s=store.orrery;
      return {url:location.href,anchor:s.anchor,active:s.active,animate:s.animate,body_count:s.bodies?.length,
        engine_error:s.engineError,appearance_status:{...s.appearanceStatus},ledger:window.__textureLedger};
    });}catch(readError){diagnostic={read_error:readError.message};}
    checkpoint({status:'failed',phase,snapshots,errors:[...errors,error.message],diagnostic});throw error;
  }finally{await page.close();}
}

async function localOnly(page, origin, intercept=true) {
  await page.setBypassServiceWorker(true);
  if(intercept){
    await page.setRequestInterception(true);
    page.on('request',request=>{
      const url=new URL(request.url());
      if(url.origin===origin||url.protocol==='blob:'||url.protocol==='data:')void request.continue();else void request.abort('blockedbyclient');
    });
  }
  const cdp=await page.createCDPSession();await cdp.send('Network.enable');
  await cdp.send('Network.setBlockedURLs',{urls:['https://*','http://localhost/*']});
  return cdp;
}

export async function runTextureQualification({webRoot=path.join(ROOT,'build/site-review'),out=path.join(ROOT,'coverage/texture-pipeline'),
  browserPath=process.env.CHROME_BIN||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/google-chrome'),
  gpu='software',iterations=1,inventoryOnly=false}={}) {
  assert.ok(['software','native'].includes(gpu),'GPU must be software or native');
  assert.ok(Number.isInteger(iterations)&&iterations>=1&&iterations<=5,'Iterations must be in [1,5]');
  const stage=readTextureStage(webRoot),fixtures=createTextureFixtures();
  const evidence={schema_version:'texture-pipeline-validation.v1',started_at:new Date().toISOString(),
    harness_sha256:digest(fs.readFileSync(fileURLToPath(import.meta.url))),
    execution_context:{node_version:process.version,platform:process.platform,architecture:process.arch,host_idle_verified:false,
      competing_cpu_work:'Not measured by this tool; execution notes must describe concurrent host activity'},
    web_root:stage.root,release_namespace:stage.manifest.namespace,release_manifest_sha256:stage.release_manifest_sha256,
    manifest_base_revision:stage.manifest.source_sha,renderer_sha256:stage.renderer_sha256,upload_sha256:stage.upload_sha256,
    visual_inventory_sha256:stage.visual_inventory_sha256,demand_sha256:stage.demand_sha256,cache_policy:stage.cache_policy,
    source_binding:'Staged file hashes identify replay inputs. HEAD lineage alone does not attest uncommitted source.',
    measurement_scope:'Local encoded source images and exact makeTexture replay, followed by separate application lifecycle observation',
    limitations:['RGBA8 accounting is a texel payload estimate, never observed VRAM or total browser memory.',
      'Cold browser cache excludes browser HTTP entries only; OS file cache, driver, process and decoder code are not cold.',
      'Warm browser cache is a controlled fetch-cache phase; observed transfer sizes, not the phase name, indicate actual cache delivery.',
      'Blob Image.decode wall time includes browser scheduling and color/decode work; it is not a decoder-only CPU profile.',
      'WebGL API wall time may include internal synchronization; a fence wait is completion observation, not execution time.',
      'First sample includes a trivial draw plus readPixels completion; shader compilation is completed separately.',
      'Software results do not qualify native GPU speed or memory; instrumentation perturbs CPU timings.'],
    requested_gpu:gpu,iterations,assets:stage.assets,fixtures:fixtures.map(({bytes,...f})=>({...f,sha256:digest(bytes)})),
    samples:[],filter_checks:[],errors:[],status:inventoryOnly?'inventory-only':'running'};
  fs.mkdirSync(out,{recursive:true});
  const evidencePath=path.join(out,'evidence.json');
  // Reserve this receipt exclusively before incremental writes. A caller must
  // choose a new output for another attempt, including retry after failure.
  fs.closeSync(fs.openSync(evidencePath,'wx'));
  const save=()=>fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
  save();if(inventoryOnly)return evidence;
  let browser,server,timer,expired=false,launchPromise;
  const controller=new AbortController();
  async function run() {
    server=createStagedPreviewServer(stage.root,stage.manifest.base_path);
    const serve=server.listeners('request')[0];server.removeAllListeners('request');
    const fixturePaths=new Map(fixtures.map(f=>[`/__texture/${f.id}.png`,f.bytes]));
    fixturePaths.set('/__texture/broken.png',Buffer.from('This is deliberately not a PNG'));
    server.on('request',(req,res)=>{
      const pathname=new URL(req.url,'http://127.0.0.1').pathname;
      if(pathname==='/__texture/replay.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Local texture replay</title><canvas width="1" height="1"></canvas>');}
      else if(fixturePaths.has(pathname)){res.setHeader('Content-Type','image/png');res.setHeader('Cache-Control','public,max-age=3600');res.end(fixturePaths.get(pathname));}
      else{res.setHeader('Cache-Control','public,max-age=3600');serve(req,res);}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const origin=`http://127.0.0.1:${server.address().port}`;
    const args=['--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'];
    if(gpu==='software')args.push('--use-angle=swiftshader','--enable-unsafe-swiftshader');
    launchPromise=puppeteer.launch({executablePath:browserPath,headless:true,timeout:20000,protocolTimeout:60000,signal:controller.signal,args}).then(async owned=>{
      browser=owned;if(expired){await closeOwnedBrowser(owned,{timeoutMs:8000});throw new Error('Texture browser launched after deadline');}return owned;
    });
    await launchPromise;evidence.browser_version=await browser.version();
    const page=await browser.newPage(),cdp=await localOnly(page,origin);
    await page.goto(origin+'/__texture/replay.html',{waitUntil:'domcontentloaded',timeout:15000});
    evidence.capabilities=await page.evaluate(initializeReplay,stage.upload);
    const max=evidence.capabilities.max_texture_size;
    for(const asset of evidence.assets){
      try{const dimensions=projectUploadDimensions(asset.dimensions,max,asset.nearest);asset.projected_payload=texturePayloadEstimate(...dimensions,!asset.nearest);}
      catch(error){asset.device_admission_error=error.message;}
    }
    const replay=async options=>{
      const result=await page.evaluate(options=>window.textureReplay(options),options);
      if(result.uploaded_dimensions)result.estimated_payload=texturePayloadEstimate(...result.uploaded_dimensions,!options.asset.nearest);
      return result;
    };
    for(const asset of stage.assets)for(let iteration=0;iteration<iterations;iteration++){
      await cdp.send('Network.clearBrowserCache');await page.setCacheEnabled(true);
      const url=origin+stage.manifest.base_path+stage.namespace+'/'+asset.path;
      for(const phase of ['cold-browser-cache','warm-browser-cache']){
        evidence.samples.push(await replay({asset,url,phase,iteration}));save();
      }
      console.log(JSON.stringify({texture:asset.id,iteration,completed:evidence.samples.length}));
    }
    for(const f of fixtures){
      const asset={...f,bytes:undefined,sha256:digest(f.bytes),dimensions:[f.width,f.height]};
      const url=origin+`/__texture/${f.id}.png`;
      const check=async(name,options,expected,tolerance=2)=>{
        const result=await replay({asset,url,phase:'synthetic-filter',...options}),actual=result.first_sample?.rgba;
        const passed=!result.error&&actual?.every((v,i)=>Math.abs(v-expected[i])<=tolerance);
        evidence.filter_checks.push({name,expected,tolerance,passed,result});
      };
      if(f.id==='gray-step')await check('Encoded gray midpoint remains encoded-space filtering',{uv:[.5,.5]},[128,128,128,255]);
      if(f.id==='gray-checker')await check('Generated coarse mip preserves encoded gray average',{lod:1},[128,128,128,255]);
      if(f.id==='alpha-edge'){
        await check('Covered color recovered without transparent magenta contamination',{uv:[.5,.5],recover:true},[64,128,224,128],3);
        await check('Coarse mip preserves color and fractional coverage',{lod:1,recover:true},[64,128,224,128],3);
      }
      if(f.id==='palette'){
        await check('Nearest palette retains first discrete entry',{uv:[.49,.5]},[20,100,220,255],0);
        await check('Nearest palette retains second discrete entry',{uv:[.51,.5]},[240,40,60,255],0);
        const unsupported=await replay({asset,url,phase:'synthetic-error',deviceLimit:1});
        evidence.filter_checks.push({name:'Unsupported palette fails without resize or upload',passed:!!unsupported.error&&!unsupported.uploaded_dimensions&&!unsupported.resize_calls.length,result:unsupported});
      }
    }
    const broken=await replay({asset:{id:'broken-png'},url:origin+'/__texture/broken.png',phase:'synthetic-error'});
    evidence.filter_checks.push({name:'Malformed local PNG fails before upload',passed:!!broken.error&&!broken.uploaded_dimensions,result:broken});
    // Small simulated-device replay proves the actual Canvas branch without allocating an oversized image.
    const gray=fixtures.find(f=>f.id==='gray-checker');
    const resized=await replay({asset:{id:gray.id,sha256:digest(gray.bytes)},url:origin+'/__texture/gray-checker.png',phase:'synthetic-resize',deviceLimit:1});
    evidence.filter_checks.push({name:'Actual upload function exercises bounded Canvas resize',passed:!resized.error&&resized.uploaded_dimensions?.[0]===1&&resized.resize_calls.length===1,result:resized});
    await page.close();
    evidence.sample_summary=summarizeTextureSamples(evidence.samples);
    save();
    evidence.application=await applicationLifecycle(browser,origin,stage,partial=>{evidence.application=partial;save();});
    assert.ok(evidence.samples.every(s=>!s.error&&s.completion?.status==='signaled'),'One or more source samples failed');
    assert.ok(evidence.filter_checks.every(c=>c.passed),'One or more filtering fixtures failed');
    evidence.status='passed';save();
  }
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;controller.abort();reject(new Error('Texture qualification exceeded 240 seconds'));},240000);});
  try{await Promise.race([run(),deadline]);return evidence;}
  catch(error){evidence.errors.push(error.message);evidence.status='failed';save();throw error;}
  finally{
    clearTimeout(timer);controller.abort();
    if(browser)await closeOwnedBrowser(browser,{timeoutMs:8000});
    server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));
  }
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const options=Object.fromEntries(process.argv.slice(2).map(value=>{
    const match=value.match(/^--([a-z-]+)(?:=(.*))?$/);assert.ok(match,`Invalid argument: ${value}`);return [match[1],match[2]??true];
  }));
  const allowed=new Set(['web-root','out','browser','gpu','iterations','inventory-only']);
  for(const key of Object.keys(options))assert.ok(allowed.has(key),`Unknown option: ${key}`);
  if(Object.hasOwn(options,'inventory-only'))assert.equal(options['inventory-only'],true,'--inventory-only takes no value');
  for(const key of ['web-root','out','browser','gpu','iterations'])if(Object.hasOwn(options,key))
    assert.ok(typeof options[key]==='string'&&options[key].length>0,`--${key} requires a value`);
  runTextureQualification({webRoot:options['web-root'],out:options.out,browserPath:options.browser,gpu:options.gpu,
    iterations:options.iterations===undefined?1:Number(options.iterations),inventoryOnly:options['inventory-only']===true})
    .then(evidence=>console.log(JSON.stringify({status:evidence.status,assets:evidence.assets.length,samples:evidence.samples.length})))
    .catch(error=>{console.error(error.message);process.exitCode=1;});
}
