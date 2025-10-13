// ===========================================
// 📱 NDHQ Swipe System v6.2
// — свайп назад с расчётом скорости
// ===========================================

(function () {
  if (window.__NDHQSwipeInstalled) return;
  window.__NDHQSwipeInstalled = true;

  let startX = 0, startY = 0;
  let deltaX = 0, deltaY = 0;
  let startTime = 0;
  let active = false;
  let currentScreen = null;

  const EDGE_ZONE = 40;     // зона активации
  const DIST_TRIGGER = 70;  // минимальная дистанция
  const SPEED_TRIGGER = 0.35; // px/ms — если быстрее, то сработает
  const TRANSITION = 200;

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX > EDGE_ZONE) return;

    currentScreen = document.querySelector(".screen.active");
    if (!currentScreen || currentScreen.id === "screen-home") return;

    startX = t.clientX;
    startY = t.clientY;
    startTime = Date.now();
    deltaX = deltaY = 0;
    active = true;
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!active) return;
    const t = e.touches[0];
    deltaX = t.clientX - startX;
    deltaY = t.clientY - startY;

    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      active = false;
      return;
    }

    if (deltaX < 0) return;

    e.preventDefault();
    currentScreen.style.transition = "none";
    currentScreen.style.transform = `translateX(${deltaX}px)`;
    currentScreen.style.boxShadow = "0 0 20px rgba(0,0,0,0.3)";
  }, { passive: false });

  document.addEventListener("touchend", () => {
    if (!active || !currentScreen) return;
    active = false;

    const duration = Date.now() - startTime;
    const speed = deltaX / duration; // px per ms
    const fastSwipe = speed > SPEED_TRIGGER;
    const farSwipe = deltaX > DIST_TRIGGER;

    const prevId = window.screenHistory?.[window.screenHistory.length - 1];

    // Если быстро или далеко — возвращаем
    if ((fastSwipe || farSwipe) && prevId) {
      currentScreen.style.transition = `transform ${TRANSITION}ms ease-out, opacity ${TRANSITION}ms ease-out`;
      currentScreen.style.transform = "translateX(100%)";
      currentScreen.style.opacity = "0";

      setTimeout(() => {
        if (typeof window.showScreen === "function") {
          window.isGoingBack = true;
          window.showScreen(prevId);
        }
        currentScreen.style.transition = "";
        currentScreen.style.transform = "";
        currentScreen.style.opacity = "";
        currentScreen.style.boxShadow = "none";

        try {
          if (window.Telegram?.WebApp?.HapticFeedback) {
            Telegram.WebApp.HapticFeedback.impactOccurred("light");
          } else if (navigator.vibrate) {
            navigator.vibrate(10);
          }
        } catch {}

        console.log(`⬅️ Swipe back: ${currentScreen.id} → ${prevId}`);
      }, TRANSITION);
    } else {
      // возвращаем экран
      currentScreen.style.transition = `transform ${TRANSITION}ms ease-out`;
      currentScreen.style.transform = "translateX(0)";
      currentScreen.style.boxShadow = "none";
    }
  }, { passive: true });

  console.log("✅ NDHQ Swipe System v6.2 — smooth & velocity-based");
})();
