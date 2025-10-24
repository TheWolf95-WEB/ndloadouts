// ===============================
// 📦 VERSION HISTORY LOGIC (BF style TOAST + DATE)
// ===============================
console.log("version.js loaded");

let quillVersion;
let isAdminVersion = false;
let currentFilter = "published"; // вкладка по умолчанию

// ===============================
// 🍞 TOASTS — classes, auto-hide
// ===============================
function initToastContainer() {
  let tc = document.getElementById("toast-container");
  if (!tc) {
    tc = document.createElement("div");
    tc.id = "toast-container";
    document.body.appendChild(tc);
  }
}

function showToast(type = "info", message = "", duration = 5000) {
  initToastContainer();
  const tc = document.getElementById("toast-container");
  if (!tc) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon"></span><div class="toast-message">${message}</div>`;
  tc.appendChild(toast);

  // Появление
  requestAnimationFrame(() => toast.classList.add("show"));

  // Автоисчезание
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ===============================
// 🕒 Дата — красивый формат
// ===============================
function formatDatePretty(dateStr) {
  if (!dateStr) return "";
  const months = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"
  ];
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ===============================
// 🚀 Инициализация
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  // Проверяем пользователя
  try {
    const me = await fetch("/api/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tg.initData })
    }).then(r => r.json());
    isAdminVersion = !!me.is_admin;
  } catch {
    showToast("error", "Не удалось загрузить профиль пользователя");
  }

  if (isAdminVersion) {
    const panel = document.getElementById("version-admin-panel");
    const tabs = document.querySelector(".version-tabs");
    if (panel) panel.style.display = "block";
    if (tabs) tabs.style.display = "flex";
  }

  // Quill
  try {
    quillVersion = new Quill("#version-quill", {
      theme: "snow",
      placeholder: "Описание изменений..."
    });
  } catch {
    showToast("error", "Ошибка инициализации редактора");
  }

  // Дата по умолчанию
  const dateInput = document.getElementById("version-date-input");
  if (dateInput) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }

  // Стартовая загрузка
  await loadVersions();

  // Табы
  document.querySelectorAll(".version-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".version-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentFilter = tab.dataset.filter;
      loadVersions();
    });
  });

  // Кнопки действий
  const publishBtn = document.getElementById("version-publish-btn");
  const draftBtn = document.getElementById("version-draft-btn");
  const updateBtn = document.getElementById("version-update-btn");

  if (publishBtn) publishBtn.addEventListener("click", () => saveVersion("published"));
  if (draftBtn) draftBtn.addEventListener("click", () => saveVersion("draft"));
  if (updateBtn) updateBtn.addEventListener("click", updateVersion);
});

// Автодобавление "v"
const versionInput = document.getElementById("version-input");
if (versionInput) {
  versionInput.addEventListener("input", () => {
    if (!versionInput.value.startsWith("v")) {
      versionInput.value = "v" + versionInput.value.replace(/[^0-9.]/g, "");
    }
  });
}

// ===============================
// 📥 Загрузка версий
// ===============================
async function loadVersions() {
  const list = document.getElementById("version-list");
  if (!list) return;

  list.innerHTML = "Загрузка...";

  try {
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

    if (!list.children.length) {
      const empty = document.createElement("div");
      empty.textContent = currentFilter === "draft" ? "Черновиков пока нет" : "Опубликованных версий пока нет";
      empty.style.opacity = "0.7";
      list.appendChild(empty);
    }
  } catch {
    list.innerHTML = "";
    showToast("error", "Ошибка загрузки списка версий");
  }
}

// ===============================
// 🪪 Карточка версии
// ===============================
function renderVersionCard(v) {
  const card = document.createElement("div");
  card.className = "version-card";

  const textContent = (v.content || "").replace(/<[^>]*>/g, "");
  const shortText = textContent.substring(0, 250);
  const isLong = textContent.length > 250;

  card.innerHTML = `
    <div class="version-title">${v.version} – ${v.title}</div>
    <div class="version-date">🗓 ${formatDatePretty(v.date) || formatDatePretty(v.created_at)}</div>
    <div class="version-content-preview">${shortText}${isLong ? "..." : ""}</div>
    ${isLong ? `<button class="version-toggle">Читать полностью</button>` : ""}
    <div class="version-content-full" style="display:none;">${v.content || ""}</div>
    ${isAdminVersion ? `
      <div class="version-actions">
        <button class="edit"
          data-id="${v.id}"
          data-version="${v.version}"
          data-title="${v.title}"
          data-date="${v.date}"
          data-content='${encodeURIComponent(v.content || "")}'>✏ Редактировать</button>
        <button class="delete" data-id="${v.id}">🗑 Удалить</button>
      </div>` : ""}
  `;

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

  if (isAdminVersion) {
    card.querySelector(".edit").addEventListener("click", (e) => {
      const btn = e.target;
      document.getElementById("version-editor").style.display = "block";
      document.getElementById("version-input").value = btn.dataset.version || "v";
      document.getElementById("version-title-input").value = btn.dataset.title || "";

      let safeDate = btn.dataset.date;
      if (!safeDate || safeDate === "null" || safeDate === "undefined") {
        safeDate = new Date().toISOString().split("T")[0];
      }
      document.getElementById("version-date-input").value = safeDate;

      quillVersion.root.innerHTML = decodeURIComponent(btn.dataset.content || "");
      document.getElementById("version-create-buttons").style.display = "none";
      document.getElementById("version-update-btn").style.display = "block";
      document.getElementById("version-update-btn").dataset.id = btn.dataset.id;
    });

    card.querySelector(".delete").addEventListener("click", async () => {
      if (!confirm("Удалить версию навсегда?")) return;
      await deleteVersion(v.id);
    });
  }

  return card;
}

// ===============================
// 💾 Сохранить новую версию
// ===============================
async function saveVersion(status) {
  const version = (document.getElementById("version-input").value || "").trim();
  const title = (document.getElementById("version-title-input").value || "").trim();
  const date = (document.getElementById("version-date-input").value || "").trim();
  const content = quillVersion?.root?.innerHTML || "";

  if (!version || !title || !date || !content) {
    showToast("warning", "Заполни все поля: версия, заголовок, дата и описание");
    return;
  }

  try {
    const res = await fetch("/api/version", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version, title, date, content, status, initData: tg.initData })
    }).then(r => r.json());

    if (res.status === "ok") {
      // published → зелёный, draft → синий
      showToast(status === "published" ? "success" : "info",
        status === "published" ? "Версия опубликована" : "Сохранено в черновики");
      loadVersions();
      resetEditor();
    } else {
      showToast("error", res.detail || "Ошибка сохранения версии");
    }
  } catch {
    showToast("error", "Сеть/сервер недоступны при сохранении версии");
  }
}

// ===============================
// ✏ Обновить существующую версию
// ===============================
async function updateVersion() {
  const id = document.getElementById("version-update-btn").dataset.id;
  const version = (document.getElementById("version-input").value || "").trim();
  const title = (document.getElementById("version-title-input").value || "").trim();
  const date = (document.getElementById("version-date-input").value || "").trim();
  const content = quillVersion?.root?.innerHTML || "";

  if (!version || !title || !date || !content) {
    showToast("warning", "Заполни все поля: версия, заголовок, дата и описание");
    return;
  }

  try {
    const res = await fetch(`/api/version/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version, title, date, content, initData: tg.initData })
    }).then(r => r.json());

    if (res.status === "ok") {
      // обновление → оранжевый
      showToast("warning", "Версия обновлена");
      loadVersions();
      resetEditor();
    } else {
      showToast("error", res.detail || "Ошибка обновления версии");
    }
  } catch {
    showToast("error", "Сеть/сервер недоступны при обновлении версии");
  }
}

// ===============================
// 🗑 Удалить версию
// ===============================
async function deleteVersion(id) {
  try {
    const res = await fetch(`/api/version/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tg.initData })
    }).then(r => r.json());

    if (res.status === "ok") {
      // удаление → красный
      showToast("error", "Версия удалена");
      loadVersions();
    } else {
      showToast("error", res.detail || "Ошибка удаления версии");
    }
  } catch {
    showToast("error", "Сеть/сервер недоступны при удалении версии");
  }
}

// === Открытие/закрытие админ-панели версий ===
const adminToggleBtn = document.getElementById("version-admin-toggle");
if (adminToggleBtn) {
  adminToggleBtn.addEventListener("click", () => {
    const editor = document.getElementById("version-editor");
    if (!editor) return;
    editor.style.display = (editor.style.display === "block") ? "none" : "block";
  });
}



// ===============================
// 🧽 Сброс формы
// ===============================
function resetEditor() {
  const vIn = document.getElementById("version-input");
  const tIn = document.getElementById("version-title-input");
  const dIn = document.getElementById("version-date-input");

  if (vIn) vIn.value = "v";
  if (tIn) tIn.value = "";
  if (dIn) dIn.value = new Date().toISOString().split("T")[0];
  if (quillVersion) quillVersion.root.innerHTML = "";

  const editor = document.getElementById("version-editor");
  const createBtns = document.getElementById("version-create-buttons");
  const updateBtn = document.getElementById("version-update-btn");

  if (editor) editor.style.display = "none";
  if (createBtns) createBtns.style.display = "flex";
  if (updateBtn) updateBtn.style.display = "none";
}
