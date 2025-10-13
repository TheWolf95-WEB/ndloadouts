// ===========================================
// 📱 NDHQ Swipe System v5.5
// — исправлен баг "пустого экрана" после свайпа
// ===========================================

(function () {
  if (window.__NDHQSwipeInstalled) return;
  window.__NDHQSwipeInstalled = true;

  let startX = 0, startY = 0;
  let lastDeltaX = 0, lastDeltaY = 0;
  let active = false, isVertical = false;
  let currentScreen = null;
  let prevId = null;

  const EDGE_ZONE = 40;
  const TRIGGER = 60;
  const PREV_OFFSET = 25;

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX > EDGE_ZONE) return;

    currentScreen = document.querySelector(".screen.active");
    if (!currentScreen) return;

    // ❌ свайп запрещён только на home
    const id = currentScreen.id || "";
    if (id === "screen-home") return;

    prevId = window.screenHistory?.[window.screenHistory.length - 1] || null;
    if (!prevId) return;

    const prevScreen = document.getElementById(prevId);
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

    const prevScreen = document.getElementById(prevId);
    if (prevScreen) {
      prevScreen.style.transform = `translateX(${(-PREV_OFFSET + progress * PREV_OFFSET)}px)`;
      prevScreen.style.opacity = `${0.5 + progress * 0.5}`;
    }
  }, { passive: false });

  document.addEventListener("touchend", () => {
    if (!active || !currentScreen || isVertical) return;
    active = false;

    const shift = lastDeltaX;
    const wentBack = shift > TRIGGER;
    const prevScreen = document.getElementById(prevId);

    if (wentBack && prevId) {
      // ✅ успешный свайп назад
      currentScreen.style.transition = "transform 0.25s ease-out, opacity 0.25s ease-out";
      currentScreen.style.transform = "translateX(100%)";
      currentScreen.style.opacity = "0";

      setTimeout(() => {
        currentScreen.classList.remove("active");
        currentScreen.style.display = "none";
        currentScreen.style.transform = "";
        currentScreen.style.opacity = "";
        currentScreen.classList.remove("swiping");

        // 🟢 Вызов showScreen — корректное отображение предыдущего экрана
        if (typeof window.showScreen === "function") {
          window.isGoingBack = true; // чтобы не ломать history
          window.showScreen(prevId);
        }

        // виброотклик
        try {
          if (window.Telegram?.WebApp?.HapticFeedback) {
            Telegram.WebApp.HapticFeedback.impactOccurred("light");
          } else if (navigator.vibrate) {
            navigator.vibrate(10);
          }
        } catch {}

        console.log(`⬅️ Свайп назад: ${currentScreen.id} → ${prevId}`);

        currentScreen = null;
        prevId = null;
      }, 150);
    } else {
      // ❌ короткий свайп — возвращаем экран
      currentScreen.style.transition = "transform 0.25s ease-out";
      currentScreen.style.transform = "translateX(0)";
      currentScreen.classList.remove("swiping");

      if (prevScreen) {
        prevScreen.style.transition = "transform 0.25s ease-out";
        prevScreen.style.transform = `translateX(-${PREV_OFFSET}px)`;
        prevScreen.style.opacity = "0.5";
        prevScreen.style.display = "none";
      }

      setTimeout(() => {
        currentScreen.style.transition = "";
      }, 250);
    }
  }, { passive: true });

  console.log("✅ NDHQ Swipe System v5.5 — showScreen integration active");
})();
