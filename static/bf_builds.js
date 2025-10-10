// ========================
// ⚙️ BASE INIT
// ========================
const tg = window.Telegram.WebApp;
tg.expand();

if (!window.Analytics) window.Analytics = { trackEvent: () => {} };

let currentBfEditId = null;
let bfCachedBuilds = [];
let bfWeaponTypes = [];
let bfScreenHistory = [];
let currentBfWeaponType = null;

// ========================
// 🚀 INIT APP
// ========================
document.addEventListener('DOMContentLoaded', async () => {
  console.log("🔹 Battlefield module loaded");
  await bfLoadBuilds();
  await bfLoadWeaponTypes();
});


// ===================================================================
// 🧱 BATTLEFIELD BUILDS (CRUD)
// ===================================================================

async function bfLoadBuilds() {
  try {
    const res = await fetch('/api/bf/builds');
    const builds = await res.json();

    if (!Array.isArray(builds) || builds.length === 0) {
      document.getElementById('bf-builds-list').innerHTML = '<p>No builds yet.</p>';
      bfCachedBuilds = [];
      return;
    }

    bfCachedBuilds = builds;
    bfRenderBuilds(builds);

  } catch (err) {
    console.error('Error loading BF builds:', err);
  }
}

function bfRenderBuilds(builds) {
  const listEl = document.getElementById('bf-builds-list');
  listEl.innerHTML = '';

  builds.forEach(build => {
    const wrapper = document.createElement('div');
    wrapper.className = 'bf-build js-bf-build';

    const tops = [build.top1, build.top2, build.top3]
      .filter(Boolean)
      .map((mod, i) => `<span class="bf-top bf-top-${i+1}">${mod}</span>`)
      .join('');

    const cats = (build.categories || []).map(c => `<span class="bf-badge">${c}</span>`).join('');

    const tabs = (build.tabs || []).map((tab, tIndex) => `
      <button class="bf-tab-btn ${tIndex===0?'is-active':''}" data-tab="${build.id}-${tIndex}">
        ${tab.label || `Setup ${tIndex+1}`}
      </button>
    `).join('');

    const tabsContent = (build.tabs || []).map((tab, tIndex) => `
      <div class="bf-tab-content ${tIndex===0?'is-active':''}" data-tab-content="${build.id}-${tIndex}">
        ${(tab.items || []).map(m => `
          <div class="bf-module-row">
            <span class="bf-module">${m}</span>
          </div>
        `).join('')}
      </div>
    `).join('');

    wrapper.innerHTML = `
      <div class="bf-build-header js-bf-toggle">
        <h3 class="bf-title">${build.title}</h3>
        <span class="bf-type">${build.weapon_type}</span>
        <div class="bf-tops">${tops}</div>
        <div class="bf-categories">${cats}</div>
        <span class="bf-date">${build.date || ''}</span>
      </div>
      <div class="bf-build-content" style="max-height: 0; overflow: hidden;">
        <div class="bf-tabs">
          <div class="bf-tab-buttons">${tabs}</div>
          <div class="bf-tab-contents">${tabsContent}</div>
        </div>
      </div>
    `;
    listEl.appendChild(wrapper);
  });

  // раскрытие сборок
  document.querySelectorAll('.js-bf-toggle').forEach(header => {
    header.addEventListener('click', () => {
      const buildEl = header.closest('.js-bf-build');
      const content = buildEl.querySelector('.bf-build-content');
      buildEl.classList.toggle('is-open');
      content.style.maxHeight = buildEl.classList.contains('is-open')
        ? content.scrollHeight + 'px'
        : '0';
    });
  });

  // табы
  document.querySelectorAll('.bf-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const parent = btn.closest('.js-bf-build');
      const tabId = btn.dataset.tab;
      parent.querySelectorAll('.bf-tab-btn').forEach(b => b.classList.remove('is-active'));
      parent.querySelectorAll('.bf-tab-content').forEach(c => c.classList.remove('is-active'));
      btn.classList.add('is-active');
      parent.querySelector(`[data-tab-content="${tabId}"]`)?.classList.add('is-active');
    });
  });
}

async function bfHandleSubmit() {
  const title = document.getElementById('bf-title').value.trim();
  const weaponType = document.getElementById('bf-weapon-type').value.trim();
  const top1 = document.getElementById('bf-top1').value.trim();
  const top2 = document.getElementById('bf-top2').value.trim();
  const top3 = document.getElementById('bf-top3').value.trim();
  const date = document.getElementById('bf-date').value;

  const tabs = Array.from(document.querySelectorAll('.bf-tab-block')).map(tab => {
    const label = tab.querySelector('.bf-tab-label').value.trim();
    const items = Array.from(tab.querySelectorAll('.bf-mod-input')).map(i => i.value.trim()).filter(Boolean);
    return { label, items };
  });

  const cats = Array.from(document.querySelectorAll('.bf-cat-checkbox:checked')).map(cb => cb.value);
  const payload = { title, weapon_type: weaponType, top1, top2, top3, date, tabs, categories: cats };

  const method = currentBfEditId ? 'PUT' : 'POST';
  const url = currentBfEditId ? `/api/bf/builds/${currentBfEditId}` : '/api/bf/builds';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      alert(currentBfEditId ? 'Build updated!' : 'Build added!');
      await bfLoadBuilds();
      currentBfEditId = null;
      showScreen('screen-battlefield-main');
    } else {
      const txt = await res.text();
      alert(`Error saving build: ${txt}`);
    }
  } catch (e) {
    console.error(e);
    alert('Connection error');
  }
}

async function bfDeleteBuild(id) {
  if (!confirm('Delete build?')) return;
  try {
    const res = await fetch(`/api/bf/builds/${id}`, { method: 'DELETE' });
    if (res.ok) await bfLoadBuilds();
  } catch (err) {
    console.error(err);
    alert('Error deleting build');
  }
}

document.getElementById('bf-add-tab')?.addEventListener('click', () => {
  const container = document.getElementById('bf-tabs-container');
  const tabDiv = document.createElement('div');
  tabDiv.className = 'bf-tab-block';
  tabDiv.innerHTML = `
    <input type="text" class="bf-tab-label" placeholder="Setup name">
    <div class="bf-modules"></div>
    <button class="btn bf-add-mod">+ Module</button>
    <button class="btn bf-del-tab">🗑 Remove Setup</button>
  `;
  container.appendChild(tabDiv);

  tabDiv.querySelector('.bf-add-mod').addEventListener('click', () => {
    const modInput = document.createElement('input');
    modInput.className = 'bf-mod-input';
    modInput.placeholder = 'Module name';
    tabDiv.querySelector('.bf-modules').appendChild(modInput);
  });

  tabDiv.querySelector('.bf-del-tab').addEventListener('click', () => tabDiv.remove());
});

function bfShowAddForm() {
  currentBfEditId = null;
  document.getElementById('bf-title').value = '';
  document.getElementById('bf-top1').value = '';
  document.getElementById('bf-top2').value = '';
  document.getElementById('bf-top3').value = '';
  document.getElementById('bf-tabs-container').innerHTML = '';
  document.querySelectorAll('.bf-cat-checkbox').forEach(cb => cb.checked = false);
  showScreen('screen-bf-add-build');
}

function bfEditBuild(id) {
  const build = bfCachedBuilds.find(b => b.id === id);
  if (!build) return alert('Build not found');

  currentBfEditId = id;
  document.getElementById('bf-title').value = build.title || '';
  document.getElementById('bf-weapon-type').value = build.weapon_type || '';
  document.getElementById('bf-top1').value = build.top1 || '';
  document.getElementById('bf-top2').value = build.top2 || '';
  document.getElementById('bf-top3').value = build.top3 || '';
  document.getElementById('bf-date').value = build.date || '';
  document.querySelectorAll('.bf-cat-checkbox').forEach(cb => cb.checked = (build.categories || []).includes(cb.value));

  const container = document.getElementById('bf-tabs-container');
  container.innerHTML = '';

  (build.tabs || []).forEach(tab => {
    const tabDiv = document.createElement('div');
    tabDiv.className = 'bf-tab-block';
    tabDiv.innerHTML = `
      <input type="text" class="bf-tab-label" value="${tab.label || ''}">
      <div class="bf-modules"></div>
      <button class="btn bf-add-mod">+ Module</button>
      <button class="btn bf-del-tab">🗑 Remove Setup</button>
    `;
    container.appendChild(tabDiv);

    const modsDiv = tabDiv.querySelector('.bf-modules');
    (tab.items || []).forEach(m => {
      const inp = document.createElement('input');
      inp.className = 'bf-mod-input';
      inp.value = m;
      modsDiv.appendChild(inp);
    });

    tabDiv.querySelector('.bf-add-mod').addEventListener('click', () => {
      const modInput = document.createElement('input');
      modInput.className = 'bf-mod-input';
      modInput.placeholder = 'Module name';
      modsDiv.appendChild(modInput);
    });
    tabDiv.querySelector('.bf-del-tab').addEventListener('click', () => tabDiv.remove());
  });

  showScreen('screen-bf-add-build');
}

document.getElementById('bf-submit-build')?.addEventListener('click', bfHandleSubmit);
document.getElementById('bf-add-build-btn')?.addEventListener('click', bfShowAddForm);


// ===================================================================
// 🔫 WEAPON TYPES MANAGEMENT
// ===================================================================

async function bfLoadWeaponTypes() {
  const res = await fetch('/api/bf/types');
  const types = await res.json();
  const list = document.getElementById('bf-types-list');
  if (!list) return;
  list.innerHTML = '';
  if (!types.length) {
    list.innerHTML = '<p>No weapon types yet.</p>';
    return;
  }

  types.forEach(t => {
    const row = document.createElement('div');
    row.className = 'bf-type-row';
    row.innerHTML = `
      <span class="bf-type-label">${t.label}</span>
      <div class="bf-type-actions">
        <button class="btn btn-sm bf-type-open" data-key="${t.key}" data-label="${t.label}">📖</button>
        <button class="btn btn-sm bf-type-del" data-id="${t.id}">🗑</button>
      </div>`;
    list.appendChild(row);
  });

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
