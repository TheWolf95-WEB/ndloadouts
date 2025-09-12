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
  }
};

// === Автоматические события ===

// Начало сессии (после полной загрузки DOM)
document.addEventListener('DOMContentLoaded', () => {
  Analytics.trackEvent('session_start', {
    platform: window.Telegram?.WebApp?.platform || 'unknown'
  });
});

// Конец сессии (когда закрывают WebApp)
window.Telegram?.WebApp?.onEvent('web_app_close', () => {
  Analytics.trackEvent('session_end');
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
