import React, { useState, useMemo, useCallback } from 'react';
import { AnalysisResult, LineData, Section } from '../types';
import { hexToRgba } from '../utils/colorUtils';
type IconProps = { size?: number; className?: string };

const RotateCcw: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
  </svg>
);

const GripVertical: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <circle cx="9" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" />
    <circle cx="15" cy="6" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="15" cy="18" r="1.4" />
  </svg>
);

const Download: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const ArrowUpDown: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="m21 16-4 4-4-4" /><path d="M17 20V4" /><path d="m3 8 4-4 4 4" /><path d="M7 4v16" />
  </svg>
);

interface WorkshopViewProps {
    data: AnalysisResult;
}

const WorkshopView: React.FC<WorkshopViewProps> = ({ data }) => {
    // Working copy of line order (array of original line indices)
    const [lineOrder, setLineOrder] = useState<number[]>(() =>
        data.lines.map((_, i) => i)
    );
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [movedLines, setMovedLines] = useState<Set<number>>(new Set());

    // Reset to original order
    const handleReset = useCallback(() => {
        setLineOrder(data.lines.map((_, i) => i));
        setMovedLines(new Set());
    }, [data.lines]);

    // Build line device map for quick lookup
    const deviceMap = useMemo(() => {
        const map = new Map<number, string[]>();
        data.line_devices?.forEach(ld => map.set(ld.line_id, ld.devices));
        return map;
    }, [data.line_devices]);

    // Section mapping
    const lineSectionMap = useMemo(() => {
        const map = new Map<number, Section>();
        data.sections?.forEach(sec => {
            for (let i = sec.start_line; i <= sec.end_line; i++) {
                map.set(i, sec);
            }
        });
        return map;
    }, [data.sections]);

    // Compute shared devices between adjacent lines in current order
    const adjacencyConnections = useMemo(() => {
        const connections: Map<string, { shared: string[]; broken: string[] }> = new Map();

        for (let i = 0; i < lineOrder.length - 1; i++) {
            const currDevices = new Set<string>(deviceMap.get(lineOrder[i]) || []);
            const nextDevices = new Set<string>(deviceMap.get(lineOrder[i + 1]) || []);

            const shared: string[] = [...currDevices].filter(d => nextDevices.has(d));

            connections.set(`${i}-${i + 1}`, {
                shared,
                broken: [],
            });
        }
        return connections;
    }, [lineOrder, deviceMap]);

    // Handle drag
    const handleDragStart = (index: number) => {
        setDragIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        setDragOverIndex(index);
    };

    const handleDrop = (targetIndex: number) => {
        if (dragIndex === null || dragIndex === targetIndex) {
            setDragIndex(null);
            setDragOverIndex(null);
            return;
        }

        const newOrder = [...lineOrder];
        const [moved] = newOrder.splice(dragIndex, 1);
        newOrder.splice(targetIndex, 0, moved);
        setLineOrder(newOrder);

        setMovedLines(prev => {
            const next = new Set(prev);
            next.add(moved);
            return next;
        });

        setDragIndex(null);
        setDragOverIndex(null);
    };

    // Export rearranged text
    const handleExport = useCallback(() => {
        const text = lineOrder.map(i => data.lines[i].text).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'rearranged-lyrics.txt';
        a.click();
        URL.revokeObjectURL(url);
    }, [lineOrder, data.lines]);

    const isReordered = lineOrder.some((v, i) => v !== i);

    return (
        <div className="max-w-[1000px] mx-auto px-6 py-6 animate-fade-in">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <ArrowUpDown size={18} className="text-indigo-400" />
                        Workshop
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Drag lines to rearrange. Shared sonic connections are shown between adjacent lines.
                    </p>
                </div>
                <div className="flex gap-2">
                    {isReordered && (
                        <>
                            <button
                                onClick={handleReset}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-all"
                            >
                                <RotateCcw size={14} />
                                Reset
                            </button>
                            <button
                                onClick={handleExport}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-indigo-600 text-white hover:bg-indigo-500 transition-all"
                            >
                                <Download size={14} />
                                Export Text
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Line cards */}
            <div className="space-y-0">
                {lineOrder.map((originalIndex, displayIndex) => {
                    const line = data.lines[originalIndex];
                    const isEmpty = !line.text.trim();
                    const ld = data.line_devices?.find(d => d.line_id === originalIndex);
                    const section = lineSectionMap.get(originalIndex);
                    const wasMoved = movedLines.has(originalIndex);
                    const isDragTarget = dragOverIndex === displayIndex && dragIndex !== displayIndex;

                    // Shared connections with next line
                    const conn = adjacencyConnections.get(`${displayIndex}-${displayIndex + 1}`);
                    const sharedCount = conn?.shared?.length || 0;

                    if (isEmpty) {
                        return (
                            <div
                                key={`empty-${displayIndex}`}
                                className="h-6 flex items-center justify-center"
                                onDragOver={(e) => handleDragOver(e, displayIndex)}
                                onDrop={() => handleDrop(displayIndex)}
                            >
                                <div className="h-px w-16 bg-slate-800" />
                            </div>
                        );
                    }

                    return (
                        <React.Fragment key={`line-${displayIndex}`}>
                            <div
                                draggable
                                onDragStart={() => handleDragStart(displayIndex)}
                                onDragOver={(e) => handleDragOver(e, displayIndex)}
                                onDrop={() => handleDrop(displayIndex)}
                                onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all cursor-grab active:cursor-grabbing ${isDragTarget
                                    ? 'bg-indigo-600/20 border-2 border-indigo-500/50 border-dashed'
                                    : dragIndex === displayIndex
                                        ? 'opacity-30 bg-slate-800'
                                        : wasMoved
                                            ? 'bg-slate-800/60 ring-1 ring-indigo-500/20'
                                            : 'bg-slate-800/30 hover:bg-slate-800/50'
                                    }`}
                            >
                                {/* Drag handle */}
                                <GripVertical size={14} className="text-slate-600 shrink-0" />

                                {/* Line number (original) */}
                                <span className="text-xs text-slate-600 font-mono w-6 text-right shrink-0">
                                    {originalIndex + 1}
                                </span>

                                {/* Section label */}
                                {section && (
                                    <span className="text-[10px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                                        {section.label}
                                    </span>
                                )}

                                {/* Line text */}
                                <span className="flex-1 text-sm font-mono text-slate-300">
                                    {line.text.trim()}
                                </span>

                                {/* Device dots */}
                                <div className="flex gap-0.5 shrink-0">
                                    {(ld?.devices || []).slice(0, 8).map((dev, i) => {
                                        const type = dev.split(':')[0];
                                        const color =
                                            type === 'rhyme' ? '#f87171' :
                                                type === 'assonance' ? '#22d3ee' :
                                                    type === 'alliteration' ? '#4ade80' :
                                                        '#a78bfa';
                                        return (
                                            <span
                                                key={i}
                                                className="w-1.5 h-1.5 rounded-full"
                                                style={{ backgroundColor: color }}
                                                title={dev}
                                            />
                                        );
                                    })}
                                    {(ld?.device_count || 0) > 8 && (
                                        <span className="text-[9px] text-slate-600">+{(ld?.device_count || 0) - 8}</span>
                                    )}
                                </div>

                                {/* Density */}
                                <span className="text-xs font-mono text-slate-600 w-8 text-right shrink-0">
                                    {(ld?.device_density ?? 0).toFixed(1)}
                                </span>
                            </div>

                            {/* Connection indicator between lines */}
                            {displayIndex < lineOrder.length - 1 && sharedCount > 0 && (
                                <div className="flex items-center justify-center h-4 relative">
                                    <div className="flex gap-0.5">
                                        {Array.from({ length: Math.min(sharedCount, 12) }).map((_, i) => (
                                            <div
                                                key={i}
                                                className="w-1 h-1 rounded-full bg-indigo-500/40"
                                            />
                                        ))}
                                    </div>
                                    {sharedCount > 0 && (
                                        <span className="absolute right-4 text-[10px] text-slate-700 font-mono">
                                            {sharedCount} shared
                                        </span>
                                    )}
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Summary */}
            {isReordered && (
                <div className="mt-6 p-4 bg-indigo-600/10 rounded-lg border border-indigo-500/20 text-sm text-slate-400">
                    <p>
                        <strong className="text-indigo-400">{movedLines.size} lines</strong> rearranged from original positions.
                        Click <strong>Export Text</strong> to save the new arrangement.
                    </p>
                </div>
            )}
        </div>
    );
};

export default WorkshopView;
