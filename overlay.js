// DOM Elements
const statusBadge = document.getElementById('status-badge');
const opacityBadge = document.getElementById('opacity-badge');
const notification = document.getElementById('notification');
const notificationText = document.getElementById('notification-text');
const siteFrame = document.getElementById('site-frame');
const helpOverlay = document.getElementById('help-overlay');
const btnReload = document.getElementById('btn-reload');
const btnHelp = document.getElementById('btn-help');

let notificationTimeout = null;
let helpVisible = false;

// ============ Notifications ============
function showNotification(text, duration = 2000) {
  notificationText.textContent = text;
  notification.classList.remove('hidden');
  notification.classList.add('visible');

  if (notificationTimeout) clearTimeout(notificationTimeout);

  notificationTimeout = setTimeout(() => {
    notification.classList.remove('visible');
    notification.classList.add('hidden');
  }, duration);
}

// ============ IPC Event Handlers ============

// Click-through mode changed
window.overlayAPI.onClickThroughChanged((isClickThrough) => {
  if (isClickThrough) {
    statusBadge.textContent = '🔓 Прозрачный';
    statusBadge.className = 'badge click-through';
    showNotification('🔓 Режим прозрачности — клики проходят в игру');
    // Hide help when switching to click-through
    if (helpVisible) {
      helpOverlay.classList.add('hidden');
      helpVisible = false;
    }
  } else {
    statusBadge.textContent = '🖱️ Интерактивный';
    statusBadge.className = 'badge interactive';
    showNotification('🖱️ Режим управления — можно взаимодействовать с сайтом');
  }
});

// Opacity changed
window.overlayAPI.onOpacityChanged((value) => {
  opacityBadge.textContent = `${value}%`;
  showNotification(`🔅 Прозрачность: ${value}%`, 1500);
});

// Initial state
window.overlayAPI.onInitialState((state) => {
  opacityBadge.textContent = `${state.opacity}%`;
  if (state.isClickThrough) {
    statusBadge.textContent = '🔓 Прозрачный';
    statusBadge.className = 'badge click-through';
  } else {
    statusBadge.textContent = '🖱️ Интерактивный';
    statusBadge.className = 'badge interactive';
  }
  // Load the configured URL
  if (state.url && siteFrame.src !== state.url) {
    siteFrame.src = state.url;
  }
});

// Reload iframe
window.overlayAPI.onReloadWebview(() => {
  siteFrame.src = siteFrame.src;
  showNotification('🔄 Перезагрузка...');
});

// ============ Button handlers ============
btnReload.addEventListener('click', () => {
  siteFrame.src = siteFrame.src;
  showNotification('🔄 Перезагрузка...');
});

btnHelp.addEventListener('click', () => {
  helpVisible = !helpVisible;
  if (helpVisible) {
    helpOverlay.classList.remove('hidden');
  } else {
    helpOverlay.classList.add('hidden');
  }
});

// ============ Help overlay dismiss ============
helpOverlay.addEventListener('click', () => {
  helpOverlay.classList.add('hidden');
  helpVisible = false;
});

// ============ Init ============
window.overlayAPI.requestState();

// Show welcome notification
setTimeout(() => {
  showNotification('🎮 DBD Fog Overlay запущен! Alt+F1 — скрыть/показать', 4000);
}, 1500);
