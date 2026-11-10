import test from 'node:test';
import assert from 'node:assert/strict';
import {TransferBudget} from '../../tools/transfer_budget.mjs';
const bytes=(allocations,id)=>allocations.filter(item=>id===undefined||item.id===id).reduce((sum,item)=>sum+item.bytes,0);
test('one shared budget bounds aggregate transfers and gives concurrent bodies fair progress',()=>{
  const budget=new TransferBudget({rateBytesPerSecond:200000,burstBytes:4096,quantumBytes:1024,now:0});
  budget.add('page',400000,150);budget.add('worker',400000,150);
  assert.equal(bytes(budget.drain(149)),0);
  const first=budget.drain(150);assert.equal(bytes(first),4096);assert.equal(bytes(first,'page'),2048);assert.equal(bytes(first,'worker'),2048);
  let total=4096,doneAt=null;
  for(let time=160;time<5000;time+=10){total+=bytes(budget.drain(time));assert.ok(total<=4096+200000*(time-150)/1000);if(!budget.pendingCount){doneAt=time;break;}}
  assert.equal(total,800000);assert.ok(doneAt>=4130&&doneAt<=4140,'two 400KB streams share the 200KB/s line');
});
test('idle or stalled time cannot create an unbounded initial burst',()=>{
  const budget=new TransferBudget({rateBytesPerSecond:200000,burstBytes:4096,now:0});
  budget.drain(60000);budget.add('image',200000,60000);assert.equal(bytes(budget.drain(60000)),4096);
  assert.equal(bytes(budget.drain(60000)),0);assert.equal(bytes(budget.drain(61000)),4096);
});
test('latency gates each body, including a zero-byte response',()=>{
  const budget=new TransferBudget({rateBytesPerSecond:1000,burstBytes:1000,now:0});
  budget.add('early',10,100);budget.add('late',10,200);budget.add('empty',0,200);
  assert.deepEqual(budget.drain(99),[]);assert.deepEqual(budget.drain(100),[{id:'early',bytes:10,done:true}]);
  assert.deepEqual(budget.drain(199),[]);const final=budget.drain(200);assert.equal(bytes(final,'late'),10);assert.ok(final.some(item=>item.id==='empty'&&item.done&&item.bytes===0));assert.equal(budget.pendingCount,0);
});
test('cancelled and backpressured transfers cannot spend bytes or block other clients',()=>{
  const budget=new TransferBudget({rateBytesPerSecond:1000,burstBytes:1000,quantumBytes:100,now:0});
  budget.add('stalled',1000,0);budget.add('cancelled',1000,0);budget.add('active',1000,0);budget.pause('stalled',true);
  assert.equal(budget.cancel('cancelled'),true);assert.equal(budget.cancel('absent'),false);
  assert.equal(bytes(budget.drain(1000),'active'),1000);assert.equal(budget.pendingCount,1);
  budget.pause('stalled',false);assert.equal(bytes(budget.drain(2000),'stalled'),1000);assert.equal(budget.pendingCount,0);
});
test('fractional credits accumulate without creating fractional transferred bytes',()=>{
  const budget=new TransferBudget({rateBytesPerSecond:3,burstBytes:10,now:0});budget.add('small',3,0);
  const allocations=[];for(let time=100;time<=1000;time+=100)allocations.push(...budget.drain(time));
  assert.ok(allocations.every(item=>Number.isSafeInteger(item.bytes)));assert.equal(bytes(allocations),3);assert.equal(budget.pendingCount,0);
});
test('invalid budgets, duplicate IDs, nonfinite clocks and clock reversal fail explicitly',()=>{
  for(const options of [{rateBytesPerSecond:0},{rateBytesPerSecond:Infinity},{rateBytesPerSecond:1,burstBytes:0},{rateBytesPerSecond:1,quantumBytes:1.5},{rateBytesPerSecond:1,now:NaN}])assert.throws(()=>new TransferBudget(options));
  const budget=new TransferBudget({rateBytesPerSecond:1000,now:10});
  for(const [id,size,ready]of [['x',-1,10],['x',1.5,10],['x',1,Infinity]])assert.throws(()=>budget.add(id,size,ready));
  budget.add('x',1,10);assert.throws(()=>budget.add('x',1,10),/duplicate/i);assert.throws(()=>budget.drain(9),/clock/i);assert.throws(()=>budget.drain(NaN),/clock/i);
});
