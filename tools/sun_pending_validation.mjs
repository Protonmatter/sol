// Native ANGLE regression: safely retire a linked Sun shader set during KHR compilation.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6);
if(!url)throw Error('Provide --url=<local staged SOL URL>');
const warnings=[];
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'/usr/bin/google-chrome'),headless:true,args:['--no-sandbox','--use-angle=d3d11','--use-gl=angle']});
const page=await browser.newPage();page.on('console',m=>{if(m.type()==='warn'&&m.text().includes('GL_INVALID'))warnings.push(m.text());});
try{await page.goto(url,{waitUntil:'domcontentloaded'});
const result=await page.evaluate(async()=>{
 const q=new URL(document.querySelector('script[type=module][src^="app.js"]').src).search;
 const [{createSunLookRenderer},{planSunLook},{perspective,lookAt,mul}]=await Promise.all([import('./js/sunLookRenderer.js'+q),import('./js/sunLook.js'+q),import('./js/orreryMath.js'+q)]);
 const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2');
 const id=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],plan=planSunLook({vp:mul(perspective(Math.PI/3,1,.1,100),lookAt([0,0,5],[0,0,0],[0,1,0])),rotation:id,position:[0,0,0],radius:1,eye:[0,0,5],pixels:300});
 const result=[];
 for(let i=0;i<3;i++){
  const owner=createSunLookRenderer(gl);owner.render(plan,{viewport:[0,0,64,64]});const state=owner.status();owner.dispose();
  await new Promise(r=>setTimeout(r,1000));result.push({state,error:gl.getError()});
 }
 return result;
});
assert(result.every(r=>r.error===0),JSON.stringify(result));assert.deepEqual(warnings,[]);
console.log(JSON.stringify({result,warnings,passed:true}));
}finally{await browser.close();}
