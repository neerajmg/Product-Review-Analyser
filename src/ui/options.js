// Options page script extracted from inline block to satisfy MV3 CSP (no inline scripts)
// Handles loading/saving options, validating API key, and re-checking key health.

function qs(id){ return document.getElementById(id); }

function load() {
  chrome.runtime.sendMessage({ type: 'PPC_GET_OPTIONS' }, resp => {
    if (!resp || !resp.ok) return;
    const o = resp.options;
    qs('apiKey').value = o.apiKey || '';
    qs('fallbackMode').checked = !!o.fallbackMode;
    refreshKeyHealth();
  });
}

function save() {
  const payload = {
    apiKey: qs('apiKey').value.trim(),
    fallbackMode: qs('fallbackMode').checked,
  };
  chrome.runtime.sendMessage({ type: 'PPC_SAVE_OPTIONS', payload }, resp => {
    qs('saveStatus').textContent = resp && resp.ok ? 'Saved.' : 'Error saving';
    setTimeout(() => { qs('saveStatus').textContent=''; }, 2000);
  });
}

function disableKeyButtons(disabled){
  qs('testKeyBtn').disabled = disabled;
  qs('recheckBtn').disabled = disabled;
}

function updateKeyStatus(h) {
  const el = qs('keyStatus');
  if (!h) { el.textContent='(unknown)'; return; }
  if (h.status === 'checking') { el.textContent = 'Checking…'; el.style.color = '#2563eb'; return; }
  let color = '#555';
  switch(h.status){
    case 'valid': color = '#065f46'; break;
    case 'quota_exhausted': color = '#92400e'; break;
    case 'invalid': color = '#b91c1c'; break;
    case 'network_error': color = '#6d28d9'; break;
    case 'missing': color = '#555'; break;
    default: color = '#374151';
  }
  el.textContent = h.status.toUpperCase() + (h.message ? ' – ' + h.message : '');
  el.style.color = color;
}

function refreshKeyHealth() {
  chrome.runtime.sendMessage({ type: 'PPC_GET_KEY_HEALTH' }, resp => {
    if (resp && resp.ok && resp.health) updateKeyStatus(resp.health);
  });
}

function attachEvents(){
  qs('saveBtn').addEventListener('click', save);
  qs('testKeyBtn').addEventListener('click', () => {
    const key = qs('apiKey').value.trim();
    if (!key) { alert('Enter a key first.'); return; }
    disableKeyButtons(true);
    updateKeyStatus({ status:'checking', message:'Validating…' });
    chrome.runtime.sendMessage({ type: 'PPC_TEST_KEY', apiKey: key }, resp => {
      disableKeyButtons(false);
      if (chrome.runtime.lastError) {
        updateKeyStatus({ status:'error', message: chrome.runtime.lastError.message });
        alert('Extension error: ' + chrome.runtime.lastError.message);
        return;
      }
      if (!resp) { updateKeyStatus({ status:'error', message:'No response' }); alert('No response'); return; }
      updateKeyStatus(resp.health || { status: resp.ok ? 'valid':'error', message: resp.message });
      if (resp.ok) save();
      alert(resp.message || (resp.ok ? 'Key valid' : 'Key invalid'));
    });
  });
  qs('recheckBtn').addEventListener('click', () => {
    disableKeyButtons(true);
    updateKeyStatus({ status:'checking', message:'Re-checking…' });
    chrome.runtime.sendMessage({ type: 'PPC_FORCE_KEY_RECHECK' }, resp => {
      disableKeyButtons(false);
      if (chrome.runtime.lastError) {
        updateKeyStatus({ status:'error', message: chrome.runtime.lastError.message });
        return;
      }
      if (resp && resp.ok) updateKeyStatus(resp.health); else updateKeyStatus({ status:'error', message: resp && resp.error || 'Failed' });
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  attachEvents();
  load();
});
