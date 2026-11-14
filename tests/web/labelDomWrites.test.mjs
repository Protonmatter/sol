import {createLabelPresenter} from '../../apps/web/js/labelPresenter.js';
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
  const labels=[],writes=[],reads=[],fontHandlers=new Map();
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
  const host={style:{},appendChild(el){labels.push(el);}};
  const context=vm.createContext({labelEls:labels,updateOrreryAccuracy(){},writeText,layoutLabels,projectOpaqueDisc,isLabelOccluded,BODY,
    displayRadiusAU:()=>.03,state:{bodies:[{name:'Jupiter',p:[0,0,0]}],anchor:'Jupiter'},DRAW_LIST:['Jupiter'],
    moonMarkers:[],moonSet:{MOONS:[]},moonDisplayRadius:()=>.02,bodyWorldPos:body=>body.p,
    cel:{pulsars:[],deepsky:[],brightStars:[]},
    document:{fonts:{addEventListener:(name,fn)=>fontHandlers.set(name,fn)},getElementById:id=>id==='orreryLabels'?host:null,createElement:()=>new Label()},
  });
  context.labelPresenter=createLabelPresenter({document:context.document});
  vm.runInContext(functionSource,context);
  const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const canvas={clientWidth:300,clientHeight:140,offsetLeft:0,offsetTop:0};
  const render=()=>context.updateLabels(canvas,matrix,matrix);
  return {labels,writes,reads,context,matrix,canvas,render,fontHandlers};
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

test('stable text metrics are reused while camera projection changes',()=>{
  const f=fixture();f.render();const n=f.reads.length,left=f.labels[0].style.left;
  f.matrix[12]=.2;f.render();
  assert.equal(f.reads.length,n,'camera movement does not remeasure label text');
  assert.notEqual(f.labels[0].style.left,left);assert.equal(f.labels[0].dataset.projectionX,'180');
});


test('font completion invalidates cached fractional metrics',()=>{
  const f=fixture();f.render();const n=f.reads.length;
  f.fontHandlers.get('loadingdone')();f.render();assert.ok(f.reads.length>n);
  const count=f.reads.length;f.render();assert.equal(f.reads.length,count);
});

test('class and text changes invalidate metrics, and explicit resize invalidation refreshes unchanged dimensions',()=>{
  const f=fixture();f.render();let n=f.reads.length;
  f.labels[0].className='changed';f.render();assert.ok(f.reads.length>n);n=f.reads.length;
  f.labels[0].textContent='changed';f.render();assert.ok(f.reads.length>n);n=f.reads.length;
  f.context.labelPresenter.invalidate();f.render();assert.ok(f.reads.length>n);
});

test('a repeated frame with unchanged labels writes no styles and reads no layout',()=>{
  let styleWrites=0,layoutReads=0;
  const tracked=()=>new Proxy({},{set(target,name,value){styleWrites++;target[name]=value;return true;}});
  class Span {
    constructor(){this.style=tracked();this.dataset={};this.className='';this.childNodes=[];
      this.classList={toggle:()=>{}};}
    get textContent(){return this.childNodes.map(n=>n.textContent).join('');}
    set textContent(value){this.childNodes=value?[{nodeType:3,textContent:String(value)}]:[];}
    getBoundingClientRect(){layoutReads++;return {width:this.textContent.length*7,height:15,top:0,bottom:15};}
  }
  const host={style:tracked(),appendChild(){},getBoundingClientRect(){layoutReads++;return {top:100};}};
  const jumps={hidden:false,getBoundingClientRect(){layoutReads++;return {bottom:140};}};
  const document={getElementById:id=>id==='systemJumps'?jumps:null,createElement:()=>new Span()};
  const presenter=createLabelPresenter({document});
  const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const frame=()=>presenter.present({canvas:{clientWidth:400,clientHeight:300,offsetLeft:0,offsetTop:0},host,
    items:[{name:'Jupiter',cls:'orrery-label',p:[0,0,0]},{name:'Saturn',cls:'orrery-label',p:[.5,.2,0]}],
    discs:[],vp:identity,skyVp:identity,parentOf:()=>null,selected:'Jupiter',selectedStar:null,anchor:'Jupiter',primaryNames:['Jupiter','Saturn']});
  frame();
  assert.ok(styleWrites>0&&layoutReads>0,'the first frame lays out and measures');
  styleWrites=0;layoutReads=0;
  frame();
  assert.equal(styleWrites,0,'unchanged labels are not rewritten');
  assert.equal(layoutReads,0,'unchanged labels and jump bar are not re-measured');
  presenter.invalidate();layoutReads=0;
  frame();
  assert.ok(layoutReads>0,'an explicit invalidation measures again');
});
