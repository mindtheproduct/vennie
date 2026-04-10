'use strict';

const fs = require('fs');
const path = require('path');

// --- Paths ---

function radarConfigPath(vaultPath) {
  return path.join(vaultPath, '.vennie', 'radar.json');
}

function snapshotsDir(vaultPath) {
  return path.join(vaultPath, '.vennie', 'radar', 'snapshots');
}

function snapshotPath(vaultPath, competitorName, date) {
  const safeName = competitorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return path.join(snapshotsDir(vaultPath), `${safeName}-${date}.json`);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// --- Config ---

function getRadarConfig(vaultPath) {
  const configFile = radarConfigPath(vaultPath);
  if (!fs.existsSync(configFile)) {
    return { competitors: [], checkInterval: 86400000 };
  }
  try {
    const raw = fs.readFileSync(configFile, 'utf8');
    const config = JSON.parse(raw);
    return {
      competitors: Array.isArray(config.competitors) ? config.competitors : [],
      checkInterval: typeof config.checkInterval === 'number' ? config.checkInterval : 86400000,
    };
  } catch {
    return { competitors: [], checkInterval: 86400000 };
  }
}

function writeRadarConfig(vaultPath, config) {
  const configFile = radarConfigPath(vaultPath);
  ensureDir(path.dirname(configFile));
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
}

function addCompetitor(vaultPath, name, urls, tags) {
  if (!name || typeof name !== 'string') {
    throw new Error('Competitor name is required');
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('At least one URL is required');
  }

  const config = getRadarConfig(vaultPath);
  const existing = config.competitors.find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );

  if (existing) {
    // Merge urls and tags instead of duplicating
    const urlSet = new Set([...existing.urls, ...urls]);
    existing.urls = Array.from(urlSet);
    if (Array.isArray(tags) && tags.length > 0) {
      const tagSet = new Set([...(existing.tags || []), ...tags]);
      existing.tags = Array.from(tagSet);
    }
  } else {
    config.competitors.push({
      name,
      urls,
      lastChecked: null,
      tags: Array.isArray(tags) ? tags : [],
    });
  }

  writeRadarConfig(vaultPath, config);
  return config;
}

function removeCompetitor(vaultPath, name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Competitor name is required');
  }

  const config = getRadarConfig(vaultPath);
  const before = config.competitors.length;
  config.competitors = config.competitors.filter(
    (c) => c.name.toLowerCase() !== name.toLowerCase()
  );

  if (config.competitors.length === before) {
    return { removed: false, message: `No competitor named "${name}" found` };
  }

  writeRadarConfig(vaultPath, config);
  return { removed: true, message: `Removed "${name}" from radar` };
}

// --- Checking ---

function daysBetween(dateStr, now) {
  if (!dateStr) return Infinity;
  const then = new Date(dateStr);
  const diff = now.getTime() - then.getTime();
  return Math.floor(diff / 86400000);
}

function getSnapshotsForCompetitor(vaultPath, competitorName, maxDays) {
  const dir = snapshotsDir(vaultPath);
  if (!fs.existsSync(dir)) return [];

  const safeName = competitorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const prefix = safeName + '-';
  const now = new Date();
  const snapshots = [];

  try {
    const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
    for (const file of files) {
      const dateStr = file.slice(prefix.length, -5); // strip prefix and .json
      if (maxDays !== undefined) {
        const age = daysBetween(dateStr, now);
        if (age > maxDays) continue;
      }
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf8');
        snapshots.push(JSON.parse(raw));
      } catch {
        // skip corrupt snapshots
      }
    }
  } catch {
    // dir read failed
  }

  // Sort newest first
  snapshots.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return snapshots;
}

function checkCompetitors(vaultPath) {
  const config = getRadarConfig(vaultPath);
  const now = new Date();
  const intervalDays = Math.ceil(config.checkInterval / 86400000);

  return config.competitors.map((comp) => {
    const daysSince = daysBetween(comp.lastChecked, now);
    const isStale = daysSince >= intervalDays;
    const recentSnapshots = getSnapshotsForCompetitor(vaultPath, comp.name, 30);
    const recentChanges = [];
    for (const snap of recentSnapshots) {
      if (Array.isArray(snap.findings)) {
        for (const finding of snap.findings) {
          recentChanges.push({
            date: snap.date,
            ...finding,
          });
        }
      }
    }

    return {
      name: comp.name,
      status: isStale ? 'stale' : 'fresh',
      lastChecked: comp.lastChecked,
      daysSinceCheck: daysSince === Infinity ? null : daysSince,
      urls: comp.urls,
      recentChanges,
    };
  });
}

// --- Snapshots ---

function saveSnapshot(vaultPath, competitorName, data) {
  if (!competitorName || typeof competitorName !== 'string') {
    throw new Error('Competitor name is required');
  }
  if (!data || !Array.isArray(data.findings)) {
    throw new Error('Snapshot data must include a findings array');
  }

  const today = new Date().toISOString().slice(0, 10);
  const snapshot = {
    date: data.date || today,
    competitor: competitorName,
    findings: data.findings,
  };

  const filePath = snapshotPath(vaultPath, competitorName, snapshot.date);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');

  // Update lastChecked in config
  const config = getRadarConfig(vaultPath);
  const comp = config.competitors.find(
    (c) => c.name.toLowerCase() === competitorName.toLowerCase()
  );
  if (comp) {
    comp.lastChecked = snapshot.date;
    writeRadarConfig(vaultPath, config);
  }

  return { saved: true, path: filePath, snapshot };
}

// --- Reporting ---

function getRecentChanges(vaultPath, days) {
  if (typeof days !== 'number' || days <= 0) {
    days = 7;
  }

  const config = getRadarConfig(vaultPath);
  const allChanges = [];

  for (const comp of config.competitors) {
    const snapshots = getSnapshotsForCompetitor(vaultPath, comp.name, days);
    for (const snap of snapshots) {
      if (Array.isArray(snap.findings)) {
        for (const finding of snap.findings) {
          allChanges.push({
            competitor: comp.name,
            date: snap.date,
            type: finding.type,
            summary: finding.summary,
          });
        }
      }
    }
  }

  // Sort newest first
  allChanges.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return allChanges;
}

function formatRadarReport(competitors, changes) {
  const lines = [];

  lines.push('# Competitive Radar Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');

  // Competitor status table
  lines.push('## Tracked Competitors');
  lines.push('');
  if (!competitors || competitors.length === 0) {
    lines.push('No competitors tracked. Use `addCompetitor()` to start tracking.');
  } else {
    for (const comp of competitors) {
      const statusIcon = comp.status === 'stale' ? '[STALE]' : '[FRESH]';
      const lastCheck = comp.lastChecked || 'never';
      const daysSince = comp.daysSinceCheck != null ? ` (${comp.daysSinceCheck}d ago)` : '';
      lines.push(`- **${comp.name}** ${statusIcon} Last checked: ${lastCheck}${daysSince}`);
      if (comp.urls && comp.urls.length > 0) {
        for (const url of comp.urls) {
          lines.push(`  - ${url}`);
        }
      }
    }
  }

  lines.push('');
  lines.push('## Recent Changes');
  lines.push('');

  if (!changes || changes.length === 0) {
    lines.push('No recent changes detected.');
  } else {
    let currentDate = null;
    for (const change of changes) {
      if (change.date !== currentDate) {
        currentDate = change.date;
        lines.push(`### ${currentDate}`);
        lines.push('');
      }
      const typeLabel = (change.type || 'unknown').replace(/_/g, ' ');
      lines.push(`- **${change.competitor}** [${typeLabel}]: ${change.summary}`);
    }
  }

  lines.push('');

  // Action items
  const stale = (competitors || []).filter((c) => c.status === 'stale');
  if (stale.length > 0) {
    lines.push('## Action Required');
    lines.push('');
    for (const comp of stale) {
      lines.push(`- Check **${comp.name}** (last checked: ${comp.lastChecked || 'never'})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function listCompetitors(vaultPath) {
  const config = getRadarConfig(vaultPath);
  const now = new Date();
  const intervalDays = Math.ceil(config.checkInterval / 86400000);

  return config.competitors.map((comp) => {
    const daysSince = daysBetween(comp.lastChecked, now);
    return {
      name: comp.name,
      tags: comp.tags || [],
      urls: comp.urls,
      lastChecked: comp.lastChecked,
      status: daysSince >= intervalDays ? 'stale' : 'fresh',
    };
  });
}

module.exports = {
  getRadarConfig,
  addCompetitor,
  removeCompetitor,
  checkCompetitors,
  saveSnapshot,
  getRecentChanges,
  formatRadarReport,
  listCompetitors,
};
