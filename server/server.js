const express = require("express");
const path = require("path");

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_RETRIES = 5;

// Targets to monitor every 10 seconds.
const TARGETS = [
  "https://coe.annauniv.edu/home/index.php",
  "https://coe.annauniv.edu/home/"
];

const CHECK_INTERVAL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 6_000;
const SLOW_THRESHOLD_MS = 2_500;

let monitorState = {
  status: "UNKNOWN",
  reason: "No checks yet",
  checkedAt: null,
  previousStatus: null,
  averageResponseMs: null,
  checks: []
};

/**
 * Check one URL and return a normalized result object.
 */
async function checkTarget(url) {
  const started = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "User-Agent": "AnnaResultsMonitor/1.0"
      }
    });

    const durationMs = Date.now() - started;

    return {
      url,
      ok: response.ok,
      statusCode: response.status,
      durationMs,
      error: null
    };
  } catch (error) {
    const durationMs = Date.now() - started;

    return {
      url,
      ok: false,
      statusCode: null,
      durationMs,
      error: error.name === "TimeoutError" ? "timeout" : error.message
    };
  }
}

/**
 * Convert individual check results into a global status.
 * Rules:
 * - DOWN: all requests fail (timeout/network errors)
 * - BUSY: any endpoint returns 429/503/5xx, or responses are slow
 * - UP: at least one endpoint returns 200 quickly and no busy signals
 */
function deriveGlobalStatus(results) {
  const statusCodes = results
    .map((item) => item.statusCode)
    .filter((code) => Number.isInteger(code));

  const allFailed = results.every((item) => item.statusCode === null);
  if (allFailed) {
    return { status: "DOWN", reason: "All endpoints timed out or failed" };
  }

  const hasBusyCode = statusCodes.some((code) => code === 429 || code === 503 || code >= 500);
  if (hasBusyCode) {
    return { status: "BUSY", reason: "Server reported busy/overloaded status" };
  }

  const hasSlowResponse = results.some((item) => item.durationMs > SLOW_THRESHOLD_MS);
  if (hasSlowResponse) {
    return { status: "BUSY", reason: "Server reachable but slow" };
  }

  const hasAny200 = statusCodes.some((code) => code === 200);
  if (hasAny200) {
    return { status: "UP", reason: "Server responded normally" };
  }

  return { status: "DOWN", reason: "Unexpected responses from all endpoints" };
}

/**
 * Run one monitoring cycle and update in-memory state.
 */
async function runCheck() {
  const checks = await Promise.all(TARGETS.map((url) => checkTarget(url)));
  const { status, reason } = deriveGlobalStatus(checks);

  const totalDuration = checks.reduce((sum, item) => sum + item.durationMs, 0);
  const averageResponseMs = Math.round(totalDuration / checks.length);

  monitorState = {
    status,
    reason,
    checkedAt: new Date().toISOString(),
    previousStatus: monitorState.status,
    averageResponseMs,
    checks
  };

  const summary = checks
    .map((item) => `${item.url} => ${item.statusCode ?? item.error} (${item.durationMs}ms)`)
    .join(" | ");

  console.log(`[${monitorState.checkedAt}] ${status} - ${reason} | ${summary}`);
}

// Serve static frontend files.
app.use(express.static(path.join(__dirname, "..", "public")));

// Status API consumed by the dashboard.
app.get("/api/status", (req, res) => {
  res.json(monitorState);
});

// Initial check and periodic checks every 10 seconds.
runCheck();
setInterval(runCheck, CHECK_INTERVAL_MS);

/**
 * Start server with a small retry window when the preferred port is occupied.
 */
function startServer(port, retriesLeft = MAX_PORT_RETRIES) {
  const server = app.listen(port, () => {
    console.log(`Monitor server running at http://localhost:${port}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && retriesLeft > 0) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is in use. Retrying on port ${nextPort}...`);
      startServer(nextPort, retriesLeft - 1);
      return;
    }

    console.error("Failed to start server:", error.message);
    process.exit(1);
  });
}

startServer(DEFAULT_PORT);
