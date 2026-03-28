#!/usr/bin/env node
/**
 * Generates a new Chrome Web Store OAuth refresh token and saves it to the
 * GitHub repo secret CHROME_REFRESH_TOKEN.
 *
 * Prerequisites:
 *   - CHROME_CLIENT_ID and CHROME_CLIENT_SECRET set as environment variables
 *   - `gh` CLI installed and authenticated
 *
 * Usage:
 *   CHROME_CLIENT_ID=xxx CHROME_CLIENT_SECRET=yyy node scripts/refresh-webstore-token.mjs
 */

import http from "http";
import { exec } from "child_process";
import { promisify, promisify as p } from "util";
import { createInterface } from "readline";

const execAsync = promisify(exec);

async function prompt(question, { silent = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      if (silent) process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
    if (silent) rl._writeToOutput = () => {};
  });
}

const DEFAULT_CLIENT_ID = "340461540971-181sscpbhemhldnjfp74h50171ka6omd.apps.googleusercontent.com";

const clientId = process.env.CHROME_CLIENT_ID || DEFAULT_CLIENT_ID;
const clientSecret = process.env.CHROME_CLIENT_SECRET
  || await prompt("Chrome Client Secret: ", { silent: true });

if (!clientSecret) {
  console.error("Error: Client Secret is required.");
  process.exit(1);
}

const SCOPE = "https://www.googleapis.com/auth/chromewebstore";

// ── Step 1: Start local server to catch the OAuth callback ───────────────────

const { code, redirectUri } = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    res.writeHead(200, { "Content-Type": "text/html" });

    if (error) {
      res.end("<h2>Authorization failed.</h2><p>You can close this tab.</p>");
      server.close();
      reject(new Error(`OAuth error: ${error}`));
      return;
    }

    if (code) {
      res.end("<h2>Authorization successful!</h2><p>You can close this tab.</p>");
      server.close();
      resolve({ code, redirectUri: server.redirectUri });
    }
  });

  server.listen(9004, "127.0.0.1", () => {
    const { port } = server.address();
    server.redirectUri = `http://127.0.0.1:${port}`;

    const authUrl =
      `https://accounts.google.com/o/oauth2/auth` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(server.redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(SCOPE)}` +
      `&access_type=offline` +
      `&prompt=consent`;

    console.log("Opening browser for Google authorization...");
    console.log(`(If it doesn't open, visit:\n  ${authUrl})\n`);

    const opener = process.platform === "darwin" ? "open"
      : process.platform === "win32" ? "start"
      : "xdg-open";
    exec(`${opener} "${authUrl}"`);
  });

  server.on("error", reject);
});

// ── Step 2: Exchange code for refresh token ───────────────────────────────────

console.log("Exchanging authorization code for tokens...");

const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  }),
});

const tokenData = await tokenRes.json();

if (!tokenData.refresh_token) {
  console.error("Failed to obtain refresh token:", JSON.stringify(tokenData, null, 2));
  process.exit(1);
}

console.log("Refresh token obtained.\n");

// ── Step 3: Save to GitHub secret ────────────────────────────────────────────

console.log("Saving CHROME_REFRESH_TOKEN to GitHub repo secrets via gh CLI...");

try {
  await execAsync(`gh secret set CHROME_REFRESH_TOKEN --body "${tokenData.refresh_token}"`);
  console.log("Done! CHROME_REFRESH_TOKEN updated in GitHub secrets.");
} catch (err) {
  console.error("Failed to update GitHub secret. Is the gh CLI installed and authenticated?");
  console.error(err.message);
  console.log("\nRefresh token (save this manually):", tokenData.refresh_token);
  process.exit(1);
}
