// ===========================================
// 📱 NDHQ Swipe System v8.0 (Hammer.js Edition)
// ===========================================

(function () {
  if (window.__NDHQSwipeInstalled) return;
  window.__NDHQSwipeInstalled = true;

  // === Конфигурация ===
  const EDGE_ZONE = 50;  // активная зона свайпа от левого края
  const TRANSITION = 200;

  // === Инициализация ===
  const hammer = new Hammer(document.body);
  hammer.get('pan').set({ direction: Hammer.DIRECTION_HORIZONTAL, threshold: 5 });

  let isPanning = false;
  let startX = 0;

  hammer.on('panstart', (ev) => {
    // свайп разрешён только от левого края
    if (ev.center.x > EDGE_ZONE) return;
    const active = document.querySelector('.screen.active');
    if (!active || active.id === 'screen-home') return;

    const prevId = window.screenHistory?.[window.screenHistory.length - 1];
    if (!prevId) return;

    isPanning = true;
    startX = ev.center.x;

    const prev = document.getElementById(prevId);
    if (prev) {
      prev.style.display = 'block';
      prev.style.transform = 'translateX(-25px)';
      prev.style.opacity = '0.5';
      prev.style.zIndex = '5';
    }
  });

  hammer.on('panmove', (ev) => {
    if (!isPanning) return;
    const active = document.querySelector('.screen.active');
    if (!active) return;

    const deltaX = Math.max(ev.deltaX, 0);
    const progress = Math.min(deltaX / window.innerWidth, 1);

    active.style.transition = 'none';
    active.style.transform = `translateX(${deltaX}px)`;
    active.style.boxShadow = '0 0 25px rgba(0,0,0,0.3)';

    const prevId = window.screenHistory?.[window.screenHistory.length - 1];
    const prev = document.getElementById(prevId);
    if (prev) {
      prev.style.transform = `translateX(${(-25 + progress * 25)}px)`;
      prev.style.opacity = `${0.5 + progress * 0.5}`;
    }
  });

  hammer.on('panend pancancel', (ev) => {
    if (!isPanning) return;
    isPanning = false;

    const active = document.querySelector('.screen.active');
    if (!active) return;

    const deltaX = ev.deltaX;
    const velocity = ev.velocityX;

    const prevId = window.screenHistory?.[window.screenHistory.length - 1];
    const prev = document.getElementById(prevId);

    const shouldGoBack = (deltaX > 100 || velocity > 0.35) && prevId;

    if (shouldGoBack) {
      // ✅ Переход назад
      active.style.transition = `transform ${TRANSITION}ms ease-out, opacity ${TRANSITION}ms ease-out`;
      active.style.transform = 'translateX(100%)';
      active.style.opacity = '0';

      if (prev) {
        prev.style.transition = `transform ${TRANSITION}ms ease-out, opacity ${TRANSITION}ms ease-out`;
        prev.style.transform = 'translateX(0)';
        prev.style.opacity = '1';
      }

      setTimeout(() => {
        if (typeof window.showScreen === 'function') {
          window.isGoingBack = true;
          window.showScreen(prevId);
        }

        active.style.transition = '';
        active.style.transform = '';
        active.style.opacity = '';
        active.style.boxShadow = 'none';

        if (prev) {
          prev.style.transition = '';
          prev.style.zIndex = '';
        }

        try {
          if (window.Telegram?.WebApp?.HapticFeedback) {
            Telegram.WebApp.HapticFeedback.impactOccurred('light');
          } else if (navigator.vibrate) {
            navigator.vibrate(10);
          }
        } catch {}

      }, TRANSITION);
    } else {
      // ❌ Возврат назад
      active.style.transition = `transform ${TRANSITION}ms ease-out`;
      active.style.transform = 'translateX(0)';
      active.style.boxShadow = 'none';

      if (prev) {
        prev.style.transition = `transform ${TRANSITION}ms ease-out, opacity ${TRANSITION}ms ease-out`;
        prev.style.transform = 'translateX(-25px)';
        prev.style.opacity = '0.5';
        setTimeout(() => { prev.style.display = 'none'; }, TRANSITION);
      }
    }
  });

  console.log("✅ NDHQ Swipe System v8.0 (Hammer.js) loaded successfully");
})();
