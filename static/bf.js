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
  });
  document.getElementById("bf-add-challenge-db-btn")?.addEventListener("click", () => {
    editingChallengeId = null;
    showBfScreen("add");
    prepAddForm();
  });

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
    const name = document.getElementById("bf-category-input")?.value?.trim();
    if (!name) return alert("Введите название категории");
    try {
      const createdId = await ensureCategory(name); // создаст, если нет
      if (createdId) {
        alert("✅ Вкладка добавлена");
        await loadBfCategories();
      }
    } catch (err) {
      alert("❌ Ошибка при добавлении вкладки\n" + (err?.message || ""));
    }
  });

  // Сохранение испытания
  document.getElementById("bf-submit-challenge")?.addEventListener("click", addBfChallenge);

  // Стартовая загрузка вкладок для пользовательского экрана
  await loadBfCategories();

  // ===== Helpers =====
  function showBfScreen(screenId) {
    document.querySelectorAll(".screen").forEach(el => { el.classList.remove("active"); el.style.display = "none"; });
    document.getElementById("screen-battlefield-main").style.display = "none";
    const target = bfScreens[screenId];
    if (target) { target.style.display = "block"; target.classList.add("active"); }
  }

  function showBfMain() {
    Object.values(bfScreens).forEach(el => (el.style.display = "none"));
    const mainEl = document.getElementById("screen-battlefield-main");
    if (mainEl) { mainEl.style.display = "block"; mainEl.classList.add("active"); }
  }

  function prepAddForm(ch = null) {
    // Включаем инпуты на всякий случай и чистим значения
    ["bf-category-input","bf-title-en","bf-title-ru","bf-current","bf-goal"].forEach(id => {
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

      const created = await res.json().catch(() => ({}));
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

  async function loadBfChallenges(categoryId = null) {
    try {
      const url = categoryId ? `${BF_API_BASE}/challenges?category_id=${categoryId}` : `${BF_API_BASE}/challenges`;
      const res = await fetch(url);
      bfChallenges = await res.json();

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
              <td data-label="ID">${ch.id}</td>
              <td data-label="Категория">${ch.category_name || "-"}</td>
              <td data-label="EN">${ch.title_en}</td>
              <td data-label="RU">${ch.title_ru}</td>
              <td data-label="Прогресс">${ch.current}/${ch.goal}</td>
              <td data-label="Действия">
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
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    } catch (e) {
      console.error("Ошибка при загрузке таблицы испытаний:", e);
    }
  }

  // ===== CRUD испытаний =====
async function addBfChallenge() {
  const categoryName = document.getElementById("bf-category-input")?.value?.trim() || "";
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
    await loadBfCategories(); // сразу обновляем список категорий, чтобы убрать старые
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


  window.editBfChallenge = function(id) {
    const ch = bfChallenges.find(c => c.id === id);
    if (!ch) return;
    editingChallengeId = id;
    showBfScreen("add");
    prepAddForm(ch);
    document.getElementById("bf-category-input").value = ch.category_name || "";
    document.getElementById("bf-title-en").value = ch.title_en || "";
    document.getElementById("bf-title-ru").value = ch.title_ru || "";
    document.getElementById("bf-current").value  = ch.current ?? 0;
    document.getElementById("bf-goal").value     = ch.goal ?? 0;
  };
});
