import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { startWorkerCoverage, closeOwnedBrowser } from "../../tools/worker_coverage.mjs";

function fixture(failure) {
  const calls = [];
  const child = new EventEmitter();
  child.send = async (method) => {
    calls.push(method);
    if (method === failure) throw new Error("instrumentation failed");
    if (method === "Profiler.takePreciseCoverage") return { result: [{ scriptId: "1", functions: [] }] };
    if (method === "Debugger.getScriptSource") return { scriptSource: "export const value = 1;" };
    return {};
  };
  const parent = new EventEmitter();
  parent.connection = () => ({ session: () => child });
  parent.send = async (method) => { calls.push(method); };
  parent.detach = async () => { calls.push("detach"); };
  return { calls, child, parent, page: { createCDPSession: async () => parent } };
}

test("worker coverage arms before resume and captures precise source", async () => {
  const f = fixture(); const capture = await startWorkerCoverage(f.page);
  f.parent.emit("Target.attachedToTarget", { sessionId: "worker" });
  await new Promise(setImmediate);
  f.child.emit("Debugger.scriptParsed", { scriptId: "1", url: "http://127.0.0.1/js/worker.js" });
  await capture.collect();
  assert.ok(f.calls.indexOf("Profiler.startPreciseCoverage") < f.calls.indexOf("Runtime.runIfWaitingForDebugger"));
  assert.equal(capture.entries[0].text, "export const value = 1;");
  assert.deepEqual(capture.errors, []);
  await capture.dispose();
  assert.ok(f.calls.includes("detach"));
});

test("instrumentation failure still resumes worker and remains visible", async () => {
  const f = fixture("Debugger.enable"); const capture = await startWorkerCoverage(f.page);
  f.parent.emit("Target.attachedToTarget", { sessionId: "worker" });
  await capture.collect();
  assert.ok(f.calls.includes("Runtime.runIfWaitingForDebugger"));
  assert.match(capture.errors.join(" "), /instrumentation failed/);
  await capture.dispose();
});

test("bounded cleanup kills only the launched child when close stalls", async () => {
  const kills = []; const messages = [];
  const child = { exitCode: null, signalCode: null, kill: (signal) => { kills.push(signal); return true; } };
  await closeOwnedBrowser({ close: () => new Promise(() => {}), process: () => child }, { timeoutMs: 5, diagnostic: message => messages.push(message) });
  assert.deepEqual(kills, ["SIGKILL"]);
  assert.match(messages.join(" "), /deadline/);
});

test("normal cleanup and already exited browser never kill a process", async () => {
  let kills = 0;
  const child = { exitCode: 0, signalCode: null, kill: () => { kills++; } };
  await closeOwnedBrowser({ close: async () => {}, process: () => child }, { timeoutMs: 5 });
  await closeOwnedBrowser({ close: async () => { throw new Error("closed"); }, process: () => child }, { timeoutMs: 5, diagnostic: () => {} });
  assert.equal(kills, 0);
});

test("stalled instrumentation has a deadline and still resumes the worker", async () => {
  const f = fixture(); const send = f.child.send;
  f.child.send = method => method === "Debugger.enable" ? new Promise(() => {}) : send(method);
  const capture = await startWorkerCoverage(f.page, { timeoutMs: 5 });
  f.parent.emit("Target.attachedToTarget", { sessionId: "worker" });
  await capture.collect();
  assert.match(capture.errors.join(" "), /deadline/);
  assert.ok(f.calls.includes("Runtime.runIfWaitingForDebugger"));
  await capture.dispose();
});

test("unexpected collection Target errors are not silently treated as cancellation", async () => {
  const f = fixture(); const send = f.child.send;
  f.child.send = method => method === "Profiler.takePreciseCoverage"
    ? Promise.reject(new Error("Target protocol failure")) : send(method);
  const capture = await startWorkerCoverage(f.page);
  f.parent.emit("Target.attachedToTarget", { sessionId: "worker" });
  await capture.collect();
  assert.match(capture.errors.join(" "), /Target protocol failure/);
  await capture.dispose();
});
