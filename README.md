# 1XBET Crash CF Capture (Update)

Capture crash-round results from the 1XBET game page using Puppeteer and Chrome DevTools Protocol.

## What it records

- `data.csv`: local time, public game totals, crash multiplier, and round field `L`.
- `data.txt`: one captured crash multiplier per line.
- `websocket-events.jsonl`: parsed SignalR event types, target names, and argument field shapes. This diagnostic file intentionally records field names and data types only, not account or session values.

## How to use

1. Install dependencies:

```bash
npm install
```

2. Confirm the Chrome executable path in `launch.js`.
3. Run:

```bash
node 1xbet_crash_cf_capture.js
```

The script opens the configured Arabic Crash page, waits for the game iframe, and then records incoming WebSocket events. Press `Ctrl+C` to stop it.

## Important notes

- The `L` field is stored as the game's round-related field; this script does not identify it as an account ID.
- Captured past multipliers are historical observations, not a way to know or guarantee the next result.
- Keep generated logs local and do not publish private account, session, or betting information.
