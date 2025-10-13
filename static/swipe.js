/* ==========================================================
   swipe-back.js — Edge Swipe Back (v6, universal)
   iOS / Android / Desktop WebView (Telegram)
   — плавная анимация (iOS-like), «резинка», мягкий возврат
   — direction lock: не мешает вертикальному скроллу
   — корректный back отдельно для Warzone и Battlefield
   — поддерживает let screenHistory / bfScreenHistory (не window.*)
   — edge hit-area 30px для iOS WKWebView
   ========================================================== */
(function () {
  'use strict';

  // --- Tune ---
  const EDGE_START_PX = 40;
  const EDGE_HIT_WIDTH = 30;         // iOS hit area
  const COMPLETE_DISTANCE_PX = 90;   // feel like TG
  const VELOCITY_THRESHOLD = 0.35;   // px/ms
  const ACTIVATE_MOVE_THRESHOLD = 10;
  const BASE_ANIM_MS = 420;          // slower = smoother
  const EASE_GO = 'cubic-bezier(.22,.61,.36,1)';
  const EASE_BACK = 'cubic-bezier(.2,.8,.2,1)';

  // --- State ---
  let dragging = false, decided = false, horizontal = false, finished = false;
  let startX = 0, startY = 0, lastX = 0, lastTime = 0, startTime = 0, instVX = 0;
  let inputKind = null; // 'touch' | 'pointer' | 'mouse'
  let activeEl = null, scrimEl = null, edgeArea = null, rafId = 0;

  // ===== Helpers: history detection (supports top-level let) =====
  function getWarHistory() {
    if (Array.isArray(window.screenHistory)) return window.screenHistory;
    try { /* eslint-disable no-undef */ if (Array.isArray(screenHistory)) return screenHistory; /* eslint-enable */ } catch {}
    return null;
  }
  function getBFHistory() {
    if (Array.isArray(window.bfScreenHistory)) return window.bfScreenHistory;
    try { /* eslint-disable no-undef */ if (Array.isArray(bfScreenHistory)) return bfScreenHistory; /* eslint-enable */ } catch {}
    return null;
  }
  function peek(arr) { return arr && arr.length ? arr[arr.length - 1] : null; }

  function setGoingBackTrue() {
    window.isGoingBack = true;
    try { /* eslint-disable no-undef */ isGoingBack = true; /* eslint-enable */ } catch {}
  }

  // ===== Active screen =====
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

  // ===== Context (Warzone vs Battlefield) =====
  function getNavCtx() {
    const act = getActiveScreen();
    const bfMode = act ? isBFScreenId(act.id) : false;

    const warHist = getWarHistory();
    const bfHist  = getBFHistory();

    function peekPrev() {
      return bfMode ? peek(bfHist) : peek(warHist);
    }

    function goBack(prevId, fromId) {
      if (!prevId) return;

      if (bfMode) {
        // BF: bfShowScreen всегда пушит current -> убираем лишнее после вызова
        if (typeof window.bfShowScreen === 'function') {
          window.bfShowScreen(prevId);
          const h = getBFHistory();
          if (h && h.length && h[h.length - 1] === fromId) h.pop();
        } else if (typeof window.showScreen === 'function') {
          // fallback
          window.showScreen(prevId);
        }
      } else {
        // Warzone: у тебя есть флаг isGoingBack — используем как в ТЗ
        setGoingBackTrue();
        if (typeof window.showScreen === 'function') {
          window.showScreen(prevId);
        }
        // Важно: НЕ попаем history — как в твоём контракте
      }
    }

    return { bfMode, peekPrev, goBack };
  }

  // ===== Haptics =====
  function haptic() {
    try { Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch {}
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch {} }
  }

  // ===== Scrim =====
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

  // ===== Edge Hit Area (iOS) =====
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

      edgeArea.addEventListener('touchstart',  (e) => onTouchStart(e, true),  { capture: true, passive: true });
      edgeArea.addEventListener('pointerdown', (e) => onPointerStart(e, true),{ capture: true, passive: true });
      edgeArea.addEventListener('mousedown',   (e) => onMouseDown(e, true),   { capture: true, passive: true });
    }
    updateEdgeArea();
  }

  function canGoBackNow() {
    const act = getActiveScreen();
    if (!act) return false;
    if (act.id === 'screen-home') return false;
    const { peekPrev } = getNavCtx();
    return Boolean(peekPrev());
  }

  function updateEdgeArea() {
    if (!edgeArea) return;
    edgeArea.style.pointerEvents = canGoBackNow() ? 'auto' : 'none';
  }

  // ===== Render with resistance (after 120px) =====
  function renderTranslate(rawDx) {
    if (!activeEl) return;
    const dx = Math.max(0, rawDx);
    let shown = dx;
    if (dx > 120) shown = 120 + (dx - 120) * 0.35; // iOS-like rubber band
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      activeEl.style.transform = `translate3d(${shown}px,0,0)`;
      activeEl.style.boxShadow = '0 0 16px rgba(0,0,0,0.25)';
      if (scrimEl) scrimEl.style.opacity = String(Math.min(dx / 140, 0.6));
    });
  }

  // ===== Cleanup =====
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

  // ===== Duration calculator (smooth & slow) =====
  function computeDurMs(remainingPx, velo, baseMs = BASE_ANIM_MS) {
    // remainingPx: сколько осталось пройти; velo: px/ms (>=0)
    let factor = Math.min(1, remainingPx / 320);      // 0..1
    let ms = baseMs * (0.35 + 0.65 * factor);         // 35%-100% от base
    ms -= Math.min(120, Math.max(0, velo * 200));     // быстрый свайп — короче
    return Math.max(260, Math.min(520, Math.round(ms)));
  }

  // ===== Finish =====
  function finishGesture({ complete, rawDx, velocity }) {
    if (!activeEl || finished) { cancelGesture(); return; }
    finished = true;

    const el = activeEl;
    const { peekPrev, goBack } = getNavCtx();
    const prevId = peekPrev();
    const fromId = el.id;
    const width = Math.max(window.innerWidth, el.offsetWidth || 0);

    if (complete) {
      const remaining = Math.max(0, width - Math.max(0, rawDx));
      const dur = computeDurMs(remaining, Math.max(0, velocity), BASE_ANIM_MS);
      el.style.transition = `transform ${dur}ms ${EASE_GO}`;

      let done = false;
      const endOnce = () => {
        if (done) return; done = true;
        el.removeEventListener('transitionend', endOnce);
        cleanupStyles();
        if (prevId) {
          haptic();
          goBack(prevId, fromId);
        }
        activeEl = null;
        updateEdgeArea();
      };
      el.addEventListener('transitionend', endOnce);
      setTimeout(endOnce, dur + 80); // fallback if transitionend lost

      requestAnimationFrame(() => {
        el.style.transform = `translate3d(${width}px,0,0)`;
        if (scrimEl) scrimEl.style.opacity = '0';
      });

    } else {
      // мягкий возврат + лёгкий отскок
      const remainingBack = Math.max(0, Math.max(0, rawDx));
      const dur = computeDurMs(remainingBack, Math.max(0, velocity), BASE_ANIM_MS * 0.85);
      el.style.transition = `transform ${dur}ms ${EASE_BACK}`;
      const onTe = () => {
        el.removeEventListener('transitionend', onTe);
        el.style.transition = `transform 160ms ${EASE_GO}`;
        el.style.transform = 'translate3d(-6px,0,0)';
        setTimeout(() => {
          el.style.transform = 'translate3d(0,0,0)';
          setTimeout(() => { cleanupStyles(); activeEl = null; updateEdgeArea(); }, 160);
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

  // ===== Gesture core =====
  function onStartBase(clientX, clientY, srcEvent, forceEdge = false) {
    if (dragging) return;
    if (!forceEdge && clientX > EDGE_START_PX) return;

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
    activeEl.style.touchAction = 'pan-y'; // allow vertical until lock
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
    if (preventDefaultCb) preventDefaultCb();

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

    // Projection: how far it would go with current speed
    const projected = totalDx + Math.max(0, v) * 280;

    const complete =
      totalDx >= COMPLETE_DISTANCE_PX ||
      v > VELOCITY_THRESHOLD ||
      projected >= Math.min(window.innerWidth * 0.42, 190);

    finishGesture({ complete, rawDx: totalDx, velocity: v });
  }

  // ===== Low-level wiring =====
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

  // ===== Init =====
  document.addEventListener('touchstart',  (e) => onTouchStart(e, false),  { capture: true, passive: true });
  document.addEventListener('pointerdown', (e) => onPointerStart(e, false),{ capture: true, passive: true });
  document.addEventListener('mousedown',   (e) => onMouseDown(e, false),   { capture: true, passive: true });

  ensureEdgeArea();
  ensureScrim();
  updateEdgeArea();

  // Update edge area after navigation
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

  try {
    const h = getWarHistory();
    if (h && !h.__swipepatched) {
      const push = h.push.bind(h);
      h.push = function () { const r = push.apply(this, arguments); updateEdgeArea(); return r; };
      h.__swipepatched = true;
    }
  } catch {}

  try {
    const hb = getBFHistory();
    if (hb && !hb.__swipepatched) {
      const push = hb.push.bind(hb);
      hb.push = function () { const r = push.apply(this, arguments); updateEdgeArea(); return r; };
      hb.__swipepatched = true;
    }
  } catch {}

  // Public switch
  window.DisableSwipeBack = function () {
    if (edgeArea) edgeArea.style.pointerEvents = 'none';
    document.removeEventListener('touchstart',  onTouchStart,  { capture: true, passive: true });
    document.removeEventListener('pointerdown', onPointerStart, { capture: true, passive: true });
    document.removeEventListener('mousedown',   onMouseDown,   { capture: true, passive: true });
    removeMoveEndListeners();
    cancelGesture();
  };
})();
