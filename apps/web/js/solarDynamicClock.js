// One absolute scenario clock for every modeled layer. Observations and orbits
// retain their own epochs; no accumulated shader time or hidden catch-up.
export const SOLAR_DYNAMIC_RATES = Object.freeze([1,60,600,7200]);
/** @typedef {{seconds:number,anchor:number,rate:number,duration:number,playing:boolean,reason:string}} SolarDynamicClock */
/** @typedef {{type:string,seconds?:number,rate?:number}} SolarClockEvent */

function validate(state, now) {
  if(!state||![state.seconds,state.anchor,state.rate,state.duration,now].every(Number.isFinite)
    ||state.duration<=0||state.duration>1209600||state.seconds<0||state.seconds>state.duration
    ||state.anchor<0||now<state.anchor||!SOLAR_DYNAMIC_RATES.includes(state.rate)
    ||typeof state.playing!=='boolean')throw new RangeError('Invalid solar scenario clock');
}

/** @returns {Readonly<SolarDynamicClock>} */
export function createSolarDynamicClock({duration=21600,rate=60}={}) {
  const state={seconds:0,anchor:0,rate,duration,playing:false,reason:'paused'};
  validate(state,0);return Object.freeze(state);
}

/** @param {SolarDynamicClock} state @param {number} now */
export function solarClockTime(state,now) {
  validate(state,now);
  return Math.min(state.duration,state.seconds+(state.playing?(now-state.anchor)*state.rate:0));
}

/** @param {SolarDynamicClock} state @param {SolarClockEvent} event @param {number} now
 * @returns {Readonly<SolarDynamicClock>} */
export function transitionSolarClock(state,event,now) {
  const seconds=solarClockTime(state,now);
  const next={...state,seconds,anchor:now};
  if(seconds===state.duration){next.playing=false;next.reason='ended';}
  switch(event.type) {
    case 'tick': break;
    case 'play': next.playing=seconds<state.duration;next.reason=next.playing?'playing':'ended';break;
    case 'pause': case 'background': case 'reduced-motion': case 'loading':
      next.playing=false;next.reason=event.type;break;
    case 'seek':
      if(!Number.isFinite(event.seconds)||event.seconds<0||event.seconds>state.duration)
        throw new RangeError('Solar seek is outside the scenario interval');
      next.seconds=event.seconds;next.playing=false;next.reason=next.seconds===state.duration?'ended':'paused';break;
    case 'rate':
      if(!SOLAR_DYNAMIC_RATES.includes(event.rate))throw new RangeError('Unsupported solar playback rate');
      next.rate=event.rate;break;
    case 'replay': next.seconds=0;next.playing=true;next.reason='playing';break;
    default: throw new RangeError('Unknown solar clock action');
  }
  return Object.freeze(next);
}
