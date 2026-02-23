import React, { useMemo, useState } from 'react';
import { AnalysisResult, DeviceType, Section } from '../types';
import { OBSERVATION_ICONS, getDeviceColor } from '../constants';
import { hexToRgba } from '../utils/colorUtils';

interface XRayViewProps {
    data: AnalysisResult;
    activeDevices: Set<DeviceType>;
}

const XRayView: React.FC<XRayViewProps> = ({ data, activeDevices }) => {
    // Density mode: raw (original) or adjusted (anaphora-excluded)
    const [useAdjustedDensity, setUseAdjustedDensity] = useState(false);

    // Set of repeated line IDs (from anaphora)
    const repeatedLineIds = useMemo(() => {
        const ids = new Set<number>();
        data.anaphora?.forEach(a => a.line_ids.forEach(id => ids.add(id)));
        return ids;
    }, [data.anaphora]);

    // Compute density stats
    const densityStats = useMemo(() => {
        if (!data.line_devices) return null;
        const devices = data.line_devices.filter(d => {
            const line = data.lines[d.line_id];
            return line && line.text.trim().length > 0;
        });
        const getDensity = (d: typeof devices[0]) =>
            useAdjustedDensity ? (d.adjusted_density ?? d.device_density) : d.device_density;
        const max = Math.max(...devices.map(getDensity), 1);
        const avg = devices.reduce((s, d) => s + getDensity(d), 0) / (devices.length || 1);
        return { devices, max, avg, getDensity };
    }, [data, useAdjustedDensity]);

    // Group lines by section
    const sectionGroups = useMemo(() => {
        if (!data.sections) return [];
        return data.sections.map(section => ({
            section,
            lines: data.lines.slice(section.start_line, section.end_line + 1),
        }));
    }, [data]);

    // Compute device breakdown per section for comparison
    const sectionDeviceBreakdown = useMemo(() => {
        if (!data.sections || !data.line_devices) return [];
        return data.sections.map(section => {
            const lineDevices = data.line_devices!.filter(
                d => d.line_id >= section.start_line && d.line_id <= section.end_line
            );
            const deviceTypes: Record<string, number> = {};
            lineDevices.forEach(ld => {
                ld.devices.forEach(dev => {
                    const type = dev.split(':')[0]; // "rhyme", "assonance", etc.
                    deviceTypes[type] = (deviceTypes[type] || 0) + 1;
                });
            });
            const totalDevices = lineDevices.reduce((s, d) => s + d.device_count, 0);
            const avgDensity = lineDevices.length > 0
                ? lineDevices.reduce((s, d) => s + d.device_density, 0) / lineDevices.length
                : 0;
            return { section, deviceTypes, totalDevices, avgDensity };
        });
    }, [data]);

    return (
        <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-8 animate-fade-in">

            {/* ── Density Heatmap ── */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <span className="text-amber-400">▊</span>
                        Device Density Map
                    </h2>
                    {/* Density mode toggle */}
                    {data.anaphora && data.anaphora.length > 0 && (
                        <button
                            onClick={() => setUseAdjustedDensity(!useAdjustedDensity)}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${useAdjustedDensity
                                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                    : 'bg-slate-800/50 border-slate-700/50 text-slate-500 hover:text-slate-400'
                                }`}
                        >
                            {useAdjustedDensity ? '✓ Anaphora excluded' : 'Exclude anaphora'}
                        </button>
                    )}
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <div className="space-y-0.5">
                        {data.lines.map((line, idx) => {
                            const ld = data.line_devices?.find(d => d.line_id === idx);
                            const density = densityStats?.getDensity && ld
                                ? densityStats.getDensity(ld)
                                : (ld?.device_density ?? 0);
                            const isEmpty = !line.text.trim();
                            const isRepeated = repeatedLineIds.has(idx);
                            if (isEmpty) return <div key={idx} className="h-1" />;

                            const barWidth = densityStats
                                ? Math.max(2, (density / densityStats.max) * 100)
                                : 0;
                            const barColor = isRepeated && useAdjustedDensity
                                ? '#6366f1' // Indigo for repeated/excluded lines
                                : density < 1 ? '#475569' : density < 2 ? '#f59e0b' : '#ef4444';

                            return (
                                <div key={idx} className="flex items-center gap-3 group">
                                    <span className="w-6 text-right text-xs text-slate-600 font-mono shrink-0">
                                        {idx + 1}
                                    </span>
                                    <div className="flex-1 flex items-center gap-2 min-h-[20px]">
                                        <div
                                            className={`h-4 rounded-sm transition-all group-hover:h-5 ${isRepeated && useAdjustedDensity ? 'opacity-40' : ''
                                                }`}
                                            style={{
                                                width: isRepeated && useAdjustedDensity
                                                    ? `${Math.max(2, ((ld?.device_density ?? 0) / densityStats!.max) * 100)}%`
                                                    : `${barWidth}%`,
                                                backgroundColor: barColor,
                                                opacity: isRepeated && useAdjustedDensity ? 0.3 : 0.7,
                                            }}
                                        />
                                        <span className="text-xs text-slate-600 font-mono opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                            {density.toFixed(2)}
                                            {isRepeated && useAdjustedDensity && (
                                                <span className="text-indigo-400 ml-1">↻</span>
                                            )}
                                        </span>
                                    </div>
                                    <span className={`text-xs truncate max-w-[300px] opacity-0 group-hover:opacity-100 transition-opacity ${isRepeated ? 'text-indigo-400/60' : 'text-slate-500'
                                        }`}>
                                        {line.text.trim()}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-700/50 text-xs text-slate-500">
                        <span>Low</span>
                        <div className="flex gap-1">
                            <div className="w-6 h-2 rounded-sm" style={{ backgroundColor: '#475569' }} />
                            <div className="w-6 h-2 rounded-sm" style={{ backgroundColor: '#f59e0b' }} />
                            <div className="w-6 h-2 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
                        </div>
                        <span>High</span>
                        {data.anaphora && data.anaphora.length > 0 && (
                            <>
                                <div className="w-6 h-2 rounded-sm opacity-40" style={{ backgroundColor: '#6366f1' }} />
                                <span>Repeated</span>
                            </>
                        )}
                        {densityStats && (
                            <span className="ml-auto">
                                avg: {densityStats.avg.toFixed(2)} · max: {densityStats.max.toFixed(2)}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Syllable Symmetry ── */}
            {data.syllable_symmetry && data.syllable_symmetry.length > 0 && (
                <div>
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span>⚖️</span>
                        Syllable Symmetry
                    </h2>
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-slate-500 border-b border-slate-700">
                                    <th className="py-2 px-3 font-medium">Position</th>
                                    <th className="py-2 px-3 font-medium">Group</th>
                                    {data.syllable_symmetry[0]?.sections.map((s, i) => (
                                        <th key={i} className="py-2 px-3 font-medium">{s}</th>
                                    ))}
                                    <th className="py-2 px-3 font-medium">Δ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.syllable_symmetry.slice(0, 15).map((m, idx) => (
                                    <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                                        <td className="py-2 px-3 font-mono text-slate-400">
                                            Line {m.position + 1}
                                        </td>
                                        <td className="py-2 px-3 text-slate-500">{m.base_label}</td>
                                        {m.counts.map((c, i) => (
                                            <td key={i} className="py-2 px-3 font-mono">
                                                <span className={c === m.min_count && m.delta > 2
                                                    ? 'text-red-400 font-bold'
                                                    : c === m.max_count && m.delta > 2
                                                        ? 'text-green-400'
                                                        : 'text-slate-400'
                                                }>
                                                    {c}
                                                </span>
                                            </td>
                                        ))}
                                        <td className="py-2 px-3">
                                            <span className={`font-mono font-bold ${m.delta > 3 ? 'text-red-400' :
                                                    m.delta > 1 ? 'text-amber-400' :
                                                        'text-slate-600'
                                                }`}>
                                                {m.delta}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-xs text-slate-600 mt-2">
                        Sorted by largest delta. Big differences (Δ&gt;3) may cause scanning issues when singing.
                    </p>
                </div>
            )}

            {/* ── Hot Word Suggestions ── */}
            {data.suggestions && data.suggestions.length > 0 && (
                <div>
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span>🔥</span>
                        Hot Word Suggestions
                    </h2>
                    <p className="text-xs text-slate-500 mb-3">
                        These lines have the lowest phonetic density. Suggested words would add connections to nearby devices.
                    </p>
                    <div className="space-y-3">
                        {data.suggestions.map((s, idx) => (
                            <div
                                key={idx}
                                className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 hover:border-amber-500/30 transition-colors"
                            >
                                <div className="flex items-start justify-between gap-4 mb-3">
                                    <div className="min-w-0">
                                        <span className="text-xs text-slate-600 font-mono mr-2">
                                            L{s.line_id + 1}
                                        </span>
                                        <span className="text-sm text-slate-300 font-mono">
                                            "{s.line_text}"
                                        </span>
                                    </div>
                                    <span className={`shrink-0 text-xs font-mono px-2 py-0.5 rounded-full ${s.density === 0
                                            ? 'bg-red-500/20 text-red-400'
                                            : 'bg-amber-500/20 text-amber-400'
                                        }`}>
                                        density: {s.density.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {s.suggestions.map((sg, sgIdx) => (
                                        <div
                                            key={sgIdx}
                                            className="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/30 group/card hover:border-amber-500/30 transition-colors"
                                        >
                                            <span className="text-amber-400 font-semibold text-sm">{sg.word}</span>
                                            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${sg.device === 'rhyme'
                                                    ? 'bg-red-500/15 text-red-400'
                                                    : sg.device === 'assonance'
                                                        ? 'bg-cyan-500/15 text-cyan-400'
                                                        : 'bg-purple-500/15 text-purple-400'
                                                }`}>
                                                {sg.device}
                                            </span>
                                            <p className="text-xs text-slate-500 mt-1">{sg.reason}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Cascade Expansion ── */}
            {data.cascade_suggestions && data.cascade_suggestions.length > 0 && (
                <div>
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span>🌊</span>
                        Cascade Expansion
                    </h2>
                    <p className="text-xs text-slate-500 mb-3">
                        Existing cascades can be extended with words that share the consonant skeleton but use a different vowel.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {data.cascade_suggestions.map((cs, idx) => (
                            <div
                                key={idx}
                                className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 hover:border-purple-500/30 transition-colors"
                            >
                                <div className="mb-2">
                                    <span className="text-sm text-purple-400 font-semibold">{cs.name}</span>
                                    <code className="text-xs text-slate-600 font-mono ml-2">[{cs.skeleton}]</code>
                                </div>
                                <div className="text-xs text-slate-600 mb-2">
                                    Existing vowels: {cs.existing_vowels.join(', ')}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {cs.suggestions.map((s, sIdx) => (
                                        <span
                                            key={sIdx}
                                            className="bg-purple-500/10 text-purple-400 text-sm px-2.5 py-1 rounded-lg border border-purple-500/20 hover:border-purple-400/40 transition-colors cursor-default"
                                            title={`Vowel: ${s.vowel}`}
                                        >
                                            {s.word}
                                            <span className="text-purple-600 text-xs ml-1">({s.vowel})</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Anaphora Groups ── */}
            {data.anaphora && data.anaphora.length > 0 && (
                <div>
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span>↻</span>
                        Repeated Lines (Anaphora)
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {data.anaphora.map((a, idx) => (
                            <div
                                key={idx}
                                className="bg-slate-800/50 rounded-lg p-4 border border-indigo-500/20"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm text-indigo-400 font-mono">"{a.normalized}"</span>
                                    <span className="text-xs text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                                        ×{a.count}
                                    </span>
                                </div>
                                <div className="text-xs text-slate-600">
                                    Lines: {a.line_ids.map(id => id + 1).join(', ')}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Pattern Observations ── */}
            {data.regularity && data.regularity.length > 0 && (
                <div>
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span>🔍</span>
                        Pattern Observations
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {data.regularity.map((obs, idx) => (
                            <div
                                key={idx}
                                className={`bg-slate-800/50 rounded-lg p-4 border transition-all hover:bg-slate-800 ${obs.type === 'regularity' ? 'border-indigo-500/30' :
                                    obs.type === 'parallel_assonance' ? 'border-cyan-500/30' :
                                        obs.type === 'break' ? 'border-red-500/30' :
                                            obs.type === 'high_density' ? 'border-amber-500/30' :
                                                'border-slate-700/50'
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    <span className="text-xl shrink-0">
                                        {OBSERVATION_ICONS[obs.type] || '•'}
                                    </span>
                                    <div>
                                        <p className="text-sm text-slate-300">{obs.description}</p>
                                        <p className="text-xs text-slate-600 mt-1">
                                            Sections: {obs.sections_involved.map(i => data.sections?.[i]?.label || `#${i}`).join(', ')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Section Comparison ── */}
            {sectionDeviceBreakdown.length > 1 && (
                <div>
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span>📊</span>
                        Section Comparison
                    </h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-slate-500 border-b border-slate-700">
                                    <th className="py-2 px-3 font-medium">Section</th>
                                    <th className="py-2 px-3 font-medium">Lines</th>
                                    <th className="py-2 px-3 font-medium">Devices</th>
                                    <th className="py-2 px-3 font-medium">Avg Density</th>
                                    <th className="py-2 px-3 font-medium">Rhyme</th>
                                    <th className="py-2 px-3 font-medium">Assonance</th>
                                    <th className="py-2 px-3 font-medium">Alliteration</th>
                                    <th className="py-2 px-3 font-medium">Cascade</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sectionDeviceBreakdown.map(({ section, deviceTypes, totalDevices, avgDensity }) => (
                                    <tr key={section.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                                        <td className="py-2 px-3">
                                            <span className="text-slate-300 font-medium">{section.label}</span>
                                        </td>
                                        <td className="py-2 px-3 text-slate-500">{section.line_count}</td>
                                        <td className="py-2 px-3 text-slate-400 font-mono">{totalDevices}</td>
                                        <td className="py-2 px-3">
                                            <span className="font-mono" style={{
                                                color: avgDensity < 1.5 ? '#94a3b8' : avgDensity < 2 ? '#f59e0b' : '#ef4444'
                                            }}>
                                                {avgDensity.toFixed(2)}
                                            </span>
                                        </td>
                                        <td className="py-2 px-3 text-red-400 font-mono">{deviceTypes['rhyme'] || 0}</td>
                                        <td className="py-2 px-3 text-cyan-400 font-mono">{deviceTypes['assonance'] || 0}</td>
                                        <td className="py-2 px-3 text-green-400 font-mono">{deviceTypes['alliteration'] || 0}</td>
                                        <td className="py-2 px-3 text-purple-400 font-mono">{deviceTypes['cascade'] || 0}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Repeating Phoneme Patterns ── */}
            {data.patterns && data.patterns.length > 0 && (
                <div>
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span>🔢</span>
                        Repeating Phoneme Sequences
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {data.patterns.slice(0, 18).map((p, idx) => (
                            <div
                                key={idx}
                                className="bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-700/50 hover:border-indigo-500/30 transition-colors"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <code className="text-xs text-indigo-400 font-mono">[{p.pattern_str}]</code>
                                    <span className="text-xs text-slate-500">×{p.count}</span>
                                </div>
                                <div className="text-xs text-slate-500 space-y-0.5">
                                    {p.occurrences.slice(0, 3).map((occ, i) => (
                                        <div key={i}>
                                            L{occ.line + 1}:W{occ.word + 1} "{occ.word_text}"
                                        </div>
                                    ))}
                                    {p.occurrences.length > 3 && (
                                        <div className="text-slate-600">+{p.occurrences.length - 3} more</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default XRayView;
