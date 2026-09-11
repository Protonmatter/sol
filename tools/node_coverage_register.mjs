// Explicit --import diagnostic. Not enabled by package scripts or CI workflows.
import { registerHooks } from "node:module";
import { canonicalCoverageURL } from "./node_coverage_identity.mjs";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    return { ...resolved, url: canonicalCoverageURL(resolved.url) };
  },
});
