import {classifyTextureBackend} from './texture_device_telemetry.mjs';

export function browserBackendFromArgs(args){
  const values=[];
  for(let i=0;i<args.length;i++){
    if(args[i]==='--backend')values.push(args[++i]);
    else if(args[i].startsWith('--backend='))values.push(args[i].slice('--backend='.length));
  }
  if(values.length>1)throw new Error('Browser backend may only be specified once');
  const backend=values.length?values[0]:'swiftshader';
  if(!['swiftshader','native'].includes(backend))throw new Error(`Unsupported browser backend: ${backend}`);
  return backend;
}

/** GPU flags only; callers retain their existing security, viewport and timing policy. */
export function browserBackendArgs(backend='swiftshader',platform=process.platform){
  if(!['swiftshader','native'].includes(backend))throw new Error(`Unsupported browser backend: ${backend}`);
  return backend==='swiftshader'?['--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle']
    :platform==='win32'?['--use-angle=d3d11','--use-gl=angle']:['--use-gl=angle'];
}

export function assertBrowserBackend(backend,capabilities){
  browserBackendArgs(backend);
  const observed=classifyTextureBackend(capabilities?.renderer);
  const matches=backend==='native'?observed.kind==='native-device':/swiftshader/i.test(capabilities?.renderer??'');
  if(!matches)throw new Error(`Requested ${backend} backend was not established by the actual application WebGL renderer (${observed.kind})`);
  return observed;
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
