'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { executeTool } = require('../../src/core/tools');

// ── Test vault setup ─────────────────────────────────────────────────────────

let VAULT;

beforeAll(() => {
  VAULT = fs.mkdtempSync(path.join(os.tmpdir(), 'vennie-test-vault-'));
  fs.writeFileSync(path.join(VAULT, 'note.md'), '# Hello\nThis is a test note.\n');
  fs.mkdirSync(path.join(VAULT, 'sub'));
  fs.writeFileSync(path.join(VAULT, 'sub', 'nested.md'), '# Nested\n');
});

afterAll(() => {
  fs.rmSync(VAULT, { recursive: true, force: true });
});

function ctx(overrides = {}) {
  return { vaultPath: VAULT, readline: null, mcpCallTool: null, ...overrides };
}

// ── Read — vault confinement ─────────────────────────────────────────────────

describe('Read — vault confinement', () => {
  test('reads a file inside the vault by relative path', async () => {
    const result = await executeTool('Read', { file_path: 'note.md' }, ctx());
    expect(result.error).toBeUndefined();
    expect(result.content).toContain('Hello');
  });

  test('reads a file inside the vault by absolute path', async () => {
    const result = await executeTool('Read', { file_path: path.join(VAULT, 'note.md') }, ctx());
    expect(result.error).toBeUndefined();
    expect(result.content).toContain('Hello');
  });

  test('reads a file in a subdirectory', async () => {
    const result = await executeTool('Read', { file_path: 'sub/nested.md' }, ctx());
    expect(result.error).toBeUndefined();
    expect(result.content).toContain('Nested');
  });

  test('blocks absolute path outside the vault', async () => {
    const result = await executeTool('Read', { file_path: '/etc/hosts' }, ctx());
    expect(result.error).toMatch(/outside the vault/);
  });

  test('blocks home directory path outside the vault', async () => {
    const result = await executeTool('Read', { file_path: path.join(os.homedir(), '.config', 'vennie', 'env') }, ctx());
    expect(result.error).toMatch(/outside the vault/);
  });

  test('blocks relative traversal escaping the vault', async () => {
    const result = await executeTool('Read', { file_path: '../../.ssh/id_rsa' }, ctx());
    expect(result.error).toMatch(/outside the vault/);
  });

  test('blocks single-step traversal escaping the vault', async () => {
    const result = await executeTool('Read', { file_path: '../escape.txt' }, ctx());
    expect(result.error).toMatch(/outside the vault/);
  });

  test('blocks traversal that normalises to a path outside the vault', async () => {
    // Looks like it stays inside but actually escapes after normalisation
    const result = await executeTool('Read', { file_path: 'sub/../../outside.txt' }, ctx());
    expect(result.error).toMatch(/outside the vault/);
  });

  test('does not confuse vault path as prefix of a sibling directory', async () => {
    // e.g. vault is /tmp/vennie-vault, sibling is /tmp/vennie-vault-other
    const siblingFile = VAULT + '-sibling-file.txt';
    fs.writeFileSync(siblingFile, 'sibling');
    try {
      const result = await executeTool('Read', { file_path: siblingFile }, ctx());
      expect(result.error).toMatch(/outside the vault/);
    } finally {
      fs.unlinkSync(siblingFile);
    }
  });
});

// ── Write — vault confinement ────────────────────────────────────────────────

describe('Write — vault confinement', () => {
  test('writes a file inside the vault', async () => {
    const result = await executeTool('Write', { file_path: 'created.md', content: '# Created\n' }, ctx());
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(VAULT, 'created.md'), 'utf8')).toBe('# Created\n');
  });

  test('blocks write to absolute path outside the vault', async () => {
    const target = path.join(os.tmpdir(), `vennie-escape-${Date.now()}.txt`);
    const result = await executeTool('Write', { file_path: target, content: 'escaped' }, ctx());
    expect(result.error).toMatch(/outside the vault/);
    expect(fs.existsSync(target)).toBe(false);
  });

  test('blocks write via relative traversal', async () => {
    const result = await executeTool('Write', { file_path: '../escape.txt', content: 'escaped' }, ctx());
    expect(result.error).toMatch(/outside the vault/);
  });
});

// ── Edit — vault confinement ─────────────────────────────────────────────────

describe('Edit — vault confinement', () => {
  test('edits a file inside the vault', async () => {
    const result = await executeTool('Edit', {
      file_path: 'note.md',
      old_string: '# Hello',
      new_string: '# Hello World',
    }, ctx());
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
  });

  test('blocks edit of file outside the vault', async () => {
    const result = await executeTool('Edit', {
      file_path: '/etc/hosts',
      old_string: 'localhost',
      new_string: 'hacked',
    }, ctx());
    expect(result.error).toMatch(/outside the vault/);
  });

  test('blocks edit via relative traversal', async () => {
    const result = await executeTool('Edit', {
      file_path: '../../.zshrc',
      old_string: 'something',
      new_string: 'malicious',
    }, ctx());
    expect(result.error).toMatch(/outside the vault/);
  });
});

// ── executeTool error handling ───────────────────────────────────────────────

describe('executeTool — error surface', () => {
  test('returns { error } instead of throwing on confinement violation', async () => {
    // Should not throw — must return a plain object
    await expect(
      executeTool('Read', { file_path: '/etc/hosts' }, ctx())
    ).resolves.toMatchObject({ error: expect.stringContaining('outside the vault') });
  });

  test('returns { error } for unknown tool', async () => {
    const result = await executeTool('NonExistentTool', {}, ctx());
    expect(result.error).toMatch(/Unknown tool/);
  });
});
