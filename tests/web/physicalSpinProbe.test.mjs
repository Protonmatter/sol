import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import {installProgramSourceEvidence,preparePhysicalSpinEvidence} from '../../tools/physical_spin_probe.mjs';

async function fixture(){
  const profile={body:'Earth',radiusKm:1,topKm:2,rayleighScaleHeightKm:3,aerosolScaleHeightKm:4,
    betaRayleighKm:[.1,.2,.3],betaAerosolExtinctionKm:[.4,.5,.6],aerosolSingleScatteringAlbedo:[.7,.8,.9],aerosolG:.8,surfaceRefractivity:.01};
  const profileHash=createHash('sha256').update('profile').digest('hex'),textures=[{},{}];
  const incident={sha256:'i'.repeat(64),profile_sha256:profileHash,dimensions:[2,2,3],bytes:192,domain:{minHeightKm:0,maxHeightKm:16,quadratic:true}};
  const columns={sha256:'c'.repeat(64),profile_sha256:profileHash,dimensions:[2,2,2],bytes:32};
  const store={orrery:{opticsEnabled:true,opticsStatus:{Earth:'ready'},hdrFrame:{},bodies:[{name:'Earth',x_au:1,y_au:0,z_au:0}]}};
  let unit=0,settled=0;
  const calls=[];
  class GL{
    constructor(){Object.assign(this,{VERTEX_SHADER:1,FRAGMENT_SHADER:2,ACTIVE_TEXTURE:3,TEXTURE0:100,TEXTURE_BINDING_2D:4,RGBA32F:5,RG32F:6,FLOAT:7});}
    createShader(type){const shader={type};calls.push(['createShader',this,type,shader]);return shader;}
    shaderSource(...args){calls.push(['shaderSource',this,...args]);}
    attachShader(...args){calls.push(['attachShader',this,...args]);}
    detachShader(...args){calls.push(['detachShader',this,...args]);}
    linkProgram(...args){calls.push(['linkProgram',this,...args]);}
    deleteProgram(...args){calls.push(['deleteProgram',this,...args]);}
    getUniformLocation(program,name){return {program,name};}
    getUniform(program,location){return program.uniforms[location.name]??null;}
    getParameter(name){return name===3?100+unit:textures[unit-6];}
    activeTexture(value){unit=value-100;}
  }
  const gl=new GL(),uploads=new Map(textures.map((texture,index)=>[texture,{sequence:index+1,status:'ready',sha256:index?columns.sha256:incident.sha256,
    width:2,height:index?2:6,internalFormat:index?gl.RG32F:gl.RGBA32F,type:gl.FLOAT,byteLength:index?32:192,unpack:{flipY:false,premultiplyAlpha:false}}]));
  const context=vm.createContext({WebGL2RenderingContext:GL,crypto:webcrypto,TextEncoder,URL,
    document:{querySelector:()=>({src:'https://sol.invalid/app.js?v=stage'})},
    __solPhysicalTextureEvidence:{settle:async()=>{settled++;},snapshot:(actual,texture)=>actual===gl?uploads.get(texture):null},
  });
  vm.runInContext(`(${installProgramSourceEvidence.toString()})()`,context);
  const modules={
    orreryShaders:{SPHERE_VS:'physical vertex',SPHERE_FS:'physical fragment'},
    atmosphereOptics:{getAtmosphereProfile:()=>profile,serializeAtmosphereProfile:()=>'profile'},
    bodyData:{BODY:{Earth:{radiusKm:1,polarKm:1}}},atmosphereIncidentManifest:{INCIDENT_FIELDS:{Earth:incident}},
    atmosphereColumnManifest:{ATMOSPHERE_COLUMN_FIELDS:{Earth:columns}},store:{store},
  };
  const prepared=new vm.SourceTextModule(`export default ${preparePhysicalSpinEvidence.toString()}`,{context,
    importModuleDynamically:async specifier=>{
      const name=specifier.match(/\/([A-Za-z]+)\.js/)[1],values=modules[name];assert.ok(values,name);
      const module=new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value);},{context});
      await module.link(()=>{});await module.evaluate();return module;
    }});
  await prepared.link(()=>{});await prepared.evaluate();const summary=await prepared.namespace.default();
  const uniforms={u_atmosphereEnabled:1,u_atmosphereRefractionEnabled:1,u_incidentFieldReady:1,u_atmosphereRadiusKm:1,u_bodyRadiusKm:1,u_atmosphereTopKm:2,
    u_atmospherePolarRatio:1,u_atmosphereG:Math.fround(.8),u_atmosphereRefractivity:Math.fround(.01),u_atmosphereSolarScale:1,u_atmosphereExposure:1,
    u_incidentField:6,u_atmosphereColumnField:7,u_atmosphereCameraKm:[0,0,3],u_atmosphereSunDirection:[-1,0,0],u_incidentFieldHeight:[0,16,1],
    u_model:[1,0,0,0,0,1,0,0,0,0,1,0,1,0,0,1],u_cam:[1,0,3],
    u_atmosphereDensityScaleKm:[3,4],u_atmosphereRayleighKm:profile.betaRayleighKm.map(Math.fround),u_atmosphereAerosolKm:profile.betaAerosolExtinctionKm.map(Math.fround),
    u_atmosphereAerosolSSA:profile.aerosolSingleScatteringAlbedo.map(Math.fround)};
  const program={uniforms},vs=gl.createShader(1),fs=gl.createShader(2);
  const link=(fragment='physical fragment')=>{gl.shaderSource(vs,'physical vertex');gl.shaderSource(fs,fragment);gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.detachShader(program,vs);gl.detachShader(program,fs);};
  link();
  return {gl,program,uniforms,uploads,textures,summary,store,calls,link,context,capture:()=>context.__solPhysicalSpinEvidence.capture(gl,program),settled:()=>settled,unit:()=>unit};
}

test('physical draw requires observed production sources after shader companions detach',async()=>{
  const f=await fixture();assert.equal(f.settled(),1);const result=f.capture();assert.equal(result.passed,true);
  assert.equal(result.profile_sha256,f.summary.profile_sha256);assert.equal(result.fields.incident.sha256,'i'.repeat(64));
  assert.equal(result.fields.columns.sha256,'c'.repeat(64));assert.equal(f.unit(),0,'sampler observation restores active unit');
  assert.ok(f.calls.every(call=>call[1]===f.gl),'native receivers preserved');
});

test('relinking a previously accepted physical program invalidates old source evidence',async()=>{
  const f=await fixture();assert.equal(f.capture().passed,true);f.link('fallback fragment');
  assert.equal(f.capture().passed,false);
});

test('physical draw rejects fallback, pending refraction and wrong current source/profile bindings',async()=>{
  for(const change of [f=>f.uniforms.u_atmosphereEnabled=0,f=>f.uniforms.u_atmosphereRefractionEnabled=0,
    f=>f.uniforms.u_incidentFieldReady=0,f=>f.uniforms.u_bodyRadiusKm=2,f=>f.uniforms.u_atmosphereExposure=2,
    f=>f.uniforms.u_atmosphereSolarScale=.25,f=>f.store.orrery.opticsStatus.Earth='loading',
    f=>f.uploads.get(f.textures[0]).sha256='stale',f=>f.uploads.get(f.textures[1]).status='invalid',
    f=>f.uploads.get(f.textures[0]).internalFormat=f.gl.RG32F,f=>f.uploads.get(f.textures[1]).unpack.flipY=true,
    f=>f.uploads.get(f.textures[1]).height=1]){
    const f=await fixture();change(f);assert.equal(f.capture().passed,false);assert.equal(f.unit(),0);
  }
});

test('physical camera and Sun must track the actual animated GPU model and camera',async()=>{
  for(const change of [f=>f.uniforms.u_atmosphereCameraKm=[0,0,2],
    f=>f.uniforms.u_atmosphereSunDirection=[0,-1,0],f=>f.uniforms.u_cam=[1,1,3],
    f=>f.uniforms.u_model=[0,1,0,0,-1,0,0,0,0,0,1,0,1,0,0,1]]){
    const f=await fixture();change(f);assert.equal(f.capture().passed,false);
  }
});

test('independently rounded world camera and model retain consistent physical geometry',async()=>{
  for(const radius of [.08,.0000426]){
    const f=await fixture(),angle=.37,c=Math.cos(angle),s=Math.sin(angle),center=[.812345678,-.712345678,.0012345678];
    const eye=center.map((v,i)=>v+[.3,-.4,1.2][i]*radius),d=eye.map((v,i)=>(v-center[i])/radius);
    const worldSun=center.map(v=>-v/Math.hypot(...center));
    const localSun=[c*worldSun[0]+s*worldSun[1],-s*worldSun[0]+c*worldSun[1],worldSun[2]];
    Object.assign(f.uniforms,{u_model:[c*radius,s*radius,0,0,-s*radius,c*radius,0,0,0,0,radius,0,...center,1].map(Math.fround),
      u_cam:eye.map(Math.fround),u_atmosphereCameraKm:[c*d[0]+s*d[1],-s*d[0]+c*d[1],d[2]].map(Math.fround),
      u_atmosphereSunDirection:localSun.map(v=>Math.fround(v/Math.hypot(...localSun))),
      u_atmosphereSolarScale:Math.fround(1/Math.hypot(...center)**2)});
    Object.assign(f.store.orrery.bodies[0],{x_au:center[0],y_au:center[1],z_au:center[2]});
    assert.equal(f.capture().passed,true,`display radius ${radius}`);
  }
});
