// =======================================
// 📱 NDHQ GLOBAL SWIPE SYSTEM (v2.1 FINAL)
// =======================================
// Реалистичный свайп-назад с "живым" откликом, работает на всех экранах кроме home
// Поддержка iPhone, Android, Telegram Haptic Feedback

(function() {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoveX = 0;
  let touchMoveY = 0;
  let startTime = 0;
  let isTracking = false;
  let activeScreen = null;

  const SWIPE_THRESHOLD_X = 100;   // минимальная длина свайпа вправо
  const SWIPE_THRESHOLD_Y = 70;    // максимально допустимое вертикальное смещение
  const SWIPE_TIME_LIMIT = 700;    // максимум 0.7 сек
  const SWIPE_ELASTICITY = 0.4;    // "сопротивление" движения

  window.setupGlobalSwipeBack = function() {
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
  };

  function onTouchStart(e) {
    const t = e.changedTouches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchMoveX = touchStartX;
    touchMoveY = touchStartY;
    startTime = Date.now();
    isTracking = true;

    activeScreen = document.querySelector('.screen.active');
  }

  function onTouchMove(e) {
    if (!isTracking || !activeScreen) return;

    const t = e.changedTouches[0];
    touchMoveX = t.clientX;
    touchMoveY = t.clientY;

    const deltaX = touchMoveX - touchStartX;
    const deltaY = Math.abs(touchMoveY - touchStartY);

    // если движение вертикальное — отменяем свайп
    if (deltaY > SWIPE_THRESHOLD_Y) {
      isTracking = false;
      activeScreen.style.transform = '';
      return;
    }

    // двигаем только вправо
    if (deltaX > 0) {
      e.preventDefault(); // блокируем прокрутку
      const translate = deltaX * SWIPE_ELASTICITY;
      activeScreen.style.transition = 'none';
      activeScreen.style.transform = `translateX(${translate}px)`;
      activeScreen.style.opacity = `${1 - deltaX / 400}`;
    }
  }

  function onTouchEnd(e) {
    if (!isTracking || !activeScreen) return;

    const deltaX = touchMoveX - touchStartX;
    const deltaY = Math.abs(touchMoveY - touchStartY);
    const elapsed = Date.now() - startTime;

    activeScreen.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';

    if (deltaX > SWIPE_THRESHOLD_X && deltaY < SWIPE_THRESHOLD_Y && elapsed < SWIPE_TIME_LIMIT) {
      triggerGoBack();
    } else {
      // если недосвайп — вернуть экран обратно
      activeScreen.style.transform = 'translateX(0)';
      activeScreen.style.opacity = '1';
    }

    isTracking = false;
  }

  function triggerGoBack() {
    if (!window.goBack) return;

    const active = document.querySelector('.screen.active');
    if (!active) return;

    const currentId = active.id;
    if (currentId === 'screen-home') {
      // 👇 Только экран Home блокирует свайп-назад
      active.style.transform = 'translateX(0)';
      active.style.opacity = '1';
      return;
    }

    // Анимация ухода вправо
    active.style.transform = 'translateX(100%)';
    active.style.opacity = '0';

    setTimeout(() => {
      window.goBack();
      active.style.transform = '';
      active.style.opacity = '';
    }, 200);

    // Вибрация для реализма
    try {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.impactOccurred('medium');
      } else if (navigator.vibrate) {
        navigator.vibrate(15);
      }
    } catch {}
  }
})();
