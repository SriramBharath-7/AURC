# AURC

A lightweight web app that monitors the availability of Anna University COE results endpoints and shows the current status on a live dashboard.

## Live App

- Production (Vercel): https://aurc-monitor.vercel.app

## Monitored URLs

- https://coe.annauniv.edu/home/index.php
- https://coe.annauniv.edu/home/

## Status Rules

- `UP`: At least one endpoint returns `200` and no busy/slow signals.
- `DOWN`: All endpoint checks fail or timeout.
- `BUSY`: Endpoint returns `429`, `503`, any `5xx`, or response is too slow.

## Features

- Express backend with endpoint health checks
- Dashboard with big status indicator
- Last checked timestamp
- Average response time
- Endpoint-wise check table
- Auto-refresh on frontend
- Optional browser notification + sound when status changes to `UP`
- Previous state tracking to avoid repeated alerts
- Mobile-friendly UI

## Tech Stack

- Backend: Node.js + Express
- Frontend: HTML + CSS + JavaScript

## Project Structure

```text
/server
  server.js
/public
  index.html
  style.css
  script.js
package.json
README.md
```

## Run Locally

### 1. Install dependencies

```bash
npm install
```

### 2. Start server

```bash
npm start
```

### 3. Open in browser

- http://localhost:3000
- If `3000` is busy, server auto-retries on the next ports (`3001`, `3002`, ...).

## API

### `GET /api/status`

Returns current monitor state in JSON:

```json
{
  "status": "DOWN",
  "reason": "All endpoints timed out or failed",
  "checkedAt": "2026-03-14T04:31:37.521Z",
  "previousStatus": "DOWN",
  "averageResponseMs": 6003,
  "checks": [
    {
      "url": "https://coe.annauniv.edu/home/index.php",
      "ok": false,
      "statusCode": null,
      "durationMs": 6006,
      "error": "timeout"
    }
  ]
}
```

## Deploy on Vercel

This project is Vercel-compatible.

- `vercel.json` routes all traffic through `server/server.js`.
- In Vercel serverless mode, the app runs a fresh check per `/api/status` request.
- In local mode (`npm start`), the app also runs a background check loop every 10 seconds.

### Deploy command

```bash
vercel --prod --yes
```

## Notes

- The COE endpoints may intermittently timeout depending on internet route/load; this is expected and reflected in status.
- If notifications are enabled in the dashboard, alerts trigger only on status change to `UP`.
