"use client";

import { ChevronLeft, ChevronRight, Search, SearchX } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { Button, Input } from "./Controls";
import { EmptyState } from "./EmptyState";

export type Column<T> = {
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
  /**
   * Drop this low-priority column on tablet-width screens so the table fits. On phones every row is
   * shown as a labelled card instead, so nothing is hidden there.
   */
  hideBelow?: "lg" | "xl" | "2xl";
};

const HIDE_BELOW = { lg: "md:max-lg:hidden", xl: "md:max-xl:hidden", "2xl": "md:max-2xl:hidden" } as const;

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Shown when there are no rows at all. */
  emptyMessage?: string;
  /** Enables a search box; return the text a row should be matched against. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  /** Extra filter controls rendered next to the search box. */
  filters?: ReactNode;
  /** Optional extra row predicate (e.g. from a filter dropdown). */
  rowFilter?: (row: T) => boolean;
  caption?: string;
  /** Rows per page; pagination appears only when there are more rows than this. */
  pageSize?: number;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No data yet.",
  searchText,
  searchPlaceholder = "Search…",
  filters,
  rowFilter,
  caption,
  pageSize = 10,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const searchId = useId();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (!rowFilter || rowFilter(row)) &&
        (!q || !searchText || searchText(row).toLowerCase().includes(q)),
    );
  }, [rows, query, rowFilter, searchText]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pageCount - 1); // clamps automatically when filters shrink the list
  const slice = visible.slice(current * pageSize, current * pageSize + pageSize);
  const hasToolbar = Boolean(searchText || filters);

  return (
    <div>
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          {searchText && (
            <div className="relative w-full sm:w-72">
              <label htmlFor={searchId} className="sr-only">
                {searchPlaceholder}
              </label>
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <Input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="pl-10"
              />
            </div>
          )}
          {filters}
          <p className="ml-auto text-xs text-muted" aria-live="polite">
            {visible.length} of {rows.length}
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">{emptyMessage}</p>
      ) : visible.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={SearchX}
            title="No matching results"
            description="Try a different search term or clear the filters."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm max-md:block md:min-w-max">
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead>
              <tr className="border-b border-line bg-elevated/70 text-[10.5px] uppercase tracking-[0.12em] text-muted max-md:sr-only">
                {columns.map((c) => (
                  <th
                    key={c.header}
                    scope="col"
                    className={`px-5 py-3 font-semibold ${c.align === "right" ? "text-right" : "text-left"} ${c.hideBelow ? HIDE_BELOW[c.hideBelow] : ""}`}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="max-md:block max-md:space-y-3 max-md:p-4">
              {slice.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="border-b border-line/70 transition-colors last:border-0 hover:bg-accent/[0.05] max-md:block max-md:rounded-xl max-md:border max-md:border-line max-md:bg-elevated/40 max-md:px-4 max-md:py-2 max-md:last:border"
                >
                  {columns.map((c) => (
                    <td
                      key={c.header}
                      data-label={c.header}
                      className={`px-5 py-3.5 text-foreground ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.hideBelow ? HIDE_BELOW[c.hideBelow] : ""} max-md:flex max-md:items-center max-md:justify-between max-md:gap-4 max-md:px-0 max-md:py-2 max-md:text-right max-md:before:shrink-0 max-md:before:text-left max-md:before:text-[10.5px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-[0.1em] max-md:before:text-muted max-md:before:content-[attr(data-label)]`}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {visible.length > pageSize && (
        <nav
          aria-label="Pagination"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3"
        >
          <p className="text-xs text-muted">
            Showing {current * pageSize + 1}–{Math.min(visible.length, (current + 1) * pageSize)} of {visible.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              aria-label="Previous page"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
              className="!h-8 !px-2.5"
            >
              <ChevronLeft size={15} aria-hidden="true" />
            </Button>
            <span className="min-w-[5.5rem] text-center text-xs text-secondary">
              Page {current + 1} of {pageCount}
            </span>
            <Button
              aria-label="Next page"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
              className="!h-8 !px-2.5"
            >
              <ChevronRight size={15} aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
