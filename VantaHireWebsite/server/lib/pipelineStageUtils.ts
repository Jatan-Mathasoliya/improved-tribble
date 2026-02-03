export const normalizeStageName = (name: string): string => {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
};
