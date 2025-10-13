// ===========================================
// 📱 NDHQ Swipe System v6.3
// — совместим с window.goBack из app.js
// ===========================================

(function () {
  if (window.__NDHQSwipeInstalled) return;
  window.__NDHQSwipeInstalled = true;

  let startX = 0, startY = 0;
  let deltaX = 0, deltaY = 0;
  let startTime = 0;
  let active = false;
  let currentScreen = null;

  const EDGE_ZONE = 40;     // зона активации от левого края
  const DIST_TRIGGER = 70;  // минимальная дистанция свайпа
  const SPEED_TRIGGER = 0.35; // px/ms — порог скорости
  const TRANSITION = 250;   // совпадает с goBack

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    
    // Свайп только от левого края
    if (t.clientX > EDGE_ZONE) return;

    currentScreen = document.querySelector(".screen.active");
    if (!currentScreen || currentScreen.id === "screen-home") return;

    startX = t.clientX;
    startY = t.clientY;
    startTime = Date.now();
    deltaX = deltaY = 0;
    active = true;

    // Подготавливаем экран к анимации
    currentScreen.style.transition = "none";
    currentScreen.style.willChange = "transform";
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!active || !currentScreen) return;
    const t = e.touches[0];
    deltaX = t.clientX - startX;
    deltaY = Math.abs(t.clientY - startY);

    // Отменяем если вертикальный скролл
    if (deltaY > 50 && deltaY > Math.abs(deltaX)) {
      active = false;
      resetScreen();
      return;
    }

    // Только свайп вправо
    if (deltaX < 0) {
      resetScreen();
      return;
    }

    e.preventDefault();
    
    // Плавное движение с резиновым эффектом
    let translateX = deltaX;
    if (deltaX > 100) {
      translateX = 100 + (deltaX - 100) * 0.5;
    }
    
    currentScreen.style.transform = `translateX(${translateX}px)`;
    currentScreen.style.opacity = `${1 - Math.min(deltaX / 400, 0.3)}`;
    currentScreen.style.boxShadow = "-5px 0 20px rgba(0,0,0,0.15)";
  }, { passive: false });

  document.addEventListener("touchend", () => {
    if (!active || !currentScreen) return;
    active = false;

    const duration = Date.now() - startTime;
    const speed = deltaX / duration;
    const fastSwipe = speed > SPEED_TRIGGER;
    const farSwipe = deltaX > DIST_TRIGGER;

    currentScreen.style.transition = `transform ${TRANSITION}ms ease-out, opacity ${TRANSITION}ms ease-out`;
    currentScreen.style.willChange = "auto";

    if ((fastSwipe && deltaX > 30) || farSwipe) {
      // Запускаем возврат через window.goBack
      triggerGoBack();
    } else {
      // Возвращаем экран на место
      resetScreen();
    }
  }, { passive: true });

  function resetScreen() {
    if (!currentScreen) return;
    
    currentScreen.style.transition = `transform ${TRANSITION}ms ease-out, opacity ${TRANSITION}ms ease-out`;
    currentScreen.style.transform = "translateX(0)";
    currentScreen.style.opacity = "1";
    currentScreen.style.boxShadow = "none";
    
    setTimeout(() => {
      currentScreen.style.transition = "";
      currentScreen.style.willChange = "";
      currentScreen = null;
    }, TRANSITION);
  }

  function triggerGoBack() {
    if (!currentScreen) return;

    // Используем ту же анимацию что и в goBack
    currentScreen.style.transform = "translateX(100%)";
    currentScreen.style.opacity = "0";
    currentScreen.style.boxShadow = "none";

    setTimeout(() => {
      // Вызываем вашу функцию из app.js
      if (typeof window.goBack === "function") {
        window.goBack();
      }
      
      // Сбрасываем стили
      currentScreen.style.transform = "";
      currentScreen.style.opacity = "";
      currentScreen.style.transition = "";
      currentScreen.style.willChange = "";
      currentScreen.style.boxShadow = "";
      
      currentScreen = null;
    }, 200);

    // Виброотклик (дублируется в goBack, но для надежности оставляем)
    try {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.impactOccurred("light");
      } else if (navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch {}
  }

  console.log("✅ NDHQ Swipe System v6.3 — integrated with window.goBack");
})();
