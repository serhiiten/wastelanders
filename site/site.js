/* Правила «Пустельників»: тема (спільна з Терміналом і аркушами), пошук, зміст на вузькому екрані, вступ «Де грати»,
   інструменти в рамці під спільною шапкою (пакет Б, автор 2026-11-28) */
(function () {
  var root = document.documentElement;
  var KEY = 'pustelnyky-theme';

  /* ---------- Тема — той самий ключ, що в Терміналі й аркушах, тож вибір спільний ---------- */
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
      /* інструменти в рамці чують і сховище; повідомлення — на випадок, коли подія сховища не дійде */
      eachFrame(function (f) { try { f.contentWindow.postMessage({ type: 'pust:theme', theme: dark ? 'dark' : 'light' }, location.origin); } catch (e) {} });
    });
    sync();
  }
  /* інша вкладка чи інструмент змінили тему — підхоплюємо */
  addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    if (e.newValue === 'dark') root.dataset.theme = 'dark'; else delete root.dataset.theme;
    if (b) sync();
  });

  /* ---------- Пошук ---------- */
  var box = document.getElementById('search');
  if (window.PagefindUI && box) {
    new PagefindUI({ element: '#search', showSubResults: true, showImages: false, resetStyles: false });
    /* результати ховаються кліком поза пошуком чи Esc і вертаються, коли знову в полі */
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) box.classList.add('closed'); });
    box.addEventListener('focusin', function () { box.classList.remove('closed'); });
    box.addEventListener('input', function () { box.classList.remove('closed'); });
    box.addEventListener('keydown', function (e) { if (e.key === 'Escape') box.classList.add('closed'); });
  }

  /* ---------- Вміст сторінки (і після підміни оболонкою) ---------- */
  function initPage() {
    /* Зміст розділу на вузькому екрані згорнутий */
    var side = document.querySelector('details.side');
    if (side && matchMedia('(max-width: 900px)').matches) side.removeAttribute('open');
    openPlate(location.hash.slice(1), false);
  }
  /* Вступ «Де грати»: «Докладніше» відкриває панель під табличками, одну за раз */
  function openPlate(id, toggle) {
    var plate = id && document.getElementById(id);
    /* адреса на блок усередині «Де грати» («Одна Пустка на всіх», #eco; пакет Г-А, 1) розгортає згортку */
    if (plate && !plate.classList.contains('plate') && plate.closest('.intro-fold')) {
      plate.closest('.intro-fold').open = true;
      if (!toggle) plate.scrollIntoView({ block: 'start' });
      return true;
    }
    if (!plate || !plate.classList.contains('plate')) return false;
    var btn = plate.querySelector('.plate-more'), panel = document.getElementById(id + '-more');
    var open = toggle ? btn.getAttribute('aria-expanded') !== 'true' : true;
    document.querySelectorAll('.plate-more').forEach(function (x) {
      var on = open && x === btn;
      x.setAttribute('aria-expanded', String(on));
      var p = document.getElementById(x.getAttribute('aria-controls'));
      if (p) p.classList.toggle('on', on);
    });
    /* з таблички розгортається й згортка «Де грати», а з панелі — її «Як встановити» (автор, 2026-11-28, пакет В, 5) */
    var fold = plate.closest('details');
    if (fold) fold.open = true;
    var inst = open && panel && panel.querySelector('details.install');
    if (inst) inst.open = true;
    if (!toggle) plate.scrollIntoView({ block: 'start' });
    return true;
  }
  document.addEventListener('click', function (e) {
    var mb = e.target.closest && e.target.closest('.plate-more');
    if (mb) { openPlate(mb.closest('.plate').id, true); return; }
    /* кнопка меню «Доповнення Owlbear» / «Модуль Foundry VTT»: розгортаємо одразу (і коли хеш уже той самий і не зміниться) */
    var ha = e.target.closest && e.target.closest('a[href^="#"]');
    if (ha) openPlate(ha.getAttribute('href').slice(1), false);
    var cb = e.target.closest && e.target.closest('.copy-btn');
    if (cb) {
      var url = cb.previousElementSibling;
      var done = function () { cb.textContent = 'Скопійовано'; setTimeout(function () { cb.textContent = 'Копіювати'; }, 1500); };
      var pick = function () { getSelection().selectAllChildren(url); };
      try { navigator.clipboard.writeText(url.textContent).then(done, pick); } catch (er) { pick(); }
    }
  });
  addEventListener('hashchange', function () { openPlate(location.hash.slice(1), false); });
  initPage();

  /* ---------- Інструменти в рамці (пакет Б) ----------
     Клік на вкладку, кнопку меню чи «▶ Відкрити…» показує інструмент у рамці цієї ж сторінки: шапка лишається, її підпис —
     назва інструмента, тіло вікі сховане. Кожен інструмент вантажиться при першому відкритті й далі лише ховається.
     Поки існує хоч одна рамка, посилання вікі не перезавантажують документ, а підміняють вміст (оболонка), тож інструменти
     живуть, доки читач на сайті. Ctrl / середня кнопка — звичайна окрема сторінка. */
  var homeLink = document.querySelector('.brand-home');
  if (!homeLink || !window.history || !history.pushState) return;
  var RULES = new URL(homeLink.getAttribute('href'), location.href).href;      // …/wastelanders/rules/
  var SITE = new URL('../', RULES).href;                                       // …/wastelanders/
  var TOOLS = {
    terminal: { file: 'all_generators.html', name: 'Термінал Доглядача' },
    character: { file: 'character_generator.html', name: 'Аркуш персонажа' },
    caravan: { file: 'caravan_generator.html', name: 'Аркуш каравану' }
  };
  var frames = {}, shown = null, opener = null, wikiTitle = document.title, wikiScroll = 0;
  var sub = document.querySelector('.brand-sub'), subText = sub ? sub.textContent : '';
  var stage = document.createElement('div');
  stage.className = 'tool-stage'; stage.inert = true;
  document.body.appendChild(stage);

  function eachFrame(fn) { for (var k in frames) fn(frames[k]); }
  function toolOf(a) {
    if (!a || !a.href) return null;
    var u = new URL(a.href, location.href);
    if (u.origin !== location.origin) return null;
    for (var k in TOOLS) if (u.href.split('#')[0].split('?')[0] === SITE + TOOLS[k].file) return { tool: k, hash: u.hash };
    return null;
  }
  function toolParam() { return new URLSearchParams(location.search).get('tool'); }
  function urlWith(tool) {
    var u = new URL(location.href);
    if (tool) u.searchParams.set('tool', tool); else u.searchParams.delete('tool');
    return u.pathname + u.search + u.hash;
  }
  function placeStage() {
    var hd = document.querySelector('header.rustbar.top');
    stage.style.top = Math.max(0, hd ? hd.getBoundingClientRect().bottom : 0) + 'px';
  }
  addEventListener('resize', function () { if (shown) placeStage(); });

  function frameFor(tool, hash) {
    var f = frames[tool];
    var src = SITE + TOOLS[tool].file + '?embed=1' + (hash || '');
    if (!f) {
      f = document.createElement('iframe');
      f.className = 'tool-frame'; f.title = TOOLS[tool].name; f.dataset.tool = tool;
      f.src = src;
      stage.appendChild(f);
      frames[tool] = f;
    } else if (hash) {
      /* інша вкладка Термінала: та сама сторінка, лише хеш; replace — без нового кроку в історії */
      try { if (f.contentWindow.location.hash !== hash) f.contentWindow.location.replace(src); } catch (e) {}
    }
    return f;
  }
  function fade(el) {
    el.classList.remove('fade-in'); void el.offsetWidth; el.classList.add('fade-in');
  }
  function show(tool, hash) {
    var f = frameFor(tool, hash);
    if (!shown) wikiScroll = scrollY;
    shown = tool;
    eachFrame(function (x) { var on = x === f; x.classList.toggle('on', on); x.inert = !on; });
    root.classList.add('tool-open');
    scrollTo(0, 0);
    placeStage();
    stage.inert = false;
    var main = document.querySelector('main'); if (main) main.inert = true;
    if (sub) sub.textContent = TOOLS[tool].name;
    document.title = TOOLS[tool].name + ' — Пустельники';
    fade(stage);
    f.focus();
  }
  function hide() {
    if (!shown) return;
    shown = null;
    root.classList.remove('tool-open');
    stage.inert = true;
    eachFrame(function (x) { x.classList.remove('on'); x.inert = true; });
    var main = document.querySelector('main'); if (main) { main.inert = false; fade(main); }
    if (sub) sub.textContent = subText;
    document.title = wikiTitle;
    scrollTo(0, wikiScroll);
    var back = opener && document.contains(opener) ? opener : document.querySelector('main h1, main h2');
    if (back) { if (!back.matches('a,button')) back.setAttribute('tabindex', '-1'); back.focus({ preventScroll: true }); }
  }
  function openTool(tool, hash, from) {
    if (shown === tool) { frameFor(tool, hash); return; }
    opener = from || null;
    history.replaceState(Object.assign({}, history.state, { scroll: scrollY }), '');
    history.pushState({ pust: 'tool', tool: tool }, '', urlWith(tool));
    show(tool, hash);
  }
  /* «Правила» в інструменті: назад до сторінки правил, з якої прийшли */
  function backToRules() {
    if (history.state && history.state.pust === 'tool' && !history.state.landed) history.back();
    else { history.replaceState({ pust: 'page' }, '', urlWith(null)); hide(); }
  }
  addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'pust:rules') return;
    var mine = false; eachFrame(function (f) { if (f.contentWindow === e.source) mine = true; });
    if (mine) backToRules();
  });

  /* ---------- Оболонка: сторінки правил без перезавантаження, поки живе хоч одна рамка ---------- */
  var loading = 0;
  function isPage(u) {
    return u.origin === location.origin && u.href.indexOf(RULES) === 0 && /\/$/.test(u.pathname) &&
           !/\/(pagefind|img)\//.test(u.pathname.slice(new URL(RULES).pathname.length - 1));
  }
  function swap(doc, url, hash) {
    var main = document.querySelector('main'), nmain = doc.querySelector('main');
    main.replaceWith(document.importNode(nmain, true));
    document.body.className = doc.body.className;
    wikiTitle = doc.title; document.title = wikiTitle;
    var nh = doc.querySelector('.brand-home'); if (nh) homeLink.setAttribute('href', nh.getAttribute('href'));
    var canon = document.querySelector('link[rel="canonical"]'), nc = doc.querySelector('link[rel="canonical"]');
    if (canon && nc) canon.setAttribute('href', nc.getAttribute('href'));
    if (box) box.classList.add('closed');
    initPage();
    var target = hash && document.getElementById(decodeURIComponent(hash.slice(1)));
    if (!target) {
      var h1 = document.querySelector('main h1') || document.querySelector('main h2');
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    }
    return target;
  }
  function go(url, push, scroll) {
    var u = new URL(url, location.href), n = ++loading;
    return fetch(u.pathname, { credentials: 'same-origin' }).then(function (r) {
      if (r.status !== 200) throw new Error(r.status);
      return r.text();
    }).then(function (text) {
      if (n !== loading) return;
      var doc = new DOMParser().parseFromString(text, 'text/html');
      if (!doc.querySelector('main') || !doc.querySelector('.brand-home')) throw new Error('not a page');
      if (push) {
        history.replaceState(Object.assign({}, history.state, { scroll: shown ? wikiScroll : scrollY }), '');
        history.pushState({ pust: 'page' }, '', u.pathname + u.hash);    // до вставки: відносні адреси картинок
      }
      hide();
      var target = swap(doc, u, u.hash);
      if (scroll != null) scrollTo(0, scroll);
      else if (target) target.scrollIntoView();
      else scrollTo(0, 0);
    }).catch(function () { location.assign(u.href); });
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    var t = toolOf(a);
    if (t) { e.preventDefault(); openTool(t.tool, t.hash, a); return; }
    if (!Object.keys(frames).length) return;          // жодної рамки — звичайний перехід
    var u = new URL(a.href, location.href);
    if (!isPage(u)) return;
    if (u.pathname === location.pathname && u.search === '' && !toolParam()) return;   // якір у межах сторінки
    e.preventDefault();
    if (u.pathname === location.pathname && toolParam()) {      // шапка чи посилання на цю ж сторінку з інструмента
      history.pushState({ pust: 'page' }, '', u.pathname + u.hash); hide();
      if (u.hash) { var tg = document.getElementById(decodeURIComponent(u.hash.slice(1))); if (tg) tg.scrollIntoView(); openPlate(u.hash.slice(1), false); }
      return;
    }
    go(u.href, true, null);
  });

  var curPath = location.pathname;
  addEventListener('popstate', function (e) {
    var st = e.state || {}, tool = toolParam();
    if (location.pathname !== curPath) {
      curPath = location.pathname;
      if (!Object.keys(frames).length) { location.reload(); return; }
      go(location.href, false, tool ? null : (st.scroll || 0)).then(function () { if (tool && TOOLS[tool]) show(tool); });
      return;
    }
    if (tool && TOOLS[tool]) show(tool);
    else if (shown) hide();
  });
  /* оболонка міняє адресу сама: стежимо, на якій сторінці документ */
  var push0 = history.pushState;
  history.pushState = function (s, t, u) { push0.apply(history, arguments); curPath = location.pathname; };

  /* оновлення сторінки з ?tool= відкриває рамку знову (вміст інструментів — з їхнього сховища) */
  var t0 = toolParam();
  if (t0 && TOOLS[t0]) { history.replaceState({ pust: 'tool', tool: t0, landed: true }, ''); show(t0); }
})();
