import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { TargetCloseError } from "puppeteer-core";
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

const workerCommands = [
  "Debugger.enable", "Profiler.enable", "Profiler.startPreciseCoverage",
  "Runtime.runIfWaitingForDebugger", "Profiler.takePreciseCoverage", "Debugger.getScriptSource",
];

async function interruptedCapture(method, { error, detachSession = "worker", stall = false } = {}) {
  const f = fixture(); const send = f.child.send;
  let interrupted = false;
  let closed = false;
  f.child.send = command => {
    if (closed) return Promise.reject(new TargetCloseError(`Protocol error (${command}): Session closed`));
    if (command !== method) return send(command);
    f.calls.push(command);
    interrupted = true;
    const operation = stall ? new Promise(() => {}) : Promise.reject(error);
    // Puppeteer closes pending callbacks, then synchronously forwards this event.
    // Promise handlers run only after the exact session detach has been delivered.
    if (detachSession !== null) f.parent.emit("Target.detachedFromTarget", { sessionId: detachSession });
    closed = detachSession === "worker";
    return operation;
  };
  const capture = await startWorkerCoverage(f.page, { timeoutMs: 10 });
  try {
    f.parent.emit("Target.attachedToTarget", { sessionId: "worker" });
    await new Promise(setImmediate);
    f.child.emit("Debugger.scriptParsed", { scriptId: "1", url: "http://127.0.0.1/js/worker.js" });
    await capture.collect();
    assert.ok(interrupted, `did not exercise ${method}`);
    return capture;
  } finally {
    await capture.dispose();
  }
}

test("confirmed worker detach cancels closed-target operations without inventing coverage", async t => {
  for (const method of workerCommands) {
    await t.test(method, async () => {
      const capture = await interruptedCapture(method, {
        error: new TargetCloseError(`Protocol error (${method}): Target closed`),
      });
      assert.deepEqual(capture.errors, []);
      assert.deepEqual(capture.entries, []);
    });
  }
});

test("closed-target errors require a detach event for that exact worker", async t => {
  for (const detachSession of [null, "unrelated-worker"]) {
    for (const method of workerCommands) {
      await t.test(`${method}: ${detachSession ?? "no detach event"}`, async () => {
        const capture = await interruptedCapture(method, {
          error: new TargetCloseError(`Protocol error (${method}): Target closed`), detachSession,
        });
        assert.ok(capture.errors.includes(`Protocol error (${method}): Target closed`));
      });
    }
  }
});

test("detach cannot hide arbitrary instrumentation errors containing Target", async t => {
  for (const method of workerCommands) {
    await t.test(method, async () => {
      const capture = await interruptedCapture(method, { error: new Error(`Target protocol failure in ${method}`) });
      assert.ok(capture.errors.includes(`Target protocol failure in ${method}`));
    });
  }
});

test("detach cannot hide a stalled instrumentation deadline", async t => {
  for (const method of workerCommands) {
    await t.test(method, async () => {
      const capture = await interruptedCapture(method, { stall: true });
      assert.ok(capture.errors.includes(`${method} deadline exceeded (10 ms)`));
      assert.deepEqual(capture.entries, []);
    });
  }
});
