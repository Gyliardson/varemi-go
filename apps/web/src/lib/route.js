/** @param {string} hash */
export function storeSlugFromHash(hash) {
  const match = hash.match(/^#\/store\/([a-z0-9-]+)$/i);
  return match?.[1] ?? null;
}
