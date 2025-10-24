// ===============================
// 📦 VERSION HISTORY LOGIC (обновлено)
// ===============================
console.log("version.js loaded");

let quillVersion;
let isAdminVersion = false;
let currentFilter = "published"; // вкладка по умолчанию

document.addEventListener("DOMContentLoaded", async () => {
  // Проверяем пользователя
  const me = await fetch("/api/me", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: tg.initData })
  }).then(r => r.json());

  isAdminVersion = me.is_admin;

  if (isAdminVersion) {
    document.getElementById("version-admin-panel").style.display = "block";
    document.querySelector(".version-tabs").style.display = "flex";
  }

  // Инициализируем редактор Quill
  quillVersion = new Quill("#version-quill", {
    theme: "snow",
    placeholder: "Описание изменений..."
  });

  // Загружаем версии
  loadVersions();

  // Переключение вкладок (Опубликованные / Черновики)
  document.querySelectorAll(".version-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".version-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentFilter = tab.dataset.filter;
      loadVersions();
    });
  });

  // Открытие / закрытие редактора
  document.getElementById("version-admin-toggle").addEventListener("click", () => {
    const editor = document.getElementById("version-editor");
    editor.style.display = editor.style.display === "none" ? "block" : "none";
  });

  // Кнопки действий
  document.getElementById("version-publish-btn").addEventListener("click", () => saveVersion("published"));
  document.getElementById("version-draft-btn").addEventListener("click", () => saveVersion("draft"));
  document.getElementById("version-update-btn").addEventListener("click", updateVersion);
});

// Загрузка версий
async function loadVersions() {
  const list = document.getElementById("version-list");
  list.innerHTML = "Загрузка...";

  let versions = [];
  if (isAdminVersion && currentFilter === "draft") {
    // Админ хочет видеть черновики → нужен initData
    versions = await fetch(`/api/version/all?initData=${encodeURIComponent(tg.initData)}`)
      .then(r => r.json());
  } else {
    // Обычные пользователи видят только опубликованные
    versions = await fetch("/api/version").then(r => r.json());
  }

  list.innerHTML = "";

  versions
    .filter(v => !isAdminVersion || v.status === currentFilter)
    .forEach(v => list.appendChild(renderVersionCard(v)));
}


// ===============================
// Рендер карточки версии
// ===============================
function renderVersionCard(v) {
  const card = document.createElement("div");
  card.className = "version-card";

  const shortText = v.content.replace(/<[^>]*>/g, "").substring(0, 250);
  const isLong = v.content.replace(/<[^>]*>/g, "").length > 250;

  card.innerHTML = `
    <div class="version-title">${v.version} – ${v.title}</div>
    <div class="version-date">🗓 ${v.created_at}</div>
    <div class="version-content-preview">${shortText}${isLong ? "..." : ""}</div>
    ${isLong ? `<button class="version-toggle">Читать полностью</button>` : ""}
    <div class="version-content-full" style="display:none;">${v.content}</div>
    ${isAdminVersion ? `
      <div class="version-actions">
        <button class="edit"
          data-id="${v.id}"
          data-version="${v.version}"
          data-title="${v.title}"
          data-content='${encodeURIComponent(v.content)}'>✏ Редактировать</button>
        <button class="delete" data-id="${v.id}">🗑 Удалить</button>
      </div>` : ""}
  `;

  // раскрытие текста
  const toggle = card.querySelector(".version-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const full = card.querySelector(".version-content-full");
      const preview = card.querySelector(".version-content-preview");

      const isExpanded = full.style.display === "block";
      if (isExpanded) {
        full.style.display = "none";
        preview.style.display = "block";
        toggle.textContent = "Читать полностью";
      } else {
        full.style.display = "block";
        preview.style.display = "none";
        toggle.textContent = "Скрыть";
      }
    });
  }

  // удалить / редактировать
  if (isAdminVersion) {
    card.querySelector(".delete").addEventListener("click", () => deleteVersion(v.id));

    card.querySelector(".edit").addEventListener("click", (e) => {
      const btn = e.target;
      const id = btn.dataset.id;
      const version = btn.dataset.version;
      const title = btn.dataset.title;
      const content = decodeURIComponent(btn.dataset.content);

      // Открываем редактор
      document.getElementById("version-editor").style.display = "block";
      document.getElementById("version-input").value = version;
      document.getElementById("version-title-input").value = title;
      quillVersion.root.innerHTML = content;

      document.getElementById("version-create-buttons").style.display = "none";
      document.getElementById("version-update-btn").style.display = "block";
      document.getElementById("version-update-btn").dataset.id = id;
    });
  }

  return card;
}

// ===============================
// Сохранить версию
// ===============================
async function saveVersion(status) {
  const version = document.getElementById("version-input").value.trim();
  const title = document.getElementById("version-title-input").value.trim();
  const content = quillVersion.root.innerHTML;

  if (!version || !title || !content) {
    alert("Все поля обязательны!");
    return;
  }

  const res = await fetch("/api/version", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version, title, content, status, initData: tg.initData })
  }).then(r => r.json());

  if (res.status === "ok") {
    loadVersions();
    resetEditor();
  } else {
    alert("Ошибка: " + res.detail);
  }
}

// ===============================
// Обновить версию
// ===============================
async function updateVersion() {
  const id = document.getElementById("version-update-btn").dataset.id;
  const version = document.getElementById("version-input").value.trim();
  const title = document.getElementById("version-title-input").value.trim();
  const content = quillVersion.root.innerHTML;

  if (!version || !title || !content) {
    alert("Все поля обязательны!");
    return;
  }

  const res = await fetch(`/api/version/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version, title, content, initData: tg.initData })
  }).then(r => r.json());

  if (res.status === "ok") {
    loadVersions();
    resetEditor();
  } else {
    alert("Ошибка: " + res.detail);
  }
}

// ===============================
// Удалить версию
// ===============================
async function deleteVersion(id) {
  if (!confirm("Удалить версию навсегда?")) return;

  const res = await fetch(`/api/version/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: tg.initData })
  }).then(r => r.json());

  if (res.status === "ok") {
    loadVersions();
  } else {
    alert("Ошибка: " + res.detail);
  }
}

// ===============================
// Сброс редактора
// ===============================
function resetEditor() {
  document.getElementById("version-input").value = "";
  document.getElementById("version-title-input").value = "";
  quillVersion.root.innerHTML = "";
  document.getElementById("version-editor").style.display = "none";
  document.getElementById("version-create-buttons").style.display = "flex";
  document.getElementById("version-update-btn").style.display = "none";
}
