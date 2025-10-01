// static/analytics.js
const Analytics = {
  trackEvent(action, details = {}) {
    try {
      const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
      const platform = window.Telegram?.WebApp?.platform || 'unknown';
      
      // Только реальные пользователи
      if (!user?.id) return;
      
      // Быстрая отправка без ожидания ответа
      fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          action: action,
          details: { ...details, platform },
          timestamp: new Date().toISOString()
        })
      }).catch(() => {}); // Игнорируем ошибки для скорости
    } catch (error) {
      // Игнорируем ошибки трекинга
    }
  },

  trackBuildView(buildData) {
    this.trackEvent('view_build', {
      title: buildData.title,
      weapon_name: buildData.weapon,
      category: buildData.category
    });
  },

  trackSearch(query) {
    this.trackEvent('search', {
      query: query
    });
  },

  trackScreenOpen(screenName) {
    this.trackEvent('open_screen', {
      screen: screenName
    });
  },

  trackButtonClick(buttonName) {
    this.trackEvent('click_button', {
      button: buttonName
    });
  }
};

// Мгновенный трекинг при загрузке
if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
  setTimeout(() => {
    Analytics.trackEvent('session_start', {
      platform: window.Telegram?.WebApp?.platform || 'unknown',
      url: window.location.href
    });
  }, 500); // Быстрее старт
}

if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.onEvent('web_app_close', () => {
    Analytics.trackEvent('session_end');
  });
}

window.Analytics = Analytics;
