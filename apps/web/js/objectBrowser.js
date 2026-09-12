// Keyed native controls: updating facts never replaces a focused object node.
export function syncObjectRows(list, records, onSelect) {
  const ids = new Set();
  for (const record of records) {
    if (ids.has(String(record.id))) throw new Error(`Duplicate object identity: ${record.id}`);
    ids.add(String(record.id));
  }
  const existing = new Map(Array.from(list.children).map(node => [node.dataset.objectId, node]));
  for (const [index, record] of records.entries()) {
    const id = String(record.id);
    let row = existing.get(id);
    if (!row) {
      row = list.ownerDocument.createElement("button");
      row.type = "button";
      row.dataset.objectId = id;
    }
    row.className = record.className || "sky-row";
    row.textContent = record.label;
    row.hidden = record.hidden === true;
    row.setAttribute("aria-pressed", String(record.selected === true));
    row.onclick = () => onSelect(record.id);
    if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
  }
  for (const node of Array.from(list.children)) if (!ids.has(node.dataset.objectId)) node.remove();
}

export function matchesObject(object, query = "", group = "all") {
  return String(object.name || object.id).toLocaleLowerCase("en").includes(query.trim().toLocaleLowerCase("en"))
    && (group === "all" || group === object.kind || group === "above" && object.alt_deg > 0 || group === "below" && object.alt_deg <= 0);
}
