/* ==========================================================
   swipe-back.js — Edge Swipe Back v9.1
   Универсальный: iOS / Android / Desktop
   Плавный, стабильный, как в Telegram
   ========================================================== */
(function () {
  'use strict';

  // === Настройки ===
  const EDGE_START_PX = 35;          // зона старта
  const COMPLETE_DISTANCE_PX = 90;   // нужно для "назад"
  const VELOCITY_THRESHOLD = 0.25;   // px/ms для быстрого свайпа
  const ACTIVATE_MOVE_THRESHOLD = 10;// когда начинаем двигать
  const ANIM_MS = 340;               // плавный, не резкий
  const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)'; // iOS-like easing

  let dragging = false, decided = false, horizontal = false;
  let startX = 0, startY = 0, lastX = 0, startTime = 0, lastTime = 0, instVX = 0;
  let inputKind = null;
  let activeEl = null, scrimEl = null, rafId = 0;

  function getHistoryArray() {
    if (Array.isArray(window.screenHistory)) return window.screenHistory;
    try { return Array.isArray(screenHistory) ? screenHistory : null; } catch { return null; }
  }
  function getPrevId() {
    const h = getHistoryArray();
    return h && h[h.length - 1];
  }
  function setGoingBackTrue() {
    window.isGoingBack = true;
    try { isGoingBack = true; } catch {}
  }

  function getActiveScreen() {
    let el = document.querySelector('.screen.active');
    if (!el) {
      el = [...document.querySelectorAll('.screen')].find(s => s.style.display !== 'none');
      if (el) el.classList.add('active');
    }
    return el;
  }

  function haptic() {
    try { Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch {}
    if (navigator.vibrate) try { navigator.vibrate(12); } catch {}
  }

  function createScrim() {
    if (!scrimEl) {
      scrimEl = document.createElement('div');
      Object.assign(scrimEl.style, {
        position: 'fixed',
        inset: '0',
        background: 'rgba(0,0,0,0.2)',
        pointerEvents: 'none',
        opacity: '0',
        transition: 'opacity 150ms ease',
        zIndex: '2147483646'
      });
      document.body.appendChild(scrimEl);
    } else scrimEl.style.opacity = '0';
  }

  function setTranslate(x) {
    if (!activeEl) return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      activeEl.style.transform = `translate3d(${x}px,0,0)`;
      activeEl.style.boxShadow = '0 0 20px rgba(0,0,0,0.25)';
      if (scrimEl) scrimEl.style.opacity = String(Math.min(0.4, x / 160));
    });
  }

  function cleanupStyles() {
    if (activeEl) {
      activeEl.style.transition = '';
      activeEl.style.transform = '';
      activeEl.style.boxShadow = '';
      activeEl.style.willChange = '';
    }
    if (scrimEl) scrimEl.style.opacity = '0';
  }

  function removeMoveEnd() {
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
    dragging = decided = horizontal = false;
    inputKind = null;
    cleanupStyles();
    removeMoveEnd();
    activeEl = null;
  }

  function finishGesture(complete) {
    if (!activeEl) { cancelGesture(); return; }
    const el = activeEl;
    el.style.transition = `transform ${ANIM_MS}ms ${EASE}`;

    if (complete) {
      const width = window.innerWidth;
      let done = false;
      el.addEventListener('transitionend', function onTe() {
        if (done) return;
        done = true;
        el.removeEventListener('transitionend', onTe);
        cleanupStyles();
        const prevId = getPrevId();
        if (prevId) {
          setGoingBackTrue();
          haptic();
          (window.showScreen || function(){}) (prevId);
        }
        activeEl = null;
      });
      requestAnimationFrame(() => {
        el.style.transform = `translate3d(${width}px,0,0)`;
        if (scrimEl) scrimEl.style.opacity = '0';
      });
    } else {
      const onTe = () => { el.removeEventListener('transitionend', onTe); cleanupStyles(); };
      el.addEventListener('transitionend', onTe);
      requestAnimationFrame(() => { el.style.transform = 'translate3d(0,0,0)'; });
    }

    dragging = decided = horizontal = false;
    inputKind = null;
    removeMoveEnd();
  }

  // --- Основная логика ---
  function onStartBase(clientX, clientY, srcEvent) {
    if (dragging || clientX > EDGE_START_PX) return;

    const t = srcEvent.target;
    const tag = (t?.tagName || '').toLowerCase();
    if (['input','textarea','select','button','label'].includes(tag)) return;
    if (t?.isContentEditable) return;

    activeEl = getActiveScreen();
    if (!activeEl) return;
    const id = activeEl.id || '';
    if (id === 'screen-home') return;  // не свайпаем с главного

    // если Warzone/BF экраны — возвращаем только на home
    if ((id.startsWith('screen-bf') || id.startsWith('screen-warzone')) && getPrevId() !== 'screen-home')
      return;

    dragging = true; decided = false; horizontal = false;
    startX = lastX = clientX;
    startY = clientY;
    startTime = lastTime = srcEvent.timeStamp || Date.now();
    instVX = 0;

    activeEl.style.willChange = 'transform';
    activeEl.style.transition = 'none';
    createScrim();
  }

  function onMoveBase(clientX, clientY, timeStamp, preventDefaultCb) {
    if (!dragging) return;
    const dx = clientX - startX;
    const dy = clientY - startY;

    if (!decided) {
      if (Math.abs(dx) + Math.abs(dy) < ACTIVATE_MOVE_THRESHOLD) return;
      if (Math.abs(dy) > Math.abs(dx)) { cancelGesture(); return; }
      if (dx <= 0) { cancelGesture(); return; }

      decided = true; horizontal = true;
      if (scrimEl) scrimEl.style.opacity = '1';
    }

    if (!horizontal) return;
    preventDefaultCb?.();
    const deltaX = Math.max(0, dx);
    setTranslate(deltaX);

    const now = timeStamp || Date.now();
    const dt = Math.max(1, now - lastTime);
    instVX = (clientX - lastX) / dt;
    lastX = clientX; lastTime = now;
  }

  function onEndBase(timeStamp) {
    if (!dragging) return;
    const now = timeStamp || Date.now();
    const totalDx = Math.max(0, lastX - startX);
    const totalDt = Math.max(1, now - startTime);
    const avgVX = totalDx / totalDt;

    const complete = (totalDx >= COMPLETE_DISTANCE_PX) ||
                     (avgVX > VELOCITY_THRESHOLD) ||
                     (instVX > VELOCITY_THRESHOLD);

    finishGesture(complete);
  }

  // --- Слушатели ---
  const capTrue  = { capture: true, passive: true };
  const capFalse = { capture: true, passive: false };

  function onTouchStart(e) {
    const t = e.touches?.[0]; if (!t || dragging) return;
    inputKind = 'touch';
    onStartBase(t.clientX, t.clientY, e);
    if (dragging) {
      document.addEventListener('touchmove', onMove, capFalse);
      document.addEventListener('touchend', onEnd, capFalse);
      document.addEventListener('touchcancel', onEnd, capFalse);
    }
  }
  function onTouchMove(e) { const t = e.touches?.[0]; if (t) onMoveBase(t.clientX, t.clientY, e.timeStamp, () => e.preventDefault()); }
  function onTouchEnd(e) { onEndBase(e.timeStamp); }

  function onPointerStart(e) {
    if (dragging || (e.pointerType === 'mouse' && e.button !== 0)) return;
    inputKind = e.pointerType === 'mouse' ? 'mouse' : 'pointer';
    onStartBase(e.clientX, e.clientY, e);
    if (dragging) {
      document.addEventListener('pointermove', onMove, capFalse);
      document.addEventListener('pointerup', onEnd, capTrue);
      document.addEventListener('pointercancel', onEnd, capTrue);
    }
  }
  function onPointerMove(e) { onMoveBase(e.clientX, e.clientY, e.timeStamp, () => e.preventDefault()); }
  function onPointerEnd(e) { onEndBase(e.timeStamp); }

  function onMouseDown(e) {
    if (dragging || e.button !== 0) return;
    inputKind = 'mouse';
    onStartBase(e.clientX, e.clientY, e);
    if (dragging) {
      document.addEventListener('mousemove', onMove, capFalse);
      document.addEventListener('mouseup', onEnd, capTrue);
    }
  }
  function onMouseMove(e) { onMoveBase(e.clientX, e.clientY, e.timeStamp, () => e.preventDefault()); }
  function onMouseUp(e) { onEndBase(e.timeStamp); }

  function onMove(e) {
    if (!dragging) return;
    if (inputKind === 'touch' && e.type === 'touchmove') return onTouchMove(e);
    if (inputKind === 'pointer' && e.type === 'pointermove') return onPointerMove(e);
    if (inputKind === 'mouse' && e.type === 'mousemove') return onMouseMove(e);
  }
  function onEnd(e) {
    if (!dragging) return;
    if (inputKind === 'touch') return onTouchEnd(e);
    if (inputKind === 'pointer') return onPointerEnd(e);
    if (inputKind === 'mouse') return onMouseUp(e);
  }

  // --- Инициализация ---
  document.addEventListener('touchstart',  onTouchStart,  capTrue);
  document.addEventListener('pointerdown', onPointerStart, capTrue);
  document.addEventListener('mousedown',   onMouseDown,   capTrue);

  window.DisableSwipeBack = function () {
    document.removeEventListener('touchstart',  onTouchStart,  capTrue);
    document.removeEventListener('pointerdown', onPointerStart, capTrue);
    document.removeEventListener('mousedown',   onMouseDown,   capTrue);
    removeMoveEnd(); cancelGesture();
  };
})();
