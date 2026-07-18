# ADR 0003: Observer location, time, and privacy semantics

- Status: Accepted
- Date: 2026-07-10

## Context

The default My Sky engine runs entirely on the device. The optional DE441 provider necessarily receives the selected observer coordinates and time. Earlier documentation stated that location never left the device without distinguishing these provider modes. The UI also formats event times in the browser's civil timezone; a latitude/longitude alone does not reliably determine an IANA timezone without an additional dataset or service.

## Decision

1. On-device computation is the default and sends no location or observation time to a server.
2. A remote provider is unavailable unless the deployment explicitly configures `window.SOL_EPHEMERIS_SERVER`.
3. The first remote request requires explicit user consent stating that latitude, longitude, elevation, and observation time will be transmitted.
4. Provider controls visibly identify remote transmission and are disabled when no endpoint is configured.
5. Until an audited timezone resolver is implemented, displayed civil event times are described as the browser/device timezone, not automatically as the observer location's timezone.
6. Snapshot UTC/JD values remain authoritative and exportable independent of presentation timezone.

## Future work

A bundled or explicitly consented IANA timezone resolver may add observer-local civil-time formatting. It must define border, maritime, historical-offset, and DST behavior and include adversarial timezone tests.
