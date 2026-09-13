import {loadTerrainReference,terrainReference} from './terrainAssets.js';
import {buildTerrainMesh,terrainShadowUniforms} from './terrainGeometry.js';

const terrainWorker=/** @type {any} */(globalThis);
terrainWorker.onmessage=async event=>{
  const {body,level,radii}=event.data||{};
  try{
    if(!terrainReference(body)||!Number.isInteger(level)||level<1||level>3
        ||![radii?.equatorialRadiusKm,radii?.polarRadiusKm].every(x=>Number.isFinite(x)&&x>0))throw new Error('Invalid terrain request');
    const source=await loadTerrainReference(body);
    if(!source)throw new Error('Numerical terrain unavailable');
    const segments=[0,48,96,192][level];
    const mesh=buildTerrainMesh(source.grid,{latSegments:segments,lonSegments:segments*2,...radii});
    const {grid}=source;
    Object.assign(mesh,{heightsKm:grid.heightsKm,width:grid.width,height:grid.height,shadow:terrainShadowUniforms(grid)});
    terrainWorker.postMessage({body,level,mesh},[mesh.pos.buffer,mesh.idx.buffer,grid.heightsKm.buffer]);
  }catch(error){terrainWorker.postMessage({body,level,error:String(error.message||error).slice(0,180)});}
};
