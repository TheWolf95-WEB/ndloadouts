// === Battlefield WebApp (FULL, final stable) ===
// Поведение:
// - При входе активна вкладка "Общее": показываются все НЕ начатые испытания (current === 0).
// - Двойной тап по карточке в "Общем" запускает испытание (current += 1) и переводит его во вкладку "Активные".
// - Во вкладке "Активные" есть кнопки + / -, чтобы регулировать прогресс.
// - При достижении цели (current >= goal) испытание переносится в "Завершённые" с размытием и оверлеем "ЗАВЕРШЕНО!".
// - При уменьшении прогресса до 0 испытание возвращается в "Общее".
// - Счётчики "Активные/Завершённые" обновляются корректно везде.
// - Есть админ-экран с таблицей, CRUD испытаний и CRUD категорий.

document.addEventListener("DOMContentLoaded", async () => {
  // ====== Базовые переменные/состояние ======
  const BF_API_BASE = "/api/bf";
  const tg = window.Telegram?.WebApp;
  if (tg) tg.expand();

  let bfCategories = [];
  let bfChallenges = [];
  let editingChallengeId = null;

  // Основные экраны (если используются)
  const bfScreens = {
    main: document.getElementById("screen-bf-challenges"),
    db:   document.getElementById("screen-bf-challenges-db"),
    add:  document.getElementById("screen-bf-add-challenge"),
  };

  // Кнопки для ролей (если есть в DOM)
  const userBtns  = ["bf-show-builds-btn","bf-challenges-btn","bf-search-btn"];
  const adminBtns = ["bf-weapons-db-btn","bf-challenges-db-btn","bf-modules-dict-btn","bf-add-build-btn","bf-add-challenge-btn"];

  // ====== Роль пользователя (только UI) ======
  try {
    const res  = await fetch("/api/me", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ initData: tg?.initData || "" })
    });
    const data = await res.json();
    window.userInfo = data.user || data;

    // Показываем/скрываем кнопки
    [...userBtns, ...adminBtns].forEach(id => document.getElementById(id)?.classList.remove("is-visible"));
    if (data.is_admin) [...userBtns, ...adminBtns].forEach(id => document.getElementById(id)?.classList.add("is-visible"));
    else userBtns.forEach(id => document.getElementById(id)?.classList.add("is-visible"));

    document.querySelector("#screen-battlefield-main .global-home-button")?.style?.setProperty("display","block");
  } catch(e) {
    console.warn("⚠️ /api/me недоступен (ОК для локального теста)", e);
  }

  // ====== Навигация по экранам ======
  document.getElementById("bf-challenges-btn")?.addEventListener("click", async () => {
    showBfScreen("main");
    await loadBfCategories();
    await updateStatusCountersAuto();
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

  // Back-кнопки
  const hookBack = () => showBfMain();
  document.getElementById("bf-back-from-add")?.addEventListener("click", hookBack);
  document.getElementById("bf-back-to-bfmain")?.addEventListener("click", hookBack);
  document.getElementById("bf-back-from-challenges")?.addEventListener("click", hookBack);
  document.addEventListener("click", (e) => {
    if (["bf-back-from-add","bf-back-to-bfmain","bf-back-from-challenges"].includes(e.target?.id)) showBfMain();
  });

  // ====== Инициализация: вкладки + счётчики ======
  await loadBfCategories();        // по умолчанию откроется "Общее"
  await updateStatusCountersAuto(); // посчитать бейджи

  // Если при загрузке уже активен экран испытаний — обновить счётчики
  if (document.getElementById("screen-bf-challenges")?.classList.contains("active")) {
    await updateStatusCountersAuto();
  }

  // ====== DOM Helpers: экраны ======
  function showBfScreen(screenId) {
    document.querySelectorAll(".screen").forEach(el => { 
      el.classList.remove("active"); 
      el.style.display = "none"; 
    });
    document.getElementById("screen-battlefield-main")?.style?.setProperty("display","none");
  
    const target = bfScreens[screenId];
    if (target) { 
      target.style.display = "block"; 
      target.classList.add("active"); 
    }
    toggleBfBackButton(screenId);
  }

  function showBfMain() {
    Object.values(bfScreens).forEach(el => (el && (el.style.display = "none")));
    const mainEl = document.getElementById("screen-battlefield-main");
    if (mainEl) { mainEl.style.display = "block"; mainEl.classList.add("active"); }
  }

  function toggleBfBackButton(screenId) {
    document.querySelectorAll("#bf-back-from-challenges, #bf-back-to-bfmain, #bf-back-from-add")
      .forEach(btn => btn.style.display = "none");
    if (["main", "db", "add"].includes(screenId)) {
      const backBtn = {
        main: document.getElementById("bf-back-from-challenges"),
        db:   document.getElementById("bf-back-to-bfmain"),
        add:  document.getElementById("bf-back-from-add")
      }[screenId];
      if (backBtn) backBtn.style.display = "block";
    }
  }

  // ====== Категории: селект + CRUD ======
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
        if (selectedId && String(selectedId) === String(cat.id)) opt.selected = true;
        select.appendChild(opt);
      });

      if (selectedId) select.value = selectedId;
    } catch (e) {
      console.error("Ошибка при загрузке категорий:", e);
    }
  }

  // Редактировать категорию
  document.getElementById("bf-edit-category-btn")?.addEventListener("click", async () => {
    const select = document.getElementById("bf-category-select");
    const id = select?.value;
    if (!id) return alert("Выберите категорию для редактирования.");

    const oldName = bfCategories.find(c => String(c.id) === String(id))?.name || "";
    const newName = prompt("Введите новое название категории:", oldName);
    if (!newName || newName.trim() === oldName) return;

    try {
      const res = await fetch(`${BF_API_BASE}/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), initData: tg?.initData || "" })
      });
      if (!res.ok) throw new Error(await res.text());
      alert("✅ Категория обновлена!");
      await populateCategorySelect(id);
    } catch (e) {
      console.error("Ошибка при обновлении категории:", e);
      alert("❌ Не удалось обновить категорию");
    }
  });

  // Удалить категорию
  document.getElementById("bf-delete-category-btn")?.addEventListener("click", async () => {
    const select = document.getElementById("bf-category-select");
    const id = select?.value;
    if (!id) return alert("Выберите категорию для удаления.");

    const name = bfCategories.find(c => String(c.id) === String(id))?.name || "категорию";
    if (!confirm(`Удалить "${name}" вместе со всеми испытаниями?`)) return;

    try {
      const res = await fetch(`${BF_API_BASE}/categories/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg?.initData || "" })
      });
      if (!res.ok) throw new Error(await res.text());
      alert("🗑 Категория удалена!");
      await populateCategorySelect();
    } catch (e) {
      console.error("Ошибка при удалении категории:", e);
      alert("❌ Не удалось удалить категорию");
    }
  });

  // Добавить категорию вручную под полем
  document.getElementById("bf-add-category-btn")?.addEventListener("click", async () => {
    const input = document.getElementById("bf-new-category");
    const name = input?.value?.trim();
    if (!name) return alert("Введите название новой категории");

    try {
      const res = await fetch(`${BF_API_BASE}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, initData: tg?.initData || "" })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ошибка: ${res.status}\n${text}`);
      }

      input.value = "";
      alert("✅ Категория добавлена!");

      await populateCategorySelect();
      const select = document.getElementById("bf-category-select");
      const newOption = [...select.options].find(o => o.textContent === name);
      if (newOption) newOption.selected = true;
    } catch (e) {
      console.error("Ошибка при добавлении категории:", e);
      alert("❌ Не удалось добавить категорию");
    }
  });

  // Создаёт категорию если её нет, возвращает ID
  async function ensureCategory(name) {
    const norm = (s) => (s||"").trim().toLowerCase();
    try {
      if (!bfCategories.length) {
        const r = await fetch(`${BF_API_BASE}/categories`);
        bfCategories = await r.json();
      }
      const exists = bfCategories.find(c => norm(c.name) === norm(name));
      if (exists) return exists.id;

      const res = await fetch(`${BF_API_BASE}/categories`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ name, initData: tg?.initData || "" })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);

      let created = {};
      try { created = await res.json(); } catch {}
      const newId = created?.id ?? created?.category_id ?? null;

      const r2 = await fetch(`${BF_API_BASE}/categories`);
      bfCategories = await r2.json();
      return newId;
    } catch (e) {
      console.error("ensureCategory error:", e);
      throw e;
    }
  }

  // ====== Счётчики статусов ======
  async function updateStatusCountersAuto() {
    try {
      const res = await fetch(`${BF_API_BASE}/challenges`);
      const all = await res.json();
      const active = all.filter(ch => ch.goal > 0 && ch.current > 0 && ch.current < ch.goal).length;
      const completed = all.filter(ch => ch.goal > 0 && ch.current >= ch.goal).length;
      updateStatusCounters(active, completed);
    } catch (e) {
      console.warn("Ошибка при обновлении счётчиков:", e);
    }
  }

  function updateStatusCounters(activeCount, completedCount) {
    const activeBtn = document.querySelector('[data-status="active"]');
    const completedBtn = document.querySelector('[data-status="completed"]');
    activeBtn?.querySelector("span.count")?.remove();
    completedBtn?.querySelector("span.count")?.remove();
    if (activeBtn) activeBtn.insertAdjacentHTML("beforeend", `<span class="count">(${activeCount})</span>`);
    if (completedBtn) completedBtn.insertAdjacentHTML("beforeend", `<span class="count">(${completedCount})</span>`);
  }

  // ====== Вкладки категорий ("Общее" + категории) ======
  async function loadBfCategories() {
    try {
      const res = await fetch(`${BF_API_BASE}/categories`);
      bfCategories = await res.json();

      const tabsEl = document.getElementById("bf-tabs");
      if (!tabsEl) return;
      tabsEl.innerHTML = "";

      const allBtn = document.createElement("div");
      allBtn.className = "tab-btn active";
      allBtn.textContent = "Общее";
      allBtn.onclick = async () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        allBtn.classList.add("active");
        await loadBfChallenges(null);
        await updateStatusCountersAuto();
      };
      tabsEl.appendChild(allBtn);

      bfCategories.forEach(cat => {
        const btn = document.createElement("div");
        btn.className = "tab-btn";
        btn.textContent = cat.name;
        btn.dataset.id = cat.id;
        btn.onclick = async () => {
          document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          await loadBfChallenges(cat.id);
          await updateStatusCountersAuto();
        };
        tabsEl.appendChild(btn);
      });

      await loadBfChallenges(null);
      await updateStatusCountersAuto();
    } catch (e) {
      console.error("Ошибка при загрузке категорий:", e);
    }
  }

  // ====== Загрузка испытаний для списка (пользователь) ======
  // "Общее": только НЕ начатые
  async function loadBfChallenges(categoryId = null) {
    try {
      const url = categoryId
        ? `${BF_API_BASE}/challenges?category_id=${categoryId}`
        : `${BF_API_BASE}/challenges`;

      const res = await fetch(url);
      bfChallenges = await res.json();

      const notStarted = bfChallenges.filter(ch => ch.goal > 0 && ch.current === 0);

      const listEl = document.getElementById("bf-challenges-list");
      if (!listEl) return;

      if (!notStarted.length) {
        listEl.innerHTML = `<p style="text-align:center;color:#8ea2b6;">Пока нет доступных испытаний</p>`;
        await updateStatusCountersAuto();
        return;
      }

      listEl.innerHTML = notStarted.map(ch => createChallengeCard(ch)).join("");
    } catch (e) {
      console.error("Ошибка при загрузке испытаний:", e);
    }
  }

  // Карточка испытания
  function createChallengeCard(ch) {
    const percent = ch.goal > 0 ? Math.min((ch.current / ch.goal) * 100, 100) : 0;
    const isDone = ch.current >= ch.goal;
    const inProgress = ch.current > 0 && ch.current < ch.goal;
    return `
      <div class="challenge-card-user ${isDone ? "completed" : ""}" data-id="${ch.id}">
        ${ch.category_name ? `<div class="challenge-category">${ch.category_name}</div>` : ""}
        <div class="challenge-title-en">${ch.title_en}</div>
        <div class="challenge-title-ru">${ch.title_ru}</div>
        <div class="progress-text"><span>Прогресс</span><span>${ch.current} / ${ch.goal}</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>
        ${isDone
          ? `<div class="completed-overlay">ЗАВЕРШЕНО!</div>`
          : inProgress
            ? `<div class="progress-controls">
                <button class="btn-mini" data-action="minus" data-id="${ch.id}"><i class="fas fa-minus"></i></button>
                <button class="btn-mini" data-action="plus" data-id="${ch.id}"><i class="fas fa-plus"></i></button>
              </div>`
            : ""
        }
      </div>
    `;
  }

  // ====== Фильтрация по статусу (Активные / Завершённые) ======
  document.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await renderChallengesByStatus(btn.dataset.status);
      await updateStatusCountersAuto();
    });
  });

  async function renderChallengesByStatus(status) {
    const listEl = document.getElementById("bf-challenges-list");
    if (!listEl) return;

    const res = await fetch(`${BF_API_BASE}/challenges`);
    const all = await res.json();

    let filtered = [];
    if (status === "active")    filtered = all.filter(ch => ch.goal > 0 && ch.current > 0 && ch.current < ch.goal);
    if (status === "completed") filtered = all.filter(ch => ch.goal > 0 && ch.current >= ch.goal);

    if (!filtered.length) {
      listEl.innerHTML = status === "active"
        ? `<div class="no-active-message">💡 Нет активных испытаний.<br>Дважды тапните по карточке во вкладке <b>«Общее»</b>.</div>`
        : `<div class="no-active-message">💤 Завершённых пока нет.</div>`;
      return;
    }

    listEl.innerHTML = filtered.map(ch => createChallengeCard(ch)).join('');
  }

  // ====== Обновление прогресса (+/-) ======
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-mini");
    if (!btn) return;

    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;
    if (!id || !action) return;

    const delta = action === "plus" ? 1 : -1;
    updateProgress(id, delta);
  });

  async function updateProgress(id, delta) {
    try {
      const res = await fetch(`${BF_API_BASE}/challenges/${id}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta, initData: tg?.initData || "" })
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();

      // Переходы статусов
      if (updated.current >= updated.goal) {
        showToast("✅ Испытание завершено!");
        await renderChallengesByStatus("completed");
      } else if (updated.current > 0 && updated.current < updated.goal) {
        await renderChallengesByStatus("active");
      } else if (updated.current <= 0) {
        await loadBfChallenges(); // вернём в "Общее"
      }

      await updateStatusCountersAuto();
    } catch (e) {
      console.error("Ошибка updateProgress:", e);
    }
  }

  // ====== Двойной клик по карточке — начать выполнение (+1 и перенос в Активные) ======
  document.addEventListener("dblclick", async (e) => {
    const card = e.target.closest(".challenge-card-user");
    if (!card || card.classList.contains("completed")) return;

    const id = Number(card.dataset.id);
    if (!id) return;

    // В "Общем" карточки не имеют кнопок, только dblclick, поэтому просто +1
    try {
      const res = await fetch(`${BF_API_BASE}/challenges/${id}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta: 1, initData: tg?.initData || "" })
      });
      if (!res.ok) throw new Error(await res.text());

      // Анимация старта
      card.style.transition = "all 0.4s ease";
      card.style.boxShadow = "0 0 20px rgba(0,255,120,0.6)";
      card.style.transform = "scale(1.03)";
      setTimeout(() => {
        card.style.boxShadow = "";
        card.style.transform = "";
      }, 600);

      // Убираем карточку из “Общего” и показываем "Активные"
      setTimeout(async () => {
        card.remove();
        showToast("🚀 Испытание начато!");
        await renderChallengesByStatus("active");
        await updateStatusCountersAuto();
      }, 700);
    } catch (err) {
      console.error("Ошибка при запуске испытания:", err);
    }
  });

  // ====== Поиск испытаний (в пользовательском списке) ======
  setupUserChallengeSearch();
  function setupUserChallengeSearch() {
    const searchInput = document.getElementById("bf-search-user");
    if (!searchInput) return;

    let searchTimeout = null;
    searchInput.addEventListener("input", async () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(async () => {
        const term = searchInput.value.trim().toLowerCase();
        const listEl = document.getElementById("bf-challenges-list");
        if (!listEl) return;

        if (!term) {
          // вернуть текущую вкладку категорий в "Общее"/категорию
          const activeTab = document.querySelector("#bf-tabs .tab-btn.active");
          const categoryId = activeTab?.dataset?.id || null;
          await loadBfChallenges(categoryId);
          return;
        }

        try {
          const res = await fetch(`${BF_API_BASE}/challenges`);
          const all = await res.json();

          const filtered = all.filter(ch => {
            const en = (ch.title_en || "").toLowerCase();
            const ru = (ch.title_ru || "").toLowerCase();
            const cat = (ch.category_name || "").toLowerCase();
            return en.includes(term) || ru.includes(term) || cat.includes(term);
          });

          if (!filtered.length) {
            listEl.innerHTML = `<p style="text-align:center;color:#8ea2b6;">Ничего не найдено</p>`;
            return;
          }
          listEl.innerHTML = filtered.map(ch => createChallengeCard(ch)).join("");
        } catch (e) {
          console.error("Ошибка при поиске испытаний:", e);
          listEl.innerHTML = `<p style="text-align:center;color:#8ea2b6;">Ошибка при поиске</p>`;
        }
      }, 300);
    });
  }

  // ====== Подсказка (показывать до 3 раз) ======
  (function tipOnceLimited() {
    const tipShownCount = parseInt(localStorage.getItem("bf_tip_shown_count") || "0", 10);
    if (tipShownCount >= 3) return;
    setTimeout(() => {
      const tip = document.createElement("div");
      tip.className = "bf-tip-popup";
      tip.textContent = "💡 Дважды нажмите на карточку в «Общем», чтобы начать испытание";
      document.body.appendChild(tip);
      setTimeout(() => tip.classList.add("show"), 100);
      setTimeout(() => {
        tip.classList.remove("show");
        setTimeout(() => tip.remove(), 500);
      }, 7000);
      localStorage.setItem("bf_tip_shown_count", String(tipShownCount + 1));
    }, 5000);
  })();

  // ====== Админ: таблица испытаний ======
  async function loadBfChallengesTable() {
    try {
      const res = await fetch(`${BF_API_BASE}/challenges`);
      bfChallenges = await res.json();

      const gridEl = document.getElementById("bf-challenges-grid");
      if (!gridEl) return;

      // Статистика
      document.getElementById("bf-total-challenges")?.innerText = String(bfChallenges.length);

      // Уникальные категории
      const categories = [...new Set(bfChallenges.map(ch => ch.category_name).filter(Boolean))];
      const filterSelect = document.getElementById("bf-filter-category");
      if (filterSelect) {
        filterSelect.innerHTML = '<option value="">Все категории</option>' + 
          categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
      }
      document.getElementById("bf-total-categories")?.innerText = String(categories.length);

      if (!bfChallenges.length) {
        gridEl.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="icon">🎯</div>
            <h3>Пока нет испытаний</h3>
            <p>Добавьте первое испытание, чтобы начать</p>
            <button class="btn btn-primary" onclick="document.getElementById('bf-add-challenge-db-btn')?.click()">
              ➕ Добавить испытание
            </button>
          </div>
        `;
        return;
      }

      gridEl.innerHTML = bfChallenges.map(ch => {
        return `
          <div class="challenge-card-admin" data-category="${ch.category_name || ''}">
            <div class="challenge-card-header">
              <span class="challenge-id">#${ch.id}</span>
              <span class="challenge-category">${ch.category_name || 'Без категории'}</span>
            </div>
            <div class="challenge-titles">
              <div class="challenge-title-en">${ch.title_en || 'Без названия'}</div>
              <div class="challenge-title-ru">${ch.title_ru || 'Без названия'}</div>
            </div>
            <div class="challenge-meta">
              <span>Текущий: ${ch.current ?? 0}</span>
              <span>Цель: ${ch.goal ?? 0}</span>
            </div>
            <div class="challenge-actions">
              <button class="btn-small btn-edit" onclick="editBfChallenge(${ch.id})">✏️ Редактировать</button>
              <button class="btn-small btn-delete" onclick="deleteBfChallenge(${ch.id})">🗑 Удалить</button>
            </div>
          </div>
        `;
      }).join('');

      setupAdminSearchAndFilter();
    } catch (e) {
      console.error("Ошибка при загрузке испытаний:", e);
      const gridEl = document.getElementById("bf-challenges-grid");
      if (gridEl) {
        gridEl.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="icon">❌</div>
            <h3>Ошибка загрузки</h3>
            <p>Не удалось загрузить испытания</p>
            <button class="btn btn-secondary" onclick="loadBfChallengesTable()">
              🔄 Повторить
            </button>
          </div>
        `;
      }
    }
  }

  function setupAdminSearchAndFilter() {
    const searchInput  = document.getElementById('bf-search-challenges');
    const filterSelect = document.getElementById('bf-filter-category');
    const filterChallenges = () => {
      const searchTerm = (searchInput?.value || "").toLowerCase();
      const selectedCategory = filterSelect?.value || "";
      document.querySelectorAll('.challenge-card-admin').forEach(card => {
        const titleEn = card.querySelector('.challenge-title-en')?.textContent?.toLowerCase() || "";
        const titleRu = card.querySelector('.challenge-title-ru')?.textContent?.toLowerCase() || "";
        const category = card.getAttribute('data-category') || "";
        const matchesSearch = titleEn.includes(searchTerm) || titleRu.includes(searchTerm);
        const matchesCategory = !selectedCategory || category === selectedCategory;
        card.style.display = (matchesSearch && matchesCategory) ? 'block' : 'none';
      });
    };
    searchInput?.addEventListener('input', filterChallenges);
    filterSelect?.addEventListener('change', filterChallenges);
  }

  // ====== CRUD испытаний (админ) ======
  document.getElementById("bf-submit-challenge")?.addEventListener("click", addBfChallenge);

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

  async function addBfChallenge() {
    const categorySelect = document.getElementById("bf-category-select");
    const categoryId = categorySelect?.value || null;
    const categoryName =
      bfCategories.find(c => String(c.id) === String(categoryId))?.name ||
      document.getElementById("bf-new-category")?.value?.trim() ||
      "";

    const title_en = document.getElementById("bf-title-en")?.value?.trim() || "";
    const title_ru = document.getElementById("bf-title-ru")?.value?.trim() || "";
    const current  = 0; // всегда ноль при создании
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
    } catch (err) {
      console.error("Ошибка при сохранении испытания:", err);
      alert("❌ Не удалось сохранить испытание");
    }
  }

  // Глобальные функции для админских кнопок
  window.deleteBfChallenge = async function (id) {
    if (!confirm("Удалить испытание?")) return;
    try {
      const res = await fetch(`${BF_API_BASE}/challenges/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg?.initData || "" })
      });
      if (!res.ok) {
        const text = await res.text();
        alert(`❌ Ошибка при удалении испытания\nHTTP ${res.status}\n${text}`);
        return;
      }
      alert("✅ Испытание удалено");
      await loadBfChallengesTable();
    } catch (e) {
      console.error("Ошибка при удалении испытания:", e);
      alert("❌ Не удалось удалить испытание");
    }
  };

  window.editBfChallenge = async function(id) {
    const ch = bfChallenges.find(c => c.id === id);
    if (!ch) {
      // если не найдено в текущем массиве — подгрузим и ещё раз попробуем
      try {
        const res = await fetch(`${BF_API_BASE}/challenges`);
        bfChallenges = await res.json();
      } catch {}
    }
    const ch2 = bfChallenges.find(c => c.id === id);
    if (!ch2) return;

    editingChallengeId = id;
    showBfScreen("add");
    prepAddForm(ch2);
    await populateCategorySelect(ch2.category_id);
    document.getElementById("bf-title-en")?.value = ch2.title_en || "";
    document.getElementById("bf-title-ru")?.value = ch2.title_ru || "";
    document.getElementById("bf-current")?.value  = ch2.current ?? 0;
    document.getElementById("bf-goal")?.value     = ch2.goal ?? 0;
  };

  // ====== Тост уведомления ======
  function showToast(text) {
    const toast = document.createElement("div");
    toast.className = "bf-toast";
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 30);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 250);
    }, 2200);
  }

  // ====== Финальный пересчёт при готовности ======
  await updateStatusCountersAuto();
}); // end DOMContentLoaded
