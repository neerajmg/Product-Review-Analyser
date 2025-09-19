// Popup logic (scaffold)

const deepCrawlBtn = document.getElementById('deepCrawlBtn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const openOptionsLink = document.getElementById('openOptions');
const keyIndicator = document.getElementById('keyIndicator');
const healthDot = document.getElementById('healthDot');

openOptionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

function setStatus(msg) { statusEl.textContent = msg; }

deepCrawlBtn.addEventListener('click', () => {
  setStatus('Preparing deep crawl modal…');
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs.length) return setStatus('No active tab');
    const tabId = tabs[0].id;
    // First, ping content script to verify it is injected
    chrome.tabs.sendMessage(tabId, { type: 'PPC_PING' }, pingResp => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || '';
        if (/Receiving end does not exist/i.test(msg)) {
          // Attempt programmatic injection fallback, then retry once
          chrome.scripting?.executeScript({ target: { tabId }, files: ['src/content.js'] }, () => {
            if (chrome.runtime.lastError) {
              setStatus('Content script missing and injection failed: ' + chrome.runtime.lastError.message);
              return;
            }
            // re-ping
            chrome.tabs.sendMessage(tabId, { type: 'PPC_PING' }, () => {
              if (chrome.runtime.lastError) {
                setStatus('Content script still not reachable. Reload the page and try again.');
                return;
              }
              // proceed now
              chrome.runtime.sendMessage({ type: 'PPC_INIT_DEEP_CRAWL', tabId }, resp => {
                if (chrome.runtime.lastError) { setStatus('Error: ' + chrome.runtime.lastError.message); return; }
                if (!resp || !resp.ok) { setStatus('Failed: ' + (resp && resp.error || 'unknown')); return; }
                setStatus('Consent modal opened (check the page)');
              });
            });
          });
        } else {
          setStatus('Cannot reach content script: ' + msg);
        }
        return;
      }
      // If ping ok, ask background to start deep crawl consent
      chrome.runtime.sendMessage({ type: 'PPC_INIT_DEEP_CRAWL', tabId }, resp => {
        if (chrome.runtime.lastError) {
          setStatus('Error: ' + chrome.runtime.lastError.message);
          return;
        }
        if (!resp || !resp.ok) {
          setStatus('Failed: ' + (resp && resp.error || 'unknown'));
          return;
        }
        if (resp.skippedModal) {
          setStatus('Crawl started (consent remembered)');
        } else {
          setStatus('Consent modal opened (check the page)');
        }
      });
    });
  });
});

function updateKeyIndicator() {
  chrome.runtime.sendMessage({ type: 'PPC_GET_KEY_HEALTH' }, resp => {
    let status = resp && resp.ok && resp.health && resp.health.status;
    let color = '#999';
    if (status === 'valid') color = '#059669';
    else if (status === 'invalid' || status === 'missing') color = '#dc2626';
    else if (status === 'quota_exhausted') color = '#d97706';
    else if (status === 'network_error') color = '#6d28d9';
    keyIndicator.style.background = color; // existing inline indicator text area
    if (healthDot) healthDot.style.background = (status === 'valid') ? '#059669' : '#dc2626';
    if (resp && resp.health) {
      const msg = status.toUpperCase() + (resp.health.message ? ': ' + resp.health.message : '');
      keyIndicator.title = msg;
      if (healthDot) healthDot.title = msg;
    }
  });
}

updateKeyIndicator();

function renderSummary(summary) {
  resultsEl.hidden = false;
  resultsEl.innerHTML = '';
  const pros = summary.pros || []; const cons = summary.cons || [];
  resultsEl.appendChild(document.createElement('hr'));
  const pTitle = document.createElement('div'); pTitle.textContent = 'Pros'; pTitle.className='section-title'; resultsEl.appendChild(pTitle);
  pros.forEach(p => {
    const div = document.createElement('div');
    div.textContent = `${p.label} (x${p.support_count})`;
    resultsEl.appendChild(div);
  });
  const cTitle = document.createElement('div'); cTitle.textContent = 'Cons'; cTitle.className='section-title'; resultsEl.appendChild(cTitle);
  cons.forEach(c => {
    const div = document.createElement('div');
    div.textContent = `${c.label} (x${c.support_count})`;
    resultsEl.appendChild(div);
  });
}

console.log('PPC: POPUP LOADED');
