import assert from 'node:assert/strict';
import test from 'node:test';
import {buildScatteringNodeDiagnostic} from '../../tools/scattering_node_diagnostic.mjs';

const source=`#version 300 es
out vec4 o;
void weight(){
  vec2 columns=max(vec2(0),scatteringViewColumns(columnRay,interval.y)-scatteringViewColumns(columnRay,interval.x));
  vec2 centerT=columns;
  centerT=clamp(centerT,vec2(interval.x),vec2(interval.y));
  // Closed-form density centroids condition the residual at actual endpoints.
}
void main(){
  vec3 residual=vec3(1);bool valid=true;
  o=valid?vec4(residual,1):vec4(0);
}`;

test('diagnostic transformation retains every original formula byte and exact conditioning center body',()=>{
  const result=buildScatteringNodeDiagnostic(source);
  const recovered=result.source.replace(result.declarations,'out vec4 o;').replace(result.helper,'').replace(result.additions,'');
  assert.equal(recovered,source);
  assert.ok(source.includes(result.centerSource));
  assert.ok(result.source.includes('d1=vec4(result.scattering,1);d2=vec4(weight,1);d3=vec4(direction,maximum);'));
});

test('missing, ambiguous and changed final source boundaries fail before a browser launch',()=>{
  for(const changed of [source.replace('out vec4 o;','out vec4 other;'),source+'\n',
    source.replace('out vec4 o;','out vec4 o;\nout vec4 o;'),source.replace('centerT=clamp(','centerT=min('),
    source.replace('void main(){','void different(){')])assert.throws(()=>buildScatteringNodeDiagnostic(changed));
});
