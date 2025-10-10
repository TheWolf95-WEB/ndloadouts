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
    bfModulesByType[type] = { byCategory, byKey, flat };
  } catch (e) {
    console.error("Failed to load modules for", type, e);
  }
}


/* ===============================
   ⚙️  ДОБАВЛЕНИЕ / РЕДАКТИРОВАНИЕ СБОРКИ
   =============================== */

// Кнопка "Добавить сборку"
document.getElementById("bf-add-build-btn")?.addEventListener("click", () => {
  bfCurrentEditId = null;
  document.getElementById("bf-submit-build").textContent = "➕ Добавить сборку";

  // очистка полей
  document.getElementById("bf-title").value = "";
  document.getElementById("bf-weapon-type").value = "";
  document.getElementById("bf-top1").value = "";
  document.getElementById("bf-top2").value = "";
  document.getElementById("bf-top3").value = "";
  document.getElementById("bf-build-date").value = new Date().toISOString().split("T")[0];
  document.getElementById("bf-tabs-container").innerHTML = "";

  bfShowScreen("screen-bf-form");
});

// Назад с формы
document.getElementById("bf-back-to-main")?.addEventListener("click", () => {
  bfShowScreen("screen-battlefield-main");
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

// === Добавление строки модуля во вкладку ===
function bfAddModuleRow(tabDiv, type) {
  const modsWrap = bfModulesByType[type];
  if (!modsWrap) return alert("Select weapon type first");

  const row = document.createElement("div");
  row.className = "mod-row";

  const categorySelect = document.createElement("select");
  categorySelect.className = "form-input category-select";

  const moduleSelect = document.createElement("select");
  moduleSelect.className = "form-input module-select";

  // Добавляем категории
  Object.keys(modsWrap.byCategory).forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });

  row.appendChild(categorySelect);
  row.appendChild(moduleSelect);
  tabDiv.querySelector(".mod-selects").appendChild(row);

  categorySelect.addEventListener("change", refresh);
  moduleSelect.addEventListener("change", refreshAll);

  // === Обновление списка модулей ===
  function refresh() {
    const cat = categorySelect.value;
    const list = modsWrap.byCategory[cat] || [];
    moduleSelect.innerHTML = "";

    // Собираем уже выбранные модули в текущей вкладке
    const used = Array.from(tabDiv.querySelectorAll(".module-select"))
      .map((s) => s.value)
      .filter((v) => v);

    // Добавляем только те, которых нет среди выбранных
    list.forEach((m) => {
      if (!used.includes(m.en)) {
        const opt = document.createElement("option");
        opt.value = m.en;
        opt.textContent = m.en;
        moduleSelect.appendChild(opt);
      }
    });

    // Если всё удалили (например, все выбраны) — добавим пустую опцию
    if (!moduleSelect.options.length) {
      const empty = document.createElement("option");
      empty.textContent = "Все выбраны";
      empty.disabled = true;
      empty.selected = true;
      moduleSelect.appendChild(empty);
    }
  }

  function refreshAll() {
    // при смене модуля обновим все другие селекты, чтобы убрать дубликаты
    tabDiv.querySelectorAll(".mod-row").forEach((r) => {
      if (r !== row) {
        const catSel = r.querySelector(".category-select");
        const modSel = r.querySelector(".module-select");
        if (catSel.value === categorySelect.value) {
          const list = modsWrap.byCategory[catSel.value] || [];
          const used = Array.from(tabDiv.querySelectorAll(".module-select"))
            .map((s) => s.value)
            .filter((v) => v);
          modSel.innerHTML = "";
          list.forEach((m) => {
            if (!used.includes(m.en) || m.en === modSel.value) {
              const opt = document.createElement("option");
              opt.value = m.en;
              opt.textContent = m.en;
              if (m.en === modSel.value) opt.selected = true;
              modSel.appendChild(opt);
            }
          });
        }
      }
    });
  }

  categorySelect.dispatchEvent(new Event("change"));
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
function bfRenderBuilds(builds) {
  const container = document.getElementById("bf-builds-list");
  const countEl = document.getElementById("bf-user-builds-count");
  const noResults = document.getElementById("bf-no-results-message");

  if (!container) return;
  container.innerHTML = "";
  countEl.textContent = `Всего сборок: ${builds.length}`;
  noResults.style.display = builds.length ? "none" : "block";

  builds.forEach((b) => {
    const item = document.createElement("div");
    item.className = "bf-build-item";

    const topBlock = `
      <div class="bf-build-header">
        <h3>${b.title}</h3>
        <span class="bf-build-type">${bfWeaponTypeLabels[b.weapon_type] || b.weapon_type}</span>
      </div>
      <div class="bf-top-mods">
        ${b.top1 ? `<span class="top1">🥇 ${b.top1}</span>` : ""}
        ${b.top2 ? `<span class="top2">🥈 ${b.top2}</span>` : ""}
        ${b.top3 ? `<span class="top3">🥉 ${b.top3}</span>` : ""}
      </div>
      <button class="btn bf-toggle">Показать модули</button>
    `;

    const tabsHTML = (b.tabs || [])
      .map(
        (tab) => `
      <div class="bf-tab">
        <h4>${tab.label}</h4>
        <ul>
          ${tab.items
            .map(
              (m) =>
                `<li>${
                  (bfModulesByType[b.weapon_type]?.byKey?.[m.toLowerCase()]?.category || "—"
                )}: ${m}</li>`
            )
            .join("")}
        </ul>
      </div>`
      )
      .join("");

    const content = document.createElement("div");
    content.className = "bf-build-content";
    content.innerHTML = tabsHTML;

    item.innerHTML = topBlock;
    item.appendChild(content);
    container.appendChild(item);

    const toggle = item.querySelector(".bf-toggle");
    toggle.addEventListener("click", () => {
      const visible = content.style.display === "block";
      content.style.display = visible ? "none" : "block";
      toggle.textContent = visible ? "Show Modules" : "Hide Modules";
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
