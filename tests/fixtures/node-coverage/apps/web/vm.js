export function sign(value) {
  if (value < 0) {
    return "negative";
  }
  return "non-negative";
}
