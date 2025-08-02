let quill;
let versionContent = '';

// === ИНИЦИАЛИЗАЦИЯ Quill ===
function initQuillEditor() {
  const editorContainer = document.getElementById('quill-editor');
  if (!editorContainer || quill) return;

  quill = new Quill('#quill-editor', {
    theme: 'snow',
    placeholder: 'Например:\nВерсия: 0.1\n– Добавлено это\n– Изменено то',
    modules: {
      toolbar: [
        [{ header: [1, 2, false] }],
        ['bold', 'italic', 'blockquote'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'clean']
      ]
    }
  });
}

// === Загрузка текста в редактор ===
async function loadVersionText() {
  try {
    const res = await fetch('/api/version-history/all');
    const versions = await res.json();
    const combinedContent = versions.reverse().map(v => v.content).join('<hr>');
    versionContent = combinedContent;
    if (quill) quill.root.innerHTML = versionContent;
  } catch (err) {
    console.error('Ошибка загрузки версии:', err);
  }
}

// === Сохранение ===
async function saveVersionText() {
  try {
    const content = quill.root.innerHTML;
    const res = await fetch('/api/version-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });

    if (res.ok) {
      alert('✅ Версия успешно сохранена');
      versionContent = content;
    } else {
      alert('❌ Ошибка при сохранении версии');
    }
  } catch (err) {
    console.error('Ошибка при сохранении:', err);
    alert('❌ Сетевая или серверная ошибка');
  }
}

// === Текущая версия в футере ===
async function loadCurrentVersion() {
  try {
    const res = await fetch('/api/version-history');
    const data = await res.json();
    const versionEl = document.getElementById('current-version');

    if (versionEl) {
      const plain = (data.content || '')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/&nbsp;/g, ' ');
      const match = plain.match(/Версия:.*?\(\d{2}\.\d{2}\.\d{4}\)/);
      versionEl.textContent = match ? match[0] : '';
    }
  } catch (err) {
    console.error('Ошибка получения текущей версии:', err);
  }
}

// === Обработчики ===
document.addEventListener('DOMContentLoaded', () => {
  loadCurrentVersion();

  // Кнопка Назад
  document.getElementById('back-from-update')?.addEventListener('click', () => {
    showScreen('screen-main');
  });

  // Сохранить версию
  document.getElementById('save-version-btn')?.addEventListener('click', saveVersionText);

  // Открытие редактора
  document.getElementById('update-version-btn')?.addEventListener('click', async () => {
    showScreen('screen-update-version');
    setTimeout(() => {
      initQuillEditor();
      loadVersionText();
    }, 100);
  });

  // Клик по текущей версии
  document.getElementById('current-version')?.addEventListener('click', async () => {
    const res = await fetch('/api/version-history/all');
    const data = await res.json();
    const container = document.getElementById('all-versions-container');
    container.innerHTML = '';

    data.versions.forEach(v => {
      const block = document.createElement('div');
      block.innerHTML = v.content;
      block.style.marginBottom = '30px';
      block.style.paddingBottom = '20px';
      block.style.borderBottom = '1px solid #333';
      block.style.fontSize = '15px';
      container.appendChild(block);
    });

    showScreen('screen-all-versions');
  });

  // Назад из экрана всех версий
  document.getElementById('back-from-all-versions')?.addEventListener('click', () => {
    showScreen('screen-main');
  });
});
