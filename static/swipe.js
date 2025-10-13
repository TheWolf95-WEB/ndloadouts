/* ==========================================================
   swipe-back.js — Edge Swipe Back для Telegram WebApp (iOS/Android/Desktop)
   Без библиотек. Работает в WKWebView (в т.ч. Telegram iOS).
   Требования: старт ≤40px слева, завершение >80px или velocity>0.3,
   вертикальный скролл не ломаем, плавная анимация, хаптика, не на screen-home.
   Подключать после app.js.
   ========================================================== */
(function () {
  'use strict';

  // --- Тонкая настройка ---
  const EDGE_START_PX = 40;         // зона старта у левого края
  const COMPLETE_DISTANCE_PX = 80;  // расстояние для "назад"
  const VELOCITY_THRESHOLD = 0.3;   // px/ms быстрый свайп
  const ACTIVATE_MOVE_THRESHOLD = 8;// до решения по направлению
  const ANIM_MS = 220;
  const EASE = 'cubic-bezier(.22,.61,.36,1)';

  let dragging = false;
  let decided = false;
  let horizontal = false;

  let startX = 0, startY = 0;
  let lastX = 0, lastTime = 0, startTime = 0;
  let instVX = 0;
  let inputKind = null; // 'touch' | 'pointer' | 'mouse'

  let activeEl = null;
  let scrimEl = null;
  let rafId = 0;

  // --- Утилиты ---
  function getActiveScreen() {
    let el = document.querySelector('.screen.active');
    if (!el) {
      const screens = Array.from(document.querySelectorAll('.screen'));
      el = screens.find(s => s.style.display !== 'none') || null;
      if (el && !el.classList.contains('active')) el.classList.add('active');
    }
    return el;
  }
  function hasPrevInHistory() {
    return Boolean(window.screenHistory?.[window.screenHistory.length - 1]);
  }
  function haptic() {
    try { Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch {}
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch {} }
  }
  function createScrimIfNeeded() {
    if (!scrimEl) {
      scrimEl = document.createElement('div');
      scrimEl.id = 'swipe-back-scrim';
      Object.assign(scrimEl.style, {
        position: 'fixed',
        inset: '0',
        pointerEvents: 'none',
        background: 'linear-gradient(to right, rgba(0,0,0,0.25), rgba(0,0,0,0))',
        opacity: '0',
        transition: 'opacity 150ms ease',
        zIndex: '2147483646' // поверх всего
      });
      document.body.appendChild(scrimEl);
    } else {
      scrimEl.style.opacity = '0';
    }
  }
  function setTranslate(x) {
    if (!activeEl) return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      activeEl.style.transform = `translate3d(${x}px,0,0)`;
      activeEl.style.boxShadow = '0 0 16px rgba(0,0,0,0.25)';
      if (scrimEl) {
        const progress = Math.min(1, x / 120);
        scrimEl.style.opacity = String(progress * 0.6);
      }
    });
  }
  function cleanupStyles() {
    if (activeEl) {
      activeEl.style.transition = '';
      activeEl.style.transform = '';
      activeEl.style.willChange = '';
      activeEl.style.boxShadow = '';
      activeEl.style.touchAction = '';
    }
    if (scrimEl) scrimEl.style.opacity = '0';
  }
  function removeMoveEndListeners() {
    document.removeEventListener('touchmove', onMove, capFalse);
    document.removeEventListener('touchend', onEnd, capFalse);
    document.removeEventListener('touchcancel', onEnd, capFalse);

    document.removeEventListener('pointermove', onMove, capFalse);
    document.removeEventListener('pointerup', onEnd, capTrue);
    document.removeEventListener('pointercancel', onEnd, capTrue);

    document.removeEventListener('mousemove', onMove, capFalse);
    document.removeEventListener('mouseup', onEnd, capTrue);
  }
  function cancelGesture() {
    dragging = false;
    decided = false;
    horizontal = false;
    inputKind = null;
    cleanupStyles();
    removeMoveEndListeners();
    activeEl = null;
  }
  function finishGesture(complete) {
    if (!activeEl) { cancelGesture(); return; }
    const el = activeEl;
    el.style.transition = `transform ${ANIM_MS}ms ${EASE}`;

    if (complete) {
      const width = Math.max(window.innerWidth, el.offsetWidth || 0);
      let done = false;
      const onTe = () => {
        if (done) return;
        done = true;
        el.removeEventListener('transitionend', onTe);
        cleanupStyles();
        const prevId = window.screenHistory?.[window.screenHistory.length - 1];
        if (prevId) {
          window.isGoingBack = true;
          haptic();
          window.showScreen(prevId);
        }
        activeEl = null;
      };
      el.addEventListener('transitionend', onTe);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.transform = `translate3d(${width}px,0,0)`;
        if (scrimEl) scrimEl.style.opacity = '0';
      }));
    } else {
      const onTe = () => {
        el.removeEventListener('transitionend', onTe);
        cleanupStyles();
        activeEl = null;
      };
      el.addEventListener('transitionend', onTe);
      requestAnimationFrame(() => { el.style.transform = 'translate3d(0,0,0)'; });
    }

    dragging = false;
    decided = false;
    horizontal = false;
    inputKind = null;
    removeMoveEndListeners();
  }

  // --- Обработчики ---
  function onStartBase(clientX, clientY, srcEvent) {
    if (dragging) return;

    if (clientX > EDGE_START_PX) return;

    // Не триггерим на интерактивах
    const t = srcEvent.target;
    const tag = (t?.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select', 'button', 'label'].includes(tag)) return;
    if (t?.isContentEditable) return;

    activeEl = getActiveScreen();
    if (!activeEl) return;
    if (activeEl.id === 'screen-home') return;
    if (!hasPrevInHistory()) return;

    dragging = true;
    decided = false;
    horizontal = false;

    startX = lastX = clientX;
    startY = clientY;
    startTime = lastTime = srcEvent.timeStamp || Date.now();
    instVX = 0;

    activeEl.style.willChange = 'transform';
    activeEl.style.transition = 'none';
    // safari/wkwebview понимают pan-y (свободим вертикальный скролл до решения)
    activeEl.style.touchAction = 'pan-y';
    createScrimIfNeeded();
  }

  function onMoveBase(clientX, clientY, timeStamp, preventDefaultCb) {
    if (!dragging) return;

    const dx = clientX - startX;
    const dy = clientY - startY;

    if (!decided) {
      if (Math.abs(dx) + Math.abs(dy) < ACTIVATE_MOVE_THRESHOLD) return;

      if (Math.abs(dy) > Math.abs(dx)) {
        // Вертикаль доминирует — не мешаем
        cancelGesture();
        return;
      }
      if (dx <= 0) {
        cancelGesture();
        return;
      }
      decided = true;
      horizontal = true;
      if (scrimEl) scrimEl.style.opacity = '1';
    }

    if (!horizontal) return;

    // Мы в горизонтальном жесте — блокируем прокрутку
    if (preventDefaultCb) preventDefaultCb();

    const deltaX = Math.max(0, dx);
    setTranslate(deltaX);

    const now = timeStamp || Date.now();
    const dt = Math.max(1, now - lastTime);
    instVX = (clientX - lastX) / dt; // px/ms
    lastX = clientX;
    lastTime = now;
  }

  function onEndBase(timeStamp) {
    if (!dragging) return;
    const now = timeStamp || Date.now();
    const totalDx = Math.max(0, lastX - startX);
    const totalDt = Math.max(1, now - startTime);
    const avgVX = totalDx / totalDt;

    const complete =
      totalDx >= COMPLETE_DISTANCE_PX ||
      avgVX > VELOCITY_THRESHOLD ||
      instVX > VELOCITY_THRESHOLD;

    finishGesture(complete);
  }

  // --- Низкоуровневые прокси (touch/pointer/mouse) ---
  const capTrue  = { capture: true,  passive: true  };
  const capFalse = { capture: true,  passive: false };

  function onTouchStart(e) {
    if (dragging) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    inputKind = 'touch';
    onStartBase(t.clientX, t.clientY, e);

    // Подписки под конкретный ввод
    if (dragging) {
      document.addEventListener('touchmove', onMove, capFalse);
      document.addEventListener('touchend', onEnd, capFalse);
      document.addEventListener('touchcancel', onEnd, capFalse);
    }
  }
  function onTouchMove(e) {
    const t = e.touches && e.touches[0];
    if (!t) return;
    onMoveBase(t.clientX, t.clientY, e.timeStamp, () => e.preventDefault());
  }
  function onTouchEnd(e) {
    onEndBase(e.timeStamp);
  }

  function onPointerStart(e) {
    // На iOS Telegram PointerEvent может существовать, но не приходить — в таком случае этот хэндлер просто не вызовется; параллельно у нас есть touchstart.
    if (dragging) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    inputKind = e.pointerType === 'mouse' ? 'mouse' : 'pointer';
    onStartBase(e.clientX, e.clientY, e);

    if (dragging) {
      document.addEventListener('pointermove', onMove, capFalse);
      document.addEventListener('pointerup', onEnd, capTrue);
      document.addEventListener('pointercancel', onEnd, capTrue);
    }
  }
  function onPointerMove(e) {
    onMoveBase(e.clientX, e.clientY, e.timeStamp, () => e.preventDefault());
  }
  function onPointerEnd(e) {
    onEndBase(e.timeStamp);
  }

  function onMouseDown(e) {
    if (dragging) return;
    if (e.button !== 0) return;
    inputKind = 'mouse';
    onStartBase(e.clientX, e.clientY, e);

    if (dragging) {
      document.addEventListener('mousemove', onMove, capFalse);
      document.addEventListener('mouseup', onEnd, capTrue);
    }
  }
  function onMouseMove(e) {
    onMoveBase(e.clientX, e.clientY, e.timeStamp, () => e.preventDefault());
  }
  function onMouseUp(e) {
    onEndBase(e.timeStamp);
  }

  // Общие маршрутизаторы (чтобы снять легко)
  function onMove(e) {
    if (!dragging) return;
    if (inputKind === 'touch' && e.type === 'touchmove') return onTouchMove(e);
    if (inputKind === 'pointer' && e.type === 'pointermove') return onPointerMove(e);
    if (inputKind === 'mouse' && e.type === 'mousemove') return onMouseMove(e);
  }
  function onEnd(e) {
    if (!dragging) return;
    if (inputKind === 'touch' && (e.type === 'touchend' || e.type === 'touchcancel')) return onTouchEnd(e);
    if (inputKind === 'pointer' && (e.type === 'pointerup' || e.type === 'pointercancel')) return onPointerEnd(e);
    if (inputKind === 'mouse' && e.type === 'mouseup') return onMouseUp(e);
  }

  // --- Инициализация слушателей старта: ВСЕГДА и touch, и pointer, и mouse ---
  document.addEventListener('touchstart', onTouchStart, capTrue);
  document.addEventListener('pointerdown', onPointerStart, capTrue);
  // На Desktop WebView/браузере
  document.addEventListener('mousedown', onMouseDown, capTrue);

  // API для отключения при необходимости
  window.DisableSwipeBack = function () {
    document.removeEventListener('touchstart', onTouchStart, capTrue);
    document.removeEventListener('pointerdown', onPointerStart, capTrue);
    document.removeEventListener('mousedown', onMouseDown, capTrue);
    removeMoveEndListeners();
    cancelGesture();
  };
})();
