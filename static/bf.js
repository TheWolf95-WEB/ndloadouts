// === Battlefield JS ===
document.addEventListener('DOMContentLoaded', async () => {
  const tg = window.Telegram.WebApp;
  tg.expand();

  // === DOM элементы Battlefield ===
  const userBtns = [
    'bf-show-builds-btn',
    'bf-challenges-btn',
    'bf-search-btn'
  ];

  const adminBtns = [
    'bf-weapons-db-btn',
    'bf-challenges-db-btn',
    'bf-modules-dict-btn',
    'bf-add-build-btn',
    'bf-add-challenge-btn'
  ];

  const globalHome = document.querySelector('#screen-battlefield-main .global-home-button');

  // === Проверка прав пользователя ===
  try {
    const res = await fetch('/api/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData })
    });

    const data = await res.json();

    // Прячем всё по умолчанию
    [...userBtns, ...adminBtns].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('is-visible');
    });

    // Показываем кнопки по ролям
    if (data.is_admin) {
      // 👑 админ видит всё
      [...userBtns, ...adminBtns].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('is-visible');
      });
      console.log('✅ Battlefield: админ, показываем все кнопки');
    } else {
      // 👤 обычный пользователь — только базовые
      userBtns.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('is-visible');
      });
      console.log('✅ Battlefield: пользователь, базовые кнопки');
    }

    // Главное меню показываем всем
    if (globalHome) globalHome.style.display = 'block';

  } catch (err) {
    console.error('Ошибка проверки статуса Battlefield:', err);
  }
});
