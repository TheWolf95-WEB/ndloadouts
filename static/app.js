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

// === Приветствие и загрузка админов ===
if (user && userInfo) {
  userInfo.innerHTML = `<p>Привет, ${user.first_name}!</p>`;
  checkAdminStatus(); // Проверяем админа
} else {
  userInfo.innerHTML = 'Ошибка: не удалось получить данные пользователя.';
  if (addBtn) addBtn.style.display = 'none';
}

async function checkAdminStatus() {
  try {
    const res = await fetch('/api/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData })
    });

    const data = await res.json();

    const editBtn = document.getElementById('edit-builds-btn');
    const assignBtn = document.getElementById('assign-admin-btn');

    if (data.is_admin) {
      if (addBtn) addBtn.style.display = 'inline-block';
      if (editBtn) editBtn.style.display = 'inline-block';
      if (assignBtn) assignBtn.style.display = 'inline-block'; // 👈 показать кнопку
      if (userInfo) userInfo.innerHTML += `<p>Вы вошли как админ ✅</p>`;
    } else {
      if (addBtn) addBtn.style.display = 'none';
      if (editBtn) editBtn.style.display = 'none';
      if (assignBtn) assignBtn.style.display = 'none'; // 👈 скрыть для обычных
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
  roleButtons.style.display = (id === 'screen-main') ? 'flex' : 'none';
  checkAdmin();
}

// === Кнопки перехода ===
document.getElementById('add-build-btn')?.addEventListener('click', () => showScreen('screen-form'));
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
document.getElementById('submit-build').addEventListener('click', async () => {
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
    tabs
  };

  const res = await fetch('/api/builds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (res.ok) {
    alert('Сборка добавлена!');
    buildForm.style.display = 'none';
    buildsList.style.display = 'block';
    await loadBuilds();
  } else {
    alert('Ошибка при сохранении.');
  }
});

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
    wrapper.className = 'loadout js-loadout is-open';

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
        </div>
        <div class="loadout__meta">
          <div class="loadout__tops">${tops}</div>
          <div class="loadout__type">${weaponTypeRu}</div>
        </div>
      </div>
      <div class="loadout__content" style="max-height: none; overflow: hidden;">
        <div class="loadout__inner">
          <div class="loadout__tabs">
            <div class="loadout__tab-buttons">${tabBtns}</div>
            <div class="loadout__tab-contents">${tabContents}</div>
          </div>
        </div>
      </div>`;

    buildsList.appendChild(wrapper);
  });

  document.querySelectorAll('.loadout__tab').forEach(button => {
    button.addEventListener('click', () => {
      const parent = button.closest('.loadout');
      const tab = button.dataset.tab;
      parent.querySelectorAll('.loadout__tab').forEach(b => b.classList.remove('is-active'));
      parent.querySelectorAll('.loadout__tab-content').forEach(c => c.classList.remove('is-active'));
      button.classList.add('is-active');
      parent.querySelector(`[data-tab-content="${tab}"]`)?.classList.add('is-active');
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


  } catch (e) {
    console.error('Ошибка загрузки сборок:', e);
  }
}

// Назначить админа
const assignAdminBtn = document.getElementById('assign-admin-btn');
const assignAdminForm = document.getElementById('assign-admin-form');
const confirmAssignAdmin = document.getElementById('confirm-assign-admin');

if (assignAdminBtn && assignAdminForm) {
  assignAdminBtn.addEventListener('click', () => {
    assignAdminForm.style.display = 'block';
  });
}

if (confirmAssignAdmin) {
  confirmAssignAdmin.addEventListener('click', async () => {
    const newId = document.getElementById('new-admin-id').value.trim();
    if (!newId || isNaN(newId)) {
      alert("Введите корректный Telegram ID");
      return;
    }

    const res = await fetch('/api/assign-admin-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: newId })
    });

    const data = await res.json();
    if (data.status === 'ok') {
      alert("✅ Пользователь назначен админом");
      assignAdminForm.style.display = 'none';
    } else {
      alert("Ошибка: " + (data.detail || data.message));
    }
  });
}



// === Init ===
loadWeaponTypes();
