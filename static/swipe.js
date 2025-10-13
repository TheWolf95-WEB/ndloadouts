// ===============================
// 🌐 NDHQ GLOBAL SWIPE-BACK SYSTEM
// ===============================

(function() {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoveX = 0;
  let touchMoveY = 0;
  let isSwiping = false;
  let startTime = 0;

  const SWIPE_THRESHOLD_X = 80;   // минимальная длина свайпа вправо
  const SWIPE_THRESHOLD_Y = 60;   // максимально допустимое вертикальное смещение
  const SWIPE_TIME_LIMIT = 600;   // макс. время в мс (чтобы не срабатывало на медленных жестах)

  // Главная функция инициализации
  window.setupGlobalSwipeBack = function() {
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
  };

  function onTouchStart(e) {
    const touch = e.changedTouches[0];
    touchStartX = touch.screenX;
    touchStartY = touch.screenY;
    touchMoveX = touchStartX;
    touchMoveY = touchStartY;
    isSwiping = false;
    startTime = Date.now();
  }

  function onTouchMove(e) {
    const touch = e.changedTouches[0];
    touchMoveX = touch.screenX;
    touchMoveY = touch.screenY;

    const deltaX = touchMoveX - touchStartX;
    const deltaY = Math.abs(touchMoveY - touchStartY);

    // Если движение вправо и вертикаль не сильная — считаем свайпом
    if (deltaX > 30 && deltaY < SWIPE_THRESHOLD_Y) {
      isSwiping = true;
    }
  }

  function onTouchEnd(e) {
    if (!isSwiping) return;

    const deltaX = touchMoveX - touchStartX;
    const deltaY = Math.abs(touchMoveY - touchStartY);
    const elapsed = Date.now() - startTime;

    // Проверяем что движение вправо, не слишком вертикальное и быстрое
    if (deltaX > SWIPE_THRESHOLD_X && deltaY < SWIPE_THRESHOLD_Y && elapsed < SWIPE_TIME_LIMIT) {
      triggerGoBack();
    }
  }

  function triggerGoBack() {
    if (!window.goBack) return;

    // Проверка чтобы не вызывать свайп с "главного экрана"
    const activeScreen = document.querySelector('.screen.active');
    if (!activeScreen) return;

    const currentId = activeScreen.id;
    if (['screen-home', 'screen-warzone-main', 'screen-battlefield-main'].includes(currentId)) {
      console.log('📱 Свайп назад отключён на главном экране.');
      return;
    }

    console.log('⬅️ Свайп-назад сработал');
    window.goBack();
  }
})();
