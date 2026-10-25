// DOM Elements
const statusBadge = document.getElementById('status-badge');
const opacityBadge = document.getElementById('opacity-badge');
const notification = document.getElementById('notification');
const notificationText = document.getElementById('notification-text');
const siteFrame = document.getElementById('site-frame');

// Title Bar Buttons
const btnSettings = document.getElementById('btn-settings');
const btnReload = document.getElementById('btn-reload');
const btnClose = document.getElementById('btn-close');

// Modal Elements
const settingsModal = document.getElementById('settings-modal');
const btnModalClose = document.getElementById('btn-modal-close');
const btnModalDone = document.getElementById('btn-modal-done');

// Setting Controls
const hotkeyRecordBtn = document.getElementById('hotkey-record-btn');
const hotkeyBtnText = document.getElementById('hotkey-btn-text');
const hotkeyRecordHint = document.getElementById('hotkey-record-hint');
const presetKeys = document.querySelectorAll('.preset-key');
const presetUrls = document.querySelectorAll('.preset-url');

const modeRadios = document.querySelectorAll('input[name="hideMode"]');
const opacitySlider = document.getElementById('opacity-slider');
const opacitySliderVal = document.getElementById('opacity-slider-val');

const inputWidth = document.getElementById('input-width');
const inputHeight = document.getElementById('input-height');
const btnApplySize = document.getElementById('btn-apply-size');
const btnResetPos = document.getElementById('btn-reset-pos');

const inputUrl = document.getElementById('input-url');
const btnSaveUrl = document.getElementById('btn-save-url');

const chkAutoLaunch = document.getElementById('chk-autolaunch');
const chkNotifications = document.getElementById('chk-notifications');

// State
let currentSettings = {
  hotkey: 'F2',
  hideMode: 'hide',
  opacity: 85,
  url: '',
  width: 1280,
  height: 720,
  showNotifications: true,
  autoLaunch: false,
};

let isRecordingHotkey = false;
let notificationTimeout = null;

// ============ Notification Toast ============
function showNotification(text, duration = 2200) {
  if (!currentSettings.showNotifications && !text.includes('Ошибка')) return;

  notificationText.textContent = text;
  notification.classList.remove('hidden');
  notification.classList.add('visible');

  if (notificationTimeout) clearTimeout(notificationTimeout);
  notificationTimeout = setTimeout(() => {
    notification.classList.remove('visible');
    notification.classList.add('hidden');
  }, duration);
}

// ============ UI Update Functions ============
function updateStatusBadge(isActive, hotkey, hideMode) {
  const keyLabel = hotkey || currentSettings.hotkey || 'F2';
  if (isActive) {
    statusBadge.textContent = `🟢 Мышь активна [${keyLabel}]`;
    statusBadge.className = 'badge active';
    statusBadge.title = `Нажмите ${keyLabel} или Esc, чтобы вернуть управление в игру`;
  } else {
    statusBadge.textContent = `🟡 HUD [${keyLabel}]`;
    statusBadge.className = 'badge hud';
    statusBadge.title = `Нажмите ${keyLabel}, чтобы захватить мышь`;
  }
}

function updateOpacityUI(value) {
  opacityBadge.textContent = `${value}%`;
  opacitySliderVal.textContent = `${value}%`;
  opacitySlider.value = value;
}

function populateSettingsUI(settings) {
  currentSettings = { ...currentSettings, ...settings };

  // Hotkey
  hotkeyBtnText.textContent = currentSettings.hotkey;

  // Status Badge
  updateStatusBadge(settings.isActive ?? true, currentSettings.hotkey, currentSettings.hideMode);

  // Hide Mode
  modeRadios.forEach((radio) => {
    radio.checked = radio.value === currentSettings.hideMode;
  });

  // Opacity
  updateOpacityUI(currentSettings.opacity);

  // Dimensions
  if (currentSettings.width) inputWidth.value = currentSettings.width;
  if (currentSettings.height) inputHeight.value = currentSettings.height;

  // URL & iframe
  if (currentSettings.url) {
    inputUrl.value = currentSettings.url;
    if (siteFrame.src === 'about:blank' || siteFrame.src !== currentSettings.url) {
      siteFrame.src = currentSettings.url;
    }
  }

  // Checkboxes
  chkAutoLaunch.checked = !!currentSettings.autoLaunch;
  chkNotifications.checked = currentSettings.showNotifications !== false;
}

// ============ Hotkey Recording ============
function startRecordingHotkey() {
  if (isRecordingHotkey) return;
  isRecordingHotkey = true;
  hotkeyRecordBtn.classList.add('recording');
  hotkeyBtnText.textContent = 'Нажмите клавишу...';
  hotkeyRecordHint.textContent = 'Нажмите любую клавишу или комбинацию (Esc для отмены)';
}

function stopRecordingHotkey() {
  if (!isRecordingHotkey) return;
  isRecordingHotkey = false;
  hotkeyRecordBtn.classList.remove('recording');
  hotkeyBtnText.textContent = currentSettings.hotkey;
  hotkeyRecordHint.textContent = 'Нажмите на кнопку выше, чтобы изменить клавишу';
}

function parseKeyEventToAccelerator(e) {
  if (e.key === 'Escape') {
    return { isEscape: true };
  }

  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
    return { isModifierOnly: true };
  }

  const modifiers = [];
  if (e.ctrlKey) modifiers.push('Ctrl');
  if (e.altKey) modifiers.push('Alt');
  if (e.shiftKey) modifiers.push('Shift');
  if (e.metaKey) modifiers.push('Super');

  let key = '';

  // Function keys F1 - F24
  if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(e.code) || /^F([1-9]|1[0-9]|2[0-4])$/i.test(e.key)) {
    key = e.code.startsWith('F') ? e.code : e.key;
  }
  // Standard letters: using e.code avoids issues with Russian keyboard layouts
  else if (e.code.startsWith('Key')) {
    key = e.code.slice(3).toUpperCase();
  }
  // Digit keys
  else if (e.code.startsWith('Digit')) {
    key = e.code.slice(5);
  }
  // Numpad digits
  else if (e.code.startsWith('Numpad')) {
    const np = e.code.slice(6);
    key = /^\d$/.test(np) ? `num${np}` : np;
  }
  // Special keys mapping
  else {
    const specialMap = {
      Backquote: '`',
      Space: 'Space',
      Tab: 'Tab',
      Minus: '-',
      Equal: '=',
      BracketLeft: '[',
      BracketRight: ']',
      Backslash: '\\',
      Semicolon: ';',
      Quote: '\'',
      Comma: ',',
      Period: '.',
      Slash: '/',
      Insert: 'Insert',
      Delete: 'Delete',
      Home: 'Home',
      End: 'End',
      PageUp: 'PageUp',
      PageDown: 'PageDown',
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right',
      ScrollLock: 'ScrollLock',
      Pause: 'Pause',
      PrintScreen: 'PrintScreen',
    };

    if (specialMap[e.code]) {
      key = specialMap[e.code];
    } else {
      key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    }
  }

  return { accelerator: [...modifiers, key].join('+') };
}

async function applyNewHotkey(accelerator) {
  if (!accelerator) return;

  const result = await window.overlayAPI.setHotkey(accelerator);
  if (result.success) {
    currentSettings.hotkey = result.hotkey;
    hotkeyBtnText.textContent = result.hotkey;
    updateStatusBadge(true, result.hotkey, currentSettings.hideMode);
    showNotification(`Клавиша триггера установлена: [${result.hotkey}]`);
  } else {
    showNotification(result.error || 'Ошибка при установке клавиши', 3500);
    hotkeyBtnText.textContent = currentSettings.hotkey;
  }
  stopRecordingHotkey();
}

// Global key listener for recording hotkeys & Esc to close
window.addEventListener('keydown', (e) => {
  if (isRecordingHotkey) {
    e.preventDefault();
    e.stopPropagation();

    const parsed = parseKeyEventToAccelerator(e);
    if (parsed.isEscape) {
      stopRecordingHotkey();
      return;
    }
    if (parsed.isModifierOnly) {
      return;
    }
    if (parsed.accelerator) {
      applyNewHotkey(parsed.accelerator);
    }
    return;
  }

  // If not recording, Esc deactivates the overlay or closes settings modal
  if (e.key === 'Escape') {
    if (!settingsModal.classList.contains('hidden')) {
      closeSettingsModal();
    } else {
      window.overlayAPI.deactivate();
    }
  }
}, true);

// ============ Settings Modal Open/Close ============
function openSettingsModal() {
  settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
  stopRecordingHotkey();
  settingsModal.classList.add('hidden');
}

btnSettings.addEventListener('click', () => {
  if (settingsModal.classList.contains('hidden')) {
    openSettingsModal();
  } else {
    closeSettingsModal();
  }
});

btnModalClose.addEventListener('click', closeSettingsModal);
btnModalDone.addEventListener('click', closeSettingsModal);

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    closeSettingsModal();
  }
});

// Titlebar buttons
btnClose.addEventListener('click', () => {
  window.overlayAPI.deactivate();
});

btnReload.addEventListener('click', () => {
  siteFrame.src = currentSettings.url || 'about:blank';
  showNotification('🔄 Перезагрузка страницы...');
});

// Hotkey recorder button
hotkeyRecordBtn.addEventListener('click', () => {
  if (isRecordingHotkey) {
    stopRecordingHotkey();
  } else {
    startRecordingHotkey();
  }
});

// Hotkey Presets
presetKeys.forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.getAttribute('data-key');
    applyNewHotkey(key);
  });
});

// URL Presets
presetUrls.forEach((btn) => {
  btn.addEventListener('click', async () => {
    const url = btn.getAttribute('data-url');
    inputUrl.value = url;
    currentSettings.url = url;
    await window.overlayAPI.saveSettings({ url });
    siteFrame.src = url;
    showNotification(`🌐 Загружается: ${url}`);
  });
});

// Hide Mode
modeRadios.forEach((radio) => {
  radio.addEventListener('change', async (e) => {
    if (e.target.checked) {
      const mode = e.target.value;
      currentSettings.hideMode = mode;
      await window.overlayAPI.saveSettings({ hideMode: mode });
      showNotification(
        mode === 'hide'
          ? '🙈 Режим: Полное скрытие оверлея'
          : '👁️ Режим: Сквозной HUD поверх игры'
      );
    }
  });
});

// Opacity Slider
opacitySlider.addEventListener('input', (e) => {
  const val = Number(e.target.value);
  updateOpacityUI(val);
  window.overlayAPI.saveSettings({ opacity: val });
});

// Size and Position
btnApplySize.addEventListener('click', async () => {
  const width = Math.max(300, Math.min(2560, Number(inputWidth.value) || 1280));
  const height = Math.max(300, Math.min(1440, Number(inputHeight.value) || 720));

  inputWidth.value = width;
  inputHeight.value = height;

  await window.overlayAPI.saveSettings({ width, height });
  showNotification(`Размер окна изменен: ${width}x${height}`);
});

btnResetPos.addEventListener('click', async () => {
  const bounds = await window.overlayAPI.resetPosition();
  if (bounds) {
    inputWidth.value = bounds.width;
    inputHeight.value = bounds.height;
  }
  showNotification('📍 Позиция и размер сброшены');
});

// URL — open button
btnSaveUrl.addEventListener('click', async () => {
  let url = inputUrl.value.trim();
  if (!url) return showNotification('⚠️ Введите URL сайта');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  inputUrl.value = url;
  currentSettings.url = url;
  await window.overlayAPI.saveSettings({ url });
  siteFrame.src = url;
  showNotification(`🌐 Загружается: ${url}`);
});

// Also allow pressing Enter in URL input to navigate
inputUrl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    btnSaveUrl.click();
  }
});

// Checkboxes
chkAutoLaunch.addEventListener('change', async (e) => {
  const val = e.target.checked;
  currentSettings.autoLaunch = val;
  await window.overlayAPI.setAutoLaunch(val);
  showNotification(val ? 'Автозапуск с Windows включен' : 'Автозапуск отключен');
});

chkNotifications.addEventListener('change', async (e) => {
  const val = e.target.checked;
  currentSettings.showNotifications = val;
  await window.overlayAPI.saveSettings({ showNotifications: val });
  if (val) {
    showNotification('Уведомления включены');
  }
});

// ============ IPC Subscriptions ============
window.overlayAPI.onOverlayStateChanged(({ isActive, hideMode, hotkey }) => {
  if (hotkey) currentSettings.hotkey = hotkey;
  if (hideMode) currentSettings.hideMode = hideMode;

  updateStatusBadge(isActive, currentSettings.hotkey, currentSettings.hideMode);

  if (isActive) {
    showNotification(`🎮 Оверлей активен (${currentSettings.hotkey} — скрыть)`);
  } else {
    closeSettingsModal();
    if (currentSettings.hideMode === 'clickthrough') {
      showNotification('🔒 Мышь освобождена — клики идут в игру');
    }
  }
});

window.overlayAPI.onSettingsUpdated((settings) => {
  populateSettingsUI(settings);
});

window.overlayAPI.onOpenSettings(() => {
  openSettingsModal();
});

window.overlayAPI.onReloadWebview(() => {
  siteFrame.src = currentSettings.url || 'about:blank';
  showNotification('🔄 Перезагрузка страницы...');
});

// ============ Initialization ============
async function init() {
  const settings = await window.overlayAPI.getSettings();
  populateSettingsUI(settings);

  setTimeout(() => {
    showNotification(`🎮 Оверлей готов! Нажмите [${settings.hotkey || 'F2'}] для вызова в игре`, 3500);
  }, 1000);
}

init();
