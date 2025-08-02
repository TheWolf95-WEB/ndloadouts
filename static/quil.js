let quill;
let versionContent = '';

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

// Загрузка текста в редактор
async function loadVersionText() {
  try {
    const res = await fetch('/api/version-history/all');
    const versions = await res.json();

    // Склеиваем все версии в один HTML (в порядке от старой к новой)
    const combinedContent = versions.reverse().map(v => v.content).join('<hr>');

    versionContent = combinedContent;
    if (quill) {
      quill.root.innerHTML = versionContent;
    }
  } catch (err) {
    console.error('Ошибка загрузки версии:', err);
  }
}


// Сохранение
async function saveVersionText() {
  const saveStatus = document.getElementById('save-status');
  try {
    const content = quill.root.innerHTML;
    const res = await fetch('/api/version-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });

    if (res.ok) {
      saveStatus.textContent = '✅ Сохранено';
      versionContent = content;
    } else {
      saveStatus.textContent = '❌ Ошибка при сохранении';
    }
  } catch (err) {
    console.error('Ошибка при сохранении:', err);
    saveStatus.textContent = '❌ Ошибка';
  }

  setTimeout(() => saveStatus.textContent = '', 3000);
}

// Подгрузка текущей версии в футере
async function loadCurrentVersion() {
  try {
    const res = await fetch('/api/version-history');
    const data = await res.json();
    const versionEl = document.getElementById('current-version');
    if (versionEl) {
      const plain = (data.content || '').replace(/<\/?[^>]+(>|$)/g, '');
      const match = plain.match(/Версия:.*$/m);
      versionEl.textContent = match ? match[0] : '';
    }
  } catch (err) {
    console.error('Ошибка получения текущей версии:', err);
  }
}

// === Подключение обработчиков ===
document.addEventListener('DOMContentLoaded', () => {
  // Футер
  loadCurrentVersion();

  // Назад
  document.getElementById('back-from-update')?.addEventListener('click', () => {
    showScreen('screen-main');
  });

  // Сохранение
  document.getElementById('save-version-btn')?.addEventListener('click', saveVersionText);

  // Открытие редактора
  document.getElementById('update-version-btn')?.addEventListener('click', async () => {
    initQuillEditor();
    await loadVersionText();
    showScreen('screen-update-version');
  });
});
