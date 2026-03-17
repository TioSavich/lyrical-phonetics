import React, { useState, useCallback, useEffect, useRef } from 'react';
import { getEngine, SubstitutionEngine, SubstitutionResult, WordInfo } from './engine/SubstitutionEngine';
import { phonemeToCSS, phonemeToBgCSS, phonemeToHighlightCSS, stripStress, isVowel, VOWELS, CONSONANTS, VOWEL_NAMES } from './engine/phonemeColors';

// ── Types ──

type AppView = 'notepad' | 'paint';

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

          <div className="buttons-row">
            <button
              className={`paint-button ${loading ? 'loading' : ''}`}
              disabled={!lyricsText.trim() || !engineReady || loading}
              onClick={handlePaint}
            >
              {loading ? (
                <><div className="spinner" /> Building grid…</>
              ) : (
                <>🎨 Paint It</>
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
