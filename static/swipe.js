// ===========================================
// 📱 NDHQ Swipe System v5.4
// — свайп назад со всех экранов, кроме home
// ===========================================

(function () {
  if (window.__NDHQSwipeInstalled) return;
  window.__NDHQSwipeInstalled = true;

  let startX = 0, startY = 0;
  let lastDeltaX = 0, lastDeltaY = 0;
  let active = false, isVertical = false;
  let currentScreen = null, prevScreen = null;

  const EDGE_ZONE = 40;   // от левого края
  const TRIGGER = 60;     // порог активации
  const PREV_OFFSET = 25; // смещение заднего экрана

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX > EDGE_ZONE) return;

    currentScreen = document.querySelector(".screen.active");
    if (!currentScreen) return;

    // ❌ свайп запрещён только на home
    const id = currentScreen.id || "";
    if (id === "screen-home") return;

    const prevId = window.screenHistory?.[window.screenHistory.length - 1];
    prevScreen = prevId ? document.getElementById(prevId) : null;

    if (prevScreen) {
      prevScreen.style.display = "block";
      prevScreen.style.transform = `translateX(-${PREV_OFFSET}px)`;
      prevScreen.style.opacity = "0.5";
      prevScreen.style.zIndex = "5";
    }

    startX = t.clientX;
    startY = t.clientY;
    lastDeltaX = 0;
    lastDeltaY = 0;
    active = true;
    isVertical = false;
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!active || e.touches.length !== 1) return;
    const t = e.touches[0];
    const deltaX = t.clientX - startX;
    const deltaY = t.clientY - startY;

    lastDeltaX = deltaX;
    lastDeltaY = deltaY;

    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      isVertical = true;
      return;
    }

    if (isVertical || deltaX <= 0) return;
    e.preventDefault();

    const progress = Math.min(deltaX / window.innerWidth, 1);
    currentScreen.style.transform = `translateX(${deltaX}px)`;
    currentScreen.style.transition = "none";
    currentScreen.classList.add("swiping");

    if (prevScreen) {
      prevScreen.style.transform = `translateX(${(-PREV_OFFSET + progress * PREV_OFFSET)}px)`;
      prevScreen.style.opacity = `${0.5 + progress * 0.5}`;
      prevScreen.classList.add("active-behind");
    }
  }, { passive: false });

  document.addEventListener("touchend", () => {
    if (!active || !currentScreen || isVertical) return;
    active = false;

    const shift = lastDeltaX;
    const wentBack = shift > TRIGGER;

    if (wentBack) {
      // ✅ успешный свайп назад
      currentScreen.style.transition = "transform 0.25s ease-out, opacity 0.25s ease-out";
      currentScreen.style.transform = "translateX(100%)";
      currentScreen.style.opacity = "0";
      currentScreen.classList.remove("swiping");

      if (prevScreen) {
        prevScreen.style.transition = "transform 0.25s ease-out, opacity 0.25s ease-out";
        prevScreen.style.transform = "translateX(0)";
        prevScreen.style.opacity = "1";
      }

      setTimeout(() => {
        currentScreen.style.display = "none";
        currentScreen.classList.remove("active");
        if (prevScreen) {
          prevScreen.style.zIndex = "";
          prevScreen.classList.remove("active-behind");
        }

        if (typeof window.goBack === "function") {
          try {
            if (window.Telegram?.WebApp?.HapticFeedback) {
              Telegram.WebApp.HapticFeedback.impactOccurred("light");
            } else if (navigator.vibrate) {
              navigator.vibrate(10);
            }
          } catch {}
          window.goBack();
        }

        currentScreen = null;
        prevScreen = null;
      }, 180);
    } else {
      // ❌ короткий свайп — возвращаем экран
      currentScreen.style.transition = "transform 0.25s ease-out";
      currentScreen.style.transform = "translateX(0)";
      currentScreen.classList.remove("swiping");

      if (prevScreen) {
        prevScreen.style.transition = "transform 0.25s ease-out";
        prevScreen.style.transform = `translateX(-${PREV_OFFSET}px)`;
        prevScreen.style.opacity = "0.5";
        prevScreen.classList.remove("active-behind");
      }

      setTimeout(() => {
        if (prevScreen) prevScreen.style.display = "none";
        currentScreen.style.transition = "";
        currentScreen = null;
        prevScreen = null;
      }, 250);
    }
  }, { passive: true });

  console.log("✅ NDHQ Swipe System v5.4 — disabled only on home");
})();
