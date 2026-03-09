// ─────────────────────────────────────────────
// Popup Script — Email Threat Detector
// Gemini AI-powered analysis
// ─────────────────────────────────────────────

const scanBtn    = document.getElementById("scanBtn");
const loading    = document.getElementById("loading");
const loadingMsg  = document.getElementById("loadingMsg");
const errorBox    = document.getElementById("errorBox");
const results     = document.getElementById("results");

// ── SCAN BUTTON ──
scanBtn.addEventListener("click", async () => {
  clearState();
  setLoading(true, "Extracting email content…");

  // 1. Get active tab
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("No active tab found.");
  } catch (err) {
    return showError(err.message);
  }

  // 2. Extract email via content script
  let emailData;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_EMAIL" });
    if (!response?.success) throw new Error(response?.error || "Could not extract email.");
    emailData = response.emailData;
  } catch (err) {
    return showError(
      err.message.includes("Could not establish")
        ? "Please open Gmail or Outlook and open an email first."
        : err.message
    );
  }

  setLoading(true, "Running Gemini analysis…");

  // 3. Send to service worker for analysis
  let result;
  try {
    const response = await chrome.runtime.sendMessage({ type: "SCAN_EMAIL", emailData });
    if (!response?.success) throw new Error(response?.error || "Scan failed.");
    result = response.result;
  } catch (err) {
    return showError(`Analysis error: ${err.message}`);
  }

  setLoading(false);
  renderResults(result);
});

// ── RENDER RESULTS ──
function renderResults(result) {
  results.classList.add("active");

  const verdictBanner  = document.getElementById("verdictBanner");
  const verdictIcon    = document.getElementById("verdictIcon");
  const verdictLabel   = document.getElementById("verdictLabel");
  const verdictConf    = document.getElementById("verdictConf");
  const verdictSummary = document.getElementById("verdictSummary");

  const icons  = { LOW: "✅", MEDIUM: "⚠️", HIGH: "🚨" };
  const labels = { LOW: "Low Risk", MEDIUM: "Medium Risk", HIGH: "High Risk" };
  const v = result.verdict;

  verdictBanner.className = `verdict-card ${v}`;
  verdictIcon.textContent = icons[v] || "❓";
  verdictLabel.textContent = labels[v] || v;
  verdictConf.textContent = `${result.confidence}% confidence`;

  if (result.summary) {
    verdictSummary.textContent = result.summary;
  }

  // ─ Advice card ─
  const adviceCard = document.getElementById("adviceCard");
  const adviceIcon = document.getElementById("adviceIcon");
  const adviceText = document.getElementById("adviceText");

  const advice = {
    LOW: {
      icon: "👍",
      text: "This email appears safe. Continue as normal."
    },
    MEDIUM: {
      icon: "⚡",
      text: "Proceed with caution. Verify the sender before clicking any links or sharing information."
    },
    HIGH: {
      icon: "🛑",
      text: "Do not interact with this email. Do not click links or download attachments. Mark as spam or report it."
    }
  };

  const a = advice[v] || advice.LOW;
  adviceCard.className = `advice-card ${v}`;
  adviceIcon.textContent = a.icon;
  adviceText.textContent = a.text;
  adviceCard.style.display = "flex";

  // ─ Threat Breakdown Bars ─
  const breakdownList = document.getElementById("breakdownList");
  breakdownList.innerHTML = "";

  const indicators = result.indicators || [];
  indicators.forEach(ind => {
    const score = ind.score || 0;
    const level = score <= 33 ? "low" : score <= 66 ? "medium" : "high";

    const item = document.createElement("div");
    item.className = "bar-item";

    const header = document.createElement("div");
    header.className = "bar-header";

    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = ind.label;

    const scoreEl = document.createElement("span");
    scoreEl.className = "bar-score";
    scoreEl.textContent = `${score}/100`;

    header.appendChild(label);
    header.appendChild(scoreEl);

    const track = document.createElement("div");
    track.className = "bar-track";

    const fill = document.createElement("div");
    fill.className = `bar-fill ${level}`;

    track.appendChild(fill);

    item.appendChild(header);
    item.appendChild(track);

    if (ind.detail) {
      const detail = document.createElement("div");
      detail.className = "bar-detail";
      detail.textContent = ind.detail;
      item.appendChild(detail);
    }

    breakdownList.appendChild(item);

    // Animate bar after DOM insert
    requestAnimationFrame(() => {
      fill.style.width = `${score}%`;
    });
  });

}

// ── HELPERS ──
function setLoading(on, msg = "") {
  scanBtn.disabled = on;
  loading.classList.toggle("active", on);
  if (msg) loadingMsg.textContent = msg;
  if (!on) loading.classList.remove("active");
}

function clearState() {
  errorBox.classList.remove("active");
  errorBox.textContent = "";
  results.classList.remove("active");
  document.getElementById("breakdownList").innerHTML = "";
  document.getElementById("adviceCard").style.display = "none";

}

function showError(msg) {
  setLoading(false);
  errorBox.textContent = `⚠ ${msg}`;
  errorBox.classList.add("active");
}