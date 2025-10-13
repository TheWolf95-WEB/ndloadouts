// ===========================================
// 📱 NDHQ Global Swipe System v5.0
// ===========================================

(function () {
  if (window.__NDHQSwipeInstalled) return;
  window.__NDHQSwipeInstalled = true;

  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let deltaY = 0;
  let active = false;
  let currentScreen = null;
  let isVertical = false;

  const EDGE_ZONE = 40;     // отступ от левого края
  const TRIGGER = 35;       // длина свайпа для goBack()
  const MAX_OPACITY = 0.3;  // тень при перетаскивании

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (touch.clientX > EDGE_ZONE) return; // только от левого края

    currentScreen = document.querySelector('.screen.active');
    if (!currentScreen) return;

    // Не свайпаем на домашнем экране
    const id = currentScreen.id || '';
    if (id === 'screen-home' || id === 'screen-warzone-main' || id === 'screen-battlefield-main') return;

    startX = touch.clientX;
    startY = touch.clientY;
    deltaX = 0;
    deltaY = 0;
    active = true;
    isVertical = false;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!active || e.touches.length !== 1) return;
    const touch = e.touches[0];
    deltaX = touch.clientX - startX;
    deltaY = touch.clientY - startY;

    // определяем, вертикальный ли свайп
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      isVertical = true;
      return;
    }

    if (isVertical || deltaX <= 0) return;

    e.preventDefault(); // блокируем горизонтальный скролл
    const progress = Math.min(deltaX / window.innerWidth, 1);

    // плавный сдвиг экрана и затемнение фона
    currentScreen.style.transform = `translateX(${deltaX}px)`;
    currentScreen.style.transition = 'none';
    currentScreen.style.boxShadow = `rgba(0,0,0,${MAX_OPACITY * (1 - progress)}) 0px 0px 20px`;
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!active || !currentScreen || isVertical) return;
    active = false;

    // если свайп длинный — возвращаемся назад
    if (deltaX > TRIGGER) {
      // длинный свайп — возврат
      currentScreen.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';
      currentScreen.style.transform = `translateX(100%)`;
      currentScreen.style.opacity = '0';
    
      setTimeout(() => {
        currentScreen.style.transform = '';
        currentScreen.style.opacity = '';
        currentScreen.style.boxShadow = '';
        currentScreen.style.transition = '';
        currentScreen = null;
    
        try {
          if (window.Telegram?.WebApp?.HapticFeedback) {
            Telegram.WebApp.HapticFeedback.impactOccurred('light');
          } else if (navigator.vibrate) {
            navigator.vibrate(10);
          }
        } catch {}
    
        if (typeof window.goBack === 'function') {
          window.goBack();
        }
      }, 120);
    } else if (deltaX > 0 && deltaX <= TRIGGER) {
      // короткий свайп — вернуть с эффектом "отката"
      currentScreen.style.transition = 'transform 0.2s ease-out';
      currentScreen.style.transform = 'translateX(0)';
      currentScreen.style.opacity = '1';
      setTimeout(() => {
        currentScreen.style.transition = '';
        currentScreen.style.boxShadow = 'none';
        currentScreen = null;
      }, 200);
    }

  }, { passive: true });

  console.log('✅ NDHQ Swipe System v5.0 activated');
})();
