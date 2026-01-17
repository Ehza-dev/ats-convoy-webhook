/**
 * ATS Dedicated Convoy Server -> Discord Webhook Status (single message, auto-edit)
 *
 * - Checks server via Steam A2S query
 * - Posts ONLY when:
 *    a) status/players change, OR
 *    b) heartbeat interval passes (default 5 minutes)
 * - Keeps the channel clean by editing ONE webhook message forever
 *
 * .env example:
 *   WEBHOOK_URL=https://discord.com/api/webhooks/XXXXX/YYYYY
 *   HOST=123.45.67.89
 *   PORT=27016
 *   INTERVAL_MS=60000
 *   HEARTBEAT_MS=300000
 *   SERVER_LABEL=ATS Convoy Server
 *   DISPLAY_MAXPLAYERS=20
 */

require("dotenv").config();

const fs = require("fs");
const { GameDig } = require("gamedig");

// ====== CONFIG (from .env) ======
const WEBHOOK_URL = (process.env.WEBHOOK_URL || "").trim();
const HOST = (process.env.HOST || "").trim();
const PORT = parseInt((process.env.PORT || "").trim(), 10);
const DISPLAY_MAXPLAYERS = parseInt((process.env.DISPLAY_MAXPLAYERS || "0").trim(), 10);
const INTERVAL_MS = parseInt((process.env.INTERVAL_MS || "60000").trim(), 10);
const HEARTBEAT_MS = parseInt((process.env.HEARTBEAT_MS || "300000").trim(), 10);
const SERVER_LABEL = (process.env.SERVER_LABEL || "ATS Convoy Server").trim();

if (!WEBHOOK_URL || !HOST || !Number.isFinite(PORT)) {
  console.error("Missing/invalid config. Check WEBHOOK_URL, HOST, PORT.");
  process.exit(1);
}
if (!Number.isFinite(INTERVAL_MS) || INTERVAL_MS < 5000) {
  console.error("INTERVAL_MS must be >= 5000.");
  process.exit(1);
}
if (!Number.isFinite(HEARTBEAT_MS) || HEARTBEAT_MS < 30000) {
  console.error("HEARTBEAT_MS must be >= 30000.");
  process.exit(1);
}

// ====== STATE ======
const STATE_FILE = "./last_state.json";

function loadLast() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function saveLast(data) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

// ====== DISCORD WEBHOOK  ======
async function discordRequest(method, url, bodyObj) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined
  });

  const text = await res.text();
  let data = null;

  try { data = text ? JSON.parse(text) : null; } catch {}

  if (!res.ok) {
    const msg = data?.message || text || `HTTP ${res.status}`;
    const err = new Error(`${method} failed (${res.status}): ${msg}`);
    err.status = res.status;
    throw err;
  }

  return data;
}

async function upsertWebhookMessage(embed, last) {
  const messageId = last?.messageId;

  if (messageId) {
    try {
      await discordRequest(
        "PATCH",
        `${WEBHOOK_URL}/messages/${messageId}`,
        { embeds: [embed] }
      );
      return { messageId, didCreate: false };
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }

  const created = await discordRequest(
    "POST",
    `${WEBHOOK_URL}?wait=true`,
    { embeds: [embed] }
  );

  return { messageId: created.id, didCreate: true };
}

// ====== STATUS CHECK ======
async function queryAtsServer() {
  let online = false;
  let players = 0;
  let maxplayers = 0;
  let name = SERVER_LABEL;

  try {
    const state = await GameDig.query({
      type: "protocol-valve",
      host: HOST,
      port: PORT,
      maxAttempts: 2,
      socketTimeout: 2500
    });

    online = true;
    name = state.name || name;

    // Player count
    const reportedCount =
      (Number.isFinite(state.numplayers) ? state.numplayers : undefined) ??
      (Number.isFinite(state.raw?.numplayers) ? state.raw.numplayers : undefined) ??
      (Number.isFinite(state.raw?.players) ? state.raw.players : undefined);

    players = Number.isFinite(reportedCount) ? reportedCount : 0;

    // Max players (A2S often lies for ATS, override if configured)
    maxplayers = Number.isFinite(state.maxplayers) ? state.maxplayers : 0;

    if (Number.isFinite(DISPLAY_MAXPLAYERS) && DISPLAY_MAXPLAYERS > 0) {
      if (!Number.isFinite(maxplayers) || maxplayers <= 8) {
        maxplayers = DISPLAY_MAXPLAYERS;
      }
    }

  } catch (e) {
    console.error("Gamedig query failed:", e?.message || e);
    online = false;
  }

  return { online, players, maxplayers, name };
}

// ====== EMBED ======
function buildEmbed(current, reason) {
  const now = Date.now();
  const embedColor = current.online ? 0x57F287 : 0xED4245;

  const statusText = current.online
    ? `🟢 Online — **${current.players}/${current.maxplayers || "?"}** players`
    : `🔴 Offline`;

  return {
    color: embedColor,
    title: current.name || SERVER_LABEL,
    description: statusText,
    fields: [
      { name: "Last check", value: `<t:${Math.floor(now / 1000)}:R>`, inline: true }
    ],
    footer: { text: reason }
  };
}

// ====== LOOP ======
async function checkOnce() {
  const now = Date.now();
  console.log("checkOnce:", new Date().toISOString());

  const last = loadLast();
  const lastState = last?.state || null;
  const lastPostAt = last?.lastPostAt || 0;

  const current = await queryAtsServer();

  const stateChanged =
    !lastState ||
    lastState.online !== current.online ||
    lastState.players !== current.players ||
    lastState.maxplayers !== current.maxplayers ||
    lastState.name !== current.name;

  const heartbeatDue = now - lastPostAt >= HEARTBEAT_MS;

  if (!stateChanged && !heartbeatDue) {
    console.log("No change and heartbeat not due.");
    return;
  }

  const reason = stateChanged ? "🔄 Status changed" : "⏱️ 5-minute update";
  const embed = buildEmbed(current, reason);

  try {
    const result = await upsertWebhookMessage(embed, last);

    saveLast({
      state: current,
      lastPostAt: now,
      messageId: result.messageId
    });

    console.log(result.didCreate ? "Created status message." : "Edited status message.");
  } catch (err) {
    console.error("Webhook update failed:", err.message);
  }
}

setInterval(checkOnce, INTERVAL_MS);
checkOnce();