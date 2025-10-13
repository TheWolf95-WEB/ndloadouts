// ===========================================
// 📱 NDHQ Swipe System FINAL v6.0
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

  const EDGE_ZONE = 40;  // активная зона свайпа от края
  const TRIGGER = 60;    // порог активации
  const TRANSITION = 200; // длительность анимации

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX > EDGE_ZONE) return;

    currentScreen = document.querySelector(".screen.active");
    if (!currentScreen) return;

    // ❌ на home свайп отключён
    if (currentScreen.id === "screen-home") return;

    startX = t.clientX;
    startY = t.clientY;
    deltaX = deltaY = 0;
    active = true;
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!active) return;
    const t = e.touches[0];
    deltaX = t.clientX - startX;
    deltaY = t.clientY - startY;

    // если движение больше по вертикали — отменяем свайп
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      active = false;
      return;
    }

    if (deltaX < 0) return; // свайп только вправо

    e.preventDefault();

    currentScreen.style.transition = "none";
    currentScreen.style.transform = `translateX(${deltaX}px)`;
    currentScreen.style.boxShadow = "0 0 20px rgba(0,0,0,0.3)";
  }, { passive: false });

  document.addEventListener("touchend", () => {
    if (!active || !currentScreen) return;
    active = false;

    const prevId = window.screenHistory?.[window.screenHistory.length - 1];
    if (!prevId) {
      // если нет истории — просто вернуть экран
      currentScreen.style.transition = `transform ${TRANSITION}ms ease-out`;
      currentScreen.style.transform = "translateX(0)";
      currentScreen.style.boxShadow = "none";
      return;
    }

    if (deltaX > TRIGGER) {
      // ✅ успешный свайп назад
      currentScreen.style.transition = `transform ${TRANSITION}ms ease-out, opacity ${TRANSITION}ms ease-out`;
      currentScreen.style.transform = "translateX(100%)";
      currentScreen.style.opacity = "0";

      setTimeout(() => {
        // корректно вернуть на предыдущий экран
        if (typeof window.showScreen === "function") {
          window.isGoingBack = true;
          window.showScreen(prevId);
        }

        currentScreen.style.transition = "";
        currentScreen.style.transform = "";
        currentScreen.style.opacity = "";
        currentScreen.style.boxShadow = "none";

        if (window.Telegram?.WebApp?.HapticFeedback) {
          try {
            Telegram.WebApp.HapticFeedback.impactOccurred("light");
          } catch {}
        } else if (navigator.vibrate) {
          navigator.vibrate(10);
        }

        console.log(`⬅️ NDHQ Swipe: ${currentScreen.id} → ${prevId}`);
      }, TRANSITION);
    } else {
      // ❌ короткий свайп — вернуть экран
      currentScreen.style.transition = `transform ${TRANSITION}ms ease-out`;
      currentScreen.style.transform = "translateX(0)";
      currentScreen.style.boxShadow = "none";
    }
  }, { passive: true });

  console.log("✅ NDHQ Swipe System v6.0 loaded");
})();
