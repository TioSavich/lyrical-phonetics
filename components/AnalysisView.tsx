/**
 * Analysis view — surfaces deterministic findings from engine/devices.
 *
 * Sections: meter summary, vowel cascades, homophones (with sense flag),
 * paronyms (one-phoneme-apart trace pairs), and calembours (multi-word puns).
 *
 * Each finding is anchored to text positions; the "preview" line shows the
 * source line with the relevant words highlighted.
 */

import React, { useMemo, useState } from 'react';
import type { DeviceAnalysis } from '../engine/devices';
import type { Cascade } from '../engine/devices/cascades';
import type { HomophoneGroup } from '../engine/devices/homophones';
import type { ParonymPair } from '../engine/devices/paronyms';
import type { Calembour } from '../engine/devices/calembours';
import type { LineMeter } from '../engine/devices/meter';

type Props = {
  text: string;
  analysis: DeviceAnalysis;
  loadingSenses: boolean;
};

function splitLines(text: string): string[] {
  return text.split('\n');
};

function highlightLine(rawLine: string, wordIndices: Set<number>): React.ReactNode {
  const words = rawLine.split(/(\s+)/); // keep whitespace tokens
  let wordIdx = 0;
  return words.map((tok, i) => {
    if (/\s+/.test(tok)) return <span key={i}>{tok}</span>;
    const isHighlight = wordIndices.has(wordIdx);
    const out = (
      <span
        key={i}
        style={{
          background: isHighlight ? 'rgba(167, 139, 250, 0.35)' : 'transparent',
          color: isHighlight ? '#f1f5f9' : 'inherit',
          padding: isHighlight ? '0 4px' : '0',
          borderRadius: 4,
          fontWeight: isHighlight ? 600 : 400,
        }}
      >
        {tok}
      </span>
    );
    wordIdx++;
    return out;
  });
};

const CascadeRow: React.FC<{ cascade: Cascade; lines: string[] }> = ({ cascade, lines }) => {
  // Group members by line for the preview.
  const byLine = new Map<number, Set<number>>();
  for (const m of cascade.members) {
    if (!byLine.has(m.lineIndex)) byLine.set(m.lineIndex, new Set());
    byLine.get(m.lineIndex)!.add(m.wordIndex);
  }
  return (
    <div style={rowStyle}>
      <div style={rowHeaderStyle}>
        <span style={badgeStyle('#7c3aed')}>cascade</span>
        <code style={codeStyle}>{cascade.skeleton}</code>
        <span style={metaStyle}>
          slot {cascade.slotIndex} · {cascade.distinctVowels.map((v) => `/${v}/`).join(' ')} · {cascade.direction}
        </span>
      </div>
      <div style={previewStyle}>
        {[...byLine.entries()].slice(0, 4).map(([li, wis]) => (
          <div key={li} style={lineStyle}>
            <span style={lineNumStyle}>{li + 1}</span>
            <span>{highlightLine(lines[li] ?? '', wis)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const HomophoneRow: React.FC<{ group: HomophoneGroup; lines: string[] }> = ({ group, lines }) => {
  const byLine = new Map<number, Set<number>>();
  for (const o of group.occurrences) {
    if (!byLine.has(o.lineIndex)) byLine.set(o.lineIndex, new Set());
    byLine.get(o.lineIndex)!.add(o.wordIndex);
  }
  const distinct = group.semanticallyDistinct;
  return (
    <div style={rowStyle}>
      <div style={rowHeaderStyle}>
        <span style={badgeStyle(distinct ? '#f472b6' : '#a78bfa')}>
          homophone{distinct ? ' · distinct senses' : ''}
        </span>
        <code style={codeStyle}>/{group.ipa}/</code>
        <span style={metaStyle}>{group.surfaces.join(' = ')}</span>
      </div>
      {group.sensesBySurface && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
          {group.surfaces.map((s) => {
            const senses = group.sensesBySurface![s] ?? [];
            const head = senses[0];
            return (
              <div key={s} style={{ marginBottom: 2 }}>
                <strong style={{ color: 'var(--text-primary)' }}>{s}</strong>
                {head ? (
                  <span> — <em>{head.pos}</em>: {head.gloss}</span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}> — (no senses found)</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div style={previewStyle}>
        {[...byLine.entries()].slice(0, 4).map(([li, wis]) => (
          <div key={li} style={lineStyle}>
            <span style={lineNumStyle}>{li + 1}</span>
            <span>{highlightLine(lines[li] ?? '', wis)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ParonymRow: React.FC<{ pair: ParonymPair; lines: string[] }> = ({ pair, lines }) => {
  const byLine = new Map<number, Set<number>>();
  for (const w of [pair.a, pair.b]) {
    if (!byLine.has(w.lineIndex)) byLine.set(w.lineIndex, new Set());
    byLine.get(w.lineIndex)!.add(w.wordIndex);
  }
  return (
    <div style={rowStyle}>
      <div style={rowHeaderStyle}>
        <span style={badgeStyle('#22d3ee')}>paronym</span>
        <code style={codeStyle}>{pair.a.surface} ↔ {pair.b.surface}</code>
        <span style={metaStyle}>
          /{pair.from}/ → /{pair.to}/ at position {pair.pos}
        </span>
      </div>
      <div style={previewStyle}>
        {[...byLine.entries()].slice(0, 4).map(([li, wis]) => (
          <div key={li} style={lineStyle}>
            <span style={lineNumStyle}>{li + 1}</span>
            <span>{highlightLine(lines[li] ?? '', wis)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const CalembourRow: React.FC<{ pun: Calembour; lines: string[] }> = ({ pun, lines }) => {
  const byLine = new Map<number, Set<number>>();
  for (let li = pun.phraseStart.lineIndex; li <= pun.phraseEnd.lineIndex; li++) {
    if (!byLine.has(li)) byLine.set(li, new Set());
    const start = li === pun.phraseStart.lineIndex ? pun.phraseStart.wordIndex : 0;
    const end = li === pun.phraseEnd.lineIndex ? pun.phraseEnd.wordIndex : Infinity;
    for (let w = start; w <= end && w < (lines[li]?.split(/\s+/).filter(Boolean).length ?? 0); w++) {
      byLine.get(li)!.add(w);
    }
  }
  if (pun.soundsLikeAt) {
    const li = pun.soundsLikeAt.lineIndex;
    if (!byLine.has(li)) byLine.set(li, new Set());
    byLine.get(li)!.add(pun.soundsLikeAt.wordIndex);
  }
  return (
    <div style={rowStyle}>
      <div style={rowHeaderStyle}>
        <span style={badgeStyle('#facc15')}>calembour</span>
        <code style={codeStyle}>{pun.phrase}</code>
        <span style={metaStyle}>
          sounds like <em>{pun.sounds_like}</em> · /{pun.ipa}/
        </span>
      </div>
      <div style={previewStyle}>
        {[...byLine.entries()].slice(0, 4).map(([li, wis]) => (
          <div key={li} style={lineStyle}>
            <span style={lineNumStyle}>{li + 1}</span>
            <span>{highlightLine(lines[li] ?? '', wis)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const MeterPanel: React.FC<{ meter: DeviceAnalysis['meter'] }> = ({ meter }) => {
  const nonEmpty = meter.lines.filter((l) => l.foot !== 'silent');
  return (
    <div style={{ ...rowStyle, background: 'rgba(124,58,237,0.08)' }}>
      <div style={rowHeaderStyle}>
        <span style={badgeStyle('#7c3aed')}>{meter.style}</span>
        <span style={{ fontWeight: 600 }}>{meter.summary}</span>
      </div>
      {nonEmpty.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {nonEmpty.slice(0, 24).map((l: LineMeter) => (
            <span
              key={l.lineId}
              style={{
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
              }}
              title={meter.style === 'accentual'
                ? `stress: ${l.stressPattern.join('')}`
                : (l.clauses ? `clauses: ${l.clauses.join(' · ')}` : '')}
            >
              <strong style={{ color: 'var(--text-primary)' }}>{l.lineId + 1}</strong>·{l.syllableCount}σ
              {l.clauses && l.clauses.length > 1 && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                  ({l.clauses.join('+')})
                </span>
              )}
              <span style={{ marginLeft: 4 }}>· {l.foot}</span>
            </span>
          ))}
          {nonEmpty.length > 24 && <span style={metaStyle}>+{nonEmpty.length - 24} more</span>}
        </div>
      )}
    </div>
  );
};

const rowStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 12,
  padding: '0.7rem 0.9rem',
  marginBottom: '0.5rem',
};
const rowHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
};
const codeStyle: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  background: 'rgba(255,255,255,0.04)',
  padding: '2px 6px', borderRadius: 4,
  fontSize: '0.85rem',
};
const metaStyle: React.CSSProperties = {
  fontSize: '0.78rem', color: 'var(--text-secondary)',
};
const previewStyle: React.CSSProperties = {
  marginTop: '0.5rem',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.6,
};
const lineStyle: React.CSSProperties = {
  display: 'flex', gap: '0.5rem', alignItems: 'baseline',
};
const lineNumStyle: React.CSSProperties = {
  color: 'var(--text-muted)', fontSize: '0.7rem', minWidth: 20, textAlign: 'right',
};
const sectionStyle: React.CSSProperties = {
  marginBottom: '1.5rem',
};
const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem',
  paddingBottom: '0.3rem', borderBottom: '1px solid var(--border-subtle)',
};
const sectionTitleStyle: React.CSSProperties = {
  fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)',
};
const countStyle: React.CSSProperties = {
  fontSize: '0.75rem', color: 'var(--text-muted)',
};

function badgeStyle(color: string): React.CSSProperties {
  return {
    fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px',
    padding: '2px 8px', borderRadius: 4,
    background: color + '22', color, fontWeight: 700,
  };
};

const AnalysisView: React.FC<Props> = ({ text, analysis, loadingSenses }) => {
  const lines = useMemo(() => splitLines(text), [text]);
  const [filter, setFilter] = useState<'all' | 'distinct'>('all');

  const homophones = filter === 'distinct'
    ? analysis.homophones.filter((h) => h.semanticallyDistinct)
    : analysis.homophones;

  return (
    <div style={{ padding: '1.5rem', maxWidth: 960, margin: '0 auto' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Analysis</h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {analysis.recognizedWords}/{analysis.totalWords} words recognized · language: {analysis.language}
          </div>
        </div>
        {loadingSenses && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span className="spinner" style={{ display: 'inline-block', width: 12, height: 12, marginRight: 6, verticalAlign: 'middle' }} />
            fetching senses…
          </span>
        )}
      </div>

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <span style={sectionTitleStyle}>Meter</span>
        </div>
        <MeterPanel meter={analysis.meter} />
      </section>

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <span style={sectionTitleStyle}>Vowel cascades</span>
          <span style={countStyle}>{analysis.cascades.length} found</span>
        </div>
        {analysis.cascades.length === 0 && <EmptyHint label="No vowel cascades detected." />}
        {analysis.cascades.slice(0, 30).map((c) => (
          <CascadeRow key={c.id} cascade={c} lines={lines} />
        ))}
      </section>

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <span style={sectionTitleStyle}>Homophones</span>
          <span style={countStyle}>{analysis.homophones.length} groups</span>
          <button
            onClick={() => setFilter(filter === 'all' ? 'distinct' : 'all')}
            style={{
              marginLeft: 'auto',
              padding: '2px 10px',
              borderRadius: 12,
              border: '1px solid var(--border-subtle)',
              background: filter === 'distinct' ? 'rgba(244,114,182,0.15)' : 'transparent',
              color: 'var(--text-secondary)',
              fontSize: '0.7rem',
              cursor: 'pointer',
            }}
            title="Show only homophones with demonstrably different senses"
          >
            {filter === 'distinct' ? '✓ distinct senses only' : 'show distinct senses only'}
          </button>
        </div>
        {homophones.length === 0 && <EmptyHint label={
          filter === 'distinct'
            ? 'No semantically distinct homophones found (or senses still loading).'
            : 'No homophones detected.'
        } />}
        {homophones.slice(0, 30).map((g) => (
          <HomophoneRow key={g.id} group={g} lines={lines} />
        ))}
      </section>

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <span style={sectionTitleStyle}>Paronyms</span>
          <span style={countStyle}>{analysis.paronyms.length} pairs · one phoneme apart</span>
        </div>
        {analysis.paronyms.length === 0 && <EmptyHint label="No paronym pairs detected." />}
        {analysis.paronyms.slice(0, 30).map((p) => (
          <ParonymRow key={p.id} pair={p} lines={lines} />
        ))}
      </section>

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <span style={sectionTitleStyle}>Calembours</span>
          <span style={countStyle}>{analysis.calembours.length} multi-word puns</span>
        </div>
        {analysis.calembours.length === 0 && <EmptyHint label="No multi-word homophones detected." />}
        {analysis.calembours.slice(0, 30).map((c) => (
          <CalembourRow key={c.id} pun={c} lines={lines} />
        ))}
      </section>
    </div>
  );
};

const EmptyHint: React.FC<{ label: string }> = ({ label }) => (
  <div style={{
    color: 'var(--text-muted)', fontSize: '0.8rem',
    padding: '0.5rem 0.7rem', fontStyle: 'italic',
  }}>{label}</div>
);

export default AnalysisView;
