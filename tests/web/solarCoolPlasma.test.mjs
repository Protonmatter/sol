import test from 'node:test';
import assert from 'node:assert/strict';
import {coolSheetIntersection,orderedSheetTransfer} from '../../apps/web/js/solarCoolPlasma.js';
test('finite localized sheet is disabled by default and clips behind opaque surface',()=>{
 assert.equal(coolSheetIntersection([5,0,0],[-1,0,0]),null);
 const hit=coolSheetIntersection([5,0,0],[-1,0,0],{enabled:true,finish:4});
 assert.ok(Math.abs(hit.distance-3.88)<1e-12);assert.equal(hit.opticalDepth,2);
 assert.equal(coolSheetIntersection([-5,0,0],[1,0,0],{enabled:true,finish:4}),null);
 assert.equal(coolSheetIntersection([5,0,.4],[-1,0,0],{enabled:true}),null);
});
test('positive transfer preserves foreground and attenuates only background',()=>{
 assert.equal(orderedSheetTransfer(3,5,0,2),8);
 assert.ok(Math.abs(orderedSheetTransfer(3,5,2,.004)-(3+5*Math.exp(-2)+.004*(1-Math.exp(-2))))<1e-12);
 assert.equal(orderedSheetTransfer(3,5,1000,.004),3.004);
 assert.throws(()=>orderedSheetTransfer(0,0,-1,0));
});
test('sheet follows relative differential advection at explicit scenario time',()=>{
 const angle=.2,c=Math.cos(angle),s=Math.sin(angle);
 const hit=coolSheetIntersection([5*c,5*s,0],[-c,-s,0],{enabled:true,seconds:86400,rotation:[angle*180/Math.PI,0,0]});
 assert.ok(Math.abs(hit.opticalDepth-2)<1e-12);
});
