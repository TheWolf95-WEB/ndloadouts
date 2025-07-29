// переходы по страницам 

function showScreen(id) {
  const allScreens = document.querySelectorAll('.screen');

  allScreens.forEach(screen => {
    if (screen.id === id) {
      // Сначала показать без анимации
      screen.style.display = 'block';
      screen.classList.remove('active');

      // Добавляем анимацию на след. кадр (гарантированно плавно)
      requestAnimationFrame(() => {
        screen.classList.add('active');
        // Можно добавить: screen.scrollIntoView({ behavior: "smooth" });
      });
    } else {
      screen.classList.remove('active');
      // Убираем после завершения transition (через 300мс)
      setTimeout(() => {
        screen.style.display = 'none';
      }, 300);
    }
  });
}



// Примеры использования:
document.getElementById('add-build-btn')?.addEventListener('click', () => showScreen('screen-form'));
document.getElementById('show-builds-btn')?.addEventListener('click', async () => {
  await loadBuilds();
  showScreen('screen-builds');
});
document.getElementById('back-to-main')?.addEventListener('click', () => showScreen('screen-main'));
document.getElementById('back-from-builds')?.addEventListener('click', () => showScreen('screen-main'));





const tg = window.Telegram.WebApp;
tg.expand();

let ADMIN_IDS = [];

async function fetchAdminIds() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    ADMIN_IDS = data.admin_ids || [];
    checkAdmin(); // вызываем проверку доступа
  } catch (e) {
    console.error('Не удалось загрузить admin_ids:', e);
  }
}


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

if (user) {
  userInfo.innerHTML = `<p>Привет, ${user.first_name}!</p>`;
  fetchAdminIds(); // загружаем ID админов
} else {
  userInfo.innerHTML = 'Ошибка: не удалось получить данные пользователя.';
}

function checkAdmin() {
  const isAdmin = ADMIN_IDS.includes(user.id);
  if (isAdmin) {
    userInfo.innerHTML += `<p>Вы вошли как админ ✅</p>`;
    addBtn.style.display = 'inline-block';
  } else {
    userInfo.innerHTML += `<p>Пользователь 👤</p>`;
  }
}


// === ПОВЕДЕНИЕ КНОПОК ===
addBtn?.addEventListener('click', () => {
  buildForm.style.display = 'block';
  buildsList.style.display = 'none';
  roleButtons.style.display = 'none';
});

showBuildsBtn?.addEventListener('click', async () => {
  buildForm.style.display = 'none';
  buildsList.style.display = 'block';
  roleButtons.style.display = 'none';
  await loadBuilds(); // загружаем сборки вручную
});

// === Загрузка типов оружия ===
const weaponTypeLabels = {}; // type.key → type.label

async function loadWeaponTypes() {
  const res = await fetch('/api/types');
  const types = await res.json();

  types.forEach(type => {
    const opt = document.createElement('option');
    opt.value = type.key;
    opt.textContent = type.label;
    weaponTypeLabels[type.key] = type.label; // сохраняем
    weaponTypeSelect.appendChild(opt);
  });

  const defaultType = weaponTypeSelect.value;
  await loadModules(defaultType);
}



// === Загрузка модулей по типу ===
const moduleNameMap = {};

async function loadModules(type) {
  if (modulesByType[type]) return;
  const res = await fetch(`/data/modules-${type}.json`);
  const mods = await res.json();
  modulesByType[type] = mods;

  // Создаём map для en → ru
  for (const cat in mods) {
    mods[cat].forEach(mod => {
      moduleNameMap[mod.en] = mod.ru;
    });
  }
}

weaponTypeSelect.addEventListener('change', async () => {
  const type = weaponTypeSelect.value;
  await loadModules(type);
});

// === Добавление вкладки ===
document.getElementById('add-tab').addEventListener('click', () => {
  const type = weaponTypeSelect.value;
  const modules = modulesByType[type];

  if (!modules) return alert("Сначала выбери тип оружия");

  const tabDiv = document.createElement('div');
  tabDiv.className = 'tab-block';

  // HTML вкладки
    tabDiv.innerHTML = `
    <input type="text" class="form-input tab-label" placeholder="Название вкладки" style="margin-bottom: 10px;">
    <div class="mod-selects"></div>
    <div class="tab-actions">
        <button type="button" class="btn add-mod">+ модуль</button>
        <button type="button" class="btn delete-tab">🗑 Удалить вкладку</button>
    </div>
    `;


  // добавляем в DOM
  tabsContainer.appendChild(tabDiv);

// обработчик "добавить модуль"
const addModButton = tabDiv.querySelector('.add-mod');
addModButton.addEventListener('click', () => {
  const currentType = weaponTypeSelect.value;
  const currentModules = modulesByType[currentType];
  if (!currentModules) return alert("Выбери тип оружия");

  const row = document.createElement('div');
  row.className = 'mod-row';

  const categorySelect = document.createElement('select');
  categorySelect.className = 'form-input category-select';

  const moduleSelect = document.createElement('select');
  moduleSelect.className = 'form-input module-select';

  // Получаем уже выбранные категории и модули
  const usedCategories = Array.from(tabDiv.querySelectorAll('.category-select')).map(s => s.value);
  const usedModules = Array.from(tabDiv.querySelectorAll('.module-select')).map(s => s.value);

  // Выбираем первую доступную категорию
  let firstAvailableCategory = null;
  for (const category in currentModules) {
    if (!usedCategories.includes(category)) {
      firstAvailableCategory = category;
      break;
    }
  }

  // Если все категории уже выбраны
  if (!firstAvailableCategory) {
    alert("Все категории уже добавлены");
    return;
  }

  // Заполняем select категорий
  for (const category in currentModules) {
    if (usedCategories.includes(category)) continue;
    const opt = document.createElement('option');
    opt.value = category;
    opt.textContent = category;
    categorySelect.appendChild(opt);
  }

  categorySelect.value = firstAvailableCategory;

  // Функция обновления списка модулей
  const updateModuleOptions = () => {
    const category = categorySelect.value;
    const mods = currentModules[category] || [];
    const selectedValues = Array.from(tabDiv.querySelectorAll('.module-select')).map(s => s.value);

    moduleSelect.innerHTML = '';
    mods.forEach(mod => {
      if (selectedValues.includes(mod.ru)) return;
      const opt = document.createElement('option');
      opt.value = mod.en; // сохраняем английский
      opt.textContent = mod.en; // отображаем английский
      moduleSelect.appendChild(opt);
    });

    // Если не осталось модулей
    if (moduleSelect.options.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'Все модули выбраны';
      opt.disabled = true;
      moduleSelect.appendChild(opt);
      moduleSelect.disabled = true;
    } else {
      moduleSelect.disabled = false;
    }
  };

  // Обновление всех module-select при изменении
  const updateAllModuleSelects = () => {
    const selectedModules = Array.from(tabDiv.querySelectorAll('.module-select')).map(s => s.value);

    tabDiv.querySelectorAll('.mod-row').forEach(row => {
      const catSel = row.querySelector('.category-select');
      const modSel = row.querySelector('.module-select');
      const category = catSel.value;
      const mods = currentModules[category] || [];
      const currentValue = modSel.value;

      modSel.innerHTML = '';
      mods.forEach(mod => {
        if (selectedModules.includes(mod.ru) && mod.ru !== currentValue) return;
        const opt = document.createElement('option');
        opt.value = mod.en;
        opt.textContent = mod.en;
        modSel.appendChild(opt);
      });

      modSel.value = currentValue;
    });
  };

  // Слушатели
  categorySelect.addEventListener('change', () => {
    updateModuleOptions();
    updateAllModuleSelects();
  });

  moduleSelect.addEventListener('change', () => {
    updateAllModuleSelects();
  });

  row.appendChild(categorySelect);
  row.appendChild(moduleSelect);
  tabDiv.querySelector('.mod-selects').appendChild(row);

  // Начальный рендер
  updateModuleOptions();
  updateAllModuleSelects();
});



  // обработчик "удалить вкладку"
  tabDiv.querySelector('.delete-tab').addEventListener('click', () => {
    tabDiv.remove();
  });
});

// === Отправка сборки ===
document.getElementById('submit-build').addEventListener('click', async () => {
  try {
    const tabs = Array.from(tabsContainer.querySelectorAll('.tab-block')).map(tab => {
      const label = tab.querySelector('.tab-label').value.trim();
      const items = Array.from(tab.querySelectorAll('.mod-row')).map(row => {
        const modSelect = row.querySelector('.module-select');
        return modSelect?.value || ''; // если нет значения, будет пусто
      }).filter(Boolean); // удалим пустые строки, если что-то не выбрано

      return { label, items };
    });

    const data = {
      title: document.getElementById('title').value.trim(),
      weapon_type: weaponTypeSelect.value,
      top1: document.getElementById('top1').value.trim(),
      top2: document.getElementById('top2').value.trim(),
      top3: document.getElementById('top3').value.trim(),
      tabs,
    };

    const res = await fetch('/api/builds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      alert("Сборка добавлена!");
      buildForm.style.display = 'none';
      buildsList.style.display = 'block';
      await loadBuilds(); // покажем сборки после сохранения
    } else {
      alert("Ошибка при сохранении.");
    }
  } catch (e) {
    alert("Ошибка при отправке данных.");
    console.error(e);
  }
});


// === Загрузка и вывод сборок ===
async function loadBuilds() {
  const res = await fetch("/api/builds");
  const builds = await res.json();
  const topColors = ["#FFD700", "#FF8C00", "#B0B0B0"];
  buildsList.innerHTML = "";

  if (builds.length === 0) {
    buildsList.innerHTML = "<p>Сборок пока нет.</p>";
    return;
  }

  

  // Загружаем модули для всех типов оружия, которые встречаются в сборках
  const uniqueTypes = [...new Set(builds.map(b => b.weapon_type))];
  await Promise.all(uniqueTypes.map(type => loadModules(type)));

  // Теперь moduleNameMap точно заполнен
  builds.forEach(build => {
    const wrapper = document.createElement("div");
    wrapper.className = "build-card";

    const weaponTypeRu = weaponTypeMap[build.weapon_type] || build.weapon_type;
    
    wrapper.innerHTML = `
      <details>
        <summary>
          <div class="build-header">
            <div class="build-title-wrap">
              <h3 class="build-title">${build.title}</h3>
              <div class="top-tags">
                ${[build.top1, build.top2, build.top3].map((mod, i) =>
                  mod ? `<span class="top-tag" style="background:${topColors[i]}">#${i + 1} ${mod}</span>` : ''
                ).join('')}
              </div>
            </div>
             <div class="build-type"><b>${weaponTypeLabels[build.weapon_type] || build.weapon_type}</b></div>
          </div>
        </summary>
    
        <div class="tab-buttons">
          ${build.tabs.map((tab, i) =>
            `<button class="tab-btn" data-index="${i}">${tab.label}</button>`
          ).join('')}
        </div>
    
        <div class="tab-content">
          ${build.tabs.map((tab, i) => `
            <div class="tab-panel" style="${i === 0 ? '' : 'display:none;'}">
              ${tab.items.map(item => `
                <div class="mod-block">${moduleNameMap[item] || item}</div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </details>
    `;


    // табы
    setTimeout(() => {
      const buttons = wrapper.querySelectorAll(".tab-btn");
      const panels = wrapper.querySelectorAll(".tab-panel");
      buttons.forEach((btn, i) => {
        btn.addEventListener("click", () => {
          panels.forEach(p => p.style.display = "none");
          panels[i].style.display = "block";
        });
      });
    }, 0);

    buildsList.appendChild(wrapper);
  });
}


// === При старте загружаем только типы оружия
loadWeaponTypes();


// === Обработчик кнопки "Назад" ===
document.getElementById('back-to-main').addEventListener('click', () => {
  buildForm.style.display = 'none';
  buildsList.style.display = 'none';
  
  // Всегда показываем кнопки ролей (назад на стартовый экран)
  roleButtons.style.display = 'block';

  // Проверка: если пользователь админ — показать кнопку добавления
  const isAdmin = ADMIN_IDS.includes(user.id);
  if (isAdmin) {
    addBtn.style.display = 'inline-block';
  }
});


// const tg = window.Telegram.WebApp;

document.getElementById('help-btn')?.addEventListener('click', () => {
  // Замените your_tg_username на ваш Telegram‑ник
  const url = 'https://t.me/ndzone_admin';
  tg.openLink(url);
});
