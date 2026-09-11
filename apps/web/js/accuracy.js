// Supported model spans are computation limits, not empirical accuracy envelopes.
export const ENGINE_RANGE = { helioYears: 5000, skyYears: 5000 };

function usableSourceParityRecord(record) {
  if (!record || record.method!=="source_theory_parity") return false;
  const nonempty=value=>typeof value==="string" && value.trim().length>0;
  const reference=record.reference, error=record.measured_error;
  return [record.id,record.body,record.quantity,record.time_scale,record.observer_domain,record.limitations].every(nonempty)
    && Array.isArray(record.tested_epochs_jd) && record.tested_epochs_jd.length>0 && record.tested_epochs_jd.every(Number.isFinite)
    && reference && nonempty(reference.git_revision) && /^[a-f0-9]{40}$/i.test(reference.git_revision)
    && nonempty(reference.sha256_lf) && /^[a-f0-9]{64}$/i.test(reference.sha256_lf)
    && nonempty(reference.path) && nonempty(reference.symbol)
    && Array.isArray(reference.vector_au) && reference.vector_au.length===3 && reference.vector_au.every(Number.isFinite)
    && error && nonempty(error.metric) && Number.isFinite(error.value) && error.value>=0
    && Number.isFinite(error.acceptance_threshold) && error.acceptance_threshold>0 && error.value<error.acceptance_threshold;
}

/** Select only exact recorded body/quantity/observer/epoch evidence; never interpolate a claim. */
export function accuracyForSelection(records, {body,quantity,jd,observerDomain}) {
  // No accepted independent registry is supported yet. An arbitrary method string,
  // even with an apparently passing measurement, must never certify UI accuracy.
  const matches=(Array.isArray(records) ? records : []).filter(r=>usableSourceParityRecord(r) && r.body===body && r.quantity===quantity && r.observer_domain===observerDomain && r.tested_epochs_jd.includes(jd));
  return {status:"unvalidated",recordIds:matches.map(r=>r.id),text:matches.length
    ? "Independent accuracy unvalidated; source-theory parity is recorded at this sample only."
    : "Unvalidated for this body, quantity, observer domain and selected epoch."};
}

/** @returns {{level:"good"|"ok"|"rough", text:string}} */
export function epochAccuracy(yearsFromNow, kind) {
  return {level:Math.abs(yearsFromNow)>300 && kind==="sky" ? "rough" : "ok",
    text:kind==="helio"
      ? "Selected epoch unvalidated. VSOP2013/TOP2013 source-theory sample parity is not independent accuracy over a time span."
      : "Selected sky epoch unvalidated. Earth orientation, historical time-scale approximations and catalogue-star simplifications add uncertainty; dates use the proleptic Gregorian calendar."};
}

export function renderedEpochLabel(unixSeconds) {
  if (!Number.isFinite(unixSeconds)) return "Render time unavailable";
  const date = new Date(unixSeconds * 1000);
  return Number.isFinite(date.getTime()) ? `${date.toISOString().replace("T", " ").replace(".000Z", " UTC")} (proleptic Gregorian)` : "Render time outside supported calendar";
}

// A compact human label for a year offset from the present. The base year is read from the
// clock — a hardcoded 2026 would silently mislabel every epoch from 2027 onward.
export function epochLabel(yearsFromNow) {
  const yr = Math.round(new Date().getFullYear() + yearsFromNow);
  if (yr <= 0) return `${Math.abs(yr - 1)} BCE`;   // no year 0
  return `${yr} CE`;
}
