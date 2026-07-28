# Standards and guidance baseline

Status: current  
Updated: 2026-07-28

Sol uses standards where they govern an implemented interface and guidance where it
improves engineering practice. This document does not claim certification or blanket
conformance. A pull request may claim conformance only when its scope, edition, evidence,
and known exceptions are recorded.

## Normative language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**,
**RECOMMENDED**, **MAY**, and **OPTIONAL** in current specifications are interpreted as
described by [BCP 14: RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they appear in
all capitals.

- A **MUST** is a release-blocking requirement.
- A **SHOULD** needs either evidence of compliance or a documented exception with impact.
- A **MAY** is optional and must remain interoperable with implementations that omit it.
- Historical design documents are informative. `SPEC.md`, accepted ADRs, accepted RFCs,
  JSON Schemas, and `requirements.json` are normative in that order of specificity.

## Applicable protocol and data standards

| Standard | Scope in Sol | Evidence |
|---|---|---|
| [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259) | JSON interchange, duplicate-free object keys, finite representable numbers | JSON Schemas and semantic validators |
| [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) | Internet timestamps in snapshots and provider exchanges | Snapshot validators and provider tests |
| [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986) | URI handling for assets, share state, and configured providers | Browser guards and static validation |
| [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) | HTTP method, status, and representation semantics | Static server/provider tests |
| [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111) | Cache behavior and service-worker response policy | Service-worker tests and content-derived cache tokens |

Contract changes must identify the relevant standard, the implemented subset, and edge
cases. Sol does not describe a local product design document as an IETF RFC; repository
RFCs are internal change proposals that borrow the review discipline and BCP 14 language.

## Web accessibility and usability guidance

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) Level AA is the accessibility target.
  Automated checks cover only a subset; a blanket conformance claim requires a documented
  manual audit of every responsive variation and complete user flow.
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) guides patterns for
  dialogs, disclosure controls, keyboard interaction, names, states, and focus.
- Nielsen Norman Group's
  [progressive-disclosure guidance](https://www.nngroup.com/articles/progressive-disclosure/)
  guides the primary/secondary split, clear disclosure labels, and the preference for no
  more than two disclosure levels.
- Nielsen Norman Group's
  [ten usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
  guide system-status visibility, user control, consistency, error prevention, recognition,
  efficiency, minimalism, recovery, and help.

The executable repository subset is defined in `UX_GUIDELINES.md` and checked by
`tools/validate_ux_contract.py` plus the real-browser validation.

## Secure development guidance

- [NIST SP 800-218 SSDF 1.1](https://csrc.nist.gov/pubs/sp/800/218/final) is the secure
  SDLC vocabulary. Sol maps its lifecycle to Prepare the Organization, Protect the
  Software, Produce Well-Secured Software, and Respond to Vulnerabilities.
- [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/)
  is a verification reference for exposed web and provider controls. No ASVS level is
  claimed without a versioned control-by-control assessment.
- [GitHub Actions security hardening](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)
  informs least-privilege permissions, immutable action pins, protected environments, and
  review of dependency updates.

## Standards-change rule

A standards-related change MUST:

1. identify the exact edition and applicable clauses;
2. add or update a `SOL-*` requirement and its evidence;
3. include positive, boundary, and negative tests where meaningful;
4. document deviations and their user or interoperability impact;
5. avoid claiming conformance beyond the tested scope.

