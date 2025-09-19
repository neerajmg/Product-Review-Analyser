# Review Analyzer

This repository contains a Chrome extension that:

- Extracts product reviews from the current page
- Produces an unbiased pros/cons summary (Gemini + deterministic fallback)
- Performs a safe, consent-gated deep crawl (foreground, resumable)


## Current Status (Scaffold)

Implemented:

- Manifest & basic popup UI
- Single-page review extraction (Amazon selectors + generic fallback)
- Mock Gemini summarizer (`rewriteWithGemini` in background)
- Deterministic local fallback summarizer (`localFallback`)
- PII redaction placeholder
- Options page (API key storage, fallback toggle, default max pages)
- Basic caching infrastructure (not yet heavily exercised)

Deferred to next commits (pending your confirmation):

- Deep Crawl controller (sequential foreground navigation, consent modal, robots.txt handling)
- Real Gemini Flash 2.0 API invocation (template commented)
- Results overlay with copy/export/undo actions
- Resume & anti-bot (CAPTCHA) stop logic

## Gemini API Key Setup

The extension can operate in two modes:

1. Fallback (Local Only): No external network call; uses deterministic summarizer.
2. Gemini Mode: Sends redacted review text to Gemini Flash (once you add a valid key).

Steps to provide and validate your key:

1. Visit [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) and create a Gemini API key.
2. Open the extension Options (right‑click icon > Options or from popup Settings).
3. Paste the key into the Gemini API Key field, click Save, then click Validate Key.
4. The Key Status indicator will update (VALID, INVALID, QUOTA EXHAUSTED, etc.).
5. A red badge (!) on the extension icon plus a toast alert appears if the key becomes invalid or quota is exhausted.

The extension periodically re-checks the key (every ~6 hours) and before making summaries.

## Safety & Privacy

- No API keys are committed. User enters key in Options; stored via `chrome.storage.sync`.
- Content script never reads API key.
- PII redaction (emails & phone numbers) occurs before summarization.

## Development Quick Start

1. Load extension unpacked (`chrome://extensions`).
2. Open a product page with reviews.
3. Use the popup button “Analyze Reviews”.
4. Complete the consent modal; crawl will aggregate up to 30 pages or stop earlier when pages end.
5. View pros/cons overlay. If no API key is set, local fallback summarizer is used.

## Testing

See `tests/basic_extract_test.js` for a simple selector test harness scaffold.

## Contributing / Next Steps

After you confirm, deeper functionality (deep crawl & Gemini integration) will be implemented as small, reviewable commits.

## Disclaimer

Network calls to Gemini only occur when a valid key is saved and fallback mode is disabled. Keys are stored locally (Chrome storage) and never committed to the repository.
