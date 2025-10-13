// ==========================================
// 📱 NDHQ GLOBAL SWIPE SYSTEM (v5.0 STABLE)
// ==========================================
// Реалистичный свайп-назад (iOS/Android), без "резинки" до 120px,
// работает только если есть куда возвращаться (history).

(function () {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let isSwiping = false;
  let allowSwipe = false;
  let activeScreen = null;
  let startTime = 0;

  const EDGE_ZONE = 25;               // зона активации у левого края
  const RESISTANCE_START = 120;       // до этой точки едем 1:1
  const RESISTANCE_FACTOR = 0.3;      // дальше небольшая резина
  const TRIGGER_PX = 100;             // минимальный драг (px) для возврата
  const TRIGGER_PROGRESS = 0.35;      // или 35% ширины экрана
  const TRIGGER_VELOCITY = 0.5;       // или быстрый свайп
  const MAX_VERTICAL_DRIFT = 60;      // если ушли вверх/вниз — отмена

  // один раз навешиваем обработчики
  window.setupGlobalSwipeBack = function () {
    if (window.__ndhqSwipeInit) return;
    window.__ndhqSwipeInit = true;

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    console.log("✅ NDHQ Swipe System activated");
  };

  function onStart(e) {
    const t = e.changedTouches[0];
    startX = t.clientX;
    startY = t.clientY;
    currentX = startX;
    startTime = Date.now();
    isSwiping = false;
    allowSwipe = false;
    activeScreen = null;

    // активируем только от левого края
    if (startX > EDGE_ZONE) return;

    // должен быть активный экран и реальная история
    const current = document.querySelector(".screen.active");
    if (!current) return;
    if (!Array.isArray(window.screenHistory) || window.screenHistory.length === 0) return;

    activeScreen = current;
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

    // если пошёл вертикальный жест — отменяем
    if (deltaY > MAX_VERTICAL_DRIFT) {
      return resetPosition();
    }

    // активируем горизонтальный свайп немного позже
    if (!isSwiping && deltaX > 8) {
      isSwiping = true;
    }

    if (!isSwiping) return;

    if (deltaX > 0) {
      e.preventDefault(); // блокируем вертикальный скролл во время свайпа

      // расстояние без резины до 120px, дальше — с маленьким сопротивлением
      let shift = deltaX;
      if (deltaX > RESISTANCE_START) {
        shift = RESISTANCE_START + (deltaX - RESISTANCE_START) * RESISTANCE_FACTOR;
      }

      const progress = Math.min(1, shift / window.innerWidth);
      activeScreen.style.transform = `translateX(${Math.max(0, shift)}px)`;
      activeScreen.style.opacity = String(1 - progress * 0.4);
    }
  }

  function onEnd() {
    if (!allowSwipe || !activeScreen) return;

    const deltaX = Math.max(0, currentX - startX);
    const deltaT = Math.max(1, Date.now() - startTime);
    const velocity = deltaX / deltaT; // px/ms
    const progress = deltaX / window.innerWidth;

    // вернем анимации
    activeScreen.style.transition = "transform 0.22s ease-out, opacity 0.22s ease-out";
    activeScreen.style.willChange = "auto";

    const shouldGoBack = (
      deltaX > TRIGGER_PX ||
      progress > TRIGGER_PROGRESS ||
      velocity > TRIGGER_VELOCITY
    );

    if (shouldGoBack) {
      animateAndGoBack();
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
      if (!activeScreen) return;
      activeScreen.style.transition = "";
      activeScreen.style.willChange = "";
      activeScreen = null;
    }, 230);
  }

  function animateAndGoBack() {
    const current = activeScreen;
    if (!current) return;

    // докатываем до края
    current.style.transform = "translateX(100%)";
    current.style.opacity = "0";

    setTimeout(() => {
      try {
        if (typeof window.goBack === "function") {
          window.goBack();
        } else {
          console.warn("⚠️ goBack() не найдена. Проверь, что в app.js есть window.goBack = function() { ... }");
        }
      } finally {
        // чистим стили (на всякий)
        if (current) {
          current.style.transform = "";
          current.style.opacity = "";
          current.style.transition = "";
          current.style.willChange = "";
        }
        activeScreen = null;
      }
    }, 160);

    // Haptics
    try {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.impactOccurred("light");
      } else if (navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch {}
  }
})();
