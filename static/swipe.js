TGSwipeBack.init({
  screenSelector: '.screen',
  activeClass: 'active',
  backHandler: (prevId) => showScreen(prevId),
  easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
  threshold: 0.25,
});
