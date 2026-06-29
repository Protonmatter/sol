// Glossary tooltips: plain-language help on hover, keyboard focus, and tap.

import { store } from "./store.js?v=6322cab170";
import { GLOSSARY } from "./config.js?v=6322cab170";

const termTip = document.getElementById("termTip");

export function showTip(target) {
  if (!termTip) return;
  const entry = GLOSSARY[target.getAttribute("data-term")];
  if (!entry) return;
  termTip.textContent = "";
  const title = document.createElement("strong");
  title.textContent = entry[0];
  termTip.appendChild(title);
  termTip.appendChild(document.createTextNode(entry[1]));
  termTip.hidden = false;
  const rect = target.getBoundingClientRect();
  const tip = termTip.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - tip.width - 8);
  let top = rect.bottom + 8;
  if (top + tip.height > window.innerHeight - 8) top = rect.top - tip.height - 8;
  termTip.style.left = `${Math.max(8, left)}px`;
  termTip.style.top = `${Math.max(8, top)}px`;
}

export function hideTip() {
  if (termTip) termTip.hidden = true;
  store.tipPinned = false;
}

export function isTipHidden() {
  return !termTip || termTip.hidden;
}
