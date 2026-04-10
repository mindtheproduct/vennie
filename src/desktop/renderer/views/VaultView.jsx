import React, { useState, useEffect, useCallback } from 'react';
import MarkdownRenderer from '../components/MarkdownRenderer.jsx';

export default function VaultView({ appData }) {
  const [tree, setTree] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const e = React.createElement;

  useEffect(() => {
    window.vennie.getTree().then(data => {
      if (Array.isArray(data)) setTree(data);
    });
  }, []);

  const openFile = useCallback(async (filePath) => {
    setSelectedFile(filePath);
    const result = await window.vennie.readFile(filePath);
    if (result?.content) {
      setFileContent(result.content);
    } else {
      setFileContent(`Error: ${result?.error || 'Could not read file'}`);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    const results = await window.vennie.search(searchQuery, 10);
    setSearchResults(results || []);
    setIsSearching(false);
  }, [searchQuery]);

  return e('div', {
    style: {
      flex: 1,
      display: 'flex',
      height: '100%',
      overflow: 'hidden',
    }
  },
    // Left panel — tree + search
    e('div', {
      style: {
        width: 280,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary)',
      }
    },
      // Search bar
      e('div', {
        style: { padding: '12px', borderBottom: '1px solid var(--border)' }
      },
        e('input', {
          type: 'text',
          value: searchQuery,
          onChange: (ev) => setSearchQuery(ev.target.value),
          onKeyDown: (ev) => ev.key === 'Enter' && handleSearch(),
          placeholder: 'Search vault...',
          style: {
            width: '100%',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
            color: 'var(--text-primary)',
            fontSize: 13,
            outline: 'none',
            fontFamily: 'var(--font-sans)',
          }
        }),
      ),

      // Search results or file tree
      e('div', {
        style: { flex: 1, overflow: 'auto', padding: '8px 0' }
      },
        searchResults.length > 0
          ? searchResults.map((r, i) => {
              const name = r.file.split('/').pop();
              return e('div', {
                key: i,
                onClick: () => openFile(r.file),
                style: {
                  padding: '8px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-subtle)',
                }
              },
                e('div', {
                  style: { fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }
                }, name),
                e('div', {
                  style: { fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }
                }, `Score: ${r.score.toFixed(1)}`),
                e('div', {
                  style: { fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }
                }, (r.snippet || '').slice(0, 100)),
              );
            })
          : tree.map(node => renderTreeNode(e, node, 0, selectedFile, openFile)),
      ),
    ),

    // Right panel — file preview
    e('div', {
      style: {
        flex: 1,
        overflow: 'auto',
        padding: '24px 32px',
      }
    },
      selectedFile
        ? e('div', null,
            e('div', {
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 20,
                paddingBottom: 12,
                borderBottom: '1px solid var(--border)',
              }
            },
              e('h2', {
                style: { fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }
              }, selectedFile.split('/').pop()),
              e('span', {
                style: { fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }
              }, selectedFile.replace(appData?.vaultPath + '/', '')),
            ),
            selectedFile.endsWith('.md')
              ? e(MarkdownRenderer, { text: fileContent })
              : e('pre', {
                  style: {
                    background: 'var(--bg-tertiary)',
                    padding: 16,
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                  }
                }, fileContent),
          )
        : e('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-dim)',
            }
          }, 'Select a file to preview'),
    ),
  );
}

function renderTreeNode(e, node, depth, selectedFile, openFile) {
  const [open, setOpen] = React.useState(depth < 1);

  if (node.isDir) {
    return e('div', { key: node.path },
      e('div', {
        onClick: () => setOpen(o => !o),
        style: {
          padding: '4px 12px 4px ' + (12 + depth * 16) + 'px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          color: 'var(--text-secondary)',
          userSelect: 'none',
        }
      },
        e('span', {
          style: { fontSize: 10, color: 'var(--text-dim)', width: 12 }
        }, open ? '\u25BC' : '\u25B6'),
        e('span', { style: { fontWeight: 500 } }, node.name),
      ),
      open && node.children?.map(child => renderTreeNode(e, child, depth + 1, selectedFile, openFile)),
    );
  }

  return e('div', {
    key: node.path,
    onClick: () => openFile(node.path),
    style: {
      padding: '4px 12px 4px ' + (28 + depth * 16) + 'px',
      cursor: 'pointer',
      fontSize: 13,
      color: selectedFile === node.path ? 'var(--cyan)' : 'var(--text-dim)',
      background: selectedFile === node.path ? 'var(--bg-hover)' : 'transparent',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }
  }, node.name);
}
