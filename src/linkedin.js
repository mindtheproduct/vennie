'use strict';

const http = require('http');
const { execSync } = require('child_process');
const crypto = require('crypto');

// ── LinkedIn OAuth ──────────────────────────────────────────────────────────
// Full OAuth 2.0 + OpenID Connect flow for CLI:
//   1. Start a local callback server
//   2. Open browser to LinkedIn auth URL
//   3. Wait for the callback with auth code
//   4. Exchange code for tokens
//   5. Decode the id_token JWT to extract profile
//
// Requires VENNIE_LINKEDIN_CLIENT_ID and VENNIE_LINKEDIN_CLIENT_SECRET env vars.
// When not configured, falls back to conversational profile entry.

const CALLBACK_PORT = 3847;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;
const AUTH_TIMEOUT_MS = 120000; // 2 minutes

/**
 * Check if LinkedIn OAuth credentials are configured.
 */
function isLinkedInConfigured() {
  return !!(process.env.VENNIE_LINKEDIN_CLIENT_ID && process.env.VENNIE_LINKEDIN_CLIENT_SECRET);
}

/**
 * Run the full LinkedIn OAuth flow.
 * Opens the user's browser, waits for callback, returns profile data.
 *
 * @returns {{ name: string, email: string, picture: string, givenName: string, familyName: string }}
 */
async function linkedInAuth() {
  const clientId = process.env.VENNIE_LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.VENNIE_LINKEDIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('LinkedIn OAuth not configured. Set VENNIE_LINKEDIN_CLIENT_ID and VENNIE_LINKEDIN_CLIENT_SECRET.');
  }

  // Generate CSRF state token
  const state = crypto.randomBytes(16).toString('hex');

  // Build auth URL
  const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('state', state);

  return new Promise((resolve, reject) => {
    let server;
    let timeout;

    // Start local callback server
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      // CSRF check
      if (returnedState !== state) {
        res.writeHead(400);
        res.end(callbackHTML('Security Error', 'State mismatch — possible CSRF attack. Please try again.', false));
        cleanup();
        reject(new Error('OAuth state mismatch'));
        return;
      }

      if (error) {
        res.writeHead(400);
        res.end(callbackHTML('Authorization Failed', `LinkedIn returned: ${error}`, false));
        cleanup();
        reject(new Error(`LinkedIn OAuth error: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400);
        res.end(callbackHTML('Missing Code', 'No authorization code received.', false));
        cleanup();
        reject(new Error('No auth code received'));
        return;
      }

      // Success — show browser message immediately
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(callbackHTML('Connected!', 'You can close this window and return to Vennie.', true));

      try {
        // Exchange code for tokens
        const tokens = await exchangeCode(code, clientId, clientSecret);
        const profile = decodeJWT(tokens.id_token);

        cleanup();
        resolve({
          name: profile.name || `${profile.given_name || ''} ${profile.family_name || ''}`.trim(),
          email: profile.email || '',
          picture: profile.picture || '',
          givenName: profile.given_name || '',
          familyName: profile.family_name || '',
        });
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    function cleanup() {
      if (timeout) clearTimeout(timeout);
      if (server) {
        server.close();
        server = null;
      }
    }

    server.listen(CALLBACK_PORT, () => {
      // Open browser
      openBrowser(authUrl.toString());
    });

    server.on('error', (err) => {
      cleanup();
      reject(new Error(`Could not start callback server on port ${CALLBACK_PORT}: ${err.message}`));
    });

    // Timeout — user may have closed the browser
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error('LinkedIn authorization timed out (2 minutes). Try again.'));
    }, AUTH_TIMEOUT_MS);
  });
}

/**
 * Exchange authorization code for tokens.
 */
async function exchangeCode(code, clientId, clientSecret) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  return response.json();
}

/**
 * Decode a JWT id_token without external dependencies.
 * We only need the payload — no signature verification needed for local auth flow.
 */
function decodeJWT(token) {
  if (!token) throw new Error('No id_token in OAuth response');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  // Base64url decode the payload (second segment)
  const payload = parts[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const decoded = Buffer.from(payload, 'base64').toString('utf8');
  return JSON.parse(decoded);
}

/**
 * Open a URL in the user's default browser.
 */
function openBrowser(url) {
  try {
    // macOS
    execSync(`open "${url}"`, { stdio: 'ignore' });
  } catch {
    try {
      // Linux
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
    } catch {
      // Windows
      try {
        execSync(`start "" "${url}"`, { stdio: 'ignore' });
      } catch {
        // Can't open — user will need to copy/paste
        console.log(`\n  Open this URL in your browser:\n  ${url}\n`);
      }
    }
  }
}

/**
 * Generate the HTML callback page shown in the browser.
 */
function callbackHTML(title, message, success) {
  const color = success ? '#6366f1' : '#ef4444';
  const emoji = success ? '🐙' : '⚠️';

  return `<!DOCTYPE html>
<html>
<head><title>Vennie — ${title}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; display: flex;
         justify-content: center; align-items: center; min-height: 100vh;
         margin: 0; background: #0f0f1a; color: #e0e0e8; }
  .card { text-align: center; padding: 3rem; max-width: 400px; }
  .emoji { font-size: 3rem; margin-bottom: 1rem; }
  h1 { color: ${color}; margin-bottom: 0.5rem; }
  p { color: #9ca3af; line-height: 1.5; }
</style></head>
<body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

// ── Manual Profile Entry ────────────────────────────────────────────────────
// Conversational fallback when LinkedIn OAuth isn't configured.

/**
 * Gather profile data through a conversational CLI flow.
 *
 * @param {readline.Interface} rl - readline interface for user input
 * @returns {{ name: string, email: string, givenName: string, familyName: string }}
 */
async function manualProfileEntry(rl) {
  const { fg, style } = require('./render.js');

  const ask = (prompt) => new Promise((resolve) => {
    process.stdout.write(`  ${fg.grey}${prompt}${style.reset} `);
    rl.once('line', (answer) => resolve(answer.trim()));
  });

  console.log(`\n  ${fg.magenta}Let's get to know you.${style.reset}\n`);

  const name = await ask('What should I call you?');
  const nameParts = name.split(' ');
  const givenName = nameParts[0] || name;
  const familyName = nameParts.slice(1).join(' ') || '';

  const role = await ask('What\'s your current role?');
  const company = await ask('Where do you work?');
  const email = await ask('Email (optional, press Enter to skip):');

  console.log();

  return {
    name,
    email: email || '',
    picture: '',
    givenName,
    familyName,
    role,
    company,
  };
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  linkedInAuth,
  manualProfileEntry,
  isLinkedInConfigured,
};
