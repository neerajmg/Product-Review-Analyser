/*
 * Product Pros/Cons Extractor — Safe Deep Crawl Edition
 * Background Service Worker (scaffold)
 * SPEC SOURCE: build_instructions.md (authoritative)
 * NOTE: This is an initial scaffold. Deep crawl controller & full Gemini integration
 * will be implemented after user confirmation (see commit process).
 */

// =============================
// Section: Constants & Settings
// =============================
const PPC_EXT_VERSION = '0.1.0';
const CRAWL_DEFAULT_DELAY_MS = 1200; // mean
const CRAWL_JITTER_MS = 300; // ± jitter
const CRAWL_MIN_DELAY_MS = 500; // enforced minimum
const GEMINI_RATE_LIMIT_MS = 3000; // at most one request / 3s
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Storage keys
const STORAGE_KEYS = {
  OPTIONS: 'ppc_options',
  CRAWL_STATE: 'ppc_crawl_state',
  CACHE: 'ppc_cache',
  KEY_HEALTH: 'ppc_key_health'
};

// In-memory rate limit tracker
let lastGeminiRequestTs = 0;
let keyHealthCache = null; // ephemeral copy

// =============================
// Utility Functions
// =============================
/**
 * Sleep with jitter respecting minimum delay.
 * @param {number} baseMs
 */
function sleepPolite(baseMs = CRAWL_DEFAULT_DELAY_MS) {
  const jitter = (Math.random() * 2 - 1) * CRAWL_JITTER_MS; // ±
  let delay = Math.max(CRAWL_MIN_DELAY_MS, Math.round(baseMs + jitter));
  console.log('PPC: DELAY-JITTER ms=' + delay);
  return new Promise(res => setTimeout(res, delay));
}

/**
 * @param {string} text
 * @returns {Promise<string>} SHA-256 hex
 */
async function sha256(text) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute cache key as sha256(url + sortedReviewHashes)
 * @param {string} url
 * @param {Array<object>} reviews
 */
async function computeCacheKey(url, reviews) {
  const hashes = await Promise.all(reviews.map(r => sha256(r.text || '')));
  hashes.sort();
  return sha256(url + hashes.join(''));
}

/**
 * Load extension options from storage.
 */
function loadOptions() {
  return new Promise(resolve => {
    chrome.storage.sync.get(STORAGE_KEYS.OPTIONS, data => {
      resolve(Object.assign({
        fallbackMode: true,
        maxPagesDefault: 100,
        apiKey: '', // never exposed to content script
      }, data[STORAGE_KEYS.OPTIONS] || {}));
    });
  });
}

/** Save options */
function saveOptions(opts) {
  return new Promise(resolve => {
    chrome.storage.sync.set({ [STORAGE_KEYS.OPTIONS]: opts }, resolve);
  });
}

/** Get / set cache */
function getCache() {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEYS.CACHE, data => {
      resolve(data[STORAGE_KEYS.CACHE] || {});
    });
  });
}
function setCache(cache) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_KEYS.CACHE]: cache }, resolve);
  });
}

function getKeyHealth() {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEYS.KEY_HEALTH, d => resolve(d[STORAGE_KEYS.KEY_HEALTH] || null));
  });
}
function setKeyHealth(h) {
  keyHealthCache = h;
  return new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_KEYS.KEY_HEALTH]: h }, () => resolve());
  });
}

/**
 * PII redaction: remove emails, phone numbers, obvious names (basic heuristic placeholder)
 * @param {string} text
 */
function redactPII(text) {
  if (!text) return text;
  let red = text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\b\+?\d[\d\s().-]{7,}\b/g, '[REDACTED_PHONE]');
  // Heuristic: sequences of 2-3 capitalized words (possible names) -> [REDACTED_NAME]
  red = red.replace(/\b([A-Z][a-z]{2,})(\s+[A-Z][a-z]{2,}){0,2}\b/g, m => '[REDACTED_NAME]');
  return red;
}

// =============================
// Mock Gemini Integration
// =============================
/**
 * MOCKED Gemini summarizer per spec. Returns plausible JSON.
 * This function MUST NOT perform network during scaffold.
 * @param {Array<object>} reviews - [{id, text, rating?}]
 */
async function rewriteWithGemini(reviews) {
  console.log('PPC: GEMINI-REQ (mock) - reviewCount=', reviews.length);
  // Simple frequency heuristic for mock: pick frequent words > 5 chars
  const freq = new Map();
  for (const r of reviews) {
    const words = (r.text || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 5);
    const unique = new Set(words);
    for (const w of unique) freq.set(w, (freq.get(w) || 0) + 1);
  }
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const mid = Math.ceil(sorted.length / 2);
  const pros = sorted.slice(0, mid).map(([label, count], i) => ({ label, support_count: count, example_ids: reviews.slice(i, i+2).map(r => r.id).filter(Boolean) }));
  const cons = sorted.slice(mid).map(([label, count], i) => ({ label, support_count: count, example_ids: reviews.slice(i, i+1).map(r => r.id).filter(Boolean) }));
  const result = { pros, cons, note_pros: pros.length ? '' : 'No pros found', note_cons: cons.length ? '' : 'No cons found' };
  console.log('PPC: GEMINI-RESP (mock)', result);
  return result;
}

/*
 Real Gemini Flash 2.0 call TEMPLATE (commented per spec; user must supply API key in Options):

async function rewriteWithGeminiReal(reviews, site) {
  const options = await loadOptions();
  const apiKey = options.apiKey; // stored in chrome.storage.sync
  if (!apiKey) throw new Error('No API key');
  // Build strict prompt (see spec section 5)
  const masterPrompt = `You are a fact-based summarizer. Use ONLY the following review texts (no external knowledge). Identify distinct pros and cons that are actually present in the reviews.\n\nInput:\nSite: ${site}\nReviews: ${JSON.stringify(reviews)}\n\nRules:\n1) Do NOT invent facts or claims. Only use exact content from the review texts.\n2) For each pro or con, provide a short label (<= 8 words) and a support_count (how many reviews clearly support it).\n3) If support_count is 0 for positives, set "pros": [] and include "note_pros": "No pros found".\n4) If no negative feedback is found, set "cons": [] and include "note_cons": "No cons found".\n5) Output must be valid JSON ONLY, with this schema:\n\n{\n  "pros": [{"label":"...", "support_count": N, "example_ids":["r34","r72"]}, ...],\n  "cons": [{"label":"...", "support_count": M, "example_ids":["r21"]}, ...],\n  "note_pros": "No pros found" | "",\n  "note_cons": "No cons found" | ""\n}\n\nProvide up to 8 pros and up to 8 cons, ordered by support_count descending.`;
  const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: masterPrompt }] }] })
  });
  if (!resp.ok) throw new Error('Gemini API failure ' + resp.status);
  const data = await resp.json();
  // TODO: parse and validate JSON-only output per strict schema.
  return parsed; // object with pros, cons, note_pros, note_cons
}
*/

// =============================
// Local Fallback Summarizer
// =============================
/** Deterministic summarizer using n-gram frequency buckets */
function localFallback(reviews) {
  console.log('PPC: FALLBACK-SUMMARIZE start');
  const counts = new Map();
  for (const r of reviews) {
    const tokens = (r.text || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 4);
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = tokens[i] + ' ' + tokens[i + 1];
      counts.set(bigram, (counts.get(bigram) || 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const half = Math.ceil(top.length / 2);
  const pros = top.slice(0, half).map(([label, c]) => ({ label, support_count: c, example_ids: [] }));
  const cons = top.slice(half).map(([label, c]) => ({ label, support_count: c, example_ids: [] }));
  return { pros, cons, note_pros: pros.length ? '' : 'No pros found', note_cons: cons.length ? '' : 'No cons found' };
}

// =============================
// Caching Helpers
// =============================
async function getCachedSummary(key) {
  const cache = await getCache();
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  console.log('PPC: CACHE-HIT', key);
  return entry.data;
}
async function setCachedSummary(key, data) {
  const cache = await getCache();
  cache[key] = { ts: Date.now(), data };
  await setCache(cache);
  console.log('PPC: CACHE-STORE', key);
}

// =============================
// Single-page Analyze (scaffold)
// =============================
async function analyzeCurrentTab(tabId) {
  console.log('PPC: ANALYZE-START tab', tabId);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('Active tab not found');
  const url = tab.url || '';

  // Ask content script to extract (new structured response)
  const pageData = await chrome.tabs.sendMessage(tab.id, { type: 'PPC_EXTRACT_PAGE' });
  const extracted = (pageData && pageData.reviews) || [];
  const sanitized = extracted.map(r => ({ ...r, text: redactPII(r.text || '') }));
  const cacheKey = await computeCacheKey(url, sanitized);
  let summary = await getCachedSummary(cacheKey);
  if (!summary) {
    console.log('PPC: CACHE-MISS', cacheKey);
    const opts = await loadOptions();
    if (opts.fallbackMode) {
      summary = localFallback(sanitized);
    } else {
      // Rate limit
      const wait = Date.now() - lastGeminiRequestTs;
      if (wait < GEMINI_RATE_LIMIT_MS) await new Promise(res => setTimeout(res, GEMINI_RATE_LIMIT_MS - wait));
      lastGeminiRequestTs = Date.now();
      summary = await rewriteWithGemini(sanitized); // mock for now
    }
    await setCachedSummary(cacheKey, summary);
  }
  return { summary, reviewCount: sanitized.length };
}

// =============================
// Deep Crawl Controller (Placeholder)
// =============================
/*
 * Deep Crawl (phase 1):
 *  - robots.txt fetch & evaluation
 *  - consent modal orchestration
 *  - state initialization (but not full multi-page loop yet)
 * Subsequent commit will add sequential navigation, resume & anti-bot stop logic.
 */

/** Fetch and evaluate robots.txt for current tab URL */
async function evaluateRobotsTxt(pageUrl) {
  try {
    const u = new URL(pageUrl);
    const robotsUrl = `${u.origin}/robots.txt`;
    const resp = await fetch(robotsUrl, { method: 'GET' });
    if (!resp.ok) throw new Error('robots.txt status ' + resp.status);
    const body = await resp.text();
    // Very lightweight disallow check: if any Disallow line (not empty) is a prefix of path
    const lines = body.split(/\r?\n/);
    let disallowed = false;
    const path = u.pathname;
    for (const line of lines) {
      const m = line.match(/^Disallow:\s*(\S*)/i);
      if (m) {
        const rule = m[1].trim();
        if (rule && rule !== '/' && path.startsWith(rule)) {
          disallowed = true; break;
        } else if (rule === '/' && path.length > 1) {
          // site-wide disallow
          disallowed = true; break;
        }
      }
    }
    return { ok: true, disallowed, snippet: body.slice(0, 500) };
  } catch (e) {
    console.warn('PPC: ROBOTS-ERR', e.message);
    return { ok: false, error: e.message, disallowed: false };
  }
}

/** Initialize crawl state in storage */
async function initCrawlState(startUrl, maxPages, consent) {
  const state = {
    sessionId: 'sess_' + Math.random().toString(36).slice(2, 10),
    startUrl,
    currentUrl: startUrl,
    maxPages,
    pagesCrawled: 0,
    aggregatedReviews: [],
    finished: false,
    cancelled: false,
    consent,
    createdAt: Date.now()
  };
  await new Promise(r => chrome.storage.local.set({ [STORAGE_KEYS.CRAWL_STATE]: state }, r));
  console.log('PPC: CRAWL-STATE-INIT', state.sessionId, 'maxPages', maxPages);
  return state;
}

async function getCrawlState() {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEYS.CRAWL_STATE, d => resolve(d[STORAGE_KEYS.CRAWL_STATE] || null));
  });
}

async function updateCrawlState(patch) {
  const current = await getCrawlState();
  if (!current) return null;
  Object.assign(current, patch);
  await new Promise(r => chrome.storage.local.set({ [STORAGE_KEYS.CRAWL_STATE]: current }, r));
  return current;
}

/** Orchestrate showing consent modal: fetch robots then tell content script */
async function showDeepCrawlConsent(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const robots = await evaluateRobotsTxt(tab.url || '');
  await chrome.tabs.sendMessage(tabId, { type: 'PPC_SHOW_DEEP_CRAWL_MODAL', robots });
}

// Placeholder for upcoming full crawl loop
async function startDeepCrawlProcess(tabId, maxPages) {
  const tab = await chrome.tabs.get(tabId);
  const consent = await getCrawlState(); // not used yet
  // Future commit: implement navigation & extraction loop
  console.log('PPC: CRAWL-START (placeholder loop) target=', tab.url, 'maxPages', maxPages);
}

// =============================
// Deep Crawl (phase 2): sequential navigation & resume
// =============================

async function resumeOrStartIfActive(tabId) {
  const state = await getCrawlState();
  if (state && !state.finished && !state.cancelled) {
    console.log('PPC: CRAWL-RESUME session', state.sessionId);
    chrome.tabs.sendMessage(tabId, { type: 'PPC_CRAWL_PROGRESS', pagesCrawled: state.pagesCrawled, maxPages: state.maxPages, status: 'Resuming…', sessionId: state.sessionId });
    runDeepCrawlLoop(tabId);
    return true;
  }
  return false;
}

async function summarizeAggregated(state, forceRefresh = false) {
  const url = state.startUrl;
  const sanitized = state.aggregatedReviews.map(r => ({ ...r, text: redactPII(r.text || '') }));
  const cacheKey = await computeCacheKey(url, sanitized);
  let summary = forceRefresh ? null : await getCachedSummary(cacheKey);
  if (!summary) {
    console.log('PPC: CACHE-MISS', cacheKey, 'aggregated pages', state.pagesCrawled);
    const opts = await loadOptions();
    if (opts.fallbackMode) {
      summary = localFallback(sanitized);
    } else {
      const wait = Date.now() - lastGeminiRequestTs;
      if (wait < GEMINI_RATE_LIMIT_MS) await new Promise(r => setTimeout(r, GEMINI_RATE_LIMIT_MS - wait));
      lastGeminiRequestTs = Date.now();
      summary = await rewriteWithGemini(sanitized); // still mock
    }
    await setCachedSummary(cacheKey, summary);
  } else {
    console.log('PPC: CACHE-HIT aggregated summary');
  }
  return summary;
}

async function finalizeCrawl(reason = 'completed', forceRefresh = false) {
  let state = await getCrawlState();
  if (!state) return;
  if (!state.finished || forceRefresh) {
    const previousSummary = state.summary || null;
    const summary = await summarizeAggregated(state, forceRefresh);
    state = await updateCrawlState({ finished: true, finishedReason: reason, summary, previousSummary });
    // Send results overlay
    notifyActiveTab({ type: 'PPC_CRAWL_FINISHED', sessionId: state.sessionId, summary, reason });
  } else if (state.summary) {
    notifyActiveTab({ type: 'PPC_CRAWL_FINISHED', sessionId: state.sessionId, summary: state.summary, reason: state.finishedReason });
  }
}

function waitForTabLoad(tabId, targetUrl) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Navigation timeout'));
    }, 30000);
    function listener(changedTabId, info, tab) {
      if (changedTabId === tabId && info.status === 'complete') {
        if (!targetUrl || (tab.url && tab.url.startsWith(targetUrl.split('#')[0]))) {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function notifyActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, message); // fire & forget
  });
}

async function runDeepCrawlLoop(tabId) {
  let state = await getCrawlState();
  if (!state) return;
  if (state.running) return; // prevent reentry
  state = await updateCrawlState({ running: true });
  try {
    while (true) {
      state = await getCrawlState();
      if (!state || state.cancelled) { console.log('PPC: CRAWL-CANCELLED'); await finalizeCrawl('cancelled'); return; }
      if (state.finished) { console.log('PPC: CRAWL-ALREADY-FINISHED'); return; }
      if (state.pagesCrawled >= state.maxPages) { console.log('PPC: CRAWL-MAX-PAGES'); await finalizeCrawl('limit'); return; }
      const currentUrl = state.pagesCrawled === 0 ? state.startUrl : state.currentUrl;
      const tab = await chrome.tabs.get(tabId);
      if (tab.url !== currentUrl) {
        await chrome.tabs.update(tabId, { url: currentUrl });
        await waitForTabLoad(tabId, currentUrl);
      } else {
        // ensure full load
        await sleepPolite(600);
      }
      // Extract page with retry/backoff
      let attempt = 0; let pageData = null; let lastErr = null;
      while (attempt < 3) {
        try {
          pageData = await chrome.tabs.sendMessage(tabId, { type: 'PPC_EXTRACT_PAGE' });
          if (!pageData) throw new Error('No extraction response');
          break;
        } catch (ex) {
          lastErr = ex;
          attempt++;
          const backoff = Math.min(2000, 300 * Math.pow(2, attempt));
          console.log('PPC: CRAWL-RETRY attempt=' + attempt + ' backoff=' + backoff);
          await new Promise(r => setTimeout(r, backoff));
        }
      }
      if (!pageData) throw lastErr || new Error('Extraction failed all retries');
      const { reviews = [], nextPageUrl, captchaDetected, blocked, error } = pageData;
      if (error) console.warn('PPC: CRAWL-PAGE-ERR', error);
      if (captchaDetected || blocked) {
        console.warn('PPC: BLOCK-DETECTED', { captchaDetected, blocked });
        state = await updateCrawlState({ finished: true, finishedReason: captchaDetected ? 'captcha' : 'blocked' , running:false });
        await finalizeCrawl(captchaDetected ? 'captcha' : 'blocked');
        return;
      }
      // Deduplicate by id
      const existingIds = new Set(state.aggregatedReviews.map(r => r.id));
      const newOnes = reviews.filter(r => r.id && !existingIds.has(r.id));
      const agg = state.aggregatedReviews.concat(newOnes);
      const pagesCrawled = state.pagesCrawled + 1;
      state = await updateCrawlState({ aggregatedReviews: agg, pagesCrawled, currentUrl: nextPageUrl || null });
      chrome.tabs.sendMessage(tabId, { type: 'PPC_CRAWL_PROGRESS', pagesCrawled, maxPages: state.maxPages, status: 'Crawled page', sessionId: state.sessionId });
      if (!nextPageUrl) {
        await finalizeCrawl('end-of-pages');
        return;
      }
      await sleepPolite();
    }
  } catch (e) {
    console.error('PPC: CRAWL-ERR', e.message);
    await finalizeCrawl('error');
  } finally {
    await updateCrawlState({ running: false });
  }
}

// =============================
// API Key Validation & Health Monitoring
// =============================
/**
 * Validate Gemini API key by calling lightweight models list (pageSize=1) endpoint.
 * @param {string} apiKey
 * @returns {Promise<{status:string,message:string,checkedAt:number}>>}
 */
async function validateApiKey(apiKey) {
  if (!apiKey) return { status: 'missing', message: 'No key saved', checkedAt: Date.now() };
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=' + encodeURIComponent(apiKey);
    const resp = await fetch(url, { method: 'GET' });
    if (resp.ok) {
      return { status: 'valid', message: 'Key validated', checkedAt: Date.now() };
    }
    let errJson = null;
    try { errJson = await resp.json(); } catch(_) {}
    const code = errJson?.error?.code;
    const status = errJson?.error?.status || '';
    if (status === 'RESOURCE_EXHAUSTED') return { status: 'quota_exhausted', message: 'Quota / credits exhausted', checkedAt: Date.now() };
    if (status === 'UNAUTHENTICATED' || status === 'PERMISSION_DENIED') return { status: 'invalid', message: 'Invalid or expired key', checkedAt: Date.now() };
    return { status: 'error', message: 'API error ' + (status || code || resp.status), checkedAt: Date.now() };
  } catch (e) {
    return { status: 'network_error', message: e.message, checkedAt: Date.now() };
  }
}

async function updateKeyHealthAndNotify(trigger) {
  const opts = await loadOptions();
  if (!opts.apiKey) {
    const h = { status: 'missing', message: 'No key saved', checkedAt: Date.now(), trigger };
    await setKeyHealth(h); return h;
  }
  const h = await validateApiKey(opts.apiKey);
  h.trigger = trigger;
  await setKeyHealth(h);
  if (['invalid','quota_exhausted','error'].includes(h.status)) {
    // Badge + toast
    try { chrome.action.setBadgeText({ text: '!' }); chrome.action.setBadgeBackgroundColor({ color: '#b91c1c' }); } catch(_){}
    notifyActiveTab({ type: 'PPC_KEY_HEALTH_ALERT', health: h });
  } else if (h.status === 'valid') {
    try { chrome.action.setBadgeText({ text: '' }); } catch(_){ }
  }
  return h;
}

function scheduleKeyHealthAlarm() {
  try { chrome.alarms.clear('ppc_key_health'); } catch(_){}
  // Every 6 hours
  chrome.alarms.create('ppc_key_health', { periodInMinutes: 360 });
}

chrome.alarms?.onAlarm.addListener(a => {
  if (a.name === 'ppc_key_health') {
    updateKeyHealthAndNotify('alarm');
  }
});

// Run once on SW startup
scheduleKeyHealthAlarm();
updateKeyHealthAndNotify('startup');

// =============================
// Message Handling
// =============================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'PPC_ANALYZE_SINGLE_PAGE') {
        const result = await analyzeCurrentTab(sender.tab?.id);
        sendResponse({ ok: true, result });
      } else if (msg.type === 'PPC_INIT_DEEP_CRAWL') {
        // Trigger consent modal after robots check
        await showDeepCrawlConsent(sender.tab.id);
        sendResponse({ ok: true });
      } else if (msg.type === 'PPC_DEEP_CRAWL_CONSENT') {
        if (msg.cancel) {
          const state = await getCrawlState();
            if (state && !state.finished) {
              await updateCrawlState({ cancelled: true });
              await finalizeCrawl('cancelled');
            }
            sendResponse({ ok: true, cancelled: true });
        } else {
          const { maxPages, consent } = msg;
          const tab = await chrome.tabs.get(sender.tab.id);
          await initCrawlState(tab.url, maxPages, consent);
          // Immediately show progress overlay
          chrome.tabs.sendMessage(sender.tab.id, { type: 'PPC_CRAWL_PROGRESS', pagesCrawled:0, maxPages, status:'Starting…' });
          runDeepCrawlLoop(sender.tab.id);
          sendResponse({ ok: true });
        }
      } else if (msg.type === 'PPC_REFRESH_CRAWL_SUMMARY') {
        const state = await getCrawlState();
        if (!state) return sendResponse({ ok:false, error:'No crawl state' });
        await finalizeCrawl(state.finishedReason || 'completed', true);
        sendResponse({ ok: true, refreshed: true });
      } else if (msg.type === 'PPC_CANCEL_CRAWL') {
        const state = await getCrawlState();
        if (state && !state.finished) {
          await updateCrawlState({ cancelled: true });
          await finalizeCrawl('cancelled');
        }
        sendResponse({ ok: true, cancelled: true });
      } else if (msg.type === 'PPC_UNDO_SUMMARY') {
        let state = await getCrawlState();
        if (!state || !state.previousSummary) return sendResponse({ ok:false, error:'No previous summary' });
        // swap summaries
        const current = state.summary;
        state = await updateCrawlState({ summary: state.previousSummary, previousSummary: current });
        notifyActiveTab({ type: 'PPC_CRAWL_FINISHED', sessionId: state.sessionId, summary: state.summary, reason: state.finishedReason + ' (undo)' });
        sendResponse({ ok:true, undone:true });
      } else if (msg.type === 'PPC_SAVE_OPTIONS') {
        await saveOptions(msg.payload);
        sendResponse({ ok: true });
      } else if (msg.type === 'PPC_GET_OPTIONS') {
        const opts = await loadOptions();
        sendResponse({ ok: true, options: opts });
      } else if (msg.type === 'PPC_TEST_KEY') {
        const key = msg.apiKey || (await loadOptions()).apiKey;
        if (!key || key.trim().length < 20) {
          sendResponse({ ok:false, message:'Key looks too short or missing.' });
          return;
        }
        const result = await validateApiKey(key.trim());
        await setKeyHealth(result);
        sendResponse({ ok: result.status === 'valid', health: result, message: result.message });
      } else if (msg.type === 'PPC_GET_KEY_HEALTH') {
        const h = await getKeyHealth();
        sendResponse({ ok:true, health: h });
      } else if (msg.type === 'PPC_FORCE_KEY_RECHECK') {
        const h = await updateKeyHealthAndNotify('manual');
        sendResponse({ ok:true, health: h });
      }
    } catch (e) {
      console.error('PPC: BG-ERR', e);
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // async
});

console.log('PPC: BACKGROUND LOADED v' + PPC_EXT_VERSION);
