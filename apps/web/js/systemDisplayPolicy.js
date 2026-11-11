// Presentation policy only: ephemeris coordinates and catalogue elements stay immutable.
// Overview may enlarge bodies for visibility. Inspection restores physical relative
// radii and offsets; the camera, rather than moon enlargement, makes the target visible.
export function resolveSystemDisplayPolicy({trueScale=false, galaxy=false, topDown=false,
  focus='overview', anchor='Sun', inspectable=true}={}) {
  const framing = galaxy || topDown || !inspectable ? 'overview' : focus;
  // The Sun's dedicated appearance modes retain their own display envelope.
  const inspection = framing !== 'overview' && anchor !== 'Sun';
  return {
    mode: trueScale ? 'true-scale' : framing,
    framing,
    physicalGeometry: trueScale || inspection,
    canEnlarge: !trueScale && !inspection,
  };
}
