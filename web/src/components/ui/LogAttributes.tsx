import { useState } from 'react';

const DEFAULT_VISIBLE_COUNT = 3;

interface LogAttributesProps {
    attributes: Record<string, unknown>;
}

/**
 * 로그/스팬 속성(Key-Value) 태그를 표시합니다.
 * 3개를 초과하면 접기/펼치기 버튼을 제공합니다.
 */
export default function LogAttributes({ attributes }: LogAttributesProps) {
    const entries = Object.entries(attributes ?? {});
    const [expanded, setExpanded] = useState(false);

    if (entries.length === 0) return null;

    const visibleEntries = expanded ? entries : entries.slice(0, DEFAULT_VISIBLE_COUNT);
    const hiddenCount = entries.length - DEFAULT_VISIBLE_COUNT;

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {visibleEntries.map(([key, value]) => (
                <span
                    key={key}
                    className="inline-flex max-w-full items-center rounded-md border border-slate-700/60 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-400"
                >
                    <span className="mr-1 text-blue-300/70">{key}:</span>
                    <span className="truncate">{String(value)}</span>
                </span>
            ))}
            {hiddenCount > 0 && (
                <button
                    type="button"
                    onClick={() => setExpanded((prev) => !prev)}
                    className="inline-flex items-center rounded-md border border-slate-700/40 bg-slate-800/60 px-2 py-1 text-[10px] font-medium text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
                >
                    {expanded ? '접기' : `+${hiddenCount} 더보기`}
                </button>
            )}
        </div>
    );
}
