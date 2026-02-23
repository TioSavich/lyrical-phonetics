import React, { useMemo } from 'react';
import { AnalysisResult, DeviceType, PhoneticGroup } from '../types';
import { getDeviceColor } from '../constants';

interface DeviceLegendProps {
    data: AnalysisResult;
    activeDevices: Set<DeviceType>;
    hoveredGroup: string | null;
    setHoveredGroup: (g: string | null) => void;
    selectedGroup: string | null;
    setSelectedGroup: (g: string | null) => void;
}

interface GroupEntry {
    deviceType: DeviceType;
    group: PhoneticGroup;
    color: string;
    words: string[];
}

const DEVICE_LABELS: Record<DeviceType, string> = {
    rhymes: 'Rhymes',
    assonance: 'Assonance',
    alliteration: 'Alliteration',
    cascades: 'Cascades',
};

const DeviceLegend: React.FC<DeviceLegendProps> = ({
    data,
    activeDevices,
    hoveredGroup,
    setHoveredGroup,
    selectedGroup,
    setSelectedGroup,
}) => {
    const entries = useMemo(() => {
        const result: Record<DeviceType, GroupEntry[]> = {
            rhymes: [],
            assonance: [],
            alliteration: [],
            cascades: [],
        };

        const addGroups = (groups: PhoneticGroup[], deviceType: DeviceType) => {
            if (!activeDevices.has(deviceType)) return;
            groups.forEach((group, groupIndex) => {
                if (!group?.words?.length) return;
                const color = getDeviceColor(deviceType, groupIndex);
                // Gather word texts
                const words = group.words
                    .map(ref => {
                        const line = data.lines[ref.lineIndex];
                        const word = line?.words?.[ref.wordIndex];
                        return word?.text;
                    })
                    .filter(Boolean) as string[];

                // Deduplicate
                const unique = [...new Set(words.map(w => w.toLowerCase()))];

                result[deviceType].push({ deviceType, group, color, words: unique });
            });
        };

        addGroups(data.rhymes || [], 'rhymes');
        addGroups(data.assonance || [], 'assonance');
        addGroups(data.alliteration || [], 'alliteration');
        addGroups(data.cascades || [], 'cascades');

        return result;
    }, [data, activeDevices]);

    const hasEntries = Object.values(entries).some((e: GroupEntry[]) => e.length > 0);
    if (!hasEntries) return null;

    return (
        <div className="w-56 shrink-0 text-sm print:hidden">
            <div className="sticky top-32 space-y-4 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Device Groups</h3>

                {(Object.entries(entries) as [DeviceType, GroupEntry[]][])
                    .filter(([_, groups]) => groups.length > 0)
                    .map(([deviceType, groups]) => (
                        <div key={deviceType} className="space-y-1">
                            <h4 className="text-xs font-medium text-slate-500">
                                {DEVICE_LABELS[deviceType]} ({groups.length})
                            </h4>
                            {groups.map((entry) => {
                                const isActive = selectedGroup === entry.group.id;
                                const isHovered = hoveredGroup === entry.group.id;
                                return (
                                    <button
                                        key={entry.group.id}
                                        className={`w-full text-left flex items-start gap-2 px-2 py-1 rounded-md transition-all text-xs ${isActive
                                            ? 'bg-slate-700 ring-1 ring-slate-500'
                                            : isHovered
                                                ? 'bg-slate-800'
                                                : 'hover:bg-slate-800/50'
                                            }`}
                                        onMouseEnter={() => setHoveredGroup(entry.group.id)}
                                        onMouseLeave={() => setHoveredGroup(null)}
                                        onClick={() => setSelectedGroup(
                                            selectedGroup === entry.group.id ? null : entry.group.id
                                        )}
                                    >
                                        <span
                                            className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
                                            style={{ backgroundColor: entry.color }}
                                        />
                                        <span className="text-slate-400 truncate">
                                            {entry.group.name || entry.words.slice(0, 4).join(', ')}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    ))}
            </div>
        </div>
    );
};

export default DeviceLegend;
