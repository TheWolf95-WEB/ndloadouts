// ===============================
// 📦 VERSION HISTORY LOGIC (обновлено + ALERTS + DATE)
// ===============================
console.log("version.js loaded");

let quillVersion;
let isAdminVersion = false;
let currentFilter = "published"; // вкладка по умолчанию

function formatDatePretty(dateStr) {
  if (!dateStr) return "";
  const months = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"
  ];
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

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

  // Устанавливаем дату по умолчанию
  const dateInput = document.getElementById("version-date-input");
  dateInput.value = new Date().toISOString().split("T")[0];

  // Загружаем версии
  loadVersions();

  // Переключение вкладок
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

// Автодобавление "v"
const versionInput = document.getElementById("version-input");
versionInput.addEventListener("input", () => {
  if (!versionInput.value.startsWith("v")) {
    versionInput.value = "v" + versionInput.value.replace(/[^0-9.]/g, "");
  }
});

// Загрузка версий
async function loadVersions() {
  const list = document.getElementById("version-list");
  list.innerHTML = "Загрузка...";

  let versions = [];
  if (isAdminVersion && currentFilter === "draft") {
    versions = await fetch(`/api/version/all?initData=${encodeURIComponent(tg.initData)}`).then(r => r.json());
  } else {
    versions = await fetch("/api/version").then(r => r.json());
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
    <div class="version-date">🗓 ${formatDatePretty(v.date) || formatDatePretty(v.created_at)}</div>
    <div class="version-content-preview">${shortText}${isLong ? "..." : ""}</div>
    ${isLong ? `<button class="version-toggle">Читать полностью</button>` : ""}
    <div class="version-content-full" style="display:none;">${v.content}</div>
    ${isAdminVersion ? `
      <div class="version-actions">
        <button class="edit"
          data-id="${v.id}"
          data-version="${v.version}"
          data-title="${v.title}"
          data-date="${v.date}"
          data-content='${encodeURIComponent(v.content)}'>✏ Редактировать</button>
        <button class="delete" data-id="${v.id}">🗑 Удалить</button>
      </div>` : ""}
  `;

  // Показать полностью
  const toggle = card.querySelector(".version-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const full = card.querySelector(".version-content-full");
      const preview = card.querySelector(".version-content-preview");
      const expanded = full.style.display === "block";
      full.style.display = expanded ? "none" : "block";
      preview.style.display = expanded ? "block" : "none";
      toggle.textContent = expanded ? "Читать полностью" : "Скрыть";
    });
  }

  // Редактирование
  if (isAdminVersion) {
    card.querySelector(".edit").addEventListener("click", e => {
      const btn = e.target;
      document.getElementById("version-editor").style.display = "block";
      document.getElementById("version-input").value = btn.dataset.version;
      document.getElementById("version-title-input").value = btn.dataset.title;
      
      // ✅ Фикс null/undefined/пустой строки
      let safeDate = btn.dataset.date;
      if (!safeDate || safeDate === "null" || safeDate === "undefined") {
        safeDate = new Date().toISOString().split("T")[0];
      }
      document.getElementById("version-date-input").value = safeDate;

      quillVersion.root.innerHTML = decodeURIComponent(btn.dataset.content);
      document.getElementById("version-create-buttons").style.display = "none";
      document.getElementById("version-update-btn").style.display = "block";
      document.getElementById("version-update-btn").dataset.id = btn.dataset.id;
    });

    card.querySelector(".delete").addEventListener("click", () => deleteVersion(v.id));
  }

  return card;
}

// Сохранить версию
async function saveVersion(status) {
  const version = document.getElementById("version-input").value.trim();
  const title = document.getElementById("version-title-input").value.trim();
  const date = document.getElementById("version-date-input").value;
  const content = quillVersion.root.innerHTML;

  if (!version || !title || !date || !content) {
    alert("Все поля обязательны!");
    return;
  }

  const res = await fetch("/api/version", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version, title, date, content, status, initData: tg.initData })
  }).then(r => r.json());

  if (res.status === "ok") {
    alert(status === "published" ? "✅ Версия опубликована!" : "💾 Сохранено в черновики!");
    loadVersions();
    resetEditor();
  } else {
    alert("❌ Ошибка: " + res.detail);
  }
}

// Обновить версию
async function updateVersion() {
  const id = document.getElementById("version-update-btn").dataset.id;
  const version = document.getElementById("version-input").value.trim();
  const title = document.getElementById("version-title-input").value.trim();
  const date = document.getElementById("version-date-input").value;
  const content = quillVersion.root.innerHTML;

  if (!version || !title || !date || !content) {
    alert("Все поля обязательны!");
    return;
  }

  const res = await fetch(`/api/version/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version, title, date, content, initData: tg.initData })
  }).then(r => r.json());

  if (res.status === "ok") {
    alert("✏ Версия обновлена!");
    loadVersions();
    resetEditor();
  } else {
    alert("❌ Ошибка: " + res.detail);
  }
}

// Удалить версию
async function deleteVersion(id) {
  if (!confirm("Удалить версию навсегда?")) return;

  const res = await fetch(`/api/version/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: tg.initData })
  }).then(r => r.json());

  if (res.status === "ok") {
    alert("🗑 Версия удалена!");
    loadVersions();
  } else {
    alert("❌ Ошибка: " + res.detail);
  }
}

// Сброс
function resetEditor() {
  document.getElementById("version-input").value = "v";
  document.getElementById("version-title-input").value = "";
  document.getElementById("version-date-input").value = new Date().toISOString().split("T")[0];
  quillVersion.root.innerHTML = "";
  document.getElementById("version-editor").style.display = "none";
  document.getElementById("version-create-buttons").style.display = "flex";
  document.getElementById("version-update-btn").style.display = "none";
}
