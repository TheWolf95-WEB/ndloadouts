document.addEventListener("DOMContentLoaded", () => {
  // ——— Категории настроек
  const BF_SETTINGS_CATEGORIES = [
    { key: 'accessibility', en: 'Accessibility',    ru: 'Основные' },
    { key: 'gameplay',      en: 'Gameplay',         ru: 'Игровой процесс' },
    { key: 'campaign',      en: 'Campaign',         ru: 'Кампания' },
    { key: 'controller',    en: 'Controller',       ru: 'Контроллер' },
    { key: 'mousekeyboard', en: 'Mouse & Keyboard', ru: 'Мышь и клавиатура' },
    { key: 'graphics',      en: 'Graphics',         ru: 'Графика' },
    { key: 'audio',         en: 'Audio',            ru: 'Звук' },
    { key: 'system',        en: 'System',           ru: 'Система' },
  ];

  // ——— Элементы пользовательского экрана
  const scrView = document.getElementById('screen-bf-settings');
  const btnViewBack = document.getElementById('bf-settings-back');
  const btnBurger = document.getElementById('bf-settings-burger');
  const drawer = document.getElementById('bf-settings-drawer');
  const overlay = document.getElementById('bf-settings-overlay');
  const catsNav = document.getElementById('bf-settings-categories');
  const content = document.getElementById('bf-settings-content');
  const currentTitle = document.getElementById('bf-settings-current-title');


  // === Глобальные переменные для оверлея ===
  const subOverlay = document.getElementById('bf-subsettings-overlay');
  const subOverlayTitleEn = document.getElementById('bf-subsettings-title-en');
  const subOverlayTitleRu = document.getElementById('bf-subsettings-title-ru');
  const subOverlayList = document.getElementById('bf-subsettings-list');
  const subOverlayClose = document.getElementById('bf-close-subsettings');

  // === УЛУЧШЕННЫЕ ФУНКЦИИ ОТКРЫТИЯ/ЗАКРЫТИЯ ===
function openSubsettings(title_en, title_ru, subsettings) {
  const overlay = document.getElementById('bf-subsettings-overlay');
  const titleEn = document.getElementById('bf-subsettings-title-en');
  const titleRu = document.getElementById('bf-subsettings-title-ru');
  const list = document.getElementById('bf-subsettings-list');

  titleEn.textContent = title_en || '';
  titleRu.textContent = title_ru || '';
  list.innerHTML = '';

  if (!Array.isArray(subsettings) || !subsettings.length) {
    list.innerHTML = `<p style="opacity:.6;text-align:center;padding:20px;">Нет дополнительных параметров</p>`;
  } else {
    renderSubsettings(subsettings);
  }

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

  // ——— Кнопка открытия из главного экрана
  const btnOpenUser = document.getElementById('bf-settings-btn');

  // ——— Состояние
  let currentCategoryKey = 'accessibility';
  let currentSubSettings = [];

  // ——— API
  async function apiGetSettings(categoryKey = '') {
    const url = categoryKey
      ? `/api/bf/settings?category=${encodeURIComponent(categoryKey)}`
      : '/api/bf/settings';
    const r = await fetch(url);
    if (!r.ok) throw new Error('Failed to load settings');
    return r.json();
  }

  // ——— Утилиты
  function categoryByKey(key) {
    return BF_SETTINGS_CATEGORIES.find(c => c.key === key) || BF_SETTINGS_CATEGORIES[0];
  }

  function openDrawer() {
    drawer.style.left = '0';
    overlay.style.display = 'block';
    drawer.setAttribute('aria-hidden', 'false');
  }

  function closeDrawer() {
    drawer.style.left = '-320px';
    overlay.style.display = 'none';
    drawer.setAttribute('aria-hidden', 'true');
  }

  // ——— Рендер категорий в бургер-меню
  function renderCategoriesNav() {
    catsNav.innerHTML = '';
    BF_SETTINGS_CATEGORIES.forEach(cat => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.style.textAlign = 'left';
      btn.textContent = `${cat.en} — ${cat.ru}`;
      btn.dataset.key = cat.key;
      btn.onclick = () => {
        document.querySelectorAll('#bf-settings-categories button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCategoryKey = cat.key;
        currentTitle.innerHTML = `${cat.en} <span class="cat-ru">${cat.ru}</span>`;
        closeDrawer();
        renderUserSettings();
      };
      catsNav.appendChild(btn);
    });
  }

  // ——— Рендер строки одной настройки
  function renderUserSettingRow(item) {
    const wrap = document.createElement('div');
    wrap.className = 'setting-row';

    const info = document.createElement('div');
    info.className = 'setting-info';
    info.innerHTML = `
      <div class="title-en">${item.title_en || ''}</div>
      <div class="title-ru">${item.title_ru || ''}</div>
    `;

    const control = document.createElement('div');
    control.className = 'setting-control';

    switch (item.type) {
      case 'toggle': {
        const toggle = document.createElement('div');
        toggle.className = 'bf-toggle';
      
        // создаём декоративный тумблер без функционала
        toggle.innerHTML = `
          <div class="bf-toggle-track">
            <div class="bf-toggle-knob"></div>
          </div>
          <div class="bf-toggle-labels">
            <span class="on-label">ON / ВКЛ</span>
            <span class="off-label">OFF / ВЫКЛ</span>
          </div>
        `;
      
        // определяем визуальное состояние
        const isOn = item.default === 'true' || item.default === true;
        if (isOn) toggle.classList.add('on');
        control.appendChild(toggle);
        break;
      }
      case 'slider': {
        const valLabel = document.createElement('span');
        valLabel.textContent = item.default || '0';
        const rng = document.createElement('input');
        rng.type = 'range';
        rng.disabled = true;
        rng.value = item.default || 0;
        control.appendChild(valLabel);
        control.appendChild(rng);
        break;
      }
      case 'number': {
        const num = document.createElement('input');
        num.type = 'number';
        num.disabled = true;
        num.value = item.default ?? '';
        control.appendChild(num);
        break;
      }
      case 'select':
        control.appendChild(createSelectElement(item));
        break;
      case 'color': {
          const colorWrap = document.createElement('div');
          colorWrap.style.display = 'flex';
          colorWrap.style.alignItems = 'center';
          colorWrap.style.gap = '10px';
        
          const colorBox = document.createElement('div');
          colorBox.className = 'color-preview';
          colorBox.style.backgroundColor = item.default || '#000';
          colorBox.title = item.default;
          colorBox.style.width = '28px';
          colorBox.style.height = '28px';
          colorBox.style.borderRadius = '4px';
          colorBox.style.border = '1px solid rgba(255,255,255,0.3)';
        
          const colorLabel = document.createElement('span');
          colorLabel.textContent = item.default?.toUpperCase() || '#000000';
          colorLabel.style.color = '#aaa';
          colorLabel.style.fontSize = '13px';
          colorLabel.style.letterSpacing = '0.5px';
        
          colorWrap.append(colorBox, colorLabel);
          control.append(colorWrap);
          break;
        }
        case 'button': {
          const btn = document.createElement('button');
          btn.className = 'edit-btn';
        
          const title = (item.title_en || '').toLowerCase();
          const isReset = title.includes('reset');
        
          btn.innerHTML = isReset
            ? 'RESET <span class="btn-ru">СБРОСИТЬ</span>'
            : 'EDIT <span class="btn-ru">РЕДАКТ</span>';
        
          if (isReset) {
            btn.disabled = true;
            btn.style.opacity = '0.6';
            btn.style.cursor = 'default';
          } else {
            btn.onclick = () => {
              if (Array.isArray(item.subsettings) && item.subsettings.length) {
                openSubsettings(item.title_en, item.title_ru, item.subsettings);
              } else {
                alert('Вложенных настроек нет');
              }
            };
          }
        
          control.appendChild(btn);
          break;
        }
      default:
        control.textContent = item.default ?? '';
    }

    wrap.appendChild(info);
    wrap.appendChild(control);
    return wrap;
  }

  // ——— Загрузка и вывод настроек
  async function renderUserSettings() {
    content.innerHTML = '<div class="loading-spinner">Загрузка настроек...</div>';

    try {
      const data = await apiGetSettings(currentCategoryKey);
      console.log('📦 Загруженные настройки:', data);
      data.forEach(i => {
        if (i.subsettings) console.log(`🔹 ${i.title_en} — вложений:`, i.subsettings.length);
      });
      content.innerHTML = '';

      if (!data || !data.length) {
        const p = document.createElement('p');
        p.style.opacity = '.7';
        p.textContent = 'Уже ведётся работа над переводом — настройки появятся в ближайшее время.';
        content.appendChild(p);
        return;
      }

      let currentSection = '';

      data.forEach(item => {
        if (item.section && item.section !== currentSection) {
          currentSection = item.section;
          const sec = document.createElement('div');
          sec.className = 'bf-section-title';
          const [en, ru] = item.section.split(" — ");
          sec.innerHTML = `
            <div class="section-header">
              <span class="section-en">${en || ''}</span>
              ${ru ? `<span class="section-ru">— ${ru}</span>` : ''}
            </div>
          `;
          content.appendChild(sec);
        }

        content.appendChild(renderUserSettingRow(item));
      });
    } catch (e) {
      content.innerHTML = '<p style="color:#f55">Ошибка загрузки настроек</p>';
      console.error(e);
    }
  }



  // ——— Навигация
  btnViewBack?.addEventListener('click', () => {
    if (typeof showScreen === 'function') showScreen('screen-battlefield-main');
  });

  btnBurger?.addEventListener('click', openDrawer);
  overlay?.addEventListener('click', closeDrawer);

  document.body.style.overflow = '';
  
  // ——— Открытие экрана "Настройки"
  btnOpenUser?.addEventListener('click', () => {
    renderCategoriesNav();
    const cat = categoryByKey(currentCategoryKey);
    currentTitle.innerHTML = `${cat.en} <span class="cat-ru">${cat.ru}</span>`;
    renderUserSettings();
    if (typeof showScreen === 'function') showScreen('screen-bf-settings');
  });


    // --- Исправляем залипание overlay, чтобы селекты были кликабельны
  const observer = new MutationObserver(() => {
    if (overlay.style.display === 'none') {
      overlay.style.pointerEvents = 'none';
    } else {
      overlay.style.pointerEvents = 'auto';
    }
  });
  observer.observe(overlay, { attributes: true, attributeFilter: ['style'] });


// === Рендер списка вложенных настроек ===
// === УЛУЧШЕННЫЙ РЕНДЕР ПОДНАСТРОЕК ===
function renderSubsettings(subsettings) {
  const list = document.getElementById('bf-subsettings-list');
  list.innerHTML = '';

  const items = Array.isArray(subsettings) ? subsettings : [];
  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div style="font-size: 48px; margin-bottom: 16px;">🔧</div>
        <div style="font-size: 16px; margin-bottom: 8px;">Нет доступных параметров</div>
        <div style="font-size: 14px; opacity: 0.7;">Дополнительные параметры отсутствуют</div>
      </div>
    `;
    return;
  }

  let currentSection = null;

  items.forEach((item, index) => {

    // === Рендер заголовков секций (как на главном) ===
    if (item.section && item.section !== currentSection) {
      currentSection = item.section;
      const sec = document.createElement('div');
      sec.className = 'bf-section-title';

      // поддержка формата "EN — RU" если мы потом добавим перевод
      const parts = String(item.section).split(" — ");
      const en = parts[0] || "";
      const ru = parts[1] || "";

      sec.innerHTML = `
        <div class="section-header">
          <span class="section-en">${en}</span>
          ${ru ? `<span class="section-ru">— ${ru}</span>` : ''}
        </div>
      `;
      list.appendChild(sec);
    }

    // === ВАЖНО: внутри subsettings не должно быть кнопок ===
    if (item.type === "button") return;

    // === Обычные строки настроек ===
    const row = createSubsettingRow(item, index);
    list.appendChild(row);
  });
}


// СОЗДАНИЕ ОДНОЙ СТРОКИ НАСТРОЙКИ
function createSubsettingRow(item, index) {
  if (!item || typeof item !== 'object') {
    return createErrorRow(item, new Error('Invalid data'));
  }
  
  const wrap = document.createElement('div');
  wrap.className = 'setting-row';
  wrap.setAttribute('data-setting-type', item.type || 'unknown');
  
  // Добавляем анимацию появления
  wrap.style.opacity = '0';
  wrap.style.transform = 'translateY(20px)';
  
  // Информационная часть
  const info = document.createElement('div');
  info.className = 'setting-info';
  info.innerHTML = `
    <div class="title-en">${escapeHtml(item.title_en || 'Setting')}</div>
    <div class="title-ru">${escapeHtml(item.title_ru || '')}</div>
  `;
  
  // Контролы
  const control = document.createElement('div');
  control.className = 'setting-control';
  
  renderControlBasedOnType(control, item);
  
  wrap.appendChild(info);
  wrap.appendChild(control);
  
  // Анимация появления
  setTimeout(() => {
    wrap.style.transition = 'all 0.4s ease';
    wrap.style.opacity = '1';
    wrap.style.transform = 'translateY(0)';
  }, index * 80);
  
  return wrap;
}

// РЕНДЕР КОНТРОЛОВ ПО ТИПУ
function renderControlBasedOnType(container, item) {
  const type = item.type || 'text';
  const value = item.default || '';
  
  switch (type) {
    case 'toggle':
      renderToggleControl(container, value);
      break;
    case 'select':
      container.appendChild(createSelectElement(item));
      break;
    case 'color':
      renderColorControl(container, value);
      break;
    case 'slider':
      renderSliderControl(container, value);
      break;
    case 'number':
      renderNumberControl(container, value);
      break;
    case 'bind': {
      const span = document.createElement('span');
      span.textContent = item.default || 'Назначить';
      span.style.opacity = '0.8';
      container.appendChild(span);
      break;
    }
    case 'button':
      // кнопок внутри subsettings нет
      break;
    default:
      renderTextControl(container, value);
  }
}



function renderSliderControl(container, value) {
  const wrap = document.createElement('div');
  wrap.className = 'slider-control';

  const valLabel = document.createElement('span');
  valLabel.textContent = value || '0';
  valLabel.style.fontSize = '13px';
  valLabel.style.color = '#a8b5c2';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.disabled = true;
  slider.value = value || 0;
  slider.style.width = '100%';

  wrap.appendChild(valLabel);
  wrap.appendChild(slider);
  container.appendChild(wrap);
}


function createSelectElement(item) {
  const selectWrap = document.createElement('div');
  selectWrap.className = 'bf-select-wrap';

  const sel = document.createElement('select');
  sel.className = 'bf-select';

  const translationMap = {
    "Tiny": "Крошечный", "Small": "Маленький", "Medium": "Средний", "Normal": "Обычный",
    "Large": "Большой", "Huge": "Огромный", "Default": "По умолчанию", "Custom": "Пользовательский", "Auto": "Авто",
    "High Contrast": "Высокий контраст", "Low Contrast": "Низкий контраст",
    "Off": "Выкл", "On": "Вкл", "Enabled": "Включено", "Disabled": "Выключено",
    "Hold": "Удерживать", "Toggle": "Переключать", "Press": "Нажатие", "Double Tap": "Двойное нажатие",
    "Click": "Клик", "Release": "Отпустить", "Voice Chat": "Голосовой чат",
    "Push to Talk": "Нажать для разговора", "Always On": "Всегда включено", "Mute": "Без звука", "Unmute": "Со звуком",
    "Headphones": "Наушники", "Speakers": "Колонки", "Ultra": "Ультра", "High": "Высокий",
    "Medium": "Средний", "Low": "Низкий", "Very Low": "Очень низкий", "Fullscreen": "Полноэкранный режим",
    "Borderless": "Без рамки", "Windowed": "Оконный", "Instant": "Мгновенно", "Partial": "Частично",
    "All": "Все", "Squad": "Отряд", "Team": "Команда", "Solo": "Один",
    "Prioritize Interact": "Приоритет: взаимодействие", "Prioritize Reload": "Приоритет: перезарядка",
    "Stand": "Стоять", "Crouch": "Присесть", "Prone": "Лечь", "Sprint": "Бег",
    "Aim": "Прицеливание", "Fire": "Стрельба", "Mouse": "Мышь", "Keyboard": "Клавиатура",
    "Controller": "Геймпад", "Sensitivity": "Чувствительность", "Invert Y-Axis": "Инвертировать ось Y",
    "Horizontal": "Горизонтально", "Vertical": "Вертикально", "Reset": "Сбросить", "Apply": "Применить",
    "Save": "Сохранить", "Back": "Назад", "Yes": "Да", "No": "Нет"
  };

  let currentRu = '';

  (item.options || []).forEach(opt => {
    const o = document.createElement('option');
    o.textContent = opt; // ❗ только английский
    if (opt === item.default) {
      o.selected = true;
      currentRu = translationMap[opt] || opt;
    }
    sel.appendChild(o);
  });

  // если default не найден в options — всё равно показать перевод
  if (!currentRu && item.default)
    currentRu = translationMap[item.default] || item.default;

  const ruBelow = document.createElement('div');
  // если ничего не выбрано — показать первый элемент как дефолт
  if (!currentRu && item.options?.length) {
    const first = item.options[0];
    currentRu = translationMap[first] || first;
  }

  ruBelow.className = 'bf-select-ru';
  ruBelow.textContent = currentRu || '';
  ruBelow.style.fontSize = '12px';
  ruBelow.style.opacity = '0.75';
  ruBelow.style.marginTop = '4px';

  sel.addEventListener('change', () => {
    const selected = sel.value;
    ruBelow.textContent = translationMap[selected] || selected;
  });

  selectWrap.append(sel, ruBelow);
  return selectWrap;
}

  

// КОНКРЕТНЫЕ РЕНДЕРЫ КОНТРОЛОВ
function renderToggleControl(container, value) {
  const isOn = value === 'true' || value === true;
  const toggle = document.createElement('div');
  toggle.className = `bf-toggle ${isOn ? 'on' : ''}`;
  toggle.innerHTML = `
    <div class="bf-toggle-track">
      <div class="bf-toggle-knob"></div>
    </div>
    <div class="bf-toggle-labels">
      <span class="on-label">ON</span>
      <span class="off-label">OFF</span>
    </div>
  `;
  container.appendChild(toggle);
}


function renderColorControl(container, value) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '12px';
  
  const colorBox = document.createElement('div');
  colorBox.className = 'color-preview';
  colorBox.style.backgroundColor = value || '#000000';
  
  const colorLabel = document.createElement('span');
  colorLabel.textContent = (value || '#000000').toUpperCase();
  colorLabel.style.color = '#a8b5c2';
  colorLabel.style.fontSize = '13px';
  colorLabel.style.fontFamily = 'monospace';
  
  wrap.appendChild(colorBox);
  wrap.appendChild(colorLabel);
  container.appendChild(wrap);
}

// Вспомогательные функции
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function createErrorRow(item, error) {
  const wrap = document.createElement('div');
  wrap.className = 'setting-row error';
  wrap.innerHTML = `
    <div class="setting-info">
      <div class="title-en">Error Loading Setting</div>
      <div class="title-ru">Ошибка загрузки: ${escapeHtml(error?.message || 'Unknown error')}</div>
    </div>
    <div class="setting-control">
      <span style="color: #ff6b6b;">⚠️</span>
    </div>
  `;
  return wrap;
}


// 🩵 Сброс скролла — чтобы при открытии начинало сверху
requestAnimationFrame(() => {
  const list = document.getElementById('bf-subsettings-list');
  list.scrollTop = 0;
});  

document.getElementById('bf-close-subsettings').addEventListener('click', () => {
  document.getElementById('bf-subsettings-overlay').classList.remove('active');
  document.body.style.overflow = '';
});

  
});
