// Preserve the native setter for nonstrings and for content that it must flatten.
// Only an unchanged empty/one-Text-node leaf can retain its existing DOM node.
export function writeText(node, value) {
  if (typeof value === "string") {
    const children = node.childNodes;
    const plain = children && (children.length === 0 || (children.length === 1 && children[0]?.nodeType === 3));
    if (plain && node.textContent === value) return;
  }
  node.textContent = value;
}

// Only literal non-namespaced string attributes can bypass the native setter.
// Other inputs retain native name/value conversion and failure behavior.
export function writeAttribute(node, name, value) {
  if (typeof name === "string" && !name.includes(":") && typeof value === "string"
      && typeof node.getAttribute === "function" && node.getAttribute(name) === value) return;
  node.setAttribute(name, value);
}

// Boolean callers compare the live host property. Other values keep native
// conversion, including HTMLElement.hidden's separate "until-found" state.
export function writeBoolean(node, name, value) {
  if (typeof name === "string" && typeof value === "boolean" && node[name] === value) return;
  node[name] = value;
}
