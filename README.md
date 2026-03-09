# Email Threat Detector

A Chrome extension that uses Gemini AI to scan your Gmail for phishing and other email threats. Open an email, click scan, and get a breakdown of how sketchy it is.

## What it does

You click the extension while reading an email, and it pulls out the sender, subject, body, links, and attachments. That data gets sent to Gemini, which analyzes it like a cybersecurity expert and gives you:

- A **risk verdict** - LOW, MEDIUM, or HIGH
- A **confidence score** out of 100
- A short **summary** of the email
- A **threat breakdown** with bar charts scoring 5 categories: Sender Legitimacy, Link Safety, Attachment Safety, Language Tone, and Request Type (each scored 0-100)
- **Advice** on what to do next

Results get cached for 10 minutes so you're not burning API calls if you re-scan.

## Getting started

1. **Clone or download** this repo
2. **Add your Gemini API key** - open `config.js` in the project root and paste your key:
   ```js
   export const CONFIG = {
     GEMINI_API_KEY: "paste-your-key-here"
   };
   ```
   You can grab a free key from [Google AI Studio](https://aistudio.google.com/apikey).

3. **Load it into Chrome:**
   - Go to `chrome://extensions`
   - Turn on **Developer mode** (top right)
   - Click **Load unpacked**
   - Select the project folder

That's it - you should see the extension icon in your toolbar.

> `config.js` is gitignored so your API key won't get committed.

## How to use it

1. Open an email in **Gmail**
2. Click the extension icon in the toolbar
3. Hit **Scan Open Email**
4. Check the verdict, threat breakdown bars, and advice

## How it works under the hood

```
Popup (popup.html / popup.js)
  - tells the content script to extract the email

Content Script (email_extractor.js)
  - scrapes subject, sender, body, links, attachments from Gmail's DOM
  - sends it back to the popup

Popup - Service Worker (service_worker.js)
  - builds a prompt and calls Gemini AI
  - parses the JSON response, normalizes scores
  - caches the result for 10 min

Popup renders the results
  - verdict card, bar chart breakdown, advice
```

## Project structure

| File | What it does |
|------|-------------|
| `manifest.json` | Chrome extension config (Manifest V3) |
| `config.js` | Your Gemini API key (gitignored) |
| `background/service_worker.js` | Gemini API calls, prompt building, caching |
| `content/email_extractor.js` | Pulls email data out of Gmail's page |
| `popup/popup.html` + `popup.js` | The UI you see when you click the extension |