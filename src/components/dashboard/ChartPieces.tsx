"use client";

import Link from "next/link";
import { VIZ } from "./viz-tokens";

const NUM = new Intl.NumberFormat("id-ID");

export function formatNumber(n: number) {
  return NUM.format(n);
}

/**
 * Stat tile — the right form for a headline number (a one-bar chart is not).
 * Value uses proportional figures deliberately: tabular-nums makes a large
 * standalone number look loose.
 */
export function StatTile({
  label,
  value,
  caption,
  href,
  tone = "default",
}: {
  label: string;
  value: string;
  caption?: string;
  href?: string;
  tone?: "default" | "critical";
}) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p
        className={`mt-1.5 text-3xl font-semibold leading-none ${
          tone === "critical" ? "text-[#d03b3b]" : "text-zinc-900"
        }`}
      >
        {value}
      </p>
      {caption && <p className="mt-1.5 text-xs text-zinc-400">{caption}</p>}
    </>
  );

  const className =
    "block rounded-2xl border border-zinc-200 bg-white p-4 transition-colors" +
    (href ? " hover:border-zinc-400" : "");

  return href ? (
    <Link href={href} className={className}>
      {body}
      <span className="mt-2 inline-block text-xs font-medium text-zinc-400">Lihat di register →</span>
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
  table,
  showTable,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  table?: { columns: string[]; rows: (string | number)[][] };
  showTable?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
      {showTable && table && (
        <div className="mt-4 overflow-x-auto border-t border-zinc-100 pt-3">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title} — tampilan tabel</caption>
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {table.columns.map((c) => (
                  <th key={c} scope="col" className="py-1.5 pr-4">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i} className="border-t border-zinc-100">
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={`py-1.5 pr-4 ${j === 0 ? "text-zinc-700" : "tabular-nums text-zinc-600"}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: { fill?: string };
}

/** Tooltips enhance, never gate — every value is also in the table view. */
export function VizTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm">
      {label !== undefined && <p className="mb-1 font-medium text-zinc-700">{label}</p>}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-zinc-600">
          <span
            aria-hidden
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: entry.color ?? entry.payload?.fill ?? VIZ.series1 }}
          />
          <span>{entry.name}</span>
          <span className="ml-auto font-semibold tabular-nums text-zinc-800">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Identity never rests on color alone: a swatch sits beside the text label. */
export function LegendKey({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-4">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-xs text-zinc-600">
          <span
            aria-hidden
            className="inline-block h-0.5 w-4 rounded-full"
            style={{ background: it.color }}
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
