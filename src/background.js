/*
 * Product Pros/Cons Extractor — Background Service Worker
 * Restored after refactor: constants & utility functions + Gemini integration.
 */

import { generateSummary, validateKey, PROVIDERS } from './lib/ai_client.js';
import { validateAgainstSchema, coerceAndClean, extractFirstJsonBlock, sampleReviewsForPrompt, mockRewriteWithGemini, localFallback, heuristicAspectSummary } from './lib/summary_utils.js';

// =============================
// Section: Constants & Settings
// =============================
const PPC_EXT_VERSION = '0.1.0';
const CRAWL_DEFAULT_DELAY_MS = 1200; // mean
const CRAWL_JITTER_MS = 300; // ± jitter
const CRAWL_MIN_DELAY_MS = 500; // enforced minimum
const GEMINI_RATE_LIMIT_MS = 3000; // at most one request / 3s
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// Dynamic caps (user configurable via options). The fixed constant is replaced by defaults.
const DEFAULT_MAX_PAGES_CAP = 60; // user can adjust 5–100
const DEFAULT_MAX_REVIEW_COUNT = 1200; // user can adjust 200–2500

// Storage keys
const STORAGE_KEYS = {
  OPTIONS: 'ppc_options',
  CRAWL_STATE: 'ppc_crawl_state',
  CACHE: 'ppc_cache',
  KEY_HEALTH: 'ppc_key_health',
  GLOBAL_CONSENT: 'ppc_global_consent'
};

// In-memory trackers
let lastGeminiRequestTs = 0;
let keyHealthCache = null;

// =============================
// Utility Functions
// =============================
function sleepPolite(baseMs = CRAWL_DEFAULT_DELAY_MS) {
  const jitter = (Math.random() * 2 - 1) * CRAWL_JITTER_MS;
  const delay = Math.max(CRAWL_MIN_DELAY_MS, Math.round(baseMs + jitter));
  return new Promise(res => setTimeout(res, delay));
}

async function sha256(text) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function computeCacheKey(url, reviews) {
  const hashes = await Promise.all(reviews.map(r => sha256(r.text || '')));
  hashes.sort();
  return sha256(url + hashes.join(''));
}

function loadOptions() {
  return new Promise(resolve => {
    chrome.storage.sync.get(STORAGE_KEYS.OPTIONS, data => {
      resolve(Object.assign({
        fallbackMode: true,
        apiKey: '',
        aiProvider: 'gemini',
        maxPagesCap: DEFAULT_MAX_PAGES_CAP,
        maxReviewCount: DEFAULT_MAX_REVIEW_COUNT
      }, data[STORAGE_KEYS.OPTIONS] || {}));
    });
  });
}

function computeMaxPages(opts){
  let v = parseInt(opts?.maxPagesCap,10);
  if (isNaN(v)) v = DEFAULT_MAX_PAGES_CAP;
  v = Math.max(5, Math.min(100, v));
  return v;
}
function computeMaxReviewCount(opts){
  let v = parseInt(opts?.maxReviewCount,10);
  if (isNaN(v)) v = DEFAULT_MAX_REVIEW_COUNT;
  v = Math.max(200, Math.min(2500, v));
  return v;
}
function saveOptions(opts) { return new Promise(r => chrome.storage.sync.set({ [STORAGE_KEYS.OPTIONS]: opts }, r)); }

function getCache() { return new Promise(r => chrome.storage.local.get(STORAGE_KEYS.CACHE, d => r(d[STORAGE_KEYS.CACHE] || {}))); }
function setCache(obj) { return new Promise(r => chrome.storage.local.set({ [STORAGE_KEYS.CACHE]: obj }, r)); }

function getKeyHealth() { return new Promise(r => chrome.storage.local.get(STORAGE_KEYS.KEY_HEALTH, d => r(d[STORAGE_KEYS.KEY_HEALTH] || null))); }
function setKeyHealth(h) { keyHealthCache = h; return new Promise(r => chrome.storage.local.set({ [STORAGE_KEYS.KEY_HEALTH]: h }, r)); }

function getGlobalConsent() {
  return new Promise(r => chrome.storage.local.get(STORAGE_KEYS.GLOBAL_CONSENT, d => r(d[STORAGE_KEYS.GLOBAL_CONSENT] || null)));
}
function setGlobalConsent(obj) { return new Promise(r => chrome.storage.local.set({ [STORAGE_KEYS.GLOBAL_CONSENT]: obj }, r)); }

function redactPII(text) {
  if (!text) return text;
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\b\+?\d[\d\s().-]{7,}\b/g, '[REDACTED_PHONE]')
    .replace(/\b([A-Z][a-z]{2,})(\s+[A-Z][a-z]{2,}){0,2}\b/g, '[REDACTED_NAME]');
}

async function realRewriteWithGemini(fullReviews, site) {
  const opts = await loadOptions();
  const apiKey = opts.apiKey;
  if (!apiKey) throw new Error('No API key');
  const now = Date.now();
  if (now - lastGeminiRequestTs < GEMINI_RATE_LIMIT_MS) {
    const wait = GEMINI_RATE_LIMIT_MS - (now - lastGeminiRequestTs);
    console.log('PPC: GEMINI-RATELIMIT sleeping', wait);
    await new Promise(r => setTimeout(r, wait));
  }
  lastGeminiRequestTs = Date.now();
  const sampled = sampleReviewsForPrompt(fullReviews);
  const promptObj = { site, reviews: sampled };
  const schemaDescription = `{
  "pros": [ { "label": string, "support_count": number, "example_ids": [string] } ],
  "cons": [ { "label": string, "support_count": number, "example_ids": [string] } ],
  "note_pros": string,
  "note_cons": string
}`;
  const systemPrompt = `You are an assistant that extracts product ASPECTS from user reviews and produces ONLY JSON (no markdown). Each aspect label must be a concise noun phrase (e.g. "battery life", "build quality", "noise level", "customer support"). Do NOT use placeholders like 'product', 'name', 'brand', 'redacted'. Merge duplicates. Limit to top 8 pros and 8 cons.`;
  const userPrompt = `SOURCE SITE: ${site || 'unknown'}\nTASK: From the provided review objects, create summarised pros and cons focusing on tangible aspects or experience qualities. Decide whether an aspect is a pro or a con based on sentiment (ratings & wording). If both positive and negative feedback exist for an aspect, place it where the majority sentiment lies (break ties by rating average).\nRULES:\n- support_count is how many DISTINCT reviews (by id) back that aspect\n- example_ids: up to 3 representative review ids that mention it\n- Exclude overly generic tokens (product, item, purchase, amazon, delivery) unless directly critiqued (e.g. 'delivery delay')\n- Prefer multi-word phrases over single adjectives\n- NEVER fabricate aspects not found in text\n- If no pros or cons, return empty arrays and notes explaining absence.\nSCHEMA: ${schemaDescription}\nINPUT_REVIEWS_JSON: ${JSON.stringify(promptObj)}\nReturn ONLY raw JSON.`;
  const body = { contents: [ { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] } ], generationConfig:{ temperature:0.2, topK:32, topP:0.9 } };
  const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + encodeURIComponent(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Gemini API failure ' + resp.status);
  const data = await resp.json();
  // Attempt to extract text field(s)
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => p.text || '').join('\n');
  const jsonBlock = extractFirstJsonBlock(text);
  if (!jsonBlock) throw new Error('No JSON block in model response');
  let parsed; try { parsed = JSON.parse(jsonBlock); } catch(e){ throw new Error('Invalid JSON parse'); }
  if (!validateAgainstSchema(parsed)) throw new Error('Schema validation failed');
  return coerceAndClean(parsed);
}

async function rewriteWithGemini(reviews, site='') {
  const opts = await loadOptions();
  if (opts.fallbackMode || !opts.apiKey) {
    // Enhanced heuristic aspect summary instead of naive frequency
    return heuristicAspectSummary(reviews);
  }
  try {
    const sampled = sampleReviewsForPrompt(reviews);
    const schemaDescription = `{
  "pros": [ { "label": string, "support_count": number, "example_ids": [string] } ],
  "cons": [ { "label": string, "support_count": number, "example_ids": [string] } ],
  "note_pros": string,
  "note_cons": string
}`;
    const systemPrompt = `You are an assistant that extracts product ASPECTS from user reviews and produces ONLY JSON (no markdown). Each aspect label must be a concise noun phrase (e.g. "battery life", "build quality", "noise level", "customer support"). Do NOT use placeholders like 'product', 'name', 'brand', 'redacted'. Merge duplicates. Limit to top 8 pros and 8 cons.`;
    const userPrompt = `SOURCE SITE: ${site || 'unknown'}\nTASK: From the provided review objects, create summarised pros and cons focusing on tangible aspects or experience qualities. Decide whether an aspect is a pro or a con based on sentiment (ratings & wording). If both positive and negative feedback exist for an aspect, place it where the majority sentiment lies (break ties by rating average).\nRULES:\n- support_count is how many DISTINCT reviews (by id) back that aspect\n- example_ids: up to 3 representative review ids that mention it\n- Exclude overly generic tokens (product, item, purchase, amazon, delivery) unless directly critiqued (e.g. 'delivery delay')\n- Prefer multi-word phrases over single adjectives\n- NEVER fabricate aspects not found in text\n- If no pros or cons, return empty arrays and notes explaining absence.\nSCHEMA: ${schemaDescription}\nINPUT_REVIEWS_JSON: ${JSON.stringify({ reviews: sampled })}\nReturn ONLY raw JSON.`;

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const summaryJson = await generateSummary(opts.aiProvider || 'gemini', opts.apiKey, fullPrompt);
    if (!summaryJson) {
        throw new Error("Received empty response from Gemini");
    }
    console.log('PPC_DEBUG: Raw AI response:', summaryJson);
    const parsed = JSON.parse(summaryJson);
    console.log('PPC_DEBUG: Parsed JSON:', parsed);
    if (!validateAgainstSchema(parsed)) {
        console.error('PPC_DEBUG: Schema validation failed. Expected keys:', ['pros', 'cons', 'note_pros', 'note_cons']);
        console.error('PPC_DEBUG: Actual object keys:', Object.keys(parsed));
        throw new Error("Gemini response failed schema validation");
    }
    return coerceAndClean(parsed);
  } catch (e) {
    console.warn('PPC: GEMINI real failed, falling back', e.message);
    return heuristicAspectSummary(reviews);
  }
}

// localFallback imported

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
  // Real Gemini integration (or mock fallback) selected inside rewriteWithGemini based on options
  summary = await rewriteWithGemini(sanitized);
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
  const opts = await loadOptions();
  const maxPagesCap = computeMaxPages(opts);
  await chrome.tabs.sendMessage(tabId, { type: 'PPC_SHOW_DEEP_CRAWL_MODAL', robots, maxPagesCap });
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
  // Real Gemini integration (or mock fallback) selected within rewriteWithGemini
  summary = await rewriteWithGemini(sanitized);
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
      // Stagnation detection: if nextPageUrl points to same as current or no new reviews added twice, stop.
      let normalizedNext = nextPageUrl ? nextPageUrl.split('#')[0] : null;
      const normalizedCurrent = currentUrl.split('#')[0];
      if (normalizedNext && normalizedNext === normalizedCurrent) {
        normalizedNext = null; // prevent infinite loop
      }
      state = await updateCrawlState({ aggregatedReviews: agg, pagesCrawled, currentUrl: normalizedNext || null });
      chrome.tabs.sendMessage(tabId, { type: 'PPC_CRAWL_PROGRESS', pagesCrawled, maxPages: state.maxPages, reviewCount: agg.length, status: 'Crawled page', sessionId: state.sessionId });
      // Review count cap early stop
      const opts = await loadOptions();
      const maxReviews = computeMaxReviewCount(opts);
      if (agg.length >= maxReviews) {
        console.log('PPC: CRAWL-REVIEW-CAP reached', agg.length, '/', maxReviews);
        await finalizeCrawl('review-cap');
        return;
      }
      const stagnated = newOnes.length === 0 && !normalizedNext;
      if (!normalizedNext || stagnated) {
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
 * Validate API key for the specified provider
 * @param {string} provider
 * @param {string} apiKey
 * @returns {Promise<{status:string,message:string,checkedAt:number}>>}
 */
async function validateApiKey(provider, apiKey) {
  if (!apiKey) return { status: 'missing', message: 'No key saved', checkedAt: Date.now() };
  if (!provider) provider = 'gemini'; // fallback
  
  try {
    const result = await validateKey(provider, apiKey);
    const checkedAt = Date.now();
    
    switch (result) {
      case 'VALID':
        return { status: 'valid', message: `${provider} key validated`, checkedAt };
      case 'INVALID':
        return { status: 'invalid', message: 'Invalid or expired key', checkedAt };
      case 'QUOTA_EXHAUSTED':
        return { status: 'quota_exhausted', message: 'Quota / credits exhausted', checkedAt };
      case 'ERROR':
      default:
        return { status: 'error', message: `API error with ${provider}`, checkedAt };
    }
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
  const h = await validateApiKey(opts.aiProvider || 'gemini', opts.apiKey);
  h.trigger = trigger;
  await setKeyHealth(h);
  if (['invalid','quota_exhausted','error'].includes(h.status)) {
    // Badge + toast
    try { chrome.action.setBadgeText({ text: '!' }); chrome.action.setBadgeBackgroundColor({ color: '#b91c1c' }); } catch(_){}
    notifyActiveTab({ type: 'PPC_KEY_HEALTH_ALERT', health: h });
  } else if (h.status === 'valid') {
    try { chrome.action.setBadgeText({ text: '' }); } catch(_){ }
  }
  // No longer recoloring icon; keep a consistent icon. Badge still used for errors.
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
async function ensureContentScript(tabId) {
  // Try a quick ping first
  try {
    await new Promise((res, rej) => {
      chrome.tabs.sendMessage(tabId, { type: 'PPC_PING' }, r => {
        if (chrome.runtime.lastError) return rej(new Error(chrome.runtime.lastError.message));
        res(r);
      });
    });
    return true; // already present
  } catch (_) {
    // Attempt injection
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content.js'] });
      // re-ping
      await new Promise((res, rej) => {
        chrome.tabs.sendMessage(tabId, { type: 'PPC_PING' }, r => {
          if (chrome.runtime.lastError) return rej(new Error(chrome.runtime.lastError.message));
          res(r);
        });
      });
      return true;
    } catch (e) {
      console.warn('PPC: ensureContentScript failed', e.message);
      return false;
    }
  }
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'PPC_ANALYZE_SINGLE_PAGE') {
        const result = await analyzeCurrentTab(sender.tab?.id);
        sendResponse({ ok: true, result });
      } else if (msg.type === 'PPC_INIT_DEEP_CRAWL') {
        // Trigger consent modal after robots check. Popup messages have no sender.tab.
        const tabId = sender.tab?.id || msg.tabId;
        if (!tabId) {
          sendResponse({ ok:false, error:'No tabId provided' });
          return;
        }
        const ok = await ensureContentScript(tabId);
        if (!ok) { sendResponse({ ok:false, error:'Could not inject content script' }); return; }
        // One-time global consent logic
        const globalConsent = await getGlobalConsent();
        // Always re-evaluate robots; if disallowed we still force modal even after global acceptance
        const tab = await chrome.tabs.get(tabId);
        const robots = await evaluateRobotsTxt(tab.url || '');
        if (globalConsent?.accepted && (!robots.disallowed || globalConsent.disallowAcknowledged)) {
          // Skip modal; start immediately
            const opts = await loadOptions();
            const maxPages = computeMaxPages(opts);
            await initCrawlState(tab.url, maxPages, { global:true, acceptedAt: globalConsent.acceptedAt, version: globalConsent.version||1 });
            chrome.tabs.sendMessage(tabId, { type: 'PPC_CRAWL_PROGRESS', pagesCrawled:0, maxPages, reviewCount:0, status:'Starting… (consent remembered)' });
            runDeepCrawlLoop(tabId);
            sendResponse({ ok:true, tabId, skippedModal:true });
        } else {
          await showDeepCrawlConsent(tabId);
          sendResponse({ ok: true, tabId, skippedModal:false });
        }
      } else if (msg.type === 'PPC_DEEP_CRAWL_CONSENT') {
        if (msg.cancel) {
          const state = await getCrawlState();
            if (state && !state.finished) {
              await updateCrawlState({ cancelled: true });
              await finalizeCrawl('cancelled');
            }
            sendResponse({ ok: true, cancelled: true });
        } else {
          const { consent, maxPages:requestedMaxPages } = msg;
          const tab = await chrome.tabs.get(sender.tab.id);
          const opts = await loadOptions();
          let maxPages = computeMaxPages(opts);
          // Allow user-sent value if smaller (user might intentionally reduce scope in future UI)
          if (requestedMaxPages && requestedMaxPages >=5 && requestedMaxPages <= maxPages) maxPages = requestedMaxPages;
          await initCrawlState(tab.url, maxPages, consent);
          // First-time acceptance -> persist global consent
          const existing = await getGlobalConsent();
          const disallowAck = !!consent.robotsDisallowed && !!consent.robotsAccepted;
          if (!existing) {
            await setGlobalConsent({ accepted:true, acceptedAt: Date.now(), version:1, disallowAcknowledged: disallowAck });
          } else if (disallowAck && !existing.disallowAcknowledged) {
            // Upgrade existing record to include disallow acknowledgement
            await setGlobalConsent({ ...existing, disallowAcknowledged: true });
          }
          // Immediately show progress overlay
          chrome.tabs.sendMessage(sender.tab.id, { type: 'PPC_CRAWL_PROGRESS', pagesCrawled:0, maxPages, reviewCount:0, status:'Starting…' });
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
      } else if (msg.type === 'PPC_STOP_AND_SUMMARIZE') {
        // User requested early stop with summary of pages crawled so far.
        const state = await getCrawlState();
        if (!state) { sendResponse({ ok:false, error:'No active crawl' }); return; }
        if (state.finished) { // Already finished, just echo existing summary
          await finalizeCrawl(state.finishedReason || 'completed');
          sendResponse({ ok:true, alreadyFinished:true });
          return;
        }
        // Mark as finished and summarize current aggregation.
        await finalizeCrawl('manual-stop');
        sendResponse({ ok:true, stopped:true });
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
        const opts = await loadOptions();
        const result = await validateApiKey(opts.aiProvider || 'gemini', key.trim());
        await setKeyHealth(result);
        sendResponse({ ok: result.status === 'valid', health: result, message: result.message });
      } else if (msg.type === 'PPC_GET_KEY_HEALTH') {
        const h = await getKeyHealth();
        sendResponse({ ok:true, health: h });
      } else if (msg.type === 'PPC_FORCE_KEY_RECHECK') {
        const h = await updateKeyHealthAndNotify('manual');
        sendResponse({ ok:true, health: h });
      } else if (msg.type === 'PPC_CLEAR_CACHE') {
        await setCache({});
        console.log('PPC: Cache cleared by user.');
        sendResponse({ ok: true });
      } else if (msg.type === 'PPC_CHECK_RATE_LIMIT') {
        const opts = await loadOptions();
        if (!opts.apiKey) {
          sendResponse({ ok: false, error: 'No API key configured' });
          return;
        }
        
        try {
          const provider = opts.aiProvider || 'gemini';
          const result = await validateKey(provider, opts.apiKey);
          let status = 'available';
          let nextRetryAfter = null;
          
          if (result === 'QUOTA_EXHAUSTED') {
            status = 'quota_exceeded';
          } else if (result === 'INVALID') {
            status = 'error';
          } else if (result === 'ERROR') {
            // Could be rate limiting, check if we're within rate limit window
            const timeSinceLastRequest = Date.now() - lastGeminiRequestTs;
            if (timeSinceLastRequest < GEMINI_RATE_LIMIT_MS) {
              status = 'rate_limited';
              nextRetryAfter = Math.ceil((GEMINI_RATE_LIMIT_MS - timeSinceLastRequest) / 1000);
            } else {
              status = 'error';
            }
          }
          
          sendResponse({ 
            ok: true, 
            status, 
            nextRetryAfter,
            lastRequestTime: lastGeminiRequestTs,
            rateLimitMs: GEMINI_RATE_LIMIT_MS
          });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      }
    } catch (e) {
      console.error('PPC: BG-ERR', e);
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // async
});

console.log('PPC: BACKGROUND LOADED v' + PPC_EXT_VERSION);
