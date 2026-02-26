export const toggleSetValue = (source: Set<string>, value: string): Set<string> => {
  const next = new Set(source);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
};
