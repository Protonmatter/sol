import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const execute = promisify(execFile);
const collectorPath = fileURLToPath(new URL('./texture_device_memory.ps1', import.meta.url));
const counters = ['shared usage','dedicated usage','total committed'];
const bytes = value => Number.isFinite(value) && value >= 0;

export function classifyTextureBackend(renderer) {
  const name = typeof renderer === 'string' ? renderer : '';
  const kind = /swiftshader|llvmpipe|softpipe|software|\bwarp\b|microsoft basic render/i.test(name) ? 'software'
    : /adreno|nvidia|radeon|intel|apple.*gpu/i.test(name) ? 'native-device' : 'unverified';
  return {kind,basis:'Observed WebGL renderer string; requested launch mode alone does not attest hardware execution'};
}

export function summarizeDeviceMemory(observation) {
  const processes = observation.processes ?? [];
  const pids = new Set(processes.map(p=>p.pid));
  const gpuPids = new Set(processes.filter(p=>p.type==='GPU').map(p=>p.pid));
  const sum = (selected,key) => selected.length && selected.every(p=>bytes(p[key])) ? selected.reduce((n,p)=>n+p[key],0) : null;
  const result = {
    basis:'OS process and WDDM counter observations; not attributable texture VRAM. Working sets may share pages; committed bytes are not physical residency.',
    owned_process_private_bytes:sum(processes,'private_bytes'),
    owned_process_working_set_sum_bytes:sum(processes,'working_set_bytes'),
    gpu_process_private_bytes:sum(processes.filter(p=>gpuPids.has(p.pid)),'private_bytes'),
    gpu_process_counters:Object.fromEntries(counters.map(name=>[name,null])),
  };
  const seen = new Set();
  for (const counter of observation.gpu_counters ?? []) {
    assert.ok(pids.has(counter.pid),'GPU counter PID is not an observed owned process');
    const key = `${counter.pid}:${counter.adapter}:${counter.counter}`;
    assert.ok(!seen.has(key),'Duplicate GPU counter instance');seen.add(key);
  }
  for (const name of counters) {
    const rows = (observation.gpu_counters ?? []).filter(c=>gpuPids.has(c.pid)&&c.counter===name);
    if (observation.gpu_counters_status==='available' && rows.length && rows.every(c=>c.status===0&&bytes(c.bytes)))
      result.gpu_process_counters[name]=rows.reduce((n,c)=>n+c.bytes,0);
  }
  return result;
}

export async function captureDeviceMemory(browser, {label, page, includeDevices=false}={}) {
  const result={label,requested_at:new Date().toISOString(),status:'unavailable'};
  const cdp=await browser.target().createCDPSession();
  try {
    const {processInfo}=await cdp.send('SystemInfo.getProcessInfo');
    const owned=processInfo.map(p=>({pid:p.id,type:p.type}));
    assert.ok(owned.length>0&&owned.length<=64&&owned.every(p=>Number.isSafeInteger(p.pid)&&p.pid>0),'Invalid owned Chromium process IDs');
    result.process_identity={basis:'SystemInfo.getProcessInfo from the exclusively launched browser CDP session',observed_at:new Date().toISOString(),processes:owned};
    if (page) {
      const metrics=await page.metrics();
      result.page_js_heap={used_bytes:metrics.JSHeapUsedSize,total_bytes:metrics.JSHeapTotalSize,
        observed_at:new Date().toISOString(),basis:'CDP page JavaScript heap; excludes image pixels, workers, GPU and total process memory'};
    }
    if(process.platform!=='win32') {result.reason='Windows GPU Process Memory collector unavailable on this platform';return result;}
    const args=['-NoProfile','-NonInteractive','-File',collectorPath,'-ProcessIds',owned.map(p=>p.pid).join(',')];
    if(includeDevices)args.push('-IncludeDeviceInventory');
    const {stdout}=await execute('powershell.exe',args,{windowsHide:true,timeout:15000,maxBuffer:1024*1024});
    const observation=JSON.parse(stdout.trim());
    const types=new Map(owned.map(p=>[p.pid,p.type]));
    for(const process of observation.processes??[]) {
      assert.ok(types.has(process.pid),'Collector returned an unowned process');process.type=types.get(process.pid);
    }
    Object.assign(result,observation);
    result.summary=summarizeDeviceMemory(observation);
  }catch(error){result.status='unavailable';result.reason=error.message.slice(0,240);}
  finally{result.finished_at=new Date().toISOString();await cdp.detach();}
  return result;
}
