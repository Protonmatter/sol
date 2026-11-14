import {classifyTextureBackend} from './texture_device_telemetry.mjs';

export function browserBackendFromArgs(args,{allowSoftwareFallback=false}={}){
  const values=[];
  for(let i=0;i<args.length;i++){
    if(args[i]==='--backend')values.push(args[++i]);
    else if(args[i].startsWith('--backend='))values.push(args[i].slice('--backend='.length));
  }
  if(values.length>1)throw new Error('Browser backend may only be specified once');
  const backend=values.length?values[0]:'swiftshader';
  if(!['swiftshader','native',...(allowSoftwareFallback?['swiftshader-fallback']:[])].includes(backend))throw new Error(`Unsupported browser backend: ${backend}`);
  return backend;
}

/** GPU flags only; callers retain their existing security, viewport and timing policy. */
export function browserBackendArgs(backend='swiftshader',platform=process.platform){
  if(!['swiftshader','native','swiftshader-fallback'].includes(backend))throw new Error(`Unsupported browser backend: ${backend}`);
  if(backend==='swiftshader-fallback')return ['--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader'];
  return backend==='swiftshader'?['--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle']
    :platform==='win32'?['--use-angle=d3d11','--use-gl=angle']:['--use-gl=angle'];
}

// Native qualification covers the approved quality controls; hosted software
// keeps the default workload. This does not change application defaults.
export function sunLookProbeResolutions(backend='swiftshader'){
  browserBackendArgs(backend);
  return backend==='native'?[1024,2048,4096]:[1024];
}

export function assertBrowserBackend(backend,capabilities){
  browserBackendArgs(backend);
  const observed=classifyTextureBackend(capabilities?.renderer);
  const matches=backend==='native'?observed.kind==='native-device':/swiftshader/i.test(capabilities?.renderer??'');
  if(!matches)throw new Error(`Requested ${backend} backend was not established by the actual application WebGL renderer (${observed.kind})`);
  if(backend==='swiftshader-fallback'){
    const status=capabilities?.browser_feature_status;
    if(status?.gpu_compositing!=='disabled_software'||status?.rasterization!=='disabled_software'
        ||!['unavailable_software','disabled_software'].includes(status?.['2d_canvas']))
      throw new Error('Requested software fallback requires browser compositor, rasterization and Canvas2D software status');
  }
  return observed;
}

/** Read after the measured tasks. Legacy/native modes retain their existing path. */
export async function withBrowserFeatureStatus(backend,browser,capabilities){
  browserBackendArgs(backend);
  if(backend!=='swiftshader-fallback')return capabilities;
  return readBrowserFeatureStatus(browser,capabilities);
}

/** Explicit post-task topology readback for every backend; allocates no app context. */
export async function readBrowserFeatureStatus(browser,capabilities){
  const session=await browser.target().createCDPSession();
  let readFailed=false,readError;
  try{
    const info=await session.send('SystemInfo.getInfo'),status=info?.gpu?.featureStatus;
    if(!status||typeof status!=='object'||Array.isArray(status)
      ||['gpu_compositing','rasterization','2d_canvas'].some(key=>typeof status[key]!=='string'||!status[key].trim()))
      throw new Error('Browser GPU feature status unavailable or incomplete');
    return {...capabilities,browser_feature_status:{...status}};
  }catch(error){readFailed=true;readError=error;throw error;}
  finally{
    try{await session.detach();}
    catch(error){
      if(readFailed)throw new AggregateError([readError,error],'Browser feature readback and session cleanup failed');
      throw error;
    }
  }
}

/** Self-contained browser readback of the existing application context. */
export function captureBrowserCapabilities(){
  const canvas=document.getElementById('orreryCanvas'),gl=canvas?.getContext('webgl2');
  if(!gl||gl.isContextLost())throw new Error('Live application WebGL2 context unavailable');
  const debug=gl.getExtension('WEBGL_debug_renderer_info');
  return {
    basis:'Read from the existing application WebGL2 context; launch flags alone do not establish hardware execution',
    observed_ms:performance.now(),
    renderer:gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER),
    vendor:gl.getParameter(debug?debug.UNMASKED_VENDOR_WEBGL:gl.VENDOR),unmasked_identity:!!debug,
    version:gl.getParameter(gl.VERSION),shading_language_version:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    max_texture_size:gl.getParameter(gl.MAX_TEXTURE_SIZE),max_renderbuffer_size:gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    max_viewport_dimensions:Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS)),
    max_texture_units:gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    context_attributes:gl.getContextAttributes(),drawing_buffer_color_space:gl.drawingBufferColorSpace??null,
    unpack_color_space:gl.unpackColorSpace??null,extensions:(gl.getSupportedExtensions()??[]).sort(),
    canvas:{width:canvas.width,height:canvas.height},
  };
}
