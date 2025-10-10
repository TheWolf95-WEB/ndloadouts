/* ===========================
   ⚔️ BATTLEFIELD BUILDS SCRIPT
   =========================== */
tg = window.Telegram.WebApp;
tg.expand();


// === Ensure global showScreen exists ===
if (typeof window.showScreen === "undefined") {
  window.showScreen = function (id) {
    document.querySelectorAll(".screen").forEach((s) => {
      s.style.display = s.id === id ? "block" : "none";
      s.classList.toggle("active", s.id === id);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
}


const bfUser = tg.initDataUnsafe?.user || {};
let bfUserInfo = null;

const bfModulesByType = {};
const bfWeaponTypeLabels = {};
let bfCachedBuilds = [];
let bfCurrentEditId = null;
let bfScreenHistory = [];

// === Инициализация ===
// === Инициализация ===
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Загружаем типы, но не открываем экран
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
      group.innerHTML = `<h4>${category}</h4>`;

      data[category].forEach((mod) => {
        const row = document.createElement("div");
        row.className = "module-row";
        row.innerHTML = `
          <span>${mod.en}</span>
          <button class="btn btn-sm" data-id="${mod.id}">🗑</button>
        `;
        row.querySelector("button").addEventListener("click", async () => {
          if (!confirm(`Delete module ${mod.en}?`)) return;
          await fetch(`/api/bf/modules/${mod.id}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData: tg.initData }),
          });
          await bfLoadModulesList(weaponType, label);
        });
        group.appendChild(row);
      });

      list.appendChild(group);
    }

    window.currentBFWeaponType = weaponType;
    bfShowScreen("screen-bf-modules-list");
  } catch (e) {
    console.error("BF modules list error:", e);
  }
}

// Добавление модуля
document.getElementById("bf-mod-add-btn")?.addEventListener("click", async () => {
  const payload = {
    initData: tg.initData,
    weapon_type: window.currentBFWeaponType,
    category: document.getElementById("bf-mod-category").value.trim(),
    en: document.getElementById("bf-mod-en").value.trim(),
    pos: parseInt(document.getElementById("bf-mod-pos").value) || 0,
  };

  if (!payload.category || !payload.en) {
    alert("All fields are required");
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

    ["bf-mod-category", "bf-mod-en", "bf-mod-pos"].forEach(
      (id) => (document.getElementById(id).value = "")
    );

    await bfLoadModulesList(payload.weapon_type, bfWeaponTypeLabels[payload.weapon_type]);
    await bfLoadModules(payload.weapon_type);
  } catch (e) {
    alert("Error while adding module");
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
  document.getElementById("bf-submit-build").textContent = "➕ Добавить сборку";

  // Очистка полей формы
  document.getElementById("bf-title").value = "";
  document.getElementById("bf-weapon-type").value = "";
  document.getElementById("bf-top1").value = "";
  document.getElementById("bf-top2").value = "";
  document.getElementById("bf-top3").value = "";
  document.getElementById("bf-build-date").value = new Date().toISOString().split("T")[0];
  document.getElementById("bf-tabs-container").innerHTML = "";

  bfShowScreen("screen-bf-form");
});



// === Добавление вкладки ===
document.getElementById("bf-add-tab")?.addEventListener("click", () => {
  const type = document.getElementById("bf-weapon-type").value;
  const mods = bfModulesByType[type];
  if (!mods) {
    alert("Выберите тип оружия");
    return;
  }

  const tabDiv = document.createElement("div");
  tabDiv.className = "tab-block";
  tabDiv.innerHTML = `
    <input type="text" class="tab-label" placeholder="Название вкладки" style="margin-bottom: 10px;">
    <div class="mod-selects"></div>
    <div class="tab-actions">
      <button type="button" class="btn add-mod">+ Модуль</button>
      <button type="button" class="btn delete-tab">🗑 Удалить вкладку</button>
    </div>
  `;
  document.getElementById("bf-tabs-container").appendChild(tabDiv);

  tabDiv.querySelector(".add-mod").addEventListener("click", () => bfAddModuleRow(tabDiv, type));
  tabDiv.querySelector(".delete-tab").addEventListener("click", () => tabDiv.remove());
});

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

  // 🔥 УБИРАЕМ ограничение - добавляем ВСЕ категории всегда
  Object.keys(modsWrap.byCategory).forEach(cat => {
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
    return { label, items };
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
    bfShowScreen("screen-bf-edit-builds");
    await bfLoadBuildsTable();
    bfCurrentEditId = null;
  } catch (e) {
    console.error("Save build error:", e);
    alert("Error saving build");
  }
}

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

  if (Array.isArray(build.tabs)) {
    build.tabs.forEach((tab) => {
      const tabDiv = document.createElement("div");
      tabDiv.className = "tab-block";
      tabDiv.innerHTML = `
        <input type="text" class="tab-label" value="${tab.label}" style="margin-bottom: 10px;">
        <div class="mod-selects"></div>
        <div class="tab-actions">
          <button type="button" class="btn add-mod">+ Модуль</button>
          <button type="button" class="btn delete-tab">🗑 Удалить</button>
        </div>
      `;
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
    bfRenderBuilds(bfCachedBuilds);
  } catch (e) {
    console.error("BF load builds error:", e);
  }
}

// === Отображение сборок (аккордеон) ===
// === Отображение сборок (аккордеон в стиле Warzone) ===
function bfRenderBuilds(builds) {
  const list = document.getElementById("bf-builds-list");
  const countEl = document.getElementById("bf-user-builds-count");
  const noResults = document.getElementById("bf-no-results-message");

  if (!list) return;
  list.innerHTML = "";
  
  countEl.textContent = `Всего сборок: ${builds.length}`;
  noResults.style.display = builds.length ? "none" : "block";

  if (!Array.isArray(builds) || builds.length === 0) {
    list.innerHTML = '<p class="no-results">🔍 Сборок пока нет</p>';
    return;
  }

  // Загружаем модули для всех типов оружия
  const uniqueTypes = [...new Set(builds.map(b => b.weapon_type))];
  uniqueTypes.forEach(t => bfLoadModules(t));

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

      const pickTopBg = (text) => {
        const m = String(text).trim().match(/^#?(\d+)/);
        const n = m ? parseInt(m[1], 10) : 0;
        if (n === 1) return '#b8a326';
        if (n === 2) return '#B0B0B0';
        if (n === 3) return '#FF8C00';
        return '#2f3336';
      };

      const tops = [build.top1, build.top2, build.top3]
        .filter(Boolean)
        .map(mod => {
          const text = mod.trim();
          const bg = pickTopBg(text);
          return `<span class="bf-top" style="background:${bg}">${text}</span>`;
        })
        .join('');

      const cats = Array.isArray(build.categories) ? build.categories : [];
      const translatedCats = cats.map(cat => {
        switch (String(cat).toLowerCase()) {
          case 'all': return 'Все';
          case 'new': return 'Новинка';
          case 'popular': return 'Популярное';
          case 'meta': return 'Мета';
          case 'topmeta': return 'Топ мета';
          default: return cat;
        }
      });

      const categoryBadges = translatedCats
        .map(name => `<span class="bf-badge" data-cat="${name}">${name}</span>`)
        .join('');

      // Безопасный парсинг вкладок
      let tabs = [];
      try {
        tabs = typeof build.tabs === "string" ? JSON.parse(build.tabs) : (build.tabs || []);
      } catch {
        tabs = [];
      }

      // Вкладки
      const tabBtns = tabs.map((tab, i) =>
        `<button class="bf-tab-btn ${i === 0 ? 'is-active' : ''}" data-tab="bf-${groupIndex}-${buildIndex}-${i}">
           ${tab.label || "Вкладка"}
         </button>`
      ).join('');
      
      const tabContents = tabs.map((tab, i) => `
        <div class="bf-tab-content ${i === 0 ? 'is-active' : ''}" data-tab-content="bf-${groupIndex}-${buildIndex}-${i}">
          <div class="bf-modules">
            ${(tab.items || []).map(itemKey => {
              const mods = bfModulesByType[build.weapon_type];
              const norm = s => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
              const mod = mods?.byKey?.[itemKey] || mods?.byKey?.[norm(itemKey)] || null;
              const slot = mod?.category || '—';
              const name = mod?.en || itemKey;
              return `
                <div class="bf-module">
                  <span class="bf-module-slot">${slot}</span>
                  <span class="bf-module-name">${name}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('');
      
      wrapper.innerHTML = `
        <div class="bf-loadout__header js-loadout-toggle">
          <div class="bf-loadout__header-top">
            <button class="bf-toggle-icon" type="button"><i class="fa-solid fa-chevron-down"></i></button>
            <h3 class="bf-loadout__title">${build.title}</h3>
            <span class="bf-loadout__date">${build.date || ''}</span>
          </div>
          <div class="bf-loadout__meta">
            <div class="bf-tops">${tops}</div>
            <div class="bf-categories">${categoryBadges}</div>
            <div class="bf-type">${weaponTypeRu}</div>
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
   🧱 БАЗА СБОРОК (АДМИН)
   =============================== */
async function bfLoadBuildsTable() {
  try {
    const res = await fetch("/api/bf/builds");
    const builds = await res.json();
    const grid = document.getElementById("bf-edit-builds-grid");
    const countEl = document.getElementById("bf-builds-count");
    grid.innerHTML = "";
    countEl.textContent = `Total: ${builds.length} builds`;

    builds.forEach((b) => {
      const card = document.createElement("div");
      card.className = "bf-build-card";
      card.innerHTML = `
        <h4>${b.title}</h4>
        <p>${bfWeaponTypeLabels[b.weapon_type] || b.weapon_type}</p>
        <div class="bf-build-actions">
          <button class="btn btn-edit">✏️</button>
          <button class="btn btn-delete">🗑</button>
        </div>
      `;
      grid.appendChild(card);

      card.querySelector(".btn-edit").addEventListener("click", () => bfEditBuild(b));
      card.querySelector(".btn-delete").addEventListener("click", async () => {
        if (!confirm(`Delete ${b.title}?`)) return;
        await fetch(`/api/bf/builds/${b.id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: tg.initData }),
        });
        await bfLoadBuildsTable();
      });
    });
  } catch (e) {
    console.error("BF builds table load error:", e);
  }
}

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
