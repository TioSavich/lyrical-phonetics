import React, { useState, useCallback } from 'react';
import { AnalysisResult, AppView, DeviceType, DEVICE_TYPES } from './types';
import ControlPanel from './components/ControlPanel';
import ManuscriptView from './components/ManuscriptView';
import XRayView from './components/XRayView';
import WorkshopView from './components/WorkshopView';
import { Download, Upload, FileText, Printer, Minimize2, Maximize2 } from 'lucide-react';

const App: React.FC = () => {
  const [analysisData, setAnalysisData] = useState<AnalysisResult | null>(null);
  const [appView, setAppView] = useState<AppView>(AppView.LOAD);
  const [activeDevices, setActiveDevices] = useState<Set<DeviceType>>(new Set(['rhymes']));
  const [showDensity, setShowDensity] = useState(true);
  const [fileName, setFileName] = useState<string>('');
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [isCompact, setIsCompact] = useState(false);

  const handleFileLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string) as AnalysisResult;
        setAnalysisData(data);
        setAppView(AppView.MANUSCRIPT);
        setActiveDevices(new Set(['rhymes']));
      } catch {
        alert('Invalid JSON file. Please load a phonetic analysis JSON.');
      }
    };
    reader.readAsText(file);
    // Reset so onChange fires again if user picks a different file next time
    e.target.value = '';
  }, []);

  const handleLoadSample = useCallback(async () => {
    try {
      const resp = await fetch('/output_examples/lyrics-phonetic-analysis-Cougar.json');
      if (!resp.ok) throw new Error('Sample not found');
      const data = await resp.json();
      setAnalysisData(data);
      setFileName('Cougar (sample)');
      setAppView(AppView.MANUSCRIPT);
      setActiveDevices(new Set(['rhymes']));
    } catch {
      alert('Could not load sample. Run the Python engine first to generate output.');
    }
  }, []);

  const toggleDevice = useCallback((device: DeviceType) => {
    setActiveDevices(prev => {
      const next = new Set(prev);
      if (next.has(device)) next.delete(device);
      else next.add(device);
      return next;
    });
  }, []);

  const handleExport = useCallback(() => {
    if (!analysisData) return;
    const blob = new Blob([JSON.stringify(analysisData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lyrics-analysis.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [analysisData]);

  return (
    <div className={`min-h-screen bg-slate-900 text-slate-50 flex flex-col font-sans selection:bg-indigo-500 selection:text-white ${isCompact ? 'compact-mode' : ''}`}>
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 print:hidden">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center font-bold font-mono text-sm">
              Ph
            </div>
            <h1 className="text-lg font-bold tracking-tight">Lyrical Phonetics</h1>
            {fileName && (
              <span className="text-sm text-slate-500 ml-2">— {fileName}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {analysisData && appView !== AppView.LOAD && (
              <>
                {/* View tabs */}
                <div className="flex bg-slate-800 rounded-lg p-0.5 mr-4">
                  {([
                    [AppView.MANUSCRIPT, 'Manuscript'],
                    [AppView.XRAY, 'X-Ray'],
                    [AppView.WORKSHOP, 'Workshop']
                  ] as [AppView, string][]).map(([view, label]) => (
                    <button
                      key={view}
                      onClick={() => setAppView(view)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${appView === view
                        ? 'bg-indigo-600 text-white shadow-lg'
                        : 'text-slate-400 hover:text-white'
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleExport}
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 text-sm px-2"
                  title="Export JSON"
                >
                  <Download size={15} />
                </button>
                <button
                  onClick={() => setIsCompact(!isCompact)}
                  className={`transition-colors flex items-center gap-1.5 text-sm px-2 ${isCompact ? 'text-amber-400' : 'text-slate-400 hover:text-white'}`}
                  title={isCompact ? 'Normal size' : 'Compact (fit to page)'}
                >
                  {isCompact ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
                </button>
                <button
                  onClick={() => window.print()}
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 text-sm px-2"
                  title="Print"
                >
                  <Printer size={15} />
                </button>

                {/* Load different file */}
                <label className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 text-sm px-2 cursor-pointer"
                  title="Load different JSON">
                  <Upload size={15} />
                  <input type="file" accept=".json" onChange={handleFileLoad} className="hidden" />
                </label>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Control bar (when viewing analysis) */}
      {analysisData && appView !== AppView.LOAD && (appView === AppView.MANUSCRIPT || appView === AppView.XRAY) && (
        <div className="sticky top-14 z-40 border-b border-slate-800/50 bg-slate-900/90 backdrop-blur-sm print:hidden">
          <div className="max-w-[1400px] mx-auto px-6 py-2">
            <ControlPanel
              activeDevices={activeDevices}
              toggleDevice={toggleDevice}
              showDensity={showDensity}
              setShowDensity={setShowDensity}
            />
          </div>
        </div>
      )}

      <main className="flex-1 w-full">
        {/* Load screen */}
        {appView === AppView.LOAD && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 animate-fade-in">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center font-bold font-mono text-2xl mb-6">
                Ph
              </div>
              <h2 className="text-3xl font-bold">Lyrical Phonetics</h2>
              <p className="text-slate-400 max-w-md">
                Load a phonetic analysis JSON from the Python engine to explore your lyrics.
              </p>
            </div>

            <div className="flex flex-col gap-3 w-64">
              <label className="flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 cursor-pointer transition-all transform hover:scale-105">
                <Upload size={18} />
                Load JSON File
                <input type="file" accept=".json" onChange={handleFileLoad} className="hidden" />
              </label>

              <button
                onClick={handleLoadSample}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-full font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
              >
                <FileText size={18} />
                Load Sample (Cougar)
              </button>
            </div>

            <p className="text-slate-600 text-xs mt-4">
              Generate JSON with: <code className="text-slate-500">python3 analyze.py lyrics.txt -o analysis.json</code>
            </p>
          </div>
        )}

        {/* Manuscript View */}
        {analysisData && appView === AppView.MANUSCRIPT && (
          <ManuscriptView
            data={analysisData}
            activeDevices={activeDevices}
            showDensity={showDensity}
            hoveredGroup={hoveredGroup}
            setHoveredGroup={setHoveredGroup}
            selectedGroup={selectedGroup}
            setSelectedGroup={setSelectedGroup}
            isCompact={isCompact}
          />
        )}

        {/* X-Ray View */}
        {analysisData && appView === AppView.XRAY && (
          <XRayView
            data={analysisData}
            activeDevices={activeDevices}
          />
        )}

        {/* Workshop View */}
        {analysisData && appView === AppView.WORKSHOP && (
          <WorkshopView data={analysisData} />
        )}
      </main>
    </div>
  );
};

export default App;
