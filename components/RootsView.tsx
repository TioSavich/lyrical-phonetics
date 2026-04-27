import React from 'react';
import type { AnalysisResult, RootGroup } from '../types';

interface RootsViewProps {
  data: AnalysisResult;
}

const RootsView: React.FC<RootsViewProps> = ({ data }) => {
  const roots = data.roots ?? [];

  if (roots.length === 0) {
    return (
      <div style={emptyStyle}>
        <p>No recurring roots detected.</p>
        <p style={hintStyle}>
          The roots panel surfaces words that share a morphological stem after
          stripping common inflectional suffixes — useful for catching the
          repeated themes a phonetic grouper would miss. Try a longer passage.
        </p>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 600 }}>
          {roots.length} recurring root{roots.length === 1 ? '' : 's'}
        </span>
        <span style={hintStyle}>
          Sorted by frequency. Each root collects the words sharing its stem.
        </span>
      </div>

      <div style={listStyle}>
        {roots.map((r) => (
          <RootCard key={r.id} root={r} lineCount={data.lines.length} />
        ))}
      </div>
    </div>
  );
};

const RootCard: React.FC<{ root: RootGroup; lineCount: number }> = ({ root, lineCount }) => {
  const lineSet = new Set(root.words.map((w) => w.lineIndex));
  const lineSpan = lineSet.size;
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div style={stemStyle}>{root.stem}<span style={dashStyle}>—</span></div>
        <div style={metaStyle}>
          <span style={badgeStyle}>{root.count}× total</span>
          <span style={badgeStyle}>{root.surfaces.length} form{root.surfaces.length === 1 ? '' : 's'}</span>
          {lineCount > 1 && (
            <span style={badgeStyle}>across {lineSpan} line{lineSpan === 1 ? '' : 's'}</span>
          )}
        </div>
      </div>
      <div style={surfacesStyle}>
        {root.surfaces.map((s) => {
          const occurrences = root.words.filter((w) => w.surface === s).length;
          return (
            <span key={s} style={surfaceChipStyle}>
              {s}
              {occurrences > 1 && <span style={chipCountStyle}>×{occurrences}</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const shellStyle: React.CSSProperties = {
  padding: '1.25rem 1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  paddingBottom: '0.5rem',
  borderBottom: '1px solid var(--border-subtle)',
};

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: '0.85rem 1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '1rem',
  flexWrap: 'wrap',
};

const stemStyle: React.CSSProperties = {
  fontSize: '1.05rem',
  fontWeight: 700,
  color: 'var(--text-primary)',
  fontFamily: 'JetBrains Mono, monospace',
};

const dashStyle: React.CSSProperties = {
  color: 'var(--accent-secondary)',
  marginLeft: 1,
};

const metaStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.4rem',
  flexWrap: 'wrap',
};

const badgeStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  padding: '2px 8px',
  borderRadius: 999,
  background: 'rgba(124,58,237,0.15)',
  color: 'var(--accent-secondary)',
  fontWeight: 500,
};

const surfacesStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.4rem',
  flexWrap: 'wrap',
};

const surfaceChipStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  padding: '4px 10px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

const chipCountStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: 'var(--text-muted)',
  fontWeight: 600,
};

const emptyStyle: React.CSSProperties = {
  padding: '2rem',
  textAlign: 'center',
  color: 'var(--text-secondary)',
};

const hintStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--text-muted)',
  fontStyle: 'italic',
};

export default RootsView;
