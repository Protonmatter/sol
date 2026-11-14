import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import puppeteer from 'puppeteer-core';

test('launch evidence survives actual Puppeteer argument normalization',async()=>{
  const source=fs.readFileSync(new URL('../../tools/browser_validation.mjs',import.meta.url),'utf8');
  const start=source.indexOf('evidence.browser_launch_args='),end=source.indexOf('console.log("Browser validation: Chromium launched")',start);
  assert.ok(start>=0&&end>start);
  const requested='--disable-features=Translate,OptimizationHints';
  const context=vm.createContext({
    launchArgs:[requested],evidence:{},browser:null,saveEvidence:()=>{},browserBinary:()=>'/fixture/chrome',
    puppeteer:{launch:async options=>{
      // Use the installed dependency's real normalizer, which merges feature
      // flags and mutates options.args. No browser or child process is launched.
      const actual=await puppeteer.defaultArgs(options);
      return{version:async()=>'Chrome/fixture',process:()=>({spawnargs:['/fixture/chrome',...actual]})};
    }},
  });
  await vm.runInContext(`(async()=>{${source.slice(start,end)}})()`,context);
  assert.ok(context.evidence.browser_launch_args.includes(requested),'requested feature flag must not disappear from evidence');
  assert.ok(context.evidence.browser_process_args.some(arg=>arg.startsWith('--disable-features=')&&arg.includes('OptimizationHints')));
});
