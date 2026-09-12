"""Pure source-attribution admission shared by standalone and bundle boundaries."""

from __future__ import annotations

from typing import Any

# Explicit cross-runtime whitespace. U+FEFF is deliberately not stripped.
ATTRIBUTION_WHITESPACE = "\u0009\u000a\u000b\u000c\u000d\u001c\u001d\u001e\u001f\u0020\u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000"


def attributable_source(value: Any) -> bool:
    """Test attribution without normalizing or replacing the original source."""
    if not isinstance(value, str):
        return False
    source = value.strip(ATTRIBUTION_WHITESPACE)
    return bool(source) and source.lower() != "unknown"
