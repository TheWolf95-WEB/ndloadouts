  // Открытие редактора
  document.getElementById('update-version-btn')?.addEventListener('click', async () => {
    initQuillEditor();
    await loadVersionText();
    showScreen('screen-update-version');
  });
});

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

// Подгрузка текущей версии в футере
async function loadCurrentVersion() {
  try {
    const res = await fetch('/api/version-history');
    const data = await res.json();
    const versionEl = document.getElementById('current-version');

    if (versionEl) {
      const plain = (data.content || '')
        .replace(/<\/?[^>]+(>|$)/g, '') // Удаляем HTML
        .replace(/&nbsp;/g, ' ')        // Удаляем пробелы-заменители

      const match = plain.match(/Версия:.*?\(\d{2}\.\d{2}\.\d{4}\)/); // Только "Версия: 0.4 (02.08.2025)"
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



// Клик по версии
// Клик по версии
document.getElementById('current-version')?.addEventListener('click', async () => {
  const res = await fetch('/api/version-history/all');
  const data = await res.json();
  const container = document.getElementById('all-versions-container');

  // Очистка
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

// Назад из истории версий
document.getElementById('back-from-all-versions')?.addEventListener('click', () => {
  showScreen('screen-main');
});





