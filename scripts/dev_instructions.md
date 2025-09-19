# Development & Manual Test Instructions (Scaffold)

These steps are written for a non-developer user. Follow them exactly to load and test the scaffolded extension. This matches the authoritative spec in `build_instructions.md`.

## 1. Load the extension (unpacked)
1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable "Developer mode" (toggle in top-right).
4. Click "Load unpacked" and select the folder containing `manifest.json` (this project root).
5. You should see "Product Pros/Cons Extractor — Safe Deep Crawl Edition" appear.

## 2. Basic single-page test (mock summarizer)
1. Navigate to a product page with reviews (e.g., an Amazon product).
2. Click the extension icon (puzzle piece -> pin if needed) then open the popup.
3. Press "Analyze Reviews (This Page)".
4. After a moment, a mock list of Pros / Cons should appear (using local frequency logic).
5. Open DevTools (F12) > Console and filter for `PPC:` logs to verify extraction.

## 3. Configure options
1. Right-click the extension icon > Options OR open popup and click "Settings".
2. (Optional) Paste a Gemini API key (will not be used yet—remote call not implemented in scaffold).
3. Toggle Fallback mode on/off (currently only fallback path is implemented; Gemini still mocked).
4. Adjust default Max Pages (used later for deep crawl logic).
5. Click Save.

## 4. What is not yet implemented (by design in scaffold)
- Deep Crawl controller (sequential navigation, consent modal, robots.txt check).
- Real Gemini Flash 2.0 call (a commented template is provided in `src/background.js`).
- Results overlay (will appear in future commit; currently summary shown only inside popup).

## 5. Next steps after confirmation
If you confirm, we will implement:
1. Deep Crawl consent modal (exact copy from spec) injected into page.
2. Robots.txt fetch & optional disallow checkbox.
3. Foreground tab navigation with polite delay & jitter.
4. Resume logic with sessionId in `chrome.storage.local`.
5. CAPTCHA / block detection & stop.
6. Overlay results panel with copy/refresh/undo.
7. Gemini rate limiting & caching finalization.

## 6. Troubleshooting
- If Analyze button returns 0 reviews: ensure you're on a review page or scroll so reviews load.
- Check Console logs for lines starting with `PPC:` and copy them if issues
  - `PPC: CONTENT-ERR` indicates extraction failure.
  - `PPC: GEMINI-REQ (mock)` shows summarizer triggered.

## 7. Safety note
No external network calls are made by this scaffold (Gemini usage is mocked). PII redaction logic and deep crawl safeguards will be added with the full feature implementation.
