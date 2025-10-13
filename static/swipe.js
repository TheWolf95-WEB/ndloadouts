/* ==========================================================
   swipe-back.js — Edge Swipe Back для Telegram WebApp (v4)
   Плавный, предсказуемый, устойчивый (iOS/Android/Desktop).
   — Только от левого края (<= 40px). Есть edge hit-area 30px.
   — Возврат, если dx > 80px ИЛИ velocity > 0.3 px/ms (с проекцией).
   — Вертикальную прокрутку не ломает (direction lock).
   — Плавная анимация, сопротивление после 120px, инерция.
   — Хаптика/вибра при успехе.
   — Не работает на #screen-home.
   — Корректно управляет history: pop + isGoingBack=true.
   Подключать ПОСЛЕ app.js.
   ========================================================== */
(function () {
  'use strict';

  // --- Настройки ---
  const EDGE_START_PX = 40;
  const EDGE_HIT_WIDTH = 30;          // невидимая ловушка у края (для iOS)
  const COMPLETE_DISTANCE_PX = 80;    // базовый порог расстояния
  const VELOCITY_THRESHOLD = 0.3;     // px/ms
  const ACTIVATE_MOVE_THRESHOLD = 10; // до решения по направлению
  const BASE_ANIM_MS = 280;           // базовая длительность
  const EASE = 'cubic-bezier(.22,.61,.36,1)';

  // --- Состояние ---
  let dragging = false, decided = false, horizontal = false;
  let startX = 0, startY = 0, lastX = 0, lastTime = 0, startTime = 0, instVX = 0;
  let inputKind = null; // 'touch' | 'pointer' | 'mouse'
  let activeEl = null, scrimEl = null, edgeArea = null;
  let rafId = 0, finished = false;

  // ===== История / навигация (учёт let и window.*) =====
  function getHistoryArray() {
    if (Array.isArray(window.screenHistory)) return window.screenHistory;
    try { /* eslint-disable no-undef */ if (Array.isArray(screenHistory)) return screenHistory; /* eslint-enable */ } catch {}
    return null;
  }
  function peekPrevId() {
    const h = getHistoryArray();
    return h && h[h.length - 1];
  }
  function popPrevId() {
    const h = getHistoryArray();
    if (h && h.length) return h.pop();
    return null;
  }
  function setGoingBackTrue() {
    window.isGoingBack = true;
    try { /* eslint-disable no-undef */ isGoingBack = true; /* eslint-enable */ } catch {}
  }

  // ===== Текущее активное представление =====
  function getActiveScreen() {
    let el = document.querySelector('.screen.active');
    if (!el) {
      const list = Array.from(document.querySelectorAll('.screen'));
      el = list.find(s => s.style.display !== 'none') || null;
      if (el && !el.classList.contains('active')) el.classList.add('active');
    }
    return el;
  }

  // ===== Хаптика =====
  function haptic() {
    try { Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch {}
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch {} }
  }

  // ===== Визуальный скрим =====
  function ensureScrim() {
    if (!scrimEl) {
      scrimEl = document.createElement('div');
      Object.assign(scrimEl.style, {
        position: 'fixed',
        inset: '0',
        pointerEvents: 'none',
        background: 'linear-gradient(to right, rgba(0,0,0,0.25), rgba(0,0,0,0))',
        opacity: '0',
        transition: 'opacity 180ms ease',
        zIndex: '2147483646'
      });
      document.body.appendChild(scrimEl);
    } else {
      scrimEl.style.opacity = '0';
    }
  }

  // ===== Edge hit-area для iOS WebView надёжности =====
  function ensureEdgeArea() {
    if (!edgeArea) {
      edgeArea = document.createElement('div');
      edgeArea.id = 'swipe-edge-area';
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

      // Ловим старт именно на зоне
      edgeArea.addEventListener('touchstart', (e) => onTouchStart(e, true), { capture: true, passive: true });
      edgeArea.addEventListener('pointerdown', (e) => onPointerStart(e, true), { capture: true, passive: true });
      edgeArea.addEventListener('mousedown', (e) => onMouseDown(e, true), { capture: true, passive: true });
    }
    updateEdgeArea();
  }
  function canGoBackNow() {
    const act = getActiveScreen();
    const prevId = peekPrevId();
    if (!act) return false;
    if (act.id === 'screen-home') return false;
    return Boolean(prevId);
  }
  function updateEdgeArea() {
    if (!edgeArea) return;
    edgeArea.style.pointerEvents = canGoBackNow() ? 'auto' : 'none';
  }

  // ===== Отрисовка смещения с «сопротивлением» после 120px =====
  function renderTranslate(rawDx) {
    if (!activeEl) return;
    const dx = Math.max(0, rawDx);
    let shown = dx;
    if (dx > 120) {
      // после 120px — уменьшаем чувствительность как в iOS
      shown = 120 + (dx - 120) * 0.35;
    }
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      activeEl.style.transform = `translate3d(${shown}px,0,0)`;
      activeEl.style.boxShadow = '0 0 16px rgba(0,0,0,0.25)';
      if (scrimEl) {
        const p = Math.min(1, dx / 140);
        scrimEl.style.opacity = String(p * 0.6);
      }
    });
  }

  // ===== Очистка стилей =====
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

  // ===== Динамическая длительность для плавности =====
  function computeDurMs({ remaining, base = BASE_ANIM_MS, velo = 0 }) {
    // Чем меньше расстояние и выше скорость — тем короче анимация
    let ms = base * (remaining / Math.max(remaining, 1));
    // Нормализуем в адекватные рамки
    ms = 160 + (ms * 0.5);
    // Учитываем скорость (ускоряем при быстрой протяжке)
    ms -= Math.min(80, Math.max(0, velo * 200));
    return Math.max(140, Math.min(320, Math.round(ms)));
  }

  function finishGesture({ complete, rawDx, velocity }) {
    if (!activeEl || finished) { cancelGesture(); return; }
    finished = true;

    const el = activeEl;
    const width = Math.max(window.innerWidth, el.offsetWidth || 0);

    if (complete) {
      // Анимируем от текущего положения до края с учётом скорости
      const remaining = Math.max(0, width - Math.max(0, rawDx));
      const dur = computeDurMs({ remaining, base: BASE_ANIM_MS, velo: velocity });
      el.style.transition = `transform ${dur}ms ${EASE}`;

      let done = false;
      const onTe = () => {
        if (done) return;
        done = true;
        el.removeEventListener('transitionend', onTe);
        cleanupStyles();

        // Истинный back: POP из истории + isGoingBack=true
        const prevId = popPrevId();
        if (prevId) {
          setGoingBackTrue();
          haptic();
          (window.showScreen || function(){}) (prevId);
        }
        activeEl = null;
        updateEdgeArea();
      };

      el.addEventListener('transitionend', onTe);
      // Фолбэк на случай, если transitionend не пришёл
      const to = setTimeout(onTe, dur + 60);

      requestAnimationFrame(() => {
        el.style.transform = `translate3d(${width}px,0,0)`;
        if (scrimEl) scrimEl.style.opacity = '0';
      });

    } else {
      // Возврат на место (с «торможением» по covered distance и скорости)
      const remainingBack = Math.max(0, Math.max(0, rawDx));
      const dur = computeDurMs({ remaining: remainingBack, base: BASE_ANIM_MS * 0.75, velo: velocity });
      el.style.transition = `transform ${dur}ms ${EASE}`;

      const onTe = () => {
        el.removeEventListener('transitionend', onTe);
        cleanupStyles();
        activeEl = null;
        updateEdgeArea();
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
    // Старт только от края (или из хит-зоны)
    if (!forceEdge && clientX > EDGE_START_PX) return;

    // Пропускаем интерактивы
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
    activeEl.style.touchAction = 'pan-y'; // вертикаль разрешаем до lock
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

    // Блокируем скролл только когда уже решили, что горизонт
    if (preventDefaultCb) preventDefaultCb();

    // Считаем мгновенную скорость
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
    const avgVX = totalDx / totalDt; // px/ms
    const v = Math.max(instVX, avgVX);

    // Проекция с учётом скорости — более «натуральный» критерий
    const projected = totalDx + Math.max(0, v) * 260; // сколько бы «дотянул»
    const complete =
      totalDx >= COMPLETE_DISTANCE_PX ||
      v > VELOCITY_THRESHOLD ||
      projected >= Math.min(window.innerWidth * 0.42, 180);

    finishGesture({ complete, rawDx: totalDx, velocity: v });
  }

  // ===== Низкоуровневые прокси =====
  const capTrue  = { capture: true,  passive: true  };
  const capFalse = { capture: true,  passive: false };

  function onTouchStart(e, force) {
    const t = e.touches && e.touches[0]; if (!t) return;
    if (dragging) return;
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
  function onPointerMove(e) {
    onMoveBase(e.clientX, e.clientY, e.timeStamp, () => { if (e.cancelable) e.preventDefault(); });
  }
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
  if (typeof window.showScreen === 'function' && !window.showScreen.__swipewrapped) {
    const orig = window.showScreen;
    window.showScreen = function wrappedShowScreen(id) {
      const res = orig.apply(this, arguments);
      setTimeout(updateEdgeArea, 0);
      return res;
    };
    window.showScreen.__swipewrapped = true;
  }

  // Если где-то меняют history вручную — подстрахуемся
  const h = getHistoryArray();
  if (h && !h.__swipepatched) {
    const origPush = h.push.bind(h);
    h.push = function () {
      const r = origPush.apply(this, arguments);
      updateEdgeArea();
      return r;
    };
    h.__swipepatched = true;
  }

  // ===== Публичный выключатель =====
  window.DisableSwipeBack = function () {
    if (edgeArea) edgeArea.style.pointerEvents = 'none';
    document.removeEventListener('touchstart',  onTouchStart,  { capture: true, passive: true });
    document.removeEventListener('pointerdown', onPointerStart, { capture: true, passive: true });
    document.removeEventListener('mousedown',   onMouseDown,   { capture: true, passive: true });
    removeMoveEndListeners();
    cancelGesture();
  };
})();
