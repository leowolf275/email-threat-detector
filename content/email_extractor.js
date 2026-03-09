// ─────────────────────────────────────────────
// Email Extractor — Content Script
// Supports: Gmail
// ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXTRACT_EMAIL") {
    try {
      const emailData = extractEmail();
      sendResponse({ success: true, emailData });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  }
  return true;
});

function extractEmail() {
  const host = window.location.hostname;

  if (host.includes("mail.google.com")) {
    return extractFromGmail();
  }

  throw new Error("Unsupported email client. Please open Gmail.");
}

// ─── GMAIL ───────────────────────────────────
function extractFromGmail() {
  // Find the focused/open email thread container
  const emailContainer =
    document.querySelector(".a3s.aiL") ||          // main body
    document.querySelector(".ii.gt .a3s");

  if (!emailContainer) {
    throw new Error("No open email found. Please open an email first.");
  }

  const subject =
    document.querySelector("h2.hP")?.innerText ||
    document.querySelector("[data-thread-perm-id] h2")?.innerText ||
    "(no subject)";

  // Sender info
  const senderEl =
    document.querySelector(".gD") ||
    document.querySelector("[email].go");
  const senderName  = senderEl?.getAttribute("name")  || senderEl?.innerText || "";
  const senderEmail = senderEl?.getAttribute("email")  || "";

  const bodyText = emailContainer.innerText || "";
  const links = extractLinks(emailContainer);
  const attachments = extractAttachments();

  return {
    subject,
    sender    : senderEmail,
    senderName,
    body      : bodyText,
    links,
    attachments
  };
}

// ─── ATTACHMENT EXTRACTION ───────────────────
function extractAttachments() {
  const filenames = [];

  // Gmail attachment chips (download links with filenames)
  const chips = document.querySelectorAll(
    ".aZo a.aQy, .aZo [download], .aQw, .aV3 .aVW"
  );
  chips.forEach(el => {
    const name =
      el.getAttribute("download") ||
      el.getAttribute("aria-label") ||
      el.innerText?.trim() || "";
    if (name) filenames.push(name);
  });

  // Fallback: look for any element with a download attribute
  if (filenames.length === 0) {
    document.querySelectorAll("[download]").forEach(el => {
      const name = el.getAttribute("download") || "";
      if (name) filenames.push(name);
    });
  }

  // Fallback: aria-labels mentioning attachments
  if (filenames.length === 0) {
    document.querySelectorAll("[aria-label*='Attachment']").forEach(el => {
      const label = el.getAttribute("aria-label") || "";
      const match = label.match(/Attachment:\s*(.+)/i);
      if (match) filenames.push(match[1].trim());
    });
  }

  return [...new Set(filenames)];
}

// ─── LINK EXTRACTION ─────────────────────────
function extractLinks(container) {
  const anchors = Array.from(container.querySelectorAll("a[href]"));
  const links   = [];

  for (const anchor of anchors) {
    const href = anchor.href || "";
    if (!href || href.startsWith("mailto:")) continue;
    links.push(href);
  }

  return [...new Set(links)];
}
