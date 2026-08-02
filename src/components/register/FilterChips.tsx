"use client";

import { memo } from "react";

export interface FilterOption {
  id: string;
  label: string;
}

function FilterChipGroupImpl({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onToggle(opt.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Memoized so toggling one group (e.g. Disiplin) does not re-render the other
// four groups. Relies on `options` and `onToggle` being referentially stable,
// and on filter updates preserving the array identity of untouched groups.
export const FilterChipGroup = memo(FilterChipGroupImpl);
