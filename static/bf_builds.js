/* ===========================
   ⚔️ BATTLEFIELD BUILDS SCRIPT (исправленный)
   =========================== */
(() => {
  // локальный контекст — не конфликтует с app.js
  const bfTg = window.Telegram?.WebApp;
  bfTg?.expand?.();

  const bfUser = bfTg?.initDataUnsafe?.user || {};
  let bfUserInfo = null;

  const bfModulesByType = {};
  const bfWeaponTypeLabels = {};
  let bfCachedBuilds = [];
  let bfCurrentEditId = null;
  let bfScreenHistory = [];
  let bfHasUnsavedChanges = false;

  // === Инициализация ===
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await bfLoadWeaponTypes();
      console.log("✅ BF module ready (not auto-opened)");
    } catch (e) {
      console.error("BF init error:", e);
    }
  });


/* ==============
   🔹 Навигация
   ============== */

function bfShowScreen(id) {
  // Проверяем есть ли несохраненные изменения
  if (bfHasUnsavedChanges && !id.includes("bf-form") && !id.includes("bf-edit-builds")) {
    if (!confirm("У вас есть несохраненные изменения. Продолжить без сохранения?")) {
      return;
    }
    bfHasUnsavedChanges = false;
  }


  window.bfShowScreen = bfShowScreen;

  const current = document.querySelector(".screen.active")?.id;
  if (current && current !== id) bfScreenHistory.push(current);

  document.body.classList.remove("warzone-theme");
  document.body.classList.add("bf-theme");

  document.querySelectorAll(".screen").forEach((screen) => {
    if (screen.id === id) {
      screen.classList.add("active");
      screen.style.display = "block";
      requestAnimationFrame(() => {
        screen.style.opacity = "1";
        screen.style.transform = "translateY(0)";
      });
    } else if (screen.classList.contains("active")) {
      screen.style.opacity = "0";
      screen.style.transform = "translateY(10px)";
      setTimeout(() => {
        screen.classList.remove("active");
        screen.style.display = "none";
      }, 200);
    } else {
      screen.style.display = "none";
    }
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn");
  if (btn && btn.textContent.includes("Главное меню")) {
    document.body.classList.remove("bf-theme");
    document.body.classList.add("warzone-theme");
    console.log("🏠 Вернулся в NDHQ — тема Warzone восстановлена");
  }
});


/* ===============================
   🔸 Загрузка типов оружия
   =============================== */
async function bfLoadWeaponTypes() {
  try {
    const res = await fetch("/data/types-bf.json");
    const types = await res.json();
    const select = document.getElementById("bf-weapon-type");
    if (!select) return;

    select.innerHTML = "";
    types.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.key;
      opt.textContent = t.label;
      select.appendChild(opt);
      bfWeaponTypeLabels[t.key] = t.label;
    });
  } catch (err) {
    console.error("Failed to load weapon types:", err);
  }
}

/* ===============================
   🔸 Справочник модулей
   =============================== */

// Открытие справочника
document.getElementById("bf-modules-dict-btn")?.addEventListener("click", async () => {
  await bfLoadWeaponTypesForModules();
  bfShowScreen("screen-bf-modules-types");
});

// Назад из типов
document.getElementById("bf-back-from-mod-types")?.addEventListener("click", () =>
  bfShowScreen("screen-battlefield-main")
);

// Назад из списка модулей
document.getElementById("bf-back-from-mod-list")?.addEventListener("click", () =>
  bfShowScreen("screen-bf-modules-types")
);

// Загрузка типов оружия для справочника
async function bfLoadWeaponTypesForModules() {
  try {
    const res = await fetch("/data/types-bf.json");
    const types = await res.json();
    const grid = document.getElementById("bf-modules-types-grid");
    grid.innerHTML = "";

    types.forEach((t) => {
      const btn = document.createElement("button");
      btn.className = "modules-type-btn";
      btn.textContent = t.label;
      btn.addEventListener("click", () => bfLoadModulesList(t.key, t.label));
      grid.appendChild(btn);
    });
  } catch (e) {
    console.error("BF modules load error:", e);
  }
}

// Загрузка модулей по типу
async function bfLoadModulesList(weaponType, label) {
  try {
    const res = await fetch(`/api/bf/modules/${weaponType}`);
    const data = await res.json();
    const title = document.getElementById("bf-modules-title");
    const list = document.getElementById("bf-modules-list");
    title.textContent = `Modules — ${label}`;
    list.innerHTML = "";

   for (const category in data) {
     const group = document.createElement("div");
     group.className = "module-group";
     group.innerHTML = `
       <div class="module-group-header">
         <h4 class="module-title">${category}</h4>
         <button class="btn delete-category" title="Удалить категорию">Удалить</button>
       </div>
       <div class="modules-grid"></div>
     `;
   
     // === Удаление категории ===
     group.querySelector(".delete-category").addEventListener("click", async () => {
       if (!confirm(`Удалить категорию "${category}" со всеми модулями?`)) return;
       try {
         await Promise.all(
           data[category].map(mod =>
             fetch(`/api/bf/modules/${mod.id}`, {
               method: "DELETE",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify({ initData: tg.initData }),
             })
           )
         );
         await bfLoadModulesList(weaponType, label);
       } catch (err) {
         console.error("Ошибка при удалении категории:", err);
         alert("Не удалось удалить категорию");
       }
     });
   
     // === Добавляем модули в сетку ===
     const grid = group.querySelector(".modules-grid");
     data[category].forEach((mod) => {
       const card = document.createElement("div");
       card.className = "module-card";
       card.innerHTML = `
         <div class="mod-name">${mod.en}</div>
         <button class="delete-mod" data-id="${mod.id}" title="Удалить модуль">Удалить</button>
      `;
       card.querySelector(".delete-mod").addEventListener("click", async () => {
         if (!confirm(`Удалить модуль ${mod.en}?`)) return;
         await fetch(`/api/bf/modules/${mod.id}`, {
           method: "DELETE",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ initData: tg.initData }),
         });
         await bfLoadModulesList(weaponType, label);
       });
       grid.appendChild(card);
     });
   
     list.appendChild(group);
   }

     // === Обновляем селект категорий ===
// === Обновляем селект категорий ===
const categorySelect = document.getElementById("bf-mod-category-select");
if (categorySelect) {
  categorySelect.innerHTML = '<option value="">Выберите категорию...</option>';
  Object.keys(data).forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });

  const manualInput = document.getElementById("bf-mod-category");

   // ✅ Автоподстановка при выборе (только один раз)
   if (!categorySelect.dataset.bound) {
     categorySelect.dataset.bound = "true";
     categorySelect.addEventListener("change", (e) => {
       if (!manualInput) return;
       if (e.target.value) {
         manualInput.value = e.target.value; // при выборе — подставляем
         manualInput.style.opacity = "0.6";  // показываем, что связано
         manualInput.style.border = "";      // убираем рамку
       } else {
         manualInput.value = "";             // если вернулся на пустое — очищаем
         manualInput.style.opacity = "1";
         manualInput.style.border = "";      // убираем рамку
       }
     });
   }


  // ✅ Подсветка при ручном вводе новой категории
  if (manualInput) {
    manualInput.addEventListener("input", () => {
      const value = manualInput.value.trim();
      const isNew = value && ![...categorySelect.options].some(o => o.value === value);
      manualInput.style.border = isNew ? "1px solid #3a7bd5" : "";
      manualInput.style.opacity = "1";
    });
  }
}



    window.currentBFWeaponType = weaponType;
    bfShowScreen("screen-bf-modules-list");
  } catch (e) {
    console.error("BF modules list error:", e);
  }
}

// === Добавление модуля ===
document.getElementById("bf-mod-add-btn")?.addEventListener("click", async () => {
  const selectedCategory = document.getElementById("bf-mod-category-select").value.trim();
  const manualCategory = document.getElementById("bf-mod-category").value.trim();
  const category = manualCategory || selectedCategory;

  const payload = {
    initData: tg.initData,
    weapon_type: window.currentBFWeaponType,
    category,
    en: document.getElementById("bf-mod-en").value.trim()
  };

  if (!payload.category || !payload.en) {
    alert("Все поля обязательны для заполнения");
    return;
  }

  const resCheck = await fetch(`/api/bf/modules/${payload.weapon_type}`);
  const existing = await resCheck.json();
  const exists = Object.values(existing).some(list =>
    list.some(m => m.category === payload.category && m.en.toLowerCase() === payload.en.toLowerCase())
  );
  if (exists) {
    alert("Такой модуль уже существует!");
    return;
  }

  try {
    await fetch("/api/bf/modules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    ["bf-mod-category", "bf-mod-en"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("bf-mod-category-select").value = "";

    await bfLoadModulesList(payload.weapon_type, bfWeaponTypeLabels[payload.weapon_type]);
    await bfLoadModules(payload.weapon_type);
  } catch (e) {
    alert("Ошибка при добавлении модуля");
    console.error(e);
  }
});

/* ===============================
   🔸 Загрузка модулей для сборок
   =============================== */
async function bfLoadModules(type) {
  try {
    // Перед загрузкой очищаем старые данные
    delete bfModulesByType[type];

    const res = await fetch(`/api/bf/modules/${type}`);
    const byCategory = await res.json();
    const byKey = {};
    const flat = [];

    for (const cat in byCategory) {
      byCategory[cat].forEach((m) => {
        flat.push({ ...m, category: cat });
        byKey[m.en.toLowerCase()] = { en: m.en, category: cat };
      });
    }

    // Сохраняем только свежие данные
    bfModulesByType[type] = { byCategory, byKey, flat };

    console.log(`✅ Модули обновлены: ${type}`, bfModulesByType[type]);
  } catch (e) {
    console.error("Failed to load modules for", type, e);
  }
}


/* ===============================
   ⚙️  ДОБАВЛЕНИЕ / РЕДАКТИРОВАНИЕ СБОРКИ
   =============================== */

// === Кнопка "Добавить сборку" ===
document.getElementById("bf-add-build-btn")?.addEventListener("click", () => {
  bfCurrentEditId = null;
  bfHasUnsavedChanges = false; // Сбрасываем флаг изменений
  document.getElementById("bf-submit-build").textContent = "➕ Добавить сборку";

  // Очистка полей формы
  document.getElementById("bf-title").value = "";
  document.getElementById("bf-weapon-type").value = "";
  document.getElementById("bf-top1").value = "";
  document.getElementById("bf-top2").value = "";
  document.getElementById("bf-top3").value = "";
  document.getElementById("bf-build-date").value = new Date().toISOString().split("T")[0];
  document.getElementById("bf-tabs-container").innerHTML = "";

  // ✅ Сбрасываем все категории
  document.querySelectorAll(".bf-build-category").forEach(cb => cb.checked = false);

  bfShowScreen("screen-bf-form");
});


// Функция для отслеживания изменений в форме
function bfTrackFormChanges() {
  const formElements = [
    '#bf-title', '#bf-weapon-type', '#bf-top1', '#bf-top2', '#bf-top3', 
    '#bf-build-date', '.bf-build-category', '.tab-label', '.module-select'
  ];

  formElements.forEach(selector => {
    document.querySelectorAll(selector).forEach(element => {
      element.addEventListener('input', () => bfHasUnsavedChanges = true);
      element.addEventListener('change', () => bfHasUnsavedChanges = true);
    });
  });
}

// Инициализация отслеживания изменений при загрузке
document.addEventListener("DOMContentLoaded", () => {
  bfTrackFormChanges();
});



// === Добавление вкладки ===
document.getElementById("bf-add-tab")?.addEventListener("click", () => {
  const type = document.getElementById("bf-weapon-type").value;
  const mods = bfModulesByType[type];
  if (!mods) {
    alert("Сначала выберите тип оружия");
    document.getElementById("bf-weapon-type").focus();
    return;
  }

   const tabDiv = document.createElement("div");
   tabDiv.className = "tab-block";
   tabDiv.innerHTML = `
     <input type="text" class="tab-label form-input" placeholder="Название вкладки (например: Основные модули)">
     
     <!-- Основные модули -->
     <div class="mod-selects"></div>
     
     <!-- Универсальные модули -->
     <div class="universal-section">
       <div class="universal-fields"></div>
     </div>
   
     <!-- Кнопки управления -->
     <div class="tab-actions">
       <button type="button" class="btn add-universal">+ Поле</button>
       <button type="button" class="btn add-mod">+ Модуль</button>
       <button type="button" class="btn delete-tab">🗑 Удалить вкладку</button>
     </div>
   `;
   document.getElementById("bf-tabs-container").appendChild(tabDiv);

   // === Добавление универсального поля внутри вкладки ===
tabDiv.querySelector(".add-universal").addEventListener("click", () => {
  const container = tabDiv.querySelector(".universal-fields");
  const row = document.createElement("div");
  row.className = "universal-row";
  row.style = "display:flex; gap:8px; margin-top:6px;";
  row.innerHTML = `
     <div style="flex:1; position:relative; display:flex; gap:15px;">
       <select class="form-input universal-name">
         <option value="">Выберите категорию...</option>
         ${Object.keys(bfModulesByType[type]?.byCategory || {})
           .map(cat => `<option value="${cat}">${cat}</option>`)
           .join("")}
       </select>
       <input type="text" class="form-input universal-name-input" placeholder="Или введите вручную..." 
              style="width:100%;">
     </div>
     <input type="text" class="form-input universal-value" placeholder="Название модуля (например: 16.5'' FLUTED)" style="flex:1;">
     <button type="button" class="btn btn-sm btn-remove-universal" style="flex:0;">🗑</button>
   `;

   const select = row.querySelector(".universal-name");
   const input = row.querySelector(".universal-name-input");
   
   select.addEventListener("change", () => {
     if (select.value) {
       input.value = select.value;
       input.style.opacity = "0.6";
     } else {
       input.value = "";
       input.style.opacity = "1";
     }
   });
   
   input.addEventListener("input", () => {
     input.style.opacity = "1";
     select.value = "";
   });


  row.querySelector(".btn-remove-universal").addEventListener("click", () => row.remove());
  container.appendChild(row);
});



  // Добавляем первый модуль автоматически
  setTimeout(() => {
    bfAddModuleRow(tabDiv, type);
    bfSyncAllTabs(); // ✅ пересинхронизация всех вкладок
  }, 100);

  // Добавление ещё одного модуля
  tabDiv.querySelector(".add-mod").addEventListener("click", () => {
    bfAddModuleRow(tabDiv, type);
    bfSyncAllTabs();
  });

  // Удаление вкладки
  tabDiv.querySelector(".delete-tab").addEventListener("click", () => {
    if (confirm("Удалить эту вкладку?")) {
      tabDiv.remove();
      bfHasUnsavedChanges = true;
      bfSyncAllTabs();
    }
  });

  // Отслеживание изменений
  tabDiv.querySelector(".tab-label").addEventListener("input", () => bfHasUnsavedChanges = true);

  bfHasUnsavedChanges = true;
});


// === Глобальная функция пересинхронизации всех вкладок ===
function bfSyncAllTabs() {
  const type = document.getElementById("bf-weapon-type").value;
  const modsWrap = bfModulesByType[type];
  if (!modsWrap) return;

  document.querySelectorAll("#bf-tabs-container .tab-block").forEach(tabDiv => {
    const modRows = tabDiv.querySelectorAll(".mod-row");
    const selectedGlobal = Array.from(document.querySelectorAll(".module-select")).map(s => s.value);

    modRows.forEach(row => {
      const catSel = row.querySelector(".category-select");
      const modSel = row.querySelector(".module-select");
      const cat = catSel.value;
      const list = modsWrap.byCategory[cat] || [];
      const currentValue = modSel.value;

      modSel.innerHTML = "";

      list.forEach(m => {
        if (selectedGlobal.includes(m.en) && m.en !== currentValue) return;
        const opt = document.createElement("option");
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


// === При смене типа оружия ===
document.getElementById("bf-weapon-type")?.addEventListener("change", async (e) => {
  const type = e.target.value;
  if (!type) return;

  // Сброс вкладок при смене типа
  document.getElementById("bf-tabs-container").innerHTML = "";

  await bfLoadModules(type);
  console.log("✅ Модули загружены:", type);
});


function bfAddModuleRow(tabDiv, type) {
  const modsWrap = bfModulesByType[type];
  if (!modsWrap) return alert("Select weapon type first");

  const row = document.createElement('div');
  row.className = 'mod-row';

  const categorySelect = document.createElement('select');
  categorySelect.className = 'form-input category-select';

  const moduleSelect = document.createElement('select');
  moduleSelect.className = 'form-input module-select';

   // ✅ Добавляем только те категории, которых ещё нет во вкладке
   const usedCategories = Array.from(tabDiv.querySelectorAll('.category-select')).map(s => s.value);
   const availableCategories = Object.keys(modsWrap.byCategory).filter(cat => !usedCategories.includes(cat));
   
   if (availableCategories.length === 0) {
     alert("Все категории уже добавлены во вкладке");
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
    
    // Собираем ВСЕ выбранные модули во вкладке
    const selected = Array.from(tabDiv.querySelectorAll('.module-select')).map(s => s.value);

    const currentValue = moduleSelect.value;
    moduleSelect.innerHTML = '';

    list.forEach(m => {
      // Модуль доступен если: он текущий выбранный ИЛИ не выбран в других селектах
      if (selected.includes(m.en) && m.en !== currentValue) return;
      
      const opt = document.createElement('option');
      opt.value = m.en;
      opt.textContent = m.en;
      moduleSelect.appendChild(opt);
    });

    if (!moduleSelect.value && moduleSelect.options.length) {
      moduleSelect.value = moduleSelect.options[0].value;
    }
  }

  function syncAllModuleSelects() {
    // Собираем ВСЕ выбранные модули во вкладке
    const selected = Array.from(tabDiv.querySelectorAll('.module-select')).map(s => s.value);

    tabDiv.querySelectorAll('.mod-row').forEach(r => {
      const catSel = r.querySelector('.category-select');
      const modSel = r.querySelector('.module-select');
      const cat = catSel.value;
      const list = modsWrap.byCategory[cat] || [];
      const currentValue = modSel.value;

      modSel.innerHTML = '';
      
      list.forEach(m => {
        // Тот же принцип: текущий выбранный ИЛИ не выбран в других
        if (selected.includes(m.en) && m.en !== currentValue) return;
        
        const opt = document.createElement('option');
        opt.value = m.en;
        opt.textContent = m.en;
        modSel.appendChild(opt);
      });

      // Восстанавливаем выбор
      if ([...modSel.options].some(o => o.value === currentValue)) {
        modSel.value = currentValue;
      } else if (modSel.options.length) {
        modSel.value = modSel.options[0].value;
      }
    });
  }

  categorySelect.addEventListener('change', () => { 
    refreshModuleOptions(); 
    syncAllModuleSelects(); 
  });
  
  moduleSelect.addEventListener('change', syncAllModuleSelects);

  // Первичная инициализация
  refreshModuleOptions();
  syncAllModuleSelects();
}

/* ===============================
   💾 СОХРАНЕНИЕ СБОРКИ
   =============================== */
document.getElementById("bf-submit-build")?.addEventListener("click", bfHandleSubmitBuild);

async function bfHandleSubmitBuild() {
  const title = document.getElementById("bf-title").value.trim();
  const weapon_type = document.getElementById("bf-weapon-type").value;
  const date = document.getElementById("bf-build-date").value;
  const top1 = document.getElementById("bf-top1").value.trim();
  const top2 = document.getElementById("bf-top2").value.trim();
  const top3 = document.getElementById("bf-top3").value.trim();

  // категории
  const selectedCategories = Array.from(document.querySelectorAll(".bf-build-category:checked")).map(
    (cb) => cb.value
  );

   const tabs = Array.from(document.querySelectorAll("#bf-tabs-container .tab-block")).map((tab) => {
     const label = tab.querySelector(".tab-label").value.trim();
     const items = Array.from(tab.querySelectorAll(".module-select")).map((s) => s.value);
   
     // 🔹 Собираем универсальные поля этой вкладки
     const universal = Array.from(tab.querySelectorAll(".universal-row")).map(row => ({
       name: row.querySelector(".universal-name").value.trim(),
       value: row.querySelector(".universal-value").value.trim(),
     })).filter(u => u.name && u.value);
   
     return { label, items, universal };
   });


  const data = {
    initData: tg.initData,
    title,
    weapon_type,
    date,
    top1,
    top2,
    top3,
    tabs,
    categories: selectedCategories,
  };

  const method = bfCurrentEditId ? "PUT" : "POST";
  const url = bfCurrentEditId ? `/api/bf/builds/${bfCurrentEditId}` : "/api/bf/builds";

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }

    alert(bfCurrentEditId ? "Сборка обновлена!" : "Сборка добавлена!");
    bfHasUnsavedChanges = false; // Сбрасываем флаг после успешного сохранения
    bfShowScreen("screen-bf-edit-builds");
    await bfLoadBuildsTable();
    bfCurrentEditId = null;
  } catch (e) {
    console.error("Save build error:", e);
    alert("Error saving build");
  }
}

// Обработчик кнопки "Назад" на форме
document.getElementById("bf-back-from-form")?.addEventListener("click", () => {
  if (bfHasUnsavedChanges) {
    if (!confirm("У вас есть несохраненные изменения. Продолжить без сохранения?")) {
      return;
    }
  }
  bfHasUnsavedChanges = false;
  bfShowScreen("screen-battlefield-main");
});

/* ===============================
   📥 РЕДАКТИРОВАНИЕ СБОРКИ
   =============================== */
async function bfEditBuild(build) {
  bfCurrentEditId = build.id;
  bfShowScreen("screen-bf-form");
  document.getElementById("bf-submit-build").textContent = "💾 Сохранить изм";

  document.getElementById("bf-title").value = build.title || "";
  document.getElementById("bf-weapon-type").value = build.weapon_type || "";
  document.getElementById("bf-top1").value = build.top1 || "";
  document.getElementById("bf-top2").value = build.top2 || "";
  document.getElementById("bf-top3").value = build.top3 || "";
  document.getElementById("bf-build-date").value = build.date || new Date().toISOString().split("T")[0];

  const container = document.getElementById("bf-tabs-container");
  container.innerHTML = "";

  await bfLoadModules(build.weapon_type);

   // ✅ Восстанавливаем категории (галочки)
   document.querySelectorAll(".bf-build-category").forEach(cb => {
     cb.checked = Array.isArray(build.categories)
       ? build.categories.includes(cb.value)
       : false;
   });

  if (Array.isArray(build.tabs)) {
    build.tabs.forEach((tab) => {
      const tabDiv = document.createElement("div");
      tabDiv.className = "tab-block";
      tabDiv.innerHTML = `
        <input type="text" class="tab-label form-input" value="${tab.label}" placeholder="Название вкладки (5 модулей)">
        
        <!-- Основные модули -->
        <div class="mod-selects"></div>
      
        <!-- Универсальные модули -->
          <div class="universal-fields"></div>
        </div>
      
        <!-- Кнопки управления -->
        <div class="tab-actions">
          <button type="button" class="btn add-universal">+ Поле</button>
          <button type="button" class="btn add-mod">+ Модуль</button>
          <button type="button" class="btn delete-tab">🗑 Удалить вкладку</button>
        </div>
      `;

       tabDiv.querySelector(".add-universal").addEventListener("click", () => {
        const container = tabDiv.querySelector(".universal-fields");
        const row = document.createElement("div");
        row.className = "universal-row";
        row.style = "display:flex; gap:8px; margin-top:6px;";
        row.innerHTML = `
          <input type="text" class="form-input universal-name" placeholder="Категория (например: Barrel)" style="flex:1;">
          <input type="text" class="form-input universal-value" placeholder="Название модуля (например: 16.5'' FLUTED)" style="flex:1;">
          <button type="button" class="btn btn-sm btn-remove-universal" style="flex:0;">🗑</button>
        `;
        row.querySelector(".btn-remove-universal").addEventListener("click", () => row.remove());
        container.appendChild(row);
      });


      container.appendChild(tabDiv);

      tabDiv.querySelector(".add-mod").addEventListener("click", () =>
        bfAddModuleRow(tabDiv, build.weapon_type)
      );
      tabDiv.querySelector(".delete-tab").addEventListener("click", () => tabDiv.remove());

      tab.items.forEach((modKey) => {
        const modsWrap = bfModulesByType[build.weapon_type];
        const found = Object.entries(modsWrap.byCategory).find(([cat, list]) =>
          list.some((m) => m.en === modKey)
        );
        if (found) {
          const [cat] = found;
          const row = document.createElement("div");
          row.className = "mod-row";

          const catSel = document.createElement("select");
          catSel.className = "form-input category-select";
          Object.keys(modsWrap.byCategory).forEach((c) => {
            const opt = document.createElement("option");
            opt.value = c;
            opt.textContent = c;
            if (c === cat) opt.selected = true;
            catSel.appendChild(opt);
          });

          const modSel = document.createElement("select");
          modSel.className = "form-input module-select";
          modsWrap.byCategory[cat].forEach((m) => {
            const opt = document.createElement("option");
            opt.value = m.en;
            opt.textContent = m.en;
            if (m.en === modKey) opt.selected = true;
            modSel.appendChild(opt);
          });

          row.appendChild(catSel);
          row.appendChild(modSel);
          tabDiv.querySelector(".mod-selects").appendChild(row);
        }
      });

       // === Восстановление универсальных модулей ===
         const univContainer = tabDiv.querySelector(".universal-fields");
         if (Array.isArray(tab.universal)) {
           tab.universal.forEach(u => {
             const row = document.createElement("div");
             row.className = "universal-row";
             row.style = "display:flex; gap:8px; margin-top:6px;";
             row.innerHTML = `
               <input type="text" class="form-input universal-name" value="${u.name}" placeholder="Категория">
               <input type="text" class="form-input universal-value" value="${u.value}" placeholder="Название модуля">
               <button type="button" class="btn btn-sm btn-remove-universal">🗑</button>
             `;
             row.querySelector(".btn-remove-universal").addEventListener("click", () => row.remove());
             univContainer.appendChild(row);
           });
         }

       
    });
  }
}

/* ===============================
   📦 ЗАГРУЗКА И ОТОБРАЖЕНИЕ СБОРОК
   =============================== */

// Кнопка "Все сборки"
document.getElementById("bf-show-builds-btn")?.addEventListener("click", async () => {
  bfShowScreen("screen-bf-builds");
  await bfLoadBuilds();
});

// Кнопка "База сборок" (админ)
document.getElementById("bf-weapons-db-btn")?.addEventListener("click", async () => {
  bfShowScreen("screen-bf-edit-builds");
  await bfLoadBuildsTable();
});

// Назад со списка сборок
document.getElementById("bf-back-from-builds")?.addEventListener("click", () =>
  bfShowScreen("screen-battlefield-main")
);

// Назад из базы
document.getElementById("bf-back-from-edit")?.addEventListener("click", () =>
  bfShowScreen("screen-battlefield-main")
);

// === Загрузка сборок для пользователей ===
async function bfLoadBuilds() {
  try {
    const res = await fetch("/api/bf/builds");
    bfCachedBuilds = await res.json();
    await bfRenderBuilds(bfCachedBuilds);
  } catch (e) {
    console.error("BF load builds error:", e);
  }
}

// === Отображение сборок (аккордеон) ===
// === Отображение сборок (аккордеон в стиле Warzone) ===
async function bfRenderBuilds(builds) {
  const list = document.getElementById("bf-builds-list");
  // const countEl = document.getElementById("bf-user-builds-count");
  const noResults = document.getElementById("bf-no-results-message");

  if (!list) return;
  list.innerHTML = "";
  
  // countEl.textContent = `Всего сборок: ${ builds.length}`;
  noResults.style.display = builds.length ? "none" : "block";

  if (!Array.isArray(builds) || builds.length === 0) {
    list.innerHTML = '<p class="no-results">🔍 Сборок пока нет</p>';
    return;
  }
     // Загружаем модули для всех типов оружия (ожидаем завершения)
   const uniqueTypes = [...new Set(builds.map(b => b.weapon_type))];
   await Promise.all(uniqueTypes.map(t => bfLoadModules(t)));

  // Сортировка по приоритету как в Warzone
  function prioritySort(a, b) {
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

    if (pa !== pb) return pa - pb;

          // 🔢 Сортировка по числу из топа (например "#1", "#2", "#3")
     function extractTopNum(build) {
       const tops = [build.top1, build.top2, build.top3]
         .map(t => {
           const match = String(t || '').match(/#?(\d+)/);
           return match ? parseInt(match[1], 10) : Infinity;
         })
         .filter(n => !isNaN(n));
       return tops.length ? Math.min(...tops) : Infinity;
     }
   
     const na = extractTopNum(a);
     const nb = extractTopNum(b);
   
     if (na !== nb) return na - nb; // сортируем по возрастанию #1, #2, #3 и т.д.


    const getTime = (build) => {
      let t = build.created_at ? Date.parse(build.created_at) : NaN;
      if (Number.isNaN(t)) {
        const [dd, mm, yyyy] = String(build.date || '').split('.');
        if (dd && mm && yyyy) {
          t = new Date(Number(yyyy), Number(mm) - 1, Number(dd)).getTime();
        }
      }
      return t || 0;
    };

    const ta = getTime(a);
    const tb = getTime(b);
    return tb - ta;
  }

  const sorted = [...builds].sort(prioritySort);
  bfCachedBuilds = sorted;

  // Группировка по категориям
  const groups = {
    "Новинки": [],
    "Топ мета": [],
    "Мета": [],
    "Остальное": []
  };
  
  sorted.forEach(b => {
    const cats = (b.categories || []).map(c => c.toLowerCase());
    if (cats.includes("new") || cats.includes("новинки")) groups["Новинки"].push(b);
    else if (cats.includes("topmeta") || cats.includes("топ мета")) groups["Топ мета"].push(b);
    else if (cats.includes("meta") || cats.includes("мета")) groups["Мета"].push(b);
    else groups["Остальное"].push(b);
  });
  
  const order = ["Новинки", "Топ мета", "Мета", "Остальное"];
  
  // === Рендер с разделителями ===
  order.forEach((groupName, groupIndex) => {
    const buildsInGroup = groups[groupName];
    if (buildsInGroup.length === 0) return;
  
    // Добавляем разделитель (но не перед первой группой)
    if (groupIndex > 0) {
      const divider = document.createElement('div');
      divider.className = 'bf-category-divider';
      list.appendChild(divider);
    }
  
    // Рендер карточек сборок
    buildsInGroup.forEach((build, buildIndex) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'bf-loadout js-loadout';

      const weaponTypeRu = bfWeaponTypeLabels[build.weapon_type] || build.weapon_type;

      // 🔥 Цвета топ-модулей как в Warzone
      const pickTopBg = (text) => {
        const m = String(text).trim().match(/^#?(\d+)/);
        const n = m ? parseInt(m[1], 10) : 0;
      
        switch (n) {
          case 1:
            return 'linear-gradient(135deg, #d4af37, #f6e27a)'; // золото
          case 2:
            return 'linear-gradient(135deg, #9ea7b8, #d3d8e8)'; // серебро с холодным оттенком
          case 3:
            return 'linear-gradient(135deg, #b87333, #e0a96d)'; // бронза мягкая
          default:
            return 'linear-gradient(135deg, #1e2835, #2a3546)'; // серо-синий фон по умолчанию
        }
      };

         const tops = [build.top1, build.top2, build.top3]
           .filter(Boolean)
           .map(mod => {
             const text = mod.trim();
             const match = text.match(/^#?(\d+)/);
             const n = match ? parseInt(match[1], 10) : 0;
             let cls = "bf-top-default";
             if (n === 1) cls = "bf-top-1";
             else if (n === 2) cls = "bf-top-2";
             else if (n === 3) cls = "bf-top-3";
             return `<span class="bf-top ${cls}">${text}</span>`;
           })
           .join('');


      const cats = Array.isArray(build.categories) ? build.categories : [];
      
      // 🎨 Цвета категорий как в Warzone (один в один)
      const categoryBadges = cats.map(cat => {
        const categoryName = String(cat).toLowerCase();
        let bg = '#2a2f36';   // фон по умолчанию
        let text = '#fff';    // цвет текста
        let label = '';
      
         switch (categoryName) {
           case 'new':
           case 'новинка':
           case 'новинки':
             bg = 'linear-gradient(135deg, #4f46e5, #3b82f6)'; // 💜 фиолетово-синий, выразительный
             text = '#ffffff';
             label = 'Новинка';
             break;
         
           case 'topmeta':
           case 'топ мета':
             bg = 'linear-gradient(135deg, #00b4db, #0083b0)'; // 💠 яркий голубой
             text = '#ffffff';
             label = 'Топ мета';
             break;
         
           case 'meta':
           case 'мета':
             bg = 'linear-gradient(135deg, #2e8b57, #00b894)'; // 🍃 зелёный
             text = '#eafff6';
             label = 'Мета';
             break;
         
           case 'popular':
           case 'популярное':
             bg = 'linear-gradient(135deg, #485563, #2b5876)'; // ⚙️ серо-синий
             text = '#ffffff';
             label = 'Популярное';
             break;
         
           default:
             bg = 'linear-gradient(135deg, #232a33, #1b1f25)'; // дефолт — тёмно-серый
             text = '#ccc';
             label = cat;
         }


      
        return `
          <span class="bf-badge" style="
            background: ${bg};
            color: ${text};
          ">
            ${label}
          </span>
        `;
      }).join('');


      // Безопасный парсинг вкладок
      let tabs = [];
      try {
        tabs = typeof build.tabs === "string" ? JSON.parse(build.tabs) : (build.tabs || []);
      } catch {
        tabs = [];
      }

      // 🔥 Форматирование даты в DD.MM.YYYY
      const formatDate = (dateStr) => {
        if (!dateStr) return '';
        // Если дата уже в формате DD.MM.YYYY
        if (dateStr.includes('.')) return dateStr;
        
        // Если дата в формате YYYY-MM-DD
        if (dateStr.includes('-')) {
          const [year, month, day] = dateStr.split('-');
          return `${day}.${month}.${year}`;
        }
        
        return dateStr;
      };

      // Вкладки
      const tabBtns = tabs.map((tab, i) =>
        `<button class="bf-tab-btn ${i === 0 ? 'is-active' : ''}" data-tab="bf-${groupIndex}-${buildIndex}-${i}">
           ${tab.label || "Вкладка"}
         </button>`
      ).join('');
      
      const tabContents = tabs.map((tab, i) => `
        <div class="bf-tab-content ${i === 0 ? 'is-active' : ''}" data-tab-content="bf-${groupIndex}-${buildIndex}-${i}">
          <div class="bf-modules">
            ${[...(tab.items || []), ...(tab.universal || []).map(u => `${u.name}|${u.value}`)]
              .map(entry => {
                // === Обычные модули из справочника ===
                if (typeof entry === "string" && !entry.includes("|")) {
                  const modsWrap = bfModulesByType[build.weapon_type];
                  const modKey = String(entry).toLowerCase().trim();
                  const mod = modsWrap?.flat?.find(m => m.en.toLowerCase() === modKey);
                  const slot = mod?.category || "—";
                  const name = mod?.en || entry;
                  return `
                    <div class="bf-module">
                      <span class="bf-module-slot">${slot}</span>
                      <span class="bf-module-name">${name}</span>
                    </div>
                  `;
                }
      
                // === Универсальные модули (Barrel | 16.5'' FLUTED) ===
                const [slot, name] = entry.split("|");
                return `
                  <div class="bf-module">
                    <span class="bf-module-slot">${slot}</span>
                    <span class="bf-module-name">${name}</span>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `).join('');


      
      wrapper.innerHTML = `
        <div class="bf-loadout__header js-loadout-toggle">
          <div class="bf-loadout__header-top">
            <button class="bf-toggle-icon" type="button"><i class="fa-solid fa-chevron-down"></i></button>
            <h3 class="bf-loadout__title">${build.title}</h3>
            <span class="bf-loadout__date">${formatDate(build.date)}</span>
          </div>
          <div class="bf-loadout__meta">
            <div class="bf-tops">${tops}</div>
            <div class="bf-categories">${categoryBadges}</div>
            <div class="bf-type" style="
              background: rgba(58,123,213,0.15);
              border: 1px solid rgba(58,123,213,0.3);
              padding: 3px 10px;
              border-radius: 8px;
              font-size: 0.85rem;
              color: #9cc9ff;
              text-transform: capitalize;
            ">
              ${weaponTypeRu}
            </div>

          </div>
        </div>
        <div class="bf-loadout__content" style="max-height: 0; overflow: hidden;">
          <div class="bf-loadout__inner">
            <div class="bf-tabs">
              <div class="bf-tab-buttons">${tabBtns}</div>
              <div class="bf-tab-contents">${tabContents}</div>
            </div>
          </div>
        </div>
      `;

      list.appendChild(wrapper);
    });
  });

  // Сброс раскрытия
  document.querySelectorAll('.js-loadout').forEach(el => {
    el.classList.remove('is-open');
    const content = el.querySelector('.bf-loadout__content');
    if (content) content.style.maxHeight = '0';
  });

  // === Переключение вкладок ===
  document.querySelectorAll('.bf-tab-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const parent = button.closest('.bf-loadout');
      const tab = button.dataset.tab;

      parent.querySelectorAll('.bf-tab-btn').forEach(b => b.classList.remove('is-active'));
      parent.querySelectorAll('.bf-tab-content').forEach(c => c.classList.remove('is-active'));
      button.classList.add('is-active');
      parent.querySelector(`[data-tab-content="${tab}"]`)?.classList.add('is-active');

      const content = parent.querySelector('.bf-loadout__content');
      content.style.maxHeight = content.scrollHeight + 'px';
    });
  });

  // === Просмотр сборки (аккордеон) ===
  document.querySelectorAll('.js-loadout-toggle').forEach(header => {
    header.addEventListener('click', () => {
      const loadout = header.closest('.js-loadout');
      const content = loadout.querySelector('.bf-loadout__content');
      loadout.classList.toggle('is-open');
      content.style.maxHeight = loadout.classList.contains('is-open') ? content.scrollHeight + 'px' : '0';
    });
  });
}

/* ===============================
   🧩 ФИЛЬТРЫ И ПОИСК
   =============================== */
document.getElementById("bf-category-filter")?.addEventListener("change", () => {
  bfFilterBuilds();
});

document.getElementById("bf-weapon-filter")?.addEventListener("change", () => {
  bfFilterBuilds();
});

document.getElementById("bf-builds-search")?.addEventListener("input", () => {
  bfFilterBuilds();
});

function bfFilterBuilds() {
  const cat = document.getElementById("bf-category-filter").value;
  const type = document.getElementById("bf-weapon-filter").value;
  const q = document.getElementById("bf-builds-search").value.toLowerCase();

  let filtered = bfCachedBuilds;

  if (cat !== "all") {
    filtered = filtered.filter((b) => (b.categories || []).includes(cat));
  }

  if (type !== "all") {
    filtered = filtered.filter((b) => b.weapon_type === type);
  }

  if (q) {
    filtered = filtered.filter((b) => {
      const text =
        (b.title || "") +
        (b.top1 || "") +
        (b.top2 || "") +
        (b.top3 || "") +
        JSON.stringify(b.tabs || []);
      return text.toLowerCase().includes(q);
    });
  }

  bfRenderBuilds(filtered);
}

/* ===============================
   📦 ОБНОВЛЕННАЯ ФУНКЦИЯ ЗАГРУЗКИ БАЗЫ СБОРОК
   =============================== */

async function bfLoadBuildsTable() {
  try {
    const res = await fetch("/api/bf/builds");
    const builds = await res.json();
    const grid = document.getElementById("bf-edit-builds-grid");
    const countEl = document.getElementById("bf-builds-count");

    grid.innerHTML = "";
    countEl.textContent = `Всего: ${builds.length} сборок`;

    if (!builds.length) {
      grid.innerHTML = `<p style="text-align:center;opacity:0.7;color:#8fa3bf;padding:40px;">Сборок пока нет</p>`;
      return;
    }

    // Загружаем типы оружия для фильтра
    await bfLoadWeaponTypesForFilter();

    builds.forEach((b) => {
      const weaponLabel = bfWeaponTypeLabels[b.weapon_type] || b.weapon_type;

      // Категории с классами для стилизации
      const cats = Array.isArray(b.categories)
        ? b.categories
            .map((c) => {
              const cat = String(c).toLowerCase();
              let className = 'bf-cat';
              let label = c;

              if (["новинки", "new"].includes(cat)) {
                className += ' bf-cat-new';
                label = "Новинки";
              } else if (["топ мета", "topmeta"].includes(cat)) {
                className += ' bf-cat-topmeta';
                label = "Топ Мета";
              } else if (["мета", "meta"].includes(cat)) {
                className += ' bf-cat-meta';
                label = "Мета";
              } else if (["популярное", "popular"].includes(cat)) {
                className += ' bf-cat-popular';
                label = "Популярное";
              } else if (["новички", "beginner"].includes(cat)) {
                className += ' bf-cat-beginner';
                label = "Новички";
              } else {
                className += ' bf-cat-default';
              }

              return `<span class="${className}">${label}</span>`;
            })
            .join("")
        : "";

      const card = document.createElement("div");
      card.className = "bf-build-card";
      card.setAttribute('data-weapon-type', b.weapon_type);
      card.setAttribute('data-title', b.title.toLowerCase());
      
      card.innerHTML = `
        <div class="bf-card-header">
          <h3>${b.title}</h3>
        </div>
    
        <div class="bf-categories">
          ${cats}
        </div>
        
        <div class="bf-weapon-type">
          ${weaponLabel}
        </div>
        
        <div class="bf-card-footer">
          <button class="btn btn-edit" title="Редактировать">✏</button>
          <button class="btn btn-delete" title="Удалить">🗑</button>
        </div>
      `;

      // Редактирование
      card.querySelector(".btn-edit").addEventListener("click", (e) => {
        e.stopPropagation();
        bfEditBuild(b);
      });

      // Удаление
      card.querySelector(".btn-delete").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(`Удалить сборку "${b.title}"?`)) return;
        try {
          await fetch(`/api/bf/builds/${b.id}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData: tg.initData }),
          });
          await bfLoadBuildsTable();
        } catch (error) {
          console.error("Delete build error:", error);
          alert("Ошибка при удалении сборки");
        }
      });

      grid.appendChild(card);
    });

    // Инициализация фильтров
    bfInitEditBuildsFilters();

  } catch (e) {
    console.error("BF builds table load error:", e);
    const grid = document.getElementById("bf-edit-builds-grid");
    grid.innerHTML = `<p style="text-align:center;color:#dc3545;padding:40px;">Ошибка загрузки сборок</p>`;
  }
}
/* ===============================
   🎯 ФИЛЬТРЫ ДЛЯ БАЗЫ СБОРОК (ТОЛЬКО ТИПЫ И ПОИСК)
   =============================== */

async function bfLoadWeaponTypesForFilter() {
  try {
    const res = await fetch("/data/types-bf.json");
    const types = await res.json();
    const select = document.getElementById("bf-edit-type-filter");
    if (!select) return;

    // Очищаем и добавляем опции
    select.innerHTML = '<option value="all">Все</option>';
    types.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.key;
      opt.textContent = t.label;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load weapon types for filter:", err);
  }
}

function bfInitEditBuildsFilters() {
  const typeFilter = document.getElementById('bf-edit-type-filter');
  const searchInput = document.getElementById('bf-edit-search');
  
  if (typeFilter) {
    typeFilter.addEventListener('change', bfFilterEditBuilds);
  }
  if (searchInput) {
    searchInput.addEventListener('input', bfFilterEditBuilds);
  }

  // Применяем фильтры сразу после загрузки
  setTimeout(bfFilterEditBuilds, 100);
}

function bfFilterEditBuilds() {
  const typeFilter = document.getElementById('bf-edit-type-filter')?.value || 'all';
  const searchQuery = document.getElementById('bf-edit-search')?.value.toLowerCase() || '';
  
  const cards = document.querySelectorAll('.bf-build-card');
  let visibleCount = 0;
  
  cards.forEach(card => {
    const weaponType = card.getAttribute('data-weapon-type') || '';
    const title = card.getAttribute('data-title') || '';
    
    const typeMatch = typeFilter === 'all' || weaponType === typeFilter;
    const searchMatch = searchQuery === '' || title.includes(searchQuery);
    
    const isVisible = typeMatch && searchMatch;
    card.style.display = isVisible ? 'block' : 'none';
    
    if (isVisible) visibleCount++;
  });
  
  // Обновляем счетчик
  const countEl = document.getElementById('bf-builds-count');
  if (countEl) {
    countEl.textContent = `Показано: ${visibleCount} из ${cards.length} сборок`;
  }
}

// Инициализация при загрузке
document.addEventListener("DOMContentLoaded", () => {
  // Уже есть в основном коде
});
/* ===============================
   🎨 ТЕМА
   =============================== */
(function bfApplyTheme() {
  const root = document.documentElement;
  root.style.setProperty("--bf-bg", "#101821");
  root.style.setProperty("--bf-card", "#15202c");
  root.style.setProperty("--bf-text", "#e0e6ee");
  root.style.setProperty("--bf-accent", "#3a7bd5");
})();

/* ===============================
   ✅ ГОТОВО
   =============================== */
console.log("✅ Battlefield builds module initialized");

})();
