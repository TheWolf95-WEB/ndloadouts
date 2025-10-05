// === Battlefield WebApp ===
document.addEventListener("DOMContentLoaded", async () => {
  const tg = window.Telegram.WebApp;
  tg.expand();

  console.log("🚀 Battlefield JS загружен");

  const userBtns = ["bf-show-builds-btn", "bf-challenges-btn", "bf-search-btn"];
  const adminBtns = [
    "bf-weapons-db-btn",
    "bf-challenges-db-btn",
    "bf-modules-dict-btn",
    "bf-add-build-btn",
    "bf-add-challenge-btn"
  ];

  const globalHome = document.querySelector("#screen-battlefield-main .global-home-button");

  // === Проверка роли ===
  try {
    const res = await fetch("/api/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tg.initData })
    });
    const data = await res.json();

    [...userBtns, ...adminBtns].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove("is-visible");
    });

    if (data.is_admin) {
      [...userBtns, ...adminBtns].forEach(id => document.getElementById(id)?.classList.add("is-visible"));
    } else {
      userBtns.forEach(id => document.getElementById(id)?.classList.add("is-visible"));
    }

    if (globalHome) globalHome.style.display = "block";
  } catch (err) {
    console.error("Ошибка статуса Battlefield:", err);
  }

  // === Навигация ===
  document.getElementById("bf-challenges-btn")?.addEventListener("click", () => {
    showBfScreen("main");
    loadBfCategories();
  });

  document.getElementById("bf-challenges-db-btn")?.addEventListener("click", () => {
    showBfScreen("db");
    loadBfChallengesTable();
  });

  document.getElementById("bf-add-challenge-btn")?.addEventListener("click", () => {
    editingChallengeId = null;
    showBfScreen("add");
    loadBfCategories();
  });

  document.getElementById("bf-add-challenge-db-btn")?.addEventListener("click", () => {
    editingChallengeId = null;
    showBfScreen("add");
    loadBfCategories();
  });

  // Кнопки "Назад"
  document.getElementById("bf-back-from-add")?.addEventListener("click", showBfMain);
  document.getElementById("bf-back-to-bfmain")?.addEventListener("click", showBfMain);
  document.getElementById("bf-back-from-challenges")?.addEventListener("click", showBfMain);

  // Добавление вкладки и сохранение испытаний
  document.getElementById("bf-add-category-btn")?.addEventListener("click", addBfCategory);
  document.getElementById("bf-submit-challenge")?.addEventListener("click", addBfChallenge);

  await loadBfCategories();
});

/* ============================
   Battlefield | Challenges
   ============================ */

const BF_API_BASE = "/api/bf";
let bfCategories = [];
let bfChallenges = [];
let editingChallengeId = null;

/* === Экраны === */
const bfScreens = {
  main: document.getElementById("screen-bf-challenges"),
  db: document.getElementById("screen-bf-challenges-db"),
  add: document.getElementById("screen-bf-add-challenge")
};

/* === Переключение экранов === */
function showBfScreen(id) {
  document.getElementById("screen-battlefield-main").style.display = "none";
  Object.values(bfScreens).forEach(el => el.style.display = "none");
  if (bfScreens[id]) bfScreens[id].style.display = "block";
}

function showBfMain() {
  Object.values(bfScreens).forEach(el => el.style.display = "none");
  document.getElementById("screen-battlefield-main").style.display = "block";
}

/* === Категории === */
async function loadBfCategories(selectedId = null) {
  try {
    const res = await fetch(`${BF_API_BASE}/categories`);
    bfCategories = await res.json();

    const tabsEl = document.getElementById("bf-tabs");
    if (tabsEl) {
      tabsEl.innerHTML = "";
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
      if (bfCategories.length > 0 && !selectedId) document.querySelector(".tab-btn")?.click();
    }

    const sel = document.getElementById("bf-category-select");
    if (sel) {
      sel.innerHTML = bfCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
      if (selectedId) sel.value = selectedId;
    }
  } catch (e) {
    console.error("Ошибка категорий:", e);
  }
}

/* === Добавление категории === */
async function addBfCategory() {
  const name = prompt("Введите название новой вкладки:");
  if (!name) return;
  const res = await fetch(`${BF_API_BASE}/categories?user_id=${window.userInfo?.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  if (res.ok) {
    alert("✅ Вкладка добавлена");
    await loadBfCategories();
  } else {
    alert("Ошибка при добавлении вкладки");
  }
}

/* === Испытания === */
async function loadBfChallenges(categoryId = null) {
  try {
    const url = categoryId
      ? `${BF_API_BASE}/challenges?category_id=${categoryId}`
      : `${BF_API_BASE}/challenges`;
    const res = await fetch(url);
    bfChallenges = await res.json();

    const listEl = document.getElementById("bf-challenges-list");
    listEl.innerHTML = "";

    if (bfChallenges.length === 0) {
      listEl.innerHTML = "<p style='text-align:center;color:#888;'>Пока нет испытаний</p>";
      return;
    }

    bfChallenges.forEach(ch => {
      const percent = ch.goal > 0 ? Math.min((ch.current / ch.goal) * 100, 100) : 0;
      const card = document.createElement("div");
      card.className = "challenge-card";
      card.innerHTML = `
        <div class="challenge-header">
          <h3 class="challenge-title">${ch.title_en}</h3>
          <span class="challenge-progress">${ch.current}/${ch.goal}</span>
        </div>
        <p class="challenge-subtitle">${ch.title_ru}</p>
        <div class="challenge-bar"><div class="challenge-fill" style="width:${percent}%;"></div></div>
      `;
      listEl.appendChild(card);
    });
  } catch (e) {
    console.error("Ошибка испытаний:", e);
  }
}

/* === Таблица испытаний === */
async function loadBfChallengesTable() {
  try {
    const res = await fetch(`${BF_API_BASE}/challenges`);
    bfChallenges = await res.json();

    const tableEl = document.getElementById("bf-challenges-table");
    tableEl.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th><th>Категория</th><th>EN</th><th>RU</th><th>Прогресс</th><th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${bfChallenges.map(ch => `
            <tr>
              <td>${ch.id}</td>
              <td>${ch.category_name || "-"}</td>
              <td>${ch.title_en}</td>
              <td>${ch.title_ru}</td>
              <td>${ch.current}/${ch.goal}</td>
              <td>
                <button class="btn-small" onclick="editBfChallenge(${ch.id})">✏️</button>
                <button class="btn-small" onclick="deleteBfChallenge(${ch.id})">🗑</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    `;
  } catch (e) {
    console.error("Ошибка таблицы испытаний:", e);
  }
}

/* === CRUD испытаний === */
async function addBfChallenge() {
  const data = {
    category_id: document.getElementById("bf-category-select").value,
    title_en: document.getElementById("bf-title-en").value.trim(),
    title_ru: document.getElementById("bf-title-ru").value.trim(),
    current: document.getElementById("bf-current").value,
    goal: document.getElementById("bf-goal").value
  };

  if (!data.title_en || !data.title_ru) return alert("Введите EN и RU");

  const method = editingChallengeId ? "PUT" : "POST";
  const url = editingChallengeId
    ? `${BF_API_BASE}/challenges/${editingChallengeId}?user_id=${window.userInfo?.id}`
    : `${BF_API_BASE}/challenges?user_id=${window.userInfo?.id}`;

  await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  alert(editingChallengeId ? "Испытание обновлено ✅" : "Испытание добавлено ✅");
  editingChallengeId = null;
  showBfMain();
}

/* === Удаление / Редактирование === */
async function deleteBfChallenge(id) {
  if (!confirm("Удалить испытание?")) return;
  await fetch(`${BF_API_BASE}/challenges/${id}?user_id=${window.userInfo?.id}`, { method: "DELETE" });
  loadBfChallengesTable();
}

function editBfChallenge(id) {
  const ch = bfChallenges.find(c => c.id === id);
  if (!ch) return;

  editingChallengeId = id;
  showBfScreen("add");

  document.getElementById("bf-title-en").value = ch.title_en;
  document.getElementById("bf-title-ru").value = ch.title_ru;
  document.getElementById("bf-current").value = ch.current;
  document.getElementById("bf-goal").value = ch.goal;

  loadBfCategories(ch.category_id);
}
