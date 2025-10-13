(function () {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let isSwiping = false;
  let activeScreen = null;
  let allowSwipe = false;
  let startTime = 0;

  const EDGE_ZONE = 50;          // Увеличено до 50 пикселей
  const SWIPE_DISTANCE = 80;     // Минимальная дистанция для свайпа
  const MAX_VERTICAL_DRIFT = 100; // Увеличено до 100 пикселей
  const ELASTICITY = 0.35;       // Пружина
  const SWIPE_TIME_LIMIT = 700;  // Максимум времени, мс

  window.setupGlobalSwipeBack = function () {
    console.log("🚀 Swipe system initialized");
    document.addEventListener("touchstart", onStart, { passive: false });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: false });
  };

  function onStart(e) {
    console.log("👇 Touch start:", e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    const t = e.changedTouches[0];
    startX = t.clientX;
    startY = t.clientY;
    currentX = startX;
    startTime = Date.now();
    isSwiping = false;
    allowSwipe = false;

    if (startX > EDGE_ZONE) {
      console.log("🚫 Swipe ignored: touch started outside EDGE_ZONE", startX);
      return;
    }

    activeScreen = document.querySelector(".screen.active");
    if (!activeScreen) {
      console.log("🚫 No active screen found");
      return;
    }

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

    if (deltaY > MAX_VERTICAL_DRIFT) {
      console.log("🚫 Swipe cancelled: vertical drift too large", deltaY);
      resetPosition();
      return;
    }

    if (!isSwiping && deltaX > 10) {
      console.log("🚀 Swipe activated");
      isSwiping = true;
    }

    if (isSwiping && deltaX > 0) {
      e.preventDefault();
      const shift = deltaX * ELASTICITY;
      console.log("🎢 Swiping: transform=translateX(", shift, "px), opacity=", 1 - Math.min(deltaX / 300, 0.3));
      activeScreen.style.transform = `translateX(${shift}px)`;
      activeScreen.style.opacity = `${1 - Math.min(deltaX / 300, 0.3)}`;
    }
  }

  function onEnd() {
    if (!allowSwipe || !activeScreen) return;

    const deltaX = currentX - startX;
    const deltaT = Date.now() - startTime;
    const velocity = deltaX / deltaT;

    console.log("👆 Touch end, deltaX:", deltaX, "velocity:", velocity);

    activeScreen.style.transition = "transform 0.25s ease-out, opacity 0.25s ease-out";
    activeScreen.style.willChange = "auto";

    const shouldGoBack = deltaX > SWIPE_DISTANCE || (velocity > 0.5 && deltaX > 20);

    if (shouldGoBack) {
      console.log("✅ Triggering goBack");
      triggerGoBack();
    } else {
      console.log("🔄 Resetting position");
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
      console.log("🏁 Reset complete");
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
      console.log("🏁 goBack triggered");
    }, 150);

    try {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        console.log("Attempting haptic feedback");
        window.Telegram.WebApp.HapticFeedback.impactOccurred("light");
      } else if (navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch (e) {
      console.error("Haptic feedback error:", e);
    }
  }
})();
