import { INDEPENDENT_EVIDENCE_BINDING } from "./independentEvidenceBinding.js";

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
export function accuracyForSelection(records, selection = {}) {
  const {body,quantity,jd,observerDomain} = selection;
  if (admittedIndependent.has(records)) return independentSelection(records, selection);
  // Raw caller records can describe parity only. Independent measurements require
  // exact-byte admission against the generated, build-validated release binding.
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


// Admission is an integrity boundary within this release, not a digital signature.
// Only the offline validator/build can verify current Rust and reference files.
const admittedIndependent = new WeakSet();
const INDEPENDENT_DOMAIN = Object.freeze({quantity:"geometric_cartesian_position",
  frame:"ecliptic_J2000_ICRF_IAU76",units:"AU",time_scale:"TDB",observer_domain:"body_center",
  corrections:"NONE",model_argument_policy:"TT_equal_to_reference_TDB"});
const NATIVE_EXECUTION = "native_f64_system_abi";
function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Admit exact release bytes only. A supplied method/ID/passing flag is insufficient.
 * Returns null when evidence is unavailable, stale, malformed or altered.
 */
export async function admitIndependentEvidence(raw) {
  if (!(raw instanceof Uint8Array) || raw.byteLength > 1024*1024
      || !/^[a-f0-9]{64}$/.test(INDEPENDENT_EVIDENCE_BINDING.registrySha256 || "")) return null;
  try {
    // Copy before asynchronous hashing: the caller must not mutate bytes between
    // the integrity check and JSON decoding.
    const bytes = new Uint8Array(raw);
    const digest = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256",bytes)),
      value=>value.toString(16).padStart(2,"0")).join("");
    if (digest !== INDEPENDENT_EVIDENCE_BINDING.registrySha256) return null;
    const document=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
    if (document.schema_version!==INDEPENDENT_EVIDENCE_BINDING.schemaVersion
        || document.native_source_digest!==INDEPENDENT_EVIDENCE_BINDING.nativeSourceDigest
        || document.method!=="independent_reference" || document.execution!==NATIVE_EXECUTION
        || Object.keys(INDEPENDENT_DOMAIN).some(key=>document.domain?.[key]!==INDEPENDENT_DOMAIN[key])
        || document.acceptance?.metric!=="relative_vector_norm_arcsec" || document.acceptance.maximum!==10
        || !Array.isArray(document.records) || document.records.length!==160) return null;
    const ids=new Set();
    for (const row of document.records) {
      if (typeof row.id!=="string" || ids.has(row.id) || !Number.isFinite(row.jd_tdb)
          || ![row.relative_vector_norm_arcsec,row.angular_error_arcsec,row.radial_error_ppm,
            row.tt_argument_error_seconds].every(Number.isFinite)
          || row.relative_vector_norm_arcsec<0 || row.angular_error_arcsec<0
          || Math.abs(row.tt_argument_error_seconds)>0.001
          || row.passed!==(row.relative_vector_norm_arcsec<=10)) return null;
      ids.add(row.id);
    }
    deepFreeze(document);admittedIndependent.add(document);return document;
  } catch { return null; }
}

function independentSelection(document, selection) {
  const domain=document.domain;
  const exactDomain=selection.quantity===domain.quantity && selection.frame===domain.frame
    && selection.timeScale===domain.time_scale && selection.observerDomain===domain.observer_domain
    && selection.modelArgumentPolicy===domain.model_argument_policy && selection.execution===document.execution;
  const matches=exactDomain ? document.records.filter(row=>row.passed && row.body===selection.body
    && row.case===selection.case && row.center_id===selection.centerId && row.jd_tdb===selection.jd) : [];
  return matches.length ? {status:"sampled",recordIds:matches.map(row=>row.id),
    text:`Independent native geometric comparison at this exact model sample only: ${matches[0].relative_vector_norm_arcsec.toPrecision(6)} arcsecond-equivalent relative vector residual. No continuous-date or WASM numerical qualification.`}
    : {status:"unvalidated",recordIds:[],text:"Unvalidated for this execution, body, quantity, frame, time scale, origin and exact model sample."};
}

/** Historical sample summary; deliberately independent of any rendered UTC date. */
export function independentEvidenceSummary(document, caseId) {
  if (!admittedIndependent.has(document)) return null;
  const rows=document.records.filter(row=>row.case===caseId);
  if (!rows.length) return null;
  return {case:caseId,body:rows[0].body,centerId:rows[0].center_id,samples:rows.length,
    maximumRelativeVectorArcsec:Math.max(...rows.map(row=>row.relative_vector_norm_arcsec)),
    maximumAngularArcsec:Math.max(...rows.map(row=>row.angular_error_arcsec)),
    maximumAbsoluteRadialPpm:Math.max(...rows.map(row=>Math.abs(row.radial_error_ppm))),
    passed:rows.every(row=>row.passed),
    text:`${rows.length} recorded native geometric samples for ${rows[0].body}, origin ${rows[0].center_id}. These measurements do not qualify the current UTC selection or a continuous date range; WASM numerical parity was not measured.`};
}
