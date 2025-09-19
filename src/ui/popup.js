// Popup logic (scaffold)

const deepCrawlBtn = document.getElementById('deepCrawlBtn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const openOptionsLink = document.getElementById('openOptions');
const keyIndicator = document.getElementById('keyIndicator');

openOptionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

function setStatus(msg) { statusEl.textContent = msg; }

deepCrawlBtn.addEventListener('click', () => {
  setStatus('Preparing deep crawl modal…');
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs.length) return setStatus('No active tab');
    chrome.tabs.sendMessage(tabs[0].id, { type: 'PPC_PING' }, () => {
      chrome.runtime.sendMessage({ type: 'PPC_INIT_DEEP_CRAWL' });
    });
  });
});

function updateKeyIndicator() {
  chrome.runtime.sendMessage({ type: 'PPC_GET_KEY_HEALTH' }, resp => {
    if (!resp || !resp.ok || !resp.health) { keyIndicator.style.background = '#999'; return; }
    const status = resp.health.status;
    let color = '#999';
    if (status === 'valid') color = '#059669';
    else if (status === 'quota_exhausted') color = '#92400e';
    else if (status === 'invalid') color = '#dc2626';
    else if (status === 'network_error') color = '#6d28d9';
    keyIndicator.style.background = color;
    keyIndicator.title = status.toUpperCase() + (resp.health.message ? ': ' + resp.health.message : '');
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
