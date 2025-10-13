/* ==========================================================
   swipe-back.js — Smooth Edge Swipe Back (v5)
   Телеграм-вэбвью: iOS / Android / Desktop WebView
   — плавная анимация как в ТГ (медленнее, с «резинкой»)
   — не мешает вертикальному скроллу
   — edge hit-area для iOS (левый край 30px)
   — корректный back отдельно для Warzone и Battlefield
   — без библиотек
   ========================================================== */
(function () {
  'use strict';

  // ===== Настройки =====
  const EDGE_START_PX = 40;           // старт только от левого края
  const EDGE_HIT_WIDTH = 30;          // хит-зона для iOS (перехват touchstart)
  const COMPLETE_DISTANCE_PX = 90;    // дистанция для успеха (чуть больше для уверенного жеста)
  const VELOCITY_THRESHOLD = 0.35;    // px/ms быстрый свайп
  const ACTIVATE_MOVE_THRESHOLD = 10; // до решения по направлению
  const BASE_ANIM_MS = 360;           // базовая длительность (медленнее = плавнее)
  const EASE = 'cubic-bezier(.22,.61,.36,1)';   // iOS-подобный ease out
  const CANCEL_EASE = 'cubic-bezier(.2,.8,.2,1)'; // мягкий возврат

  // ===== Служебные =====
  let dragging = false, decided = false, horizontal = false, finished = false;
  let startX = 0, startY = 0, lastX = 0, lastTime = 0, startTime = 0, instVX = 0;
  let inputKind = null; // 'touch' | 'pointer' | 'mouse'
  let activeEl = null, scrimEl = null, edgeArea = null, rafId = 0;

  // ===== Навигационный контекст (Warzone vs Battlefield) =====
  function getActiveScreen() {
    let el = document.querySelector('.screen.active');
    if (!el) {
      const list = Array.from(document.querySelectorAll('.screen'));
      el = list.find(s => s.style.display !== 'none') || null;
      if (el && !el.classList.contains('active')) el.classList.add('active');
    }
    return el;
  }
  function isBFScreenId(id) { return /^screen-bf/.test(String(id || '')); }

  function getNavCtx() {
    const active = getActiveScreen();
    const bfMode = active ? isBFScreenId(active.id) : false;

    function peekWarPrev() {
      const h = Array.isArray(window.screenHistory) ? window.screenHistory : null;
      return h && h[h.length - 1];
    }
    function showWar(id) {
      window.isGoingBack = true; // showScreen учитывает этот флаг и НЕ пушит
      if (typeof window.showScreen === 'function') window.showScreen(id);
    }

    function getBfHist() {
      try { /* eslint-disable no-undef */ return bfScreenHistory; /* eslint-enable */ } catch {}
      return window.bfScreenHistory || null;
    }
    function peekBfPrev() {
      const h = getBfHist(); return h && h[h.length - 1];
    }
    function showBf(id, fromId) {
      // В bfShowScreen нет флага isGoingBack -> она пушит текущий экран.
      // Делаем fix-up после вызова: если последний = fromId, выпилим.
      if (typeof window.bfShowScreen === 'function') {
        window.bfShowScreen(id);
        const h = getBfHist();
        if (h && h.length && h[h.length - 1] === fromId) h.pop();
      } else {
        // fallback: хотя бы покажем нужный экран, если bfShowScreen недоступен
        if (typeof window.showScreen === 'function') window.showScreen(id);
      }
    }

    return {
      bfMode,
      peekPrev: bfMode ? peekBfPrev : peekWarPrev,
      goTo: (id, fromId) => bfMode ? showBf(id, fromId) : showWar(id),
      afterNavUpdate: updateEdgeArea
    };
  }

  // ===== Хаптика =====
  function haptic() {
    try { Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch {}
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch {} }
  }

  // ===== Скрим (градиент) =====
  function ensureScrim() {
    if (!scrimEl) {
      scrimEl = document.createElement('div');
      Object.assign(scrimEl.style, {
        position: 'fixed',
        inset: '0',
        pointerEvents: 'none',
        background: 'linear-gradient(to right, rgba(0,0,0,0.28), rgba(0,0,0,0))',
        opacity: '0',
        transition: 'opacity 200ms ease',
        zIndex: '2147483646'
      });
      document.body.appendChild(scrimEl);
    } else {
      scrimEl.style.opacity = '0';
    }
  }

  // ===== Edge hit-area для iOS =====
  function ensureEdgeArea() {
    if (!edgeArea) {
      edgeArea = document.createElement('div');
      Object.assign(edgeArea.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: EDGE_HIT_WIDTH + 'px',
        height: '100vh',
        zIndex: '2147483647',
        background: 'transparent',
        pointerEvents: 'none'
      });
      document.body.appendChild(edgeArea);

      edgeArea.addEventListener('touchstart', (e) => onTouchStart(e, true), { capture: true, passive: true });
      edgeArea.addEventListener('pointerdown', (e) => onPointerStart(e, true), { capture: true, passive: true });
      edgeArea.addEventListener('mousedown', (e) => onMouseDown(e, true), { capture: true, passive: true });
    }
    updateEdgeArea();
  }

  function canGoBackNow() {
    const { peekPrev } = getNavCtx();
    const act = getActiveScreen();
    if (!act) return false;
    if (act.id === 'screen-home') return false;
    return Boolean(peekPrev());
  }

  function updateEdgeArea() {
    if (!edgeArea) return;
    edgeArea.style.pointerEvents = canGoBackNow() ? 'auto' : 'none';
  }

  // ===== Рендер с резинкой (после 120px — сопротивление) =====
  function renderTranslate(rawDx) {
    if (!activeEl) return;
    const dx = Math.max(0, rawDx);
    let shown = dx;
    if (dx > 120) shown = 120 + (dx - 120) * 0.35; // резинка как в iOS
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      activeEl.style.transform = `translate3d(${shown}px,0,0)`;
      activeEl.style.boxShadow = '0 0 16px rgba(0,0,0,0.25)';
      if (scrimEl) scrimEl.style.opacity = String(Math.min(dx / 140, 0.6));
    });
  }

  // ===== Очистка =====
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
    dragging = decided = horizontal = false;
    inputKind = null;
    finished = false;
    cleanupStyles();
    removeMoveEndListeners();
    activeEl = null;
  }

  // ===== Длительность (медленнее и плавнее) =====
  function computeDurMs({ remaining, base = BASE_ANIM_MS, velo = 0 }) {
    // Чем меньше оставшаяся дистанция и выше скорость — тем короче.
    let ms = base * (remaining / Math.max(remaining, 1));
    ms = 220 + (ms * 0.55);
    ms -= Math.min(100, Math.max(0, velo * 230)); // быстрый свайп — быстрее докатываем
    return Math.max(200, Math.min(420, Math.round(ms)));
  }

  // ===== Завершение =====
  function finishGesture({ complete, rawDx, velocity }) {
    if (!activeEl || finished) { cancelGesture(); return; }
    finished = true;

    const el = activeEl;
    const width = Math.max(window.innerWidth, el.offsetWidth || 0);

    if (complete) {
      const remaining = Math.max(0, width - Math.max(0, rawDx));
      const dur = computeDurMs({ remaining, base: BASE_ANIM_MS, velo: velocity });
      el.style.transition = `transform ${dur}ms ${EASE}`;

      const fromId = el.id;
      const { peekPrev, goTo, afterNavUpdate } = getNavCtx();
      const prevId = peekPrev();
      let done = false;
      const endOnce = () => {
        if (done) return; done = true;
        el.removeEventListener('transitionend', endOnce);
        cleanupStyles();
        if (prevId) {
          haptic();
          goTo(prevId, fromId);
        }
        activeEl = null;
        afterNavUpdate && afterNavUpdate();
      };
      el.addEventListener('transitionend', endOnce);
      setTimeout(endOnce, dur + 80); // фолбэк

      requestAnimationFrame(() => {
        el.style.transform = `translate3d(${width}px,0,0)`;
        if (scrimEl) scrimEl.style.opacity = '0';
      });

    } else {
      // Возврат с лёгким «торможением»
      const remainingBack = Math.max(0, Math.max(0, rawDx));
      const dur = computeDurMs({ remaining: remainingBack, base: BASE_ANIM_MS * 0.85, velo: velocity });
      el.style.transition = `transform ${dur}ms ${CANCEL_EASE}`;

      const onTe = () => {
        el.removeEventListener('transitionend', onTe);
        // небольшой «отскок» для настоящей нативности
        el.style.transition = `transform 150ms ${EASE}`;
        el.style.transform = 'translate3d(-6px,0,0)';
        setTimeout(() => {
          el.style.transform = 'translate3d(0,0,0)';
          setTimeout(() => { cleanupStyles(); activeEl = null; updateEdgeArea(); }, 150);
        }, 0);
      };
      el.addEventListener('transitionend', onTe);

      requestAnimationFrame(() => {
        el.style.transform = 'translate3d(0,0,0)';
        if (scrimEl) scrimEl.style.opacity = '0';
      });
    }

    dragging = decided = horizontal = false;
    inputKind = null;
    removeMoveEndListeners();
  }

  // ===== База жеста =====
  function onStartBase(clientX, clientY, srcEvent, forceEdge = false) {
    if (dragging) return;
    if (!forceEdge && clientX > EDGE_START_PX) return;

    // пропускаем инпуты и contentEditable
    const t = srcEvent.target;
    const tag = (t?.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select', 'button', 'label'].includes(tag)) return;
    if (t?.isContentEditable) return;

    activeEl = getActiveScreen();
    if (!activeEl) return;
    if (activeEl.id === 'screen-home') return;
    if (!canGoBackNow()) return;

    dragging = true; decided = false; horizontal = false; finished = false;

    startX = lastX = clientX;
    startY = clientY;
    startTime = lastTime = srcEvent.timeStamp || Date.now();
    instVX = 0;

    ensureScrim();
    activeEl.style.willChange = 'transform';
    activeEl.style.transition = 'none';
    activeEl.style.touchAction = 'pan-y'; // вертикаль до lock
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
    if (preventDefaultCb) preventDefaultCb(); // блокируем прокрутку только после lock

    const now = timeStamp || Date.now();
    const dt = Math.max(1, now - lastTime);
    instVX = (clientX - lastX) / dt; // px/ms
    lastX = clientX; lastTime = now;

    renderTranslate(dx);
  }

  function onEndBase(timeStamp) {
    if (!dragging) return;
    const now = timeStamp || Date.now();
    const totalDx = Math.max(0, lastX - startX);
    const totalDt = Math.max(1, now - startTime);
    const avgVX = totalDx / totalDt;
    const v = Math.max(instVX, avgVX);

    // «Проекция» с учётом скорости (как будто дотянет)
    const projected = totalDx + Math.max(0, v) * 280;

    const complete =
      totalDx >= COMPLETE_DISTANCE_PX ||
      v > VELOCITY_THRESHOLD ||
      projected >= Math.min(window.innerWidth * 0.42, 190);

    finishGesture({ complete, rawDx: totalDx, velocity: v });
  }

  // ===== Низкоуровневые прокси =====
  const capTrue  = { capture: true,  passive: true  };
  const capFalse = { capture: true,  passive: false };

  function onTouchStart(e, force) {
    if (dragging) return;
    const t = e.touches && e.touches[0]; if (!t) return;
    inputKind = 'touch';
    onStartBase(t.clientX, t.clientY, e, !!force);
    if (dragging) {
      document.addEventListener('touchmove', onMove, capFalse);
      document.addEventListener('touchend', onEnd, capFalse);
      document.addEventListener('touchcancel', onEnd, capFalse);
    }
  }
  function onTouchMove(e) {
    const t = e.touches && e.touches[0]; if (!t) return;
    onMoveBase(t.clientX, t.clientY, e.timeStamp, () => { if (e.cancelable) e.preventDefault(); });
  }
  function onTouchEnd(e) { onEndBase(e.timeStamp); }

  function onPointerStart(e, force) {
    if (dragging) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    inputKind = e.pointerType === 'mouse' ? 'mouse' : 'pointer';
    onStartBase(e.clientX, e.clientY, e, !!force);
    if (dragging) {
      document.addEventListener('pointermove', onMove, capFalse);
      document.addEventListener('pointerup', onEnd, capTrue);
      document.addEventListener('pointercancel', onEnd, capTrue);
    }
  }
  function onPointerMove(e) { onMoveBase(e.clientX, e.clientY, e.timeStamp, () => { if (e.cancelable) e.preventDefault(); }); }
  function onPointerEnd(e) { onEndBase(e.timeStamp); }

  function onMouseDown(e, force) {
    if (dragging) return;
    if (e.button !== 0) return;
    inputKind = 'mouse';
    onStartBase(e.clientX, e.clientY, e, !!force);
    if (dragging) {
      document.addEventListener('mousemove', onMove, capFalse);
      document.addEventListener('mouseup', onEnd, capTrue);
    }
  }
  function onMouseMove(e) { onMoveBase(e.clientX, e.clientY, e.timeStamp, () => { if (e.cancelable) e.preventDefault(); }); }
  function onMouseUp(e) { onEndBase(e.timeStamp); }

  function onMove(e) {
    if (!dragging) return;
    if (inputKind === 'touch'   && e.type === 'touchmove')   return onTouchMove(e);
    if (inputKind === 'pointer' && e.type === 'pointermove') return onPointerMove(e);
    if (inputKind === 'mouse'   && e.type === 'mousemove')   return onMouseMove(e);
  }
  function onEnd(e) {
    if (!dragging) return;
    if (inputKind === 'touch'   && (e.type === 'touchend' || e.type === 'touchcancel')) return onTouchEnd(e);
    if (inputKind === 'pointer' && (e.type === 'pointerup' || e.type === 'pointercancel')) return onPointerEnd(e);
    if (inputKind === 'mouse'   && e.type === 'mouseup') return onMouseUp(e);
  }

  // ===== Инициализация =====
  document.addEventListener('touchstart',  (e) => onTouchStart(e, false),  { capture: true, passive: true });
  document.addEventListener('pointerdown', (e) => onPointerStart(e, false),{ capture: true, passive: true });
  document.addEventListener('mousedown',   (e) => onMouseDown(e, false),   { capture: true, passive: true });

  ensureEdgeArea();
  ensureScrim();
  updateEdgeArea();

  // Обновляем хит-зону после переходов
  function wrapNav(fnName) {
    const fn = window[fnName];
    if (typeof fn === 'function' && !fn.__swipewrapped) {
      window[fnName] = function () {
        const res = fn.apply(this, arguments);
        setTimeout(updateEdgeArea, 0);
        return res;
      };
      window[fnName].__swipewrapped = true;
    }
  }
  wrapNav('showScreen');
  wrapNav('bfShowScreen');

  // Если меняют history вручную — обновим зону
  try {
    if (Array.isArray(window.screenHistory) && !window.screenHistory.__patched) {
      const push = window.screenHistory.push.bind(window.screenHistory);
      window.screenHistory.push = function () { const r = push.apply(this, arguments); updateEdgeArea(); return r; };
      window.screenHistory.__patched = true;
    }
  } catch {}
  try {
    /* eslint-disable no-undef */
    if (Array.isArray(bfScreenHistory) && !bfScreenHistory.__patched) {
      const push = bfScreenHistory.push.bind(bfScreenHistory);
      bfScreenHistory.push = function () { const r = push.apply(this, arguments); updateEdgeArea(); return r; };
      bfScreenHistory.__patched = true;
    }
    /* eslint-enable */
  } catch {}

  // Публичный выключатель
  window.DisableSwipeBack = function () {
    if (edgeArea) edgeArea.style.pointerEvents = 'none';
    document.removeEventListener('touchstart',  onTouchStart,  { capture: true, passive: true });
    document.removeEventListener('pointerdown', onPointerStart, { capture: true, passive: true });
    document.removeEventListener('mousedown',   onMouseDown,   { capture: true, passive: true });
    removeMoveEndListeners();
    cancelGesture();
  };
})();
