# HDR presentation failure status

An HDR presentation rejection already released its resources and repainted the
scene through SDR. Cleanup then replaced the original failure report with the
generic deferred reason `Presentation released.` during that fallback repaint.

The renderer now preserves the failed owner's unavailable report across SDR
repaints. GPU presentation errors retain their specific reason; a frame rejected
before submission receives an explicit rejection reason. Released targets report
zero retained bytes and no successfully presented frame. The existing owner
replacement paths clear this report, allowing the existing HDR recovery behavior.

The manager's disposal contract, resource cleanup, rendering equations, target
dimensions, deadlines and retry policy are unchanged.

The regression executes the production renderer and HDR manager with controlled
WebGL boundary failures. Both failure cases reproduced the old deferred status
before the patch. It checks unavailable status and visible reason, resource
release, SDR draw routing, no presentation or allocation retry on repaint/resize,
and successful recovery after explicit HDR disable/re-enable.

```powershell
node --experimental-vm-modules --test tests/web/orreryHdrLifecycle.test.mjs tests/web/hdrPresentation.test.mjs
```

This is CPU lifecycle evidence. No new browser, GPU, throughput or numerical
qualification is claimed by this status correction.
