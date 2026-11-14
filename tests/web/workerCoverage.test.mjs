import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { TargetCloseError } from "puppeteer-core";
import { startWorkerCoverage, closeOwnedBrowser } from "../../tools/worker_coverage.mjs";

function fixture(failure) {
  const calls = [];
  const child = new EventEmitter();
  const scripts = [{ scriptId: "1", url: "http://127.0.0.1/js/worker.js" }];
  const state = { scripts, parsedScripts: scripts };
  child.send = async (method) => {
    calls.push(method);
    if (method === failure) throw new Error("instrumentation failed");
    if (method === "Profiler.takePreciseCoverage") return { result: state.scripts.map(script => ({ ...script, functions: [] })) };
    if (method === "Debugger.enable") for (const script of state.parsedScripts) child.emit("Debugger.scriptParsed", script);
    if (method === "Debugger.getScriptSource") return { scriptSource: "export const value = 1;" };
    return {};
  };
  const parent = new EventEmitter();
  parent.connection = () => ({ session: () => child });
  parent.send = async (method) => { calls.push(method); };
  parent.detach = async () => { calls.push("detach"); };
  return { calls, child, parent, state, page: { createCDPSession: async () => parent } };
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
  const f = fixture("Profiler.enable"); const capture = await startWorkerCoverage(f.page);
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
  f.child.send = method => method === "Profiler.enable" ? new Promise(() => {}) : send(method);
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
  "Runtime.runIfWaitingForDebugger", "Profiler.takePreciseCoverage", "Debugger.getScriptSource", "Debugger.disable",
];

test("Debugger stays disabled during worker execution and source collection preserves module coverage", async () => {
  const f = fixture();
  f.state.scripts.push({ scriptId: "2", url: "http://127.0.0.1/js/imported.js" });
  const capture = await startWorkerCoverage(f.page);
  try {
    f.parent.emit("Target.attachedToTarget", { sessionId: "worker" });
    await new Promise(setImmediate);
    assert.ok(f.calls.includes("Profiler.startPreciseCoverage"));
    assert.ok(f.calls.includes("Runtime.runIfWaitingForDebugger"));
    assert.ok(!f.calls.includes("Debugger.enable"), "Debugger must not slow timed WASM execution");
    await capture.collect();
    assert.ok(f.calls.indexOf("Profiler.takePreciseCoverage") < f.calls.indexOf("Debugger.enable"));
    assert.ok(f.calls.indexOf("Debugger.getScriptSource") < f.calls.indexOf("Debugger.disable"));
    assert.deepEqual(capture.entries.map(entry => entry.url), f.state.scripts.map(script => script.url));
    assert.deepEqual(capture.entries.map(entry => entry.rawScriptCoverage.scriptId), ["1", "2"]);
    assert.deepEqual(capture.errors, []);
  } finally { await capture.dispose(); }
});

test("repeated worker collection stops Debugger each time without restarting precise coverage", async () => {
  const f = fixture(); const capture = await startWorkerCoverage(f.page);
  try {
    f.parent.emit("Target.attachedToTarget", { sessionId: "worker" });
    await capture.collect();
    assert.equal(f.calls.at(-1), "Debugger.disable");
    await capture.collect();
    assert.equal(f.calls.at(-1), "Debugger.disable");
    assert.equal(f.calls.filter(method => method === "Profiler.startPreciseCoverage").length, 1);
    assert.equal(f.calls.filter(method => method === "Profiler.takePreciseCoverage").length, 2);
    assert.equal(capture.entries.length, 2);
    assert.deepEqual(capture.errors, []);
  } finally { await capture.dispose(); }
});

test("covered module metadata must exist and agree with its parsed script identity", async t => {
  for (const parsedScripts of [[], [{ scriptId: "1", url: "http://127.0.0.1/js/other.js" }]]) {
    await t.test(JSON.stringify(parsedScripts), async () => {
      const f = fixture(); f.state.parsedScripts = parsedScripts;
      const capture = await startWorkerCoverage(f.page);
      try {
        f.parent.emit("Target.attachedToTarget", { sessionId: "worker" });
        await capture.collect();
        assert.deepEqual(capture.entries, []);
        assert.match(capture.errors.join(" "), /source identity/);
        assert.ok(f.calls.includes("Debugger.disable"));
      } finally { await capture.dispose(); }
    });
  }
});

test("source failure cannot publish a partial collection and always disables Debugger", async () => {
  const f = fixture();
  f.state.scripts.push({ scriptId: "2", url: "http://127.0.0.1/js/imported.js" });
  const send = f.child.send;
  f.child.send = (method, params) => method === "Debugger.getScriptSource" && params.scriptId === "2"
    ? Promise.reject(new Error("second source failed")) : send(method, params);
  const capture = await startWorkerCoverage(f.page);
  try {
    f.parent.emit("Target.attachedToTarget", { sessionId: "worker" });
    await capture.collect();
    assert.deepEqual(capture.entries, []);
    assert.match(capture.errors.join(" "), /second source failed/);
    assert.equal(f.calls.at(-1), "Debugger.disable");
  } finally { await capture.dispose(); }
});

test("failed Debugger shutdown remains visible and cannot publish a completed collection", async () => {
  const f = fixture("Debugger.disable"); const capture = await startWorkerCoverage(f.page);
  try {
    f.parent.emit("Target.attachedToTarget", { sessionId: "worker" });
    await capture.collect();
    assert.deepEqual(capture.entries, []);
    assert.match(capture.errors.join(" "), /instrumentation failed/);
  } finally { await capture.dispose(); }
});

test("collection waits for the caller's pending recovery barrier before touching the worker", async () => {
  const f = fixture(); let release;
  const idle = new Promise(resolve => { release = resolve; });
  const capture = await startWorkerCoverage(f.page, { beforeCollect: () => idle });
  try {
    f.parent.emit("Target.attachedToTarget", { sessionId: "worker" });
    await new Promise(setImmediate);
    const collection = capture.collect();
    await new Promise(setImmediate);
    try {
      assert.ok(!f.calls.includes("Profiler.takePreciseCoverage"));
      assert.ok(!f.calls.includes("Debugger.enable"));
    } finally { release(); await collection; }
    assert.equal(capture.entries.length, 1);
    assert.deepEqual(capture.errors, []);
  } finally { release(); await capture.dispose(); }
});

test("a failed or stalled quiescence barrier cannot enable Debugger or publish coverage", async t => {
  for (const beforeCollect of [() => Promise.reject(new Error("recovery is not idle")), () => new Promise(() => {})]) {
    await t.test(beforeCollect.toString(), async () => {
      const f = fixture(); const capture = await startWorkerCoverage(f.page, { beforeCollect, timeoutMs: 10 });
      try {
        f.parent.emit("Target.attachedToTarget", { sessionId: "worker" });
        await capture.collect();
        assert.ok(!f.calls.includes("Debugger.enable"));
        assert.deepEqual(capture.entries, []);
        assert.match(capture.errors.join(" "), /recovery is not idle|quiescence deadline/);
      } finally { await capture.dispose(); }
    });
  }
});

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
