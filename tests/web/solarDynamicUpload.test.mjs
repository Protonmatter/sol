import assert from 'node:assert/strict';
import test from 'node:test';
import {uploadFieldTexture} from '../../apps/web/js/solarDynamicRenderer.js';

// Minimal WebGL2 state that enforces the rule the browser applies: a 3-D upload from
// a typed array fails with INVALID_OPERATION while flip-Y or premultiply is enabled.
function fakeGL({premultiply=false,flip=false,staleError=0}={}) {
  const E={NO_ERROR:0,INVALID_OPERATION:0x502,UNPACK_FLIP_Y_WEBGL:37440,UNPACK_PREMULTIPLY_ALPHA_WEBGL:37441,UNPACK_ALIGNMENT:3317,
    TEXTURE_2D:3553,TEXTURE_3D:32879,R16F:33325,RGBA16F:34842,RED:6403,RGBA:6408,FLOAT:5126,TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,
    TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,TEXTURE_WRAP_R:32882,LINEAR:9729,REPEAT:10497,CLAMP_TO_EDGE:33071};
  const store=new Map([[E.UNPACK_FLIP_Y_WEBGL,flip],[E.UNPACK_PREMULTIPLY_ALPHA_WEBGL,premultiply],[E.UNPACK_ALIGNMENT,4]]);
  const errors=staleError?[staleError]:[],uploads=[],deleted=[];
  return {...E,store,uploads,deleted,
    createTexture:()=>({}),deleteTexture:t=>deleted.push(t),bindTexture(){},texParameteri(){},
    getParameter:name=>store.get(name),pixelStorei:(name,value)=>store.set(name,value),
    getError:()=>errors.shift()??0,
    texImage3D(...args){
      if(store.get(E.UNPACK_FLIP_Y_WEBGL)||store.get(E.UNPACK_PREMULTIPLY_ALPHA_WEBGL)){errors.push(E.INVALID_OPERATION);return;}
      uploads.push(args);
    },
    texImage2D(...args){uploads.push(args);},
  };
}

test('3-D field uploads succeed after a planet map left premultiply or flip-Y enabled', () => {
  for(const state of [{premultiply:true},{flip:true},{premultiply:true,flip:true}]) {
    const gl=fakeGL(state);
    const handle=uploadFieldTexture(gl,new Float32Array(8),[2,2,2]);
    assert.ok(handle,'upload returns a texture');
    assert.equal(gl.uploads.length,1,'the 3-D upload reached the context');
    // The caller's unpack state is restored for the next image upload.
    assert.equal(gl.store.get(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),!!state.premultiply);
    assert.equal(gl.store.get(gl.UNPACK_FLIP_Y_WEBGL),!!state.flip);
    assert.equal(gl.store.get(gl.UNPACK_ALIGNMENT),4);
  }
});

test('a stale error from an earlier call does not fail a valid field upload', () => {
  const gl=fakeGL({staleError:0x500});
  assert.ok(uploadFieldTexture(gl,new Float32Array(4),[1,1,1],4));
  assert.equal(gl.deleted.length,0);
});

test('a genuinely rejected upload deletes its texture, reports failure and restores state', () => {
  const gl=fakeGL({premultiply:true});
  gl.texImage3D=function(){this.getError=()=>0x502;};
  assert.throws(()=>uploadFieldTexture(gl,new Float32Array(8),[2,2,2]),/texture upload failed/);
  assert.equal(gl.deleted.length,1);
  assert.equal(gl.store.get(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),true);
});

test('2-D fields wrap in longitude and still use float storage', () => {
  const gl=fakeGL();
  uploadFieldTexture(gl,new Float32Array(2),[2,1]);
  assert.equal(gl.uploads[0][2],gl.R16F);
});
