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

function showToast(msg, type='info') {
  let toast = document.querySelector('.ppc-toast');
  if (toast) toast.remove();
  toast = document.createElement('div');
  toast.className = 'ppc-toast';
  const colors = { info:'#2563eb', success:'#065f46', error:'#b91c1c' };
  const color = colors[type] || colors.info;
  toast.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:999999;background:#111;color:#fff;padding:10px 14px;border-radius:6px;font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,.35);max-width:280px;line-height:1.3;';
  toast.innerHTML = `<span style="color:${color};font-weight:600;">${type.toUpperCase()}</span><br>${msg}`;
  document.body.appendChild(toast);
  setTimeout(()=>{ toast.remove(); }, 4200);
}

function attachEvents(){
  qs('saveBtn').addEventListener('click', save);
  qs('testKeyBtn').addEventListener('click', () => {
    const key = qs('apiKey').value.trim();
    if (!key) { showToast('Enter a key first.', 'error'); return; }
    disableKeyButtons(true);
    updateKeyStatus({ status:'checking', message:'Validating…' });
    chrome.runtime.sendMessage({ type: 'PPC_TEST_KEY', apiKey: key }, resp => {
      disableKeyButtons(false);
      if (chrome.runtime.lastError) {
        updateKeyStatus({ status:'error', message: chrome.runtime.lastError.message });
        showToast('Extension error: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      if (!resp) { updateKeyStatus({ status:'error', message:'No response' }); showToast('No response from background script.', 'error'); return; }
      updateKeyStatus(resp.health || { status: resp.ok ? 'valid':'error', message: resp.message });
      if (resp.ok) save();
      showToast(resp.message || (resp.ok ? 'Key valid' : 'Key invalid'), resp.ok ? 'success':'error');
    });
  });
  qs('recheckBtn').addEventListener('click', () => {
    disableKeyButtons(true);
    updateKeyStatus({ status:'checking', message:'Re-checking…' });
    chrome.runtime.sendMessage({ type: 'PPC_FORCE_KEY_RECHECK' }, resp => {
      disableKeyButtons(false);
      if (chrome.runtime.lastError) {
        updateKeyStatus({ status:'error', message: chrome.runtime.lastError.message });
        showToast('Extension error: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      if (resp && resp.ok) {
        updateKeyStatus(resp.health);
        showToast('Health re-check: ' + (resp.health?.status || 'unknown'), resp.health?.status==='valid' ? 'success':'info');
      } else {
        updateKeyStatus({ status:'error', message: resp && resp.error || 'Failed' });
        showToast('Re-check failed.', 'error');
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  attachEvents();
  load();
});
