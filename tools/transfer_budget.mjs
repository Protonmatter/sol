// Pure aggregate response-body pacing for the local performance fixture.
export class TransferBudget {
  constructor({rateBytesPerSecond,burstBytes=4096,quantumBytes=1024,now=0}){
    for(const value of [rateBytesPerSecond,burstBytes,quantumBytes])if(!Number.isSafeInteger(value)||value<=0)throw new RangeError('Positive integer transfer budget required');
    if(!Number.isFinite(now)||!Number.isSafeInteger(Math.floor(now*1000)))throw new TypeError('Finite microsecond transfer clock required');
    this.rate=rateBytesPerSecond;this.burst=burstBytes;this.quantum=quantumBytes;
    this.clock=now;this.clockMicros=BigInt(Math.floor(now*1000));this.credit=0n;this.tasks=new Map();this.queue=[];
  }
  get pendingCount(){return this.tasks.size;}
  add(id,bytes,readyAt){
    if(this.tasks.has(id))throw new Error('Duplicate transfer ID');
    if(!Number.isSafeInteger(bytes)||bytes<0||!Number.isFinite(readyAt))throw new RangeError('Finite latency and nonnegative integer bytes required');
    this.tasks.set(id,{remaining:bytes,readyAt,paused:false});this.queue.push(id);
  }
  cancel(id){const removed=this.tasks.delete(id);if(removed)this.queue=this.queue.filter(value=>value!==id);return removed;}
  pause(id,value){const task=this.tasks.get(id);if(task)task.paused=Boolean(value);}
  drain(now){
    if(!Number.isFinite(now)||now<this.clock||!Number.isSafeInteger(Math.floor(now*1000)))throw new RangeError('Transfer clock must be finite and monotonic');
    // Integer microseconds and fractional-byte credit avoid cumulative binary
    // rounding (for example ten 0.3-byte grants otherwise total just below 3).
    const micros=BigInt(Math.floor(now*1000)),maximum=BigInt(this.burst)*1000000n;
    this.credit+=(micros-this.clockMicros)*BigInt(this.rate);
    if(this.credit>maximum)this.credit=maximum;
    this.clock=now;this.clockMicros=micros;
    const allocations=[];
    for(const [id,task]of this.tasks){
      if(!task.paused&&task.readyAt<=now&&task.remaining===0){allocations.push({id,bytes:0,done:true});this.cancel(id);}
    }
    let skipped=0;
    while(this.queue.length&&this.credit>=1000000n&&skipped<this.queue.length){
      const id=this.queue.shift(),task=this.tasks.get(id);
      if(task.paused||task.readyAt>now){this.queue.push(id);skipped++;continue;}
      const count=Math.min(task.remaining,this.quantum,Number(this.credit/1000000n));
      task.remaining-=count;this.credit-=BigInt(count)*1000000n;skipped=0;
      const done=task.remaining===0;allocations.push({id,bytes:count,done});
      if(done)this.tasks.delete(id);else this.queue.push(id);
    }
    return allocations;
  }
}
