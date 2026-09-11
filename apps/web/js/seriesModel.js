// One slot per manifest entry, including failed loads; array indices never relabel time.
export function makeSeriesRecords(manifest, frames) {
  if (!Array.isArray(manifest?.frames)) throw new Error("Series manifest needs frames");
  const names = new Set();
  let previous = -Infinity;
  return manifest.frames.map((entry, index) => {
    if (typeof entry.file !== "string" || !/^[a-zA-Z0-9_-]+\.json$/.test(entry.file) || names.has(entry.file)) throw new Error("Invalid or duplicate series file");
    if (!Number.isFinite(entry.months) || entry.months < 0 || entry.months <= previous) throw new Error("Series months must strictly increase");
    previous = entry.months;
    names.add(entry.file);
    const snapshot = frames[index] || null;
    return Object.freeze({ ...entry, id: entry.file, index, snapshot, status: snapshot ? "ready" : "unavailable" });
  });
}

export function seriesPosition(records, index) {
  if (!records[index]) return null;
  if (records.length === 1) return 0.5;
  return (records[index].months - records[0].months) / (records.at(-1).months - records[0].months);
}

export function nextAvailableFrame(records, current, direction = 1) {
  if (!records.length) return null;
  for (let offset = 1; offset <= records.length; offset++) {
    const index = ((current + offset * direction) % records.length + records.length) % records.length;
    if (records[index].status === "ready") return { index, skipped: offset - 1 };
  }
  return null;
}

export function nearestSeriesFrame(records, fraction) {
  if (!records.length || !Number.isFinite(fraction)) return null;
  let best = 0, distance = Infinity;
  for (let index = 0; index < records.length; index++) {
    const delta = Math.abs(seriesPosition(records, index) - fraction);
    if (delta < distance) { best = index; distance = delta; }
  }
  return best;
}
