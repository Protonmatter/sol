export const identity = {};

export function choose(value) {
  if (value) {
    return "yes";
  }
  return "no";
}

export function increment(value) {
  return value + 1;
}
