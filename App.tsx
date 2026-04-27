import React, { useState, useCallback, useEffect, useRef } from 'react';
import { getEngine, SubstitutionEngine, SubstitutionResult, WordInfo } from './engine/SubstitutionEngine';
import { phonemeToCSS, phonemeToBgCSS, phonemeToHighlightCSS, stripStress, isVowel, VOWELS, CONSONANTS, VOWEL_NAMES } from './engine/phonemeColors';
import { getLanguage, listLanguages } from './engine/languages/registry';
import type { LanguageCode } from './engine/languages/Language';
import { analyzeText, enrichSemantics, type DeviceAnalysis } from './engine/devices';
import { analyzeFull } from './engine/analysis';
import type { AnalysisResult, DeviceType as ResultDeviceType } from './types';
import AnalysisView from './components/AnalysisView';
import ManuscriptView from './components/ManuscriptView';
import XRayView from './components/XRayView';
import WorkshopView from './components/WorkshopView';
import ControlPanel from './components/ControlPanel';
import RootsView from './components/RootsView';

// ── Types ──

type AppView = 'notepad' | 'paint' | 'analysis';

type PoemWord = {
  text: string;
  clean: string;
  info: WordInfo | null;
  lineIndex: number;
  wordIndex: number;
};

type PoemLine = {
  lineIndex: number;
  text: string;
  words: PoemWord[];
  isEmpty: boolean;
};

type HistoryEntry = {
  lineIndex: number;
  wordIndex: number;
  oldWord: string;
  newWord: string;
  timestamp: number;
};

type DeviceType = 'alliteration' | 'assonance' | 'consonance' | 'rhyme';

// ── Helpers ──

function cleanWord(w: string): string {
  return w.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, '');
}

function buildPoemLines(text: string, engine: SubstitutionEngine): PoemLine[] {
  return text.split('\n').map((line, li) => {
    const rawWords = line.split(/\s+/).filter(Boolean);
    const words: PoemWord[] = rawWords.map((w, wi) => {
      const clean = cleanWord(w);
      return {
        text: w,
        clean,
        info: clean ? engine.getWordInfo(clean) : null,
        lineIndex: li,
        wordIndex: wi,
      };
    });
    return {
      lineIndex: li,
      text: line,
      words,
      isEmpty: line.trim() === '',
    };
  });
}

// ── App ──

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('notepad');
  const [lyricsText, setLyricsText] = useState('');
  const [poemLines, setPoemLines] = useState<PoemLine[]>([]);
  const [engineReady, setEngineReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedWord, setSelectedWord] = useState<PoemWord | null>(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [activeDevice, setActiveDevice] = useState<DeviceType | null>(null);
  const [activePhoneme, setActivePhoneme] = useState<string | null>(null);
  const [substitutions, setSubstitutions] = useState<Map<number, SubstitutionResult[]>>(new Map());
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [analysis, setAnalysis] = useState<DeviceAnalysis | null>(null);
  const [fullAnalysis, setFullAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisText, setAnalysisText] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingSenses, setLoadingSenses] = useState(false);
  const [analysisTab, setAnalysisTab] = useState<'manuscript' | 'xray' | 'workshop' | 'roots' | 'devices'>('manuscript');
  const [activeResultDevices, setActiveResultDevices] = useState<Set<ResultDeviceType>>(
    new Set(['rhymes', 'assonance', 'alliteration', 'cascades'])
  );
  const [showDensity, setShowDensity] = useState(false);
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const toggleResultDevice = useCallback((d: ResultDeviceType) => {
    setActiveResultDevices(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  }, []);
  const engineRef = useRef<SubstitutionEngine | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Initialize engine on mount
  useEffect(() => {
    const engine = getEngine();
    engineRef.current = engine;
    engine.init().then(() => setEngineReady(true));
  }, []);

  // Close popup on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setSelectedWord(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Actions ──

  const handlePaint = useCallback(() => {
    if (!engineRef.current || !lyricsText.trim()) return;
    setLoading(true);
    // Use requestAnimationFrame to allow the spinner to render
    requestAnimationFrame(() => {
      const lines = buildPoemLines(lyricsText, engineRef.current!);
      setPoemLines(lines);
      setView('paint');
      setLoading(false);
      setHistory([]);
      setSelectedWord(null);
    });
  }, [lyricsText]);

  const handleWordClick = useCallback((word: PoemWord, event: React.MouseEvent) => {
    if (!word.info || !engineRef.current) return;

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const popupWidth = 340;
    const x = Math.min(rect.left, window.innerWidth - popupWidth - 16);
    const y = rect.bottom + 8;

    setSelectedWord(word);
    setPopupPos({ x, y: Math.min(y, window.innerHeight - 380) });

    // Compute substitutions
    const engine = engineRef.current;
    if (activeDevice) {
      const subs = engine.findDeviceSubstitutions(word.clean, activeDevice, activePhoneme);
      const byPosition = new Map<number, SubstitutionResult[]>();
      for (const s of subs) {
        const pos = s.position ?? 0;
        if (!byPosition.has(pos)) byPosition.set(pos, []);
        byPosition.get(pos)!.push(s);
      }
      setSubstitutions(byPosition);
    } else {
      const allSubs = engine.findAllSubstitutions(word.clean);
      setSubstitutions(allSubs);
    }
  }, [activeDevice, activePhoneme]);

  const handleSubstitute = useCallback((word: PoemWord, newWordText: string) => {
    const engine = engineRef.current;
    if (!engine) return;

    // Record history
    setHistory(prev => [...prev, {
      lineIndex: word.lineIndex,
      wordIndex: word.wordIndex,
      oldWord: word.clean,
      newWord: newWordText,
      timestamp: Date.now(),
    }]);

    // Update the poem
    setPoemLines(prev => prev.map(line => {
      if (line.lineIndex !== word.lineIndex) return line;
      return {
        ...line,
        words: line.words.map(w => {
          if (w.wordIndex !== word.wordIndex) return w;
          // Preserve original punctuation
          const leadPunc = w.text.match(/^[^a-zA-Z']*/)?.[0] ?? '';
          const trailPunc = w.text.match(/[^a-zA-Z']*$/)?.[0] ?? '';
          const newText = leadPunc + newWordText + trailPunc;
          return {
            ...w,
            text: newText,
            clean: newWordText,
            info: engine.getWordInfo(newWordText),
          };
        }),
      };
    }));

    setSelectedWord(null);
  }, []);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    const engine = engineRef.current;
    if (!engine) return;

    setPoemLines(prev => prev.map(line => {
      if (line.lineIndex !== last.lineIndex) return line;
      return {
        ...line,
        words: line.words.map(w => {
          if (w.wordIndex !== last.wordIndex) return w;
          const leadPunc = w.text.match(/^[^a-zA-Z']*/)?.[0] ?? '';
          const trailPunc = w.text.match(/[^a-zA-Z']*$/)?.[0] ?? '';
          return {
            ...w,
            text: leadPunc + last.oldWord + trailPunc,
            clean: last.oldWord,
            info: engine.getWordInfo(last.oldWord),
          };
        }),
      };
    }));

    setHistory(prev => prev.slice(0, -1));
  }, [history]);

  const handleSpeak = useCallback(() => {
    if (!('speechSynthesis' in window)) return;

    if (isSpeaking) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const text = poemLines.map(l => l.words.map(w => w.text).join(' ')).join('\n');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    speechSynthesis.speak(utterance);
  }, [poemLines, isSpeaking]);

  const handleBackToNotepad = useCallback(() => {
    speechSynthesis?.cancel();
    setIsSpeaking(false);
    // Update lyrics text with current poem state
    const newText = poemLines.map(l => l.words.map(w => w.text).join(' ')).join('\n');
    setLyricsText(newText);
    setView('notepad');
    setSelectedWord(null);
  }, [poemLines]);

  // ── Analyze (language-agnostic) ──
  const handleAnalyze = useCallback(async () => {
    if (!lyricsText.trim()) return;
    setAnalyzing(true);
    try {
      const lang = getLanguage(language);
      await lang.init();
      const result = analyzeText(lyricsText, lang);
      const full = analyzeFull(lyricsText, lang);
      setAnalysis(result);
      setFullAnalysis(full);
      setAnalysisText(lyricsText);
      setSelectedGroup(null);
      setHoveredGroup(null);
      setView('analysis');
      setLoadingSenses(true);
      // Background: enrich homophone groups with senses, then re-render.
      enrichSemantics(result, lang)
        .then((enriched) => setAnalysis({ ...enriched }))
        .catch(() => { /* best-effort */ })
        .finally(() => setLoadingSenses(false));
    } finally {
      setAnalyzing(false);
    }
  }, [lyricsText, language]);

  const handleBackFromAnalysis = useCallback(() => {
    setView('notepad');
  }, []);

  const handleExportJSON = useCallback(() => {
    if (!analysis && !fullAnalysis) return;
    const payload = {
      generatedAt: new Date().toISOString(),
      language,
      text: analysisText,
      analysis: fullAnalysis ?? null,
      devices: analysis ?? null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lyrical-phonetics-${language}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [analysis, fullAnalysis, analysisText, language]);

  // Get phonemes that are "paintable" for the current word given the active device
  const getPaintablePhonemes = useCallback((word: PoemWord): Set<string> => {
    if (!word.info || !activeDevice) return new Set();
    const phonemes = word.info.phonemes;
    const paintable = new Set<string>();
    for (const p of phonemes) {
      if (activeDevice === 'alliteration') {
        if (p.isVowel) break;
        paintable.add(p.clean);
      } else if (activeDevice === 'assonance' && p.isVowel) {
        paintable.add(p.clean);
      } else if (activeDevice === 'consonance' && !p.isVowel) {
        paintable.add(p.clean);
      }
    }
    return paintable;
  }, [activeDevice]);

  // Check if a word has a phoneme that matches the active paint
  const wordMatchesPaint = useCallback((word: PoemWord): boolean => {
    if (!word.info || !activePhoneme) return false;
    return word.info.phonemes.some(p => p.clean === activePhoneme);
  }, [activePhoneme]);

  // Compute current poem text for status bar
  const totalWords = poemLines.reduce((sum, l) => sum + l.words.length, 0);
  const knownWords = poemLines.reduce((sum, l) => sum + l.words.filter(w => w.info).length, 0);

  // ── Render ──

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <div className="logo-group">
          <div className="logo-icon">Pp</div>
          <span className="logo-text">PhonoPaint</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {view === 'analysis' && (
            <button className="btn-icon" onClick={handleBackFromAnalysis} title="Back to notepad">
              ✏️
            </button>
          )}
          {view === 'paint' && (
            <>
              <button className="btn-icon" onClick={handleBackToNotepad} title="Back to notepad">
                ✏️
              </button>
              <button
                className={`btn-icon ${isSpeaking ? 'active' : ''}`}
                onClick={handleSpeak}
                title={isSpeaking ? 'Stop reading' : 'Read aloud'}
              >
                {isSpeaking ? '⏹' : '🔊'}
              </button>
              {history.length > 0 && (
                <button className="btn-icon" onClick={handleUndo} title="Undo last substitution">
                  ↩
                </button>
              )}
            </>
          )}
          {!engineReady && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Loading dictionary…
            </span>
          )}
        </div>
      </header>

      {/* ── Notepad View ── */}
      {view === 'notepad' && (
        <div className="notepad-container">
          <div className="notepad-hero">
            <div className="logo-icon" style={{ width: 56, height: 56, fontSize: '1.1rem', margin: '0 auto' }}>
              Pp
            </div>
            <h2>Write something.</h2>
            <p>Paste lyrics, a poem, or just a few lines — then paint them with sound.</p>
          </div>

          <textarea
            className="notepad-textarea"
            value={lyricsText}
            onChange={e => setLyricsText(e.target.value)}
            placeholder="The cat sat on the mat&#10;Thinking of a rat&#10;While the rain outside&#10;Started to slide…"
          />

          <div className="buttons-row" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              className="btn-secondary"
              style={{ padding: '0.7rem 1rem' }}
              title="Language for analysis"
            >
              {listLanguages().map((l) => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
            <button
              className={`paint-button ${loading ? 'loading' : ''}`}
              disabled={!lyricsText.trim() || !engineReady || loading || language !== 'en'}
              onClick={handlePaint}
              title={language !== 'en' ? 'Paint It is currently English-only' : ''}
            >
              {loading ? (
                <><div className="spinner" /> Building grid…</>
              ) : (
                <>🎨 Paint It</>
              )}
            </button>
            <button
              className="btn-secondary"
              disabled={!lyricsText.trim() || analyzing}
              onClick={handleAnalyze}
              style={{ padding: '0.85rem 1.5rem', fontSize: '0.95rem', fontWeight: 600 }}
            >
              {analyzing ? (
                <><div className="spinner" style={{ display: 'inline-block', width: 14, height: 14, marginRight: 6, verticalAlign: 'middle' }} /> Analyzing…</>
              ) : (
                <>🔬 Analyze</>
              )}
            </button>
          </div>

          {!engineReady && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1rem' }}>
              <span className="spinner" style={{ display: 'inline-block', width: 14, height: 14, verticalAlign: 'middle', marginRight: 6 }} />
              Loading phoneme dictionary (3 MB, one-time)…
            </p>
          )}
        </div>
      )}

      {/* ── Paint View ── */}
      {view === 'paint' && (
        <div className="paint-layout">
          {/* Toolbar */}
          <div className="paint-toolbar">
            <div className="toolbar-group">
              <span className="toolbar-label">Device</span>
              {(['alliteration', 'assonance', 'consonance', 'rhyme'] as DeviceType[]).map(d => (
                <button
                  key={d}
                  className={`device-chip ${activeDevice === d ? 'active' : ''}`}
                  onClick={() => {
                    setActiveDevice(prev => prev === d ? null : d);
                    setActivePhoneme(null);
                    setSelectedWord(null);
                  }}
                >
                  {d === 'alliteration' ? '🅰 Allit.' :
                   d === 'assonance' ? '🔵 Asson.' :
                   d === 'consonance' ? '🟢 Cons.' :
                   '🔴 Rhyme'}
                </button>
              ))}
            </div>

            <div className="toolbar-divider" />

            {/* Phoneme Picker (when a device is active) */}
            {activeDevice && (
              <div className="toolbar-group" style={{ flexWrap: 'wrap', gap: '0.25rem' }}>
                <span className="toolbar-label">Phoneme</span>
                {Array.from(
                  activeDevice === 'assonance' ? VOWELS :
                  activeDevice === 'alliteration' || activeDevice === 'consonance' ? CONSONANTS :
                  new Set<string>()
                ).sort().map(ph => (
                  <button
                    key={ph}
                    className={`device-chip ${activePhoneme === ph ? 'active' : ''}`}
                    style={{
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.7rem',
                      borderColor: activePhoneme === ph ? phonemeToCSS(ph) : undefined,
                      background: activePhoneme === ph ? phonemeToCSS(ph) : undefined,
                    }}
                    onClick={() => setActivePhoneme(prev => prev === ph ? null : ph)}
                    title={VOWEL_NAMES[ph] ?? `/${ph}/`}
                  >
                    /{ph}/
                  </button>
                ))}
              </div>
            )}

            <div style={{ flex: 1 }} />

            {history.length > 0 && (
              <div className="history-badge">
                ↩ {history.length} edit{history.length > 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Poem Grid */}
          <div className="poem-grid">
            {poemLines.map(line => (
              <div key={line.lineIndex} className={`poem-line ${line.isEmpty ? 'empty-line' : ''}`}>
                {!line.isEmpty && (
                  <>
                    <span className="line-number">{line.lineIndex + 1}</span>
                    {line.words.map(word => {
                      const hasInfo = !!word.info;
                      const matchesPaint = wordMatchesPaint(word);
                      const paintable = activeDevice && hasInfo && getPaintablePhonemes(word).size > 0;

                      // Background color: use the primary stressed vowel color
                      let bgColor = 'transparent';
                      let textColor = hasInfo ? 'var(--text-primary)' : 'var(--text-muted)';

                      if (hasInfo && word.info) {
                        const stressedVowel = word.info.phonemes.find(p => p.stress === 1);
                        if (stressedVowel) {
                          bgColor = phonemeToBgCSS(stressedVowel.clean, 0.15);
                        }
                        if (matchesPaint && activePhoneme) {
                          bgColor = phonemeToBgCSS(activePhoneme, 0.35);
                          textColor = phonemeToHighlightCSS(activePhoneme);
                        }
                      }

                      return (
                        <span
                          key={`${line.lineIndex}-${word.wordIndex}`}
                          className={[
                            'word-cell',
                            selectedWord?.lineIndex === word.lineIndex && selectedWord?.wordIndex === word.wordIndex ? 'selected' : '',
                            paintable ? 'paintable' : '',
                            matchesPaint ? 'highlight' : '',
                          ].filter(Boolean).join(' ')}
                          style={{
                            backgroundColor: bgColor,
                            color: textColor,
                            '--paint-glow': activePhoneme ? phonemeToBgCSS(activePhoneme, 0.4) : undefined,
                            borderColor: matchesPaint && activePhoneme ? phonemeToCSS(activePhoneme) : undefined,
                          } as React.CSSProperties}
                          onClick={e => handleWordClick(word, e)}
                          title={hasInfo ? word.info!.phones.join(' ') : 'Not in dictionary'}
                        >
                          {word.text}
                        </span>
                      );
                    })}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Status Bar */}
          <div className="status-bar">
            <div className="status-stat">
              📝 {totalWords} words · {knownWords} in dictionary
            </div>
            <div className="status-stat">
              {activeDevice ? (
                <>{activeDevice}{activePhoneme ? ` · /${activePhoneme}/` : ''}</>
              ) : (
                <>Tap a word to explore</>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Analysis View (tabbed) ── */}
      {view === 'analysis' && analysis && (
        <div className="analysis-shell">
          <div className="analysis-controls">
            <ControlPanel
              activeDevices={activeResultDevices}
              toggleDevice={toggleResultDevice}
              showDensity={showDensity}
              setShowDensity={setShowDensity}
            />
            <button
              className="export-json-btn"
              onClick={handleExportJSON}
              title="Download the complete analysis as JSON"
            >
              ⬇ Export JSON
            </button>
          </div>
          <div className="analysis-tabs">
            {([
              ['manuscript', '📜 Manuscript'],
              ['xray', '📊 X-Ray'],
              ['workshop', '🛠 Workshop'],
              ['roots', '🌱 Roots'],
              ['devices', '🔬 Devices'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                className={`analysis-tab ${analysisTab === key ? 'active' : ''}`}
                onClick={() => setAnalysisTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {analysisTab === 'devices' && (
            <AnalysisView text={analysisText} analysis={analysis} loadingSenses={loadingSenses} />
          )}
          {analysisTab === 'manuscript' && fullAnalysis && (
            <ManuscriptView
              data={fullAnalysis}
              activeDevices={activeResultDevices}
              showDensity={showDensity}
              hoveredGroup={hoveredGroup}
              setHoveredGroup={setHoveredGroup}
              selectedGroup={selectedGroup}
              setSelectedGroup={setSelectedGroup}
            />
          )}
          {analysisTab === 'xray' && fullAnalysis && (
            <XRayView data={fullAnalysis} activeDevices={activeResultDevices} />
          )}
          {analysisTab === 'workshop' && fullAnalysis && (
            <WorkshopView data={fullAnalysis} />
          )}
          {analysisTab === 'roots' && fullAnalysis && (
            <RootsView data={fullAnalysis} />
          )}
        </div>
      )}

      {/* ── Substitution Popup ── */}
      {selectedWord && view === 'paint' && (
        <div
          ref={popupRef}
          className="sub-popup"
          style={{ left: popupPos.x, top: popupPos.y }}
        >
          <div className="sub-popup-header">
            <span className="sub-popup-title">{selectedWord.clean}</span>
            <span className="sub-popup-phonemes">
              {selectedWord.info?.phones.map((p, i) => (
                <span key={i} style={{ color: phonemeToCSS(p), marginRight: 4 }}>
                  {p}
                </span>
              ))}
            </span>
          </div>

          {substitutions.size === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.5rem 0' }}>
              No substitutions found{activeDevice ? ` for ${activeDevice}` : ''}.
              {!selectedWord.info && ' (Word not in dictionary.)'}
            </p>
          ) : (
            Array.from(substitutions.entries())
              .sort(([a], [b]) => a - b)
              .map(([position, subs]) => {
                const phoneme = selectedWord.info?.phones[position];
                const posLabel = phoneme
                  ? `Position ${position}: ${stripStress(phoneme)}`
                  : `Position ${position}`;
                return (
                  <div key={position} className="sub-position-group">
                    <div className="sub-position-label">
                      <span
                        className="phoneme-dot"
                        style={{ backgroundColor: phoneme ? phonemeToCSS(phoneme) : '#666' }}
                      />
                      {posLabel}
                      {phoneme && isVowel(phoneme) ? ' (vowel)' : ' (consonant)'}
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                        — {subs.length} option{subs.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="sub-list">
                      {subs.slice(0, 24).map(s => (
                        <button
                          key={s.word}
                          className="sub-chip"
                          style={{
                            borderColor: phonemeToBgCSS(s.substitutedPhoneme, 0.5),
                          }}
                          onClick={() => handleSubstitute(selectedWord, s.word)}
                          title={`→ ${s.phones.join(' ')}`}
                        >
                          {s.word}
                        </button>
                      ))}
                      {subs.length > 24 && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', padding: '0.3rem' }}>
                          +{subs.length - 24} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}
    </div>
  );
};

export default App;
