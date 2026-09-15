import assert from "node:assert/strict";
import test from "node:test";
import { visualAssetForBody, textureEligible, visualBrowsePreview, missingDetailColor, visualProvenanceText } from "../../apps/web/js/visualAssets.js";

test("official byte identity permits browse, not unqualified global mapping", () => {
  assert.equal(textureEligible("Earth", "browse-preview"), true);
  assert.equal(textureEligible("Earth"), false);
  assert.equal(textureEligible("Callisto"), false);
  assert.equal(textureEligible("Earth", "generated-map"), false);
  assert.equal(visualBrowsePreview("Earth").path, "textures/earth.jpg");
  assert.match(visualProvenanceText("Earth"), /Official source bytes verified/);
});

test("held and unknown assets fail closed", () => {
  assert.equal(textureEligible("Sun", "observed-disk"), false);
  assert.equal(textureEligible("saturn_ring", "ring-profile"), false);
  assert.equal(textureEligible("Pluto"), false);
  assert.equal(visualBrowsePreview("Mercury"), null);
  assert.equal(visualAssetForBody("Pluto"), null);
});

test("fallback colors never supply imaginary detail or calibrated color claims", () => {
  assert.deepEqual(missingDetailColor("Unknown"), [0.55, 0.55, 0.55]);
  assert.match(visualProvenanceText("Unknown"), /not a measurement/);
  assert.match(visualProvenanceText("Titan"), /RGB illustrative/);
  const color = missingDetailColor("Titan");
  color[0] = 0;
  assert.notEqual(missingDetailColor("Titan")[0], 0);
  assert.ok(Object.isFrozen(visualAssetForBody("Earth")));
});
