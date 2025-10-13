// ==========================================
// 📱 NDHQ GLOBAL SWIPE SYSTEM (v4.1 STABLE)
// ==========================================
// Плавный свайп-назад с виброоткликом и защитой от скролла
// Работает во всех экранах Warzone / Battlefield

(function () {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let isSwiping = false;
  let activeScreen = null;
  let allowSwipe = false;
  let startTime = 0;

  const EDGE_ZONE = 25;          // зона активации (от левого края)
  const SWIPE_DISTANCE = 80;     // минимум пикселей для возврата
  const MAX_VERTICAL_DRIFT = 60; // максимум вертикального отклонения
  const ELASTICITY = 0.35;       // коэффициент пружины
  const SWIPE_TIME_LIMIT = 700;  // лимит по времени (мс)

  function onStart(e) {
    const t = e.changedTouches[0];
    startX = t.clientX;
    startY = t.clientY;
    currentX = startX;
    startTime = Date.now();
    isSwiping = false;
    allowSwipe = false;

    // свайп только от левого края
    if (startX > EDGE_ZONE) return;

    activeScreen = document.querySelector(".screen.active");
    if (!activeScreen || activeScreen.id === "screen-home") return;

    allowSwipe = true;
    activeScreen.style.transition = "none";
    activeScreen.style.willChange = "transform, opacity";
  }

  function onMove(e) {
    if (!allowSwipe || !activeScreen) return;

    const t = e.changedTouches[0];
    currentX = t.clientX;
    const deltaX = currentX - startX;
    const deltaY = Math.abs(t.clientY - startY);

    // отменяем, если сильное вертикальное движение
    if (deltaY > MAX_VERTICAL_DRIFT) {
      resetPosition();
      return;
    }

    // активируем свайп при горизонтальном движении
    if (!isSwiping && deltaX > 10) {
      isSwiping = true;
    }

    if (isSwiping && deltaX > 0) {
      e.preventDefault(); // блокируем скролл
      const shift = deltaX * ELASTICITY;
      activeScreen.style.transform = `translateX(${shift}px)`;
      activeScreen.style.opacity = `${1 - Math.min(deltaX / 300, 0.3)}`;
    }
  }

  function onEnd() {
    if (!allowSwipe || !activeScreen) return;

    const deltaX = currentX - startX;
    const deltaT = Date.now() - startTime;
    const velocity = deltaX / deltaT;

    activeScreen.style.transition =
      "transform 0.25s ease-out, opacity 0.25s ease-out";
    activeScreen.style.willChange = "auto";

    const shouldGoBack =
      deltaX > SWIPE_DISTANCE || (velocity > 0.5 && deltaX > 20);

    if (shouldGoBack) {
      triggerGoBack();
    } else {
      resetPosition();
    }

    isSwiping = false;
    allowSwipe = false;
  }

  function resetPosition() {
    if (!activeScreen) return;
    activeScreen.style.transform = "translateX(0)";
    activeScreen.style.opacity = "1";
    setTimeout(() => {
      activeScreen.style.transition = "";
      activeScreen.style.willChange = "";
      activeScreen = null;
    }, 250);
  }

  function triggerGoBack() {
    const current = activeScreen;
    if (!current) return;

    current.style.transform = "translateX(100%)";
    current.style.opacity = "0";

    setTimeout(() => {
      if (typeof window.goBack === "function") {
        window.goBack();
      } else {
        console.warn("⚠️ goBack() не найдена!");
      }
      if (current) {
        current.style.transform = "";
        current.style.opacity = "";
        current.style.transition = "";
        current.style.willChange = "";
      }
    }, 150);

    // Вибрация / отклик
    try {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.impactOccurred("light");
      } else if (navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch {}
  }

  // === Активируем свайп ===
  window.setupGlobalSwipeBack = function () {
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    console.log("✅ NDHQ Swipe System activated");
  };
})();

// === Автоинициализация ===
window.setupGlobalSwipeBack();
