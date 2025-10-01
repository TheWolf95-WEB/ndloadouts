// analytics.js

const Analytics = {
  trackEvent(action, details = {}) {
    const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user?.id || null,
        action,
        details,
        timestamp: new Date().toISOString()
      })
    }).catch(err => console.error('Analytics error:', err));
  },

  trackError(error, details = {}) {
    const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user?.id || null,
        error: error?.toString(),
        details,
        timestamp: new Date().toISOString()
      })
    }).catch(err => console.error('Error logging failed:', err));
  },

  // 🔥 НОВЫЙ МЕТОД - отправка пинга каждые 15 секунд
  startPing() {
    const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (!user?.id) return;

    // Отправляем пинг сразу
    this.sendPing();
    
    // И каждые 15 секунд
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, 15000);
  },

  sendPing() {
    const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (!user?.id) return;

    fetch('/api/analytics/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        platform: window.Telegram?.WebApp?.platform || 'unknown',
        timestamp: new Date().toISOString()
      })
    }).catch(err => console.error('Ping error:', err));
  },

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
  }
};

// === Автоматические события ===
document.addEventListener('DOMContentLoaded', () => {
  Analytics.trackEvent('session_start', {
    platform: window.Telegram?.WebApp?.platform || 'unknown'
  });
  
  // 🔥 Запускаем пинг при старте
  Analytics.startPing();
});

// Конец сессии (когда закрывают WebApp)
window.Telegram?.WebApp?.onEvent('web_app_close', () => {
  Analytics.trackEvent('session_end');
  Analytics.stopPing(); // 🔥 Останавливаем пинг
});

// Также останавливаем пинг при уходе со страницы
window.addEventListener('beforeunload', () => {
  Analytics.stopPing();
});

// Ошибки JS
window.addEventListener('error', e => {
  Analytics.trackError(e.message, {
    source: e.filename,
    line: e.lineno,
    url: location.href
  });
});

window.addEventListener('unhandledrejection', e => {
  Analytics.trackError(e.reason, {
    type: 'promise',
    url: location.href
  });
});
