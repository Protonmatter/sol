// Only the one deliberately delivered critical-integrity failure is expected.
export function classifyReleaseCacheErrors(events,{faultConfirmed,faultDelivered,workerURLs}){
  const expected=[],unexpected=[];
  for(const event of events){
    const matches=faultConfirmed&&faultDelivered&&event.active===2&&event.corrupt===true
      &&typeof event.message==='string'&&event.message.startsWith('Error: Critical asset hash mismatch\n')
      &&event.message.includes('at verifyResponse ')&&workerURLs.includes(event.target);
    if(matches&&expected.length===0)expected.push(event);else unexpected.push(event);
  }
  return {expected,unexpected};
}
