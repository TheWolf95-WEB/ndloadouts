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
      case 'select': {
        const selectWrap = document.createElement('div');
        selectWrap.className = 'bf-select-wrap';
      
        const sel = document.createElement('select');
        sel.className = 'bf-select';
      
        // 🗣️ Словарь переводов для Battlefield Settings (EN → RU)
        const translationMap = {
          // Размеры и масштабы
          "Tiny": "Крошечный",
          "Small": "Маленький",
          "Medium": "Средний",
          "Normal": "Обычный",
          "Large": "Большой",
          "Huge": "Огромный",
          "Default": "По умолчанию",
          "Custom": "Пользовательский",
          "Auto": "Авто",
        
          // Контраст, яркость, визуальные режимы
          "High Contrast": "Высокий контраст",
          "Low Contrast": "Низкий контраст",
          "Brightness": "Яркость",
          "Contrast": "Контраст",
          "Colorblind Mode": "Режим дальтоника",
          "Tritanopia": "Тританопия",
          "Deuteranopia": "Дейтеранопия",
          "Protanopia": "Протанопия",
          "Off": "Выкл",
          "On": "Вкл",
          "Enabled": "Включено",
          "Disabled": "Выключено",
        
          // Режимы управления
          "Hold": "Удерживать",
          "Toggle": "Переключать",
          "Press": "Нажатие",
          "Double Tap": "Двойное нажатие",
          "Click": "Клик",
          "Release": "Отпустить",
        
          // Звук и голос
          "Voice Chat": "Голосовой чат",
          "Push to Talk": "Нажать для разговора",
          "Always On": "Всегда включено",
          "Mute": "Без звука",
          "Unmute": "Со звуком",
          "Headphones": "Наушники",
          "Speakers": "Колонки",
        
          // Графика
          "Ultra": "Ультра",
          "High": "Высокий",
          "Medium": "Средний",
          "Low": "Низкий",
          "Very Low": "Очень низкий",
          "Resolution": "Разрешение",
          "Fullscreen": "Полноэкранный режим",
          "Borderless": "Без рамки",
          "Windowed": "Оконный",
        
          // Геймплей
          "Instant": "Мгновенно",
          "Partial": "Частично",
          "All": "Все",
          "Squad": "Отряд",
          "Team": "Команда",
          "Solo": "Один",
          "Prioritize Interact": "Приоритет: взаимодействие",
          "Prioritize Reload": "Приоритет: перезарядка",
          "Stand": "Стоять",
          "Crouch": "Присесть",
          "Prone": "Лечь",
          "Sprint": "Бег",
          "Aim": "Прицеливание",
          "Fire": "Стрельба",
        
          // Камера и ввод
          "Mouse": "Мышь",
          "Keyboard": "Клавиатура",
          "Controller": "Геймпад",
          "Sensitivity": "Чувствительность",
          "Invert Y-Axis": "Инвертировать ось Y",
          "Horizontal": "Горизонтально",
          "Vertical": "Вертикально",
        
          // Прочее
          "Reset": "Сбросить",
          "Apply": "Применить",
          "Save": "Сохранить",
          "Back": "Назад",
          "Yes": "Да",
          "No": "Нет"
        };

      

          (item.options || []).forEach(opt => {
            const o = document.createElement('option');
            const ru = translationMap[opt] || opt;
            o.textContent = `${opt} / ${ru}`;
            if (opt === item.default) o.selected = true;
            sel.appendChild(o);
          });
        
          sel.addEventListener('change', () => {
            console.log(`Selected option for ${item.title_en}:`, sel.value);
          });
        
          const ruLabel = document.createElement('span');
          ruLabel.className = 'bf-select-ru';
          ruLabel.textContent = item.title_ru || '';
        
          selectWrap.append(sel, ruLabel);
          control.appendChild(selectWrap);
          break;
        }
        



        // 🟦 вот сюда вставляется новый case
        case 'button': {
          const btn = document.createElement('button');
          btn.className = 'edit-btn';
        
          const title = (item.title_en || '').toLowerCase();
          const isReset = title.includes('reset');
        
            // двуязычный текст кнопки
            btn.innerHTML = isReset
              ? 'RESET <span class="btn-ru">СБРОСИТЬ</span>'
              : 'EDIT <span class="btn-ru">РЕДАКТ</span>';
        
          // если это reset — делаем кнопку неактивной
          if (isReset) {
            btn.disabled = true;
            btn.style.opacity = '0.6';
            btn.style.cursor = 'default';
          } else {
            // иначе оставляем кликабельной
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


  // === Функция рендера одной вложенной настройки ===
    function renderSubSetting(item) {
      const wrap = document.createElement('div');
      wrap.className = 'setting-row';
    
      const info = document.createElement('div');
      info.className = 'setting-info';
      info.innerHTML = `
        <div class="title-en">${item.title_en}</div>
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
          const val = document.createElement('span');
          val.textContent = item.default || '0';
          const rng = document.createElement('input');
          rng.type = 'range';
          rng.disabled = true;
          rng.value = item.default || 0;
          control.appendChild(val);
          control.appendChild(rng);
          break;
        }
          case 'select': {
            const selectWrap = document.createElement('div');
            selectWrap.className = 'bf-select-wrap';
          
            const sel = document.createElement('select');
            sel.className = 'bf-select';
          
            // 🔠 Используем тот же словарь переводов
            const translationMap = {
              "Tiny": "Крошечный", "Small": "Маленький", "Medium": "Средний", "Normal": "Обычный",
              "Large": "Большой", "Huge": "Огромный", "Default": "По умолчанию", "Custom": "Пользовательский",
              "Auto": "Авто", "High Contrast": "Высокий контраст", "Low Contrast": "Низкий контраст",
              "Off": "Выкл", "On": "Вкл", "Hold": "Удерживать", "Toggle": "Переключать",
              "Instant": "Мгновенно", "Partial": "Частично", "All": "Все",
              "Low": "Низкий", "Medium": "Средний", "High": "Высокий", "Ultra": "Ультра"
            };
          
            (item.options || []).forEach(opt => {
              const o = document.createElement('option');
              const ru = translationMap[opt] || opt;
              o.textContent = `${opt} / ${ru}`;
              if (opt === item.default) o.selected = true;
              sel.appendChild(o);
            });
          
            const ruLabel = document.createElement('span');
            ruLabel.className = 'bf-select-ru';
            ruLabel.textContent = item.title_ru || '';
          
            selectWrap.append(sel, ruLabel);
            control.appendChild(selectWrap);
            break;
          }


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



          
        default:
          control.textContent = item.default ?? '';
      }
    
      wrap.appendChild(info);
      wrap.appendChild(control);
      return wrap;
    }
    
    // === Рендер списка вложенных настроек ===
    function renderSubsettings(subsettings) {
      subOverlayList.innerHTML = '';
      subsettings.forEach(sub => {
        subOverlayList.appendChild(renderSubSetting(sub));
      });
    }
          
      function openSubsettings(title_en, title_ru, subsettings) {
        currentSubSettings = subsettings;
        subOverlayTitleEn.textContent = title_en;
        subOverlayTitleRu.textContent = title_ru;
        renderSubsettings(subsettings);
      
        // плавное открытие
        subOverlay.classList.add('active');
        document.body.style.overflow = 'hidden'; // блокируем скролл основного документа
      
        requestAnimationFrame(() => {
          const container = subOverlay.querySelector('.subsettings-container');
          const header = subOverlay.querySelector('.subsettings-header');
          const headerOffset = header ? header.offsetHeight + 60 : 60;
      
          // Отступ сверху, чтобы первая карточка не прилипала
          container.style.marginTop = `${headerOffset}px`;
      
          // Проверяем, помещается ли контент
          const availableHeight = window.innerHeight - 40;
          if (container.scrollHeight > availableHeight) {
            // если контента больше чем окно — разрешаем прокрутку
            subOverlay.style.overflowY = 'auto';
          } else {
            // иначе фиксируем без скролла
            subOverlay.style.overflowY = 'hidden';
          }
        });
      }
      
      // === Закрытие оверлея ===
      subOverlayClose.addEventListener('click', () => {
        subOverlay.classList.remove('active');
        document.body.style.overflow = ''; // возвращаем прокрутку страницы
      });
      

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
  
});
