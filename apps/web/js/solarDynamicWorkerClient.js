import {LatestWorkerClient} from './workerClient.js';
import {validateAppearanceRequest} from './solarDynamicSampling.js';
import {validateDynamicPacket} from './solarDynamicAssets.js';

export function createSolarAppearanceClient() {
  return new LatestWorkerClient({engine:'solar-appearance',schema:'solar-render-packet.v1',release:'__SOL_RELEASE_ID__',
    createWorker:()=>new Worker(new URL('./solarDynamicWorker.js',import.meta.url),{type:'module',name:'Sol appearance'}),
    validateRequest:validateAppearanceRequest,validateResult:validateDynamicPacket,deadlineMs:10000});
}
