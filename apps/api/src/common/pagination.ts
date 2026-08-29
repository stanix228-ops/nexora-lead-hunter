import type { Request } from 'express';

export interface PageOptions {
  page: number;
  pageSize: number;
}

const MAX_PAGE_SIZE = 200;

export function parsePagination(query: Request['query']): PageOptions {
  const page = Math.max(1, Number(query.page) || 1);
  const requested = Number(query.pageSize) || 50;
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, requested));
  return { page, pageSize };
}

export function paginate<T>(items: T[], total: number, { page, pageSize }: PageOptions) {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}