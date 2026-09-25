/**
 * OUTLINE WEB MANAGER - INTERACTIVE ENGINE
 * Features:
 * - Dynamic Island Liquid Toast
 * - Clipboard Copy with Visual Morphing
 * - Zero-Reload AJAX Key Management (Add, Rename, Limit, Delete, Pause)
 * - Real-Time Server Latency Benchmarking
 * - Auto-Sync Polling
 * - Bandwidth Distribution Analytics (Chart.js)
 * - Multi-Server Profile Switcher
 * - QR Code Modal & Client Invites
 */

// --------------------------------------------------------------------------
// Toast Notification System
// --------------------------------------------------------------------------
function showLiquidToast(message, icon = 'hgi-check-check') {
  let container = document.getElementById('liquid-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'liquid-toast-container';
    container.className = 'liquid-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'liquid-toast';
  toast.innerHTML = `<i class="hgi-stroke ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 2600);
}

// --------------------------------------------------------------------------
// Copy to Clipboard with Button Morphing
// --------------------------------------------------------------------------
function copyToClipboard(text, btnElement, successMsg = 'Copied to clipboard!') {
  if (!text) return;

  function onCopied() {
    showLiquidToast(successMsg, 'hgi-check-check');

    if (btnElement) {
      const originalHTML = btnElement.innerHTML;
      btnElement.innerHTML = `<i class="hgi-stroke hgi-check-check" style="color: #34d399;"></i>`;
      btnElement.style.borderColor = 'rgba(16, 185, 129, 0.6)';
      btnElement.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.4)';

      setTimeout(() => {
        btnElement.innerHTML = originalHTML;
        btnElement.style.borderColor = '';
        btnElement.style.boxShadow = '';
      }, 1800);
    }
  }

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(onCopied).catch(() => {
      fallbackCopy(text, onCopied);
    });
  } else {
    fallbackCopy(text, onCopied);
  }
}

function fallbackCopy(text, callback) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    callback();
  } catch (err) {
    showLiquidToast('Could not copy automatically', 'hgi-alert-circle');
  }
  document.body.removeChild(textArea);
}

// --------------------------------------------------------------------------
// Live Server Latency / Ping
// --------------------------------------------------------------------------
async function checkServerLatency() {
  const pingBadge = document.getElementById('serverPingBadge');
  const pingText = document.getElementById('serverPingText');
  const pingDot = document.getElementById('serverPingDot');
  if (!pingBadge) return;

  try {
    const res = await fetch('/api/ping');
    if (!res.ok) throw new Error();
    const data = await res.json();
    const latency = data.latency_ms;

    if (pingText) pingText.textContent = `${latency} ms`;

    if (pingDot) {
      if (latency < 160) {
        pingDot.style.backgroundColor = '#10b981';
        pingDot.style.boxShadow = '0 0 8px #10b981';
      } else if (latency < 320) {
        pingDot.style.backgroundColor = '#f59e0b';
        pingDot.style.boxShadow = '0 0 8px #f59e0b';
      } else {
        pingDot.style.backgroundColor = '#ef4444';
        pingDot.style.boxShadow = '0 0 8px #ef4444';
      }
    }
  } catch (e) {
    if (pingText) pingText.textContent = 'Offline';
    if (pingDot) {
      pingDot.style.backgroundColor = '#ef4444';
      pingDot.style.boxShadow = '0 0 8px #ef4444';
    }
  }
}

// --------------------------------------------------------------------------
// Zero-Reload AJAX Actions for Keys
// --------------------------------------------------------------------------
function initAjaxKeyActions() {
  // 1. Create New Key without reload
  const createForm = document.getElementById('createKeyForm');
  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('newKeyName');
      const keyName = input ? input.value.trim() : '';

      const submitBtn = createForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const formData = new FormData();
        formData.append('newKeyName', keyName);

        const res = await fetch('/api/keys/add', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        if (data.status === 'ok') {
          if (input) input.value = '';
          showLiquidToast(`Access key '${data.key.name || data.key.key_id}' created!`, 'hgi-add-01');
          
          // Re-fetch stats or dynamically insert
          await refreshDashboardStats();
        } else {
          showLiquidToast(data.message || 'Failed to create key', 'hgi-alert-circle');
        }
      } catch (err) {
        showLiquidToast('Network error creating key', 'hgi-alert-circle');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // 2. Attach AJAX to individual Key forms (Rename, Limit, Delete Limit, Pause)
  attachDynamicKeyCardHandlers();
}

function attachDynamicKeyCardHandlers() {
  // Inline Rename forms
  document.querySelectorAll('.key-rename-form').forEach(form => {
    if (form.getAttribute('data-ajax-attached')) return;
    form.setAttribute('data-ajax-attached', 'true');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const keyId = form.getAttribute('data-key-id');
      const input = form.querySelector('input[name="keyName"]');
      const newName = input ? input.value.trim() : '';

      try {
        const formData = new FormData();
        formData.append('keyName', newName);

        const res = await fetch(`/api/keys/${keyId}/rename`, {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        if (data.status === 'ok') {
          if (input) input.placeholder = newName;
          const card = form.closest('.key-card');
          if (card) card.setAttribute('data-key-name', newName);
          showLiquidToast(`Key #${keyId} renamed to '${newName}'`, 'hgi-check-check');
        } else {
          showLiquidToast(data.message || 'Could not rename key', 'hgi-alert-circle');
        }
      } catch (err) {
        showLiquidToast('Network error renaming key', 'hgi-alert-circle');
      }
    });
  });

  // Limit forms
  document.querySelectorAll('.key-limit-form').forEach(form => {
    if (form.getAttribute('data-ajax-attached')) return;
    form.setAttribute('data-ajax-attached', 'true');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const keyId = form.getAttribute('data-key-id');
      const input = form.querySelector('input[name="dataLimit"]');
      const limitVal = input ? parseFloat(input.value) : null;

      if (!limitVal || limitVal <= 0) return;

      try {
        const formData = new FormData();
        formData.append('dataLimit', limitVal);

        const res = await fetch(`/api/keys/${keyId}/limit`, {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        if (data.status === 'ok') {
          if (input) {
            input.value = '';
            input.placeholder = `${limitVal} GB`;
          }
          showLiquidToast(`Limit of ${limitVal} GB applied to #${keyId}`, 'hgi-check-check');
          await refreshDashboardStats();
        } else {
          showLiquidToast(data.message || 'Could not update limit', 'hgi-alert-circle');
        }
      } catch (err) {
        showLiquidToast('Network error updating limit', 'hgi-alert-circle');
      }
    });
  });

  // Delete Limit forms
  document.querySelectorAll('.key-delete-limit-form').forEach(form => {
    if (form.getAttribute('data-ajax-attached')) return;
    form.setAttribute('data-ajax-attached', 'true');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const keyId = form.getAttribute('data-key-id');

      try {
        const res = await fetch(`/api/keys/${keyId}/delete-limit`, { method: 'POST' });
        const data = await res.json();
        if (data.status === 'ok') {
          showLiquidToast(`Individual limit removed for #${keyId}`, 'hgi-check-check');
          await refreshDashboardStats();
        } else {
          showLiquidToast(data.message || 'Could not remove limit', 'hgi-alert-circle');
        }
      } catch (err) {
        showLiquidToast('Network error removing limit', 'hgi-alert-circle');
      }
    });
  });
}

// --------------------------------------------------------------------------
// Key Pause / Resume (Access Suspension)
// --------------------------------------------------------------------------
async function togglePauseKey(keyId, btnElement) {
  try {
    const res = await fetch(`/api/keys/${keyId}/toggle-pause`, { method: 'POST' });
    const data = await res.json();

    if (data.status === 'ok') {
      const isPaused = data.paused;
      showLiquidToast(
        isPaused ? `Key #${keyId} traffic suspended (Paused)` : `Key #${keyId} access resumed`,
        isPaused ? 'hgi-pause' : 'hgi-play'
      );
      await refreshDashboardStats();
    } else {
      showLiquidToast(data.message || 'Failed to toggle key status', 'hgi-alert-circle');
    }
  } catch (e) {
    showLiquidToast('Network error toggling pause', 'hgi-alert-circle');
  }
}

// --------------------------------------------------------------------------
// Delete Confirmation Modal with AJAX Execution
// --------------------------------------------------------------------------
let pendingDeleteKeyId = null;
let pendingDeleteCard = null;

function confirmDeleteKey(formIdOrKeyId, keyName) {
  const modalBackdrop = document.getElementById('deleteConfirmModal');
  const modalText = document.getElementById('deleteModalText');
  pendingDeleteKeyId = formIdOrKeyId.replace('deleteForm-', '');
  pendingDeleteCard = document.querySelector(`.key-card[data-key-id="${pendingDeleteKeyId}"]`);

  if (modalText) {
    modalText.innerHTML = `Are you sure you want to delete access key <strong>${keyName || pendingDeleteKeyId}</strong>? Clients connected with this key will immediately lose access.`;
  }

  if (modalBackdrop) {
    modalBackdrop.classList.add('active');
  }
}

function closeDeleteModal() {
  const modalBackdrop = document.getElementById('deleteConfirmModal');
  if (modalBackdrop) {
    modalBackdrop.classList.remove('active');
  }
  pendingDeleteKeyId = null;
  pendingDeleteCard = null;
}

async function executeDeleteKey() {
  if (!pendingDeleteKeyId) return;

  try {
    const res = await fetch(`/api/keys/${pendingDeleteKeyId}/delete`, { method: 'POST' });
    const data = await res.json();

    if (data.status === 'ok') {
      showLiquidToast(`Key #${pendingDeleteKeyId} deleted.`, 'hgi-delete-02');
      if (pendingDeleteCard) {
        pendingDeleteCard.style.transition = 'all 0.35s ease';
        pendingDeleteCard.style.opacity = '0';
        pendingDeleteCard.style.transform = 'scale(0.92) translateY(-10px)';
        setTimeout(() => {
          if (pendingDeleteCard.parentNode) pendingDeleteCard.parentNode.removeChild(pendingDeleteCard);
          updateKeyCountBadge();
        }, 350);
      }
    } else {
      showLiquidToast(data.message || 'Failed to delete key', 'hgi-alert-circle');
    }
  } catch (err) {
    showLiquidToast('Network error deleting key', 'hgi-alert-circle');
  } finally {
    closeDeleteModal();
  }
}

function updateKeyCountBadge() {
  const cards = document.querySelectorAll('.key-card');
  const badge = document.getElementById('keyCountBadge');
  const statBadge = document.getElementById('statActiveKeysCount');
  if (badge) badge.textContent = cards.length;
  if (statBadge) statBadge.textContent = cards.length;
}

// --------------------------------------------------------------------------
// Real-time Key Search & Filter
// --------------------------------------------------------------------------
function initKeyFilter() {
  const searchInput = document.getElementById('keySearchInput');
  if (!searchInput) return;

  const cards = document.querySelectorAll('.key-card');
  const countBadge = document.getElementById('keyCountBadge');
  const totalCount = cards.length;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    let visibleCount = 0;

    cards.forEach(card => {
      const name = (card.getAttribute('data-key-name') || '').toLowerCase();
      const id = (card.getAttribute('data-key-id') || '').toLowerCase();

      if (!query || name.includes(query) || id.includes(query)) {
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    if (countBadge) {
      countBadge.textContent = query ? `${visibleCount} of ${totalCount}` : `${totalCount}`;
    }
  });
}

// --------------------------------------------------------------------------
// Live Polling & Dashboard Stats Refresh
// --------------------------------------------------------------------------
let liveSyncInterval = null;

async function refreshDashboardStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    const data = await res.json();

    // 1. Update month transfer
    const totalGB = (data.total_month_usage / 1000 / 1000 / 1000).toFixed(2);
    const statTransfer = document.getElementById('statTotalTransfer');
    if (statTransfer) statTransfer.textContent = totalGB;

    // 2. Update active count
    updateKeyCountBadge();

    // 3. Update Chart if active
    if (window.bandwidthChart && data.keys) {
      updateUsageChart(data.keys);
    }
  } catch (e) {
    // silent fail
  }
}

function initLiveSync() {
  const toggle = document.getElementById('liveSyncToggle');
  if (!toggle) return;

  toggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      showLiquidToast('Live Sync active (every 20s)', 'hgi-activity-01');
      liveSyncInterval = setInterval(refreshDashboardStats, 20000);
    } else {
      if (liveSyncInterval) clearInterval(liveSyncInterval);
      showLiquidToast('Live Sync paused', 'hgi-pause');
    }
  });
}

// --------------------------------------------------------------------------
// Bandwidth Distribution Analytics (Chart.js)
// --------------------------------------------------------------------------
function initBandwidthChart(keysData) {
  const canvas = document.getElementById('bandwidthChart');
  if (!canvas || !window.Chart) return;

  const validKeys = (keysData || []).filter(k => (k.used_bytes || 0) > 0);
  const labels = validKeys.length > 0 ? validKeys.map(k => k.name || `Key #${k.key_id}`) : ['No active usage'];
  const values = validKeys.length > 0 ? validKeys.map(k => (k.used_bytes / 1000 / 1000 / 1000).toFixed(2)) : [1];

  const colors = [
    '#00f2fe', '#10b981', '#a855f7', '#f59e0b', '#f43f5e',
    '#38bdf8', '#34d399', '#c084fc', '#fbbf24', '#fb7185'
  ];

  window.bandwidthChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: validKeys.length > 0 ? colors.slice(0, values.length) : ['rgba(255,255,255,0.08)'],
        borderColor: 'rgba(10, 13, 20, 0.8)',
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#94a3b8',
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
            boxWidth: 12,
            padding: 12
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              if (validKeys.length === 0) return ' 0 GB used';
              return ` ${context.label}: ${context.raw} GB`;
            }
          }
        }
      },
      cutout: '72%'
    }
  });
}

function updateUsageChart(keysData) {
  if (!window.bandwidthChart) return;
  const validKeys = (keysData || []).filter(k => (k.used_bytes || 0) > 0);
  const labels = validKeys.length > 0 ? validKeys.map(k => k.name || `Key #${k.key_id}`) : ['No active usage'];
  const values = validKeys.length > 0 ? validKeys.map(k => (k.used_bytes / 1000 / 1000 / 1000).toFixed(2)) : [1];

  window.bandwidthChart.data.labels = labels;
  window.bandwidthChart.data.datasets[0].data = values;
  window.bandwidthChart.update();
}

// --------------------------------------------------------------------------
// Multi-Server Profile Switcher (Local Storage)
// --------------------------------------------------------------------------
const SERVERS_STORAGE_KEY = 'outline_saved_servers';

function getSavedServers() {
  try {
    return JSON.parse(localStorage.getItem(SERVERS_STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveCurrentServerProfile(serverName, apiUrl, certSha256) {
  if (!apiUrl) return;
  const servers = getSavedServers();
  const existingIdx = servers.findIndex(s => s.apiUrl === apiUrl);
  const profile = { name: serverName || 'Outline Server', apiUrl, certSha256, lastUsed: Date.now() };

  if (existingIdx >= 0) {
    servers[existingIdx] = profile;
  } else {
    servers.push(profile);
  }
  localStorage.setItem(SERVERS_STORAGE_KEY, JSON.stringify(servers));
}

function showMultiServerModal() {
  const modal = document.getElementById('serverSwitcherModal');
  const listContainer = document.getElementById('serverProfilesList');
  if (!modal || !listContainer) return;

  const servers = getSavedServers();
  listContainer.innerHTML = '';

  if (servers.length === 0) {
    listContainer.innerHTML = `
      <div style="padding: 18px; text-align: center; color: var(--text-muted); font-size: 0.88rem;">
        No additional saved servers found. Add another Outline server credentials below.
      </div>
    `;
  } else {
    servers.forEach((srv) => {
      const item = document.createElement('div');
      item.className = 'config-item';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.justifyContent = 'space-between';
      item.style.marginBottom = '10px';
      item.innerHTML = `
        <div>
          <div style="font-weight: 700; color: #fff; font-size: 0.95rem;">${srv.name}</div>
          <div style="font-size: 0.76rem; color: var(--text-muted); font-family: var(--font-mono);">${srv.apiUrl.split('@')[1] || srv.apiUrl}</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="liquid-btn liquid-btn-cyan liquid-btn-sm" onclick='switchToSavedServer(${JSON.stringify(JSON.stringify({apiUrl: srv.apiUrl, certSha256: srv.certSha256}))})'>
            <span>Connect</span>
          </button>
          <button type="button" class="liquid-btn liquid-btn-danger liquid-btn-icon sm" onclick="removeSavedServer('${srv.apiUrl}')">
            <i class="hgi-stroke hgi-delete-02"></i>
          </button>
        </div>
      `;
      listContainer.appendChild(item);
    });
  }

  modal.classList.add('active');
}

function closeMultiServerModal() {
  const modal = document.getElementById('serverSwitcherModal');
  if (modal) modal.classList.remove('active');
}

function removeSavedServer(apiUrl) {
  let servers = getSavedServers().filter(s => s.apiUrl !== apiUrl);
  localStorage.setItem(SERVERS_STORAGE_KEY, JSON.stringify(servers));
  showMultiServerModal();
}

function switchToSavedServer(rawJson) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/sign-in';

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'outputJsonForm';
  input.value = rawJson;
  form.appendChild(input);

  document.body.appendChild(form);
  form.submit();
}

// --------------------------------------------------------------------------
// QR Code & Client Invite Modals
// --------------------------------------------------------------------------
function showQrModal(accessUrl, keyName, keyId) {
  const modalBackdrop = document.getElementById('qrModal');
  const qrContainer = document.getElementById('qrCodeContainer');
  const qrKeyTitle = document.getElementById('qrKeyTitle');
  const qrUrlInput = document.getElementById('qrAccessUrl');
  const inviteBtn = document.getElementById('qrInvitePageBtn');

  if (qrKeyTitle) qrKeyTitle.textContent = keyName || 'Access Key';
  if (qrUrlInput) qrUrlInput.value = accessUrl || '';

  if (inviteBtn && keyId) {
    inviteBtn.href = `/invite/${keyId}`;
  }

  if (qrContainer && accessUrl) {
    qrContainer.innerHTML = '';
    const qrImg = document.createElement('img');
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(accessUrl)}&color=00f2fe&bgcolor=06080d&margin=1`;
    qrImg.alt = "Outline Access QR Code";
    qrImg.style.width = "190px";
    qrImg.style.height = "190px";
    qrImg.style.borderRadius = "14px";
    qrImg.style.boxShadow = "0 8px 24px rgba(0, 242, 254, 0.25)";
    qrContainer.appendChild(qrImg);
  }

  if (modalBackdrop) {
    modalBackdrop.classList.add('active');
  }
}

function closeQrModal() {
  const modalBackdrop = document.getElementById('qrModal');
  if (modalBackdrop) {
    modalBackdrop.classList.remove('active');
  }
}

// --------------------------------------------------------------------------
// Sign-in Helpers (Paste, Toggle, AJAX Sign-in)
// --------------------------------------------------------------------------
function initSignInHelpers() {
  const pasteBtn = document.getElementById('pasteJsonBtn');
  const input = document.getElementById('outputJsonForm');
  const toggleBtn = document.getElementById('togglePasswordBtn');
  const signInForm = document.getElementById('signInForm');

  if (pasteBtn && input) {
    pasteBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          input.value = text;
          showLiquidToast('Installation output pasted!', 'hgi-clipboard-copy');
          input.focus();
        }
      } catch (err) {
        showLiquidToast('Clipboard permission needed to paste', 'hgi-alert-circle');
      }
    });
  }

  if (toggleBtn && input) {
    toggleBtn.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      const icon = toggleBtn.querySelector('i');
      if (icon) {
        icon.className = isPassword ? 'hgi-stroke hgi-view-off-slash' : 'hgi-stroke hgi-view';
      }
    });
  }

  // Auto-save current server to multi-server list on successful login
  if (signInForm) {
    signInForm.addEventListener('submit', () => {
      if (input && input.value) {
        try {
          const parsed = JSON.parse(input.value.trim());
          if (parsed.apiUrl) {
            saveCurrentServerProfile('Outline Server', parsed.apiUrl, parsed.certSha256);
          }
        } catch (e) {}
      }
    });
  }
}

// --------------------------------------------------------------------------
// PWA Service Worker Registration
// --------------------------------------------------------------------------
function registerPwaServiceWorker() {
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

// --------------------------------------------------------------------------
// Initialization on Page Load
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initKeyFilter();
  initSignInHelpers();
  initAjaxKeyActions();
  initLiveSync();
  registerPwaServiceWorker();

  // Run ping check if on dashboard
  if (document.getElementById('serverPingBadge')) {
    checkServerLatency();
    setInterval(checkServerLatency, 45000);
  }

  // Modal backdrop click-to-close
  document.querySelectorAll('.glass-modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove('active');
      }
    });
  });

  // ESC key closes any open modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.glass-modal-backdrop.active').forEach(modal => {
        modal.classList.remove('active');
      });
    }
  });
});
