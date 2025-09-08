const tg = window.Telegram.WebApp;
tg.expand();

const user = tg.initDataUnsafe?.user;

const userInfoEl = document.getElementById('user-info')
const buildsList = document.getElementById('builds-list');
const buildForm = document.getElementById('build-form');
const addBtn = document.getElementById('add-build-btn');
const showBuildsBtn = document.getElementById('show-builds-btn');
const roleButtons = document.getElementById('role-buttons');
const weaponTypeSelect = document.getElementById('weapon_type');
const tabsContainer = document.getElementById('tabs-container');

const modulesByType = {};
const weaponTypeLabels = {};
const moduleNameMap = {};

let ADMIN_IDS = [];
let currentSubmitHandler = null;
let cachedBuilds = [];        // кэш всех сборок последней загрузки
let currentCategory = 'all';  // текущая категория


// === Приветствие и загрузка админов ===
if (user && userInfoEl) {
  userInfoEl.innerHTML = `<p>Привет, ${user.first_name}!</p>`;
} else {
  if (userInfoEl) {
    userInfoEl.innerHTML = 'Ошибка: не удалось получить данные пользователя.';
  }
}


document.addEventListener('DOMContentLoaded', async () => {
  await loadWeaponTypes(); // Загрузка типов

      // ✅ Показываем кнопки пользователя
  document.getElementById('show-builds-btn')?.classList.add('is-visible');
  document.getElementById('help-btn')?.classList.add('is-visible');
  
  const dateInput = document.getElementById('build-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
  }

  // 👉 Добавить ожидание checkAdminStatus
  await checkAdminStatus();

  // ✅ Показываем экран только после загрузки userInfo
  if (window.userInfo) {
    showScreen('screen-home');
  } else {
    console.error("❌ userInfo не загружен — showScreen не будет вызван");
  }
});

// 👉 Обработка смены категории в фильтре
document.getElementById('category-filter')?.addEventListener('change', async (e) => {
  const category = e.target.value;
  await loadBuilds(category);
});

async function checkAdminStatus() {
  try {
    const res = await fetch('/api/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData })
    });

    const data = await res.json();
    window.userInfo = data;

    const editBtn    = document.getElementById('edit-builds-btn');
    const assignBtn  = document.getElementById('assign-admin-btn');
    const updateBtn  = document.getElementById('update-version-btn');
    const addBtn     = document.getElementById('add-build-btn');
    const modulesBtn = document.getElementById('modules-dict-btn'); // 👈

    // Сначала прячем всё
    [editBtn, assignBtn, updateBtn, addBtn, modulesBtn].forEach(btn => {
      if (btn) btn.classList.remove('is-visible', 'full-width');
    });

    if (data.is_admin) {
      editBtn?.classList.add('is-visible');
      updateBtn?.classList.add('is-visible');
      addBtn?.classList.add('is-visible');
      modulesBtn?.classList.add('is-visible');            // 👈 показать кнопку
      userInfoEl.innerHTML += `<p>Вы вошли как админ ✅</p>`;
    }

    if (data.is_super_admin) {
      assignBtn?.classList.add('is-visible');
      addBtn?.classList.add('full-width');
    } else {
      addBtn?.classList.remove('full-width');
    }

  } catch (e) {
    console.error("Ошибка при проверке прав администратора:", e);
    const editBtn    = document.getElementById('edit-builds-btn');
    const assignBtn  = document.getElementById('assign-admin-btn');
    const updateBtn  = document.getElementById('update-version-btn');
    const addBtn     = document.getElementById('add-build-btn');
    const modulesBtn = document.getElementById('modules-dict-btn');

    [editBtn, assignBtn, updateBtn, addBtn, modulesBtn].forEach(btn => {
      if (btn) btn?.classList.remove('is-visible', 'full-width');
    });
  }
}


// === Кнопки перехода ===
// === Кнопки перехода ===
document.getElementById('add-build-btn')?.addEventListener('click', () => {
  if (!window.userInfo?.is_admin) {
    alert("🚫 У вас нет прав доступа к добавлению сборок.");
    return;
  }

  currentEditId = null;
  document.getElementById('submit-build').textContent = "➕ Добавить";

  // Очистка всех полей
  document.getElementById('title').value = '';
  document.getElementById('weapon_type').value = weaponTypeSelect.options[0]?.value || '';
  document.getElementById('top1').value = '';
  document.getElementById('top2').value = '';
  document.getElementById('top3').value = '';
  document.getElementById('build-date').value = new Date().toISOString().split('T')[0];
  tabsContainer.innerHTML = '';

  showScreen('screen-form');
});

document.getElementById('show-builds-btn')?.addEventListener('click', async () => {
  await loadBuilds();
  showScreen('screen-builds');
});

document.getElementById('back-to-main')?.addEventListener('click', () => showScreen('screen-warzone-main'));
document.getElementById('back-from-builds')?.addEventListener('click', () => showScreen('screen-warzone-main'));

document.getElementById('help-btn')?.addEventListener('click', () => {
  tg.openLink('https://t.me/ndzone_admin');
});

document.getElementById('edit-builds-btn')?.addEventListener('click', async () => {
  if (!window.userInfo?.is_admin) {
    alert("🚫 У вас нет прав доступа к редактированию.");
    return;
  }

  await loadBuildsTable();
  showScreen('screen-edit-builds');
});

document.getElementById('back-from-edit')?.addEventListener('click', () => {
  showScreen('screen-warzone-main');
});


// === Загрузка типов оружия ===
async function loadWeaponTypes() {
  const res = await fetch('/api/types');
  const types = await res.json();

  types.forEach(type => {
    const opt = document.createElement('option');
    opt.value = type.key;
    opt.textContent = type.label;
    weaponTypeLabels[type.key] = type.label;
    weaponTypeSelect.appendChild(opt);
  });

  const defaultType = weaponTypeSelect.value;
  await loadModules(defaultType);
}

weaponTypeSelect.addEventListener('change', async () => {
  await loadModules(weaponTypeSelect.value);
});

async function loadModules(type) {
  // уже загружали — выходим
  if (modulesByType[type]) return;

  // 1) пробуем API /api/modules/{type}
  const apiOk = await (async () => {
    try {
      const res = await fetch(`/api/modules/${encodeURIComponent(type)}`, { cache: 'no-store' });
      if (!res.ok) return false;
      const grouped = await res.json(); // { category: [{id,en,ru,pos}, ...], ... }
      // если пусто — считаем как неуспешную загрузку
      if (!grouped || typeof grouped !== 'object' || Object.keys(grouped).length === 0) return false;

      // приводим к формату, который уже использует твой код:
      // modulesByType[type] = { category: [{en,ru}, ...], ... }
      const normalized = {};
      Object.keys(grouped).forEach(cat => {
        normalized[cat] = (grouped[cat] || []).map(it => ({ en: it.en, ru: it.ru }));
      });
      modulesByType[type] = normalized;

      // заполним карту имён для отображения
      for (const cat in normalized) {
        normalized[cat].forEach(mod => {
          moduleNameMap[mod.en] = mod.ru;
        });
      }
      return true;
    } catch (e) {
      return false;
    }
  })();

  if (apiOk) return;

  // 2) fallback на старые JSON (ничего не ломаем)
  try {
    const res = await fetch(`/data/modules-${type}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(await res.text());
    const mods = await res.json(); // { category: [{en,ru}, ...], ... }
    modulesByType[type] = mods;

    for (const cat in mods) {
      (mods[cat] || []).forEach(mod => {
        moduleNameMap[mod.en] = mod.ru;
      });
    }
  } catch (e) {
    // если нет ни API, ни JSON — ставим пусто
    modulesByType[type] = {};
  }
}


// === Добавление вкладки ===
document.getElementById('add-tab').addEventListener('click', () => {
  const type = weaponTypeSelect.value;
  const modules = modulesByType[type];
  if (!modules) return alert("Сначала выбери тип оружия");

  const tabDiv = document.createElement('div');
  tabDiv.className = 'tab-block';
  tabDiv.innerHTML = `
    <input type="text" class="form-input tab-label" placeholder="Название вкладки" style="margin-bottom: 10px;">
    <div class="mod-selects"></div>
    <div class="tab-actions">
      <button type="button" class="btn add-mod">+ модуль</button>
      <button type="button" class="btn delete-tab">🗑 Удалить вкладку</button>
    </div>`;
  
  tabsContainer.appendChild(tabDiv);

  tabDiv.querySelector('.add-mod').addEventListener('click', () => addModuleRow(tabDiv, type));
  tabDiv.querySelector('.delete-tab').addEventListener('click', () => tabDiv.remove());
});

function addModuleRow(tabDiv, type) {
  const currentModules = modulesByType[type];
  const row = document.createElement('div');
  row.className = 'mod-row';

  const categorySelect = document.createElement('select');
  categorySelect.className = 'form-input category-select';
  const moduleSelect = document.createElement('select');
  moduleSelect.className = 'form-input module-select';

  // Заполняем категории (оставшиеся)
  const usedCategories = Array.from(tabDiv.querySelectorAll('.category-select')).map(s => s.value);
  const availableCategories = Object.keys(currentModules).filter(cat => !usedCategories.includes(cat));

  if (availableCategories.length === 0) {
    alert("Все категории уже добавлены");
    return;
  }

  availableCategories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });

  row.appendChild(categorySelect);
  row.appendChild(moduleSelect);
  tabDiv.querySelector('.mod-selects').appendChild(row);

  // === Обновляет модули в moduleSelect
  function updateModuleOptions() {
    const category = categorySelect.value;
    const mods = currentModules[category] || [];
    const selected = Array.from(tabDiv.querySelectorAll('.module-select')).map(s => s.value);

    moduleSelect.innerHTML = '';
    mods.forEach(mod => {
      if (selected.includes(mod.en) && moduleSelect.value !== mod.en) return; // оставить текущий
      const opt = document.createElement('option');
      opt.value = mod.en;
      opt.textContent = mod.en;
      moduleSelect.appendChild(opt);
    });

    if (!moduleSelect.value && moduleSelect.options.length > 0) {
      moduleSelect.value = moduleSelect.options[0].value;
    }
  }

  // === Обновляет все moduleSelect'ы
  function updateAllModules() {
    tabDiv.querySelectorAll('.mod-row').forEach(r => {
      const catSel = r.querySelector('.category-select');
      const modSel = r.querySelector('.module-select');
      const category = catSel.value;
      const mods = currentModules[category] || [];
      const selected = Array.from(tabDiv.querySelectorAll('.module-select')).map(s => s.value);
      const currentValue = modSel.value;

      modSel.innerHTML = '';
      mods.forEach(mod => {
        if (selected.includes(mod.en) && mod.en !== currentValue) return;
        const opt = document.createElement('option');
        opt.value = mod.en;
        opt.textContent = mod.en;
        modSel.appendChild(opt);
      });

      modSel.value = currentValue;
    });
  }

  categorySelect.addEventListener('change', () => {
    updateModuleOptions();
    updateAllModules();
  });

  moduleSelect.addEventListener('change', () => {
    updateAllModules();
  });

  categorySelect.dispatchEvent(new Event('change'));
}


// === Отправка сборки ===

let currentEditId = null;

// Главный обработчик сохранения (добавление или обновление)
async function handleSubmitBuild() {
  const tabs = Array.from(tabsContainer.querySelectorAll('.tab-block')).map(tab => {
    const label = tab.querySelector('.tab-label')?.value?.trim() || '';
    const items = Array.from(tab.querySelectorAll('.mod-row')).map(row => {
      const select = row.querySelector('.module-select');
      return select?.value?.trim() || '';
    });
    return { label, items };
  });

  // 📦 Чтение выбранных категорий
  const categoryCheckboxes = document.querySelectorAll('.build-category');
  const selectedCategories = Array.from(categoryCheckboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value);

  const categories = selectedCategories.length > 0 ? selectedCategories : ['all'];

  const data = {
    initData: tg.initData,
    title: document.getElementById('title')?.value?.trim() || '',
    weapon_type: weaponTypeSelect?.value || '',
    top1: document.getElementById('top1')?.value?.trim() || '',
    top2: document.getElementById('top2')?.value?.trim() || '',
    top3: document.getElementById('top3')?.value?.trim() || '',
    date: formatRuDate(document.getElementById('build-date')?.value || ''),
    tabs,
    categories
  };

  const method = currentEditId ? 'PUT' : 'POST';
  const url = currentEditId ? `/api/builds/${currentEditId}` : '/api/builds';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      alert(currentEditId ? 'Сборка обновлена!' : 'Сборка добавлена!');
      showScreen('screen-edit-builds');
      await loadBuildsTable();
      currentEditId = null;
      document.getElementById('submit-build').textContent = '➕ Добавить';
    } else {
      const errorText = await res.text();
      alert(`Ошибка при сохранении:\n${errorText}`);
    }
  } catch (err) {
    console.error('Сетевая ошибка:', err);
    alert('Ошибка подключения к серверу.');
  }
}

document.getElementById('submit-build').addEventListener('click', handleSubmitBuild);

// Помощник для определения категории по ключу модуля
function getCategoryByModule(moduleKey, weaponType) {
  const mods = modulesByType[weaponType];
  for (const cat in mods) {
    if (mods[cat].some(mod => mod.en === moduleKey)) return cat;
  }
  return '';
}


// === Загрузка сборок ===
async function loadBuilds(category = 'all') {
  const res = await fetch(`/api/builds?category=${category}`);
  const builds = await res.json();
  buildsList.innerHTML = '';

  cachedBuilds = builds; 

  if (builds.length === 0) {
    buildsList.innerHTML = '<p>Сборок пока нет.</p>';
    return;
  }

  const topColors = ["#FFD700", "#B0B0B0", "#FF8C00"];
  const uniqueTypes = [...new Set(builds.map(b => b.weapon_type))];
  await Promise.all(uniqueTypes.map(loadModules));

  builds.forEach((build, buildIndex) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'loadout js-loadout';

    const weaponTypeRu = weaponTypeLabels[build.weapon_type] || build.weapon_type;
    const tops = [build.top1, build.top2, build.top3].map((mod, i) => mod ? `<span class="loadout__top" style="background:${topColors[i]}">#${i+1} ${moduleNameMap[mod] || mod}</span>` : '').join('');

    const tabBtns = build.tabs.map((tab, i) => 
        `<button class="loadout__tab ${i === 0 ? 'is-active' : ''}" data-tab="tab-${buildIndex}-${i}">${tab.label}</button>`
      ).join('');
      
      const tabContents = build.tabs.map((tab, i) => `
        <div class="loadout__tab-content ${i === 0 ? 'is-active' : ''}" data-tab-content="tab-${buildIndex}-${i}">
          <div class="loadout__modules">
            ${tab.items.map(item => {
              const slot = getCategoryByModule(item, build.weapon_type);
              return `<div class="loadout__module"><span class="loadout__module-slot">${slot}</span><span class="loadout__module-name">${moduleNameMap[item] || item}</span></div>`;
            }).join('')}
          </div>
        </div>
      `).join('');


    wrapper.innerHTML = `
      <div class="loadout__header js-loadout-toggle">
        <div class="loadout__header--top">
          <button class="loadout__toggle-icon" type="button"><i class="fa-solid fa-chevron-down"></i></button>
          <h3 class="loadout__title">${build.title}</h3>
          <span class="loadout__date">${build.date || ''}</span>
        </div>
        <div class="loadout__meta">
          <div class="loadout__tops">${tops}</div>
          <div class="loadout__type">${weaponTypeRu}</div>
        </div>
      </div>
      <div class="loadout__content" style="max-height: 0; overflow: hidden;">
        <div class="loadout__inner">
          <div class="loadout__tabs">
            <div class="loadout__tab-buttons">${tabBtns}</div>
            <div class="loadout__tab-contents">${tabContents}</div>
          </div>
        </div>
      </div>
    `;

    buildsList.appendChild(wrapper);
  });

  document.querySelectorAll('.js-loadout').forEach(el => {
    el.classList.remove('is-open');
    const content = el.querySelector('.loadout__content');
    if (content) content.style.maxHeight = '0';
  });


document.querySelectorAll('.loadout__tab').forEach(button => {
  button.addEventListener('click', () => {
    const parent = button.closest('.loadout');
    const tab = button.dataset.tab;

    parent.querySelectorAll('.loadout__tab').forEach(b => b.classList.remove('is-active'));
    parent.querySelectorAll('.loadout__tab-content').forEach(c => c.classList.remove('is-active'));
    button.classList.add('is-active');
    parent.querySelector(`[data-tab-content="${tab}"]`)?.classList.add('is-active');

    // ⬇️ Обновление высоты после переключения вкладки
    const content = parent.querySelector('.loadout__content');
    content.style.maxHeight = content.scrollHeight + 'px';
  });
});

  document.querySelectorAll('.js-loadout-toggle').forEach(header => {
    header.addEventListener('click', () => {
      const loadout = header.closest('.js-loadout');
      const content = loadout.querySelector('.loadout__content');
      loadout.classList.toggle('is-open');
      content.style.maxHeight = loadout.classList.contains('is-open') ? content.scrollHeight + 'px' : '0';
    });
  });
}


document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const type = btn.dataset.type;
    document.querySelectorAll('.js-loadout').forEach((el, i) => {
      const build = cachedBuilds[i];
      const matches = (type === 'all' || build.weapon_type === type);
      el.style.display = matches ? 'block' : 'none';
    });

    // Если после фильтрации ничего не найдено — показать сообщение
    const anyVisible = [...document.querySelectorAll('.js-loadout')].some(el => el.style.display !== 'none');
    let messageEl = document.getElementById('no-results-msg');
    
    if (!anyVisible) {
      if (!messageEl) {
        messageEl = document.createElement('p');
        messageEl.id = 'no-results-msg';
        messageEl.textContent = '😕 Сборки не найдены';
        messageEl.style.color = '#aaa';
        messageEl.style.marginTop = '15px';
        buildsList.appendChild(messageEl);
      }
    } else {
      document.getElementById('no-results-msg')?.remove();
    }

  });
});



// Формат даты ДЕНЬ МЕСЯЦ ГОД
function formatRuDate(input) {
  const d = new Date(input);
  if (isNaN(d)) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}



// JS — функция для загрузки и отрисовки таблицы
async function loadBuildsTable() {
  try {
    const res = await fetch('/api/builds');
    const builds = await res.json();
    const tableWrapper = document.getElementById('edit-builds-table');

    if (!Array.isArray(builds) || builds.length === 0) {
      tableWrapper.innerHTML = "<p>Сборок пока нет.</p>";
      return;
    }

    // Рендер карточек
    let html = '';
    builds.forEach((build, index) => {
      html += `
        <div class="build-card">
          <div><strong>#${index + 1}</strong></div>
          <div><strong>Название:</strong> ${build.title}</div>
          <div><strong>Тип:</strong> ${weaponTypeLabels[build.weapon_type] || build.weapon_type}</div>
          <div><strong>Вкладки:</strong> ${Array.isArray(build.tabs) ? build.tabs.length : 0}</div>
          <div class="build-actions">
            <button class="btn btn-sm edit-btn" data-id="${build.id}">✏</button>
            <button class="btn btn-sm delete-btn" data-id="${build.id}">🗑</button>
          </div>
        </div>
      `;
    });
    tableWrapper.innerHTML = html;

    // --- Удаление ---
    tableWrapper.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('Удалить сборку?')) return;

        const delRes = await fetch(`/api/builds/${id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: tg.initData })
        });
        const data = await delRes.json().catch(() => ({}));

        if (delRes.ok && data.status === "ok") {
          await loadBuildsTable();
        } else {
          alert("Не удалось удалить сборку. " + (data.detail || ""));
        }
      });
    });

    // --- Редактирование ---
    tableWrapper.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        currentEditId = id;

        const build = builds.find(b => String(b.id) === String(id));
        if (!build) return alert("Сборка не найдена");

        showScreen('screen-form');
        document.getElementById('submit-build').textContent = "💾 Сохранить";

        // Категории
        const checkboxes = document.querySelectorAll('.build-category');
        checkboxes.forEach(cb => { cb.checked = (build.categories || []).includes(cb.value); });

        // Поля
        document.getElementById('title').value = build.title || '';
        document.getElementById('weapon_type').value = build.weapon_type || '';
        document.getElementById('top1').value = build.top1 || '';
        document.getElementById('top2').value = build.top2 || '';
        document.getElementById('top3').value = build.top3 || '';
        document.getElementById('build-date').value = formatToInputDate(build.date || '');

        // Модули по типу
        tabsContainer.innerHTML = '';
        await loadModules(build.weapon_type); // важно: подгрузить справочник модулей для типа

        // Восстановление вкладок и модулей
        (build.tabs || []).forEach(tab => {
          // Вкладка
          const tabDiv = document.createElement('div');
          tabDiv.className = 'tab-block';
          tabDiv.innerHTML = `
            <input type="text" class="form-input tab-label" value="${tab.label || ''}">
            <div class="mod-selects"></div>
            <div class="tab-actions">
              <button type="button" class="btn add-mod">+ модуль</button>
              <button type="button" class="btn delete-tab">🗑 Удалить вкладку</button>
            </div>
          `;
          tabsContainer.appendChild(tabDiv);

          tabDiv.querySelector('.add-mod').addEventListener('click', () => addModuleRow(tabDiv, build.weapon_type));
          tabDiv.querySelector('.delete-tab').addEventListener('click', () => tabDiv.remove());

          // Модули во вкладке — со строгим восстановлением категории
          (tab.items || []).forEach(modKey => {
            if (!modKey) return;

            // создаём строку
            addModuleRow(tabDiv, build.weapon_type);

            const rows = tabDiv.querySelectorAll('.mod-row');
            const row = rows[rows.length - 1];
            const catSelect = row.querySelector('.category-select');
            const modSelect = row.querySelector('.module-select');

            // определяем правильную категорию для этого модуля
            let cat = getCategoryByModule(modKey, build.weapon_type);
            if (!cat) {
              // если модуль не найден ни в одной категории — пусть остаётся первая доступная
              const first = catSelect.options[0]?.value || '';
              cat = first;
            }

            // ставим категорию → это заполнит список модулей (через обработчик change)
            catSelect.value = cat;
            catSelect.dispatchEvent(new Event('change'));

            // теперь ставим значение модуля; если отсутствует в списке — добавим как “неизвестный”
            if (![...modSelect.options].some(o => o.value === modKey)) {
              const opt = document.createElement('option');
              opt.value = modKey;
              opt.textContent = `${modKey} (неизвестный)`;
              modSelect.appendChild(opt);
            }
            modSelect.value = modKey;
            modSelect.dispatchEvent(new Event('change'));
          });
        });
      });
    });

  } catch (e) {
    console.error('Ошибка загрузки сборок:', e);
  }
}



// Преобразование даты в YYYY-MM-DD (для input type="date")

function formatToInputDate(dateStr) {
  const [day, month, year] = dateStr.split('.');
  return `${year}-${month}-${day}`;
}

// Назначить админа

// Переход на экран
document.getElementById('assign-admin-btn')?.addEventListener('click', () => {
  showScreen('screen-assign-admin');
  loadAdminList(window.userInfo?.user_id); // ✅ загружаем список админов
});

// Назад с экрана назначения
document.getElementById('back-from-assign')?.addEventListener('click', () => {
  showScreen('screen-warzone-main');
});

// Обработка формы назначения админа
document.getElementById('submit-admin-id')?.addEventListener('click', async () => {
  const input = document.getElementById('new-admin-id');
  const status = document.getElementById('assign-admin-status');
  const userId = input.value.trim();

  // ✅ проверка на числовой ID от 6 до 15 цифр
  if (!/^\d{6,15}$/.test(userId)) {
    status.textContent = 'Введите корректный числовой Telegram ID.';
    return;
  }

  try {
    const res = await fetch('/api/assign-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, requesterId: window.userInfo?.user_id })
    });

    const data = await res.json();
    status.textContent = data.message || 'Что-то пошло не так...';

    if (data.status === 'ok') {
      input.value = '';
      await loadAdminList(user.id); // 🔁 обновить список
    }
  } catch (err) {
    status.textContent = 'Ошибка отправки запроса.';
    console.error(err);
  }
});


// загрузка и удаление админов

async function loadAdminList(requesterId) {
  const res = await fetch('/api/admins');
  const data = await res.json();
  const listEl = document.getElementById('admin-list');
  listEl.innerHTML = '';

  // 👑 Главный админ
  const mainTitle = document.createElement('div');
  mainTitle.innerHTML = `<strong style="margin: 20px 0 10px 0; display: block;">Владелец:</strong>`;
  listEl.appendChild(mainTitle);

  data.main_admins.forEach(({ id, name }) => {
    const li = document.createElement('li');
    li.textContent = `ID: ${id} — ${name} 👑`;
    li.style.listStyleType = 'none'; // ⛔ убирает точку
    listEl.appendChild(li);
  });


  // 👥 Назначенные админы
  if (data.dop_admins.length > 0) {
    const dopTitle = document.createElement('div');
    dopTitle.innerHTML = `<strong style="margin: 10px 0; display: block;">Назначенные админы:</strong>`;
    listEl.appendChild(dopTitle);

    data.dop_admins.forEach(({ id, name }) => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.justifyContent = 'space-between';
      li.style.alignItems = 'center';
      li.style.gap = '10px';

      const span = document.createElement('span');
      span.textContent = `ID: ${id} — ${name}`;

      const btn = document.createElement('button');
      btn.textContent = 'Удалить';
      btn.style.background = 'none';
      btn.style.border = 'none';
      btn.style.color = 'red';
      btn.style.cursor = 'pointer';

      btn.addEventListener('click', async () => {
        if (String(id) === String(requesterId)) {
          alert("Нельзя удалить самого себя.");
          return;
        }

        if (!confirm(`Удалить админа ${name}?`)) return;

        const res = await fetch('/api/remove-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: id, requesterId })
        });

        const result = await res.json();
        alert(result.message || 'Готово');
        await loadAdminList(requesterId);
      });

      li.appendChild(span);
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }
}



// Справочник

// ==== СПРАВОЧНИК МОДУЛЕЙ: выбор типа → CRUD модулей ====

const modulesDictBtn = document.getElementById('modules-dict-btn');

const screenModulesTypes  = document.getElementById('screen-modules-types');
const screenModulesList   = document.getElementById('screen-modules-list');

const modulesTypesGrid    = document.getElementById('modules-types-grid');
const backFromModTypesBtn = document.getElementById('back-from-mod-types');

const modulesTitle     = document.getElementById('modules-title');
const modulesListWrap  = document.getElementById('modules-list');
const backFromModList  = document.getElementById('back-from-mod-list');

const modCategoryInput = document.getElementById('mod-category');
const modEnInput       = document.getElementById('mod-en');
const modRuInput       = document.getElementById('mod-ru');
const modPosInput      = document.getElementById('mod-pos');
const modAddBtn        = document.getElementById('mod-add-btn');

let _isAdminModules = false;
let currentWeaponTypeKey = null;
let currentWeaponTypeLabel = null;
let weaponTypesList = []; // [{key,label}]
let editingModuleId = null; // null — добавление; number — редактирование

function showScreenSafe(id) {
  // используем твою showScreen, если есть
  if (typeof showScreen === 'function') return showScreen(id);
  // fallback (если вдруг вызов вне контекста)
  document.querySelectorAll('.screen').forEach(s => s.style.display = (s.id === id ? 'block' : 'none'));
}

async function apiGetJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiSendJSON(url, method, payload) {
  const r = await fetch(url, {
    method,
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload || {})
  });
  if (!r.ok) throw new Error(await r.text());
  try { return await r.json(); } catch { return {}; }
}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

async function ensureAdminForModules() {
  const res = await apiSendJSON('/api/me', 'POST', { initData: tg.initData });
  _isAdminModules = !!res.is_admin;
  return _isAdminModules;
}

modulesDictBtn?.addEventListener('click', async () => {
  const ok = await ensureAdminForModules();
  if (!ok) return alert('Экран доступен только администраторам');
  await openModulesTypesScreen();
});

async function openModulesTypesScreen() {
  weaponTypesList = await apiGetJSON('/api/types'); // [{key,label}]
  modulesTypesGrid.innerHTML = weaponTypesList.map(t => `
    <div class="card-btn" data-weapon-key="${esc(t.key)}" style="min-width:160px;">
      <i class="fas fa-list"></i>
      <span>${esc(t.label)}</span>
    </div>
  `).join('');
  modulesTypesGrid.querySelectorAll('.card-btn').forEach(card => {
    card.addEventListener('click', () => {
      const key = card.dataset.weaponKey;
      const obj = weaponTypesList.find(x => x.key === key);
      currentWeaponTypeKey = key;
      currentWeaponTypeLabel = obj?.label || key;
      openModulesListScreen();
    });
  });
  showScreenSafe('screen-modules-types');
}

backFromModTypesBtn?.addEventListener('click', () => {
  showScreenSafe('screen-warzone-main');
});

async function openModulesListScreen() {
  modulesTitle.textContent = `Справочник: ${currentWeaponTypeLabel}`;
  await reloadModulesList();
  showScreenSafe('screen-modules-list');
}

async function reloadModulesList() {
  const grouped = await apiGetJSON(`/api/modules/${encodeURIComponent(currentWeaponTypeKey)}`);
  // если справочник пуст — подтянем старые JSON, чтобы не было пусто
  if (!grouped || Object.keys(grouped).length === 0) {
    await loadModules(currentWeaponTypeKey); // заполнит modulesByType + moduleNameMap
    const mods = modulesByType[currentWeaponTypeKey] || {};
    // отрисуем из JSON (без id)
    renderGroups(Object.fromEntries(Object.entries(mods).map(([cat, arr]) => [
      cat, arr.map((x, i) => ({ id: null, en: x.en, ru: x.ru, pos: i }))
    ])));
  } else {
    renderGroups(grouped);
  }
}

function renderGroups(grouped) {
  const cats = Object.keys(grouped).sort();
  if (!cats.length) {
    modulesListWrap.innerHTML = `<div class="subtext">Пока модулей нет. Заполните поля выше и нажмите «Добавить».</div>`;
    return;
  }
  modulesListWrap.innerHTML = cats.map(cat => {
    const items = (grouped[cat] || []).slice().sort((a,b)=> (a.pos - b.pos) || String(a.ru).localeCompare(String(b.ru)));
    const lis = items.map(it => `
      <li class="mod-item" data-id="${it.id ?? ''}" draggable="${it.id!=null}">
        <span class="mod-item__handle">☰</span>
        <div class="mod-item__name">
          <div><b>${esc(it.ru)}</b></div>
          <div style="opacity:.7;font-size:.9em">${esc(it.en)}</div>
        </div>
        <div class="mod-item__actions">
          ${it.id!=null ? `<button class="btn btn-small" data-act="edit" data-id="${it.id}" data-cat="${esc(cat)}">✏️</button>
          <button class="btn btn-small" data-act="del" data-id="${it.id}">🗑</button>` : `<span style="opacity:.6;">(из JSON, сохраните в БД)</span>`}
        </div>
      </li>
    `).join('');

    return `
      <section class="mod-group" data-category="${esc(cat)}" style="background:#171D25;padding:12px;border-radius:10px;margin-bottom:12px;">
        <div class="mod-group__title" style="font-weight:700;margin-bottom:8px;">${esc(cat)}</div>
        <ul class="mod-list" data-category="${esc(cat)}" style="list-style:none;margin:0;padding:0;">
          ${lis}
        </ul>
        <button class="btn btn-small" data-act="add-to-cat" data-category="${esc(cat)}" style="margin-top:8px;">+ Добавить в ${esc(cat)}</button>
      </section>
    `;
  }).join('');

  bindModulesListEvents();
}

function bindModulesListEvents() {
  // заполнить категорию в тулбаре
  modulesListWrap.querySelectorAll('[data-act="add-to-cat"]').forEach(btn => {
    btn.addEventListener('click', () => {
      modCategoryInput.value = btn.dataset.category || '';
      modEnInput.focus();
      editingModuleId = null;
      modAddBtn.textContent = '➕ Добавить';
    });
  });

  // редактировать
  modulesListWrap.querySelectorAll('[data-act="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const li = modulesListWrap.querySelector(`.mod-item[data-id="${id}"]`);
      const cat = btn.dataset.cat || '';
      const ru = li?.querySelector('.mod-item__name b')?.textContent || '';
      const en = li?.querySelector('.mod-item__name div:nth-child(2)')?.textContent || '';

      editingModuleId = id;
      modCategoryInput.value = cat;
      modEnInput.value = en;
      modRuInput.value = ru;

      // pos = текущий индекс
      const ul = li.closest('.mod-list');
      const idx = Array.from(ul.children).indexOf(li);
      modPosInput.value = String(idx);

      modAddBtn.textContent = '💾 Сохранить';
    });
  });

  // удалить
  modulesListWrap.querySelectorAll('[data-act="del"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      if (!confirm('Удалить модуль?')) return;
      await apiSendJSON(`/api/modules/${id}`, 'DELETE', { initData: tg.initData });
      await reloadModulesList();
      if (editingModuleId === id) resetModulesToolbar(true);
    });
  });

  // DnD сортировка внутри категории — только для элементов из БД (id != null)
  modulesListWrap.querySelectorAll('.mod-list').forEach(ul => {
    initDragSort(ul, async (orderedIds) => {
      // фильтруем только id с БД
      const ids = orderedIds.filter(x => x != null);
      for (let i = 0; i < ids.length; i++) {
        await apiSendJSON(`/api/modules/${ids[i]}`, 'PUT', { initData: tg.initData, pos: i });
      }
      await reloadModulesList();
      resetModulesToolbar();
    });
  });
}

modAddBtn?.addEventListener('click', async () => {
  const category = modCategoryInput.value.trim();
  const en = modEnInput.value.trim();
  const ru = modRuInput.value.trim();
  const pos = Number(modPosInput.value || 0);

  if (!category || !en || !ru) {
    alert('Категория, EN и RU обязательны');
    return;
  }

  try {
    if (editingModuleId == null) {
      // добавление в БД
      await apiSendJSON('/api/modules', 'POST', {
        initData: tg.initData,
        weapon_type: currentWeaponTypeKey,
        category, en, ru, pos
      });
    } else {
      // обновление
      await apiSendJSON(`/api/modules/${editingModuleId}`, 'PUT', {
        initData: tg.initData, category, en, ru, pos
      });
    }
    // обновим и локальный кэш для корректного отображения сборок
    // (чтобы moduleNameMap знал новые названия)
    modulesByType[currentWeaponTypeKey] = undefined;
    await loadModules(currentWeaponTypeKey);

    await reloadModulesList();
    resetModulesToolbar(true);
  } catch (e) {
    alert('Ошибка: ' + (e?.message || e));
  }
});

backFromModList?.addEventListener('click', () => {
  resetModulesToolbar();
  showScreenSafe('screen-modules-types');
});

function resetModulesToolbar(clear = false) {
  editingModuleId = null;
  modAddBtn.textContent = '➕ Добавить';
  if (clear) {
    modCategoryInput.value = '';
    modEnInput.value = '';
    modRuInput.value = '';
    modPosInput.value = '0';
  }
}

function initDragSort(listEl, onSorted) {
  let dragEl = null;
  listEl.querySelectorAll('.mod-item').forEach(li => {
    // запрещаем dnd для JSON (id пустой)
    if (!li.dataset.id) return;
    li.setAttribute('draggable', 'true');
    li.addEventListener('dragstart', (e) => {
      dragEl = li;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      if (dragEl) dragEl.classList.remove('dragging');
      dragEl = null;
    });
  });

  listEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = listEl.querySelector('.dragging');
    if (!dragging) return;
    const after = getDragAfterElement(listEl, e.clientY);
    if (after == null) listEl.appendChild(dragging);
    else listEl.insertBefore(dragging, after);
  });

  listEl.addEventListener('drop', async () => {
    const orderedIds = Array.from(listEl.querySelectorAll('.mod-item')).map(li => {
      const id = li.dataset.id;
      return id ? Number(id) : null;
    });
    if (typeof onSorted === 'function') await onSorted(orderedIds);
  });
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll('.mod-item:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height/2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    else return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}
