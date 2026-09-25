/**
 * OUTLINE WEB MANAGER - LIQUID GLASS iOS 27 INTERACTIVE ENGINE
 * Handles: Toasts, Copy-to-Clipboard with morphing feedback, Key Search/Filter,
 * Delete Confirmation Modals, and QR Code generation.
 */

// Toast System
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

// Copy to Clipboard with Button Morphing
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
    navigator.clipboard.writeText(text).then(onCopied).catch(err => {
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

// Key Filter Functionality
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

// Delete Confirmation Modal
let pendingDeleteForm = null;

function confirmDeleteKey(formId, keyName) {
  const modalBackdrop = document.getElementById('deleteConfirmModal');
  const modalText = document.getElementById('deleteModalText');
  pendingDeleteForm = document.getElementById(formId);

  if (modalText) {
    modalText.innerHTML = `Are you sure you want to delete access key <strong>${keyName || 'this key'}</strong>? This action cannot be undone and clients using this key will immediately lose access.`;
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
  pendingDeleteForm = null;
}

function executeDeleteKey() {
  if (pendingDeleteForm) {
    pendingDeleteForm.submit();
  }
  closeDeleteModal();
}

// QR Code Modal
function showQrModal(accessUrl, keyName) {
  const modalBackdrop = document.getElementById('qrModal');
  const qrContainer = document.getElementById('qrCodeContainer');
  const qrKeyTitle = document.getElementById('qrKeyTitle');
  const qrUrlInput = document.getElementById('qrAccessUrl');

  if (qrKeyTitle) qrKeyTitle.textContent = keyName || 'Access Key';
  if (qrUrlInput) qrUrlInput.value = accessUrl || '';

  if (qrContainer && accessUrl) {
    qrContainer.innerHTML = '';
    // Generate clean QR code using SVG API or Image
    const qrImg = document.createElement('img');
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(accessUrl)}&color=00f2fe&bgcolor=06080d&margin=1`;
    qrImg.alt = "Outline Access QR Code";
    qrImg.style.width = "200px";
    qrImg.style.height = "200px";
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

// Sign-in Helpers: Paste from clipboard and toggle visibility
function initSignInHelpers() {
  const pasteBtn = document.getElementById('pasteJsonBtn');
  const input = document.getElementById('outputJsonForm');
  const toggleBtn = document.getElementById('togglePasswordBtn');

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
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  initKeyFilter();
  initSignInHelpers();

  // Close modals on backdrop click
  document.querySelectorAll('.glass-modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove('active');
      }
    });
  });

  // ESC key closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.glass-modal-backdrop.active').forEach(modal => {
        modal.classList.remove('active');
      });
    }
  });
});
