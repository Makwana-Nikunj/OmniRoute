#!/usr/bin/env node

/**
 * Self-ping keep-alive daemon for Render free tier.
 * Render spins down free web services after 15 minutes of inactivity.
 * This script periodically pings the public URL to keep the instance active.
 */

const INTERVAL_MINUTES = Math.max(1, Number(process.env.KEEP_ALIVE_INTERVAL_MINUTES) || 5);
const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000;

// RENDER_EXTERNAL_URL is automatically provided by Render for web services
const targetBaseUrl =
  process.env.KEEP_ALIVE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "https://omniroute-foe9.onrender.com";

console.log(`[keepalive] Initialized. Target: ${targetBaseUrl} (interval: ${INTERVAL_MINUTES}m)`);

async function sendPing() {
  const pingUrl = new URL("/api/health", targetBaseUrl).href;
  try {
    const res = await fetch(pingUrl, {
      method: "GET",
      headers: {
        "User-Agent": "OmniRoute-KeepAlive/1.0",
      },
      signal: AbortSignal.timeout(30000),
    });
    console.log(`[keepalive] ${new Date().toISOString()} - Ping sent to ${pingUrl} - Status: ${res.status}`);
  } catch (err) {
    console.warn(`[keepalive] ${new Date().toISOString()} - Ping failed: ${err.message}`);
  }
}

// Initial delay: wait 60s for OmniRoute to start up before the first ping
setTimeout(() => {
  sendPing();
  setInterval(sendPing, INTERVAL_MS);
}, 60 * 1000);
