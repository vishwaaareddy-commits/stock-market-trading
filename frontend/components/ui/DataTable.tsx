import type { ReactNode } from "react";

export type Column<T> = {
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No data yet.",
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">{emptyMessage}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            {columns.map((c) => (
              <th
                key={c.header}
                scope="col"
                className={`px-3 py-2 font-medium ${c.align === "right" ? "text-right" : "text-left"}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-line/60 last:border-0">
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={`px-3 py-2.5 ${c.align === "right" ? "text-right font-mono" : ""}`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
