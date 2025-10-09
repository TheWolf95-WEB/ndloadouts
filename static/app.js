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

if (!window.Analytics) {
  window.Analytics = { trackEvent: () => {} };
}


let ADMIN_IDS = [];
let currentSubmitHandler = null;
let cachedBuilds = [];        // кэш всех сборок последней загрузки
let currentCategory = 'all';  // текущая категория
let screenHistory = [];


// === Приветствие и загрузка админов ===
if (user && userInfoEl) {
  userInfoEl.innerHTML = `<p>Привет, ${user.first_name}!</p>`;
} else {
  if (userInfoEl) {
    userInfoEl.innerHTML = 'Ошибка: не удалось получить данные пользователя.';
  }
}


document.addEventListener('DOMContentLoaded', async () => {
    // фиксируем старт сессии
  Analytics.trackEvent('session_start', { 
  platform: tg.platform, 
  time: new Date().toISOString()
});
  
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

  Analytics.trackEvent('switch_category', { 
    category,
    time: new Date().toISOString()
  });
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

    const editBtn = document.getElementById('edit-builds-btn');
    const assignBtn = document.getElementById('assign-admin-btn');
    const updateBtn = document.getElementById('update-version-btn');
    const addBtn = document.getElementById('add-build-btn');
    const modulesBtn = document.getElementById('modules-dict-btn');

    // Прячем все админские кнопки по умолчанию
    [editBtn, assignBtn, updateBtn, addBtn, modulesBtn].forEach(btn => {
      if (btn) btn.classList.remove('is-visible', 'full-width');
    });

    // === Если админ ===
    if (data.is_admin) {
      editBtn?.classList.add('is-visible');
      updateBtn?.classList.add('is-visible');
      addBtn?.classList.add('is-visible');
      modulesBtn?.classList.add('is-visible'); // 👈 теперь будет показываться только админам
      userInfoEl.innerHTML += `<p>Вы вошли как админ ✅</p>`;
    }

    // === Если супер-админ ===
    if (data.is_super_admin) {
      assignBtn?.classList.add('is-visible');
      addBtn?.classList.add('full-width');
    } else {
      addBtn?.classList.remove('full-width');
    }

  } catch (e) {
    console.error("Ошибка при проверке прав администратора:", e);

    // Если ошибка — прячем кнопки
    const allAdminBtns = [
      'edit-builds-btn',
      'assign-admin-btn',
      'update-version-btn',
      'add-build-btn',
      'modules-dict-btn'
    ];

    allAdminBtns.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.style.display = 'none';
    });
  }
}


let isGoingBack = false;

function showScreen(id) {
  // 📌 сохраняем текущий экран в историю (только если это не возврат назад)
  const current = document.querySelector('.screen.active')?.id;
  if (current && current !== id && !isGoingBack) {
    screenHistory.push(current);
  }
  isGoingBack = false;

  // фиксируем событие открытия экрана
  Analytics.trackEvent('open_screen', { 
    screen: id,
    time: new Date().toISOString()
  });

    // 🎨 Смена темы по экрану
  const body = document.body;
  body.classList.remove('warzone-theme', 'bf-theme'); // сброс старой темы

  if (id === 'screen-warzone-main') {
    body.classList.add('warzone-theme');   // зелёная тема для Warzone
  } else if (id === 'screen-battlefield-main') {
    body.classList.add('bf-theme');        // синяя тема для Battlefield
  }


  const protectedScreens = {
    'screen-form': 'is_admin',
    'screen-edit-builds': 'is_admin',
    'screen-update-version': 'is_admin',
    'screen-assign-admin': 'is_super_admin'
  };

  const requiredRole = protectedScreens[id];
  if (requiredRole && !window.userInfo?.[requiredRole]) {
    alert("🚫 У вас нет доступа к этому разделу.");
    return;
  }

  const allScreens = document.querySelectorAll('.screen');
  allScreens.forEach(screen => {
    if (screen.id === id) {
      screen.style.display = 'block';
      screen.classList.remove('active');
      requestAnimationFrame(() => screen.classList.add('active'));
    } else {
      screen.classList.remove('active');
      setTimeout(() => screen.style.display = 'none', 300);
    }
  });

  roleButtons.style.display = (id === 'screen-warzone-main') ? 'flex' : 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Кнопка "Главное меню"
  const globalHomeBtn = document.getElementById('global-home-btn');
  if (id === 'screen-warzone-main') {
    globalHomeBtn.style.display = 'block';
  } else {
    globalHomeBtn.style.display = 'none';
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
  Analytics.trackEvent('click_button', { 
  button: 'show-builds',
  time: new Date().toISOString()
});
});


document.getElementById('back-to-main')?.addEventListener('click', () => {
  showScreen('screen-warzone-main');
  Analytics.trackEvent('click_button', { 
  button: 'back-to-main',
  time: new Date().toISOString()
});
});
document.getElementById('back-from-builds')?.addEventListener('click', () => showScreen('screen-warzone-main'));

document.getElementById('help-btn')?.addEventListener('click', () => {
  tg.openLink('https://t.me/ndzone_admin');
  Analytics.trackEvent('click_button', { 
  button: 'help',
  time: new Date().toISOString()
});
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


// Открытие справочника модулей (только для админов)
document.getElementById('modules-dict-btn')?.addEventListener('click', async () => {
  if (!window.userInfo?.is_admin) {
    alert("🚫 У вас нет прав доступа к справочнику модулей.");
    return;
  }

  await loadWeaponTypesForModules(); // 👈 подгружаем типы оружия в grid
  showScreen('screen-modules-types');
});

// Назад из выбора типа оружия
document.getElementById('back-from-mod-types')?.addEventListener('click', () => {
  showScreen('screen-warzone-main');
});

// Назад из списка модулей
document.getElementById('back-from-mod-list')?.addEventListener('click', () => {
  showScreen('screen-modules-types');
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
  const res = await fetch(`/api/modules/${type}`);
  const byCategory = await res.json(); // { category: Mod[] }

  const byKey = {};
  const flat = [];
  const norm = s => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');

  for (const cat in byCategory) {
    byCategory[cat].forEach(m => {
      const mod = { ...m, category: cat };
      flat.push(mod);

      // индексы по исходному и нормализованному ключу
      byKey[m.en] = { en: m.en, ru: m.ru, category: cat };
      byKey[norm(m.en)] = { en: m.en, ru: m.ru, category: cat };

      moduleNameMap[m.en] = m.ru;
    });
  }

  modulesByType[type] = { byCategory, byKey, flat };
}


// === Добавление вкладки ===
document.getElementById('add-tab').addEventListener('click', () => {
  const type = weaponTypeSelect.value;
  const modules = modulesByType[type];
  if (!modules) return alert("Сначала выбери тип оружия");

  const tabDiv = document.createElement('div');
  tabDiv.className = 'tab-block';
  tabDiv.innerHTML = `
    <input type="text" class="tab-label" placeholder="Название вкладки" style="margin-bottom: 10px;">
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
  const modsWrap = modulesByType[type];
  if (!modsWrap) return alert("Сначала выбери тип оружия");

  const row = document.createElement('div');
  row.className = 'mod-row';

  const categorySelect = document.createElement('select');
  categorySelect.className = 'form-input category-select';

  const moduleSelect = document.createElement('select');
  moduleSelect.className = 'form-input module-select';

  // категории, которых ещё нет во вкладке
  const usedCategories = Array.from(tabDiv.querySelectorAll('.category-select')).map(s => s.value);
  const availableCategories = Object.keys(modsWrap.byCategory).filter(cat => !usedCategories.includes(cat));
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

  function refreshModuleOptions() {
    const cat = categorySelect.value;
    const list = modsWrap.byCategory[cat] || [];
    const selected = Array.from(tabDiv.querySelectorAll('.module-select')).map(s => s.value);

    const currentValue = moduleSelect.value;
    moduleSelect.innerHTML = '';

    list.forEach(m => {
      if (selected.includes(m.en) && m.en !== currentValue) return;
      const opt = document.createElement('option');
      opt.value = m.en;
      opt.textContent = m.en; // хочешь — поставь m.ru
      moduleSelect.appendChild(opt);
    });

    if (!moduleSelect.value && moduleSelect.options.length) {
      moduleSelect.value = moduleSelect.options[0].value;
    }
  }

  function syncAllModuleSelects() {
    const selected = Array.from(tabDiv.querySelectorAll('.module-select')).map(s => s.value);

    tabDiv.querySelectorAll('.mod-row').forEach(r => {
      const catSel = r.querySelector('.category-select');
      const modSel = r.querySelector('.module-select');
      const cat = catSel.value;
      const list = modsWrap.byCategory[cat] || [];
      const currentValue = modSel.value;

      modSel.innerHTML = '';
      list.forEach(m => {
        if (selected.includes(m.en) && m.en !== currentValue) return;
        const opt = document.createElement('option');
        opt.value = m.en;
        opt.textContent = m.en;
        modSel.appendChild(opt);
      });

      if ([...modSel.options].some(o => o.value === currentValue)) {
        modSel.value = currentValue;
      } else if (modSel.options.length) {
        modSel.value = modSel.options[0].value;
      }
    });
  }

  categorySelect.addEventListener('change', () => { refreshModuleOptions(); syncAllModuleSelects(); });
  moduleSelect.addEventListener('change', syncAllModuleSelects);

  // первичная инициализация
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


    // 👁 Если открыт экран сборок — обновляем его
    if (document.getElementById('screen-builds')?.classList.contains('active')) {
      await loadBuilds(currentCategory || 'all');
    }

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
  return mods?.byKey?.[moduleKey]?.category || '';
}


// (загружает список типов оружия и отрисовывает кнопки на экране screen-modules-types)
async function loadWeaponTypesForModules() {
  try {
    const res = await fetch('/api/types');
    const types = await res.json();
    const list = document.getElementById('modules-types-grid');
    list.innerHTML = '';

    types.forEach(type => {
      const item = document.createElement('button');
      item.className = 'modules-type-btn';
      item.textContent = type.label;
      item.addEventListener('click', () => loadModulesList(type.key, type.label));
      list.appendChild(item);
    });

  } catch (e) {
    console.error('Ошибка при загрузке типов оружия:', e);
  }
}




// (загружает модули через /api/modules/{weaponType} и отрисовывает их на экране screen-modules-list)
async function loadModulesForType(weaponType, label) {
  try {
    const res = await fetch(`/api/modules/${weaponType}`);
    const data = await res.json();

    document.getElementById('modules-title').textContent = `Справочник модулей — ${label}`;
    const listEl = document.getElementById('modules-list');
    listEl.innerHTML = '';

    for (const category in data) {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'module-group';
      groupDiv.innerHTML = `<h4>${category}</h4>`;

      data[category].forEach(mod => {
        const row = document.createElement('div');
        row.className = 'module-row';

        row.innerHTML = `
          <span>${mod.en} — ${mod.ru}</span>
          <button class="btn btn-sm" data-id="${mod.id}">🗑</button>
        `;

        row.querySelector('button').addEventListener('click', async () => {
          if (!confirm(`Удалить модуль ${mod.en}?`)) return;
          await fetch(`/api/modules/${mod.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg.initData })
          });
          await loadModulesForType(weaponType, label); // перезагрузка
        });

        groupDiv.appendChild(row);
      });

      listEl.appendChild(groupDiv);
    }

    // 👉 Сохраним текущий тип оружия, чтобы добавлять модули
    window.currentModuleWeaponType = weaponType;
    showScreen('screen-modules-list');

  } catch (e) {
    console.error("Ошибка загрузки модулей:", e);
  }
}

async function loadModulesList(typeKey, typeLabel) {
  await loadModulesForType(typeKey, typeLabel);
}

// Добавление нового модуля (кнопка "➕ Добавить")
document.getElementById('mod-add-btn')?.addEventListener('click', async () => {
  const payload = {
    initData: tg.initData,
    weapon_type: window.currentModuleWeaponType,
    category: document.getElementById('mod-category').value.trim(),
    en: document.getElementById('mod-en').value.trim(),
    ru: document.getElementById('mod-ru').value.trim(),
    pos: parseInt(document.getElementById('mod-pos').value) || 0
  };

  if (!payload.category || !payload.en || !payload.ru) {
    alert("Все поля обязательны");
    return;
  }

  try {
    await fetch('/api/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Очищаем поля
    ['mod-category', 'mod-en', 'mod-ru', 'mod-pos'].forEach(id => document.getElementById(id).value = '');
    await loadModules(payload.weapon_type); // обновим modulesByType
    await loadModulesForType(payload.weapon_type, weaponTypeLabels[payload.weapon_type] || payload.weapon_type); // перерисуем визуально
    rebuildModuleSelects(); // обновим выпадашки

    
    // Обновляем выпадающие списки модулей на форме сборки (если выбрано нужное оружие)
    if (weaponTypeSelect?.value === payload.weapon_type) {
      rebuildModuleSelects();  // ← это функция, которую мы сейчас создадим
    }

  } catch (e) {
    alert("Ошибка при добавлении");
    console.error(e);
  }
});


function rebuildModuleSelects() {
  const weaponType = weaponTypeSelect?.value;
  const mods = modulesByType[weaponType];
  if (!weaponType || !mods) return;

  // Пробегаем по всем вкладкам, пересобираем модульные селекты с учётом выбранных
  document.querySelectorAll('.tab-block').forEach(tab => {
    const selectedNow = Array.from(tab.querySelectorAll('.module-select')).map(s => s.value);

    tab.querySelectorAll('.mod-row').forEach(row => {
      const catSel = row.querySelector('.category-select');
      const modSel = row.querySelector('.module-select');
      const cat = catSel?.value;

      if (!cat || !mods.byCategory[cat]) return;

      const currentValue = modSel.value;
      modSel.innerHTML = '';

      mods.byCategory[cat].forEach(m => {
        if (selectedNow.includes(m.en) && m.en !== currentValue) return;
        const opt = document.createElement('option');
        opt.value = m.en;
        opt.textContent = m.en;
        modSel.appendChild(opt);
      });

      if ([...modSel.options].some(o => o.value === currentValue)) {
        modSel.value = currentValue;
      } else if (modSel.options.length) {
        modSel.value = modSel.options[0].value;
      }
    });
  });
}




// === Загрузка сборок ===
// === Загрузка сборок ===
async function loadBuilds(category = 'all') {
  const res = await fetch(`/api/builds?category=${category}`);
  const builds = await res.json();

  // если пусто
  if (!Array.isArray(builds) || builds.length === 0) {
    buildsList.innerHTML = '<p>Сборок пока нет.</p>';
    cachedBuilds = [];
    return;
  }

  function getTime(b) {
  let t = b.created_at ? Date.parse(b.created_at) : NaN;
  if (Number.isNaN(t)) {
    const dt = parseRuDate(b.date);
    t = dt ? dt.getTime() : 0;
  }
  return t || 0;
}

function prioritySort(a, b) {
  // Переводим категории на русский, если они английские
  const normalizeCats = (cats = []) => cats.map(c => {
    switch (c.toLowerCase()) {
      case 'new': return 'Новинки';
      case 'popular': return 'Популярное';
      case 'meta': return 'Мета';
      case 'topmeta': return 'Топ мета';
      default: return c;
    }
  });

  const A = normalizeCats(a.categories || []);
  const B = normalizeCats(b.categories || []);

  const getPriority = (cats) => {
    if (cats.includes("Новинки")) return 1;
    if (cats.includes("Топ мета")) return 2;
    if (cats.includes("Мета")) return 3;
    return 4;
  };

  const pa = getPriority(A);
  const pb = getPriority(B);

  // 🔹 сначала по приоритету категорий
  if (pa !== pb) return pa - pb;

  // 🔹 потом по дате (новее — выше)
  const ta = getTime(a);
  const tb = getTime(b);
  return tb - ta;
}



const sorted = [...builds].sort(prioritySort);
cachedBuilds = sorted;


  // загрузим справочники модулей только для типов, которые реально есть
  const uniqueTypes = [...new Set(sorted.map(b => b.weapon_type))];
  await Promise.all(uniqueTypes.map(loadModules));

  // рендер по отсортированному массиву
  buildsList.innerHTML = '';
  const topColors = ['#FFD700', '#B0B0B0', '#FF8C00'];

  sorted.forEach((build, buildIndex) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'loadout js-loadout';

const tops = [build.top1, build.top2, build.top3]
        .filter(Boolean)
        .map((mod) => {
          // если ты сам написал #1, #2 и т.п. — оставляем как есть
          const displayText = mod.trim();
          // используем те же цвета, что и раньше, просто по порядку
          const bg = topColors.find((_, idx) => idx < 3) || '#666';
          return `<span class="loadout__top" style="background:${bg}">${displayText}</span>`;
        })
        .join('');



          // === Категории (бейджи, русский + приоритет + отдельный бейдж справа)
      const cats = Array.isArray(build.categories) ? build.categories : [];

      // === Перевод категорий с английского на русский ===
      const translatedCats = cats.map(cat => {
        switch (cat.toLowerCase()) {
          case 'all': return 'Все';
          case 'new': return 'Новинки';
          case 'popular': return 'Популярное';
          case 'meta': return 'Мета';
          case 'topmeta': return 'Топ мета';
          default: return cat;
        }
      });

      
      // 🔸 сортировка и приоритет категорий
      const badgePriority = ["Новинки", "Популярное", "Топ мета", "Мета"];
      const badgeColors = {
        "Новинка": "#2f3336",
        "Популярное": "#2f3336",
        "Топ мета": "#2f3336",
        "Мета": "#2f3336"
      };
      
      // 🔸 перевод категории на русский и единую форму (без "Новинки")
      const normalizeName = (name) => {
        if (name === "Новинки") return "Новинка";
        return name;
      };
      
      let categoryBadges = translatedCats
        .map(cat => {
          const name = normalizeName(cat);
          return `<span class="badge badge-category" data-cat="${name}">${name}</span>`;
        })
        .join("");

      
    const tabBtns = build.tabs.map((tab, i) =>
      `<button class="loadout__tab ${i === 0 ? 'is-active' : ''}" data-tab="tab-${buildIndex}-${i}">${tab.label}</button>`
    ).join('');

    const tabContents = build.tabs.map((tab, i) => `
      <div class="loadout__tab-content ${i === 0 ? 'is-active' : ''}" data-tab-content="tab-${buildIndex}-${i}">
        <div class="loadout__modules">
          ${tab.items.map(itemKey => {
            const wrap = modulesByType[build.weapon_type];
            const norm = s => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
            const mod  = wrap?.byKey?.[itemKey] || wrap?.byKey?.[norm(itemKey)] || null;
            const slot = mod?.category || '—';
            const ru   = mod?.ru || itemKey;
            return `
              <div class="loadout__module">
                <span class="loadout__module-slot">${slot}</span>
                <span class="loadout__module-name">${ru}</span>
              </div>
            `;
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
          <div class="loadout__categories">${categoryBadges}</div>
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

  // сброс раскрытия
  document.querySelectorAll('.js-loadout').forEach(el => {
    el.classList.remove('is-open');
    const content = el.querySelector('.loadout__content');
    if (content) content.style.maxHeight = '0';
  });


// === Переключение вкладок ===
document.querySelectorAll('.loadout__tab').forEach(button => {
  button.addEventListener('click', () => {
    const parent = button.closest('.loadout');
    const tab = button.dataset.tab;

    // фиксируем событие переключения вкладки
    Analytics.trackEvent('switch_tab', { 
      tab: button.textContent.trim() || 'Без названия',
      time: new Date().toISOString()
    });


    parent.querySelectorAll('.loadout__tab').forEach(b => b.classList.remove('is-active'));
    parent.querySelectorAll('.loadout__tab-content').forEach(c => c.classList.remove('is-active'));
    button.classList.add('is-active');
    parent.querySelector(`[data-tab-content="${tab}"]`)?.classList.add('is-active');

    // обновление высоты блока при смене вкладки
    const content = parent.querySelector('.loadout__content');
    content.style.maxHeight = content.scrollHeight + 'px';
  });
});

// === Просмотр сборки ===
document.querySelectorAll('.js-loadout-toggle').forEach(header => {
  header.addEventListener('click', () => {
    const loadout = header.closest('.js-loadout');
    const content = loadout.querySelector('.loadout__content');
    loadout.classList.toggle('is-open');
    content.style.maxHeight = loadout.classList.contains('is-open') ? content.scrollHeight + 'px' : '0';

    // фиксируем просмотр сборки
    const buildIndex = [...document.querySelectorAll('.js-loadout')].indexOf(loadout);
    const build = cachedBuilds[buildIndex];
    const weaponTypeRu = weaponTypeLabels[build.weapon_type] || build.weapon_type;

    const finalTitle = build.title && build.title.trim() !== ""
      ? build.title
      : (weaponTypeLabels[build.weapon_type] || build.weapon_type);
    
    Analytics.trackEvent('view_build', { 
      title: finalTitle,
      weapon_name: weaponTypeRu,
      time: new Date().toISOString()
    });


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

    (window.Analytics?.trackEvent)?.('switch_category', { 
      category: type,
      time: new Date().toISOString()
    });
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

// === Помощники для новинки ===
// Парсер "ДД.ММ.ГГГГ" -> Date (если нет created_at)
function parseRuDate(d) {
  if (!d) return null;
  const [dd, mm, yyyy] = String(d).split('.');
  if (!dd || !mm || !yyyy) return null;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

// По массиву сборок находим самую свежую (created_at или date)
function getLatestBuildId(builds) {
  if (!Array.isArray(builds) || builds.length === 0) return null;
  let best = builds[0], bestTime = -Infinity;

  for (const b of builds) {
    // 1) если есть created_at — используем его
    let t = b.created_at ? Date.parse(b.created_at) : NaN;
    // 2) иначе пытаемся из поля date "ДД.ММ.ГГГГ"
    if (Number.isNaN(t)) {
      const dt = parseRuDate(b.date);
      t = dt ? dt.getTime() : 0;
    }
    if (t > bestTime) {
      bestTime = t;
      best = b;
    }
  }
  return best?.id ?? null;
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

tg.onEvent('web_app_close', () => {
  Analytics.trackEvent('session_end', { 
    time: new Date().toISOString()
  });
});

// === Глобальный свайп-назад с анимацией ===
// === Глобальный свайп-назад с анимацией ===
function goBack() {
  const prev = screenHistory.pop();
  if (!prev) {
    console.log("⬅️ История пуста, возврат невозможен");
    return;
  }

  const current = document.querySelector('.screen.active');
  if (!current) return;

  isGoingBack = true;

  // уезжаем вправо
  current.classList.add('slide-out-right');
  current.addEventListener('transitionend', () => {
    current.classList.remove('active', 'slide-out-right');
    current.style.display = 'none';

    // 👉 используем showScreen, чтобы корректно восстановить кнопки/логику
    showScreen(prev);

    // заезжаем слева (для красоты)
    const prevScreen = document.getElementById(prev);
    if (prevScreen) {
      prevScreen.classList.add('slide-in-left');
      requestAnimationFrame(() => {
        prevScreen.classList.remove('slide-in-left');
      });
    }
  }, { once: true });
}

let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
});

document.addEventListener('touchend', (e) => {
  const touchEndX = e.changedTouches[0].screenX;
  const touchEndY = e.changedTouches[0].screenY;

  const deltaX = touchEndX - touchStartX;
  const deltaY = Math.abs(touchEndY - touchStartY);

  // свайп вправо: движение по X > 70px и Y не больше 50px
  if (deltaX > 70 && deltaY < 50) {
    goBack();
  }
});
