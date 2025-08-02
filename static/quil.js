let quill;
let versionContent = '';

// === ИНИЦИАЛИЗАЦИЯ Quill ===
function initQuillEditor() {
  if (quill) return; // Уже инициализирован
  const editorContainer = document.getElementById('quill-editor');
  if (!editorContainer) return;

  quill = new Quill(editorContainer, {
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
    const combined = versions.reverse().map(v => v.content).join('<hr>');
    versionContent = combined;
    if (quill) quill.root.innerHTML = versionContent;
  } catch (err) {
    console.error('Ошибка загрузки версий:', err);
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

// === Отображение текущей версии в футере ===
async function loadCurrentVersion() {
  try {
    const res = await fetch('/api/version-history');
    const data = await res.json();
    const versionEl = document.getElementById('current-version');
    if (versionEl) {
      const plain = (data.content || '').replace(/<\/?[^>]+>/g, '').replace(/&nbsp;/g, ' ');
      const match = plain.match(/Версия:.*?\(\d{2}\.\d{2}\.\d{4}\)/);
      versionEl.textContent = match ? match[0] : '';
    }
  } catch (err) {
    console.error('Ошибка загрузки текущей версии:', err);
  }
}

// === Показать все версии ===
async function showAllVersions() {
  try {
    const res = await fetch('/api/version-history/all');
    const data = await res.json();
    const container = document.getElementById('all-versions-container');
    container.innerHTML = '';

    data.versions.forEach(v => {
      const block = document.createElement('div');
      block.classList.add('version-entry');
      block.innerHTML = v.content;
      container.appendChild(block);
    });

    showScreen('screen-all-versions');
  } catch (err) {
    console.error('Ошибка загрузки истории версий:', err);
  }
}

// === Обработчики ===
document.addEventListener('DOMContentLoaded', () => {
  loadCurrentVersion();

  document.getElementById('update-version-btn')?.addEventListener('click', () => {
    showScreen('screen-update-version');
    setTimeout(() => {
      initQuillEditor();
      loadVersionText();
    }, 100);
  });

  document.getElementById('save-version-btn')?.addEventListener('click', saveVersionText);

  document.getElementById('back-from-update')?.addEventListener('click', () => {
    showScreen('screen-main');
  });

  document.getElementById('current-version')?.addEventListener('click', showAllVersions);

  document.getElementById('back-from-all-versions')?.addEventListener('click', () => {
    showScreen('screen-main');
  });
});
