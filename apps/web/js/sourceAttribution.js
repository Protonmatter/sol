// Shared standalone/bundle admission; preserve the original source evidence.
export function attributableSource(value) {
  if (typeof value !== "string") return false;
  // Explicit cross-runtime whitespace (U+FEFF is deliberately not stripped).
  const whitespace = /^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g;
  const source = value.replace(whitespace, "");
  return source !== "" && source.toLowerCase() !== "unknown";
}
