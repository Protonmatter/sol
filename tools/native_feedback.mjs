export function interactionLatency(item){
  const {inputTimeMs,captureTimeMs,paintTimeMs,durationMs}=item;
  if(![inputTimeMs,captureTimeMs,paintTimeMs,durationMs].every(Number.isFinite)||inputTimeMs<0||inputTimeMs>captureTimeMs+1||paintTimeMs<captureTimeMs)throw new TypeError('Invalid interaction timestamp clock domain');
  const elapsed=paintTimeMs-inputTimeMs;
  if(Math.abs(elapsed-durationMs)>1e-6)throw new TypeError('Interaction duration omits input delay or differs from timestamps');
  return elapsed;
}

// The native next-render duration is rounded to the nearest8ms. Preserve a4ms
// upper bound and retain the existing frame probe, rather than choosing the faster.
// https://www.w3.org/TR/2026/WD-event-timing-20261013/
export function assessedFeedbackLatency(record){
  const probe=interactionLatency(record),native=record.nativeTiming;
  if(native?.supported!==true||native.thresholdMs!==16||record.domReadyInDispatch!==true
    ||record.feedbackVisible!==true
    ||!Number.isFinite(record.domReadyAtMs)||record.domReadyAtMs<record.captureTimeMs-1
    ||!Number.isFinite(record.geometryConfirmedAtMs)||record.geometryConfirmedAtMs<record.captureTimeMs-1
    ||record.geometryConfirmedAtMs>record.paintTimeMs)throw new Error('Native feedback evidence missing or asynchronous');
  let upper;
  if(native.source==='entry'){
    const entry=native.entry;
    if(native.matchCount!==1||native.targetMatched!==true||entry?.name!=='click'
      ||![entry.startTime,entry.duration,entry.processingStart,entry.processingEnd,entry.interactionId].every(Number.isFinite)
      ||Math.abs(entry.startTime-record.inputTimeMs)>1||entry.duration<0||entry.duration%8!==0||entry.interactionId<=0
      ||entry.processingStart<entry.startTime-1||entry.processingEnd<entry.processingStart
      ||entry.processingEnd>entry.startTime+entry.duration+4||record.domReadyAtMs>entry.processingEnd+1)throw new Error('Native click identity/timing mismatch');
    upper=entry.duration+4;
  }else throw new Error('Unknown native feedback evidence; missing native click timing is inconclusive');
  return Math.max(probe,upper);
}
