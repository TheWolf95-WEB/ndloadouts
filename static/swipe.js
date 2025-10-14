/* ==========================================================
   swipe-back.js — Edge Swipe Back v10
   Псевдо-нативный интерактивный back, как в Telegram
   ========================================================== */
(function () {
  'use strict';

  // === Настройки ===
  const EDGE_START_PX = 30;           // зона старта свайпа
  const COMPLETE_DISTANCE_RATIO = 0.28; // доля ширины (≈ iOS-поведение)
  const VELOCITY_THRESHOLD = 0.28;    // px/ms
  const ACTIVATE_MOVE_THRESHOLD = 10; // когда решаем, что жест — горизонтальный
  const EASE_OUT = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
  const PARALLAX_RATIO = 0.32;        // как двигается предыдущий экран
  const MAX_SCRIM_OPACITY = 0.4;      // затемнение фона
  const MIN_ANIM = 160, MAX_ANIM = 380; // авто-длительность докрутки

  let dragging = false, decided = false;
  let startX = 0, startY = 0, lastX = 0, startT = 0, lastT = 0;
  let instVX = 0;

  // Текущее/предыдущее DOM-узлы
  let activeEl = null, prevEl = null, scrimEl = null;
  let rafId = 0;

  // velocity: сглаживаем скользящим окном последних замеров
  const velSamples = [];
  const VEL_WINDOW = 4; // последних N измерений

  function hapticLight() {
    try { Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch {}
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch {} }
  }

  function getHistoryArray() {
    if (Array.isArray(window.screenHistory)) return window.screenHistory;
    try { return Array.isArray(screenHistory) ? screenHistory : null; } catch { return null; }
  }

  function getPrevId() {
    const h = getHistoryArray();
    return h && h[h.length - 1];
  }

  function setGoingBackTrue() {
    window.isGoingBack = true; try { isGoingBack = true; } catch {}
  }

  function getActiveScreen() {
    let el = document.querySelector('.screen.active');
    if (!el) {
      el = [...document.querySelectorAll('.screen')].find(s => s.style.display !== 'none');
      if (el) el.classList.add('active');
    }
    return el;
  }

  function getScreenById(id) {
    if (!id) return null;
    return document.getElementById(id);
  }

  function ensureScrim() {
    if (!scrimEl) {
      scrimEl = document.createElement('div');
      Object.assign(scrimEl.style, {
        position: 'fixed',
        inset: '0',
        background: 'rgba(0,0,0,1)',
        opacity: '0',
        pointerEvents: 'none',
        zIndex: '2147483646',
        transition: 'opacity 120ms linear'
      });
      document.body.appendChild(scrimEl);
    }
    scrimEl.style.opacity = '0';
  }

  function isInFormControl(t) {
    const tag = (t?.tagName || '').toLowerCase();
    if (['input','textarea','select','button','label'].includes(tag)) return true;
    if (t?.isContentEditable) return true;
    return false;
  }

  function hasHorizontalScrollableAncestor(el) {
    // Игнорим жест, если в зоне есть горизонтальные скроллящиеся контейнеры (карусели)
    let n = el;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 8) return true;
      n = n.parentElement;
    }
    return false;
  }

  function setProgress(p) {
    // p: [0..1]
    if (!activeEl) return;
    const w = window.innerWidth || activeEl.clientWidth || 1;
    const x = p * w;
    const prevX = (-1 + p) * (PARALLAX_RATIO * w); // старт чуть левее, плавно к 0

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      activeEl.style.transform = `translate3d(${x}px,0,0)`;
      activeEl.style.boxShadow = '0 0 18px rgba(0,0,0,0.25)';
      if (prevEl) prevEl.style.transform = `translate3d(${prevX}px,0,0)`;
      if (scrimEl) scrimEl.style.opacity = String(Math.min(MAX_SCRIM_OPACITY, p * 0.9));
    });
  }

  function resetStyles() {
    if (activeEl) {
      activeEl.style.transition = '';
      activeEl.style.transform = '';
      activeEl.style.boxShadow = '';
      activeEl.style.willChange = '';
    }
    if (prevEl) {
      prevEl.style.transition = '';
      prevEl.style.transform = '';
      prevEl.style.willChange = '';
    }
    if (scrimEl) scrimEl.style.opacity = '0';
  }

  function finish(toComplete) {
    if (!activeEl) { cleanup(); return; }
    const w = window.innerWidth || activeEl.clientWidth || 1;

    const pNow = Math.max(0, Math.min(1, (lastX - startX) / w));
    const rem = toComplete ? (1 - pNow) : pNow;
    const base = MIN_ANIM + (MAX_ANIM - MIN_ANIM) * rem; // чем ближе — тем быстрее
    const vel = Math.abs(instVX);
    const velBoost = Math.max(0.92, Math.min(1.12, 1.0 - 0.22 * Math.min(1, vel / 1.2)));
    const dur = Math.round(base * velBoost);

    if (toComplete) {
      // Уходим вправо, предыдущий — к 0
      if (activeEl) activeEl.style.transition = `transform ${dur}ms ${EASE_OUT}`;
      if (prevEl) prevEl.style.transition = `transform ${dur}ms ${EASE_OUT}`;
      const onTe = () => {
        activeEl.removeEventListener('transitionend', onTe);
        resetStyles();
        const prevId = getPrevId();
        if (prevId) {
          setGoingBackTrue();
          hapticLight();
          (window.showScreen || function(){}) (prevId);
        }
        cleanup();
      };
      activeEl.addEventListener('transitionend', onTe);
      requestAnimationFrame(() => {
        activeEl.style.transform = `translate3d(${w}px,0,0)`;
        if (prevEl) prevEl.style.transform = `translate3d(0,0,0)`;
        if (scrimEl) scrimEl.style.opacity = '0';
      });
    } else {
      // Возврат
      if (activeEl) activeEl.style.transition = `transform ${dur}ms ${EASE_OUT}`;
      if (prevEl) prevEl.style.transition = `transform ${dur}ms ${EASE_OUT}`;
      const onTe = () => {
        activeEl.removeEventListener('transitionend', onTe);
        resetStyles();
        cleanup();
      };
      activeEl.addEventListener('transitionend', onTe);
      requestAnimationFrame(() => {
        activeEl.style.transform = 'translate3d(0,0,0)';
        if (prevEl) prevEl.style.transform = `translate3d(${-PARALLAX_RATIO * w}px,0,0)`;
        if (scrimEl) scrimEl.style.opacity = '0';
      });
    }
  }

  function cleanup() {
    dragging = decided = false;
    startX = startY = lastX = 0;
    startT = lastT = 0;
    instVX = 0;
    velSamples.length = 0;
    activeEl = prevEl = null;
  }

  // --- Жест (Pointer Events) ---
  const capDown = { capture: true, passive: true };
  const capMove = { capture: true, passive: false }; // важно: можем preventDefault
  const capUp   = { capture: true, passive: true };

  function onPointerDown(e) {
    if (dragging) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;  // только ЛКМ
    if (e.clientX > EDGE_START_PX) return;                     // только с края
    if (isInFormControl(e.target)) return;                     // не дергаем инпуты
    if (hasHorizontalScrollableAncestor(e.target)) return;     // карусели и т.п.

    activeEl = getActiveScreen();
    if (!activeEl) return;

    const id = activeEl.id || '';
    if (id === 'screen-home') return;
    if ((id.startsWith('screen-bf') || id.startsWith('screen-warzone')) && getPrevId() !== 'screen-home')
      return;

    const prevId = getPrevId();
    prevEl = getScreenById(prevId);
    ensureScrim();

    // Подготовка слоёв
    if (prevEl) {
      prevEl.style.willChange = 'transform';
      prevEl.style.transform = `translate3d(${-PARALLAX_RATIO * (window.innerWidth || 320)}px,0,0)`;
      prevEl.style.zIndex = '1';
    }
    activeEl.style.willChange = 'transform';
    activeEl.style.transition = 'none';
    activeEl.style.zIndex = '2';

    dragging = true; decided = false;
    startX = lastX = e.clientX;
    startY = e.clientY;
    startT = lastT = e.timeStamp || Date.now();
    instVX = 0;
    velSamples.length = 0;

    // Важно: разрешаем вертикальный скролл, но как только решим — блокируем
    try { e.target.setPointerCapture?.(e.pointerId); } catch {}
    document.addEventListener('pointermove', onPointerMove, capMove);
    document.addEventListener('pointerup', onPointerUp, capUp);
    document.addEventListener('pointercancel', onPointerUp, capUp);
  }

  function onPointerMove(e) {
    if (!dragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!decided) {
      // Пока не решили — не блокируем вертикальный скролл
      if (Math.abs(dx) + Math.abs(dy) < ACTIVATE_MOVE_THRESHOLD) return;
      if (Math.abs(dy) > Math.abs(dx)) { // вертикаль победила
        return onPointerUp(e, /*cancel*/true);
      }
      if (dx <= 0) { // не тянем влево
        return onPointerUp(e, /*cancel*/true);
      }
      decided = true;
      // Заблокируем дефолты (чтобы не прокручивался документ)
      e.preventDefault();
    } else {
      e.preventDefault();
    }

    lastX = e.clientX;
    const w = window.innerWidth || activeEl.clientWidth || 1;
    const p = Math.max(0, Math.min(1, (lastX - startX) / w));
    setProgress(p);

    // velocity
    const now = e.timeStamp || Date.now();
    const dt = Math.max(1, now - lastT);
    const vx = (e.clientX - (startX + (w * p - w * (p - (e.clientX - lastX) / w)))) / dt; // упрощённо
    instVX = (e.clientX - lastX) / dt;
    velSamples.push(instVX);
    if (velSamples.length > VEL_WINDOW) velSamples.shift();
    // сглаженная:
    instVX = velSamples.reduce((a,b)=>a+b,0) / velSamples.length;

    lastT = now;
  }

  function onPointerUp(e, cancelOnly) {
    if (!dragging) return;

    document.removeEventListener('pointermove', onPointerMove, capMove);
    document.removeEventListener('pointerup', onPointerUp, capUp);
    document.removeEventListener('pointercancel', onPointerUp, capUp);

    if (cancelOnly) {
      resetStyles(); cleanup(); return;
    }

    const w = window.innerWidth || activeEl.clientWidth || 1;
    const totalDx = Math.max(0, lastX - startX);
    const p = totalDx / w;

    const completeByDist = p >= COMPLETE_DISTANCE_RATIO;
    const completeByVel  = instVX > VELOCITY_THRESHOLD;

    // Хаптик, если «защёлкнули» по дистанции
    if (completeByDist) hapticLight();

    finish(completeByDist || completeByVel);
  }

  // Инициализация
  document.addEventListener('pointerdown', onPointerDown, capDown);

  // Экспорт отключалки
  window.DisableSwipeBack = function () {
    document.removeEventListener('pointerdown', onPointerDown, capDown);
    document.removeEventListener('pointermove', onPointerMove, capMove);
    document.removeEventListener('pointerup', onPointerUp, capUp);
    document.removeEventListener('pointercancel', onPointerUp, capUp);
    resetStyles(); cleanup();
  };

  // Рекомендуется: ограничить горизонтальные жесты по умолчанию и разрешить вертикаль
  // Поставь это правило у корневой ноды (например, на body) в CSS:
  // body { touch-action: pan-y; }
})();
