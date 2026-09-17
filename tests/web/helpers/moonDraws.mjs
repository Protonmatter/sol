import { BODY, poleVector } from "../../../apps/web/js/bodyData.js";
import { synchronousMoonRotation } from "../../../apps/web/js/moonorbits.js";
import { normalMat3 } from "../../../apps/web/js/orreryMath.js";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** The normal matrix drawMoons must upload for one moon at the harness's render instant. */
export function expectedMoonNormal(h, moon) {
  const t = h.state.renderUnix;
  return normalMat3(synchronousMoonRotation(moon, t, poleVector(BODY[moon.p], t)) || IDENTITY);
}

/** Does an uploaded normal matrix carry this moon's spin frame? */
export function matchesMoonNormal(h, moon, normal) {
  return !!normal && expectedMoonNormal(h, moon).every((value, i) => Math.abs(normal[i] - value) < 1e-6);
}

/** Is this sphere upload one of `parent`'s moons, identified by its own spin frame? */
export function isMoonDraw(h, parent, uniforms) {
  return uniforms.u_mode === 0 && h.moons.some(moon => moon.p === parent && matchesMoonNormal(h, moon, uniforms.u_nmat));
}
