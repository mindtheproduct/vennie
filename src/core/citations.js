'use strict';

// ── Citation Manager ────────────────────────────────────────────────────────
// Tracks file reads and searches during a response turn, then formats them
// as footnotes that can be rendered in CLI or desktop.
//
// Usage:
//   const cm = createCitationManager();
//   cm.add({ type: 'file', path: '/vault/Tasks.md', filename: 'Tasks.md', lines: '48 lines' });
//   cm.add({ type: 'search', pattern: 'roadmap', files: ['a.md', 'b.md'], matchCount: 5 });
//   const footnotes = cm.format(); // "[1] Tasks.md (48 lines)\n[2] Search: roadmap (5 matches in 2 files)"

function createCitationManager() {
  const sources = [];

  return {
    /**
     * Add a citation source. Called from agent loop on tool_result events.
     */
    add(citation) {
      if (!citation) return;
      // Deduplicate by path for file citations
      if (citation.type === 'file') {
        const existing = sources.find(s => s.type === 'file' && s.path === citation.path);
        if (existing) return;
      }
      sources.push({ ...citation, index: sources.length + 1 });
    },

    /**
     * Get all collected sources.
     */
    getSources() {
      return sources;
    },

    /**
     * Format citations as footnote text for CLI display.
     */
    format() {
      if (sources.length === 0) return '';

      const lines = sources.map((s, i) => {
        const num = `[${i + 1}]`;
        switch (s.type) {
          case 'file':
            return `${num} ${s.filename} (${s.lines})`;
          case 'search':
            return `${num} Search: "${s.pattern}" (${s.matchCount} match${s.matchCount !== 1 ? 'es' : ''} in ${s.files.length} file${s.files.length !== 1 ? 's' : ''})`;
          case 'glob':
            return `${num} Found ${s.fileCount} file${s.fileCount !== 1 ? 's' : ''} matching ${s.pattern}`;
          default:
            return `${num} ${s.type}`;
        }
      });

      return lines.join('\n');
    },

    /**
     * Format citations as structured data for desktop rendering.
     */
    toJSON() {
      return sources.map((s, i) => ({
        ...s,
        index: i + 1,
        label: formatLabel(s, i + 1),
      }));
    },

    /**
     * Clear citations for next turn.
     */
    clear() {
      sources.length = 0;
    },

    /**
     * Whether any citations were collected.
     */
    hasAny() {
      return sources.length > 0;
    },
  };
}

function formatLabel(source, index) {
  switch (source.type) {
    case 'file':
      return `${source.filename} (${source.lines})`;
    case 'search':
      return `Search: "${source.pattern}" (${source.matchCount} matches)`;
    case 'glob':
      return `${source.fileCount} files matching ${source.pattern}`;
    default:
      return source.type;
  }
}

module.exports = {
  createCitationManager,
};
