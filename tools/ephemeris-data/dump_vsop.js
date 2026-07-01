global.THREE = { Matrix3:function(){this.set=function(){return this;}}, Vector3:function(x,y,z){this.x=x;this.y=y;this.z=z;this.applyMatrix3=function(){return this;};} };
global.Orbit = function(o){ Object.assign(this,o); };
const fs=require('fs'), vm=require('vm');
vm.runInThisContext(fs.readFileSync('vsop2013_normal.js','utf8'));
const v = globalThis.vsop2013;
const out = {};
for (const key of ['mer','ven','emb','mar','jup','sat','ura','nep']) {
  const th = v[key];
  out[key] = { GM: th.GM, gmm: th.givesMeanMotion||0, coeffs: th.coeffs };
}
fs.writeFileSync('vsop2013_data.json', JSON.stringify(out));
const sz = fs.statSync('vsop2013_data.json').size;
console.log('wrote vsop2013_data.json', (sz/1024).toFixed(0),'KB');
// term counts per planet (sum over elements/powers of triplets)
for (const key of Object.keys(out)) {
  let n=0; const c=out[key].coeffs;
  for (const el of ['a','L','k','h','q','p']) for (const pw of c[el]) n += pw.length/3;
  console.log(key, 'terms:', n, 'GM:', out[key].GM.toFixed(6));
}
