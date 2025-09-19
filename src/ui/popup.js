// Popup logic (scaffold)

const analyzeBtn = document.getElementById('analyzeBtn');
const deepCrawlBtn = document.getElementById('deepCrawlBtn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const maxPagesInput = document.getElementById('maxPages');
const openOptionsLink = document.getElementById('openOptions');

openOptionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

function setStatus(msg) { statusEl.textContent = msg; }

analyzeBtn.addEventListener('click', () => {
  setStatus('Extracting…');
  chrome.runtime.sendMessage({ type: 'PPC_ANALYZE_SINGLE_PAGE' }, resp => {
    if (!resp || !resp.ok) {
      setStatus('Error: ' + (resp && resp.error));
      return;
    }
    const { summary, reviewCount } = resp.result;
    setStatus('Done. Reviews: ' + reviewCount);
    renderSummary(summary);
  });
});

deepCrawlBtn.addEventListener('click', () => {
  setStatus('Preparing deep crawl modal…');
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs.length) return setStatus('No active tab');
    chrome.tabs.sendMessage(tabs[0].id, { type: 'PPC_PING' }, () => {
      chrome.runtime.sendMessage({ type: 'PPC_INIT_DEEP_CRAWL' });
    });
  });
});

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
