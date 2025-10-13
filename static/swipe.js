/* ==========================================================
   swipe-back.js — Edge Swipe Back для Telegram WebApp
   Автор: NDcoder
   ========================================================== */

(function () {
  'use strict';

  // --- Константы настройки ---
  const EDGE_START_PX = 40;               // зóna старта у левого края
  const COMPLETE_DISTANCE_PX = 80;        // расстояние для возврата
  const VELOCITY_THRESHOLD = 0.3;         // px/ms — "быстрый свайп"
  const ACTIVATE_MOVE_THRESHOLD = 8;      // пикселей до принятия решения по направлению
  const ANIM_MS = 220;                    // длительность завершения/отката
  const EASE = 'cubic-bezier(.22,.61,.36,1)';

  let dragging = false;
  let decided = false;
  let horizontal = false;

  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastTime = 0;
  let startTime = 0;
  let instVX = 0;

  let activeEl = null;
  let scrimEl = null;
  let rafId = 0;

  function getActiveScreen() {
    // Предпочитаем .screen.active; если нет — берём последнюю видимую
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
    try { Telegram.WebApp.HapticFeedback.impactOccurred("light"); } catch {}
    if (navigator.vibrate) {
      try { navigator.vibrate(15); } catch {}
    }
  }

  function createScrimIfNeeded() {
    if (!scrimEl) {
      scrimEl = document.createElement('div');
      scrimEl.id = 'swipe-back-scrim';
      Object.assign(scrimEl.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        background: 'linear-gradient(to right, rgba(0,0,0,0.25), rgba(0,0,0,0))',
        opacity: '0',
        transition: 'opacity 150ms ease',
        zIndex: '999'
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

  function cancelGesture() {
    dragging = false;
    decided = false;
    horizontal = false;
    cleanupStyles();
    removeMoveEndListeners();
    activeEl = null;
  }

  function finishGesture(complete) {
    if (!activeEl) {
      cancelGesture();
      return;
    }

    const el = activeEl;
    el.style.transition = `transform ${ANIM_MS}ms ${EASE}`;

    if (complete) {
      // Уезжаем вправо, затем навигируем назад
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
      // двойной rAF, чтобы гарантировать применение transition перед трансформацией
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.transform = `translate3d(${width}px,0,0)`;
        if (scrimEl) scrimEl.style.opacity = '0';
      }));
    } else {
      // Возвращаемся обратно
      const onTe = () => {
        el.removeEventListener('transitionend', onTe);
        cleanupStyles();
        activeEl = null;
      };
      el.addEventListener('transitionend', onTe);
      requestAnimationFrame(() => {
        el.style.transform = 'translate3d(0,0,0)';
      });
    }

    dragging = false;
    decided = false;
    horizontal = false;
    removeMoveEndListeners();
  }

  function onStart(e) {
    if (dragging) return;

    const isTouch = e.type === 'touchstart';
    const point = isTouch ? e.touches[0] : e;
    if (!point) return;

    // Только от самого левого края
    if (point.clientX > EDGE_START_PX) return;

    // Не триггерим на инпутах/textarea/select или contentEditable
    const target = e.target;
    const tag = (target?.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;
    if (target?.isContentEditable) return;

    // Определяем активный экран и условия
    activeEl = getActiveScreen();
    if (!activeEl) return;
    if (activeEl.id === 'screen-home') return;              // не работаем на главном
    if (!hasPrevInHistory()) return;                        // нет экрана назад — нечего делать

    // Инициал
    dragging = true;
    decided = false;
    horizontal = false;

    startX = lastX = point.clientX;
    startY = point.clientY;
    startTime = lastTime = e.timeStamp || Date.now();
    instVX = 0;

    // Подготовка стилей
    activeEl.style.willChange = 'transform';
    activeEl.style.transition = 'none';
    activeEl.style.touchAction = 'pan-y'; // даём странице вертикально скроллиться
    createScrimIfNeeded();

    addMoveEndListeners(isTouch);
  }

  function onMove(e) {
    if (!dragging) return;

    const isTouch = e.type === 'touchmove';
    const point = isTouch ? e.touches[0] : e;
    if (!point) return;

    const now = e.timeStamp || Date.now();
    const dx = point.clientX - startX;
    const dy = point.clientY - startY;

    // Пока не приняли решение — не мешаем вертикальному скроллу
    if (!decided) {
      if (Math.abs(dx) + Math.abs(dy) < ACTIVATE_MOVE_THRESHOLD) return;

      // Вертикаль доминирует — отменяем жест (не мешаем прокрутке)
      if (Math.abs(dy) > Math.abs(dx)) {
        cancelGesture();
        return;
      }

      // Движение влево — не наш кейс
      if (dx <= 0) {
        cancelGesture();
        return;
      }

      // Решение: горизонтальный свайп назад
      decided = true;
      horizontal = true;
      // Плавно покажем скрим
      if (scrimEl) scrimEl.style.opacity = '1';
    }

    if (!horizontal) return;

    // Раз мы в горизонтальном жесте — блокируем скролл страницы
    e.preventDefault();

    const deltaX = Math.max(0, dx);
    setTranslate(deltaX);

    // Считаем мгновенную скорость
    const dt = Math.max(1, now - lastTime);
    instVX = (point.clientX - lastX) / dt; // px/ms
    lastX = point.clientX;
    lastTime = now;
  }

  function onEnd(e) {
    if (!dragging) return;

    const now = e.timeStamp || Date.now();
    const totalDx = Math.max(0, lastX - startX);
    const totalDt = Math.max(1, now - startTime);
    const avgVX = totalDx / totalDt; // px/ms

    const complete =
      totalDx >= COMPLETE_DISTANCE_PX ||
      avgVX > VELOCITY_THRESHOLD ||
      instVX > VELOCITY_THRESHOLD;

    finishGesture(complete);
  }

  function addMoveEndListeners(isTouch) {
    if (isTouch) {
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd, { passive: false });
      document.addEventListener('touchcancel', onEnd, { passive: false });
    } else {
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onEnd, { passive: true });
      document.addEventListener('pointercancel', onEnd, { passive: true });
    }
  }

  function removeMoveEndListeners() {
    document.removeEventListener('touchmove', onMove, { passive: false });
    document.removeEventListener('touchend', onEnd, { passive: false });
    document.removeEventListener('touchcancel', onEnd, { passive: false });

    document.removeEventListener('pointermove', onMove, { passive: false });
    document.removeEventListener('pointerup', onEnd, { passive: true });
    document.removeEventListener('pointercancel', onEnd, { passive: true });
  }

  // --- Инициализация слушателей старта ---
  if (window.PointerEvent) {
    document.addEventListener('pointerdown', onStart, { passive: true });
  } else {
    // Фолбэк для старых iOS/WebView
    document.addEventListener('touchstart', onStart, { passive: true });
    // На десктопе дадим поддержку мышью (левый клик+перетаскивание от края)
    document.addEventListener('mousedown', function (e) {
      // имитируем pointerdown для мыши
      if (e.button !== 0) return;
      onStart(e);
      if (dragging) {
        const onMouseMove = (ev) => onMove(ev);
        const onMouseUp = (ev) => {
          onEnd(ev);
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      }
    }, { passive: true });
  }

  // Опционально: даём способ вручную выключить (если где-то мешает)
  window.DisableSwipeBack = function () {
    document.removeEventListener('pointerdown', onStart, { passive: true });
    document.removeEventListener('touchstart', onStart, { passive: true });
  };

})();

