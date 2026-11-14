# Startup profiler browser lifecycle

The canonical local profiler binds the positive ChildProcess PID returned by its
own Puppeteer launch before querying the browser version. Finalization uses the
existing bounded verified-close helper and records `browserPid` plus
`ownedBrowserExit: {pid, exitCode, signalCode}`. A normal successful result requires
that same launch-owned process to exit with code zero and no signal. Returning
from close or from the helper alone does not establish success.

Unknown raw process fields remain null; they are not coerced to PID zero or an
exit code. Missing/changed ownership is rejected before closing an unbound
process. Failed close, timeout, nonzero exit and signal termination remain
failures even when other cleanup succeeds. Worker observation and HTTP/source/
artifact admission still complete after browser cleanup, and late owner errors
remain visible in the final receipt. The helper may kill only its launch-owned
process after its existing bounded close/exit deadlines. No browser process
discovery, blanket termination or new service is added.

Use the existing command, selecting a new evidence directory:

```powershell
node tools/startup_profile.mjs --web-root=STAGE --out=NEW_DIRECTORY --expected-browser=Chrome/VERSION --pairs=1 --backend=swiftshader
```

For native mode, the existing exact `--expected-renderer` pin is also required.
Normal exit code is zero for a completed diagnostic; a failed producer or full
qualification exits one. `--pairs=10` retains the existing full controlled
qualification semantics. A completed single-pair diagnostic is not a production
response qualification. Both the frame and correlated native response evidence
remain required. All six actions, CPU/network controls, backend flags, scientific
and readiness deadlines, and the binding 200 ms target remain unchanged.

This change is tooling only. It does not change application rendering, approved
Illustrative Earth/Sun assets or orbital calculations. Prior evidence without
raw browser metadata remains historical with that limitation; it is not edited
or retroactively inferred clean. Rollback is the three-path source diff, retaining
the new diagnostics separately; no running process or application data is changed
by reverting those files. No commit, push or deployment is implied.
