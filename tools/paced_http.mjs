import {performance} from 'node:perf_hooks';
import {TransferBudget} from './transfer_budget.mjs';

// One shared body budget across every HTTP response, including SW-origin fetches.
// Headers have the same minimum latency; protocol overhead is not byte-throttled.
export function createPacedResponder({rateBytesPerSecond=200000,latencyMs=150,burstBytes=4096,tickMs=10,clock=()=>performance.now()}={}){
  if(!Number.isFinite(latencyMs)||latencyMs<0||!Number.isSafeInteger(tickMs)||tickMs<1)throw new RangeError('Invalid pacing latency/tick');
  const budget=new TransferBudget({rateBytesPerSecond,burstBytes,now:clock()});
  const records=[],active=new Map();let timer=null,nextId=0,closed=false;
  const stopIdleTimer=()=>{if(!budget.pendingCount&&timer!==null){clearInterval(timer);timer=null;}};
  const pump=()=>{
    for(const allocation of budget.drain(clock())){
      const task=active.get(allocation.id);if(!task)continue;
      try{
        if(task.row.firstByteMs===null){task.row.firstByteMs=clock();task.response.writeHead(task.row.status,task.headers);}
        if(allocation.bytes){
          const end=task.offset+allocation.bytes,writable=task.response.write(task.bytes.subarray(task.offset,end));
          task.offset=end;task.row.sentBytes=end;if(!writable)budget.pause(allocation.id,true);
        }
        if(allocation.done)task.response.end();
      }catch(error){task.row.error=String(error);budget.cancel(allocation.id);task.response.destroy();}
    }
    stopIdleTimer();
  };
  return {
    records,
    get activeCount(){return active.size;},
    get pendingCount(){return budget.pendingCount;},
    send(response,{bytes,status=200,headers={},tags={}}){
      if(closed)throw new Error('Paced responder is closed');
      if(!Buffer.isBuffer(bytes))throw new TypeError('Paced response requires pinned Buffer bytes');
      const id=++nextId,startMs=clock();
      const row={id,...tags,status,bodyBytes:bytes.length,sentBytes:0,startMs,readyAtMs:startMs+latencyMs,firstByteMs:null,endMs:null,complete:false,aborted:false,error:null};
      const task={response,bytes,headers:{...headers,'Content-Length':String(bytes.length)},offset:0,row};
      records.push(row);active.set(id,task);budget.add(id,bytes.length,row.readyAtMs);
      response.once('finish',()=>{row.complete=true;row.endMs=clock();active.delete(id);});
      response.once('close',()=>{
        if(!row.complete){row.aborted=true;row.endMs=clock();budget.cancel(id);active.delete(id);stopIdleTimer();}
      });
      response.once('error',error=>{row.error=String(error);});
      response.on('drain',()=>budget.pause(id,false));
      if(timer===null)timer=setInterval(pump,tickMs);
      return row;
    },
    close(){
      if(closed)return;closed=true;
      if(timer!==null){clearInterval(timer);timer=null;}
      for(const [id,task]of active){budget.cancel(id);task.response.destroy();}
    },
  };
}
