// Retain raw browser reports. Only a uniquely correlated, fully consumed,
// release-bound and transaction-validated JSON read can explain ERR_ABORTED.
export function classifyCompleteReadCancellations({failures,fetches,network,expectedAssets,identity,expectedIdentity}){
  const expected=[],unexpected=[];
  const fields=['bundle_id','source_bundle_id','manifest_sha256'];
  const validated=identity&&expectedIdentity&&Object.keys(identity).length===fields.length
    &&fields.every(field=>typeof expectedIdentity[field]==='string'&&identity[field]===expectedIdentity[field]);
  for(const failure of failures){
    const observations=fetches.filter(row=>row.url===failure.url),requests=network.filter(row=>row.url===failure.url);
    const asset=expectedAssets[failure.url],observation=observations[0],request=requests[0];
    const matches=validated&&failure.errorText==='net::ERR_ABORTED'&&failure.status===200
      &&failures.filter(row=>row.url===failure.url).length===1&&observations.length===1&&requests.length===1
      &&asset&&Number.isSafeInteger(asset.size)&&asset.size>=0&&/^[0-9a-f]{64}$/.test(asset.sha256)
      &&observation.status===200&&observation.eof===true&&observation.bytesRead===asset.size
      &&observation.signalAborted===false&&observation.cancelled===false&&!observation.error
      &&request.status===200&&request.error==='net::ERR_ABORTED'&&request.cancelled===true&&request.receivedBytes===asset.size;
    (matches?expected:unexpected).push(failure);
  }
  return {expected,unexpected};
}
