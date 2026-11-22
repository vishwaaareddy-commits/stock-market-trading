"use client";

import { SearchX, Search } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { Input } from "./Controls";

export type Column<T> = {
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
};

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
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const searchId = useId();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (!rowFilter || rowFilter(row)) &&
        (!q || !searchText || searchText(row).toLowerCase().includes(q)),
    );
  }, [rows, query, rowFilter, searchText]);

  const hasToolbar = Boolean(searchText || filters);

  return (
    <div>
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          {searchText && (
            <div className="relative w-full sm:w-64">
              <label htmlFor={searchId} className="sr-only">
                {searchPlaceholder}
              </label>
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <Input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9"
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
          <table className="w-full min-w-max text-sm">
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead>
              <tr className="border-b border-line bg-elevated/60 text-[11px] uppercase tracking-wider text-muted">
                {columns.map((c) => (
                  <th
                    key={c.header}
                    scope="col"
                    className={`px-5 py-3 font-semibold ${c.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="border-b border-line/70 transition-colors last:border-0 hover:bg-elevated/60"
                >
                  {columns.map((c) => (
                    <td
                      key={c.header}
                      className={`px-5 py-3.5 text-foreground ${c.align === "right" ? "text-right tabular-nums" : ""}`}
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
    </div>
  );
}
