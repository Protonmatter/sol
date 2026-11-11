// Display resolution only. CPU submission and RAF delivery are heuristics, not
// GPU/compositor measurements or scientific accuracy/performance qualifications.
const TIERS=['low','balanced','high'];
const SCALES={low:.6,balanced:.8,high:1};
export function effectiveRenderDpr(deviceRatio,quality){
  const ratio=Number.isFinite(deviceRatio)&&deviceRatio>0?Math.min(deviceRatio,2):1;
  return ratio*quality.scale;
}

export function createRenderQuality(){
  let mode='auto',tier=2,current,lastTimestamp=null,lastChange=-Infinity,warmup=2,overload=0,underload=0;
  function publish(reason){current=Object.freeze({mode,tier:TIERS[tier],scale:SCALES[TIERS[tier]],reason});}
  function resetEvidence(){warmup=2;overload=0;underload=0;lastTimestamp=null;}
  publish('Initial display resolution.');
  return {
    get current(){return current;},
    setMode(value){
      mode=TIERS.includes(value)?value:'auto';tier=mode==='auto'?2:TIERS.indexOf(mode);
      resetEvidence();lastChange=-Infinity;publish(mode==='auto'?'Automatic assessment restarted.':'User-selected display resolution.');
    },
    observe(sample){
      if(mode!=='auto')return false;
      const {timestamp,frameMs,continuous,completed,rendered}=sample;
      if(!completed||!rendered||!Number.isFinite(timestamp)||!Number.isFinite(frameMs)||frameMs<0){resetEvidence();return false;}
      if(lastTimestamp!==null&&(timestamp<=lastTimestamp||(timestamp-lastTimestamp>250&&!sample.continuation)))resetEvidence();
      // A resumed continuous chain has no interval; exclude its startup history.
      if(continuous&&sample.intervalMs===null&&!sample.continuation)resetEvidence();
      lastTimestamp=timestamp;
      if(warmup){warmup--;return false;}
      const interval=continuous&&Number.isFinite(sample.intervalMs)&&sample.intervalMs>0&&sample.intervalMs<=250?sample.intervalMs:null;
      const slow=frameMs>24||(interval!==null&&interval>28)
        ||(sample.inputToSubmitMs>50&&(frameMs>16||(interval!==null&&interval>22)));
      const spare=continuous&&interval!==null&&frameMs<10&&interval<19;
      overload=slow?Math.min(8,overload+1):0;
      underload=spare?Math.min(180,underload+1):0;
      if(overload===8&&tier>0&&timestamp-lastChange>=1500){
        tier--;lastChange=timestamp;resetEvidence();publish('Sustained frame work or delivery delay.');return true;
      }
      if(underload===180&&tier<2&&timestamp-lastChange>=6000){
        tier++;lastChange=timestamp;resetEvidence();publish('Sustained frame headroom.');return true;
      }
      return false;
    },
  };
}
