const tg = window.Telegram.WebApp;
tg.expand();

const user = tg.initDataUnsafe?.user;

const userInfo = document.getElementById('user-info');
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

// === Приветствие и загрузка админов ===
if (user && userInfo) {
  userInfo.innerHTML = `<p>Привет, ${user.first_name}!</p>`;
} else {
  userInfo.innerHTML = 'Ошибка: не удалось получить данные пользователя.';
  if (addBtn) addBtn.style.display = 'none';
}


document.addEventListener('DOMContentLoaded', async () => {
  // Загрузка типов оружия и модулей
  await loadWeaponTypes();

  // Установка даты по умолчанию
  const dateInput = document.getElementById('build-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
  }

  // Показываем главный экран
  showScreen('screen-main');

  // Проверка прав (отображение админ-кнопок)
  await checkAdminStatus();
});



async function checkAdminStatus() {
  try {
    const res = await fetch('/api/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData })
    });

    const data = await res.json();
    window.userInfo = data; // ✅ Сохраняем на глобальный доступ


    const editBtn = document.getElementById('edit-builds-btn');
    const assignBtn = document.getElementById('assign-admin-btn');
    const updateBtn = document.getElementById('update-version-btn');

    // Для всех админов (главных и доп)
    if (data.is_admin) {
      if (addBtn) addBtn.style.display = 'inline-block';
      if (editBtn) editBtn.style.display = 'inline-block';
      if (updateBtn) updateBtn.style.display = 'inline-block';
      if (userInfo) userInfo.innerHTML += `<p>Вы вошли как админ ✅</p>`;
    } else {
      if (addBtn) addBtn.style.display = 'none';
      if (editBtn) editBtn.style.display = 'none';
      if (updateBtn) updateBtn.style.display = 'none';
    }

    // Только для главного
    if (data.is_super_admin) {
      if (assignBtn) assignBtn.style.display = 'inline-block';
    } else {
      if (assignBtn) assignBtn.style.display = 'none';
    }

  } catch (e) {
    console.error("Ошибка при проверке прав администратора:", e);
    if (addBtn) addBtn.style.display = 'none';
    const editBtn = document.getElementById('edit-builds-btn');
    const assignBtn = document.getElementById('assign-admin-btn');
    if (editBtn) editBtn.style.display = 'none';
    if (assignBtn) assignBtn.style.display = 'none';
  }
}


function showScreen(id) {
  // 🔐 Защита от неавторизованных пользователей
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
    const isTarget = screen.id === id;

    if (isTarget) {
      screen.style.display = 'block';
      requestAnimationFrame(() => {
        screen.classList.add('active');
      });
    } else {
      screen.classList.remove('active');
      setTimeout(() => {
        screen.style.display = 'none';
      }, 300); // ⏱️ соответствует transition в CSS
    }
  });

  // 🔄 Показывать roleButtons только на главном экране
  roleButtons.style.display = (id === 'screen-main') ? 'flex' : 'none';

  // 🔁 Обновим права и UI
  checkAdminStatus();
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

document.getElementById('back-to-main')?.addEventListener('click', () => showScreen('screen-main'));
document.getElementById('back-from-builds')?.addEventListener('click', () => showScreen('screen-main'));

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
  showScreen('screen-main');
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
  if (modulesByType[type]) return;
  const res = await fetch(`/data/modules-${type}.json`);
  const mods = await res.json();
  modulesByType[type] = mods;

  for (const cat in mods) {
    mods[cat].forEach(mod => {
      moduleNameMap[mod.en] = mod.ru;
    });
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

// Главный обработчик сохранения (добавление или обновление)
let currentEditId = null;

// Главный обработчик сохранения (добавление или обновление)
async function handleSubmitBuild() {
  const tabs = Array.from(tabsContainer.querySelectorAll('.tab-block')).map(tab => {
    const label = tab.querySelector('.tab-label').value.trim();
    const items = Array.from(tab.querySelectorAll('.module-select')).map(sel => sel.value).filter(Boolean);
    return { label, items };
  });

  const data = {
    title: document.getElementById('title').value.trim(),
    weapon_type: weaponTypeSelect.value,
    top1: document.getElementById('top1').value.trim(),
    top2: document.getElementById('top2').value.trim(),
    top3: document.getElementById('top3').value.trim(),
    date: formatRuDate(document.getElementById('build-date').value),
    tabs
  };

  const method = currentEditId ? 'PUT' : 'POST';
  const url = currentEditId ? `/api/builds/${currentEditId}` : '/api/builds';

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
    alert('Ошибка при сохранении.');
  }
}

document.getElementById('submit-build').addEventListener('click', handleSubmitBuild);


function getCategoryByModule(moduleKey, weaponType) {
  const mods = modulesByType[weaponType];
  for (const cat in mods) {
    if (mods[cat].some(mod => mod.en === moduleKey)) return cat;
  }
  return '';
}

// === Загрузка сборок ===
async function loadBuilds() {
  const res = await fetch('/api/builds');
  const builds = await res.json();
  buildsList.innerHTML = '';

  if (builds.length === 0) {
    buildsList.innerHTML = '<p>Сборок пока нет.</p>';
    return;
  }

  const topColors = ["#FFD700", "#FF8C00", "#B0B0B0"];
  const uniqueTypes = [...new Set(builds.map(b => b.weapon_type))];
  await Promise.all(uniqueTypes.map(loadModules));

  builds.forEach((build, buildIndex) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'loadout js-loadout';

    const weaponTypeRu = weaponTypeLabels[build.weapon_type] || build.weapon_type;
    const tops = [build.top1, build.top2, build.top3].map((mod, i) => mod ? `<span class="loadout__top" style="background:${topColors[i]}">#${i+1} ${moduleNameMap[mod] || mod}</span>` : '').join('');

    const tabBtns = build.tabs.map((tab, i) => `<button class="loadout__tab ${i===0?'is-active':''}" data-tab="tab-${buildIndex}-${i}">${tab.label}</button>`).join('');
    const tabContents = build.tabs.map((tab, i) => `
      <div class="loadout__tab-content ${i===0?'is-active':''}" data-tab-content="tab-${buildIndex}-${i}">
        <div class="loadout__modules">
          ${tab.items.map(item => {
            const slot = getCategoryByModule(item, build.weapon_type);
            return `<div class="loadout__module"><span class="loadout__module-slot">${slot}</span><span class="loadout__module-name">${moduleNameMap[item] || item}</span></div>`;
          }).join('')}
        </div>
      </div>`).join('');

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
      </div>`;

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


// Формат даты ДЕНЬ МЕСЯЦ ГОД
function formatRuDate(input) {
  const d = new Date(input);
  if (isNaN(d)) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`; // 👈 DD.MM.YYYY
}



// JS — функция для загрузки и отрисовки таблицы

// JS — функция для загрузки и отрисовки таблицы 
async function loadBuildsTable() {
  try {
    const res = await fetch('/api/builds');
    const builds = await res.json();
    const tableWrapper = document.getElementById('edit-builds-table');

    if (!builds.length) {
      tableWrapper.innerHTML = "<p>Сборок пока нет.</p>";
      return;
    }

    let html = '';

    builds.forEach((build, index) => {
      html += `
        <div class="build-card">
          <div><strong>#${index + 1}</strong></div>
          <div><strong>Название:</strong> ${build.title}</div>
          <div><strong>Тип:</strong> ${weaponTypeLabels[build.weapon_type] || build.weapon_type}</div>
          <div><strong>Вкладки:</strong> ${build.tabs.length}</div>
          <div class="build-actions">
            <button class="btn btn-sm edit-btn" data-id="${build.id}">✏</button>
            <button class="btn btn-sm delete-btn" data-id="${build.id}">🗑</button>
          </div>
        </div>
      `;
    });

    tableWrapper.innerHTML = html;

    // Обработчики удаления
    tableWrapper.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (confirm('Удалить сборку?')) {
          const res = await fetch(`/api/builds/${id}`, { method: 'DELETE' });
          const data = await res.json();

          if (res.ok && data.status === "ok") {
            await loadBuildsTable(); // перезагрузка
          } else {
            alert("Не удалось удалить сборку. " + (data.detail || ""));
          }
        }
      });
    });

    // Обработчики редактирования
    tableWrapper.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        currentEditId = id;

        // Находим нужную сборку
        const build = builds.find(b => String(b.id) === String(id));
        if (!build) return alert("Сборка не найдена");

        showScreen('screen-form');
        document.getElementById('submit-build').textContent = "💾 Сохранить";

        // Заполняем поля
        document.getElementById('title').value = build.title;
        document.getElementById('weapon_type').value = build.weapon_type;
        document.getElementById('top1').value = build.top1 || '';
        document.getElementById('top2').value = build.top2 || '';
        document.getElementById('top3').value = build.top3 || '';
        document.getElementById('build-date').value = formatToInputDate(build.date || '');

        tabsContainer.innerHTML = '';
        await loadModules(build.weapon_type); // нужно загрузить модули перед отрисовкой

        build.tabs.forEach(tab => {
          const tabDiv = document.createElement('div');
          tabDiv.className = 'tab-block';
          tabDiv.innerHTML = `
            <input type="text" class="form-input tab-label" value="${tab.label}">
            <div class="mod-selects"></div>
            <div class="tab-actions">
              <button type="button" class="btn add-mod">+ модуль</button>
              <button type="button" class="btn delete-tab">🗑 Удалить вкладку</button>
            </div>`;
          tabsContainer.appendChild(tabDiv);

          tabDiv.querySelector('.add-mod').addEventListener('click', () => addModuleRow(tabDiv, build.weapon_type));
          tabDiv.querySelector('.delete-tab').addEventListener('click', () => tabDiv.remove());

          // Добавляем модули
          tab.items.forEach(mod => {
            addModuleRow(tabDiv, build.weapon_type);
            const lastRow = tabDiv.querySelectorAll('.mod-row');
            const row = lastRow[lastRow.length - 1];
            const modSel = row.querySelector('.module-select');
            if (modSel) modSel.value = mod;
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
  loadAdminList(user.id); // ✅ загружаем список админов
});

// Назад с экрана назначения
document.getElementById('back-from-assign')?.addEventListener('click', () => {
  showScreen('screen-main');
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
      body: JSON.stringify({ userId, requesterId: user.id })
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





// === Init ===
loadWeaponTypes();
