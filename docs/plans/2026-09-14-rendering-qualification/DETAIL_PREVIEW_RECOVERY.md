# Retained detail preview recovery

The optional legacy browse image in **Image and rendering sources** can fail while
offline. The selected body card is retained, so reopening the disclosure must
explicitly retry that failed request instead of retaining a permanently hidden image.

`orreryDetail.js` now clears the failed image's `src` and displays an unavailable
caption with the retry instruction. Closing and reopening the native disclosure
requests the same catalogued preview path and restores image visibility. A pending
or successfully loaded request is not restarted by toggling. Successful loading
restores the original provenance caption; another failure permits another explicit
reopen retry.

The image, caption, source link and surrounding card nodes are retained. Image
alternative text, lazy loading, asynchronous decoding, aspect-ratio styles, source
URL and link security attributes are unchanged. This preview remains separate from
the globe texture and does not change the scientific rendering state.

Validation uses the production DOM builder with controlled image load/error events:

```powershell
node --experimental-vm-modules --test tests/web/orreryDetail.test.mjs tests/web/detailCoverage.test.mjs
```

The added regression failed against the original code because reopening issued no
second request. It covers repeated failure/recovery, no retry while pending or
already loaded, and retained node/layout/accessibility/source identity. It does not
claim a real-browser network or GPU qualification.
