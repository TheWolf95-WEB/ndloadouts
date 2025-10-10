// ========================
// ⚙️ BASE INIT
// ========================
const bfTg = window.Telegram?.WebApp || window.tg;
if (bfTg && bfTg.expand) bfTg.expand();
window.tg = bfTg;

// Глобальное состояние
let currentBfEditId = null;              // id редактируемой сборки
let bfCachedBuilds = [];                 // кэш сборок
let bfTypesCache = [];                   // кэш типов оружия
let currentBfWeaponType = null;          // текущий тип в справочнике модулей
let currentBfWeaponLabel = null;         // подпись текущего типа
let currentBfModules = {};               // модули по текущему типу (категория -> [{id, name}])
const isBfAdmin = !!window?.userInfo?.is_admin || !!window?.ADMIN_IDS?.length; // подстрой под свой флаг

// Утилиты
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

// ========================
// 🖥️ ПЕРЕКЛЮЧЕНИЕ ЭКРАНОВ
// ========================
function showScreen(id) {
  $$('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const scr = document.getElementById(id);
  if (scr) {
    scr.style.display = 'block';
    setTimeout(() => scr.classList.add('active'), 10);
  } else {
    console.warn('Screen not found:', id);
  }
}

// ========================
// 🚀 INIT APP
// ========================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🔹 Battlefield module loaded');

    $('#bf-back-from-modules')?.addEventListener('click', () => {
    showScreen('screen-bf-modules-dict');
  });
  
  $('#bf-add-module-btn')?.addEventListener('click', async () => {
    const category = $('#bf-mod-category').value.trim();
    const name = $('#bf-mod-name').value.trim();
    
    if (!currentBfWeaponType) return alert('Сначала выберите тип оружия');
    if (!category) return alert('Введите категорию');
    if (!name) return alert('Введите название модуля');
  
    try {
      await apiPost('/api/bf/modules', {
        weapon_type: currentBfWeaponType,
        category,
        name
      });
  
      $('#bf-mod-category').value = '';
      $('#bf-mod-name').value = '';
      await bfLoadModulesForType(currentBfWeaponType);
    } catch (error) {
      console.error('Ошибка добавления модуля:', error);
      alert('Ошибка при добавлении модуля');
    }
  });

  
  // Главные кнопки
  $('#bf-show-builds-btn')?.addEventListener('click', async () => {
    showScreen('screen-bf-builds');
    await bfEnsureTypes();     // нужны для фильтра
    await bfLoadBuilds();
    bfFillFilters();
  });

  $('#bf-modules-dict-btn')?.addEventListener('click', async () => {
    showScreen('screen-bf-modules-dict');
    await bfLoadWeaponTypesGrid();
  });

  $('#bf-add-build-btn')?.addEventListener('click', async () => {
    await bfEnsureTypes();
    bfShowAddForm();
  });

  // Хендлеры формы добавления сборки
  $('#bf-weapon-type')?.addEventListener('change', async (e) => {
    const typeKey = e.target.value;
    if (!typeKey) return;
    const data = await apiGet(`/api/bf/modules/${typeKey}`);
    currentBfModules = data || {};
    console.log('Loaded modules for type:', typeKey, data);
  });

  $('#bf-add-tab')?.addEventListener('click', () => {
    bfAddTab();
  });

  $('#bf-submit-build')?.addEventListener('click', async () => {
    await bfSubmitBuild();
  });

  // Справочник типов
  $('#bf-add-type-btn')?.addEventListener('click', async () => {
    const key = $('#bf-type-key').value.trim();
    const label = $('#bf-type-label').value.trim();
    if (!key || !label) return alert('Введите ключ и название типа оружия');

    await apiPost('/api/bf/types', { key, label });
    $('#bf-type-key').value = '';
    $('#bf-type-label').value = '';
    await bfLoadWeaponTypes(true);
  });

  // Фильтры/поиск на экране сборок
  $('#bf-filter-type')?.addEventListener('change', () => bfApplyBuildsFilters());
  $('#bf-filter-category')?.addEventListener('change', () => bfApplyBuildsFilters());
  $('#bf-search-builds')?.addEventListener('input', () => bfApplyBuildsFilters());
});


// ========================
// 🔩 СПРАВОЧНИК МОДУЛЕЙ
// ========================

// Загрузка сетки типов оружия для справочника
async function bfLoadWeaponTypesGrid() {
  const grid = $('#bf-types-grid');
  if (!grid) return;

  await bfEnsureTypes();
  
  grid.innerHTML = '';
  
  bfTypesCache.forEach(type => {
    const card = el('div', 'type-card');
    card.innerHTML = `
      <div class="type-name">${escapeHtml(type.label)}</div>
      <div class="type-actions">
        <button class="btn-mini primary" data-action="edit">✏️</button>
        <button class="btn-mini danger" data-action="delete">🗑</button>
      </div>
    `;
    
    // Клик по карточке - открыть модули
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.type-actions')) {
        currentBfWeaponType = type.key;
        currentBfWeaponLabel = type.label;
        $('#bf-modules-title').textContent = `🔩 Справочник модулей — ${type.label}`;
        showScreen('screen-bf-modules-list');
        bfLoadModulesForType(currentBfWeaponType);
      }
    });
    
    // Редактирование типа
    card.querySelector('[data-action="edit"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      const newLabel = prompt('Новое название типа:', type.label);
      if (!newLabel) return;
      
      try {
        await apiPut(`/api/bf/types/${type.id}`, { key: type.key, label: newLabel });
        await bfLoadWeaponTypesGrid();
      } catch (error) {
        console.error('Ошибка редактирования типа:', error);
        alert('Ошибка при редактировании типа');
      }
    });
    
    // Удаление типа
    card.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Удалить тип "${type.label}"?`)) return;
      
      try {
        await apiDelete(`/api/bf/types/${type.id}`);
        await bfLoadWeaponTypesGrid();
      } catch (error) {
        console.error('Ошибка удаления типа:', error);
        alert('Ошибка при удалении типа');
      }
    });
    
    grid.appendChild(card);
  });
}

// ========================
// 🌐 API helpers
// ========================
async function apiGet(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.json();
  } catch (e) {
    console.error('GET error:', url, e);
    return null;
  }
}
async function apiPost(url, data) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!r.ok) {
    const msg = await safeText(r);
    throw new Error(`POST ${url}: ${r.status} ${msg}`);
  }
  return await r.json().catch(() => ({}));
}
async function apiPut(url, data) {
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!r.ok) {
    const msg = await safeText(r);
    throw new Error(`PUT ${url}: ${r.status} ${msg}`);
  }
  return await r.json().catch(() => ({}));
}
async function apiDelete(url) {
  const r = await fetch(url, { method: 'DELETE' });
  if (!r.ok) {
    const msg = await safeText(r);
    throw new Error(`DELETE ${url}: ${r.status} ${msg}`);
  }
  return true;
}
async function safeText(r) {
  try { return await r.text(); } catch { return ''; }
}

// ========================
// 📚 ТИПЫ ОРУЖИЯ
// ========================
async function bfEnsureTypes() {
  if (bfTypesCache.length) return bfTypesCache;
  await bfLoadWeaponTypes();
  return bfTypesCache;
}

// Загрузка типов (из API, фоллбек на /data/types-bf.json)
async function bfLoadWeaponTypes(keepScreen = false) {
  let types = await apiGet('/api/bf/types');
  if (!Array.isArray(types)) {
    // Fallback (локальный JSON)
    try {
      const fallback = await fetch('/data/types-bf.json');
      if (fallback.ok) types = await fallback.json();
    } catch (e) { /* ignore */ }
  }
  bfTypesCache = Array.isArray(types) ? types : [];

  // Рендер сетки типов
  const list = $('#bf-types-list');
  if (list) {
    list.innerHTML = '';
    if (!bfTypesCache.length) {
      list.innerHTML = '<p class="muted">Типов ещё нет</p>';
    } else {
      bfTypesCache.forEach(t => {
        const card = el('div', 'bf-type-card');
        const btn = el('button', 'bf-type-open', t.label);
        btn.dataset.key = t.key;
        btn.dataset.label = t.label;
        btn.addEventListener('click', async () => {
          currentBfWeaponType = t.key;
          currentBfWeaponLabel = t.label;
          $('#bf-modules-title').innerHTML = `🔩 Справочник модулей — ${escapeHtml(t.label)}`;
          showScreen('screen-bf-modules');
          await bfLoadModulesForType(currentBfWeaponType);
        });

        const actions = el('div', 'bf-type-actions');
        const edit = el('button', 'btn-mini', '✏️');
        edit.addEventListener('click', async () => {
          const newLabel = prompt('Новое название типа:', t.label);
          if (!newLabel) return;
          // Если на бэке нет PUT типов, можно удалить и создать заново. Предположим есть:
          try {
            await apiPut(`/api/bf/types/${t.id}`, { key: t.key, label: newLabel });
          } catch {
            // фоллбек: удалить/создать
            await apiDelete(`/api/bf/types/${t.id}`);
            await apiPost('/api/bf/types', { key: t.key, label: newLabel });
          }
          await bfLoadWeaponTypes(true);
        });

        const del = el('button', 'btn-mini', '🗑');
        del.addEventListener('click', async () => {
          if (!confirm('Удалить тип оружия?')) return;
          await apiDelete(`/api/bf/types/${t.id}`);
          await bfLoadWeaponTypes(true);
        });

        actions.append(edit, del);
        card.append(btn, actions);
        list.appendChild(card);
      });
    }
  }

  // Заполнение селектов типов
  const typeSelect = $('#bf-weapon-type');
  const filterSelect = $('#bf-filter-type');
  if (typeSelect) {
    typeSelect.innerHTML = '<option value="">Выберите тип оружия</option>';
    bfTypesCache.forEach(t => {
      const opt = el('option');
      opt.value = t.key;
      opt.textContent = t.label;
      typeSelect.appendChild(opt);
    });
  }
  if (filterSelect) {
    filterSelect.innerHTML = '<option value="">Все типы</option>';
    bfTypesCache.forEach(t => {
      const opt = el('option');
      opt.value = t.key;
      opt.textContent = t.label;
      filterSelect.appendChild(opt);
    });
  }

  if (!keepScreen) showScreen('screen-bf-types');
}

// ========================
// 🔩 МОДУЛИ ПО ТИПУ
// ========================
// Загрузка модулей для типа
async function bfLoadModulesForType(typeKey) {
  const data = await apiGet(`/api/bf/modules/${typeKey}`) || {};
  currentBfModules = data;

  const container = $('#bf-modules-container');
  if (!container) return;
  container.innerHTML = '';

  const categories = Object.keys(data).sort();
  
  if (!categories.length) {
    container.innerHTML = '<p class="muted">Модулей ещё нет</p>';
    return;
  }

  categories.forEach(category => {
    const categorySection = el('div', 'category-section');
    categorySection.innerHTML = `<h3 class="category-title">${escapeHtml(category)}</h3>`;
    
    const modulesList = el('div', 'modules-list');
    
    (data[category] || []).forEach(module => {
      const moduleRow = el('div', 'module-row');
      moduleRow.innerHTML = `
        <span class="module-name">${escapeHtml(module.name)}</span>
        <button class="btn-mini danger">🗑</button>
      `;
      
      moduleRow.querySelector('.danger').addEventListener('click', async () => {
        if (!confirm('Удалить модуль?')) return;
        await apiDelete(`/api/bf/modules/${module.id}`);
        await bfLoadModulesForType(typeKey);
      });
      
      modulesList.appendChild(moduleRow);
    });
    
    categorySection.appendChild(modulesList);
    container.appendChild(categorySection);
  });
}
// Добавление модуля
$('#bf-add-module-btn')?.addEventListener('click', async () => {
  const category = $('#bf-mod-category').value.trim();
  const name = $('#bf-mod-name').value.trim();
  
  if (!currentBfWeaponType) return alert('Сначала выберите тип оружия');
  if (!category) return alert('Введите категорию');
  if (!name) return alert('Введите название модуля');

  try {
    await apiPost('/api/bf/modules', {
      weapon_type: currentBfWeaponType,
      category,
      name
    });

    // Очистка формы
    $('#bf-mod-category').value = '';
    $('#bf-mod-name').value = '';
    
    // Обновление списка
    await bfLoadModulesForType(currentBfWeaponType);
  } catch (error) {
    console.error('Ошибка добавления модуля:', error);
    alert('Ошибка при добавлении модуля');
  }
});

// Назад из модулей
$('#bf-back-from-modules')?.addEventListener('click', () => {
  showScreen('screen-bf-modules-dict');
});

// ========================
// 📦 СБОРКИ (СПИСОК / ФИЛЬТР / ПОИСК)
// ========================
async function bfLoadBuilds() {
  $('#bf-builds-list').innerHTML = '<div class="loading-spinner">Загрузка...</div>';
  const builds = await apiGet('/api/bf/builds');
  bfCachedBuilds = Array.isArray(builds) ? builds : [];
  bfRenderBuildsCards(bfCachedBuilds);
  $('#bf-total-builds').textContent = String(bfCachedBuilds.length);
}

function bfFillFilters() {
  // Категории фикс (как в форме)
  const catSelect = $('#bf-filter-category');
  if (!catSelect) return;
  const cats = ['Популярное', 'Новинки', 'Топ Мета', 'Мета'];
  catSelect.innerHTML = '<option value="">Все категории</option>';
  cats.forEach(c => {
    const opt = el('option');
    opt.value = c;
    opt.textContent = c;
    catSelect.appendChild(opt);
  });
}

function bfApplyBuildsFilters() {
  const typeVal = $('#bf-filter-type')?.value || '';
  const catVal  = $('#bf-filter-category')?.value || '';
  const q = ($('#bf-search-builds')?.value || '').toLowerCase();

  const filtered = bfCachedBuilds.filter(b => {
    const okType = !typeVal || b.weapon_type === typeVal;
    const okCat  = !catVal || (Array.isArray(b.categories) && b.categories.includes(catVal));
    const okQ = !q || (b.title?.toLowerCase().includes(q) ||
      JSON.stringify(b.tabs || []).toLowerCase().includes(q));
    return okType && okCat && okQ;
  });

  bfRenderBuildsCards(filtered);
  $('#bf-total-builds').textContent = String(filtered.length);
}

function bfRenderBuildsCards(builds) {
  const grid = $('#bf-builds-list');
  grid.innerHTML = '';

  if (!builds.length) {
    grid.innerHTML = '<p class="muted">Нет сборок для отображения</p>';
    return;
  }

  builds.forEach((b, idx) => {
    const title = b.title || 'Без названия';
    const wt = b.weapon_type || '—';
    const cats = Array.isArray(b.categories) ? b.categories : [];
    const tabs = Array.isArray(b.tabs) ? b.tabs : [];

    const card = el('div', 'bf-card');
    card.innerHTML = `
      <div class="bf-card__header">
        <span class="bf-rank">#${idx + 1}</span>
        <h3 class="bf-title">${escapeHtml(title)}</h3>
      </div>
      <div class="bf-badges">
        ${cats.map(c => `<span class="bf-badge">${escapeHtml(c)}</span>`).join('')}
      </div>
      <div class="bf-meta">
        <span class="bf-weapon">${escapeHtml(getTypeLabel(wt))}</span>
        <span class="bf-tabs">${tabs.length || 0} вклад.</span>
      </div>
      <div class="bf-actions ${isBfAdmin ? '' : 'hidden'}">
        <button class="btn-mini primary">✏️</button>
        <button class="btn-mini danger">🗑</button>
      </div>
    `;

    // Редактирование/Удаление
    if (isBfAdmin) {
      card.querySelector('.primary').addEventListener('click', async () => {
        await bfEnsureTypes();
        bfShowAddForm(b.id, b);
      });
      card.querySelector('.danger').addEventListener('click', async () => {
        if (!confirm('Удалить сборку?')) return;
        await apiDelete(`/api/bf/builds/${b.id}`);
        await bfLoadBuilds();
      });
    }

    grid.appendChild(card);
  });
}

function getTypeLabel(key) {
  const t = bfTypesCache.find(x => x.key === key);
  return t ? t.label : key;
}

// ========================
// 🧱 ФОРМА ДОБАВЛЕНИЯ / РЕДАКТИРОВАНИЯ
// ========================
function bfShowAddForm(editId = null, build = null) {
  currentBfEditId = editId;
  showScreen('screen-bf-add-build');

  // Очистка
  $('#bf-title').value = '';
  $('#bf-weapon-type').value = '';
  $('#bf-top1').value = '';
  $('#bf-top2').value = '';
  $('#bf-top3').value = '';
  $('#bf-date').value = new Date().toISOString().split('T')[0];
  $('#bf-tabs-container').innerHTML = '';
  $$('.bf-cat').forEach(cb => (cb.checked = false));

  if (build) {
    $('#bf-title').value = build.title || '';
    $('#bf-weapon-type').value = build.weapon_type || '';
    $('#bf-top1').value = build.top1 || '';
    $('#bf-top2').value = build.top2 || '';
    $('#bf-top3').value = build.top3 || '';
    if (build.date) $('#bf-date').value = (build.date || '').slice(0, 10);

    // Категории
    const cats = Array.isArray(build.categories) ? build.categories : [];
    $$('.bf-cat').forEach(cb => (cb.checked = cats.includes(cb.value)));

    // Вкладки
    (build.tabs || []).forEach(t => bfAddTab(t));
  } else {
    // Добавляем пустую вкладку по умолчанию
    bfAddTab();
  }

  console.log('🛠 Открыта форма добавления/редактирования сборки', currentBfEditId);
}

function bfAddTab(tabData = null) {
  const wrap = $('#bf-tabs-container');
  const tab = el('div', 'tab-block');
  const title = tabData?.title || '';
  
  tab.innerHTML = `
    <input type="text" class="tab-title-input form-input" placeholder="Название вкладки" value="${escapeAttr(title)}">
    
    <div class="tab-modules">
      <div class="mod-row">
        <input type="text" class="form-input" placeholder="Дуло">
        <select class="mod-select form-input">
          <option value="">модуль</option>
        </select>
      </div>
    </div>
    
    <div class="tab-actions">
      <button class="btn add-mod">➕ Добавить модуль</button>
      <button class="btn delete-tab">🗑️ Удалить вкладку</button>
    </div>
  `;
  
  wrap.appendChild(tab);

  const itemsWrap = $('.tab-modules', tab);
  const addItemBtn = $('.add-mod', tab);
  const removeTabBtn = $('.delete-tab', tab);

  removeTabBtn.addEventListener('click', () => tab.remove());
  addItemBtn.addEventListener('click', () => bfAddTabItem(itemsWrap));

  // Предзаполнение модулей если есть данные
  if (Array.isArray(tabData?.items)) {
    tabData.items.forEach(it => {
      bfAddTabItem(itemsWrap, it.category || '', it.name || '');
    });
  }
}

function bfAddTabItem(container, cat = '', name = '') {
  const row = el('div', 'mod-row');
  row.innerHTML = `
    <input class="form-input" placeholder="Категория (напр. Дуло)" value="${escapeAttr(cat)}">
    <input class="form-input" placeholder="Название модуля (напр. Suppressor)" value="${escapeAttr(name)}">
  `;
  container.appendChild(row);
}

async function bfSubmitBuild() {
  const title = $('#bf-title').value.trim();
  const weapon_type = $('#bf-weapon-type').value;
  const top1 = $('#bf-top1').value.trim();
  const top2 = $('#bf-top2').value.trim();
  const top3 = $('#bf-top3').value.trim();
  const date = $('#bf-date').value;
  const categories = $$('.bf-cat').filter(cb => cb.checked).map(cb => cb.value);

  if (!title) return alert('Заполни название сборки');
  if (!weapon_type) return alert('Выбери тип оружия');

  // Сбор вкладок
  const tabs = [];
  $$('.tab-block').forEach(tab => {
    const tTitle = $('.tab-title-input', tab).value.trim() || 'Без названия';
    const items = [];
    
    $$('.mod-row', tab).forEach(r => {
      const inputs = $$('input', r);
      if (inputs.length >= 2) {
        const cat = inputs[0].value.trim();
        const name = inputs[1].value.trim();
        if (cat || name) items.push({ category: cat, name });
      }
    });
    
    tabs.push({ title: tTitle, items });
  });

  const payload = { 
    title, 
    weapon_type, 
    categories, 
    top1, 
    top2, 
    top3, 
    date, 
    tabs 
  };

  try {
    if (currentBfEditId) {
      await apiPut(`/api/bf/builds/${currentBfEditId}`, payload);
    } else {
      await apiPost('/api/bf/builds', payload);
    }
    currentBfEditId = null;
    showScreen('screen-bf-builds');
    await bfLoadBuilds();
  } catch (e) {
    console.error(e);
    alert('Ошибка сохранения сборки');
  }
}
// ========================
// 🧰 ВСПОМОГАТЕЛЬНЫЕ
// ========================
function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(s = '') {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
