/* Правила «Пустельників»: тема (спільна з Терміналом і аркушами), пошук, зміст на вузькому екрані */
(function () {
  var root = document.documentElement;
  /* Тема — той самий ключ, що в Терміналі й аркушах, тож вибір спільний */
  var b = document.getElementById('theme-btn');
  function sync() {
    var dark = root.dataset.theme === 'dark', t = dark ? 'Увімкнути світлу тему' : 'Увімкнути темну тему';
    b.setAttribute('aria-pressed', String(dark)); b.title = t; b.setAttribute('aria-label', t);
  }
  if (b) {
    b.addEventListener('click', function () {
      var dark = root.dataset.theme !== 'dark';
      if (dark) root.dataset.theme = 'dark'; else delete root.dataset.theme;
      try { localStorage.setItem('pustelnyky-theme', dark ? 'dark' : 'light'); } catch (e) {}
      sync();
    });
    sync();
  }
  /* інша вкладка змінила тему (Термінал, аркуш) — підхоплюємо */
  addEventListener('storage', function (e) {
    if (e.key !== 'pustelnyky-theme') return;
    if (e.newValue === 'dark') root.dataset.theme = 'dark'; else delete root.dataset.theme;
    if (b) sync();
  });
  /* Зміст розділу на вузькому екрані згорнутий */
  var side = document.querySelector('details.side');
  if (side && matchMedia('(max-width: 900px)').matches) side.removeAttribute('open');
  /* Пошук */
  if (window.PagefindUI && document.getElementById('search')) {
    new PagefindUI({ element: '#search', showSubResults: true, showImages: false, resetStyles: false });
    /* результати ховаються кліком поза пошуком чи Esc і вертаються, коли знову в полі */
    var box = document.getElementById('search');
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) box.classList.add('closed'); });
    box.addEventListener('focusin', function () { box.classList.remove('closed'); });
    box.addEventListener('input', function () { box.classList.remove('closed'); });
    box.addEventListener('keydown', function (e) { if (e.key === 'Escape') box.classList.add('closed'); });
  }
})();
