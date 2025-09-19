# Development & Manual Test Instructions (Scaffold)

These steps are written for a non-developer user. Follow them exactly to load and test the scaffolded extension. This matches the authoritative spec in `build_instructions.md`.

## 1. Load the extension (unpacked)

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable "Developer mode" (toggle in top-right).
4. Click "Load unpacked" and select the folder containing `manifest.json` (this project root).
5. You should see "Product Pros/Cons Extractor — Safe Deep Crawl Edition" appear.

## 2. Basic deep crawl test (mock summarizer)

1. Navigate to a product page with reviews (e.g., an Amazon product).
2. Click the extension icon (puzzle piece -> pin if needed) then open the popup.
3. Press the single button: "Analyze Reviews (Deep Crawl Up To 30 Pages)".
4. A consent modal appears in-page; check the required boxes and start.
5. Progress overlay shows crawl status. When finished a results overlay with Pros / Cons appears (using local fallback summarizer if no valid Gemini key).
6. Open DevTools (F12) > Console and filter for `PPC:` logs to verify extraction.

## 3. Configure options

1. Right-click the extension icon > Options OR open popup and click "Settings".
2. Paste a Gemini API key (optional). Validate it using the Validate Key button. Popup indicator dot: green=valid, red=invalid, amber=quota, purple=network issue.
3. Toggle Fallback mode (forces local summarizer even if key exists).
4. Click Save.

## 4. What is not yet implemented

- Real Gemini Flash 2.0 network call (template present, still mocked for safety until JSON schema validator added).
- Deterministic sampling for very large review sets (currently attempts to process all up to 30 pages).
- Enhanced CAPTCHA pattern library and accessibility improvements.

## 5. Planned upcoming enhancements

1. Strict JSON schema validation and safe parsing for Gemini responses.
2. Activate real Gemini call behind safety guard + sampling window.
3. Accessibility (focus trapping, ARIA roles) for overlays and modals.
4. Additional unit tests (redaction, caching edge cases, CAPTCHA detection).

## 6. Troubleshooting

- If Analyze button returns 0 reviews: ensure you're on a review page or scroll so reviews load.
- Check Console logs for lines starting with `PPC:` and copy them if issues
  - `PPC: CONTENT-ERR` indicates extraction failure.
  - `PPC: GEMINI-REQ (mock)` shows summarizer triggered.

## 7. Safety note

No external network calls are made by this scaffold (Gemini usage is mocked). PII redaction logic and deep crawl safeguards will be added with the full feature implementation.
