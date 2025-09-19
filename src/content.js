/*
 * Content Script
 * Responsibilities:
 *  - Extract reviews from current page using selectors
 *  - Detect next page URL
 *  - Detect CAPTCHA / block indicators
 *  - Provide overlay injection helpers (later for deep crawl consent & results)
 * Scaffold version: Deep crawl modal & navigation implemented in later commits.
 */

// UMD-style access to selectors
// (selectors.js will attach window.PPCSelectors)

/** Simple heuristic checks for block / captcha */
function detectCaptchaOrBlock() {
  const html = document.body.innerText.toLowerCase();
  const captcha = /captcha|are you a human|select all images/i.test(html);
  const blocked = /access denied|temporarily unavailable/i.test(html);
  return { captchaDetected: captcha, blocked };
}

/** Find next page URL or "see all reviews" entry point */
function findNextPageUrl() {
  const current = location.href.split('#')[0];
  const onReviewListing = /\/product-reviews\//.test(current);
  // If NOT yet on the dedicated review listing, try to jump there once
  if (!onReviewListing) {
    const seeAll = document.querySelector('a[data-hook="see-all-reviews-link-foot"], a[data-hook="see-all-reviews-link"]')
      || [...document.querySelectorAll('a')].find(a => /see all reviews/i.test(a.textContent));
    if (seeAll && seeAll.href && seeAll.href.split('#')[0] !== current && /\/product-reviews\//.test(seeAll.href)) {
      return seeAll.href;
    }
  }
  // Standard next-page detection once on listing
  const relNext = document.querySelector('link[rel=next]');
  if (relNext && relNext.href && relNext.href.split('#')[0] !== current) return relNext.href;
  const aNext = document.querySelector('.a-pagination li.a-last:not(.a-disabled) a, .a-pagination li.a-next:not(.a-disabled) a');
  if (aNext && aNext.href && aNext.href.split('#')[0] !== current) return aNext.href;
  const genericNext = [...document.querySelectorAll('a')].find(a => /next/i.test(a.textContent) && a.href && a.href.split('#')[0] !== current);
  return genericNext ? genericNext.href : null;
}

/** Extract review data using selectors */
function extractReviewsOnPage() {
  const selectors = window.PPCSelectors;
  if (!selectors) {
    console.warn('PPC: selectors not loaded – attempting dynamic load');
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('src/selectors.js');
      script.onload = () => script.remove();
      document.documentElement.appendChild(script);
    } catch(_) {}
    // Fallback immediately this cycle; next extraction attempt should see PPCSelectors
    return heuristicFallbackExtract();
  }
  const arr = selectors.findReviewElements(document).map(el => ({
    id: el.getAttribute('id') || el.getAttribute('data-hook') || ('r' + Math.random().toString(36).slice(2, 9)),
    text: selectors.extractReviewText(el),
    rating: selectors.extractRating(el)
  }));
  if (!arr.length) {
    // fallback when custom selectors yield nothing (e.g., product detail first page not in review listing layout)
    return heuristicFallbackExtract();
  }
  return arr;
}

// Heuristic fallback for Amazon (and generic) if structured selectors absent
function heuristicFallbackExtract() {
  const results = [];
  // Main Amazon review blocks on review listing pages
  const blocks = document.querySelectorAll('div[data-hook="review"]');
  blocks.forEach(block => {
    const body = block.querySelector('[data-hook="review-body"]');
    const ratingEl = block.querySelector('[data-hook*="review-star-rating"], i.a-icon-star span');
    let rating = null;
    if (ratingEl) {
      const m = ratingEl.textContent.match(/([0-9]+(?:\.[0-9])?)/);
      if (m) rating = parseFloat(m[1]);
    }
    const text = (body && body.textContent.trim()) || '';
    if (text) results.push({ id: block.getAttribute('id') || ('r' + Math.random().toString(36).slice(2,9)), text, rating });
  });
  // Snippets on product detail page (top few preview reviews)
  if (!results.length) {
    const preview = document.querySelectorAll('#customerReviews div.review, div[data-hook="review-collapsed"]');
    preview.forEach(p => {
      const t = p.textContent.trim();
      if (t) results.push({ id: 'snip_' + Math.random().toString(36).slice(2,9), text: t, rating: null });
    });
  }
  return results;
}

// Ensure base styles (modal & overlay) present
function ensureBaseStyles(){
  if (document.getElementById('ppc_base_styles')) return;
  const style = document.createElement('style');
  style.id = 'ppc_base_styles';
  style.textContent = `
  .ppc-overlay{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;padding:60px 20px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}
  .ppc-panel{background:#fff;color:#111;border-radius:10px;padding:20px 24px;box-shadow:0 8px 28px -4px rgba(0,0,0,.35);max-width:760px;width:100%;max-height:80vh;overflow:auto;}
  .ppc-btn{background:#2563eb;color:#fff;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-size:13px;line-height:1.2;font-weight:500;}
  .ppc-btn:disabled{opacity:.4;cursor:not-allowed;}
  .ppc-pro{color:#065f46;}
  .ppc-con{color:#7f1d1d;}
  .ppc-key-toast{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}
  `;
  document.documentElement.appendChild(style);
}

// Listener for background or popup requests
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PPC_EXTRACT_PAGE') {
    try {
      const meta = detectCaptchaOrBlock();
      const reviews = extractReviewsOnPage();
      const nextPageUrl = findNextPageUrl();
      console.log('PPC: PAGE-EXTRACT reviews=', reviews.length, 'next=', !!nextPageUrl, meta);
      sendResponse({ reviews, nextPageUrl, ...meta });
    } catch (e) {
      console.error('PPC: CONTENT-ERR', e);
      sendResponse({ reviews: [], nextPageUrl: null, error: e.message });
    }
    return true;
  } else if (msg.type === 'PPC_SHOW_DEEP_CRAWL_MODAL') {
    injectDeepCrawlModal(msg.robots || { ok:false }, msg.maxPagesCap || 60);
  } else if (msg.type === 'PPC_CRAWL_PROGRESS') {
    updateProgressOverlay(msg);
  } else if (msg.type === 'PPC_CRAWL_FINISHED') {
    removeProgressOverlay();
    showResultsOverlay(msg.summary, msg.reason);
  } else if (msg.type === 'PPC_KEY_HEALTH_ALERT') {
    showKeyHealthToast(msg.health);
  } else if (msg.type === 'PPC_PING') {
    // Simple acknowledgement so popup can detect content script presence if needed
    sendResponse({ ok: true });
    return true;
  }
});

// ============== Messaging Safety Helper ==============
function safeSendMessage(message, callback){
  try {
    chrome.runtime.sendMessage(message, callback);
  } catch (e) {
    // Happens if extension was reloaded ("Extension context invalidated") mid-session.
    console.warn('PPC: safeSendMessage failed', e.message, message);
    if (callback) callback({ ok:false, error:e.message });
  }
}

// =============================
// Deep Crawl Consent Modal
// =============================
function injectDeepCrawlModal(robots, maxPagesCap=60) {
  ensureBaseStyles();
  if (document.querySelector('.ppc-overlay.ppc-consent')) return;
  const overlay = document.createElement('div');
  overlay.className = 'ppc-overlay ppc-consent';
  const panel = document.createElement('div');
  panel.className = 'ppc-panel';
  panel.style.maxWidth = '700px';
  panel.innerHTML = `
    <h2 style="margin-top:0;">Deep Crawl — Read Carefully</h2>
    <div style="font-size:14px; line-height:1.4; white-space:pre-wrap;">You are about to load and collect reviews from successive review pages (limit currently ${maxPagesCap} pages or until no more pages / safety caps reached). This may:\n\n- Trigger anti-bot protections (CAPTCHA or temporary block).\n- Use bandwidth and take several minutes.\n- Potentially violate the site’s Terms of Service; you accept responsibility.\n\nCheck both boxes to continue (robots.txt acknowledgement may be required):</div>
    <label style="display:block; margin-top:12px;"><input type="checkbox" id="ppc_c1"/> I confirm I understand the risks and that crawling is initiated from my browser for my personal use.</label>
    <label style="display:block; margin-top:6px;"><input type="checkbox" id="ppc_c2"/> I will not use this feature to collect data at scale for redistribution or commercial resale.</label>
    ${robots.disallowed ? `<label style='display:block; margin-top:6px; color:#7f1d1d;'><input type='checkbox' id='ppc_c_robots'/> I understand robots.txt disallows automated crawling but I wish to proceed for my personal use.</label>`: ''}
    <div style="margin-top:12px; font-size:12px; color:#555;">${robots.ok ? (robots.disallowed ? 'robots.txt indicates one or more Disallow rules may apply to this path.' : 'robots.txt fetched: no disallow detected for this path.') : 'robots.txt not fetched: ' + (robots.error||'unknown error') }</div>
    <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap;">
      <button id="ppc_start_btn" class="ppc-btn" disabled>Start Deep Crawl</button>
      <button id="ppc_cancel_btn" class="ppc-btn" style="background:#555;">Cancel</button>
    </div>
  `;
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  function updateButton() {
    const c1 = panel.querySelector('#ppc_c1').checked;
    const c2 = panel.querySelector('#ppc_c2').checked;
    const cRobots = robots.disallowed ? panel.querySelector('#ppc_c_robots').checked : true;
    panel.querySelector('#ppc_start_btn').disabled = !(c1 && c2 && cRobots);
  }
  panel.addEventListener('change', updateButton);
  updateButton();

  panel.querySelector('#ppc_cancel_btn').addEventListener('click', () => overlay.remove());
  panel.querySelector('#ppc_start_btn').addEventListener('click', () => {
    const maxPages = maxPagesCap;
    const consent = {
      c1: panel.querySelector('#ppc_c1').checked,
      c2: panel.querySelector('#ppc_c2').checked,
      robotsAccepted: robots.disallowed ? panel.querySelector('#ppc_c_robots').checked : false,
      robotsDisallowed: !!robots.disallowed
    };
    chrome.runtime.sendMessage({ type: 'PPC_DEEP_CRAWL_CONSENT', maxPages, consent }, resp => {
      if (!resp || !resp.ok) {
        alert('Failed to start crawl: ' + (resp && resp.error));
      } else {
        overlay.remove();
      }
    });
  });
}

// =============================
// Progress Overlay
// =============================
let progressEl = null;
function ensureProgressOverlay() {
  if (progressEl) return progressEl;
  // Ensure styles even when consent modal was skipped due to remembered global consent
  try { ensureBaseStyles(); } catch(_) {}
  progressEl = document.createElement('div');
  progressEl.className = 'ppc-overlay ppc-progress';
  progressEl.innerHTML = `
    <div class="ppc-panel" style="max-width:420px;">
      <h3 style="margin-top:0;">Deep Crawl Progress</h3>
      <div id="ppc_prog_status">Starting…</div>
      <div style="margin-top:8px; font-size:12px;" id="ppc_prog_details"></div>
      <div style="margin-top:12px; display:flex; gap:8px;">
        <button class="ppc-btn" id="ppc_cancel_crawl" style="background:#7f1d1d;">Cancel</button>
        <button class="ppc-btn" id="ppc_stop_and_summarize" style="background:#6d28d9;">Stop & Summarize Now</button>
      </div>
    </div>`;
  document.body.appendChild(progressEl);
  progressEl.querySelector('#ppc_cancel_crawl').addEventListener('click', () => {
    safeSendMessage({ type: 'PPC_CANCEL_CRAWL' }, () => {
      // For now just remove overlay; background will see cancelled flag when implemented
      progressEl.remove(); progressEl=null;
    });
  });
  progressEl.querySelector('#ppc_stop_and_summarize').addEventListener('click', () => {
    // Keep overlay; background will respond with finished message which replaces overlay with results
    safeSendMessage({ type: 'PPC_STOP_AND_SUMMARIZE' });
    progressEl.querySelector('#ppc_prog_status').textContent = 'Stopping & summarizing…';
  });
  return progressEl;
}
function updateProgressOverlay(msg) {
  const el = ensureProgressOverlay();
  el.querySelector('#ppc_prog_status').textContent = msg.status || 'Working…';
  el.querySelector('#ppc_prog_details').textContent = `Pages: ${msg.pagesCrawled}/${msg.maxPages} (session ${msg.sessionId || ''})`;
}
function removeProgressOverlay() { if (progressEl) { progressEl.remove(); progressEl=null; } }

// =============================
// Results Overlay
// =============================
let resultsOverlay = null;
function removeResultsOverlay(){
  if (!resultsOverlay) return;
  window.removeEventListener('keydown', escHandler, true);
  resultsOverlay.remove();
  resultsOverlay = null;
}
function escHandler(e){ if (e.key === 'Escape') { removeResultsOverlay(); } }
function showResultsOverlay(summary, reason) {
  if (resultsOverlay) removeResultsOverlay();
  try { ensureBaseStyles(); } catch(_) {}
  resultsOverlay = document.createElement('div');
  resultsOverlay.className = 'ppc-overlay ppc-results';
  const pros = summary?.pros || []; const cons = summary?.cons || [];
  function listItems(arr, cls) {
    return arr.map(p => `<li class='${cls}'>${escapeHtml(p.label)} <span style='opacity:.7'>(x${p.support_count})</span></li>`).join('');
  }
  const jsonStr = JSON.stringify(summary, null, 2);
  resultsOverlay.innerHTML = `
    <div class="ppc-panel">
      <h2 style="margin-top:0;">Pros & Cons Summary</h2>
      <div style="font-size:12px; color:#555;">Finished: ${escapeHtml(reason||'completed')}</div>
      <div class="ppc-flex" style="margin-top:12px;">
        <div style="flex:1; min-width:300px;">
          <h3>Pros</h3>
          <ul style="padding-left:18px;">${listItems(pros,'ppc-pro')}</ul>
        </div>
        <div style="flex:1; min-width:300px;">
          <h3>Cons</h3>
          <ul style="padding-left:18px;">${listItems(cons,'ppc-con')}</ul>
        </div>
      </div>
      <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="ppc-btn" id="ppc_copy_json">Copy JSON</button>
        <button class="ppc-btn" id="ppc_copy_text" style="background:#059669;">Copy Plain</button>
        <button class="ppc-btn" id="ppc_refresh_sum" style="background:#6d28d9;">Refresh</button>
        <button class="ppc-btn" id="ppc_undo_sum" style="background:#92400e;">Undo</button>
        <button class="ppc-btn" id="ppc_close_results" style="background:#555;">Close</button>
      </div>
      <pre style="margin-top:16px; max-height:240px; overflow:auto; font-size:11px; background:#f8f8f8; padding:8px;">${escapeHtml(jsonStr)}</pre>
    </div>`;
  document.body.appendChild(resultsOverlay);
  // Close button
  resultsOverlay.querySelector('#ppc_close_results').addEventListener('click', removeResultsOverlay);
  // Backdrop click (if click outside panel)
  resultsOverlay.addEventListener('click', (e) => {
    if (e.target === resultsOverlay) removeResultsOverlay();
  });
  // ESC key
  window.addEventListener('keydown', escHandler, true);
  resultsOverlay.querySelector('#ppc_copy_json').addEventListener('click', () => {
    navigator.clipboard.writeText(jsonStr);
  });
  resultsOverlay.querySelector('#ppc_copy_text').addEventListener('click', () => {
    const plain = 'PROS:\n' + pros.map(p=>`- ${p.label} (x${p.support_count})`).join('\n') + '\n\nCONS:\n' + cons.map(c=>`- ${c.label} (x${c.support_count})`).join('\n');
    navigator.clipboard.writeText(plain);
  });
  resultsOverlay.querySelector('#ppc_refresh_sum').addEventListener('click', () => {
        safeSendMessage({ type: 'PPC_REFRESH_CRAWL_SUMMARY' });
  });
  resultsOverlay.querySelector('#ppc_undo_sum').addEventListener('click', () => {
    safeSendMessage({ type: 'PPC_UNDO_SUMMARY' });
  });
}

// =============================
// Key Health Toast
// =============================
let keyToastTimer = null;
function showKeyHealthToast(health){
  if (!health) return;
  const existing = document.querySelector('.ppc-key-toast');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.className = 'ppc-key-toast';
  div.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:1000000;background:#111;color:#fff;padding:10px 14px;border-radius:6px;font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:260px;';
  const colorMap = { invalid:'#b91c1c', quota_exhausted:'#92400e', error:'#b91c1c', network_error:'#6d28d9' };
  const badgeColor = colorMap[health.status] || '#2563eb';
  div.innerHTML = `<strong style="color:${badgeColor}">API Key Issue:</strong><br>${escapeHtml(health.message || health.status)}`;
  document.body.appendChild(div);
  clearTimeout(keyToastTimer);
  keyToastTimer = setTimeout(()=>{ div.remove(); }, 8000);
}

function escapeHtml(str){
  return (str||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

// Placeholder for overlay insertion (results & deep crawl modal coming later)

console.log('PPC: CONTENT LOADED');
