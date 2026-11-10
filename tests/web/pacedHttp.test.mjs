import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPacedResponder} from '../../tools/paced_http.mjs';
class Response extends EventEmitter{
  chunks=[];headers=null;status=null;destroyed=false;
  writeHead(status,headers){this.status=status;this.headers=headers;}
  write(bytes){this.chunks.push(Buffer.from(bytes));return true;}
  end(){this.emit('finish');this.emit('close');}
  destroy(){this.destroyed=true;this.emit('close');}
}
test('HTTP adapter preserves exact payload and waits before publishing headers',async()=>{
  const responder=createPacedResponder({rateBytesPerSecond:1000000,latencyMs:40,tickMs:2}),response=new Response(),payload=Buffer.from('exact source bytes');
  try{
    const finished=new Promise(resolve=>response.once('finish',resolve));
    const record=responder.send(response,{bytes:payload,tags:{path:'/source'}});
    assert.equal(response.headers,null);await finished;
    assert.equal(response.status,200);assert.equal(response.headers['Content-Length'],String(payload.length));assert.deepEqual(Buffer.concat(response.chunks),payload);
    assert.ok(record.firstByteMs>=record.readyAtMs);assert.equal(record.sentBytes,payload.length);assert.equal(record.complete,true);assert.equal(responder.activeCount,0);
  }finally{responder.close();}
});
test('closing the owner aborts queued responses and refuses new work',()=>{
  const responder=createPacedResponder(),response=new Response();
  const record=responder.send(response,{bytes:Buffer.alloc(10)});responder.close();responder.close();
  assert.equal(response.destroyed,true);assert.equal(record.aborted,true);assert.equal(record.complete,false);assert.equal(responder.pendingCount,0);assert.equal(responder.activeCount,0);
  assert.throws(()=>responder.send(new Response(),{bytes:Buffer.alloc(1)}),/closed/);
});
test('invalid adapter configuration and unpinned payloads fail explicitly',()=>{
  assert.throws(()=>createPacedResponder({latencyMs:-1}));assert.throws(()=>createPacedResponder({tickMs:0}));
  const responder=createPacedResponder();try{assert.throws(()=>responder.send(new Response(),{bytes:'unencoded source'}),/Buffer/);}finally{responder.close();}
});
