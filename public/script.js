const statusDot = document.getElementById("statusDot");
const statusLabel = document.getElementById("statusLabel");
const statusReason = document.getElementById("statusReason");
const lastChecked = document.getElementById("lastChecked");
const avgResponse = document.getElementById("avgResponse");
const checksTable = document.getElementById("checksTable");
const notifyBtn = document.getElementById("notifyBtn");
const resultLinks = document.getElementById("resultLinks");

const MONITORED_URLS = [
  "https://coe.annauniv.edu/home/index.php",
  "https://coe.annauniv.edu/home/"
];

let previousStatus = null;
let notificationsEnabled = false;

function formatTime(isoString) {
  if (!isoString) return "-";
  const date = new Date(isoString);
  return date.toLocaleString();
}

function getStatusView(status) {
  if (status === "UP") {
    return {
      emoji: "🟢",
      label: "Server UP",
      className: "status-up"
    };
  }

  if (status === "BUSY") {
    return {
      emoji: "🟡",
      label: "Server Busy",
      className: "status-busy"
    };
  }

  if (status === "DOWN") {
    return {
      emoji: "🔴",
      label: "Server DOWN",
      className: "status-down"
    };
  }

  return {
    emoji: "⚪",
    label: "Checking...",
    className: "status-unknown"
  };
}

/**
 * Plays a short beep for the optional UP alert.
 */
function playUpBeep() {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  gain.gain.setValueAtTime(0.001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start();
  oscillator.stop(context.currentTime + 0.35);
}

async function notifyIfNeeded(currentStatus) {
  // Trigger only when status changes into UP.
  if (!notificationsEnabled) return;
  if (previousStatus === currentStatus) return;
  if (currentStatus !== "UP") return;

  playUpBeep();

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("AURC", {
      body: "Server is UP now. You can check your results.",
      icon: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f7e2.png"
    });
  }
}

function renderChecks(checks) {
  checksTable.innerHTML = "";

  checks.forEach((check) => {
    const tr = document.createElement("tr");
    const codeOrError = check.statusCode ?? check.error ?? "unknown";

    tr.innerHTML = `
      <td>${check.url}</td>
      <td>${codeOrError}</td>
      <td>${check.durationMs} ms</td>
    `;

    checksTable.appendChild(tr);
  });
}

function updateUi(payload) {
  const view = getStatusView(payload.status);
  statusDot.className = `status-dot ${view.className}`;
  statusLabel.textContent = `${view.emoji} ${view.label}`;
  statusReason.textContent = payload.reason || "No details";
  lastChecked.textContent = formatTime(payload.checkedAt);
  const hasAvg = Number.isFinite(payload.averageResponseMs);
  avgResponse.textContent = hasAvg ? `${payload.averageResponseMs} ms` : "N/A";

  // Guard against partial/cached HTML where this block may not exist yet.
  if (resultLinks) {
    resultLinks.classList.toggle("hidden", payload.status !== "UP");
  }

  renderChecks(payload.checks || []);
}

async function fetchStatus() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    if (!isJson) {
      throw new Error("API returned non-JSON response");
    }

    const payload = await response.json();

    updateUi(payload);
    await notifyIfNeeded(payload.status);

    previousStatus = payload.status;
  } catch (error) {
    console.error("Status fetch failed:", error);
    updateUi({
      status: "DOWN",
      reason: "Could not reach monitor backend",
      checkedAt: new Date().toISOString(),
      averageResponseMs: null,
      checks: MONITORED_URLS.map((url) => ({
        url,
        statusCode: null,
        error: "backend_unreachable",
        durationMs: 0
      }))
    });
  }
}

if (notifyBtn) {
  notifyBtn.addEventListener("click", async () => {
    notificationsEnabled = !notificationsEnabled;

    if (notificationsEnabled && "Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    if (notificationsEnabled && "Notification" in window && Notification.permission === "denied") {
      notificationsEnabled = false;
      alert("Notification permission is blocked in your browser settings.");
    }

    notifyBtn.classList.toggle("active", notificationsEnabled);
    notifyBtn.textContent = notificationsEnabled
      ? "Notifications Enabled"
      : "Notify me when server is up";
  });
}

// Initial load and periodic refresh for live dashboard behavior.
fetchStatus();
setInterval(fetchStatus, 4_000);
