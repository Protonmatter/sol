// Supported model spans are computation limits, not empirical accuracy envelopes.
export const ENGINE_RANGE = { helioYears: 5000, skyYears: 5000 };

// Approved complete UTC calendar years. Being inside this target does not
// certify a quantity before its independent qualification has been accepted.
export const PRECISION_TARGET = Object.freeze({
  startUnix: Date.UTC(1900, 0, 1) / 1000,
  endUnix: Date.UTC(2201, 0, 1) / 1000,
  label: "1900–2200",
});

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

/** Absolute rendered time avoids wall-clock and rounded-year boundary drift.
 * @returns {{level:"good"|"ok"|"rough", text:string}}
 */
export function epochAccuracyAtUnix(unixSeconds, kind) {
  if (!Number.isFinite(unixSeconds)) return {level:"rough",text:"Epoch unavailable; independent accuracy unvalidated."};
  const inside=unixSeconds>=PRECISION_TARGET.startUnix && unixSeconds<PRECISION_TARGET.endUnix;
  const scope=inside
    ? `${PRECISION_TARGET.label} precision qualification is pending.`
    : `Approximate exploration outside ${PRECISION_TARGET.label}.`;
  const limits=kind==="helio"
    ? "Selected model positions remain independently unvalidated."
    : "Sky accuracy remains unvalidated; Earth orientation and star-catalogue limits apply.";
  return {level:inside?"ok":"rough",text:`${scope} ${limits}`};
}

/** Compatibility for offset callers; use the absolute API when time is known. */
export function epochAccuracy(yearsFromNow, kind) {
  return epochAccuracyAtUnix(Date.now()/1000+yearsFromNow*365.25*86400,kind);
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
