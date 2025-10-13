/* ==========================================================
   smooth-swipe-back.js — Ultra Smooth Swipe Back
   Telegram WebApp: iOS / Android / Desktop WebView

   🎯 Улучшения:
     • Супер-плавная анимация с физикой
     • Улучшенный параллакс и резинка
     • Автоматическое определение направления
     • Оптимизированная производительность
     • Лучшая обработка жестов
   ========================================================== */
(function () {
  'use strict';

  // 🔧 Настройки анимации
  const CONFIG = {
    EDGE_START_PX: 40,
    EDGE_HIT_WIDTH: 32,
    COMPLETE_DISTANCE_PX: 110,
    VELOCITY_THRESHOLD: 0.45,
    ACTIVATE_MOVE_THRESHOLD: 8,
    BASE_ANIM_MS: 480,
    MAX_OVERSHOOT: 25,
    PARALLAX_SHIFT: -24,
    PARALLAX_SCALE: 0.985
  };

  // 🎨 Кривые Безье для анимаций
  const EASING = {
    SWIPE: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    RETURN: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    BOUNCE: 'cubic-bezier(0.18, 1.25, 0.6, 1)'
  };

  // 🔮 Состояние жеста
  let state = {
    isDragging: false,
    isDecided: false,
    isHorizontal: false,
    isFinished: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    startTime: 0,
    velocity: 0,
    inputType: null
  };

  // 🎭 DOM элементы
  let elements = {
    activeScreen: null,
    previousScreen: null,
    scrim: null,
    edgeArea: null,
    arrow: null,
    rafId: 0
  };

  // 🏠 Константы экранов
  const SCREENS = {
    HOME: 'screen-home',
    BATTLEFIELD_ROOT: 'screen-battlefield-main',
    WARZONE_ROOT: 'screen-warzone-main'
  };

  // 🔍 Вспомогательные функции
  const utils = {
    isBattlefieldScreen(id) {
      const screenId = String(id || '');
      return screenId === SCREENS.BATTLEFIELD_ROOT || screenId.startsWith('screen-bf');
    },

    isWarzoneScreen(id) {
      const screenId = String(id || '');
      return screenId !== SCREENS.HOME && !this.isBattlefieldScreen(screenId);
    },

    getActiveScreen() {
      let screen = document.querySelector('.screen.active');
      if (!screen) {
        const screens = Array.from(document.querySelectorAll('.screen'));
        screen = screens.find(s => s.style.display !== 'none') || null;
        if (screen && !screen.classList.contains('active')) {
          screen.classList.add('active');
        }
      }
      return screen;
    },

    getHistory() {
      // Пытаемся получить историю из разных источников
      const sources = [
        () => window.screenHistory,
        () => window.warScreenHistory,
        () => {
          try { /* eslint-disable no-undef */ return screenHistory; /* eslint-enable */ } catch { return null; }
        }
      ];

      for (const source of sources) {
        const history = source();
        if (Array.isArray(history) && history.length > 0) {
          return history;
        }
      }
      return [];
    },

    getPreviousScreenId(currentId) {
      if (currentId === SCREENS.HOME) return null;
      
      const history = this.getHistory();
      const currentIndex = history.indexOf(currentId);
      
      if (currentIndex > 0) {
        return history[currentIndex - 1];
      }
      
      // Для корневых экранов возвращаем на домашний
      if (currentId === SCREENS.BATTLEFIELD_ROOT || currentId === SCREENS.WARZONE_ROOT) {
        return SCREENS.HOME;
      }
      
      return SCREENS.HOME;
    },

    canGoBack() {
      const activeScreen = this.getActiveScreen();
      if (!activeScreen || activeScreen.id === SCREENS.HOME) return false;
      
      const previousId = this.getPreviousScreenId(activeScreen.id);
      return Boolean(previousId);
    },

    triggerHaptic() {
      // Виброотклик для мобильных устройств
      if (typeof Telegram !== 'undefined' && Telegram.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.impactOccurred('light');
      } else if (navigator.vibrate) {
        navigator.vibrate(10);
      }
    }
  };

  // 🎨 Создание визуальных элементов
  const uiManager = {
    createScrim() {
      if (elements.scrim) return elements.scrim;
      
      elements.scrim = document.createElement('div');
      elements.scrim.className = 'swipe-back-scrim';
      Object.assign(elements.scrim.style, {
        position: 'fixed',
        inset: '0',
        pointerEvents: 'none',
        background: 'linear-gradient(90deg, rgba(0,0,0,0.18) 0%, transparent 60%)',
        opacity: '0',
        transition: 'opacity 0.2s ease',
        zIndex: '2147483646'
      });
      
      document.body.appendChild(elements.scrim);
      return elements.scrim;
    },

    createArrow() {
      if (elements.arrow) return elements.arrow;
      
      elements.arrow = document.createElement('div');
      elements.arrow.innerHTML = '‹';
      elements.arrow.className = 'swipe-back-arrow';
      Object.assign(elements.arrow.style, {
        position: 'fixed',
        left: '12px',
        top: '50%',
        transform: 'translateY(-50%) scale(0)',
        fontSize: '20px',
        width: '28px',
        height: '28px',
        color: 'rgba(255,255,255,0.9)',
        textAlign: 'center',
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.3)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: '0',
        transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
        zIndex: '2147483647',
        pointerEvents: 'none'
      });
      
      document.body.appendChild(elements.arrow);
      return elements.arrow;
    },

    createEdgeArea() {
      if (elements.edgeArea) return elements.edgeArea;
      
      elements.edgeArea = document.createElement('div');
      elements.edgeArea.className = 'swipe-back-edge-area';
      Object.assign(elements.edgeArea.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: CONFIG.EDGE_HIT_WIDTH + 'px',
        height: '100vh',
        zIndex: '2147483645',
        background: 'transparent',
        pointerEvents: 'none'
      });
      
      this.attachEdgeListeners(elements.edgeArea);
      document.body.appendChild(elements.edgeArea);
      return elements.edgeArea;
    },

    attachEdgeListeners(element) {
      const options = { capture: true, passive: true };
      element.addEventListener('touchstart', this.handleEdgeStart.bind(this), options);
      element.addEventListener('pointerdown', this.handleEdgeStart.bind(this), options);
      element.addEventListener('mousedown', this.handleEdgeStart.bind(this), options);
    },

    handleEdgeStart(event) {
      if (utils.canGoBack()) {
        this.onGestureStart(event, true);
      }
    },

    updateEdgeArea() {
      if (!elements.edgeArea) return;
      elements.edgeArea.style.pointerEvents = utils.canGoBack() ? 'auto' : 'none';
    },

    preparePreviousScreen(screenId) {
      elements.previousScreen = document.getElementById(screenId);
      if (!elements.previousScreen) return;

      // Сохраняем оригинальные стили
      elements.previousScreen._originalStyles = {
        display: elements.previousScreen.style.display,
        position: elements.previousScreen.style.position,
        zIndex: elements.previousScreen.style.zIndex,
        transform: elements.previousScreen.style.transform,
        opacity: elements.previousScreen.style.opacity,
        pointerEvents: elements.previousScreen.style.pointerEvents
      };

      // Настраиваем для параллакса
      Object.assign(elements.previousScreen.style, {
        display: 'block',
        position: 'fixed',
        inset: '0',
        zIndex: '2147483643',
        transform: `translate3d(${CONFIG.PARALLAX_SHIFT}px, 0, 0) scale(${CONFIG.PARALLAX_SCALE})`,
        opacity: '0.85',
        pointerEvents: 'none',
        willChange: 'transform, opacity'
      });
    },

    updateParallax(distance) {
      if (!elements.previousScreen) return;
      
      const progress = Math.min(1, distance / 160);
      const shift = CONFIG.PARALLAX_SHIFT + progress * -CONFIG.PARALLAX_SHIFT;
      const scale = CONFIG.PARALLAX_SCALE + progress * (1 - CONFIG.PARALLAX_SCALE);
      const opacity = 0.85 + progress * 0.15;
      
      elements.previousScreen.style.transform = 
        `translate3d(${shift}px, 0, 0) scale(${scale})`;
      elements.previousScreen.style.opacity = opacity.toString();
    },

    restorePreviousScreen() {
      if (!elements.previousScreen) return;
      
      const original = elements.previousScreen._originalStyles;
      if (original) {
        Object.assign(elements.previousScreen.style, original);
        delete elements.previousScreen._originalStyles;
      }
      
      elements.previousScreen = null;
    },

    updateUI(distance) {
      if (!elements.activeScreen) return;
      
      if (elements.rafId) {
        cancelAnimationFrame(elements.rafId);
      }
      
      elements.rafId = requestAnimationFrame(() => {
        // Плавное движение с резинкой
        let visualDistance = distance;
        if (distance > 100) {
          visualDistance = 100 + (distance - 100) * 0.4;
        }
        
        // Основной экран
        elements.activeScreen.style.transform = `translate3d(${visualDistance}px, 0, 0)`;
        elements.activeScreen.style.boxShadow = '-4px 0 20px rgba(0,0,0,0.15)';
        
        // Скрим
        if (elements.scrim) {
          const scrimOpacity = Math.min(distance / 120, 0.7);
          elements.scrim.style.opacity = scrimOpacity.toString();
        }
        
        // Стрелка
        if (elements.arrow) {
          const arrowProgress = Math.min(distance / 80, 1);
          elements.arrow.style.opacity = Math.min(arrowProgress * 1.2, 1).toString();
          elements.arrow.style.transform = `translateY(-50%) scale(${0.7 + arrowProgress * 0.3})`;
        }
        
        // Параллакс
        this.updateParallax(distance);
      });
    },

    cleanup() {
      if (elements.activeScreen) {
        elements.activeScreen.style.transition = '';
        elements.activeScreen.style.transform = '';
        elements.activeScreen.style.boxShadow = '';
        elements.activeScreen.style.willChange = '';
        elements.activeScreen.style.zIndex = '';
      }
      
      if (elements.scrim) elements.scrim.style.opacity = '0';
      if (elements.arrow) {
        elements.arrow.style.opacity = '0';
        elements.arrow.style.transform = 'translateY(-50%) scale(0)';
      }
    }
  };

  // ✋ Обработчики жестов
  const gestureManager = {
    onGestureStart(event, isFromEdge = false) {
      if (state.isDragging) return;
      
      const clientX = this.getClientX(event);
      const clientY = this.getClientY(event);
      
      if (!isFromEdge && clientX > CONFIG.EDGE_START_PX) return;
      if (this.shouldIgnoreGesture(event)) return;
      
      elements.activeScreen = utils.getActiveScreen();
      if (!elements.activeScreen || elements.activeScreen.id === SCREENS.HOME) return;
      
      const previousId = utils.getPreviousScreenId(elements.activeScreen.id);
      if (!previousId) return;
      
      // Инициализация состояния
      this.initializeState(event, clientX, clientY);
      
      // Подготовка UI
      uiManager.createScrim();
      uiManager.createArrow();
      uiManager.preparePreviousScreen(previousId);
      
      // Настройка активного экрана
      this.setupActiveScreen();
      
      // Прикрепление обработчиков движения
      this.attachMoveListeners();
    },

    getClientX(event) {
      if (event.touches?.[0]) return event.touches[0].clientX;
      return event.clientX;
    },

    getClientY(event) {
      if (event.touches?.[0]) return event.touches[0].clientY;
      return event.clientY;
    },

    shouldIgnoreGesture(event) {
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      const ignoreTags = ['input', 'textarea', 'select', 'button', 'a'];
      
      if (ignoreTags.includes(tagName)) return true;
      if (target?.isContentEditable) return true;
      if (target?.closest('button, a, [role="button"]')) return true;
      
      return false;
    },

    initializeState(event, clientX, clientY) {
      const now = event.timeStamp || Date.now();
      
      state = {
        isDragging: true,
        isDecided: false,
        isHorizontal: false,
        isFinished: false,
        startX: clientX,
        startY: clientY,
        lastX: clientX,
        lastY: clientY,
        lastTime: now,
        startTime: now,
        velocity: 0,
        inputType: event.pointerType || event.type.includes('touch') ? 'touch' : 'mouse'
      };
    },

    setupActiveScreen() {
      Object.assign(elements.activeScreen.style, {
        willChange: 'transform',
        transition: 'none',
        touchAction: 'pan-y',
        zIndex: '2147483644'
      });
    },

    attachMoveListeners() {
      const passiveOptions = { capture: true, passive: false };
      const nonPassiveOptions = { capture: true, passive: true };
      
      if (state.inputType === 'touch') {
        document.addEventListener('touchmove', this.onGestureMove.bind(this), passiveOptions);
        document.addEventListener('touchend', this.onGestureEnd.bind(this), nonPassiveOptions);
        document.addEventListener('touchcancel', this.onGestureEnd.bind(this), nonPassiveOptions);
      } else {
        document.addEventListener('pointermove', this.onGestureMove.bind(this), passiveOptions);
        document.addEventListener('pointerup', this.onGestureEnd.bind(this), nonPassiveOptions);
        document.addEventListener('pointercancel', this.onGestureEnd.bind(this), nonPassiveOptions);
        document.addEventListener('mousemove', this.onGestureMove.bind(this), passiveOptions);
        document.addEventListener('mouseup', this.onGestureEnd.bind(this), nonPassiveOptions);
      }
    },

    removeMoveListeners() {
      const options = { capture: true };
      
      document.removeEventListener('touchmove', this.onGestureMove, options);
      document.removeEventListener('touchend', this.onGestureEnd, options);
      document.removeEventListener('touchcancel', this.onGestureEnd, options);
      
      document.removeEventListener('pointermove', this.onGestureMove, options);
      document.removeEventListener('pointerup', this.onGestureEnd, options);
      document.removeEventListener('pointercancel', this.onGestureEnd, options);
      
      document.removeEventListener('mousemove', this.onGestureMove, options);
      document.removeEventListener('mouseup', this.onGestureEnd, options);
    },

    onGestureMove(event) {
      if (!state.isDragging) return;
      
      event.preventDefault();
      
      const clientX = this.getClientX(event);
      const clientY = this.getClientY(event);
      const now = event.timeStamp || Date.now();
      
      this.processMovement(clientX, clientY, now);
    },

    processMovement(clientX, clientY, timestamp) {
      const deltaX = clientX - state.startX;
      const deltaY = clientY - state.startY;
      
      // Определение направления жеста
      if (!state.isDecided) {
        if (Math.abs(deltaX) + Math.abs(deltaY) < CONFIG.ACTIVATE_MOVE_THRESHOLD) return;
        if (Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
          this.cancelGesture();
          return;
        }
        if (deltaX <= 0) {
          this.cancelGesture();
          return;
        }
        
        state.isDecided = true;
        state.isHorizontal = true;
        
        // Показываем UI элементы
        if (elements.scrim) elements.scrim.style.opacity = '1';
        if (elements.arrow) elements.arrow.style.opacity = '0.8';
      }
      
      if (!state.isHorizontal) return;
      
      // Расчет скорости
      const deltaTime = Math.max(1, timestamp - state.lastTime);
      const instantVelocity = (clientX - state.lastX) / deltaTime;
      
      state.velocity = instantVelocity;
      state.lastX = clientX;
      state.lastY = clientY;
      state.lastTime = timestamp;
      
      // Обновление UI
      uiManager.updateUI(deltaX);
    },

    onGestureEnd(event) {
      if (!state.isDragging) return;
      
      const now = event.timeStamp || Date.now();
      this.finalizeGesture(now);
    },

    finalizeGesture(timestamp) {
      const totalDistance = Math.max(0, state.lastX - state.startX);
      const totalTime = Math.max(1, timestamp - state.startTime);
      const averageVelocity = totalDistance / totalTime;
      
      const shouldComplete = this.shouldCompleteGesture(totalDistance, averageVelocity);
      
      if (shouldComplete) {
        this.completeGesture(totalDistance, Math.max(state.velocity, averageVelocity));
      } else {
        this.cancelGesture(totalDistance, Math.max(state.velocity, averageVelocity));
      }
    },

    shouldCompleteGesture(distance, velocity) {
      return (
        distance >= CONFIG.COMPLETE_DISTANCE_PX ||
        velocity > CONFIG.VELOCITY_THRESHOLD ||
        (distance + velocity * 200) >= Math.min(window.innerWidth * 0.4, 180)
      );
    },

    calculateDuration(distance, velocity, isComplete) {
      const baseDuration = isComplete ? CONFIG.BASE_ANIM_MS : CONFIG.BASE_ANIM_MS * 0.8;
      const velocityFactor = Math.min(80, Math.max(0, velocity * 100));
      return Math.max(300, Math.min(600, baseDuration - velocityFactor));
    },

    completeGesture(distance, velocity) {
      state.isFinished = true;
      
      const screenWidth = window.innerWidth;
      const remainingDistance = screenWidth - distance;
      const duration = this.calculateDuration(remainingDistance, velocity, true);
      
      this.animateSwipeCompletion(duration, screenWidth);
      this.executeNavigation();
    },

    animateSwipeCompletion(duration, targetX) {
      // Анимация завершения свайпа
      elements.activeScreen.style.transition = `transform ${duration}ms ${EASING.SWIPE}`;
      
      if (elements.previousScreen) {
        elements.previousScreen.style.transition = 
          `transform ${duration}ms ${EASING.SWIPE}, opacity ${duration}ms ${EASING.SWIPE}`;
        uiManager.updateParallax(999);
      }
      
      if (elements.scrim) elements.scrim.style.transition = `opacity ${duration}ms ${EASING.SWIPE}`;
      if (elements.arrow) elements.arrow.style.transition = `all ${duration}ms ${EASING.SWIPE}`;
      
      requestAnimationFrame(() => {
        elements.activeScreen.style.transform = `translate3d(${targetX}px, 0, 0)`;
        if (elements.scrim) elements.scrim.style.opacity = '0';
        if (elements.arrow) {
          elements.arrow.style.opacity = '0';
          elements.arrow.style.transform = 'translateY(-50%) scale(0)';
        }
      });
      
      setTimeout(() => {
        this.resetGesture();
        uiManager.updateEdgeArea();
      }, duration + 50);
    },

    cancelGesture(distance = 0, velocity = 0) {
      const duration = this.calculateDuration(distance, velocity, false);
      
      elements.activeScreen.style.transition = `transform ${duration}ms ${EASING.RETURN}`;
      
      if (elements.previousScreen) {
        elements.previousScreen.style.transition = 
          `transform ${duration}ms ${EASING.RETURN}, opacity ${duration}ms ${EASING.RETURN}`;
      }
      
      requestAnimationFrame(() => {
        elements.activeScreen.style.transform = 'translate3d(0, 0, 0)';
        if (elements.scrim) elements.scrim.style.opacity = '0';
        if (elements.arrow) elements.arrow.style.opacity = '0';
      });
      
      // Легкий bounce-эффект
      setTimeout(() => {
        elements.activeScreen.style.transition = `transform 180ms ${EASING.BOUNCE}`;
        elements.activeScreen.style.transform = 'translate3d(-8px, 0, 0)';
        
        setTimeout(() => {
          elements.activeScreen.style.transform = 'translate3d(0, 0, 0)';
          setTimeout(() => this.resetGesture(), 180);
        }, 0);
      }, duration);
    },

    executeNavigation() {
      const previousId = utils.getPreviousScreenId(elements.activeScreen.id);
      if (!previousId) return;
      
      utils.triggerHaptic();
      
      // Используем нативную навигацию приложения
      setTimeout(() => {
        if (typeof window.showScreen === 'function') {
          window.isGoingBack = true;
          window.showScreen(previousId);
        }
      }, 50);
    },

    resetGesture() {
      uiManager.cleanup();
      uiManager.restorePreviousScreen();
      this.removeMoveListeners();
      
      state = {
        isDragging: false,
        isDecided: false,
        isHorizontal: false,
        isFinished: false,
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        lastTime: 0,
        startTime: 0,
        velocity: 0,
        inputType: null
      };
      
      elements.activeScreen = null;
      elements.rafId = 0;
    }
  };

  // 🚀 Инициализация
  function initialize() {
    // Создаем UI элементы
    uiManager.createEdgeArea();
    uiManager.createScrim();
    uiManager.createArrow();
    uiManager.updateEdgeArea();
    
    // Глобальные обработчики для жестов не из edge-зоны
    const globalOptions = { capture: true, passive: true };
    document.addEventListener('touchstart', (e) => gestureManager.onGestureStart(e, false), globalOptions);
    document.addEventListener('pointerdown', (e) => gestureManager.onGestureStart(e, false), globalOptions);
    document.addEventListener('mousedown', (e) => gestureManager.onGestureStart(e, false), globalOptions);
    
    // Патчим навигационные функции для обновления edge-зоны
    patchNavigationFunctions();
  }
  
  function patchNavigationFunctions() {
    const functionsToPatch = ['showScreen', 'bfShowScreen', 'warShowScreen'];
    
    functionsToPatch.forEach(funcName => {
      if (typeof window[funcName] === 'function' && !window[funcName].__swipePatched) {
        const original = window[funcName];
        window[funcName] = function(...args) {
          const result = original.apply(this, args);
          setTimeout(uiManager.updateEdgeArea, 0);
          return result;
        };
        window[funcName].__swipePatched = true;
      }
    });
    
    // Патчим историю
    const history = utils.getHistory();
    if (history && !history.__swipePatched) {
      const originalPush = history.push;
      history.push = function(...args) {
        const result = originalPush.apply(this, args);
        uiManager.updateEdgeArea();
        return result;
      };
      history.__swipePatched = true;
    }
  }

  // 📱 Публичный API
  window.SwipeBack = {
    enable() {
      uiManager.updateEdgeArea();
    },
    
    disable() {
      if (elements.edgeArea) {
        elements.edgeArea.style.pointerEvents = 'none';
      }
      gestureManager.removeMoveListeners();
      gestureManager.cancelGesture();
    },
    
    update() {
      uiManager.updateEdgeArea();
    },
    
    isEnabled() {
      return elements.edgeArea?.style.pointerEvents !== 'none';
    }
  };

  // 🎬 Запуск
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
