# Preserve anchored atmosphere demand during inspection

Selecting a moon or another body without an admitted atmosphere profile could
cancel pending Earth or Mars optical fields even though that planet remained the
camera anchor. The demand selector now prefers an admitted selected profile and
otherwise retains the admitted anchor profile. A selected Earth or Mars still
replaces the prior demand. Leaving System view, hiding the page, entering Galaxy,
selecting a star or disabling optics retains its existing cancellation behavior.

The regression uses the actual object-row selection handler for both Earth and
Mars anchors. Selecting Moon while the field is pending must preserve the request;
selecting Mercury after readiness must preserve a submitted physical draw. It also
checks that the snapshot epoch and physical body positions remain unchanged. Both
new cases failed against the prior source at the cancellation assertion and pass
after the fix. All 18 incident lifecycle tests pass with the pinned Node 22 runtime.

This is a demand-lifecycle correction. No atmospheric equation, interpolation,
source profile, orbital geometry or application-performance limit changes.
The tests use the repository's controlled WebGL harness; they do not establish
native GPU accuracy or close the hosted rendering-performance P1.
