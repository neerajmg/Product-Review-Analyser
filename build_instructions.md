# BUILD_INSTRUCTIONS.md

> **Project:** Product Pros/Cons Extractor — Safe Deep Crawl Edition
> **Goal:** A privacy-first Chrome extension that collects product reviews across multiple pages (with explicit user consent), batches and sanitizes them, and calls Gemini Flash 2.0 to extract unbiased pros and cons with support counts. The extension implements a safe, resumable, foreground deep-crawl with anti-bot detection, caching, local fallback, and clear user warnings.

---

## 1 — What this file contains (quick)

- Exact behavior spec and safety constraints for deep crawling.
- UI copy (confirmation modal) that the extension must show.
- Gemini prompt templates (strict JSON) for aggregation and optional per-review classification.
- File-level deliverables for Copilot Agent.
- Non-technical GUI-first and CLI instructions for running Copilot Agent and pushing to GitHub.
- Testing checklist and troubleshooting guidance.

> NOTE: This file is the authoritative spec. Use it as the single source of truth when instructing Copilot Agent.

---

## 2 — High-level product behavior

- On a product page, the user clicks **Analyze reviews**. By default, only reviews on the current visible page are collected and analyzed.
- User can opt into **Deep Crawl** which will load additional review pages sequentially in the foreground tab, up to `maxPages` (user-configurable). Deep Crawl requires explicit multi-step consent and performs polite, resumable crawling with anti-bot detection.
- After collecting reviews, the extension sanitizes content (redacting PII), checks cache, and if needed sends a single aggregated request to Gemini for unbiased pros/cons extraction.
- Results are shown in an overlay with support counts and example review snippets. If Gemini is unavailable or the user opts out, the extension uses a deterministic local fallback summarizer.

---

## 3 — Safety & legal constraints (must be enforced)

1. **Explicit consent:** Deep Crawl must show a two-checkbox modal. The crawl proceeds only if the user checks both boxes and clicks Start.
2. **Robots.txt check:** Fetch and show robots.txt status before crawling. If robots.txt disallows crawling, require an extra opt-in checkbox and record that acceptance in logs.
3. **Foreground-only crawling:** Crawl runs in the user’s active tab (visible), not in hidden background threads.
4. **Rate limiting & jitter:** Default 1.2s ± 300ms delay between page loads. Minimum enforced delay = 500ms.
5. **Block/CAPTCHA detection:** Immediately stop on detection of CAPTCHA, access denied, or unusual anti-bot indicators.
6. **Retry & backoff:** Retry transient failures with exponential backoff up to 3 attempts.
7. **Max pages and confirmation:** Default maxPages=100. Users can increase but must explicitly confirm higher numbers.
8. **PII redaction:** Remove emails, phone numbers, and clear personal identifiers before sending to Gemini.
9. **No hidden automation:** All crawling operations are visible to the user; provide cancel button and progress UI.
10. **No keys in repo:** The API key must be entered by the user in Options and stored only in chrome.storage; the content script never reads it directly.

---

## 4 — Mandatory confirmation modal (exact copy)

Use this exact text in the UI. The user must check both boxes before the Start Deep Crawl button becomes active.

**Title:** Deep Crawl — Read Carefully

**Body:**

> You are about to ask the extension to load and collect reviews from *every* review page available for this product. This may:
>
> - Trigger anti-bot protections (CAPTCHA or temporary block).
> - Use significant bandwidth and take several minutes or hours.
> - Potentially violate the site’s Terms of Service; you accept responsibility.
>
> Check both boxes to continue:
> [ ] I confirm I understand the risks and that crawling is initiated from my browser for my personal use.
> [ ] I will not use this feature to collect data at scale for redistribution or commercial resale.
>
> If you do not want risks, use the default single-page collection mode or official APIs.
>
> **Start Deep Crawl**

If robots.txt disallows crawling, show an extra checkbox: `I understand robots.txt disallows automated crawling but I wish to proceed for my personal use.` Record acceptance.

---

## 5 — Gemini prompt templates (strict JSON) — Master aggregation prompt

**Important:** Use this verbatim when calling Gemini; it forces JSON-only output and forbids invention.

```
You are a fact-based summarizer. Use ONLY the following review texts (no external knowledge). Identify distinct pros and cons that are actually present in the reviews.

Input:
Site: <SITE>
Reviews: <REVIEWS_JSON>

Rules:
1) Do NOT invent facts or claims. Only use exact content from the review texts.
2) For each pro or con, provide a short label (<= 8 words) and a support_count (how many reviews clearly support it).
3) If support_count is 0 for positives, set "pros": [] and include "note_pros": "No pros found".
4) If no negative feedback is found, set "cons": [] and include "note_cons": "No cons found".
5) Output must be valid JSON ONLY, with this schema:

{
  "pros": [{"label":"...", "support_count": N, "example_ids":["r34","r72"]}, ...],
  "cons": [{"label":"...", "support_count": M, "example_ids":["r21"]}, ...],
  "note_pros": "No pros found" | "",
  "note_cons": "No cons found" | ""
}

Provide up to 8 pros and up to 8 cons, ordered by support_count descending.
```

**If too many reviews to fit into prompt**: sample using rating buckets (e.g., up to 50 recent 5-star, 50 recent 1-2-star, 100 mixed). Always include review `id` in each item.

---

## 6 — Optional per-review classification prompt (for pre-aggregation)

```
Classify this review into "positive", "negative", or "neutral". Output JSON: {"id":"rNN","sentiment":"positive"|"negative"|"neutral","key_points":["short phrase 1","short phrase 2"]}. Use only the review text.
```

Use these to pre-tag reviews then aggregate deterministically client-side (avoid LLM miscounts).

---

## 7 — Crawl algorithm (foreground, resumable) — pseudocode

See file `src/background.js` for actual implementation. Key points:

- Use `sessionId` and store progress in `chrome.storage.local` so crawl can resume.
- Sequentially load pages in the **active tab** using `chrome.tabs.update({ url })`.
- After each page navigation, content script extracts reviews + `nextPageUrl` and returns to background controller.
- Respect delay with jitter; stop on CAPTCHA or block.
- On completion, compress or sample large review sets and send to Gemini in one or few batched requests.
- Store aggregated results in cache with TTL and show overlay.

---

## 8 — Files & deliverables (scaffold)

Create these files and implement the behaviors described:

```
product-pros-cons/
├── manifest.json
├── src/
│   ├── background.js        // service worker: crawl controller, cache, Gemini integration (mocked), queue
│   ├── content.js           // extract reviews, detect captcha/block, detect nextPageUrl, send results to background
│   ├── selectors.js         // site-specific selectors (Amazon, Flipkart, generic) and helper finders
│   ├── ui/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── options.html
│   ├── styles.css
├── scripts/dev_instructions.md
├── README.md
└── tests/basic_extract_test.js
```

**Implementation notes:**

- `rewriteWithGemini(reviewsArray)` must be implemented as a clearly labeled mocked function in `background.js`. Include a commented real-call template and the strict prompt text.
- Add `localFallback()` deterministic summarizer.
- Add console logs prefixed `PPC:`.

---

## 9 — Selectors (starter list) — Amazon example

Put these in `selectors.js` as site-specific rules. These are starting points; test & refine.

- Review container: `#cm_cr-review_list .review` or `.review`
- Review id: `[data-hook=review]` or `id` attribute
- Review text: `.review-text-content` or `[data-hook=review-body]`
- Rating: `.a-icon-alt`
- Next page: `.a-pagination .a-last a` or link with `rel=next`

---

## 10 — Options page & API key handling

- Options page allows user to paste Gemini API key (stored in `chrome.storage`), toggle `Fallback mode`, and set `Max pages to crawl` default.
- Provide `Test key` which triggers a mocked test call to validate format. If user later provides a real key and chooses to run real calls, the background will use it.
- Include the safety/legal blurb shown in section 11.

---

## 11 — Required UI & copy (exact) to include in Options page

```
Title: Product Pros/Cons — Settings
1) Paste your Gemini API key (optional). Save & Test.
2) Fallback mode: [toggle] If on, the extension uses a local summarizer (no API calls).
3) Max pages to crawl: [1..10000] (default 100). If you set >100, you will be asked to confirm risk before crawling.
Security: API key stored locally in this browser only. We redact PII before sending content.
```

---

## 12 — Caching & quotas

- Cache key: `sha256(url + sortedReviewHashes)`.
- Default TTL: 7 days.
- Rate-limit: at most 1 Gemini call per 3 seconds; batch reviews into a single request where possible.

---

## 13 — Testing checklist (non-technical)

1. Load unpacked extension.
2. Visit an Amazon product page; click Analyze Reviews (default single page). Confirm overlay shows pros/cons.
3. Click Deep Crawl (maxPages=3) and follow confirmation steps. Confirm progress UI shows pages crawled and that crawl stops on CAPTCHA (if simulated).
4. Test without API key — confirm fallback results.
5. Test resume: start deep crawl, stop mid-way, close tab, reopen and resume.
6. Check console logs for `PPC:` entries and copy them if debugging.

---

## 14 — Git & GitHub non-technical steps (GUI-first)

1. Create a new empty repo on GitHub called `product-pros-cons` (do not add README).
2. Install GitHub Desktop and sign in.
3. Clone the empty repo to a local folder.
4. Run GitHub Copilot Agent and paste the master prompt (see next section) to generate files into that local folder.
5. In GitHub Desktop, review changed files, commit with message `chore: scaffold product-pros-cons`, and push to origin.
6. Load unpacked extension into Chrome and run the non-technical tests above.

---

## 15 — Troubleshooting / logs to collect

- Crawling page failure: copy `PPC: CRAWL-ERR - <error message>` from background service worker console.
- Block/CAPTCHA: copy the exact HTML snapshot of the page (console or save as HTML) and `PPC: BLOCK-DETECTED - <reason>`.
- Gemini response errors: copy `PPC: GEMINI-ERR` logs including request id and prompt hash.
