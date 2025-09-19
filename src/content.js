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

/** Find next page URL using common patterns */
function findNextPageUrl() {
  const relNext = document.querySelector('link[rel=next]');
  if (relNext && relNext.href) return relNext.href;
  const aLast = document.querySelector('.a-pagination .a-last a');
  if (aLast && aLast.href) return aLast.href;
  const genericNext = [...document.querySelectorAll('a')].find(a => /next/i.test(a.textContent) && a.href);
  return genericNext ? genericNext.href : null;
}

/** Extract review data using selectors */
function extractReviewsOnPage() {
  const selectors = window.PPCSelectors;
  if (!selectors) {
    console.warn('PPC: selectors not loaded');
    return [];
  }
  return selectors.findReviewElements(document).map(el => ({
    id: el.getAttribute('id') || el.getAttribute('data-hook') || ('r' + Math.random().toString(36).slice(2, 9)),
    text: selectors.extractReviewText(el),
    rating: selectors.extractRating(el)
  }));
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
    injectDeepCrawlModal(msg.robots || { ok:false });
  } else if (msg.type === 'PPC_CRAWL_PROGRESS') {
    updateProgressOverlay(msg);
  } else if (msg.type === 'PPC_CRAWL_FINISHED') {
    removeProgressOverlay();
    showResultsOverlay(msg.summary, msg.reason);
  } else if (msg.type === 'PPC_KEY_HEALTH_ALERT') {
    showKeyHealthToast(msg.health);
  }
});

// =============================
// Deep Crawl Consent Modal
// =============================
function injectDeepCrawlModal(robots) {
  // Avoid duplicates
  if (document.querySelector('.ppc-overlay.ppc-consent')) return;
  const overlay = document.createElement('div');
  overlay.className = 'ppc-overlay ppc-consent';
  const panel = document.createElement('div');
  panel.className = 'ppc-panel';
  panel.style.maxWidth = '700px';
  panel.innerHTML = `
    <h2 style="margin-top:0;">Deep Crawl — Read Carefully</h2>
    <div style="font-size:14px; line-height:1.4; white-space:pre-wrap;">You are about to ask the extension to load and collect reviews from *every* review page (up to a fixed limit of 30 pages) for this product. This may:\n\n- Trigger anti-bot protections (CAPTCHA or temporary block).\n- Use bandwidth and take several minutes.\n- Potentially violate the site’s Terms of Service; you accept responsibility.\n\nCheck both boxes to continue (robots.txt acknowledgement may be required):</div>
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
    const maxPages = 30; // fixed limit
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
        // Placeholder: show temporary notice
        const note = document.createElement('div');
        note.className = 'ppc-overlay';
        note.innerHTML = '<div class="ppc-panel"><h3>Deep Crawl (placeholder)</h3><p>The crawl controller will run in upcoming update.</p><button class="ppc-btn" id="ppc_close_placeholder">Close</button></div>';
        document.body.appendChild(note);
        note.querySelector('#ppc_close_placeholder').addEventListener('click', () => note.remove());
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
  progressEl = document.createElement('div');
  progressEl.className = 'ppc-overlay ppc-progress';
  progressEl.innerHTML = `
    <div class="ppc-panel" style="max-width:420px;">
      <h3 style="margin-top:0;">Deep Crawl Progress</h3>
      <div id="ppc_prog_status">Starting…</div>
      <div style="margin-top:8px; font-size:12px;" id="ppc_prog_details"></div>
      <div style="margin-top:12px; display:flex; gap:8px;">
        <button class="ppc-btn" id="ppc_cancel_crawl" style="background:#7f1d1d;">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(progressEl);
  progressEl.querySelector('#ppc_cancel_crawl').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'PPC_CANCEL_CRAWL' }, () => {
      // For now just remove overlay; background will see cancelled flag when implemented
      progressEl.remove(); progressEl=null;
    });
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
function showResultsOverlay(summary, reason) {
  if (resultsOverlay) resultsOverlay.remove();
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
  resultsOverlay.querySelector('#ppc_close_results').addEventListener('click', () => resultsOverlay.remove());
  resultsOverlay.querySelector('#ppc_copy_json').addEventListener('click', () => {
    navigator.clipboard.writeText(jsonStr);
  });
  resultsOverlay.querySelector('#ppc_copy_text').addEventListener('click', () => {
    const plain = 'PROS:\n' + pros.map(p=>`- ${p.label} (x${p.support_count})`).join('\n') + '\n\nCONS:\n' + cons.map(c=>`- ${c.label} (x${c.support_count})`).join('\n');
    navigator.clipboard.writeText(plain);
  });
  resultsOverlay.querySelector('#ppc_refresh_sum').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'PPC_REFRESH_CRAWL_SUMMARY' });
  });
  resultsOverlay.querySelector('#ppc_undo_sum').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'PPC_UNDO_SUMMARY' });
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
