// /static/js/bf-challenges.js — full rewritten version (user + admin)
// Совместим с твоими main.py и database_bf.py. Сохраняет описанную механику:
// - "Общее" -> двойной тап активирует (current = 1) и переносит в "Активные"
// - "+" / "–" обновляют прогресс с подтверждением при завершении
// - "Активные" и "Завершённые" фильтруют корректно, счётчики обновляются
// - Сохраняются выбранные вкладка и статус (localStorage)
// - Работает админ-часть: список, поиск/фильтр, добавление/редактирование/удаление испытаний и CRUD категорий
// Важно: для персонального прогресса GET /api/bf/challenges принимает initData В ТЕЛЕ ТЕЛА (Body) — оставлено как в твоём backend.

document.addEventListener("DOMContentLoaded", async () => {
  const BF_API_BASE = "/api/bf";
  const tg = window.Telegram?.WebApp;
  if (tg) tg.expand();

  // --- STATE ---
  let bfCategories = [];
  let bfChallenges = [];
  let editingChallengeId = null;

  // debounce-защиты
  let isActivating = false;
  let isUpdatingProgress = false;
  let activeTapId = null;

  // Сохранённые фильтры
  let currentTab = localStorage.getItem("bf_current_tab") || "all";        // "all" | category_id
  let currentStatus = localStorage.getItem("bf_current_status") || "all";  // "all" | "active" | "completed"

  // --- SCREENS ---
  const bfScreens = {
    main: document.getElementById("screen-bf-challenges"),
    db: document.getElementById("screen-bf-challenges-db"),
    add: document.getElementById("screen-bf-add-challenge"),
  };

  const userBtns  = ["bf-show-builds-btn","bf-challenges-btn","bf-search-btn"];
  const adminBtns = ["bf-weapons-db-btn","bf-challenges-db-btn","bf-modules-dict-btn","bf-add-build-btn","bf-add-challenge-btn"];

  // --- ROLES (не критично для UI) ---
  try {
    const res = await fetch("/api/me", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ initData: tg?.initData || "" }),
    });
    const data = await res.json();
    window.userInfo = data.user || data;

    // show/hide buttons
    [...userBtns, ...adminBtns].forEach(id => document.getElementById(id)?.classList.remove("is-visible"));
    if (data.is_admin) {
      [...userBtns, ...adminBtns].forEach(id => document.getElementById(id)?.classList.add("is-visible"));
    } else {
      userBtns.forEach(id => document.getElementById(id)?.classList.add("is-visible"));
    }

    // показать глобальную кнопку "домой"
    document.querySelector("#screen-battlefield-main .global-home-button")
      ?.style?.setProperty("display", "block");
  } catch (e) {
    console.warn("⚠️ /api/me недоступен (OK для локального теста)", e);
  }

  // --- NAVIGATION ---
  document.getElementById("bf-challenges-btn")?.addEventListener("click", async () => {
    showBfScreen("main");
    await loadBfCategories();
    // восстановим статусную вкладку
    setActiveStatusButton(currentStatus);
    if (currentStatus !== "all") {
      await renderChallengesByStatus(currentStatus);
    }
  });

  document.getElementById("bf-challenges-db-btn")?.addEventListener("click", async () => {
    showBfScreen("db");
    await loadBfChallengesTable();
  });

  document.getElementById("bf-add-challenge-btn")?.addEventListener("click", () => {
    editingChallengeId = null;
    showBfScreen("add");
    prepAddForm();
    populateCategorySelect();
  });
  document.getElementById("bf-add-challenge-db-btn")?.addEventListener("click", () => {
    editingChallengeId = null;
    showBfScreen("add");
    prepAddForm();
    populateCategorySelect();
  });

  // BACK
  const hookBack = () => showBfMain();
  document.getElementById("bf-back-from-add")?.addEventListener("click", hookBack);
  document.getElementById("bf-back-to-bfmain")?.addEventListener("click", hookBack);
  document.getElementById("bf-back-from-challenges")?.addEventListener("click", hookBack);

  // --- CATEGORY CRUD UI ---
  document.getElementById("bf-add-category-btn")?.addEventListener("click", async () => {
    const input = document.getElementById("bf-new-category");
    const name = input?.value?.trim();
    if (!name) return alert("Введите название новой категории");

    try {
      const res = await fetch(`${BF_API_BASE}/categories`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ name, initData: tg?.initData || "" })
      });
      if (!res.ok) throw new Error(await res.text());
      alert("✅ Категория добавлена!");
      input.value = "";
      await populateCategorySelect();
      await loadBfCategories();
      // Выберем новую категорию в селекте формы
      const select = document.getElementById("bf-category-select");
      const newOption = [...(select?.options || [])].find(o => o.textContent === name);
      if (newOption) newOption.selected = true;
    } catch (e) {
      console.error("Ошибка при добавлении категории:", e);
      alert("❌ Не удалось добавить категорию");
    }
  });

  document.getElementById("bf-edit-category-btn")?.addEventListener("click", async () => {
    const select = document.getElementById("bf-category-select");
    const id = select?.value;
    if (!id) return alert("Выберите категорию для редактирования.");

    const oldName = bfCategories.find(c => c.id == id)?.name || "";
    const newName = prompt("Введите новое название категории:", oldName);
    if (!newName || newName.trim() === oldName) return;

    try {
      const res = await fetch(`${BF_API_BASE}/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ name: newName.trim(), initData: tg?.initData || "" })
      });
      if (!res.ok) throw new Error(await res.text());
      alert("✅ Категория обновлена!");
      await populateCategorySelect(id);
      await loadBfCategories();
    } catch (e) {
      console.error("Ошибка при обновлении категории:", e);
      alert("❌ Не удалось обновить категорию");
    }
  });

  document.getElementById("bf-delete-category-btn")?.addEventListener("click", async () => {
    const select = document.getElementById("bf-category-select");
    const id = select?.value;
    if (!id) return alert("Выберите категорию для удаления.");

    const name = bfCategories.find(c => c.id == id)?.name || "категорию";
    if (!confirm(`Удалить "${name}" вместе со всеми испытаниями?`)) return;

    try {
      const res = await fetch(`${BF_API_BASE}/categories/${id}`, {
        method: "DELETE",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ initData: tg?.initData || "" })
      });
      if (!res.ok) throw new Error(await res.text());
      alert("🗑 Категория удалена!");
      await populateCategorySelect();
      await loadBfCategories(); // обновим вкладки
      // если удалили текущую вкладку — переключим на "Общее"
      if (String(currentTab) === String(id)) {
        currentTab = "all";
        localStorage.setItem("bf_current_tab", "all");
      }
    } catch (e) {
      console.error("Ошибка при удалении категории:", e);
      alert("❌ Не удалось удалить категорию");
    }
  });

  // --- UI HELPERS ---
  function showBfScreen(screenId) {
    document.querySelectorAll(".screen").forEach(el => {
      el.classList.remove("active");
      el.style.display = "none";
    });
    document.getElementById("screen-battlefield-main").style.display = "none";

    const target = bfScreens[screenId];
    if (target) {
      target.style.display = "block";
      target.classList.add("active");
    }
    toggleBfBackButton(screenId);
  }

  function showBfMain() {
    Object.values(bfScreens).forEach(el => (el.style.display = "none"));
    const mainEl = document.getElementById("screen-battlefield-main");
    if (mainEl) { mainEl.style.display = "block"; mainEl.classList.add("active"); }
  }

  function toggleBfBackButton(screenId) {
    document
      .querySelectorAll("#bf-back-from-challenges, #bf-back-to-bfmain, #bf-back-from-add")
      .forEach(btn => (btn.style.display = "none"));
    const backBtn = {
      main: document.getElementById("bf-back-from-challenges"),
      db: document.getElementById("bf-back-to-bfmain"),
      add: document.getElementById("bf-back-from-add"),
    }[screenId];
    if (backBtn) backBtn.style.display = "block";
  }

  async function populateCategorySelect(selectedId = null) {
    try {
      const res = await fetch(`${BF_API_BASE}/categories`);
      bfCategories = await res.json();
      const select = document.getElementById("bf-category-select");
      if (!select) return;
      select.innerHTML = `<option value="">Выберите категорию...</option>`;
      bfCategories.forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat.id;
        opt.textContent = cat.name;
        if (selectedId && selectedId == cat.id) opt.selected = true;
        select.appendChild(opt);
      });
    } catch (e) {
      console.error("Ошибка при загрузке категорий:", e);
    }
  }

  function prepAddForm(ch = null) {
    ["bf-title-en","bf-title-ru","bf-current","bf-goal"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.disabled = false;
      el.readOnly = false;
      el.style.pointerEvents = "auto";
      if (!ch) {
        if (id === "bf-current") el.value = 0;
        else if (id === "bf-goal") el.value = 0;
        else el.value = "";
      }
    });
  }

  async function ensureCategory(name) {
    try {
      if (!bfCategories.length) {
        const r = await fetch(`${BF_API_BASE}/categories`);
        bfCategories = await r.json();
      }
      const exists = bfCategories.find(c => (c.name || "").trim().toLowerCase() === name.trim().toLowerCase());
      if (exists) return exists.id;

      const res = await fetch(`${BF_API_BASE}/categories`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ name, initData: tg?.initData || "" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      await populateCategorySelect();
      await loadBfCategories();
      return created?.id ?? created?.category_id ?? null;
    } catch (e) {
      console.error("ensureCategory error:", e);
      throw e;
    }
  }

  // --- LOAD TABS ---
  async function loadBfCategories() {
    try {
      const res = await fetch(`${BF_API_BASE}/categories`);
      bfCategories = await res.json();

      const tabsEl = document.getElementById("bf-tabs");
      if (!tabsEl) return;
      tabsEl.innerHTML = "";

      // восстановим currentTab
      currentTab = localStorage.getItem("bf_current_tab") || "all";

      const allBtn = document.createElement("div");
      allBtn.className = "tab-btn" + (currentTab === "all" ? " active" : "");
      allBtn.textContent = "Общее";
      allBtn.onclick = async () => {
        currentTab = "all";
        localStorage.setItem("bf_current_tab", "all");
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        allBtn.classList.add("active");
        await loadBfChallenges(null);
        // восстановим статус
        if (currentStatus !== "all") {
          await renderChallengesByStatus(currentStatus);
        }
      };
      tabsEl.appendChild(allBtn);

      bfCategories.forEach(cat => {
        const btn = document.createElement("div");
        btn.className = "tab-btn" + (String(cat.id) === String(currentTab) ? " active" : "");
        btn.textContent = cat.name;
        btn.dataset.id = cat.id;
        btn.onclick = async () => {
          currentTab = String(cat.id);
          localStorage.setItem("bf_current_tab", currentTab);
          document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          await loadBfChallenges(cat.id);
          // статус фильтра
          if (currentStatus !== "all") {
            await renderChallengesByStatus(currentStatus);
          }
        };
        tabsEl.appendChild(btn);
      });

      const activeCat = currentTab === "all" ? null : currentTab;
      await loadBfChallenges(activeCat);
      // статус фильтра
      if (currentStatus !== "all") {
        await renderChallengesByStatus(currentStatus);
      }
    } catch (e) {
      console.error("Ошибка при загрузке категорий:", e);
    }
  }

  // --- LOAD CHALLENGES (by category) ---
  async function loadBfChallenges(categoryId = null) {
    try {
      // ВНИМАНИЕ: твой бекенд ждёт initData в Body даже у GET. Оставляю как было.
      const url = categoryId
        ? `${BF_API_BASE}/challenges?category_id=${categoryId}`
        : `${BF_API_BASE}/challenges`;
      const res = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg?.initData || "" }) // <- как в твоём main.py
      });
      bfChallenges = await res.json();

      // подстрахуемся: если API не фильтрует по category_id
      if (categoryId) bfChallenges = bfChallenges.filter(ch => ch.category_id == categoryId);

      const listEl = document.getElementById("bf-challenges-list");
      if (!listEl) return;

      if (!bfChallenges.length) {
        listEl.innerHTML = `<p style="text-align:center;color:#8ea2b6;">Нет испытаний</p>`;
        await updateInitialStatusCounts();
        return;
      }

      listEl.innerHTML = bfChallenges.map(createChallengeCard).join("");
      await updateInitialStatusCounts();
    } catch (e) {
      console.error("Ошибка при загрузке испытаний:", e);
    }
  }

  function createChallengeCard(ch) {
    const percent = ch.goal > 0 ? Math.min((ch.current / ch.goal) * 100, 100) : 0;
    const isDone = ch.current >= ch.goal;
    const isActive = ch.current > 0 && ch.current < ch.goal;
    return `
      <div class="challenge-card-user ${isDone ? "completed" : isActive ? "active" : ""}" data-id="${ch.id}">
        ${ch.category_name ? `<div class="challenge-category">${ch.category_name}</div>` : ""}
        <div class="challenge-title-en">${ch.title_en}</div>
        <div class="challenge-title-ru">${ch.title_ru}</div>
        <div class="progress-text">
          <span>Прогресс</span>
          <span>${ch.current} / ${ch.goal}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${percent}%;"></div>
        </div>
        ${!isDone ? `
          <div class="progress-controls">
            <button class="btn-mini" data-action="minus" data-id="${ch.id}"><i class="fas fa-minus"></i></button>
            <button class="btn-mini" data-action="plus" data-id="${ch.id}"><i class="fas fa-plus"></i></button>
          </div>
        ` : `<div class="completed-overlay">ЗАВЕРШЕНО!</div>`}
      </div>
    `;
  }

  // --- STATUS TABS ---
  document.querySelectorAll(".status-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const alreadyActive = btn.classList.contains("active");
      document.querySelectorAll(".status-btn").forEach(b => b.classList.remove("active"));

      if (alreadyActive) {
        // поведение "сбросить фильтр" — вернуться к текущей категории
        currentStatus = "all";
        localStorage.setItem("bf_current_status", "all");
        const activeTab = document.querySelector("#bf-tabs .tab-btn.active");
        const categoryId = activeTab?.dataset?.id || null;
        await loadBfChallenges(categoryId);
        return;
      }

      btn.classList.add("active");
      const status = btn.dataset.status;
      currentStatus = status;
      localStorage.setItem("bf_current_status", status);
      await renderChallengesByStatus(status);
    });
  });

  function setActiveStatusButton(status) {
    document.querySelectorAll(".status-btn").forEach(b => b.classList.remove("active"));
    if (status === "all") return;
    const btn = document.querySelector(`.status-btn[data-status="${status}"]`);
    btn?.classList.add("active");
  }

  async function renderChallengesByStatus(status) {
    const listEl = document.getElementById("bf-challenges-list");
    if (!listEl) return;

    try {
      const res = await fetch(`${BF_API_BASE}/challenges`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg?.initData || "" })
      });
      const all = await res.json();

      // если выбран таб категории — ограничим массив
      const activeTab = document.querySelector("#bf-tabs .tab-btn.active");
      const catId = activeTab?.dataset?.id || null;
      const base = catId ? all.filter(ch => ch.category_id == catId) : all;

      const active = base.filter(ch => ch.goal > 0 && ch.current > 0 && ch.current < ch.goal);
      const completed = base.filter(ch => ch.goal > 0 && ch.current >= ch.goal);
      updateStatusCounters(active.length, completed.length);

      let filtered = [];
      if (status === "completed") filtered = completed;
      else if (status === "active") filtered = active;
      else filtered = base;

      if (status === "active" && active.length === 0) {
        listEl.innerHTML = `
          <div class="no-active-message">
            💡 У вас нет активных заданий.<br>
            Дважды нажмите на карточку во вкладке <b>«Общее»</b>, чтобы начать выполнение.
          </div>
        `;
        return;
      }
      if (status === "completed" && completed.length === 0) {
        listEl.innerHTML = `
          <div class="no-active-message">
            💤 У вас пока нет завершённых заданий.
          </div>
        `;
        return;
      }

      listEl.innerHTML = filtered.map(createChallengeCard).join("");
    } catch (e) {
      console.error("Ошибка при фильтрации по статусу:", e);
      listEl.innerHTML = `<p style="text-align:center;color:#8ea2b6;">Ошибка загрузки</p>`;
    }
  }

  function updateStatusCounters(activeCount, completedCount) {
    document.querySelector('[data-status="active"] .count')?.remove();
    document.querySelector('[data-status="completed"] .count')?.remove();
    const activeBtn = document.querySelector('[data-status="active"]');
    const completedBtn = document.querySelector('[data-status="completed"]');
    if (activeBtn) activeBtn.insertAdjacentHTML("beforeend", `<span class="count">(${activeCount})</span>`);
    if (completedBtn) completedBtn.insertAdjacentHTML("beforeend", `<span class="count">(${completedCount})</span>`);
  }

  async function updateInitialStatusCounts() {
    try {
      const res = await fetch(`${BF_API_BASE}/challenges`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg?.initData || "" })
      });
      const all = await res.json();

      const activeTab = document.querySelector("#bf-tabs .tab-btn.active");
      const catId = activeTab?.dataset?.id || null;
      const base = catId ? all.filter(ch => ch.category_id == catId) : all;

      const active = base.filter(ch => ch.goal > 0 && ch.current > 0 && ch.current < ch.goal);
      const completed = base.filter(ch => ch.goal > 0 && ch.current >= ch.goal);
      updateStatusCounters(active.length, completed.length);
    } catch (e) {
      console.error("Ошибка при подсчёте статусов:", e);
    }
  }

  // --- SEARCH (user) ---
  function setupUserChallengeSearch() {
    const searchInput = document.getElementById("bf-search-user");
    if (!searchInput) return;
    let timeout = null;
    searchInput.addEventListener("input", async () => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        const term = searchInput.value.trim().toLowerCase();
        const listEl = document.getElementById("bf-challenges-list");
        if (!listEl) return;

        if (!term) {
          const activeTab = document.querySelector("#bf-tabs .tab-btn.active");
          const categoryId = activeTab?.dataset?.id || null;
          await loadBfChallenges(categoryId);
          if (currentStatus !== "all") await renderChallengesByStatus(currentStatus);
          return;
        }

        try {
          const res = await fetch(`${BF_API_BASE}/challenges`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData: tg?.initData || "" })
          });
          const all = await res.json();

          // Учитываем выбранную категорию
          const activeTab = document.querySelector("#bf-tabs .tab-btn.active");
          const catId = activeTab?.dataset?.id || null;
          const base = catId ? all.filter(ch => ch.category_id == catId) : all;

          const filtered = base.filter(ch => {
            const en = (ch.title_en || "").toLowerCase();
            const ru = (ch.title_ru || "").toLowerCase();
            const cat = (ch.category_name || "").toLowerCase();
            return en.includes(term) || ru.includes(term) || cat.includes(term);
          });
          listEl.innerHTML = filtered.length
            ? filtered.map(createChallengeCard).join("")
            : `<p style="text-align:center;color:#8ea2b6;">Ничего не найдено</p>`;
        } catch (e) {
          console.error("Ошибка при поиске испытаний:", e);
          listEl.innerHTML = `<p style="text-align:center;color:#8ea2b6;">Ошибка при поиске</p>`;
        }
      }, 300);
    });
  }
  setupUserChallengeSearch();

  // --- TIP (1 раз после открытия) ---
  setTimeout(() => {
    const tip = document.createElement("div");
    tip.className = "bf-tip-popup";
    tip.textContent = "💡 Дважды нажмите на карточку, чтобы начать выполнение испытания";
    document.body.appendChild(tip);
    tip.style.opacity = "0";
    setTimeout(() => (tip.style.opacity = "1"), 100);
    setTimeout(() => {
      tip.style.opacity = "0";
      setTimeout(() => tip.remove(), 500);
    }, 7000);
  }, 5000);

  // --- ADMIN GRID ---
  async function loadBfChallengesTable() {
    try {
      const res = await fetch(`${BF_API_BASE}/challenges`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg?.initData || "" })
      });
      bfChallenges = await res.json();

      // counters
      document.getElementById("bf-total-challenges").textContent = bfChallenges.length;

      const categories = [...new Set(bfChallenges.map(ch => ch.category_name).filter(Boolean))];
      const filterSelect = document.getElementById("bf-filter-category");
      if (filterSelect) {
        filterSelect.innerHTML = '<option value="">Все категории</option>' +
          categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
      }
      document.getElementById("bf-total-categories").textContent = categories.length;

      const gridEl = document.getElementById("bf-challenges-grid");
      if (!gridEl) return;

      if (!bfChallenges.length) {
        gridEl.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="icon">🎯</div>
            <h3>Пока нет испытаний</h3>
            <p>Добавьте первое испытание, чтобы начать</p>
            <button class="btn btn-primary" onclick="document.getElementById('bf-add-challenge-db-btn').click()">
              ➕ Добавить испытание
            </button>
          </div>
        `;
        return;
      }

      gridEl.innerHTML = bfChallenges.map(ch => `
        <div class="challenge-card-admin" data-category="${ch.category_name || ''}">
          <div class="challenge-card-header">
            <span class="challenge-id">#${ch.id}</span>
            <span class="challenge-category">${ch.category_name || 'Без категории'}</span>
          </div>
          <div class="challenge-titles">
            <div class="challenge-title-en">${ch.title_en || 'Без названия'}</div>
            <div class="challenge-title-ru">${ch.title_ru || 'Без названия'}</div>
          </div>
          <div class="challenge-actions">
            <button class="btn-small btn-edit" onclick="editBfChallenge(${ch.id})">✏️ Редактировать</button>
            <button class="btn-small btn-delete" onclick="deleteBfChallenge(${ch.id})">🗑 Удалить</button>
          </div>
        </div>
      `).join('');

      setupSearchAndFilter();
    } catch (e) {
      console.error("Ошибка при загрузке испытаний:", e);
      const gridEl = document.getElementById("bf-challenges-grid");
      if (gridEl) {
        gridEl.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="icon">❌</div>
            <h3>Ошибка загрузки</h3>
            <p>Не удалось загрузить испытания</p>
            <button class="btn btn-secondary" onclick="loadBfChallengesTable()">🔄 Повторить</button>
          </div>
        `;
      }
    }
  }

  function setupSearchAndFilter() {
    const searchInput = document.getElementById('bf-search-challenges');
    const filterSelect = document.getElementById('bf-filter-category');

    const filterChallenges = () => {
      const searchTerm = (searchInput?.value || "").toLowerCase();
      const selectedCategory = filterSelect?.value || "";
      document.querySelectorAll('.challenge-card-admin').forEach(card => {
        const titleEn = card.querySelector('.challenge-title-en')?.textContent.toLowerCase() || "";
        const titleRu = card.querySelector('.challenge-title-ru')?.textContent.toLowerCase() || "";
        const category = card.getAttribute('data-category') || "";
        const matchesSearch = titleEn.includes(searchTerm) || titleRu.includes(searchTerm);
        const matchesCategory = !selectedCategory || category === selectedCategory;
        card.style.display = (matchesSearch && matchesCategory) ? 'block' : 'none';
      });
    };

    searchInput?.addEventListener('input', filterChallenges);
    filterSelect?.addEventListener('change', filterChallenges);
  }

  // --- CRUD Challenges (Admin) ---
  async function addBfChallenge() {
    const categorySelect = document.getElementById("bf-category-select");
    const categoryId = categorySelect?.value || null;
    const categoryName =
      bfCategories.find(c => c.id == categoryId)?.name ||
      document.getElementById("bf-new-category")?.value?.trim() ||
      "";

    const title_en = document.getElementById("bf-title-en")?.value?.trim() || "";
    const title_ru = document.getElementById("bf-title-ru")?.value?.trim() || "";
    const current  = 0; // при создании всегда 0
    const goal     = Number(document.getElementById("bf-goal")?.value) || 0;

    if (!categoryName) return alert("Введите категорию");
    if (!title_en || !title_ru) return alert("Введите названия EN и RU");
    if (goal <= 0) return alert("Цель должна быть > 0");

    let category_id = null;
    try {
      category_id = await ensureCategory(categoryName);
    } catch (e) {
      return alert("❌ Не удалось создать/получить категорию:\n" + (e?.message || ""));
    }

    const payload = { category_id, category_name: categoryName, title_en, title_ru, current, goal };
    const method  = editingChallengeId ? "PUT" : "POST";
    const url = editingChallengeId
      ? `${BF_API_BASE}/challenges/${editingChallengeId}`
      : `${BF_API_BASE}/challenges`;

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ ...payload, initData: tg?.initData || "" })
      });

      if (!res.ok) {
        const text = await res.text().catch(()=> "");
        alert(`❌ Ошибка при сохранении испытания\nHTTP ${res.status} ${res.statusText}\n${text}`);
        return;
      }

      alert(editingChallengeId ? "✅ Испытание обновлено" : "✅ Испытание добавлено");
      editingChallengeId = null;

      prepAddForm();
      await populateCategorySelect();
      // если мы на админ-экране — обновим таблицу
      if (bfScreens.db?.classList.contains("active")) await loadBfChallengesTable();
      // если мы на пользовательском — обновим список/счётчики
      if (bfScreens.main?.classList.contains("active")) {
        const catId = (currentTab === "all") ? null : currentTab;
        await loadBfChallenges(catId);
        if (currentStatus !== "all") await renderChallengesByStatus(currentStatus);
        await updateInitialStatusCounts();
      }
      // вернёмся из формы в админ-таблицу, если пришли оттуда
      showBfScreen("db");
    } catch (err) {
      console.error("Ошибка при сохранении испытания:", err);
      alert("❌ Не удалось сохранить испытание");
    }
  }
  document.getElementById("bf-submit-challenge")?.addEventListener("click", addBfChallenge);

  window.deleteBfChallenge = async function (id) {
    if (!confirm("Удалить испытание?")) return;
    try {
      const res = await fetch(`${BF_API_BASE}/challenges/${id}`, {
        method: "DELETE",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ initData: tg?.initData || "" })
      });
      if (!res.ok) {
        const text = await res.text();
        alert(`❌ Ошибка при удалении испытания\nHTTP ${res.status}\n${text}`);
        return;
      }
      alert("✅ Испытание удалено");
      await loadBfChallengesTable();
      // также обновим пользователю
      const catId = (currentTab === "all") ? null : currentTab;
      if (bfScreens.main?.classList.contains("active")) {
        await loadBfChallenges(catId);
        if (currentStatus !== "all") await renderChallengesByStatus(currentStatus);
        await updateInitialStatusCounts();
      }
    } catch (e) {
      console.error("Ошибка при удалении испытания:", e);
      alert("❌ Не удалось удалить испытание");
    }
  };

  window.editBfChallenge = async function(id) {
    const ch = bfChallenges.find(c => c.id === id);
    // Если не нашли в кэше — попробуем подгрузить
    if (!ch) {
      try {
        const res = await fetch(`${BF_API_BASE}/challenges`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: tg?.initData || "" })
        });
        const all = await res.json();
        const found = all.find(c => c.id === id);
        if (!found) return;
        bfChallenges = all;
        return window.editBfChallenge(id);
      } catch {
        return;
      }
    }
    editingChallengeId = id;
    showBfScreen("add");
    prepAddForm(ch);
    await populateCategorySelect(ch.category_id);
    document.getElementById("bf-title-en").value = ch.title_en || "";
    document.getElementById("bf-title-ru").value = ch.title_ru || "";
    document.getElementById("bf-current").value  = ch.current ?? 0; // только отображение для админа
    document.getElementById("bf-goal").value     = ch.goal ?? 0;
  };

  // --- Double tap (активация) ---
  document.getElementById("bf-challenges-list")?.addEventListener("dblclick", async (e) => {
    const card = e.target.closest(".challenge-card-user");
    if (!card || isActivating) return;
    const id = Number(card.dataset.id);
    if (!id || card.classList.contains("completed") || card.classList.contains("active")) return;
    if (activeTapId && activeTapId === id) return; // защита от мультиклика
    activeTapId = id;

    // Если цель = 1 — предупредим, что активируя — сразу завершишь
    const text = card.querySelector(".progress-text span:last-child").textContent;
    const goal = parseInt(text.split("/")[1].trim()) || 0;
    if (goal === 1 && !confirm("Это сразу завершит испытание. Начать?")) {
      activeTapId = null; 
      return;
    }

    isActivating = true;
    try {
      // Активируем с +1 (current: 0 -> 1)
      const res = await fetch(`${BF_API_BASE}/challenges/${id}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta: 1, initData: tg?.initData || "" })
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();

      // Обновим UI текущей карточки
      const percent = updated.goal ? Math.min(updated.current / updated.goal * 100, 100) : 0;
      card.querySelector(".progress-fill").style.width = `${percent}%`;
      card.querySelector(".progress-text span:last-child").textContent = `${updated.current} / ${updated.goal}`;

      // Визуально подчеркнём активацию и перенесём в "Активные"
      card.classList.add("active");
      card.style.transition = "all 0.3s ease";
      card.style.boxShadow = "0 0 12px rgba(0,255,120,0.5)";

      setTimeout(async () => {
        // Переключим статус-фильтр на "Активные" и перерендерим список
        setActiveStatusButton("active");
        currentStatus = "active";
        localStorage.setItem("bf_current_status", "active");
        await renderChallengesByStatus("active");
        await updateInitialStatusCounts();
      }, 250);

    } catch (err) {
      console.error("Ошибка при запуске испытания:", err);
      alert("❌ Ошибка активации");
    } finally {
      isActivating = false;
      activeTapId = null;
    }
  });

  // --- Progress +/- ---
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-mini");
    if (!btn || isUpdatingProgress) return;
    btn.disabled = true;
    isUpdatingProgress = true;

    const id = Number(btn.dataset.id);
    const delta = btn.dataset.action === "plus" ? 1 : -1;
    const card = document.querySelector(`.challenge-card-user[data-id="${id}"]`);
    if (!card) {
      btn.disabled = false;
      isUpdatingProgress = false;
      return;
    }

    const text = card.querySelector(".progress-text span:last-child").textContent;
    const [currRaw, goalRaw] = text.split("/").map(t => parseInt(t.trim()) || 0);
    let curr = currRaw, goal = goalRaw;

    // Предупреждение при завершении
    if (curr + delta >= goal && delta > 0) {
      if (!confirm("Это завершит испытание. Продолжить?")) {
        btn.disabled = false;
        isUpdatingProgress = false;
        return;
      }
    }
    // Не уходим ниже 0
    if (curr + delta < 0 && delta < 0) {
      btn.disabled = false;
      isUpdatingProgress = false;
      return;
    }

    try {
      const res = await fetch(`${BF_API_BASE}/challenges/${id}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta, initData: tg?.initData || "" })
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();

      const percent = updated.goal ? Math.min(updated.current / updated.goal * 100, 100) : 0;
      card.querySelector(".progress-fill").style.width = `${percent}%`;
      card.querySelector(".progress-text span:last-child").textContent = `${updated.current} / ${updated.goal}`;

      if (updated.current >= updated.goal) {
        // Завершили — пометим и перенесём во вкладку "Завершённые"
        card.classList.add("completed");
        card.querySelector(".progress-controls")?.remove();
        if (!card.querySelector(".completed-overlay")) {
          const overlay = document.createElement("div");
          overlay.className = "completed-overlay";
          overlay.textContent = "ЗАВЕРШЕНО!";
          card.appendChild(overlay);
        }
        setTimeout(async () => {
          setActiveStatusButton("completed");
          currentStatus = "completed";
          localStorage.setItem("bf_current_status", "completed");
          await renderChallengesByStatus("completed");
          await updateInitialStatusCounts();
        }, 250);
      } else {
        // Если были в "Общее" — оставим; если в "Активных" — просто обновим список
        if (currentStatus === "active") {
          await renderChallengesByStatus("active");
        } else if (currentStatus === "completed") {
          // если откатили из completed (теоретически) — вернём в active/all
          await renderChallengesByStatus("active");
          setActiveStatusButton("active");
          currentStatus = "active";
          localStorage.setItem("bf_current_status", "active");
        }
        await updateInitialStatusCounts();
      }
    } catch (err) {
      console.error("Ошибка PATCH:", err);
      alert("❌ Ошибка обновления прогресса");
    } finally {
      btn.disabled = false;
      isUpdatingProgress = false;
    }
  });

  // --- START ---
  await loadBfCategories();

  // восстановим статус после загрузки
  setActiveStatusButton(currentStatus);
  if (currentStatus !== "all") {
    await renderChallengesByStatus(currentStatus);
  }
});
