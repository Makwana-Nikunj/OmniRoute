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

async function prewarm() {
  console.log("[keepalive] Running initial prewarm sequence...");
  await sendPing();

  try {
    const modelsUrl = new URL("/v1/models", targetBaseUrl).href;
    const res = await fetch(modelsUrl, {
      method: "GET",
      headers: { "User-Agent": "OmniRoute-Warmup/1.0" },
      signal: AbortSignal.timeout(30000),
    });
    console.log(`[keepalive] Prewarmed /v1/models (status: ${res.status})`);
  } catch (e) {
    console.warn(`[keepalive] /v1/models prewarm failed: ${e.message}`);
  }

  try {
    const chatUrl = new URL("/v1/chat/completions", targetBaseUrl).href;
    const res = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "OmniRoute-Warmup/1.0",
      },
      body: JSON.stringify({
        model: "warmup-probe",
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: AbortSignal.timeout(45000),
    });
    console.log(`[keepalive] Prewarmed /v1/chat/completions (status: ${res.status})`);
  } catch (e) {
    console.warn(`[keepalive] /v1/chat/completions prewarm failed: ${e.message}`);
  }
  console.log("[keepalive] Prewarm sequence complete.");
}

// Initial delay: wait 45s for OmniRoute to start up before running prewarm
setTimeout(async () => {
  await prewarm();
  setInterval(sendPing, INTERVAL_MS);
}, 45 * 1000);

