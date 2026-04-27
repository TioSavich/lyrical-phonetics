import React from 'react';
import { DeviceType, DEVICE_TYPES } from '../types';

interface ControlPanelProps {
  activeDevices: Set<DeviceType>;
  toggleDevice: (device: DeviceType) => void;
  showDensity: boolean;
  setShowDensity: (v: boolean) => void;
}

const DEVICE_META: Record<DeviceType, { label: string; icon: string; accent: string }> = {
  rhymes: { label: 'Rhymes', icon: '🔴', accent: 'bg-red-500/20 text-red-400 border-red-500/30' },
  assonance: { label: 'Assonance', icon: '🔵', accent: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  alliteration: { label: 'Alliteration', icon: '🟢', accent: 'bg-green-500/20 text-green-400 border-green-500/30' },
  cascades: { label: 'Cascades', icon: '🟣', accent: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
};

const ControlPanel: React.FC<ControlPanelProps> = ({
  activeDevices,
  toggleDevice,
  showDensity,
  setShowDensity,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Device checkboxes */}
      {DEVICE_TYPES.map((device) => {
        const meta = DEVICE_META[device];
        const isActive = activeDevices.has(device);
        return (
          <button
            key={device}
            onClick={() => toggleDevice(device)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all border ${isActive
                ? meta.accent
                : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'
              }`}
          >
            {meta.icon}
            {meta.label}
          </button>
        );
      })}

      <div className="w-px h-6 bg-slate-700 mx-1" />

      {/* Density toggle */}
      <button
        onClick={() => setShowDensity(!showDensity)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all border ${showDensity
            ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'
          }`}
      >
        📊 Density
      </button>
    </div>
  );
};

export default ControlPanel;
