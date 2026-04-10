'use strict';

// ── Slash Command Autocomplete ─────────────────────────────────────────────
// Shows a live-filtering dropdown when user types '/' in the input.
// Arrow keys to navigate, Tab/Enter to select, Esc to dismiss.
//
// Uses save/restore cursor to avoid shifting terminal content.

const { fg, style, PAD } = require('./render.js');

const MAX_VISIBLE = 8;

function createCompleter(rl, commands) {
  let menuVisible = false;
  let menuItems = [];
  let selectedIndex = 0;
  let scrollOffset = 0;
  let currentFilter = '';
  let menuHeight = 0;
  let roomReserved = false;

  const allCommands = commands.sort((a, b) => a.name.localeCompare(b.name));

  function filterCommands(partial) {
    const query = partial.toLowerCase().replace(/^\//, '');
    if (!query) return allCommands;
    return allCommands.filter(c =>
      c.name.toLowerCase().startsWith(query) ||
      (c.description || '').toLowerCase().includes(query)
    );
  }

  function reserveRoom(lines) {
    // Push terminal content up ONCE to make room below the prompt
    for (let i = 0; i < lines; i++) process.stdout.write('\n');
    process.stdout.write(`\x1b[${lines}A`);
    roomReserved = true;
  }

  function renderMenu() {
    if (!menuVisible || menuItems.length === 0) return;

    const visible = menuItems.slice(scrollOffset, scrollOffset + MAX_VISIBLE);
    const lines = [];

    for (let i = 0; i < visible.length; i++) {
      const item = visible[i];
      const globalIdx = scrollOffset + i;
      const isSelected = globalIdx === selectedIndex;

      const name = `/${item.name}`.padEnd(22);
      const desc = (item.description || '').slice(0, 50);

      if (isSelected) {
        lines.push(`${PAD}${fg.skyBlue}${style.bold} ▸ ${name}${style.reset}${fg.dimBlue}${desc}${style.reset}`);
      } else {
        lines.push(`${PAD}${fg.dimBlue}   ${name}${desc}${style.reset}`);
      }
    }

    // Scroll indicator on last item
    if (scrollOffset + MAX_VISIBLE < menuItems.length) {
      const lastIdx = lines.length - 1;
      lines[lastIdx] += `  ${fg.dimBlue}↓ ${menuItems.length - scrollOffset - MAX_VISIBLE} more${style.reset}`;
    }

    // Count hint
    lines.push(`${PAD}${fg.dimBlue}   ${menuItems.length} command${menuItems.length !== 1 ? 's' : ''}${currentFilter ? ` matching "${currentFilter}"` : ''}${style.reset}`);

    const totalLines = lines.length;

    // Reserve room on first show (or if menu grew)
    if (!roomReserved || totalLines > menuHeight) {
      const extra = totalLines - (roomReserved ? menuHeight : 0);
      if (extra > 0) {
        for (let i = 0; i < extra; i++) process.stdout.write('\n');
        process.stdout.write(`\x1b[${extra}A`);
      }
    }
    roomReserved = true;
    menuHeight = totalLines;

    // Save cursor, write menu below, restore cursor
    process.stdout.write('\x1b[s');
    // Move to line below prompt and clear + write each menu line
    for (let i = 0; i < totalLines; i++) {
      process.stdout.write(`\n\x1b[K${lines[i]}`);
    }
    // Clear any leftover lines from previous larger menu
    process.stdout.write('\n\x1b[K');
    process.stdout.write('\x1b[u'); // restore cursor to prompt
  }

  function clearMenu() {
    if (menuHeight === 0) return;
    process.stdout.write('\x1b[s');
    for (let i = 0; i <= menuHeight; i++) {
      process.stdout.write(`\n\x1b[K`);
    }
    process.stdout.write('\x1b[u');
    menuHeight = 0;
    roomReserved = false;
  }

  function showMenu(filter) {
    currentFilter = filter;
    menuItems = filterCommands(filter);
    selectedIndex = 0;
    scrollOffset = 0;
    menuVisible = true;
    renderMenu();
  }

  function hideMenu() {
    if (!menuVisible) return;
    menuVisible = false;
    clearMenu();
  }

  function moveSelection(delta) {
    if (!menuVisible || menuItems.length === 0) return;
    selectedIndex = Math.max(0, Math.min(menuItems.length - 1, selectedIndex + delta));
    if (selectedIndex < scrollOffset) scrollOffset = selectedIndex;
    else if (selectedIndex >= scrollOffset + MAX_VISIBLE) scrollOffset = selectedIndex - MAX_VISIBLE + 1;
    renderMenu();
  }

  function selectCurrent() {
    if (!menuVisible || menuItems.length === 0) return null;
    const item = menuItems[selectedIndex];
    hideMenu();
    return item;
  }

  function onKeypress(str, key) {
    if (!key) return;
    const line = rl.line || '';

    if (menuVisible) {
      if (key.name === 'up') { moveSelection(-1); return; }
      if (key.name === 'down') { moveSelection(1); return; }
      if (key.name === 'tab' || (key.name === 'return' && menuItems.length > 0 && line.startsWith('/') && !line.includes(' '))) {
        const item = selectCurrent();
        if (item) {
          rl.write(null, { ctrl: true, name: 'u' });
          rl.write(`/${item.name} `);
          return;
        }
      }
      if (key.name === 'escape') { hideMenu(); return; }
    }

    setImmediate(() => {
      const updatedLine = rl.line || '';
      if (updatedLine.startsWith('/') && !updatedLine.includes(' ')) {
        showMenu(updatedLine.slice(1));
      } else if (menuVisible) {
        hideMenu();
      }
    });
  }

  function attach() { process.stdin.on('keypress', onKeypress); }
  function detach() { process.stdin.removeListener('keypress', onKeypress); hideMenu(); }

  return { attach, detach, hideMenu };
}

module.exports = { createCompleter };
