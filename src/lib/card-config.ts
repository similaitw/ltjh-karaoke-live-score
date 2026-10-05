// Dictionary IDs are zero-based; printed card numbers start at 1.
// To expand to 100, increase CARD_COUNT, extend the SQL constraint and fixtures,
// then regenerate static SVGs. Pagination and scanner UI derive from this limit.
export const CARD_COUNT = 40;
export const DEFAULT_CARD_COUNT = 20;
export const CARDS_PER_PAGE = 4;
