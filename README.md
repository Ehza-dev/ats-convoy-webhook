
**ATS Convoy Server — Discord Webhook Status**

- **Purpose:** Simple Node.js utility that monitors an American Truck Simulator (ATS) dedicated server using Steam A2S queries and maintains a single Discord webhook message with the current server status (player count / online/offline). The script edits the same message to keep the channel clean.

**Features**
- **Single-message updates:** Creates one webhook message and edits it on changes or on a heartbeat interval.
- **Change detection:** Posts only when status or player counts change (or on heartbeat).
- **Heartbeat:** Periodic heartbeat updates keep the message fresh even when nothing changes.

**Requirements**
- Node.js
- npm 

**Install**
1. Clone this repository.
2. Install required packages:

```bash
npm install gamedig dotenv
```

**Configuration (.env)**
Create a `.env` file in the project root with these values (example):

```
WEBHOOK_URL=https://discord.com/api/webhooks/XXXXX/YYYYY
HOST=123.45.67.89
PORT=27016 # USE QUERY PORT, NOT CONNECTION
INTERVAL_MS=60000
HEARTBEAT_MS=300000
SERVER_LABEL=ATS Convoy Server
DISPLAY_MAXPLAYERS=20 # A2S will default this to a max of 8, this will override the max native limit
```

**Behavior & Notes**
- The script persists the last message ID and last known state to [last_state.json](last_state.json).
- If the webhook message is deleted (404), the script will create a new one automatically.
- The script uses `gamedig` for A2S queries and tolerates short query failures.

**Troubleshooting**
- "Missing/invalid config": ensure `WEBHOOK_URL`, `HOST`, and numeric `PORT` are set in `.env`.
- If queries always fail, verify server IP/port and that the server responds to Steam A2S.
- Increase `socketTimeout` or `INTERVAL_MS` if network instability causes frequent query errors.

**License**
- See the project `LICENSE`.