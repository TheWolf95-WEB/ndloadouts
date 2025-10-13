// ===========================================
// 📱 NDHQ Swipe System v6.4
// — фикс пружинящей анимации
// ===========================================

(function () {
  if (window.__NDHQSwipeInstalled) return;
  window.__NDHQSwipeInstalled = true;

  let startX = 0, startY = 0;
  let deltaX = 0, deltaY = 0;
  let startTime = 0;
  let active = false;
  let currentScreen = null;

  const EDGE_ZONE = 40;
  const DIST_TRIGGER = 70;
  const SPEED_TRIGGER = 0.35;
  const TRANSITION = 250;

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

    currentScreen.style.transition = "none";
    currentScreen.style.willChange = "transform";
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!active || !currentScreen) return;
    const t = e.touches[0];
    deltaX = t.clientX - startX;
    deltaY = Math.abs(t.clientY - startY);

    if (deltaY > 50 && deltaY > Math.abs(deltaX)) {
      active = false;
      resetScreen();
      return;
    }

    if (deltaX < 0) {
      resetScreen();
      return;
    }

    e.preventDefault();
    
    // Более мягкий резиновый эффект
    let translateX = deltaX;
    if (deltaX > 80) {
      translateX = 80 + (deltaX - 80) * 0.7;
    }
    
    currentScreen.style.transform = `translateX(${translateX}px)`;
    currentScreen.style.opacity = `${1 - Math.min(deltaX / 350, 0.25)}`;
    
    // Тень только при значительном движении
    if (deltaX > 20) {
      currentScreen.style.boxShadow = "-4px 0 15px rgba(0,0,0,0.1)";
    }
  }, { passive: false });

  document.addEventListener("touchend", () => {
    if (!active || !currentScreen) return;
    active = false;

    const duration = Date.now() - startTime;
    const speed = deltaX / duration;
    const fastSwipe = speed > SPEED_TRIGGER;
    const farSwipe = deltaX > DIST_TRIGGER;

    // Убираем transition для мгновенного ответа
    currentScreen.style.transition = "none";

    if ((fastSwipe && deltaX > 30) || farSwipe) {
      // НЕ анимируем здесь - пусть goBack сам управляет анимацией
      currentScreen.style.transform = "";
      currentScreen.style.opacity = "";
      currentScreen.style.boxShadow = "";
      currentScreen.style.willChange = "";
      
      // Немедленно вызываем goBack
      if (typeof window.goBack === "function") {
        window.goBack();
      }
      
      currentScreen = null;
    } else {
      // Плавно возвращаем на место
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

  console.log("✅ NDHQ Swipe System v6.4 — fixed spring animation");
})();
