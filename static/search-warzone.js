// /static/search-warzone.js
const SCORE = { exact: 5, synonym: 4, partial: 2, top: 3 };

const typeSynonyms = {
  assault:  ['штурм','штурмовые','ar','ак','калаш','винтовка'],
  pp:       ['пп','smg','автомат','автоматы'],
  pulemet:  ['пулемет','пулемёт','lmg','ручной'],
  snayperki:['снайпер','снайперки','снайпа','sniper','sr'],
  drobovik: ['дробовик','дроб','shotgun','sg'],
  pehotnay: ['марксман','марксманка','dmr','пехотная','тактическая'],
};

const topSynonyms = {
  '#1': ['#1','топ1','топ 1','№1','номер 1','первый'],
  '#2': ['#2','топ2','топ 2','№2','второй'],
  '#3': ['#3','топ3','топ 3','№3','третий'],
};

function norm(s='') {
  return String(s).toLowerCase().replaceAll('ё','е')
    .replace(/[^\p{L}\p{N}\s#-]/gu,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function has(text, arr) {
  const t = norm(text);
  return arr.some(x => t.includes(norm(x)));
}

export function buildIndex(build, weaponTypeLabels, moduleNameMap) {
  const wtKey = build.weapon_type || '';
  const wtLabel = weaponTypeLabels?.[wtKey] || wtKey;

  const fields = [
    build.title || '',
    wtKey, wtLabel,
    build.top1||'', build.top2||'', build.top3||'',
  ];

  (build.tabs||[]).forEach(tab => {
    fields.push(tab.label||'');
    (tab.items||[]).forEach(en => {
      fields.push(en, moduleNameMap?.[en] || '');
    });
    const n = (tab.items||[]).length;
    if (n>0) fields.push(`${n} модулей`, `${n} мод`, String(n));
  });

  return norm(fields.filter(Boolean).join(' '));
}

export function calcScore(build, query) {
  const q = norm(query);
  if (!q) return 0;

  const idx = build._index || '';
  let score = 0;

  const tokens = q.split(' ').filter(Boolean);
  tokens.forEach(tok => {
    if (idx.includes(tok)) score += SCORE.exact;
    else if (tok.length >= 3 && idx.includes(tok.slice(0, Math.max(2, Math.floor(tok.length*0.6))))) {
      score += SCORE.partial;
    }
  });

  (typeSynonyms[build.weapon_type||''] || []).forEach(s => {
    if (has(q,[s])) score += SCORE.synonym;
  });

  const t1 = !!build.top1, t2 = !!build.top2, t3 = !!build.top3;
  if ((t1 && has(q, topSynonyms['#1'])) ||
      (t2 && has(q, topSynonyms['#2'])) ||
      (t3 && has(q, topSynonyms['#3']))) {
    score += SCORE.top;
  }

  const m = q.match(/\b(\d+)\b/);
  if (m) {
    const n = Number(m[1]);
    if ((build.tabs||[]).some(t => (t.items||[]).length === n)) score += SCORE.exact + 1;
  }

  return score;
}

export function debounce(fn, ms=250) {
  let t; 
  return (...args) => { 
    clearTimeout(t); 
    t=setTimeout(()=>fn(...args),ms); 
  };
}

// Вешаем обработчик ввода и прячем/показываем карточки
export function initSearch({ cachedBuilds }) {
  const input = document.getElementById('build-search');
  if (!input) return;

  const onInput = debounce(() => {
    const query = input.value || '';
    const nodes = document.querySelectorAll('.js-loadout');

    cachedBuilds.forEach((build, i) => {
      const score = calcScore(build, query);
      const el = nodes[i];
      if (el) el.style.display = score > 0 || query.length < 2 ? 'block' : 'none';
    });
  }, 300);

  input.removeEventListener('input', onInput); // на всякий
  input.addEventListener('input', onInput);
}
