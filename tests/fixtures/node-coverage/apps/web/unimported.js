export function neverImported(value) {
  if (value) {
    return "unexecuted branch";
  }
  return "also unexecuted";
}
