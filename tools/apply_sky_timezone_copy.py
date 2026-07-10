#!/usr/bin/env python3
"""One-time UI correction: identify the timezone used for civil event times."""

from pathlib import Path

PATH = Path("apps/web/js/sky.js")
OLD_TIME_LABEL = '''function setTimeLabel() {
  const node = document.getElementById("skyTimeLabel");
  if (node) node.textContent = skyState.chosenUnix == null
    ? "Live — updating every minute."
    : "Frozen at the chosen time. Press Now to return to live.";
}'''
NEW_TIME_LABEL = '''function browserTimeZoneLabel() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "device timezone"; }
  catch (_) { return "device timezone"; }
}

function setTimeLabel() {
  const node = document.getElementById("skyTimeLabel");
  if (!node) return;
  const stateText = skyState.chosenUnix == null
    ? "Live — updating every minute."
    : "Frozen at the chosen time. Press Now to return to live.";
  node.textContent = `${stateText} Rise, transit, and set times use ${browserTimeZoneLabel()}, the browser/device timezone.`;
}'''
OLD_FORMAT = '''function jdToLocal(jd) {
  if (jd == null || !Number.isFinite(jd)) return "--";
  const unix = (jd - 2440587.5) * 86400;
  return new Date(unix * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}'''
NEW_FORMAT = '''function jdToLocal(jd) {
  if (jd == null || !Number.isFinite(jd)) return "--";
  const unix = (jd - 2440587.5) * 86400;
  return new Date(unix * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}'''


def main() -> int:
    text = PATH.read_text(encoding="utf-8")
    if "Rise, transit, and set times use" in text:
        print("sky timezone copy already applied")
        return 0
    if OLD_TIME_LABEL not in text:
        raise SystemExit("setTimeLabel marker not found")
    if OLD_FORMAT not in text:
        raise SystemExit("jdToLocal marker not found")
    text = text.replace(OLD_TIME_LABEL, NEW_TIME_LABEL, 1)
    text = text.replace(OLD_FORMAT, NEW_FORMAT, 1)
    PATH.write_text(text, encoding="utf-8")
    print(f"updated {PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
