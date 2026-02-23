import React, { useMemo, useRef } from 'react';
import { AnalysisResult, DeviceType, PhoneticGroup, Section } from '../types';
import { getDeviceColor } from '../constants';
import { hexToRgba } from '../utils/colorUtils';
import DeviceLegend from './DeviceLegend';

interface ManuscriptViewProps {
    data: AnalysisResult;
    activeDevices: Set<DeviceType>;
    showDensity: boolean;
    hoveredGroup: string | null;
    setHoveredGroup: (g: string | null) => void;
    selectedGroup: string | null;
    setSelectedGroup: (g: string | null) => void;
    isCompact?: boolean;
}

interface HighlightInfo {
    deviceType: DeviceType;
    groupId: string;
    groupName?: string;
    color: string;
}

const ManuscriptView: React.FC<ManuscriptViewProps> = ({
    data,
    activeDevices,
    showDensity,
    hoveredGroup,
    setHoveredGroup,
    selectedGroup,
    setSelectedGroup,
    isCompact = false,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Set of repeated line IDs (from anaphora)
    const repeatedLineIds = useMemo(() => {
        const ids = new Set<number>();
        data.anaphora?.forEach(a => a.line_ids.forEach(id => ids.add(id)));
        return ids;
    }, [data.anaphora]);

    // Set of lines with syllable mismatches (delta > 2)
    const syllableMismatchLines = useMemo(() => {
        const map = new Map<number, number>(); // line_id → delta
        if (!data.syllable_symmetry || !data.sections) return map;
        for (const m of data.syllable_symmetry) {
            if (m.delta <= 2) continue;
            // Find which section has the min count and mark that line
            for (let i = 0; i < m.sections.length; i++) {
                const section = data.sections.find(s => s.label === m.sections[i]);
                if (section) {
                    const lineId = section.start_line + m.position;
                    if (lineId <= section.end_line) {
                        const existing = map.get(lineId) ?? 0;
                        map.set(lineId, Math.max(existing, m.delta));
                    }
                }
            }
        }
        return map;
    }, [data.syllable_symmetry, data.sections]);

    // Build word → highlight[] map for multi-layer rendering
    const wordHighlights = useMemo(() => {
        const map = new Map<string, HighlightInfo[]>();

        const addGroups = (groups: PhoneticGroup[], deviceType: DeviceType) => {
            if (!activeDevices.has(deviceType)) return;
            groups.forEach((group, groupIndex) => {
                if (!group?.words) return;
                const color = getDeviceColor(deviceType, groupIndex);
                group.words.forEach((ref) => {
                    const key = `${ref.lineIndex}-${ref.wordIndex}`;
                    const list = map.get(key) || [];
                    list.push({
                        deviceType,
                        groupId: group.id,
                        groupName: group.name,
                        color,
                    });
                    map.set(key, list);
                });
            });
        };

        addGroups(data.rhymes || [], 'rhymes');
        addGroups(data.assonance || [], 'assonance');
        addGroups(data.alliteration || [], 'alliteration');
        addGroups(data.cascades || [], 'cascades');

        return map;
    }, [data, activeDevices]);

    // Density data for gutter
    const densityData = useMemo(() => {
        if (!data.line_devices) return null;
        const max = Math.max(...data.line_devices.map(d => d.device_density), 1);
        return { devices: data.line_devices, maxDensity: max };
    }, [data.line_devices]);

    // Section boundaries for dividers
    const sectionMap = useMemo(() => {
        const map = new Map<number, Section>();
        data.sections?.forEach(s => map.set(s.start_line, s));
        return map;
    }, [data.sections]);

    // Is a group currently highlighted (hovered or selected)?
    const focusedGroup = selectedGroup || hoveredGroup;

    return (
        <div className="max-w-[1400px] mx-auto px-6 py-6 flex gap-6 animate-fade-in">
            {/* Main content */}
            <div ref={containerRef} className="flex-1 min-w-0">
                {/* Symbol Legend */}
                <div className="symbol-legend flex items-center gap-4 text-xs text-slate-500 mb-3 px-1 py-1.5 border border-slate-800 rounded-lg bg-slate-800/30">
                    <span className="font-medium text-slate-400">Legend:</span>
                    <span className="flex items-center gap-1">
                        <span className="text-indigo-400">↻</span>
                        <span>Repeated line</span>
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="text-amber-400">⚖</span>
                        <span>Syllable mismatch</span>
                    </span>
                    {showDensity && (
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: '#475569' }} />
                            <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: '#f59e0b' }} />
                            <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
                            <span>Density (low → high)</span>
                        </span>
                    )}
                    <span className="flex items-center gap-1">
                        <span className="text-slate-600 font-mono">8</span>
                        <span>Syllable count</span>
                    </span>
                </div>
                <div className="font-mono text-base leading-relaxed">
                    {data.lines.map((line, lineIndex) => {
                        const section = sectionMap.get(lineIndex);
                        const isEmpty = !line.text.trim();
                        const lineDevice = data.line_devices?.find(d => d.line_id === lineIndex);
                        const density = lineDevice?.device_density ?? 0;
                        const isRepeated = repeatedLineIds.has(lineIndex);
                        const mismatchDelta = syllableMismatchLines.get(lineIndex);

                        return (
                            <React.Fragment key={lineIndex}>
                                {/* Section header */}
                                {section && (
                                    <div className="flex items-center gap-3 mt-6 mb-2 first:mt-0">
                                        <div className="h-px flex-1 bg-gradient-to-r from-slate-700 to-transparent" />
                                        <span className="text-xs font-sans font-medium text-slate-500 uppercase tracking-wider px-2">
                                            {section.label}
                                        </span>
                                        <div className="h-px flex-1 bg-gradient-to-l from-slate-700 to-transparent" />
                                    </div>
                                )}

                                <div className={`flex group rounded transition-colors ${isEmpty ? 'h-4' : 'hover:bg-slate-800/30'
                                    } ${isRepeated ? 'opacity-50' : ''}`}>
                                    {/* Density gutter */}
                                    {showDensity && (
                                        <div className="w-8 shrink-0 flex items-stretch mr-2" title={`Density: ${density.toFixed(2)}`}>
                                            {!isEmpty && (
                                                <div
                                                    className="w-2 rounded-sm my-0.5 transition-all"
                                                    style={{
                                                        backgroundColor: densityData
                                                            ? getDensityGradient(density, densityData.maxDensity)
                                                            : '#1e293b',
                                                        opacity: density > 0 ? 0.5 + (density / (densityData?.maxDensity || 3)) * 0.5 : 0.15,
                                                    }}
                                                />
                                            )}
                                        </div>
                                    )}

                                    {/* Syllable count + indicators */}
                                    <div className="w-12 shrink-0 text-xs font-sans select-none flex items-center justify-end pr-2 gap-1">
                                        {isRepeated && (
                                            <span className="text-indigo-400 text-[10px]" title="Repeated line (anaphora)">↻</span>
                                        )}
                                        {mismatchDelta && (
                                            <span className={`text-[10px] ${mismatchDelta > 3 ? 'text-red-400' : 'text-amber-400'}`}
                                                title={`Syllable mismatch: Δ${mismatchDelta}`}>
                                                ⚖
                                            </span>
                                        )}
                                        <span className="text-slate-600">
                                            {line.syllables > 0 && line.syllables}
                                        </span>
                                    </div>

                                    {/* Line content */}
                                    <div className="flex flex-wrap items-baseline gap-x-1 py-0.5 min-h-[1.5em]">
                                        {line.words?.map((word) => {
                                            const highlights = wordHighlights.get(`${lineIndex}-${word.index}`) || [];
                                            const hasHighlight = highlights.length > 0;
                                            const isFocused = focusedGroup && highlights.some(h => h.groupId === focusedGroup);
                                            const isDimmed = focusedGroup && !isFocused && hasHighlight;

                                            // Primary highlight (for background)
                                            const primary = highlights[0];

                                            // Build tooltip
                                            const tooltip = [
                                                ...highlights.map(h =>
                                                    `${h.deviceType}: ${h.groupName || h.groupId}`
                                                ),
                                                word.ipa ? `/${word.ipa}/` : null,
                                            ].filter(Boolean).join('\n');

                                            return (
                                                <span
                                                    key={word.index}
                                                    className={`relative px-1 py-0.5 transition-all duration-200 cursor-default ${isFocused
                                                        ? 'font-bold scale-105'
                                                        : isDimmed
                                                            ? 'opacity-30'
                                                            : hasHighlight
                                                                ? 'font-semibold'
                                                                : 'text-slate-400'
                                                        }`}
                                                    style={primary ? {
                                                        backgroundColor: hexToRgba(primary.color, isFocused ? 0.35 : 0.2),
                                                        color: primary.color,
                                                        borderRadius: '4px',
                                                        boxShadow: isFocused
                                                            ? `0 0 0 2px ${hexToRgba(primary.color, 0.5)}`
                                                            : `0 0 0 1px ${hexToRgba(primary.color, 0.25)}`,
                                                    } : undefined}
                                                    title={tooltip}
                                                    onMouseEnter={() => {
                                                        if (highlights.length > 0)
                                                            setHoveredGroup(highlights[0].groupId);
                                                    }}
                                                    onMouseLeave={() => setHoveredGroup(null)}
                                                    onClick={() => {
                                                        if (highlights.length > 0) {
                                                            setSelectedGroup(
                                                                selectedGroup === highlights[0].groupId ? null : highlights[0].groupId
                                                            );
                                                        }
                                                    }}
                                                >
                                                    {word.text}
                                                    {/* Multi-layer underline bars */}
                                                    {highlights.length > 1 && (
                                                        <span className="absolute bottom-0 left-1 right-1 flex gap-px" style={{ height: '2px' }}>
                                                            {highlights.slice(1).map((h, i) => (
                                                                <span
                                                                    key={i}
                                                                    className="flex-1 rounded-full"
                                                                    style={{ backgroundColor: h.color }}
                                                                />
                                                            ))}
                                                        </span>
                                                    )}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* Device Legend Sidebar */}
            <DeviceLegend
                data={data}
                activeDevices={activeDevices}
                hoveredGroup={hoveredGroup}
                setHoveredGroup={setHoveredGroup}
                selectedGroup={selectedGroup}
                setSelectedGroup={setSelectedGroup}
            />
        </div>
    );
};

function getDensityGradient(density: number, max: number): string {
    const t = Math.min(density / max, 1);
    if (t < 0.3) return '#475569'; // Slate 600
    if (t < 0.6) return '#f59e0b'; // Amber 500
    return '#ef4444'; // Red 500
}

export default ManuscriptView;
