'use strict';

const fs = require('fs');
const path = require('path');

// ── Skill Loader ────────────────────────────────────────────────────────────
// Skills are markdown files with optional YAML frontmatter that get injected
// into the conversation as additional context. They live in tiers:
//   core/      — ships with Vennie (career-coach, meeting-prep, etc.)
//   community/ — shared skills from the Vennie community
//   personal/  — user-created skills

// Search order: core → community → personal (first match wins)
const SKILL_TIERS = ['core', 'community', 'personal'];

/**
 * Load a skill by name. Searches all tiers in order.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {string} skillName - Name of the skill (without .md extension)
 * @returns {{ name: string, description: string, body: string, tier: string, integrations: string[] } | null}
 */
function loadSkill(vaultPath, skillName) {
  // Normalize: strip leading slash, lowercase
  const normalized = skillName.replace(/^\//, '').toLowerCase().trim();

  for (const tier of SKILL_TIERS) {
    const skillPath = path.join(vaultPath, '.vennie', 'skills', tier, `${normalized}.md`);
    if (fs.existsSync(skillPath)) {
      return parseSkillFile(skillPath, tier);
    }
  }

  return null;
}

/**
 * List all available skills across all tiers.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @returns {{ name: string, description: string, tier: string }[]}
 */
function listSkills(vaultPath) {
  const skills = [];
  const seen = new Set();

  for (const tier of SKILL_TIERS) {
    const dir = path.join(vaultPath, '.vennie', 'skills', tier);
    if (!fs.existsSync(dir)) continue;

    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const name = file.replace(/\.md$/, '');
        if (seen.has(name)) continue; // first tier wins
        seen.add(name);

        const parsed = parseSkillFile(path.join(dir, file), tier);
        if (parsed) {
          skills.push({
            name: parsed.name || name,
            description: parsed.description || '(no description)',
            tier,
          });
        }
      }
    } catch {
      // Directory read failed — skip
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Parse a skill file: extract YAML frontmatter and markdown body.
 */
function parseSkillFile(filePath, tier) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const { frontmatter, body } = extractFrontmatter(raw);

    return {
      name: frontmatter.name || path.basename(filePath, '.md'),
      description: frontmatter.description || '',
      body: body.trim(),
      tier,
      integrations: frontmatter.integrations || [],
      tags: frontmatter.tags || [],
    };
  } catch {
    return null;
  }
}

/**
 * Extract YAML frontmatter from a markdown file.
 * Expects --- delimiters. Returns { frontmatter: {}, body: string }.
 */
function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  // Simple YAML parsing — handles key: value pairs and arrays
  // No need for a full YAML parser for frontmatter
  const frontmatter = {};
  const yamlLines = match[1].split('\n');

  let currentKey = null;
  for (const line of yamlLines) {
    const kvMatch = line.match(/^(\w[\w_-]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      let value = kvMatch[2].trim();

      // Handle inline arrays: [a, b, c]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      }
      // Handle quoted strings
      else if ((value.startsWith('"') && value.endsWith('"')) ||
               (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      frontmatter[key] = value;
      currentKey = key;
    }
    // Handle multi-line array items: - value
    else if (line.match(/^\s+-\s+(.+)/) && currentKey) {
      const item = line.match(/^\s+-\s+(.+)/)[1].trim();
      if (!Array.isArray(frontmatter[currentKey])) {
        frontmatter[currentKey] = frontmatter[currentKey] ? [frontmatter[currentKey]] : [];
      }
      frontmatter[currentKey].push(item);
    }
  }

  return { frontmatter, body: match[2] };
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  loadSkill,
  listSkills,
};
