/** @param {number} cents */
export function formatBRL(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

/** @param {number} count */
export function formatItemCount(count) {
  return `${count} ${count === 1 ? 'item' : 'itens'}`;
}
