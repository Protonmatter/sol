import assert from "node:assert/strict";
import test from "node:test";
import { orreryHarness } from "./helpers/orreryHarness.mjs";

function metric(host, name) {
  return host.querySelectorAll("[data-metric]").find(node => node.dataset.metric === name)?.textContent;
}

test("current System metadata publication refreshes its timestamp and selected facts without rewinding rendered positions", async t => {
  const h = await orreryHarness(t, { controls: true });
  await h.enterOrrery();
  h.input("orrerySearch", "");
  const earth = h.nodes.orreryPositions.children.find(node => node.dataset.objectId === "Earth");
  earth.click();
  assert.equal(h.state.selected, "Earth");

  h.state.bodies.find(body => body.name === "Earth").speed_kms = 9;
  h.holdSnapshots();
  h.advanceMonotonicTime(1000);
  h.frame(1000);
  const metadataRequest = h.requests.length - 1;
  const metadataUnix = h.requests[metadataRequest];
  assert.equal(metric(h.nodes.orreryDetail, "Orbital speed"), "9.00 km/s");

  h.frame(1050);
  const currentRenderUnix = h.state.renderUnix;
  assert.ok(currentRenderUnix > metadataUnix, "rendering advances while metadata work is delayed");
  h.completeSnapshot(metadataRequest);
  await h.settle();

  assert.equal(h.state.metadataUnix, metadataUnix);
  assert.equal(h.state.renderUnix, currentRenderUnix, "delayed metadata cannot rewind the rendered epoch");
  assert.equal(h.positionEpochs.at(-1), currentRenderUnix, "published metadata is projected onto current marker positions");
  assert.match(h.nodes.orreryMetadataEpoch.textContent, /2027-01-15 08:00:57\.600Z/);
  assert.equal(metric(h.nodes.orreryDetail, "Orbital speed"), "1.00 km/s");
  assert.match(h.nodes.orrerySelectedEpoch.textContent, /Earth.*2027-01-15 08:03:57\.600Z/);
  h.leaveOrrery();
});

test("cancelled System metadata completion cannot publish facts or clocks", async t => {
  const h = await orreryHarness(t, { controls: true });
  await h.enterOrrery();
  h.input("orrerySearch", "");
  h.nodes.orreryPositions.children.find(node => node.dataset.objectId === "Earth").click();
  h.state.bodies.find(body => body.name === "Earth").speed_kms = 9;
  h.holdSnapshots();
  h.advanceMonotonicTime(1000);
  h.frame(1000);
  const obsoleteRequest = h.requests.length - 1;
  const retainedMetadataUnix = h.state.metadataUnix;
  const retainedLabel = h.nodes.orreryMetadataEpoch.textContent;
  const retainedFact = metric(h.nodes.orreryDetail, "Orbital speed");

  h.leaveOrrery();
  h.completeSnapshot(obsoleteRequest);
  await h.settle();

  assert.equal(h.state.metadataUnix, retainedMetadataUnix);
  assert.equal(h.nodes.orreryMetadataEpoch.textContent, retainedLabel);
  assert.equal(metric(h.nodes.orreryDetail, "Orbital speed"), retainedFact);
});
