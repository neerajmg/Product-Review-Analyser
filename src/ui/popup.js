// Popup logic (scaffold)

const deepCrawlBtn = document.getElementById('deepCrawlBtn');
const btnText = document.getElementById('btnText');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const openOptionsBtn = document.getElementById('openOptionsBtn');
const healthDot = document.getElementById('healthDot');
const clearCacheBtn = document.getElementById('clearCacheBtn');
const apiKeyHelp = document.getElementById('apiKeyHelp');
const statusMessage = document.getElementById('statusMessage');
const rateLimitIndicator = document.getElementById('rateLimitIndicator');

// Clear cache button with better UX
if (clearCacheBtn) {
  clearCacheBtn.addEventListener('click', (e) => {
    e.preventDefault();
    clearCacheBtn.style.transform = 'rotate(180deg)';
    setStatus('Clearing cache...');
    chrome.runtime.sendMessage({ type: 'PPC_CLEAR_CACHE' }, (response) => {
      clearCacheBtn.style.transform = '';
      if (chrome.runtime.lastError) {
        setStatus(`Error: ${chrome.runtime.lastError.message}`);
      } else if (response && response.ok) {
        setStatus('Cache cleared successfully');
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
        setTimeout(() => setStatus(''), 2000);
      } else {
        setStatus('Failed to clear cache');
      }
    });
  });
}

// Settings button handler
const openSettings = (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
};

if (openOptionsBtn) {
  openOptionsBtn.addEventListener('click', openSettings);
}

function setStatus(msg) { 
  statusEl.textContent = msg;
  statusEl.style.display = msg ? 'block' : 'none';
}

function setBtnState(loading = false, text = 'Analyze Reviews') {
  if (loading) {
    deepCrawlBtn.disabled = true;
    btnText.textContent = 'Processing...';
    deepCrawlBtn.style.background = 'linear-gradient(135deg, #9ca3af, #6b7280)';
  } else {
    deepCrawlBtn.disabled = false;
    btnText.textContent = text;
    deepCrawlBtn.style.background = '';
  }
}

// Update API key status message based on key health
function updateApiKeyStatus(keyHealth) {
  if (!keyHealth) {
    // No key health data - show warning
    apiKeyHelp.className = 'ai-status warning';
    statusMessage.textContent = '⚠️ Please provide your AI service API keys in Settings for the extension to work perfectly';
    return;
  }

  if (keyHealth.status === 'valid') {
    apiKeyHelp.className = 'ai-status success';
    statusMessage.textContent = '✅ API key configured and ready';
  } else if (keyHealth.status === 'missing') {
    apiKeyHelp.className = 'ai-status warning';
    statusMessage.textContent = '⚠️ Please provide your AI service API keys in Settings for the extension to work perfectly';
  } else if (keyHealth.status === 'invalid') {
    apiKeyHelp.className = 'ai-status error';
    statusMessage.textContent = '❌ Invalid API key - please check your settings';
  } else if (keyHealth.status === 'quota_exhausted') {
    apiKeyHelp.className = 'ai-status error';
    statusMessage.textContent = '❌ API quota exhausted - please check your billing';
  } else {
    apiKeyHelp.className = 'ai-status error';
    statusMessage.textContent = '❌ API error - please check your settings';
  }
}

// Update rate limit indicator
function updateRateLimitStatus(status, nextRetryAfter = null) {
  if (!rateLimitIndicator) return;
  
  rateLimitIndicator.className = 'rate-limit-indicator';
  
  switch (status) {
    case 'available':
      rateLimitIndicator.classList.add('available');
      rateLimitIndicator.title = 'API available';
      break;
    case 'rate_limited':
      rateLimitIndicator.classList.add('limited');
      rateLimitIndicator.title = nextRetryAfter ? 
        `Rate limited - retry in ${nextRetryAfter}s` : 'Rate limited';
      break;
    case 'quota_exceeded':
      rateLimitIndicator.classList.add('error');
      rateLimitIndicator.title = 'Quota exceeded';
      break;
    case 'error':
    default:
      rateLimitIndicator.classList.add('error');
      rateLimitIndicator.title = 'API error or no key';
      break;
  }
}

deepCrawlBtn.addEventListener('click', () => {
  setBtnState(true);
  setStatus('Preparing analysis...');
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs.length) {
      setBtnState(false);
      return setStatus('No active tab found');
    }
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

function updateHealthIndicator() {
  chrome.runtime.sendMessage({ type: 'PPC_GET_KEY_HEALTH' }, resp => {
    let status = resp && resp.ok && resp.health && resp.health.status;
    
    // Remove all health classes
    healthDot.className = 'health-indicator';
    
    // Add appropriate class based on status
    if (status === 'valid') {
      healthDot.classList.add('healthy');
      healthDot.title = 'AI service connected';
    } else if (status === 'invalid' || status === 'missing') {
      healthDot.classList.add('error');
      healthDot.title = 'AI service not configured';
    } else if (status === 'quota_exhausted') {
      healthDot.classList.add('warning');
      healthDot.title = 'AI service quota exhausted';
    } else if (status === 'network_error') {
      healthDot.classList.add('warning');
      healthDot.title = 'AI service connection issue';
    } else {
      healthDot.title = 'AI service status unknown';
    }
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

// Initialize health indicator system
function initHealthIndicators() {
  updateHealthIndicator('gemini-health', 'checking');
  updateHealthIndicator('openai-health', 'checking');
  
  // Check API health status using existing message type
  chrome.runtime.sendMessage({type: 'PPC_GET_KEY_HEALTH'}, (response) => {
    if (response && response.ok && response.health) {
      const geminiStatus = response.health.gemini === 'valid' ? 'healthy' : 'error';
      const openaiStatus = response.health.openai === 'valid' ? 'healthy' : 'error';
      updateHealthIndicator('gemini-health', geminiStatus);
      updateHealthIndicator('openai-health', openaiStatus);
    } else {
      updateHealthIndicator('gemini-health', 'error');
      updateHealthIndicator('openai-health', 'error');
    }
  });
}

// Initialize status indicators
function initStatusIndicators() {
  console.log('PPC: Initializing status indicators...');
  
  // Check API key health status
  chrome.runtime.sendMessage({type: 'PPC_GET_KEY_HEALTH'}, (response) => {
    console.log('PPC: Key health response:', response);
    
    if (chrome.runtime.lastError) {
      console.error('PPC: Error getting key health:', chrome.runtime.lastError);
      updateApiKeyStatus(null);
      updateRateLimitStatus('error');
      return;
    }
    
    if (response && response.ok && response.health) {
      updateApiKeyStatus(response.health);
      
      // Update header health dot
      if (healthDot) {
        if (response.health.status === 'valid') {
          healthDot.className = 'health-indicator healthy';
        } else {
          healthDot.className = 'health-indicator error';
        }
      }
      
      // If we have a valid key, check rate limits
      if (response.health.status === 'valid') {
        checkRateLimit();
      } else {
        updateRateLimitStatus('error');
      }
    } else {
      console.log('PPC: No health data available');
      updateApiKeyStatus(null);
      updateRateLimitStatus('error');
    }
  });
}

// Check rate limit status
function checkRateLimit() {
  chrome.runtime.sendMessage({type: 'PPC_CHECK_RATE_LIMIT'}, (response) => {
    console.log('PPC: Rate limit response:', response);
    
    if (chrome.runtime.lastError) {
      console.error('PPC: Error checking rate limit:', chrome.runtime.lastError);
      updateRateLimitStatus('error');
      return;
    }
    
    if (response && response.ok) {
      updateRateLimitStatus(response.status, response.nextRetryAfter);
    } else {
      updateRateLimitStatus('error');
    }
  });
}

// Initialize popup on load
document.addEventListener('DOMContentLoaded', () => {
  console.log('PPC: POPUP LOADED');
  
  // Initialize status indicators
  initStatusIndicators();
  
  // Refresh rate limit status every 15 seconds (less frequent to avoid spam)
  setInterval(() => {
    // Only check rate limit if we have elements
    if (rateLimitIndicator) {
      checkRateLimit();
    }
  }, 15000);
});
