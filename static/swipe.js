// ===========================================
// 📱 NDHQ Swipe System v7.1 — Debug + Fix Start
// ===========================================

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

  const EDGE_ZONE = 60;         // ← увеличим зону
  const DIST_TRIGGER = 90;
  const SPEED_TRIGGER = 0.35;
  const TRANSITION = 220;
  const PARALLAX = 0.25;

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const x = t.clientX;
    const y = t.clientY;

    console.log("👉 touchstart at", x, y);

    if (x > EDGE_ZONE) return; // свайп только от края

    currentScreen = document.querySelector(".screen.active");
    if (!currentScreen) return console.log("⚠️ нет активного экрана");

    // отключаем свайп только на home
    if (currentScreen.id === "screen-home") {
      console.log("🚫 свайп отключён на home");
      return;
    }

    prevId = window.screenHistory?.[window.screenHistory.length - 1];
    if (!prevId) return console.log("⚠️ нет предыдущего экрана в истории");

    prevScreen = document.getElementById(prevId);
    if (!prevScreen) return console.log("⚠️ нет prevScreen");

    prevScreen.style.display = "block";
    prevScreen.style.transform = "translateX(-30px)";
    prevScreen.style.opacity = "0.6";
    prevScreen.style.zIndex = "5";

    startX = x;
    startY = y;
    deltaX = deltaY = 0;
    startTime = Date.now();
    active = true;

    console.log("✅ свайп активирован на", currentScreen.id, "→", prevId);
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

  document.addEventListener("touchend", () => {
    if (!active || !currentScreen) return;
    active = false;

    const time = Date.now() - startTime;
    const speed = deltaX / time;
    const fastSwipe = speed > SPEED_TRIGGER;
    const farSwipe = deltaX > DIST_TRIGGER;

    console.log("🏁 touchend ΔX:", deltaX, "speed:", speed.toFixed(2));

    if ((fastSwipe || farSwipe) && prevId) {
      console.log("⬅️ выполняем возврат назад:", prevId);
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
      }, TRANSITION);
    } else {
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

  console.log("✅ NDHQ Swipe System v7.1 — debug enabled");
})();
