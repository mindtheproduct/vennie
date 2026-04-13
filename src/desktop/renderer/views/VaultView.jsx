import React, { useState, useEffect, useCallback } from 'react';
import { Search, ChevronDown, ChevronRight, File, Folder, FolderOpen } from 'lucide-react';
import { cn } from '../lib/utils.js';
import MarkdownRenderer from '../components/MarkdownRenderer.jsx';

export default function VaultView({ appData }) {
  const [tree, setTree] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

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

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-[var(--surface-primary)]">
      {/* Left — Tree */}
      <div className="w-[240px] shrink-0 flex flex-col bg-[var(--surface-secondary)]">
        {/* Search */}
        <div className="p-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-tertiary)] focus-within:bg-[var(--surface-elevated)] transition-colors">
            <Search size={12} className="text-[var(--text-tertiary)] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search vault..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            />
          </div>
        </div>

        {/* Tree / Results */}
        <div className="flex-1 overflow-auto py-1">
          {searchResults.length > 0 ? (
            searchResults.map((r, i) => (
              <button
                key={i}
                onClick={() => openFile(r.file)}
                className="w-full text-left px-4 py-2 hover:bg-[var(--surface-tertiary)] transition-colors"
              >
                <div className="text-sm font-medium text-[var(--text-primary)] truncate">{r.file.split('/').pop()}</div>
                <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5 line-clamp-2">{(r.snippet || '').slice(0, 100)}</div>
              </button>
            ))
          ) : (
            tree.map(node => <TreeNode key={node.path} node={node} depth={0} selectedFile={selectedFile} openFile={openFile} />)
          )}
        </div>
      </div>

      {/* Right — Preview */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {selectedFile ? (
          <div>
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">{selectedFile.split('/').pop()}</h2>
              <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                {selectedFile.replace(appData?.vaultPath + '/', '')}
              </span>
            </div>
            {selectedFile.endsWith('.md') ? (
              <div className="text-sm"><MarkdownRenderer text={fileContent} /></div>
            ) : (
              <pre className="bg-[var(--surface-tertiary)] p-4 rounded-lg text-sm font-mono text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
                {fileContent}
              </pre>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--text-tertiary)] text-sm">
            Select a file to preview
          </div>
        )}
      </div>
    </div>
  );
}

function TreeNode({ node, depth, selectedFile, openFile }) {
  const [open, setOpen] = useState(depth < 1);

  if (node.isDir) {
    const DirIcon = open ? FolderOpen : Folder;
    return (
      <div>
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-1.5 py-1 hover:bg-[var(--surface-tertiary)] transition-colors text-[var(--text-secondary)] text-sm select-none"
          style={{ paddingLeft: 12 + depth * 16 }}
        >
          {open ? <ChevronDown size={11} className="text-[var(--text-tertiary)] shrink-0" /> : <ChevronRight size={11} className="text-[var(--text-tertiary)] shrink-0" />}
          <DirIcon size={13} className="text-[var(--text-tertiary)] shrink-0" />
          <span className="font-medium truncate">{node.name}</span>
        </button>
        {open && node.children?.map(child => (
          <TreeNode key={child.path} node={child} depth={depth + 1} selectedFile={selectedFile} openFile={openFile} />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => openFile(node.path)}
      className={cn(
        'w-full flex items-center gap-1.5 py-1 text-sm transition-colors truncate',
        selectedFile === node.path
          ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
          : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]'
      )}
      style={{ paddingLeft: 28 + depth * 16 }}
    >
      <File size={12} className="shrink-0 opacity-40" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}
