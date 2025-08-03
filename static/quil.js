let quill;
let versionContent = '';

// === Очистка от пустых блоков (p, h1, h2, li, br) ===
function cleanHTML(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  temp.querySelectorAll('p, h1, h2, li, ul, ol, br').forEach(el => {
    if (!el.textContent.trim()) el.remove();
  });
  return temp.innerHTML.trim();
}

// === Инициализация Quill ===
function initQuillEditor() {
  if (quill) return;
  const container = document.getElementById('quill-editor');
  if (!container) return;

  quill = new Quill(container, {
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

// === Загрузка всех версий в редактор ===
async function loadVersionText() {
  try {
    const res = await fetch('/api/version-history/all');
    const { versions } = await res.json();

    console.log('[DEBUG] Версий получено:', versions.length);

    // Комментарий и визуальный отступ
    const spacing = '<!-- Новая версия --><p><br></p><p><br></p>';

    let combined = spacing;
    if (versions.length) {
      combined += versions.reverse().map(v => v.content).join('<hr>');
    }

    versionContent = combined;
    if (quill) {
      quill.root.innerHTML = versionContent;
    }

    console.log('[DEBUG] Итоговый HTML:', versionContent);
  } catch (err) {
    console.error('Ошибка загрузки версий:', err);
  }
}

// === Сохранение новой версии ===
async function saveVersionText() {
  try {
    const raw = quill.root.innerHTML;
    const cleaned = cleanHTML(raw);

    if (!cleaned.replace(/<[^>]*>/g, '').trim()) {
      alert('⚠️ Введите текст версии перед сохранением');
      return;
    }

    const res = await fetch('/api/version-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: cleaned })
    });

    if (res.ok) {
      alert('✅ Версия успешно сохранена');
      versionContent = cleaned;
    } else {
      alert('❌ Ошибка при сохранении');
    }
  } catch (err) {
    console.error('Ошибка при сохранении:', err);
    alert('❌ Сетевая ошибка');
  }
}

// === Загрузка текущей версии в футер ===
async function loadCurrentVersion() {
  try {
    const res = await fetch('/api/version-history');
    const data = await res.json();
    const versionEl = document.getElementById('current-version');
    if (versionEl) {
      const plain = (data.content || '')
        .replace(/<\/?[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ');
      const match = plain.match(/Версия:.*?\(\d{2}\.\d{2}\.\d{4}\)/);
      versionEl.textContent = match ? match[0] : '';
    }
  } catch (err) {
    console.error('Ошибка загрузки текущей версии:', err);
  }
}

// === Показать все версии пользователю ===
async function showAllVersions() {
  try {
    const res = await fetch('/api/version-history/all');
    const { versions } = await res.json();
    const container = document.getElementById('all-versions-container');
    container.innerHTML = '';

    versions.forEach(v => {
      const block = document.createElement('div');
      block.classList.add('version-entry');
      block.innerHTML = v.content;
      container.appendChild(block);
    });

    showScreen('screen-all-versions');
  } catch (err) {
    console.error('Ошибка отображения всех версий:', err);
  }
}

// === Подключение обработчиков ===
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
  document.getElementById('back-from-update')?.addEventListener('click', () => showScreen('screen-warzone-main'));
  document.getElementById('current-version')?.addEventListener('click', showAllVersions);
  document.getElementById('back-from-all-versions')?.addEventListener('click', () => showScreen('screen-warzone-main'));
});
