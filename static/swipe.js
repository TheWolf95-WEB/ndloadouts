// =======================================
// 📱 ULTRA PRECISE SWIPE SYSTEM (v3.0)
// =======================================

(function() {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let isSwiping = false;
  let activeScreen = null;
  let swipeAllowed = false;

  const SWIPE_THRESHOLD = 15;    // активация свайпа
  const SWIPE_BACK_MIN = 60;     // минимальное расстояние для возврата
  const SWIPE_VELOCITY_MIN = 0.3; // минимальная скорость
  const SWIPE_EDGE_ZONE = 20;    // зона от левого края

  let startTime = 0;
  let lastX = 0;
  let lastTime = 0;

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
    lastX = startX;
    isSwiping = false;
    swipeAllowed = false;
    startTime = Date.now();
    lastTime = startTime;

    // Разрешаем свайп только от левого края
    if (startX > SWIPE_EDGE_ZONE) return;

    activeScreen = document.querySelector(".screen.active");
    if (!activeScreen || activeScreen.id === "screen-home") return;
    
    activeScreen.style.transition = "none";
    activeScreen.style.willChange = "transform";
    swipeAllowed = true;
  }

  function onMove(e) {
    if (!activeScreen || !swipeAllowed) return;

    const t = e.changedTouches[0];
    currentX = t.clientX;
    const deltaX = currentX - startX;
    const deltaY = Math.abs(t.clientY - startY);

    // Блокируем вертикальный скролл при активном свайпе
    if (isSwiping) {
      e.preventDefault();
    }

    // Активируем свайп только после преодоления порога
    if (!isSwiping && deltaX > SWIPE_THRESHOLD && deltaY < 50) {
      isSwiping = true;
    }

    if (isSwiping) {
      const now = Date.now();
      const velocity = (currentX - lastX) / (now - lastTime);
      
      // Реалистичная физика с резиновым эффектом
      let translateX = deltaX;
      if (deltaX > 100) {
        translateX = 100 + (deltaX - 100) * 0.5; // резиновый эффект
      }
      
      activeScreen.style.transform = `translateX(${translateX}px)`;
      activeScreen.style.opacity = `${1 - Math.min(deltaX / 400, 0.3)}`;
      
      lastX = currentX;
      lastTime = now;
    }
  }

  function onEnd(e) {
    if (!activeScreen || !swipeAllowed) return;

    const deltaX = currentX - startX;
    const deltaTime = Date.now() - startTime;
    const velocity = deltaX / deltaTime;

    const isFastSwipe = velocity > SWIPE_VELOCITY_MIN;
    const isLongSwipe = deltaX > SWIPE_BACK_MIN;

    activeScreen.style.transition = "transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.2s linear";
    activeScreen.style.willChange = "auto";

    if ((isFastSwipe && deltaX > 30) || isLongSwipe) {
      triggerGoBack();
    } else {
      resetPosition();
    }

    isSwiping = false;
    swipeAllowed = false;
  }

  function resetPosition() {
    if (!activeScreen) return;
    activeScreen.style.transform = "translateX(0)";
    activeScreen.style.opacity = "1";
    
    setTimeout(() => {
      activeScreen.style.transition = "";
      activeScreen.style.willChange = "";
      activeScreen = null;
    }, 200);
  }

  function triggerGoBack() {
    const current = activeScreen;
    if (!current) return;

    current.style.transform = "translateX(100%)";
    current.style.opacity = "0";

    setTimeout(() => {
      window.goBack?.();
      current.style.transform = "";
      current.style.opacity = "";
      current.style.transition = "";
      current.style.willChange = "";
    }, 150);

    // Виброотклик
    try {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.impactOccurred("light");
      } else if (navigator.vibrate) {
        navigator.vibrate(5);
      }
    } catch {}
  }
})();
