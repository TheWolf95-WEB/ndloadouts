// ===================================================
// 📱 NDHQ Swipe System v7.0 — Telegram-style swipe back
// ===================================================

(function () {
  if (window.__NDHQSwipeInstalled) return;
  window.__NDHQSwipeInstalled = true;

  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let deltaY = 0;
  let active = false;
  let startTime = 0;
  let currentScreen = null;
  let prevScreen = null;
  let prevId = null;

  // === Настройки ===
  const EDGE_ZONE = 35;         // область активации свайпа
  const DIST_TRIGGER = 90;      // дистанция для возврата
  const SPEED_TRIGGER = 0.35;   // скорость (px/ms)
  const TRANSITION = 220;       // длительность анимации
  const PARALLAX = 0.25;        // сила движения заднего экрана

  // === touchstart ===
  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX > EDGE_ZONE) return;

    currentScreen = document.querySelector(".screen.active");
    if (!currentScreen || currentScreen.id === "screen-home") return;

    // предыдущий экран из истории
    prevId = window.screenHistory?.[window.screenHistory.length - 1];
    if (!prevId) return;

    prevScreen = document.getElementById(prevId);
    if (!prevScreen) return;

    // Подготавливаем предыдущий экран
    prevScreen.style.display = "block";
    prevScreen.style.transform = "translateX(-30px)";
    prevScreen.style.opacity = "0.6";
    prevScreen.style.zIndex = "5";

    startX = t.clientX;
    startY = t.clientY;
    deltaX = deltaY = 0;
    startTime = Date.now();
    active = true;
  }, { passive: true });

  // === touchmove ===
  document.addEventListener("touchmove", (e) => {
    if (!active) return;
    const t = e.touches[0];
    deltaX = t.clientX - startX;
    deltaY = t.clientY - startY;

    // если движение вертикальное — отменяем
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      active = false;
      return;
    }

    if (deltaX < 0) return;

    e.preventDefault();

    const progress = Math.min(deltaX / window.innerWidth, 1);
    const prevShift = (-30 + progress * 30 * PARALLAX).toFixed(2);
    const prevOpacity = (0.6 + progress * 0.4).toFixed(2);

    currentScreen.style.transition = "none";
    currentScreen.style.transform = `translateX(${deltaX}px)`;
    currentScreen.style.boxShadow = "0 0 25px rgba(0,0,0,0.35)";

    if (prevScreen) {
      prevScreen.style.transform = `translateX(${prevShift}px)`;
      prevScreen.style.opacity = prevOpacity;
    }
  }, { passive: false });

  // === touchend ===
  document.addEventListener("touchend", () => {
    if (!active || !currentScreen) return;
    active = false;

    const time = Date.now() - startTime;
    const speed = deltaX / time;
    const fastSwipe = speed > SPEED_TRIGGER;
    const farSwipe = deltaX > DIST_TRIGGER;

    if ((fastSwipe || farSwipe) && prevId) {
      // ✅ возврат назад
      currentScreen.style.transition = `transform ${TRANSITION}ms ease-out, opacity ${TRANSITION}ms ease-out`;
      currentScreen.style.transform = "translateX(100%)";
      currentScreen.style.opacity = "0";

      if (prevScreen) {
        prevScreen.style.transition = `transform ${TRANSITION}ms ease-out, opacity ${TRANSITION}ms ease-out`;
        prevScreen.style.transform = "translateX(0)";
        prevScreen.style.opacity = "1";
      }

      setTimeout(() => {
        if (typeof window.showScreen === "function") {
          window.isGoingBack = true;
          window.showScreen(prevId);
        }

        currentScreen.style.transition = "";
        currentScreen.style.transform = "";
        currentScreen.style.opacity = "";
        currentScreen.style.boxShadow = "none";
        prevScreen.style.transition = "";
        prevScreen.style.zIndex = "";
        prevScreen = null;
        prevId = null;

        try {
          if (window.Telegram?.WebApp?.HapticFeedback) {
            Telegram.WebApp.HapticFeedback.impactOccurred("light");
          } else if (navigator.vibrate) {
            navigator.vibrate(10);
          }
        } catch {}

        console.log(`⬅️ NDHQ Swipe v7.0: ${currentScreen.id} → ${window.screenHistory?.slice(-1)}`);
      }, TRANSITION);
    } else {
      // ❌ короткий свайп — откат
      currentScreen.style.transition = `transform ${TRANSITION}ms ease-out`;
      currentScreen.style.transform = "translateX(0)";
      currentScreen.style.boxShadow = "none";

      if (prevScreen) {
        prevScreen.style.transition = `transform ${TRANSITION}ms ease-out, opacity ${TRANSITION}ms ease-out`;
        prevScreen.style.transform = "translateX(-30px)";
        prevScreen.style.opacity = "0.6";
        setTimeout(() => {
          prevScreen.style.display = "none";
          prevScreen = null;
        }, TRANSITION);
      }
    }
  }, { passive: true });

  console.log("✅ NDHQ Swipe System v7.0 — Telegram-style parallax active");
})();
