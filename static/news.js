document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("news-list")) {
    loadNews();
  }
});

async function loadNews() {
  try {
    const res = await fetch("/api/news");
    const news = await res.json();
    renderNews(news);
  } catch (err) {
    console.error("Ошибка загрузки новостей:", err);
    document.getElementById("news-list").innerHTML = "<p>⚠️ Не удалось загрузить новости.</p>";
  }
}

function renderNews(items) {
  const container = document.getElementById("news-list");
  if (!items.length) {
    container.innerHTML = "<p>Пока нет новостей.</p>";
    return;
  }

  container.innerHTML = items.map(n => `
    <div class="news-card">
      ${n.image ? `<img src="${n.image}" alt="${n.title}" class="news-img">` : ""}
      <div class="news-content">
        <h3 class="news-title">${n.title}</h3>
        <p class="news-text">${n.content}</p>
        <div class="news-meta">
          <span class="news-date">${n.date || "?"}</span>
          <span class="news-category">${n.category || ""}</span>
        </div>
      </div>
    </div>
  `).join("");
}
