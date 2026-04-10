'use strict';

const fs = require('fs');
const path = require('path');

// ── Vault Search ───────────────────────────────────────────────────────────
// BM25 keyword search over markdown files with file-mtime caching.
// No external dependencies, no embeddings — fast local search.

// ── Constants ──────────────────────────────────────────────────────────────

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;
const DEFAULT_TOP_N = 10;
const INDEX_FILENAME = '.vennie/search-index.json';

// Folders to always skip
const SKIP_FOLDERS = new Set(['System', '.vennie', 'node_modules', '.git', '.obsidian', '.trash']);

// ── Text Utilities ─────────────────────────────────────────────────────────

/**
 * Tokenise text into lowercase terms, stripping markdown and punctuation.
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[#*_`~\[\](){}|>!\\]/g, ' ')   // strip markdown syntax
    .replace(/[^\w\s'-]/g, ' ')                // strip remaining punctuation
    .split(/\s+/)
    .filter(t => t.length > 1);
}

/**
 * Split text into overlapping chunks of roughly `size` characters,
 * breaking at newlines or sentence boundaries when possible.
 */
function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  if (text.length <= size) return [text];

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);

    // Try to break at a newline or period near the boundary
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastNewline = slice.lastIndexOf('\n');
      const lastPeriod = slice.lastIndexOf('. ');
      const breakPoint = Math.max(lastNewline, lastPeriod);
      if (breakPoint > size * 0.3) {
        end = start + breakPoint + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks.filter(c => c.length > 0);
}

// ── File Walking ───────────────────────────────────────────────────────────

/**
 * Recursively collect all .md files under `dir`, skipping excluded folders.
 * Returns array of absolute paths.
 */
function walkMarkdown(dir, filterFolder) {
  const results = [];

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return; // permission denied or missing — skip
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Check skip list against the folder name relative to vault root
        if (SKIP_FOLDERS.has(entry.name)) continue;

        // If filtering by folder, only descend into matching top-level folder
        if (filterFolder) {
          const rel = path.relative(dir, fullPath);
          const topLevel = rel.split(path.sep)[0];
          // Allow descent if we're already inside the target folder or this IS it
          if (topLevel !== filterFolder && !rel.startsWith(filterFolder + path.sep)) {
            // We're at the top level and this isn't our folder — skip
            if (currentDir === dir) continue;
          }
        }

        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

// ── Index Management ───────────────────────────────────────────────────────

/**
 * Load the cached search index, or return null if it doesn't exist.
 */
function loadIndex(vaultPath) {
  const indexPath = path.join(vaultPath, INDEX_FILENAME);
  try {
    const raw = fs.readFileSync(indexPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save the search index to disk.
 */
function saveIndex(vaultPath, index) {
  const indexDir = path.join(vaultPath, '.vennie');
  if (!fs.existsSync(indexDir)) {
    fs.mkdirSync(indexDir, { recursive: true });
  }
  const indexPath = path.join(vaultPath, INDEX_FILENAME);
  fs.writeFileSync(indexPath, JSON.stringify(index), 'utf8');
}

/**
 * Build or incrementally update the search index.
 * Each entry: { file (relative), chunks: [{ text, tokens }], mtime }
 */
function buildIndex(vaultPath, { force = false, folder = null } = {}) {
  const existing = force ? null : loadIndex(vaultPath);
  const existingByFile = {};
  if (existing && existing.files) {
    for (const entry of existing.files) {
      existingByFile[entry.file] = entry;
    }
  }

  const mdFiles = walkMarkdown(vaultPath, folder);
  const files = [];

  for (const absPath of mdFiles) {
    const relPath = path.relative(vaultPath, absPath);
    let stat;
    try {
      stat = fs.statSync(absPath);
    } catch {
      continue;
    }

    const mtimeMs = stat.mtimeMs;

    // Reuse cached entry if file hasn't changed
    if (!force && existingByFile[relPath] && existingByFile[relPath].mtime === mtimeMs) {
      files.push(existingByFile[relPath]);
      continue;
    }

    // Read and index the file
    let content;
    try {
      content = fs.readFileSync(absPath, 'utf8');
    } catch {
      continue;
    }

    // Skip empty files
    if (content.trim().length === 0) continue;

    const chunks = chunkText(content).map(text => ({
      text,
      tokens: tokenize(text),
    }));

    files.push({ file: relPath, chunks, mtime: mtimeMs });
  }

  const index = { version: 1, built: Date.now(), files };
  saveIndex(vaultPath, index);
  return index;
}

// ── BM25 Scoring ───────────────────────────────────────────────────────────

/**
 * BM25 parameters.
 */
const BM25_K1 = 1.5;
const BM25_B = 0.75;

/**
 * Score all chunks against a query using BM25.
 * Returns sorted array of { file, text, score }.
 */
function bm25Search(index, query) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // Gather all chunks with their file context
  const allChunks = [];
  for (const fileEntry of index.files) {
    for (const chunk of fileEntry.chunks) {
      allChunks.push({
        file: fileEntry.file,
        text: chunk.text,
        tokens: chunk.tokens,
      });
    }
  }

  if (allChunks.length === 0) return [];

  // Compute average document (chunk) length
  const avgDl = allChunks.reduce((sum, c) => sum + c.tokens.length, 0) / allChunks.length;

  // Compute document frequency for each query term
  const df = {};
  for (const qt of queryTokens) {
    df[qt] = 0;
    for (const chunk of allChunks) {
      if (chunk.tokens.includes(qt)) {
        df[qt]++;
      }
    }
  }

  const N = allChunks.length;

  // Score each chunk
  const scored = [];
  for (const chunk of allChunks) {
    let score = 0;
    const dl = chunk.tokens.length;

    for (const qt of queryTokens) {
      // Term frequency in this chunk
      const tf = chunk.tokens.filter(t => t === qt).length;
      if (tf === 0) continue;

      // IDF component (with smoothing)
      const idf = Math.log(1 + (N - df[qt] + 0.5) / (df[qt] + 0.5));

      // BM25 TF component
      const tfNorm = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgDl)));

      score += idf * tfNorm;
    }

    if (score > 0) {
      scored.push({ file: chunk.file, text: chunk.text, score });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ── Snippet Highlighting ───────────────────────────────────────────────────

/**
 * Highlight query terms in a snippet by wrapping them in **bold**.
 * Case-insensitive, preserves original casing.
 */
function highlightSnippet(text, query) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return text;

  // Build a regex that matches any query term as a whole word
  const escaped = queryTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

  return text.replace(pattern, '**$1**');
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Search the vault for a query string.
 *
 * @param {string} vaultPath - Absolute path to the vault root
 * @param {string} query - Search query
 * @param {object} [options]
 * @param {number} [options.topN=10] - Number of results to return
 * @param {string} [options.folder] - Filter to a specific top-level folder (e.g. '04-Projects')
 * @returns {{ file: string, snippet: string, score: number }[]}
 */
function searchVault(vaultPath, query, options = {}) {
  const { topN = DEFAULT_TOP_N, folder = null } = options;

  // Build or update the index (incremental)
  const index = buildIndex(vaultPath, { folder });

  // Run BM25 search
  const results = bm25Search(index, query);

  // Take top N and format
  return results.slice(0, topN).map(r => ({
    file: r.file,
    snippet: highlightSnippet(r.text, query),
    score: Math.round(r.score * 1000) / 1000,
  }));
}

/**
 * Force a full re-index of the vault, ignoring cached mtimes.
 *
 * @param {string} vaultPath - Absolute path to the vault root
 * @returns {{ fileCount: number, chunkCount: number }}
 */
function rebuildIndex(vaultPath) {
  const index = buildIndex(vaultPath, { force: true });
  const chunkCount = index.files.reduce((sum, f) => sum + f.chunks.length, 0);
  return { fileCount: index.files.length, chunkCount };
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = { searchVault, rebuildIndex };
