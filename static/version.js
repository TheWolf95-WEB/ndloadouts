// ===============================
// 📦 VERSION HISTORY LOGIC (обновлено)
// ===============================
console.log("version.js loaded");

let quillVersion;
let isAdminVersion = false;
let currentFilter = "published"; // вкладка по умолчанию

document.addEventListener("DOMContentLoaded", async () => {
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

  quillVersion = new Quill("#version-quill", {
    theme: "snow",
    placeholder: "Описание изменений..."
  });

  loadVersions();

  document.querySelectorAll(".version-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".version-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentFilter = tab.dataset.filter;
      loadVersions();
    });
  });

  document.getElementById("version-admin-toggle").addEventListener("click", () => {
    const editor = document.getElementById("version-editor");
    editor.style.display = editor.style.display === "none" ? "block" : "none";
  });

  document.getElementById("version-publish-btn").addEventListener("click", () => saveVersion("published"));
  document.getElementById("version-draft-btn").addEventListener("click", () => saveVersion("draft"));
  document.getElementById("version-update-btn").addEventListener("click", updateVersion);
});

// Авто-"v" в начале версии
const versionInput = document.getElementById("version-input");
versionInput.addEventListener("input", () => {
  if (!versionInput.value.startsWith("v")) {
    versionInput.value = "v" + versionInput.value.replace(/[^0-9.]/g, "");
  }
});

// Загрузка списка версий
async function loadVersions() {
  const list = document.getElementById("version-list");
  list.innerHTML = "Загрузка...";

  let versions = [];
  try {
    if (isAdminVersion && currentFilter === "draft") {
      versions = await fetch(`/api/version/all?initData=${encodeURIComponent(tg.initData)}`).then(r => r.json());
    } else {
      versions = await fetch("/api/version").then(r => r.json());
    }
  } catch {
    list.innerHTML = "Ошибка загрузки версий";
    return;
  }

  list.innerHTML = "";

  versions
    .filter(v => !isAdminVersion || v.status === currentFilter)
    .forEach(v => list.appendChild(renderVersionCard(v)));
}

// Карточка версии
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
        <button class="edit" data-id="${v.id}" data-version="${v.version}" data-title="${v.title}" data-content='${encodeURIComponent(v.content)}'>✏ Редактировать</button>
        <button class="delete" data-id="${v.id}">🗑 Удалить</button>
      </div>` : ""}
  `;

  if (isLong) {
    card.querySelector(".version-toggle").addEventListener("click", () => {
      const full = card.querySelector(".version-content-full");
      const preview = card.querySelector(".version-content-preview");
      const isExpanded = full.style.display === "block";
      full.style.display = isExpanded ? "none" : "block";
      preview.style.display = isExpanded ? "block" : "none";
    });
  }

  if (isAdminVersion) {
    card.querySelector(".delete").addEventListener("click", () => deleteVersion(v.id));
    card.querySelector(".edit").addEventListener("click", e => {
      const btn = e.target;
      document.getElementById("version-editor").style.display = "block";
      document.getElementById("version-input").value = btn.dataset.version;
      document.getElementById("version-title-input").value = btn.dataset.title;
      quillVersion.root.innerHTML = decodeURIComponent(btn.dataset.content);
      document.getElementById("version-create-buttons").style.display = "none";
      document.getElementById("version-update-btn").style.display = "block";
      document.getElementById("version-update-btn").dataset.id = btn.dataset.id;
    });
  }

  return card;
}

// Добавление версии
async function saveVersion(status) {
  const version = document.getElementById("version-input").value.trim();
  const title = document.getElementById("version-title-input").value.trim();
  const content = quillVersion.root.innerHTML;

  if (!version || !title || !content) return alert("❗ Заполни все поля");

  const res = await fetch("/api/version", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version, title, content, status, initData: tg.initData })
  }).then(r => r.json());

  if (res.status === "ok") {
    alert(status === "published" ? "✅ Версия опубликована!" : "💾 Сохранено в черновики");
    loadVersions();
    resetEditor();
  } else {
    alert("❌ Ошибка: " + res.detail);
  }
}

// Обновление версии
async function updateVersion() {
  const id = document.getElementById("version-update-btn").dataset.id;
  const version = document.getElementById("version-input").value.trim();
  const title = document.getElementById("version-title-input").value.trim();
  const content = quillVersion.root.innerHTML;

  if (!version || !title || !content) return alert("❗ Заполни все поля");

  const res = await fetch(`/api/version/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version, title, content, initData: tg.initData })
  }).then(r => r.json());

  if (res.status === "ok") {
    alert("✅ Изменения сохранены");
    loadVersions();
    resetEditor();
  } else {
    alert("❌ Ошибка: " + res.detail);
  }
}

// Удаление версии
async function deleteVersion(id) {
  if (!confirm("Удалить версию навсегда?")) return;

  const res = await fetch(`/api/version/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: tg.initData })
  }).then(r => r.json());

  if (res.status === "ok") {
    alert("🗑 Версия удалена");
    loadVersions();
  } else {
    alert("❌ Ошибка: " + res.detail);
  }
}

// Очистка формы
function resetEditor() {
  document.getElementById("version-input").value = "";
  document.getElementById("version-title-input").value = "";
  quillVersion.root.innerHTML = "";
  document.getElementById("version-editor").style.display = "none";
  document.getElementById("version-create-buttons").style.display = "flex";
  document.getElementById("version-update-btn").style.display = "none";
}
