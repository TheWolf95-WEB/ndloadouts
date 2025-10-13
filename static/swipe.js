// =======================================
// 📱 NDHQ GLOBAL SWIPE SYSTEM (v2.2 STABLE)
// =======================================
// Работает на iPhone / Android без зависаний
// Реалистичный отклик, корректное восстановление transform

(function() {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let isSwiping = false;
  let activeScreen = null;

  const SWIPE_X_MIN = 70;     // минимальное смещение для "назад"
  const SWIPE_Y_MAX = 70;     // вертикальный порог
  const SWIPE_ELASTICITY = 0.35;
  const SWIPE_VELOCITY_MIN = 0.25; // защита от медленного свайпа

  let startTime = 0;

  window.setupGlobalSwipeBack = function() {
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
  };

  function onStart(e) {
    const t = e.changedTouches[0];
    startX = t.clientX;
    startY = t.clientY;
    currentX = startX;
    currentY = startY;
    isSwiping = false;
    startTime = Date.now();

    activeScreen = document.querySelector(".screen.active");
    if (!activeScreen) return;
    activeScreen.style.transition = "none";
  }

  function onMove(e) {
    if (!activeScreen) return;

    const t = e.changedTouches[0];
    currentX = t.clientX;
    currentY = t.clientY;
    const deltaX = currentX - startX;
    const deltaY = Math.abs(currentY - startY);

    // если пользователь начал вертикальный скролл — отменяем свайп
    if (deltaY > SWIPE_Y_MAX) {
      resetPosition();
      return;
    }

    // активируем свайп при движении вправо
    if (deltaX > 10 && deltaY < SWIPE_Y_MAX) {
      isSwiping = true;
      e.preventDefault();
      const shift = deltaX * SWIPE_ELASTICITY;
      activeScreen.style.transform = `translateX(${shift}px)`;
      activeScreen.style.opacity = `${1 - deltaX / 300}`;
    }
  }

  function onEnd(e) {
    if (!activeScreen) return;

    const deltaX = currentX - startX;
    const deltaT = Date.now() - startTime;
    const velocity = deltaX / deltaT; // скорость свайпа (px/ms)

    // Если это был "живой свайп", но не дотянут — вернём обратно
    if (!isSwiping || deltaX < 0) {
      resetPosition();
      return;
    }

    const isFast = velocity > SWIPE_VELOCITY_MIN;
    const isFar = deltaX > SWIPE_X_MIN;

    activeScreen.style.transition = "transform 0.25s ease-out, opacity 0.25s ease-out";

    if ((isFast || isFar) && window.goBack) {
      triggerGoBack();
    } else {
      resetPosition();
    }
  }

  function resetPosition() {
    if (!activeScreen) return;
    activeScreen.style.transition = "transform 0.25s ease-out, opacity 0.25s ease-out";
    activeScreen.style.transform = "translateX(0)";
    activeScreen.style.opacity = "1";
    activeScreen = null;
    isSwiping = false;
  }

  function triggerGoBack() {
    const current = document.querySelector(".screen.active");
    if (!current) return;

    if (current.id === "screen-home") {
      resetPosition();
      return;
    }

    current.style.transform = "translateX(100%)";
    current.style.opacity = "0";

    setTimeout(() => {
      window.goBack?.();
      current.style.transform = "";
      current.style.opacity = "";
      current.style.transition = "";
    }, 180);

    try {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.impactOccurred("medium");
      } else if (navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch {}
  }
})();
