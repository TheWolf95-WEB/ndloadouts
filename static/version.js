// ===============================
// 📦 VERSION HISTORY LOGIC (NEW)
// ===============================
console.log("version.js loaded");

let quillVersion;
let isAdminVersion = false;
let isEditing = false; // флаг редактирования
let editingId = null;  // id редактируемой версии
let unsavedChanges = false;

// ===============================
// ИНИЦИАЛИЗАЦИЯ
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  const me = await fetch("/api/me", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: tg.initData })
  }).then(r => r.json());

  isAdminVersion = me.is_admin;

  if (isAdminVersion) {
    document.getElementById("version-admin-panel").style.display = "block";
  }

  quillVersion = new Quill("#version-quill", {
    theme: "snow",
    placeholder: "Описание изменений..."
  });

  quillVersion.on("text-change", () => {
    unsavedChanges = true;
  });

  loadVersions();

  document.getElementById("version-admin-toggle").addEventListener("click", toggleEditor);
  document.getElementById("version-publish-btn").addEventListener("click", () => saveVersion("published"));
  document.getElementById("version-draft-btn").addEventListener("click", () => saveVersion("draft"));
  document.getElementById("version-update-btn").addEventListener("click", updateVersion);
});

// ===============================
// Открыть/закрыть редактор
// ===============================
function toggleEditor() {
  const editor = document.getElementById("version-editor");

  if (editor.style.display === "block" && unsavedChanges) {
    if (!confirm("❗ У вас есть несохранённые изменения. Выйти без сохранения?"))
      return;
  }

  resetEditor();
  editor.style.display = editor.style.display === "none" ? "block" : "none";
}

// ===============================
// Сброс редактора
// ===============================
function resetEditor() {
  isEditing = false;
  editingId = null;
  unsavedChanges = false;

  document.getElementById("version-input").value = "";
  document.getElementById("version-title-input").value = "";
  quillVersion.root.innerHTML = "";

  document.getElementById("version-create-buttons").style.display = "flex";
  document.getElementById("version-update-btn").style.display = "none";
}

// ===============================
// Загрузка версий
// ===============================
async function loadVersions() {
  const list = document.getElementById("version-list");
  list.innerHTML = "Загрузка...";

  const versions = await fetch("/api/version").then(r => r.json());
  list.innerHTML = "";

  versions.forEach(v => list.appendChild(renderVersionCard(v)));
}

// ===============================
// Отрисовка карточки
// ===============================
function renderVersionCard(v) {
  const card = document.createElement("div");
  card.className = "version-card";

  card.innerHTML = `
    <div class="version-title">${v.version} – ${v.title}</div>
    <div class="version-date">🗓 ${v.created_at}</div>
    <div class="version-content-preview">${v.content.substring(0, 200)}...</div>
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

  card.querySelector(".version-toggle").addEventListener("click", () => {
    card.querySelector(".version-content-full").style.display = "block";
    card.querySelector(".version-toggle").style.display = "none";
  });

  if (isAdminVersion) {
    card.querySelector(".delete").addEventListener("click", () => deleteVersion(v.id));
    card.querySelector(".edit").addEventListener("click", e => startEdit(e, v.id));
  }

  return card;
}

// ===============================
// Начать редактирование версии
// ===============================
function startEdit(e, id) {
  const btn = e.target;
  isEditing = true;
  editingId = id;

  document.getElementById("version-editor").style.display = "block";
  document.getElementById("version-input").value = btn.dataset.version;
  document.getElementById("version-title-input").value = btn.dataset.title;
  quillVersion.root.innerHTML = decodeURIComponent(btn.dataset.content);

  document.getElementById("version-create-buttons").style.display = "none";
  document.getElementById("version-update-btn").style.display = "block";
}

// ===============================
// Сохранить версию (черновик / паблик)
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
  const version = document.getElementById("version-input").value.trim();
  const title = document.getElementById("version-title-input").value.trim();
  const content = quillVersion.root.innerHTML;

  const res = await fetch(`/api/version/${editingId}`, {
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
  }
}
