import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {writeText} from '../../apps/web/js/domWrites.js';
import {layoutLabels} from '../../apps/web/js/labelLayout.js';
import {projectOpaqueDisc,isLabelOccluded} from '../../apps/web/js/labelOcclusion.js';
import {BODY} from '../../apps/web/js/bodyData.js';

function fixture(){
  const source=fs.readFileSync(new URL('../../apps/web/js/orrery.js',import.meta.url),'utf8');
  const functionSource=source.slice(source.indexOf('function updateLabels('),source.indexOf('// ---------------------------------------------------------------- detail panel'));
  const labels=[],writes=[],reads=[];
  class Label {
    constructor(){
      this.style={};this.childNodes=[];this._class='';
      this.dataset=new Proxy({}, {set:(target,name,value)=>{writes.push(['data',name]);target[name]=String(value);return true;}});
      this.classList={toggle:(name,force)=>{
        const tokens=new Set(this.className.split(/\s+/).filter(Boolean));
        if(tokens.has(name)!==force){if(force)tokens.add(name);else tokens.delete(name);this.className=[...tokens].join(' ');}
      }};
    }
    get textContent(){return this.childNodes.filter(n=>n.nodeType!==8).map(n=>n.textContent).join('');}
    set textContent(value){writes.push(['text']);const text=value==null?'':String(value);this.childNodes=text?[{nodeType:3,textContent:text}]:[];}
    get className(){return this._class;}
    set className(value){writes.push(['class']);this._class=String(value);}
    getBoundingClientRect(){reads.push(this.textContent);return {width:this.textContent.length*7.125,height:15.25};}
  }
  const host={style:{},appendChild(){}};
  const context=vm.createContext({labelEls:labels,updateOrreryAccuracy(){},writeText,layoutLabels,projectOpaqueDisc,isLabelOccluded,BODY,
    displayRadiusAU:()=>.03,state:{bodies:[{name:'Jupiter',p:[0,0,0]}],anchor:'Jupiter'},DRAW_LIST:['Jupiter'],
    moonMarkers:[],moonSet:{MOONS:[]},moonDisplayRadius:()=>.02,bodyWorldPos:body=>body.p,
    cel:{pulsars:[],deepsky:[],brightStars:[]},
    document:{getElementById:id=>id==='orreryLabels'?host:null,createElement:()=>new Label()},
  });
  vm.runInContext(functionSource,context);
  const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const canvas={clientWidth:300,clientHeight:140,offsetLeft:0,offsetTop:0};
  const render=()=>context.updateLabels(canvas,matrix,matrix);
  return {labels,writes,reads,context,matrix,canvas,render};
}

test('unchanged projected label retains its plain native text node',()=>{
  const f=fixture();f.render();const leaf=f.labels[0].childNodes[0];f.writes.length=0;f.render();
  assert.equal(f.labels[0].childNodes[0],leaf,'stable text should retain its existing node before geometry measurement');
  assert.equal(f.writes.filter(w=>w[0]==='text').length,0);
});

test('unchanged projected label does not rewrite its native class',()=>{
  const f=fixture();f.render();f.writes.length=0;f.render();
  assert.equal(f.writes.filter(w=>w[0]==='class').length,0,'equal label class should not produce another attribute write');
});

test('unchanged projected label retains its object ID attribute',()=>{
  const f=fixture();f.render();f.writes.length=0;f.render();
  assert.equal(f.writes.filter(w=>w[0]==='data'&&w[1]==='objectId').length,0,'equal object ID should not be assigned again');
});

test('fresh label bounds and projection are recomputed even when content is equal',()=>{
  const f=fixture();f.render();const leaf=f.labels[0].childNodes[0],left=f.labels[0].style.left,n=f.reads.length;
  f.matrix[12]=.4;f.canvas.clientWidth=420;f.render();
  assert.ok(f.reads.length>n,'each redraw must measure current text bounds');
  assert.notEqual(f.labels[0].style.left,left);assert.equal(f.labels[0].dataset.projectionX,'294');
  assert.equal(f.labels[0].textContent,'Jupiter');assert.equal(f.labels[0].dataset.objectId,'Jupiter');
  assert.ok(leaf);
});

test('label redraw repairs live text, class and ID tampering',()=>{
  const f=fixture();f.render();const label=f.labels[0];
  label.childNodes=[{nodeType:1,textContent:'Jupiter'}];label.className='external-class';label.dataset.objectId='stale';
  f.render();assert.equal(label.childNodes.length,1);assert.equal(label.childNodes[0].nodeType,3,'equal nested content must still flatten');
  assert.equal(label.textContent,'Jupiter');assert.equal(label.className,'orrery-label');assert.equal(label.dataset.objectId,'Jupiter');
  f.context.DRAW_LIST=['Earth'];f.context.state.bodies=[{name:'Earth',p:[0,0,0]}];f.context.state.anchor='Earth';f.render();
  assert.equal(label.textContent,'Earth');assert.equal(label.dataset.objectId,'Earth');
});

test('hidden and removed labels still clear their projected anchors',()=>{
  const f=fixture();f.render();f.matrix[15]=-1;f.render();
  const label=f.labels[0];assert.equal(label.style.display,'none');
  assert.equal(label.dataset.projectionX,undefined);assert.equal(label.dataset.projectionY,undefined);
  f.matrix[15]=1;f.render();assert.equal(label.style.display,'block');
  f.context.state.bodies=[];f.render();assert.equal(label.style.display,'none');
  assert.equal(label.dataset.projectionX,undefined);assert.equal(label.dataset.projectionY,undefined);
});
