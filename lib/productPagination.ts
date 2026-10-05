export function productPage<T>(rows: T[], requestedPage: number, requestedSize: number) {
  const size = Number.isFinite(requestedSize) ? Math.max(1, Math.floor(requestedSize)) : 20;
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pageCount, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const offset = (page - 1) * size;
  return { items: rows.slice(offset, offset + size), page, pageCount, total, start: total ? offset + 1 : 0, end: Math.min(total, offset + size) };
}
