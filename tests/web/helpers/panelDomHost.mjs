// Browser DOM boundary for text/control tests. Application rendering and event
// handlers stay in their original ES modules; this host records their effects.
export function createPanelDocument() {
  const nodes = new Map();
  let document;
  class Element {
    constructor(tagName = "div") {
      this.tagName = tagName.toUpperCase();
      this.ownerDocument = document;
      this.children = [];
      this.parentElement = null;
      this.attributes = new Map();
      this.listeners = new Map();
      this.dataset = {};
      this.style = {};
      this.className = "";
      this.hidden = false;
      this.disabled = false;
      this.value = "";
      this.offsetParent = {};
      this.rect = { left: 20, top: 20, width: 240, height: 60 };
      this._text = "";
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        add: name => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), name])].join(" "); },
        remove: name => { this.className = this.className.split(/\s+/).filter(value => value && value !== name).join(" "); },
        toggle: (name, force) => {
          const add = force ?? !this.classList.contains(name);
          if (add) this.classList.add(name); else this.classList.remove(name);
          return add;
        },
      };
    }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
    set textContent(value) {
      this._text = String(value);
      for (const child of this.children) child.parentElement = null;
      this.children = [];
    }
    get firstElementChild() { return this.children[0] || null; }
    appendChild(child) { child.remove(); child.parentElement = this; this.children.push(child); return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    insertBefore(child, before) {
      if (child === before) return child;
      child.remove();
      const index = before === null ? this.children.length : this.children.indexOf(before);
      if (index < 0) throw new Error("insertBefore target is not a child");
      child.parentElement = this;
      this.children.splice(index, 0, child);
      return child;
    }
    remove() {
      if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
      this.parentElement = null;
    }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener(type, callback) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(callback);
    }
    dispatch(type, properties = {}) {
      const event = { target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...properties };
      for (const callback of this.listeners.get(type) || []) callback(event);
      return event;
    }
    click() { if (!this.disabled) { this.onclick?.({ target: this }); this.dispatch("click"); } }
    focus() { document.activeElement = this; }
    getBoundingClientRect() { return { ...this.rect, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height }; }
    querySelectorAll(selector) {
      const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll("*")]);
      if (selector === "*") return descendants;
      if (selector === "button:not([disabled])") return descendants.filter(child => child.tagName === "BUTTON" && !child.disabled);
      const match = /^(?<tag>[a-z]+)?(?:#(?<id>[\w-]+))?(?:\.(?<class>[\w-]+))?(?:\[data-mode='(?<mode>[^']+)'\])?$/.exec(selector);
      if (!match) throw new Error(`Unsupported DOM-host selector: ${selector}`);
      const filter = match.groups;
      return descendants.filter(child => (!filter.tag || child.tagName === filter.tag.toUpperCase()) &&
        (!filter.id || child.id === filter.id) && (!filter.class || child.classList.contains(filter.class)) &&
        (!filter.mode || child.dataset.mode === filter.mode));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  document = {
    activeElement: null,
    createElement: tag => new Element(tag),
    createTextNode(value) { const node = new Element("text"); node.textContent = value; return node; },
    getElementById: id => document.root.contains(nodes.get(id)) ? nodes.get(id) : null,
    contains: node => document.root.contains(node),
    querySelectorAll(selector) {
      const parts = selector.split(" ");
      if (parts.length === 2) return (document.querySelector(parts[0])?.querySelectorAll(parts[1])) || [];
      return document.root.querySelectorAll(selector);
    },
    querySelector: selector => document.querySelectorAll(selector)[0] || null,
  };
  document.root = new Element("body");
  function add(id, tag = "div", parent = document.root) {
    const node = document.createElement(tag);
    node.id = id;
    nodes.set(id, node);
    parent.appendChild(node);
    return node;
  }
  return { document, nodes, add };
}
