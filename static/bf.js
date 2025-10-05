// === Battlefield WebApp ===
document.addEventListener("DOMContentLoaded", async () => {
  console.log("📦 Battlefield DOM загружен");

  const tg = window.Telegram?.WebApp;
  if (tg) tg.expand();
  console.log("🚀 Battlefield WebApp запущен");

  // === Константы и глобальные переменные ===
  const BF_API_BASE = "/api/bf";
  let bfCategories = [];
  let bfChallenges = [];
  let editingChallengeId = null;

  // === Экраны ===
  const bfScreens = {
    main: document.getElementById("screen-bf-challenges"),
    db: document.getElementById("screen-bf-challenges-db"),
    add: document.getElementById("screen-bf-add-challenge")
  };

  const globalHome = document.querySelector("#screen-battlefield-main .global-home-button");

  const userBtns = ["bf-show-builds-btn", "bf-challenges-btn", "bf-search-btn"];
  const adminBtns = [
    "bf-weapons-db-btn",
    "bf-challenges-db-btn",
    "bf-modules-dict-btn",
    "bf-add-build-btn",
    "bf-add-challenge-btn"
  ];

  /* === Проверка роли пользователя === */
  try {
    const res = await fetch("/api/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tg?.initData || "" })
    });

    const data = await res.json();
    window.userInfo = data.user || data;

    // Скрываем всё, потом показываем нужное
    [...userBtns, ...adminBtns].forEach(id => document.getElementById(id)?.classList.remove("is-visible"));

    if (data.is_admin) {
      [...userBtns, ...adminBtns].forEach(id => document.getElementById(id)?.classList.add("is-visible"));
      console.log("👑 Battlefield: админ");
    } else {
      userBtns.forEach(id => document.getElementById(id)?.classList.add("is-visible"));
      console.log("👤 Battlefield: пользователь");
    }

    if (globalHome) globalHome.style.display = "block";
  } catch (err) {
    console.warn("⚠️ Не удалось проверить пользователя:", err);
  }

  /* === Навигация === */
  document.getElementById("bf-challenges-btn")?.addEventListener("click", async () => {
    showBfScreen("main");
    await loadBfCategories();
  });

  document.getElementById("bf-challenges-db-btn")?.addEventListener("click", async () => {
    showBfScreen("db");
    await loadBfChallengesTable();
  });

  document.getElementById("bf-add-challenge-btn")?.addEventListener("click", async () => {
    editingChallengeId = null;
    showBfScreen("add");
    await loadBfCategories();
  });

  document.getElementById("bf-add-challenge-db-btn")?.addEventListener("click", async () => {
    editingChallengeId = null;
    showBfScreen("add");
    await loadBfCategories();
  });

  // Назад
  document.getElementById("bf-back-from-add")?.addEventListener("click", showBfMain);
  document.getElementById("bf-back-to-bfmain")?.addEventListener("click", showBfMain);
  document.getElementById("bf-back-from-challenges")?.addEventListener("click", showBfMain);

  // Добавление вкладки / испытания
  document.getElementById("bf-add-category-btn")?.addEventListener("click", addBfCategory);
  document.getElementById("bf-submit-challenge")?.addEventListener("click", addBfChallenge);

  await loadBfCategories();

  /* ==========================
     ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
     ========================== */

  function showBfScreen(screenId) {
    document.querySelectorAll(".screen").forEach(el => {
      el.classList.remove("active");
      el.style.display = "none";
    });
    const target = bfScreens[screenId];
    if (target) {
      target.style.display = "block";
      target.classList.add("active");
      console.log(`🧭 Открыт экран Battlefield: ${screenId}`);
    }
  }

  function showBfMain() {
    Object.values(bfScreens).forEach(el => (el.style.display = "none"));
    const mainEl = document.getElementById("screen-battlefield-main");
    if (mainEl) {
      mainEl.style.display = "block";
      mainEl.classList.add("active");
    }
    console.log("🏠 Возврат в главное меню Battlefield");
  }


  /* === Категории === */
  async function loadBfCategories(selectedId = null) {
    try {
      const res = await fetch(`${BF_API_BASE}/categories`);
      bfCategories = await res.json();
      console.log("📦 Категории:", bfCategories);

      // --- вкладки для пользователя ---
      const tabsEl = document.getElementById("bf-tabs");
      if (tabsEl) {
        tabsEl.innerHTML = "";
        if (bfCategories.length === 0) {
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

          // Автоматически подгружаем первую категорию
          const first = bfCategories[0];
          document.querySelector(".tab-btn")?.classList.add("active");
          await loadBfChallenges(first.id);
        }
      }
    } catch (e) {
      console.error("Ошибка при загрузке категорий:", e);
    }
  }

  /* === Добавление категории === */
  async function addBfCategory() {
    const name = prompt("Введите название новой вкладки:");
    if (!name) return;

    try {
      const res = await fetch(`${BF_API_BASE}/categories?user_id=${window.userInfo?.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });

      if (res.ok) {
        alert("✅ Вкладка добавлена");
        await loadBfCategories();
      } else {
        alert("❌ Ошибка при добавлении вкладки");
      }
    } catch (err) {
      console.error("Ошибка добавления вкладки:", err);
    }
  }

  /* === Загрузка испытаний === */
  async function loadBfChallenges(categoryId = null) {
    try {
      const url = categoryId
        ? `${BF_API_BASE}/challenges?category_id=${categoryId}`
        : `${BF_API_BASE}/challenges`;
      const res = await fetch(url);
      bfChallenges = await res.json();
      console.log("🎯 Испытания:", bfChallenges);

      const listEl = document.getElementById("bf-challenges-list");
      if (!listEl) return;
      listEl.innerHTML = "";

      if (!bfChallenges.length) {
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
      console.error("Ошибка при загрузке испытаний:", e);
    }
  }

  /* === Таблица испытаний для админа === */
  async function loadBfChallengesTable() {
    try {
      const res = await fetch(`${BF_API_BASE}/challenges`);
      bfChallenges = await res.json();

      const tableEl = document.getElementById("bf-challenges-table");
      if (!tableEl) return;

      if (!bfChallenges.length) {
        tableEl.innerHTML = "<p style='text-align:center;color:#888;'>Пока нет испытаний</p>";
        return;
      }

      tableEl.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Категория</th>
              <th>EN</th>
              <th>RU</th>
              <th>Прогресс</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            ${bfChallenges
              .map(
                ch => `
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
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      `;
    } catch (e) {
      console.error("Ошибка при загрузке таблицы испытаний:", e);
    }
  }

  /* === Добавление / Редактирование испытаний === */
  async function addBfChallenge() {
    const data = {
      category_name: document.getElementById("bf-category-input")?.value.trim(),
      title_en: document.getElementById("bf-title-en")?.value.trim(),
      title_ru: document.getElementById("bf-title-ru")?.value.trim(),
      current: document.getElementById("bf-current")?.value || 0,
      goal: document.getElementById("bf-goal")?.value || 0
    };

    if (!data.title_en || !data.title_ru) return alert("Введите название EN и RU");

    const method = editingChallengeId ? "PUT" : "POST";
    const url = editingChallengeId
      ? `${BF_API_BASE}/challenges/${editingChallengeId}?user_id=${window.userInfo?.id}`
      : `${BF_API_BASE}/challenges?user_id=${window.userInfo?.id}`;

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        alert(editingChallengeId ? "✅ Испытание обновлено" : "✅ Испытание добавлено");
        editingChallengeId = null;
        showBfScreen("db");
        await loadBfChallengesTable();
      } else {
        alert("❌ Ошибка при сохранении испытания");
      }
    } catch (err) {
      console.error("Ошибка при сохранении испытания:", err);
    }
  }

  /* === Удаление испытания === */
  window.deleteBfChallenge = async function (id) {
    if (!confirm("Удалить испытание?")) return;
    await fetch(`${BF_API_BASE}/challenges/${id}?user_id=${window.userInfo?.id}`, { method: "DELETE" });
    await loadBfChallengesTable();
  };

  /* === Редактирование испытания === */
  window.editBfChallenge = function (id) {
    const ch = bfChallenges.find(c => c.id === id);
    if (!ch) return;

    editingChallengeId = id;
    showBfScreen("add");

    document.getElementById("bf-title-en").value = ch.title_en;
    document.getElementById("bf-title-ru").value = ch.title_ru;
    document.getElementById("bf-current").value = ch.current;
    document.getElementById("bf-goal").value = ch.goal;
    loadBfCategories(ch.category_id);
  };
});
