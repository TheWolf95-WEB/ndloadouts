// ===============================
// 📦 VERSION HISTORY LOGIC (обновлено + TOAST + DATE)
// ===============================
console.log("version.js loaded");

let quillVersion;
let isAdminVersion = false;
let currentFilter = "published"; // вкладка по умолчанию

// ===============================
// 🍞 TOASTS (NDHQ dark, emoji, auto-hide)
// ===============================
function initToastContainer() {
  let tc = document.getElementById("toast-container");
  if (!tc) {
    tc = document.createElement("div");
    tc.id = "toast-container";
    document.body.appendChild(tc);
  }
  // Базовые стили контейнера (на случай, если CSS ещё не подключён)
  Object.assign(tc.style, {
    position: "fixed",
    left: "50%",
    bottom: "18px",
    transform: "translateX(-50%)",
    display: "flex",
    flexDirection: "column-reverse", // новые сверху
    gap: "10px",
    zIndex: 9999,
    pointerEvents: "none", // клики проходят
  });
}

function showToast(type = "info", message = "", duration = 5000) {
  initToastContainer();
  const tc = document.getElementById("toast-container");

  const palette = {
    success: { emoji: "✅", bg: "rgba(40,40,40,0.92)", text: "#e7f8ea", border: "#4CAF50" },
    info:    { emoji: "ℹ️", bg: "rgba(40,40,40,0.92)", text: "#e8f2ff", border: "#2196F3" },
    warning: { emoji: "⚠️", bg: "rgba(40,40,40,0.92)", text: "#fff7e0", border: "#FFC107" },
    error:   { emoji: "❌", bg: "rgba(40,40,40,0.92)", text: "#ffeaea", border: "#F44336" }
  };
  const p = palette[type] || palette.info;

  const toast = document.createElement("div");
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.style.pointerEvents = "auto"; // чтобы свайп/клик работал при необходимости

  // Стили тоста (мягкий тёмный Telegram+)
  Object.assign(toast.style, {
    minWidth: "min(92vw, 540px)",
    maxWidth: "min(92vw, 540px)",
    color: p.text,
    background: p.bg,
    border: `1px solid ${p.border}`,
    borderLeft: `4px solid ${p.border}`,
    borderRadius: "10px",
    padding: "12px 14px",
    boxShadow: "0 8px 24px rgba(0,0,0,.35)",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "14px",
    lineHeight: "1.35",
    backdropFilter: "blur(4px)",
    transform: "translateY(30px)",
    opacity: "0",
    transition: "opacity .25s ease, transform .25s ease",
  });

  const iconEl = document.createElement("span");
  iconEl.textContent = p.emoji;
  iconEl.style.fontSize = "16px";
  iconEl.style.flex = "0 0 auto";

  const textEl = document.createElement("div");
  textEl.style.flex = "1 1 auto";
  textEl.style.wordBreak = "break-word";
  textEl.textContent = message;

  toast.appendChild(iconEl);
  toast.appendChild(textEl);

  tc.appendChild(toast);

  // Появление
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  // Автоисчезание
  const hide = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(30px)";
    setTimeout(() => {
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  };

  setTimeout(hide, duration);
}

// ===============================
// 🕒 Дата — красивый формат для карточек
// ===============================
function formatDatePretty(dateStr) {
  if (!dateStr) return "";
  const months = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"
  ];
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr; // защита на случай нестандарта
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
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
  } catch (e) {
    showToast("error", "Не удалось загрузить профиль пользователя");
  }

  if (isAdminVersion) {
    const panel = document.getElementById("version-admin-panel");
    const tabs = document.querySelector(".version-tabs");
    if (panel) panel.style.display = "block";
    if (tabs) tabs.style.display = "flex";
  }

  // Инициализируем редактор Quill
  try {
    quillVersion = new Quill("#version-quill", {
      theme: "snow",
      placeholder: "Описание изменений..."
    });
  } catch (e) {
    showToast("error", "Ошибка инициализации редактора");
  }

  // Устанавливаем дату по умолчанию
  const dateInput = document.getElementById("version-date-input");
  if (dateInput) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }

  // Загружаем версии
  await loadVersions();

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
  const toggleBtn = document.getElementById("version-admin-toggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const editor = document.getElementById("version-editor");
      if (!editor) return;
      const isHidden = editor.style.display === "none" || !editor.style.display;
      editor.style.display = isHidden ? "block" : "none";
    });
  }

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

    // Если пусто — дружелюбное сообщение
    if (!list.children.length) {
      const empty = document.createElement("div");
      empty.textContent = currentFilter === "draft" ? "Черновиков пока нет" : "Опубликованных версий пока нет";
      empty.style.opacity = "0.7";
      list.appendChild(empty);
    }
  } catch (e) {
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

  const textContent = v.content.replace(/<[^>]*>/g, "");
  const shortText = textContent.substring(0, 250);
  const isLong = textContent.length > 250;

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

  // Редактирование / удаление (только админ)
  if (isAdminVersion) {
    card.querySelector(".edit").addEventListener("click", (e) => {
      const btn = e.target;
      document.getElementById("version-editor").style.display = "block";
      document.getElementById("version-input").value = btn.dataset.version || "v";
      document.getElementById("version-title-input").value = btn.dataset.title || "";

      // safe date → yyyy-MM-dd
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
      showToast(status === "published" ? "success" : "info",
        status === "published" ? "Версия опубликована" : "Сохранено в черновики");
      loadVersions();
      resetEditor();
    } else {
      showToast("error", res.detail || "Ошибка сохранения версии");
    }
  } catch (e) {
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
      showToast("success", "Версия обновлена");
      loadVersions();
      resetEditor();
    } else {
      showToast("error", res.detail || "Ошибка обновления версии");
    }
  } catch (e) {
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
      showToast("success", "Версия удалена");
      loadVersions();
    } else {
      showToast("error", res.detail || "Ошибка удаления версии");
    }
  } catch (e) {
    showToast("error", "Сеть/сервер недоступны при удалении версии");
  }
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
