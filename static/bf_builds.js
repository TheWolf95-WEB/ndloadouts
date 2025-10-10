// ========================
// ⚙️ BASE INIT
// ========================
const bfTg = window.Telegram?.WebApp || window.tg;
if (bfTg && bfTg.expand) bfTg.expand();
window.tg = bfTg;

let currentBfEditId = null;
let bfCachedBuilds = [];

// ========================
// 🚀 INIT APP
// ========================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("🔹 Battlefield module loaded");
    
    // Простые обработчики кнопок
    document.getElementById('bf-show-builds-btn')?.addEventListener('click', () => {
        showScreen('screen-bf-builds');
        bfLoadBuilds();
    });
    
    document.getElementById('bf-weapons-db-btn')?.addEventListener('click', () => {
        showScreen('screen-bf-types');
        bfLoadWeaponTypes();
    });
    
    document.getElementById('bf-modules-dict-btn')?.addEventListener('click', () => {
        showScreen('screen-bf-types');
        bfLoadWeaponTypes();
    });
    
    document.getElementById('bf-add-build-btn')?.addEventListener('click', () => {
        bfShowAddForm();
    });
});

// ========================
// 📦 ЗАГРУЗКА СБОРОК (АККОРДЕОН)
// ========================
async function bfLoadBuilds() {
    try {
        console.log("🔄 Загрузка сборок...");
        const res = await fetch('/api/bf/builds');
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const builds = await res.json();
        console.log("✅ Сборки загружены:", builds);

        if (!Array.isArray(builds) || builds.length === 0) {
            document.getElementById('bf-builds-list').innerHTML = '<p>Нет сборок для отображения</p>';
            bfCachedBuilds = [];
            return;
        }

        bfCachedBuilds = builds;
        bfRenderBuildsAccordion(builds);

    } catch (err) {
        console.error('❌ Ошибка загрузки сборок:', err);
        document.getElementById('bf-builds-list').innerHTML = '<p>Ошибка загрузки сборок</p>';
    }
}

function bfRenderBuildsAccordion(builds) {
    const listEl = document.getElementById('bf-builds-list');
    listEl.innerHTML = '';

    builds.forEach(build => {
        const accordion = document.createElement('div');
        accordion.className = 'bf-build-accordion';
        
        // Безопасное получение данных
        const title = build.title || 'Без названия';
        const weaponType = build.weapon_type || 'Не указан';
        const categories = Array.isArray(build.categories) ? build.categories : [];
        const tabs = Array.isArray(build.tabs) ? build.tabs : [];
        const firstTab = tabs[0] || {items: []};
        
        const categoriesHtml = categories.map(cat => 
            `<span class="bf-badge">${cat}</span>`
        ).join('');

        const modulesHtml = firstTab.items.map(item => {
            if (typeof item === 'string' && item.includes('\t')) {
                const parts = item.split('\t');
                return `<div class="bf-module-row">
                    <span class="bf-module-category">${parts[0]}</span>
                    <span class="bf-module-name">${parts[1]}</span>
                </div>`;
            } else {
                return `<div class="bf-module-row">
                    <span class="bf-module-name">${item}</span>
                </div>`;
            }
        }).join('');

        accordion.innerHTML = `
            <div class="bf-accordion-header" onclick="this.parentElement.classList.toggle('open')">
                <div class="bf-build-info">
                    <h3>${title}</h3>
                    <div class="bf-build-meta">
                        <span class="bf-weapon-type">${weaponType}</span>
                        <span class="bf-tabs-count">${tabs.length} вклад.</span>
                    </div>
                </div>
                <div class="bf-build-categories">
                    ${categoriesHtml}
                </div>
                <div class="bf-accordion-arrow">▼</div>
            </div>
            <div class="bf-accordion-content">
                <div class="bf-modules-section">
                    <h4>Модули (${firstTab.items.length}):</h4>
                    <div class="bf-modules-list">
                        ${modulesHtml || '<p>Нет модулей</p>'}
                    </div>
                </div>
            </div>
        `;
        
        listEl.appendChild(accordion);
    });
}

// ========================
// ⚙️ ТИПЫ ОРУЖИЯ (ПРОСТАЯ ВЕРСИЯ)
// ========================
async function bfLoadWeaponTypes() {
  try {
    const res = await fetch('/api/bf/types');
    const types = await res.json();
    const list = document.getElementById('bf-types-list');

    if (!list) return;

    list.innerHTML = '';

    if (!types.length) {
      list.innerHTML = '<p>Нет типов оружия</p>';
      return;
    }

    types.forEach(t => {
      const row = document.createElement('div');
      row.className = 'bf-type-row';
      row.innerHTML = `
        <span class="bf-type-label">${t.label} (${t.key})</span>
        <div class="bf-type-actions">
          <button class="btn btn-sm bf-type-open" data-key="${t.key}" data-label="${t.label}">📖 Модули</button>
          <button class="btn btn-sm bf-type-del" data-id="${t.id}">🗑 Удалить</button>
        </div>`;
      list.appendChild(row);
    });

    // После загрузки списка типов — обновляем select
    const typeSelect = document.getElementById('bf-weapon-type');
    if (typeSelect) {
      typeSelect.innerHTML = '<option value="">Выберите тип оружия</option>';
      types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.key;
        opt.textContent = t.label;
        typeSelect.appendChild(opt);
      });
    }

  } catch (err) {
    console.error('Ошибка загрузки типов оружия:', err);
  }

  // Обработчики кнопок открываются вне try
  const list = document.getElementById('bf-types-list');
  list.querySelectorAll('.bf-type-open').forEach(btn => {
    btn.addEventListener('click', async () => {
      currentBfWeaponType = btn.dataset.key;
      await bfLoadModulesForType(currentBfWeaponType, btn.dataset.label);
      showScreen('screen-bf-modules');
    });
  });

  list.querySelectorAll('.bf-type-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this weapon type?')) return;
      await fetch(`/api/bf/types/${btn.dataset.id}`, { method: 'DELETE' });
      await bfLoadWeaponTypes();
    });
  });
}


// После загрузки списка типов — обновляем select в форме добавления сборки
const typeSelect = document.getElementById('bf-weapon-type');
if (typeSelect) {
  typeSelect.innerHTML = '<option value="">Выберите тип оружия</option>';
  types.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.key;
    opt.textContent = t.label;
    typeSelect.appendChild(opt);
  });
}



document.getElementById('bf-weapon-type')?.addEventListener('change', async (e) => {
  const typeKey = e.target.value;
  if (!typeKey) return;
  const res = await fetch(`/api/bf/modules/${typeKey}`);
  const data = await res.json();
  window.currentBfModules = data;
  console.log('Loaded modules:', data);
});



document.getElementById('bf-add-type-btn')?.addEventListener('click', async () => {
  const key = document.getElementById('bf-type-key').value.trim();
  const label = document.getElementById('bf-type-label').value.trim();
  if (!key || !label) return alert("Enter both key and label");

  await fetch('/api/bf/types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, label })
  });

  document.getElementById('bf-type-key').value = '';
  document.getElementById('bf-type-label').value = '';
  await bfLoadWeaponTypes();
});


// ===================================================================
// ⚙️ MODULES MANAGEMENT
// ===================================================================

async function bfLoadModulesForType(typeKey, label) {
  const res = await fetch(`/api/bf/modules/${typeKey}`);
  const data = await res.json();
  const title = document.getElementById('bf-modules-title');
  const container = document.getElementById('bf-modules-list');
  if (!title || !container) return;

  title.textContent = `Modules for ${label}`;
  container.innerHTML = '';

  if (Object.keys(data).length === 0) container.innerHTML = '<p>No modules yet.</p>';

  for (const cat in data) {
    const group = document.createElement('div');
    group.className = 'bf-mod-group';
    group.innerHTML = `<h4>${cat}</h4>`;
    data[cat].forEach(m => {
      const row = document.createElement('div');
      row.className = 'bf-mod-row';
      row.innerHTML = `<span>${m.name}</span><button class="btn btn-sm bf-mod-del" data-id="${m.id}">🗑</button>`;
      group.appendChild(row);
    });
    container.appendChild(group);
  }

  container.querySelectorAll('.bf-mod-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete module?')) return;
      await fetch(`/api/bf/modules/${btn.dataset.id}`, { method: 'DELETE' });
      await bfLoadModulesForType(typeKey, label);
    });
  });
}

document.getElementById('bf-add-module-btn')?.addEventListener('click', async () => {
  const category = document.getElementById('bf-mod-category').value.trim();
  const name = document.getElementById('bf-mod-name').value.trim();
  if (!category || !name) return alert("Enter both fields");

  await fetch('/api/bf/modules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weapon_type: currentBfWeaponType, category, name })
  });

  document.getElementById('bf-mod-category').value = '';
  document.getElementById('bf-mod-name').value = '';
  await bfLoadModulesForType(currentBfWeaponType, document.getElementById('bf-modules-title').textContent.replace('Modules for ', ''));
});

document.getElementById('bf-back-from-modules')?.addEventListener('click', () => {
  showScreen('screen-bf-types');
});


document.getElementById('bf-weapons-db-btn')?.addEventListener('click', () => {
  showScreen('screen-bf-types');
});

document.getElementById('bf-modules-dict-btn')?.addEventListener('click', () => {
  showScreen('screen-bf-types');
});


