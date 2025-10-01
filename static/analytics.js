// analytics.js - улучшенная версия для трекинга
const Analytics = {
  trackEvent(action, details = {}) {
    try {
      const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
      const platform = window.Telegram?.WebApp?.platform || 'unknown';
      
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

  // Трекинг просмотра сборки
  trackBuildView(buildData) {
    this.trackEvent('view_build', {
      title: buildData.title,
      weapon_name: buildData.weapon,
      category: buildData.category
    });
  },

  // Трекинг поиска
  trackSearch(query) {
    this.trackEvent('search', {
      query: query
    });
  },

  // Трекинг открытия экрана
  trackScreenOpen(screenName) {
    this.trackEvent('open_screen', {
      screen: screenName
    });
  }
};

// Автоматические события
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    Analytics.trackEvent('session_start', {
      platform: window.Telegram?.WebApp?.platform || 'unknown',
      url: window.location.href
    });
  }, 1000);
});

if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.onEvent('web_app_close', () => {
    Analytics.trackEvent('session_end');
  });
}

window.addEventListener('beforeunload', () => {
  Analytics.trackEvent('session_end');
});

// Глобальный экспорт
window.Analytics = Analytics;
