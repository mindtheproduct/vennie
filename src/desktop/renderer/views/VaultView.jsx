import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Settings, Hash, Calendar, List } from 'lucide-react';
import { cn } from '../lib/utils.js';
import MarkdownRenderer from '../components/MarkdownRenderer.jsx';

// ── File icon by extension ──────────────────────────────────────────────
function getFileIcon(name) {
  if (name.endsWith('.md')) return FileText;
  if (name.endsWith('.yaml') || name.endsWith('.yml')) return Settings;
  if (name.endsWith('.json')) return Hash;
  return FileText;
}

// ── Collapse state stored outside renders ───────────────────────────────
const collapsedDirs = new Set();

export default function VaultView({ appData }) {
  const [tree, setTree] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const treeRef = useRef(null);

  useEffect(() => {
    window.vennie.getTree().then(data => {
      if (Array.isArray(data)) setTree(data);
    });
  }, []);

  const openFile = useCallback(async (filePath) => {
    setSelectedFile(filePath);
    const result = await window.vennie.readFile(filePath);
    setFileContent(result?.content || `Error: ${result?.error || 'Could not read file'}`);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setIsSearching(true);
    const results = await window.vennie.search(searchQuery, 10);
    setSearchResults(results || []);
    setIsSearching(false);
  }, [searchQuery]);

  const fileName = selectedFile?.split('/').pop() || '';
  const relPath = selectedFile?.replace(appData?.vaultPath + '/', '') || '';

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-[var(--surface-primary)]">
      {/* Left — Tree */}
      <div className="w-[250px] shrink-0 flex flex-col bg-[var(--surface-secondary)] border-r border-[var(--border)]">
        {/* Search */}
        <div className="p-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-tertiary)] focus-within:ring-1 focus-within:ring-[var(--accent)]/30 transition-all">
            <Search size={12} className="text-[var(--text-tertiary)] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search vault..."
              className="flex-1 bg-transparent border-none outline-none text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            />
          </div>
        </div>

        {/* Tree / Results */}
        <div ref={treeRef} className="flex-1 overflow-auto py-1">
          {searchResults.length > 0 ? (
            searchResults.map((r, i) => (
              <button
                key={i}
                onClick={() => { openFile(r.file); setSearchResults([]); setSearchQuery(''); }}
                className={cn(
                  'w-full text-left px-4 py-2.5 transition-colors border-b border-[var(--border)]/50',
                  selectedFile === r.file
                    ? 'bg-[var(--surface-tertiary)]'
                    : 'hover:bg-[var(--surface-tertiary)]'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <FileText size={11} className="text-[var(--text-tertiary)] shrink-0" />
                  <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">{r.file.split('/').pop()}</span>
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] mt-1 line-clamp-2 pl-[18px]">{(r.snippet || '').slice(0, 100)}</div>
              </button>
            ))
          ) : (
            tree.map(node => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                selectedFile={selectedFile}
                openFile={openFile}
              />
            ))
          )}
        </div>
      </div>

      {/* Right — Preview */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedFile ? (
          <>
            {/* Document header */}
            <div className="px-8 pt-6 pb-4 border-b border-[var(--border)] bg-[var(--surface-secondary)]/50 shrink-0">
              <div className="flex items-center gap-2 mb-1">
                <FileText size={14} className="text-[var(--text-tertiary)]" />
                <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">{fileName}</h2>
              </div>
              <span className="text-[11px] text-[var(--text-tertiary)] font-mono">{relPath}</span>
            </div>

            {/* Document body */}
            <div className="flex-1 overflow-auto px-8 py-6">
              <div className="max-w-[720px]">
                {selectedFile.endsWith('.md') ? (
                  <div className="text-[14px] leading-[1.7] text-[var(--text-secondary)]">
                    <MarkdownRenderer text={fileContent} />
                  </div>
                ) : (
                  <pre className="bg-[var(--surface-tertiary)] p-4 rounded-lg text-[13px] font-mono text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
                    {fileContent}
                  </pre>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Folder size={32} className="text-[var(--text-tertiary)]/30 mx-auto mb-3" />
              <p className="text-[var(--text-tertiary)] text-sm">Select a file to preview</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tree node ───────────────────────────────────────────────────────────

function TreeNode({ node, depth, selectedFile, openFile }) {
  const [open, setOpen] = useState(() => {
    if (collapsedDirs.has(node.path)) return false;
    return depth < 1;
  });

  function toggleDir() {
    const next = !open;
    setOpen(next);
    if (next) collapsedDirs.delete(node.path);
    else collapsedDirs.add(node.path);
  }

  if (node.isDir) {
    const DirIcon = open ? FolderOpen : Folder;
    return (
      <div>
        <button
          onClick={toggleDir}
          className="w-full flex items-center gap-1.5 py-[5px] hover:bg-[var(--surface-tertiary)] transition-colors text-[var(--text-secondary)] text-[13px] select-none group/dir"
          style={{ paddingLeft: 12 + depth * 14 }}
          title={node.name}
        >
          {/* Indent guide */}
          {depth > 0 && (
            <div
              className="absolute left-0 top-0 bottom-0 w-px bg-[var(--border)]"
              style={{ left: 18 + (depth - 1) * 14 }}
            />
          )}
          <span className="w-3 flex items-center justify-center shrink-0">
            {open
              ? <ChevronDown size={10} className="text-[var(--text-tertiary)]" />
              : <ChevronRight size={10} className="text-[var(--text-tertiary)]" />
            }
          </span>
          <DirIcon size={13} className="text-[var(--text-tertiary)] shrink-0" />
          <span className="font-medium truncate">{node.name}</span>
        </button>
        {open && (
          <div className="relative">
            {/* Indent guide line */}
            <div
              className="absolute top-0 bottom-0 w-px bg-[var(--border)]/60"
              style={{ left: 19 + depth * 14 }}
            />
            {node.children?.map(child => (
              <TreeNode key={child.path} node={child} depth={depth + 1} selectedFile={selectedFile} openFile={openFile} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const FileIcon = getFileIcon(node.name);
  const isSelected = selectedFile === node.path;

  return (
    <button
      onClick={() => openFile(node.path)}
      title={node.name}
      className={cn(
        'w-full flex items-center gap-1.5 py-[5px] text-[13px] transition-colors truncate',
        isSelected
          ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)]'
          : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]'
      )}
      style={{ paddingLeft: 28 + depth * 14 }}
    >
      <FileIcon size={12} className={cn('shrink-0', isSelected ? 'text-[var(--accent)]' : 'opacity-40')} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}
