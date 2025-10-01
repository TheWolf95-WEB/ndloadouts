// analytics.js - исправленная версия
const Analytics = {
  trackEvent(action, details = {}) {
    try {
      const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
      const platform = window.Telegram?.WebApp?.platform || 'unknown';
      
      console.log(`📊 Tracking: ${action}`, details); // Лог для отладки
      
      fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id || 'anonymous',
          action: action,
          details: { ...details, platform },
          timestamp: new Date().toISOString()
        })
      }).catch(err => console.error('Analytics error:', err));
    } catch (error) {
      console.error('Analytics trackEvent error:', error);
    }
  },

  trackError(error, details = {}) {
    try {
      const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
      
      console.error('❌ Tracking error:', error, details);
      
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id || 'anonymous',
          error: error?.toString() || 'Unknown error',
          details: details,
          timestamp: new Date().toISOString()
        })
      }).catch(err => console.error('Error logging failed:', err));
    } catch (trackError) {
      console.error('Error tracking failed:', trackError);
    }
  }
};

// === Автоматические события ===

// Начало сессии (после полной загрузки DOM)
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    Analytics.trackEvent('session_start', {
      platform: window.Telegram?.WebApp?.platform || 'unknown',
      url: window.location.href,
      user_agent: navigator.userAgent
    });
  }, 1000);
});

// Конец сессии (когда закрывают WebApp)
if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.onEvent('web_app_close', () => {
    Analytics.trackEvent('session_end');
  });
}

// Перед закрытием страницы
window.addEventListener('beforeunload', () => {
  Analytics.trackEvent('session_end');
});

// Ошибки JS
window.addEventListener('error', (e) => {
  Analytics.trackError(e.message, {
    source: e.filename,
    line: e.lineno,
    column: e.colno,
    url: location.href,
    stack: e.error?.stack
  });
});

window.addEventListener('unhandledrejection', (e) => {
  Analytics.trackError(e.reason, {
    type: 'promise_rejection',
    url: location.href,
    stack: e.reason?.stack
  });
});

// Экспортируем для глобального использования
window.Analytics = Analytics;
