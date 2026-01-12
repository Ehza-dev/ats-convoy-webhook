const fs = require("fs");
const fetch = require("node-fetch");
const Gamedig = require("gamedig");
require("dotenv").config();

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const HOST = process.env.HOST;
const PORT = Number(process.env.PORT); // YOUR ATS QUERY PORT
const INTERVAL_MS = process.env.SERVER_LABEL ?? "ATS Convoy Server";

if (!WEBHOOK_URL || !HOST || !PORT) {
    console.error("Missing env vars. Make sure all information is added in the .env file");
    process.exit(1);
}

const STATE_FILE = "./last_state.json";

function loadLast() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); }
  catch { return null; }
}

function saveLast(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

async function sendWebhook(embed) {
  await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] })
  });
}

async function checkOnce() {
  let online = false;
  let players = 0;
  let maxplayers = 0;
  let name = "ATS Convoy Server";

  try {
    const state = await Gamedig.query({ type: "ats", host: HOST, port: PORT });
    online = true;
    players = state.players?.length ?? 0;
    maxplayers = state.maxplayers ?? 0;
    name = state.name ?? name;
  } catch {
    online = false;
  }

  const current = { online, players, maxplayers, name };
  const last = loadLast();

  const changed = !last ||
    last.online !== current.online ||
    last.players !== current.players ||
    last.maxplayers !== current.maxplayers ||
    last.name !== current.name;

  if (!changed) return;

  saveLast(current);

  const statusText = online
    ? `🟢 Online — **${players}/${maxplayers || "?"}** players`
    : `🔴 Offline`;

  const embed = {
    title: name,
    description: statusText,
    fields: [
      { name: "Address", value: `\`${HOST}:${PORT}\``, inline: true },
      { name: "Last check", value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
    ]
  };

  await sendWebhook(embed);
  console.log("Posted update:", current);
}

setInterval(checkOnce, INTERVAL_MS);
checkOnce();
