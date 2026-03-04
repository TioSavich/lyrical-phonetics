import React, { useState, useCallback } from 'react';
import { AnalysisResult, AppView, DeviceType, DEVICE_TYPES } from './types';
import ControlPanel from './components/ControlPanel';
import ManuscriptView from './components/ManuscriptView';
import XRayView from './components/XRayView';
import WorkshopView from './components/WorkshopView';
import { Download, Upload, FileText, Printer, Minimize2, Maximize2, Sparkles } from 'lucide-react';

const App: React.FC = () => {
  const [analysisData, setAnalysisData] = useState<AnalysisResult | null>(null);
  const [appView, setAppView] = useState<AppView>(AppView.LOAD);
  const [activeDevices, setActiveDevices] = useState<Set<DeviceType>>(new Set(['rhymes']));
  const [showDensity, setShowDensity] = useState(true);
  const [fileName, setFileName] = useState<string>('');
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [isCompact, setIsCompact] = useState(false);
  const [lyricsText, setLyricsText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyzeText = useCallback(async () => {
    if (!lyricsText.trim()) return;
    setIsAnalyzing(true);
    try {
      const resp = await fetch('http://localhost:7744/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: lyricsText }),
      });
      if (!resp.ok) throw new Error('Analysis failed');
      const data = await resp.json();
      setAnalysisData(data);
      setFileName('New Analysis');
      setAppView(AppView.MANUSCRIPT);
      setActiveDevices(new Set(['rhymes']));
    } catch (err) {
      console.error(err);
      alert('Could not connect to the phonetic engine. Make sure the backend is running.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [lyricsText]);

  const handleFileLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's a .txt file (process via engine) or .json (load directly)
    if (file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const text = evt.target?.result as string;
        setLyricsText(text);
        // We set the text and could trigger analysis, but let the user verify in the textarea first
      };
      reader.readAsText(file);
      return;
    }

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
      const resp = await fetch('./output_examples/lyrics-phonetic-analysis-Cougar.json');
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
                  title="Load text or JSON">
                  <Upload size={15} />
                  <input type="file" accept=".json,.txt" onChange={handleFileLoad} className="hidden" />
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

      <main className="flex-1 w-full flex flex-col items-center">
        {/* Load screen */}
        {appView === AppView.LOAD && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] w-full max-w-4xl px-6 py-12 gap-8 animate-fade-in">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center font-bold font-mono text-2xl mb-6">
                Ph
              </div>
              <h2 className="text-3xl font-bold">Lyrical Phonetics</h2>
              <p className="text-slate-400 max-w-md mx-auto">
                Paste your lyrics below or load an existing analysis to begin.
              </p>
            </div>

            <div className="w-full space-y-4">
              <div className="relative group">
                <textarea
                  value={lyricsText}
                  onChange={(e) => setLyricsText(e.target.value)}
                  placeholder="Paste your lyrics here (e.g. Verse, Chorus, etc.)..."
                  className="w-full h-64 bg-slate-800/50 border-2 border-slate-700/50 rounded-2xl p-6 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:bg-slate-800 transition-all resize-none shadow-inner"
                />
                {!lyricsText && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-700/30 group-hover:text-slate-700/50 transition-colors">
                    <FileText size={80} strokeWidth={1} />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-4">
                <button
                  onClick={handleAnalyzeText}
                  disabled={!lyricsText.trim() || isAnalyzing}
                  className={`flex items-center justify-center gap-2 px-8 py-3 rounded-full font-bold text-white shadow-lg transition-all transform hover:scale-105 active:scale-95 ${!lyricsText.trim() || isAnalyzing
                    ? 'bg-slate-700 cursor-not-allowed opacity-50'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-600/20'
                    }`}
                >
                  {isAnalyzing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      Analyze Lyrics
                    </>
                  )}
                </button>

                <div className="flex items-center gap-2">
                  <label className="flex items-center justify-center gap-2 px-5 py-3 rounded-full font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 cursor-pointer transition-all">
                    <Upload size={18} />
                    Load .txt / .json
                    <input type="file" accept=".json,.txt" onChange={handleFileLoad} className="hidden" />
                  </label>

                  <button
                    onClick={handleLoadSample}
                    className="flex items-center justify-center gap-2 px-5 py-3 rounded-full font-medium text-slate-400 hover:text-slate-200 transition-all"
                  >
                    View Sample (Cougar)
                  </button>
                </div>
              </div>
            </div>

            <p className="text-slate-600 text-xs text-center">
              Lyrical Phonetics uses a deterministic phonetic engine to find rhymes, assonance, and alliteration markers.
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
