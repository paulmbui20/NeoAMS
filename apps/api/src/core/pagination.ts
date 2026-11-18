// src/core/pagination.ts
export type Page = { limit: number; offset: number };
export const paged = <T>(
  data: T[],
  total: number,
  { limit, offset }: Page,
) => ({ data, meta: { total, limit, offset } });
