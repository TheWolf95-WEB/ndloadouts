/* ==========================================================
   swipe-back.js — Edge Swipe Back (v7, universal & smooth)
   Telegram WebApp: iOS / Android / Desktop WebView

   ✅ Плавная анимация «как в ТГ» (медленнее, с резинкой)
   ✅ Не мешает вертикальному скроллу (direction lock)
   ✅ Надёжный захват на iOS (edge hit-area 32px)
   ✅ Разделённые домены навигации:
      - Экраны Battlefield (id начинается с "screen-bf" или "screen-battlefield-main")
      - Экраны Warzone (всё остальное, кроме "screen-home")
      - На корне BF/WZ свайп -> перейти на screen-home
      - Никогда не прыгаем BF ↔ WZ напрямую
   ✅ Совместимо с let screenHistory / let bfScreenHistory
   ✅ Хаптика при успешном возврате
   ========================================================== */
(function () {
  'use strict';

  // -------- Настройки «ощущений» --------
  const EDGE_START_PX = 40;         // зона старта у края
  const EDGE_HIT_WIDTH = 32;        // iOS hit-area для надёжного touchstart
  const COMPLETE_DISTANCE_PX = 110; // расстояние для успеха (чуть больше = надёжнее)
  const VELOCITY_THRESHOLD = 0.45;  // px/ms — надо махнуть заметно, чтобы сработало
  const ACTIVATE_MOVE_THRESHOLD = 10; // после этого решаем направление
  const BASE_ANIM_MS = 520;         // базовая длительность (медленнее = плавнее)
  const EASE_GO   = 'cubic-bezier(.22,.61,.36,1)'; // плавный iOS-like out
  const EASE_BACK = 'cubic-bezier(.20,.80,.20,1)'; // мягкий возврат

  // -------- Служебные --------
  let dragging = false, decided = false, horizontal = false, finished = false;
  let startX = 0, startY = 0, lastX = 0, lastTime = 0, startTime = 0, instVX = 0;
  let inputKind = null;  // 'touch' | 'pointer' | 'mouse'
  let activeEl = null, scrimEl = null, edgeArea = null, rafId = 0;

  // ===== Истории (поддержка let и window.*) =====
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
  const peek = (arr) => (arr && arr.length ? arr[arr.length - 1] : null);

  // ===== Экраны / домены =====
  const HOME_ID = 'screen-home';
  const BF_ROOT = 'screen-battlefield-main';
  const WZ_ROOT = 'screen-warzone-main';

  function getActiveScreen() {
    let el = document.querySelector('.screen.active');
    if (!el) {
      const list = Array.from(document.querySelectorAll('.screen'));
      el = list.find(s => s.style.display !== 'none') || null;
      if (el && !el.classList.contains('active')) el.classList.add('active');
    }
    return el;
  }

  function isBFId(id) {
    const s = String(id || '');
    return s === BF_ROOT || s.startsWith('screen-bf');
  }
  function isWZId(id) {
    const s = String(id || '');
    return s !== HOME_ID && !isBFId(s);
  }

  function getNavCtx() {
    const act = getActiveScreen();
    const currentId = act?.id || '';
    const bfMode = isBFId(currentId);
    const wzMode = isWZId(currentId);

    const warHist = getWarHistory();
    const bfHist  = getBFHistory();

    function currentRoot() { return bfMode ? BF_ROOT : WZ_ROOT; }
    function isAtDomainRoot() { return currentId === currentRoot(); }

    function peekPrev() {
      // На корне домена свайп уводит на HOME
      if (isAtDomainRoot()) return HOME_ID;

      if (bfMode) {
        const p = peek(bfHist);
        // Если в BF-истории торчит чужой домен — идём на HOME вместо кросс-домена
        return isBFId(p) ? p : HOME_ID;
      } else if (wzMode) {
        const p = peek(warHist);
        return isWZId(p) ? p : HOME_ID;
      }
      return null;
    }

    function setGoingBackTrue() {
      window.isGoingBack = true;
      try { /* eslint-disable no-undef */ isGoingBack = true; /* eslint-enable */ } catch {}
    }

    function goBack(targetId, fromId) {
      if (!targetId) return;

      if (targetId === HOME_ID) {
        // Возвращаемся на Дом — через общий showScreen
        if (typeof window.showScreen === 'function') {
          setGoingBackTrue(); // пусть не пушит current
          window.showScreen(HOME_ID);
        }
        return;
      }

      if (bfMode) {
        // BF: только через bfShowScreen, не кросс-домен!
        if (!isBFId(targetId)) {
          // на всякий случай
          if (typeof window.showScreen === 'function') {
            setGoingBackTrue();
            window.showScreen(HOME_ID);
          }
          return;
        }
        if (typeof window.bfShowScreen === 'function') {
          window.bfShowScreen(targetId);
          // bfShowScreen пушит текущий — убираем лишний fromId из хвоста
          const h = getBFHistory();
          if (h && h.length && h[h.length - 1] === fromId) h.pop();
        } else if (typeof window.showScreen === 'function') {
          setGoingBackTrue();
          window.showScreen(targetId);
        }
        return;
      }

      // Warzone: через общий showScreen, с флагом
      if (!isWZId(targetId)) {
        // не допускаем кросс-домен
        if (typeof window.showScreen === 'function') {
          setGoingBackTrue();
          window.showScreen(HOME_ID);
        }
        return;
      }
      if (typeof window.showScreen === 'function') {
        setGoingBackTrue();
        window.showScreen(targetId);
      }
    }

    return { currentId, bfMode, wzMode, peekPrev, goBack };
  }

  // ===== Хаптика =====
  function haptic() {
    try { Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch {}
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch {} }
  }

  // ===== Скрим =====
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

  // ===== Edge hit-area (iOS) =====
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
    if (act.id === HOME_ID) return false;

    const { peekPrev } = getNavCtx();
    const target = peekPrev();
    return Boolean(target); // на корне — это будет HOME
  }

  function updateEdgeArea() {
    if (!edgeArea) return;
    edgeArea.style.pointerEvents = canGoBackNow() ? 'auto' : 'none';
  }

  // ===== Рендер с «резинкой» (после 100px сильнее сопротивление) =====
  function renderTranslate(rawDx) {
    if (!activeEl) return;
    const dx = Math.max(0, rawDx);
    let shown = dx;
    if (dx > 100) shown = 100 + (dx - 100) * 0.28; // плотнее «резинка», ещё плавнее
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      activeEl.style.transform = `translate3d(${shown}px,0,0)`;
      activeEl.style.boxShadow = '0 0 16px rgba(0,0,0,0.25)';
      if (scrimEl) scrimEl.style.opacity = String(Math.min(dx / 160, 0.6));
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

  // ===== Длительность (реально медленная и плавная) =====
  function computeDurMs(remainingPx, velo, baseMs = BASE_ANIM_MS) {
    // remainingPx: сколько осталось докатиться; velo >= 0 (px/ms)
    let perc = Math.min(1, remainingPx / 400);       // 0..1
    let ms = baseMs * (0.5 + 0.5 * perc);            // 50%-100% от base
    ms -= Math.min(60, Math.max(0, velo * 120));     // скорость чуть ускоряет
    return Math.max(320, Math.min(560, Math.round(ms)));
  }

  // ===== Завершение =====
  function finishGesture({ complete, rawDx, velocity }) {
    if (!activeEl || finished) { cancelGesture(); return; }
    finished = true;

    const el = activeEl;
    const width = Math.max(window.innerWidth, el.offsetWidth || 0);
    const { currentId, peekPrev, goBack } = getNavCtx();
    const targetId = peekPrev();

    if (complete) {
      const remaining = Math.max(0, width - Math.max(0, rawDx));
      const dur = computeDurMs(remaining, Math.max(0, velocity), BASE_ANIM_MS);
      el.style.transition = `transform ${dur}ms ${EASE_GO}`;

      let done = false;
      const endOnce = () => {
        if (done) return; done = true;
        el.removeEventListener('transitionend', endOnce);
        cleanupStyles();
        if (targetId) {
          haptic();
          goBack(targetId, currentId);
        }
        activeEl = null;
        updateEdgeArea();
      };
      el.addEventListener('transitionend', endOnce);
      setTimeout(endOnce, dur + 100);

      requestAnimationFrame(() => {
        el.style.transform = `translate3d(${width}px,0,0)`;
        if (scrimEl) scrimEl.style.opacity = '0';
      });

    } else {
      // Мягкий возврат с микро-отскоком — как в нативных iOS-жестах
      const remainingBack = Math.max(0, Math.max(0, rawDx));
      const dur = computeDurMs(remainingBack, Math.max(0, velocity), BASE_ANIM_MS * 0.9);
      el.style.transition = `transform ${dur}ms ${EASE_BACK}`;

      const onTe = () => {
        el.removeEventListener('transitionend', onTe);
        // лёгкий overshoot
        el.style.transition = `transform 180ms ${EASE_GO}`;
        el.style.transform = 'translate3d(-8px,0,0)';
        setTimeout(() => {
          el.style.transform = 'translate3d(0,0,0)';
          setTimeout(() => { cleanupStyles(); activeEl = null; updateEdgeArea(); }, 180);
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

  // ===== Жест =====
  function onStartBase(clientX, clientY, srcEvent, forceEdge = false) {
    if (dragging) return;
    if (!forceEdge && clientX > EDGE_START_PX) return;

    const t = srcEvent.target;
    const tag = (t?.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select', 'button', 'label'].includes(tag)) return;
    if (t?.isContentEditable) return;

    activeEl = getActiveScreen();
    if (!activeEl) return;
    if (activeEl.id === HOME_ID) return;
    if (!canGoBackNow()) return;

    dragging = true; decided = false; horizontal = false; finished = false;

    startX = lastX = clientX;
    startY = clientY;
    startTime = lastTime = srcEvent.timeStamp || Date.now();
    instVX = 0;

    ensureScrim();
    activeEl.style.willChange = 'transform';
    activeEl.style.transition = 'none';
    activeEl.style.touchAction = 'pan-y'; // пока не залочили — разрешаем вертикаль
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

    if (preventDefaultCb) preventDefaultCb(); // блокируем скролл только после lock

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

    // Проекция со скоростью — меньше влияние скорости, чтобы не «стреляло»
    const projected = totalDx + Math.max(0, v) * 220;

    const complete =
      totalDx >= COMPLETE_DISTANCE_PX ||
      v > VELOCITY_THRESHOLD ||
      projected >= Math.min(window.innerWidth * 0.36, 170);

    finishGesture({ complete, rawDx: totalDx, velocity: v });
  }

  // ===== Wiring =====
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

  // Перехватываем навигацию, чтобы обновлять хит-зону
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

  // Патчим push у историй — обновлять хит-зону при навигации
  try {
    const wh = getWarHistory();
    if (wh && !wh.__swipepatched) {
      const push = wh.push.bind(wh);
      wh.push = function () { const r = push.apply(this, arguments); updateEdgeArea(); return r; };
      wh.__swipepatched = true;
    }
  } catch {}
  try {
    const bh = getBFHistory();
    if (bh && !bh.__swipepatched) {
      const push = bh.push.bind(bh);
      bh.push = function () { const r = push.apply(this, arguments); updateEdgeArea(); return r; };
      bh.__swipepatched = true;
    }
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
