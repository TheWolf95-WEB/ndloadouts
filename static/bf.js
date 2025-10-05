// === Battlefield WebApp (stable) ===
document.addEventListener("DOMContentLoaded", async () => {
  const BF_API_BASE = "/api/bf";
  let bfCategories = [];
  let bfChallenges = [];
  let editingChallengeId = null;

  const tg = window.Telegram?.WebApp;
  if (tg) tg.expand();

  const bfScreens = {
    main: document.getElementById("screen-bf-challenges"),
    db: document.getElementById("screen-bf-challenges-db"),
    add: document.getElementById("screen-bf-add-challenge")
  };

  const userBtns  = ["bf-show-builds-btn","bf-challenges-btn","bf-search-btn"];
  const adminBtns = ["bf-weapons-db-btn","bf-challenges-db-btn","bf-modules-dict-btn","bf-add-build-btn","bf-add-challenge-btn"];

  // -------- Роль пользователя (не критично для UI, ошибки не ломают UI)
  try {
    const res  = await fetch("/api/me", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ initData: tg?.initData || "" })
    });
    const data = await res.json();
    window.userInfo = data.user || data;

    [...userBtns, ...adminBtns].forEach(id => document.getElementById(id)?.classList.remove("is-visible"));
    if (data.is_admin) [...userBtns, ...adminBtns].forEach(id => document.getElementById(id)?.classList.add("is-visible"));
    else userBtns.forEach(id => document.getElementById(id)?.classList.add("is-visible"));

    document.querySelector("#screen-battlefield-main .global-home-button")?.style?.setProperty("display","block");
  } catch(e) {
    console.warn("⚠️ /api/me недоступен (OK для локального теста)", e);
  }

  // -------- Навигация
  document.getElementById("bf-challenges-btn")?.addEventListener("click", async () => {
    showBfScreen("main");
    await loadBfCategories();
  });
  document.getElementById("bf-challenges-db-btn")?.addEventListener("click", async () => {
    showBfScreen("db");
    await loadBfChallengesTable();
  });
  document.getElementById("bf-add-challenge-btn")?.addEventListener("click", () => {
    editingChallengeId = null;
    showBfScreen("add");
    prepAddForm(); // включаем инпуты/сбрасываем форму
    populateCategorySelect();
  });
  document.getElementById("bf-add-challenge-db-btn")?.addEventListener("click", () => {
    editingChallengeId = null;
    showBfScreen("add");
    prepAddForm();
    populateCategorySelect();
  });

// === Загрузка категорий в выпадающий список ===
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
      if (selectedId && Number(selectedId) === cat.id) opt.selected = true;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error("Ошибка при загрузке категорий:", e);
  }
}

  

  // Кнопки "Назад" + страховка делегированием
  const hookBack = () => showBfMain();
  document.getElementById("bf-back-from-add")?.addEventListener("click", hookBack);
  document.getElementById("bf-back-to-bfmain")?.addEventListener("click", hookBack);
  document.getElementById("bf-back-from-challenges")?.addEventListener("click", hookBack);
  document.addEventListener("click", (e) => {
    if (["bf-back-from-add","bf-back-to-bfmain","bf-back-from-challenges"].includes(e.target?.id)) showBfMain();
  });

  // Добавление категории вручную (кнопка под полем "Категория")
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

    await populateCategorySelect(); // обновим выпадающий список
    const select = document.getElementById("bf-category-select");
    const newOption = [...select.options].find(o => o.textContent === name);
    if (newOption) newOption.selected = true;

  } catch (e) {
    console.error("Ошибка при добавлении категории:", e);
    alert("❌ Не удалось добавить категорию");
  }
});


  // Сохранение испытания
  document.getElementById("bf-submit-challenge")?.addEventListener("click", addBfChallenge);

  // Стартовая загрузка вкладок для пользовательского экрана
  await loadBfCategories();

  // ===== Helpers =====
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
  
    // 👇 вот это добавляем
    toggleBfBackButton(screenId);
  }

  function showBfMain() {
    Object.values(bfScreens).forEach(el => (el.style.display = "none"));
    const mainEl = document.getElementById("screen-battlefield-main");
    if (mainEl) { mainEl.style.display = "block"; mainEl.classList.add("active"); }
  }

  // === Управление кнопкой "Назад" Battlefield ===
  function toggleBfBackButton(screenId) {
    // Скрываем все кнопки "Назад"
    document.querySelectorAll("#bf-back-from-challenges, #bf-back-to-bfmain, #bf-back-from-add")
      .forEach(btn => btn.style.display = "none");
  
    // Показываем кнопку только в нужных экранах
    if (["main", "db", "add"].includes(screenId)) {
      const backBtn = {
        main: document.getElementById("bf-back-from-challenges"),
        db: document.getElementById("bf-back-to-bfmain"),
        add: document.getElementById("bf-back-from-add")
      }[screenId];
      if (backBtn) backBtn.style.display = "block";
    }
  }


  function prepAddForm(ch = null) {
    // Включаем инпуты на всякий случай и чистим значения
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

  // Создаёт категорию, если её нет. Возвращает id категории.
  async function ensureCategory(name) {
    try {
      // Обновляем локальный список категорий
      if (!bfCategories.length) {
        const r = await fetch(`${BF_API_BASE}/categories`);
        bfCategories = await r.json();
      }

      const exists = bfCategories.find(c => (c.name || "").trim().toLowerCase() === name.trim().toLowerCase());
      if (exists) return exists.id;

      const res = await fetch(`${BF_API_BASE}/categories`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          name,
          initData: tg?.initData || ""
        })
      });


      if (!res.ok) {
        const text = await res.text().catch(()=>"");
        throw new Error(`HTTP ${res.status} ${res.statusText} | ${text}`);
      }

      let created;
      try {
          created = await res.json();
      } catch (e) {
          console.error("Ошибка парсинга JSON:", e);
          created = {};
      }
      const newId = created?.id ?? created?.category_id ?? null;

      // Обновляем кэш категорий
      try {
        const r2 = await fetch(`${BF_API_BASE}/categories`);
        bfCategories = await r2.json();
      } catch {}

      return newId;
    } catch (e) {
      console.error("ensureCategory error:", e);
      throw e;
    }
  }

  // ===== Категории / Испытания =====
  async function loadBfCategories() {
    try {
      const res = await fetch(`${BF_API_BASE}/categories`);
      bfCategories = await res.json();

      const tabsEl = document.getElementById("bf-tabs");
      if (tabsEl) {
        tabsEl.innerHTML = "";
        if (!bfCategories.length) {
          tabsEl.innerHTML = "<p style='text-align:center;color:#777;'>Нет категорий</p>";
        } else {
          bfCategories.forEach(cat => {
            const btn = document.createElement("div");
            btn.className = "tab-btn";
            btn.textContent = cat.name;
            btn.onclick = () => {
              document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
              btn.classList.add("active");
              loadBfChallenges(cat.id);
            };
            tabsEl.appendChild(btn);
          });
          // авто-подгрузка первой категории
          document.querySelector(".tab-btn")?.classList.add("active");
          await loadBfChallenges(bfCategories[0].id);
        }
      }
    } catch (e) {
      console.error("Ошибка при загрузке категорий:", e);
    }
  }

// JS фильтрацию по статусу:
document.querySelectorAll('.status-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const alreadyActive = btn.classList.contains('active');
    document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));

    if (alreadyActive) {
      document.getElementById("bf-challenges-list").innerHTML = "";
      return; // если повторно нажали — очистить экран
    }

    btn.classList.add('active');
    renderChallengesByStatus(btn.dataset.status);
  });
});


async function renderChallengesByStatus(status) {
  const listEl = document.getElementById("bf-challenges-list");
  if (!listEl) return;

  // Загружаем все испытания со всех категорий
  const res = await fetch(`${BF_API_BASE}/challenges`);
  const all = await res.json();

  // Фильтрация
  const filtered = all.filter(ch => {
    const completed = ch.goal > 0 && ch.current >= ch.goal;
    if (status === "completed") return completed;
    if (status === "active") return ch.current > 0 && !completed;
    return false;
  });

  // Вывод
  if (!filtered.length) {
    listEl.innerHTML = `<p style="text-align:center;color:#8ea2b6;">Нет испытаний</p>`;
    return;
  }

  listEl.innerHTML = filtered.map(ch => {
    const percent = ch.goal > 0 ? Math.min((ch.current / ch.goal) * 100, 100) : 0;
    return `
      <div class="challenge-card-user" data-id="${ch.id}">
        ${ch.category_name ? `<div class="challenge-category">${ch.category_name}</div>` : ""}
        <div class="challenge-title-en">${ch.title_en}</div>
        <div class="challenge-title-ru">${ch.title_ru}</div>
        <div class="progress-text">
          <span>Прогресс</span>
          <span>${ch.current} / ${ch.goal}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${percent}%; transition: width 0.3s ease;"></div>
        </div>
        <div class="progress-controls">
          <button class="btn-mini" data-action="minus" data-id="${ch.id}">
            <i class="fas fa-minus"></i>
          </button>
          <button class="btn-mini" data-action="plus" data-id="${ch.id}">
            <i class="fas fa-plus"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}


function renderChallenges(list) {
  const listEl = document.getElementById("bf-challenges-list");
  listEl.innerHTML = list.map(ch => createChallengeCard(ch)).join('');
}
  
  

async function loadBfChallenges(categoryId = null) {
  try {
    const url = categoryId
      ? `${BF_API_BASE}/challenges?category_id=${categoryId}`
      : `${BF_API_BASE}/challenges`;
    const res = await fetch(url);
    bfChallenges = await res.json();

    const listEl = document.getElementById("bf-challenges-list");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!bfChallenges.length) {
      listEl.innerHTML = `<p style="text-align:center;color:#8ea2b6;">Пока нет испытаний</p>`;
      return;
    }

  listEl.innerHTML = bfChallenges.map(ch => {
    const percent = ch.goal > 0 ? Math.min((ch.current / ch.goal) * 100, 100) : 0;
    return `
      <div class="challenge-card-user" data-id="${ch.id}">
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
  
        <div class="progress-controls">
          <button class="btn-mini" data-action="minus" data-id="${ch.id}">
            <i class="fas fa-minus"></i>
          </button>
          <button class="btn-mini" data-action="plus" data-id="${ch.id}">
            <i class="fas fa-plus"></i>
          </button>
        </div>
      </div>
    `;
  }).join("");
  } catch (e) {
    console.error("Ошибка при загрузке испытаний:", e);
  }
}

async function updateProgress(id, delta) {
  const ch = bfChallenges.find(c => c.id === id);
  if (!ch) return;

  const newValue = Math.max(0, Math.min(ch.goal, ch.current + delta));
  if (newValue === ch.current) return;

  ch.current = newValue;

  // 🔄 Обновляем визуально без перезагрузки
  const card = document.querySelector(`.challenge-card-user[data-id="${id}"]`);
  if (card) {
    const bar = card.querySelector(".progress-fill");
    const text = card.querySelector(".progress-text span:last-child");
    const percent = ch.goal > 0 ? Math.min((newValue / ch.goal) * 100, 100) : 0;
    bar.style.width = `${percent}%`;
    text.textContent = `${newValue} / ${ch.goal}`;
  }

  // 💾 Отправляем на сервер
  try {
    await fetch(`/api/bf/challenges/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current: newValue,
        initData: tg?.initData || ""
      })
    });
  } catch (e) {
    console.error("Ошибка при обновлении прогресса:", e);
  }
}

  

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

      // Если поле пустое — вернуть текущую категорию
      if (!term) {
        const activeTab = document.querySelector("#bf-tabs .tab-btn.active");
        const categoryId = activeTab?.dataset?.id || null;
        await loadBfChallenges(categoryId);
        return;
      }

      // Загружаем все испытания
      try {
        const res = await fetch(`${BF_API_BASE}/challenges`);
        const all = await res.json();

        const filtered = all.filter(ch => {
          const en = (ch.title_en || "").toLowerCase();
          const ru = (ch.title_ru || "").toLowerCase();
          const cat = (ch.category_name || "").toLowerCase();
          return en.includes(term) || ru.includes(term) || cat.includes(term);
        });

        // Вывод
        listEl.innerHTML = "";
        if (!filtered.length) {
          listEl.innerHTML = `<p style="text-align:center;color:#8ea2b6;">Ничего не найдено</p>`;
          return;
        }

        listEl.innerHTML = filtered.map(ch => {
          const percent = ch.goal > 0 ? Math.min((ch.current / ch.goal) * 100, 100) : 0;
          return `
            <div class="challenge-card-user">
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
            </div>
          `;
        }).join("");
      } catch (e) {
        console.error("Ошибка при поиске испытаний:", e);
        listEl.innerHTML = `<p style="text-align:center;color:#8ea2b6;">Ошибка при поиске</p>`;
      }
    }, 300); // задержка 300мс для плавного поиска
  });
}


setupUserChallengeSearch();
    

async function loadBfChallengesTable() {
  try {
    const res = await fetch(`${BF_API_BASE}/challenges`);
    bfChallenges = await res.json();

    const gridEl = document.getElementById("bf-challenges-grid");
    if (!gridEl) return;

    // Обновляем статистику
    document.getElementById("bf-total-challenges").textContent = bfChallenges.length;
    
    // Получаем уникальные категории для фильтра
    const categories = [...new Set(bfChallenges.map(ch => ch.category_name).filter(Boolean))];
    const filterSelect = document.getElementById("bf-filter-category");
    filterSelect.innerHTML = '<option value="">Все категории</option>' + 
      categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    
    document.getElementById("bf-total-categories").textContent = categories.length;

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

    gridEl.innerHTML = bfChallenges.map(ch => {
      const percent = ch.goal > 0 ? Math.min((ch.current / ch.goal) * 100, 100) : 0;
      
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
          
          <div class="challenge-progress-admin">
            <div class="progress-text">
              <span>Прогресс</span>
              <span>${ch.current} / ${ch.goal}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${percent}%"></div>
            </div>
          </div>
          
          <div class="challenge-actions">
            <button class="btn-small btn-edit" onclick="editBfChallenge(${ch.id})">
              ✏️ Редактировать
            </button>
            <button class="btn-small btn-delete" onclick="deleteBfChallenge(${ch.id})">
              🗑 Удалить
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Добавляем функциональность поиска и фильтрации
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
          <button class="btn btn-secondary" onclick="loadBfChallengesTable()">
            🔄 Повторить
          </button>
        </div>
      `;
    }
  }
}

// === Управление прогрессом через делегирование ===
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-mini");
  if (!btn) return;

  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;
  if (!id || !action) return;

  const delta = action === "plus" ? 1 : -1;
  updateProgress(id, delta);
});
  

// Функция для поиска и фильтрации
function setupSearchAndFilter() {
  const searchInput = document.getElementById('bf-search-challenges');
  const filterSelect = document.getElementById('bf-filter-category');
  
  const filterChallenges = () => {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedCategory = filterSelect.value;
    
    document.querySelectorAll('.challenge-card-admin').forEach(card => {
      const titleEn = card.querySelector('.challenge-title-en').textContent.toLowerCase();
      const titleRu = card.querySelector('.challenge-title-ru').textContent.toLowerCase();
      const category = card.getAttribute('data-category');
      
      const matchesSearch = titleEn.includes(searchTerm) || titleRu.includes(searchTerm);
      const matchesCategory = !selectedCategory || category === selectedCategory;
      
      card.style.display = (matchesSearch && matchesCategory) ? 'block' : 'none';
    });
  };
  
  searchInput.addEventListener('input', filterChallenges);
  filterSelect.addEventListener('change', filterChallenges);
}

  // ===== CRUD испытаний =====
async function addBfChallenge() {
  const categorySelect = document.getElementById("bf-category-select");
  const categoryId = categorySelect?.value || null;
  const categoryName =
    bfCategories.find(c => c.id == categoryId)?.name ||
    document.getElementById("bf-new-category")?.value?.trim() ||
    "";

  const title_en = document.getElementById("bf-title-en")?.value?.trim() || "";
  const title_ru = document.getElementById("bf-title-ru")?.value?.trim() || "";
  const current  = Number(document.getElementById("bf-current")?.value) || 0;
  const goal     = Number(document.getElementById("bf-goal")?.value) || 0;

  if (!categoryName) return alert("Введите категорию");
  if (!title_en || !title_ru) return alert("Введите названия EN и RU");
  if (goal <= 0) return alert("Цель должна быть > 0");

  let category_id = null;
  try {
    category_id = await ensureCategory(categoryName);
    //await loadBfCategories(); // сразу обновляем список категорий, чтобы убрать старые
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
      body: JSON.stringify({
        ...payload,
        initData: tg?.initData || ""
      })
    });

    if (!res.ok) {
      const text = await res.text().catch(()=> "");
      alert(`❌ Ошибка при сохранении испытания\nHTTP ${res.status} ${res.statusText}\n${text}`);
      return;
    }

    alert(editingChallengeId ? "✅ Испытание обновлено" : "✅ Испытание добавлено");
    editingChallengeId = null;
    showBfScreen("db");
    await loadBfChallengesTable();
  } catch (err) {
    console.error("Ошибка при сохранении испытания:", err);
    alert("❌ Не удалось сохранить испытание");
  }
}

window.deleteBfChallenge = async function (id) {
  if (!confirm("Удалить испытание?")) return;

  try {
    const res = await fetch(`/api/bf/challenges/${id}`, {
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


window.editBfChallenge = async function(id) { // ← Добавить async
    const ch = bfChallenges.find(c => c.id === id);
    if (!ch) return;
    editingChallengeId = id;
    showBfScreen("add");
    prepAddForm(ch);
    await populateCategorySelect(ch.category_id);
    document.getElementById("bf-title-en").value = ch.title_en || "";
    document.getElementById("bf-title-ru").value = ch.title_ru || "";
    document.getElementById("bf-current").value  = ch.current ?? 0;
    document.getElementById("bf-goal").value     = ch.goal ?? 0;
};
});
