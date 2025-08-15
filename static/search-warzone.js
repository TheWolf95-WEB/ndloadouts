// /static/search.js
(function (global) {
  // ——— публичные настройки
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
    return String(s)
      .toLowerCase()
      .replaceAll('ё','е')
      .replace(/[^\p{L}\p{N}\s#-]/gu,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function textHasAny(text, list) {
    const t = norm(text);
    return list.some(v => t.includes(norm(v)));
  }

  // строим индекс для одного билда
  function buildSearchIndex(build, weaponTypeLabels, moduleNameMap) {
    const title = build.title || '';
    const wtKey = build.weapon_type || '';
    const wtLabel = weaponTypeLabels?.[wtKey] || wtKey;
    const tops = [build.top1, build.top2, build.top3].filter(Boolean);

    const tabLabels = [];
    const modules = [];
    (build.tabs || []).forEach(tab => {
      tabLabels.push(tab.label || '');
      (tab.items || []).forEach(enKey => {
        modules.push(enKey);
        modules.push(moduleNameMap?.[enKey] || '');
      });
    });

    const modulesCounts = [];
    (build.tabs || []).forEach(tab => {
      const n = (tab.items || []).length;
      if (n > 0) {
        modulesCounts.push(`${n} модулей`, `${n} мод`, String(n));
      }
    });

    return norm([
      title, wtKey, wtLabel, ...tops, ...tabLabels, ...modules, ...modulesCounts
    ].filter(Boolean).join(' '));
  }

  // считаем score
  function calcScore(build, query, moduleNameMap) {
    const q = norm(query);
    if (!q) return 0;

    const index = build._index || '';
    let score = 0;

    const tokens = q.split(' ').filter(Boolean);
    tokens.forEach(tok => {
      if (index.includes(tok)) score += SCORE.exact;
      else if (tok.length >= 3 && index.includes(tok.slice(0, Math.max(2, Math.floor(tok.length*0.6))))) {
        score += SCORE.partial;
      }
    });

    const wt = build.weapon_type || '';
    (typeSynonyms[wt] || []).forEach(syn => {
      if (textHasAny(q, [syn])) score += SCORE.synonym;
    });

    const hasTop1 = Boolean(build.top1);
    const hasTop2 = Boolean(build.top2);
    const hasTop3 = Boolean(build.top3);
    const topMatches =
      (hasTop1 && textHasAny(q, topSynonyms['#1'])) ||
      (hasTop2 && textHasAny(q, topSynonyms['#2'])) ||
      (hasTop3 && textHasAny(q, topSynonyms['#3']));
    if (topMatches) score += SCORE.top;

    const numMatch = q.match(/\b(\d+)\b/);
    if (numMatch) {
      const n = Number(numMatch[1]);
      const tabHasN = (build.tabs || []).some(t => (t.items || []).length === n);
      if (tabHasN) score += SCORE.exact + 1;
    }

    return score;
  }

  function debounce(fn, ms=250) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  global.SearchUtils = {
    norm,
    buildSearchIndex,
    calcScore,
    debounce,
  };
})(window);
