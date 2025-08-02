let quill;
let versionContent = '';

// Инициализация редактора Quill
document.addEventListener('DOMContentLoaded', async () => {
  const editorContainer = document.getElementById('quill-editor');
  if (editorContainer) {
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

    await loadVersionText();
  }

  document.getElementById('save-version-btn')?.addEventListener('click', saveVersionText);
  document.getElementById('back-from-update')?.addEventListener('click', () => showScreen('screen-main'));
  document.getElementById('update-version-btn')?.addEventListener('click', () => showScreen('screen-update-version'));
});

// Загрузка текущей версии
async function loadVersionText() {
  try {
    const res = await fetch('/api/version');
    const data = await res.json();
    versionContent = data.content || '';
    quill.root.innerHTML = versionContent;
  } catch (err) {
    console.error('Ошибка загрузки версии:', err);
  }
}

// Сохранение новой версии
async function saveVersionText() {
  const saveStatus = document.getElementById('save-status');
  try {
    const content = quill.root.innerHTML;

    const res = await fetch('/api/version', {
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

// Загрузка версии в футере (для всех)
(async () => {
  try {
    const res = await fetch('/api/version');
    const data = await res.json();
    const footer = document.getElementById('current-version');
    if (footer) {
      const plain = (data.content || '').replace(/<\/?[^>]+(>|$)/g, '');
      const versionLine = plain.split('\n').find(line => line.toLowerCase().includes('версия'));
      if (versionLine) footer.textContent = versionLine.trim();
    }
  } catch (err) {
    console.error('Ошибка получения текущей версии:', err);
  }
})();
