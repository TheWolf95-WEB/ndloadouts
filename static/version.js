// ===============================
// 📦 VERSION HISTORY LOGIC
// ===============================
console.log("version.js loaded");

let quillVersion;
let isAdminVersion = false;

document.addEventListener("DOMContentLoaded", async () => {
  // Проверяем пользователя
  const me = await fetch("/api/me", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: tg.initData })
  }).then(r => r.json());

  isAdminVersion = me.is_admin;

  // Показываем админ-панель если админ
  if (isAdminVersion) {
    document.getElementById("version-admin-panel").style.display = "block";
  }

  // Инициализируем редактор Quill
  quillVersion = new Quill("#version-quill", {
    theme: "snow",
    placeholder: "Описание изменений..."
  });

  // Загружаем список версий
  loadVersions();

  // Открытие / закрытие редактора
  document.getElementById("version-admin-toggle").addEventListener("click", () => {
    const editor = document.getElementById("version-editor");
    editor.style.display = editor.style.display === "none" ? "block" : "none";
  });

  // Кнопка "Сохранить версию"
  document.getElementById("version-save-btn").addEventListener("click", saveVersion);
});

// ===============================
// Загрузка версий
// ===============================
async function loadVersions() {
  const list = document.getElementById("version-list");
  list.innerHTML = "Загрузка...";

  const versions = await fetch("/api/version").then(r => r.json());
  list.innerHTML = ""; // Очистили список

  versions.forEach(v => list.appendChild(renderVersionCard(v)));
}

// ===============================
// Рендер карточки версии
// ===============================
function renderVersionCard(v) {
  const card = document.createElement("div");
  card.className = "version-card";

  card.innerHTML = `
    <div class="version-title">${v.version} – ${v.title}</div>
    <div class="version-date">🗓 ${v.created_at}</div>
    <div class="version-content-preview">${v.content.substring(0, 120)}...</div>
    <button class="version-toggle">Читать полностью</button>
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

  // читать полностью
  card.querySelector(".version-toggle").addEventListener("click", () => {
    card.querySelector(".version-content-full").style.display = "block";
    card.querySelector(".version-toggle").style.display = "none";
  });

  // удалить версию
  if (isAdminVersion) {
    card.querySelector(".delete").addEventListener("click", () => deleteVersion(v.id));

    // редактировать версию
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

      // Перепривязываем кнопку
      const saveBtn = document.getElementById("version-save-btn");
      saveBtn.textContent = "💾 Сохранить изменения";
      saveBtn.onclick = () => updateVersion(id);
    });
  }

  return card;
}

// ===============================
// Сохранить новую версию
// ===============================
async function saveVersion() {
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
    body: JSON.stringify({ version, title, content, initData: tg.initData })
  }).then(r => r.json());

  if (res.status === "ok") {
    loadVersions();
    quillVersion.root.innerHTML = "";
    document.getElementById("version-title-input").value = "";
    document.getElementById("version-input").value = "";
  } else {
    alert("Ошибка: " + res.detail);
  }
}

// ===============================
// Обновить версию
// ===============================
async function updateVersion(id) {
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
    document.getElementById("version-editor").style.display = "none";
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
