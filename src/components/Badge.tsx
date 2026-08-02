import type { Priority, Status } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  Open: "bg-slate-100 text-slate-700 ring-slate-300",
  "In Progress": "bg-blue-50 text-blue-700 ring-blue-300",
  Resolved: "bg-amber-50 text-amber-700 ring-amber-300",
  Closed: "bg-emerald-50 text-emerald-700 ring-emerald-300",
};

const PRIORITY_STYLES: Record<string, string> = {
  Low: "bg-slate-100 text-slate-600 ring-slate-300",
  Medium: "bg-sky-50 text-sky-700 ring-sky-300",
  High: "bg-orange-50 text-orange-700 ring-orange-300",
  Critical: "bg-red-50 text-red-700 ring-red-300",
};

export function StatusBadge({ status }: { status: Status | undefined }) {
  if (!status) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status.nama] ?? ""}`}
    >
      {status.nama}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority | undefined }) {
  if (!priority) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${PRIORITY_STYLES[priority.nama] ?? ""}`}
    >
      {priority.nama}
    </span>
  );
}

export function OverdueBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">
      Overdue
    </span>
  );
}
