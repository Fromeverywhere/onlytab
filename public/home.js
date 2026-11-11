'use strict';

// ---------- 天气代码 -> 文案/表情 ----------
var WMO = {
  0: ['晴', '☀️'], 1: ['晴间多云', '🌤️'], 2: ['多云', '⛅'], 3: ['阴', '☁️'],
  45: ['雾', '🌫️'], 48: ['雾凇', '🌫️'],
  51: ['毛毛雨', '🌦️'], 53: ['毛毛雨', '🌦️'], 55: ['毛毛雨', '🌦️'],
  56: ['冻雨', '🌧️'], 57: ['冻雨', '🌧️'],
  61: ['小雨', '🌧️'], 63: ['中雨', '🌧️'], 65: ['大雨', '🌧️'],
  66: ['冻雨', '🌧️'], 67: ['冻雨', '🌧️'],
  71: ['小雪', '🌨️'], 73: ['中雪', '🌨️'], 75: ['大雪', '🌨️'], 77: ['雪粒', '🌨️'],
  80: ['阵雨', '🌦️'], 81: ['阵雨', '🌦️'], 82: ['强阵雨', '🌦️'],
  85: ['阵雪', '🌨️'], 86: ['阵雪', '🌨️'],
  95: ['雷阵雨', '⛈️'], 96: ['雷阵雨伴冰雹', '⛈️'], 99: ['雷阵雨伴冰雹', '⛈️']
};
function wmo(c) { return WMO[c] || ['未知', '🌡️']; }

var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
var SHOW_SECONDS = true;
var MOBILE_MAX_TABS = 0;
var WIDGET_IDS = ['w:weather', 'w:calendar'];
var CONFIG = null;

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 和风 / 中国天气网等文本天气 -> 表情
function textToEmoji(t) {
  if (!t) return '🌡️';
  if (t.indexOf('雷') > -1) return '⛈️';
  if (t.indexOf('雪') > -1) return '🌨️';
  if (t.indexOf('冰雹') > -1) return '⛈️';
  if (t.indexOf('雨') > -1) return '🌧️';
  if (t.indexOf('雾') > -1 || t.indexOf('霾') > -1 || t.indexOf('沙') > -1) return '🌫️';
  if (t.indexOf('阴') > -1) return '☁️';
  if (t.indexOf('多云') > -1) return '⛅';
  if (t.indexOf('晴') > -1) return '☀️';
  return '🌡️';
}

// ---------- 背景（含 v0.2 修复：渐变不再被 backgroundImage='none' 抹掉） ----------
function cssUrl(u) { return 'url("' + String(u).replace(/"/g, '%22') + '")'; }
function applyBackground(cfg) {
  var s = cfg.site || {};
  if (s.title) document.title = s.title;
  var b = document.body.style;
  // 先清空所有行内背景声明，避免从「图片模式」切回渐变时残留 backgroundImage/size 等
  b.background = '';
  b.backgroundImage = ''; b.backgroundColor = '';
  b.backgroundSize = ''; b.backgroundPosition = '';
  b.backgroundRepeat = ''; b.backgroundAttachment = '';

  if (s.bgMode === 'image' && s.bgValue) {
    b.backgroundImage = cssUrl(s.bgValue);
    b.backgroundSize = 'cover'; b.backgroundPosition = 'center'; b.backgroundRepeat = 'no-repeat';
    return;
  }
  if ((s.bgMode === 'preset' || s.bgMode === 'custom') && s.bgValue) {
    var v = String(s.bgValue).trim();
    // 纯色走 background-color；渐变本身就是 background-image，绝不能清成 none
    if (/^#|^rgb|^hsl/i.test(v)) b.backgroundColor = v;
    else b.backgroundImage = v;
    return;
  }
  // 兼容旧版：直接填了 background 图片 URL
  if (s.background && /^(http|\/|data:)/.test(s.background)) {
    b.backgroundImage = cssUrl(s.background);
    b.backgroundSize = 'cover'; b.backgroundPosition = 'center'; b.backgroundRepeat = 'no-repeat';
  }
  // 否则保留样式表里的默认渐变
}

// ---------- 时钟 ----------
function tickClock() {
  var now = new Date();
  var p = function (n) { return n < 10 ? '0' + n : '' + n; };
  var t = p(now.getHours()) + ':' + p(now.getMinutes());
  if (SHOW_SECONDS) t += ':' + p(now.getSeconds());
  document.getElementById('clock').textContent = t;
  document.getElementById('date').textContent =
    now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 星期' + WEEK[now.getDay()];
}

// ---------- 搜索 ----------
function initSearch(cfg) {
  var sel = document.getElementById('engineSelect');
  sel.innerHTML = '';
  (cfg.search.engines || []).forEach(function (e) {
    var o = document.createElement('option');
    o.value = e.key; o.textContent = e.name;
    sel.appendChild(o);
  });
  var saved = localStorage.getItem('onlytab_engine');
  var def = cfg.search.defaultEngine || (cfg.search.engines[0] && cfg.search.engines[0].key);
  sel.value = (saved && cfg.search.engines.some(function (e) { return e.key === saved; })) ? saved : def;
  sel.onchange = function () { localStorage.setItem('onlytab_engine', sel.value); };
  document.getElementById('searchForm').onsubmit = function (ev) {
    ev.preventDefault();
    var q = document.getElementById('searchInput').value.trim();
    if (!q) return;
    var eng = (cfg.search.engines || []).filter(function (e) { return e.key === sel.value; })[0] || cfg.search.engines[0];
    if (!eng) return;
    var url = eng.url.replace('{q}', encodeURIComponent(q));
    if (url.indexOf(encodeURIComponent(q)) === -1) url = url + encodeURIComponent(q);
    window.location.href = url;
  };
}

// ---------- 天气 ----------
function renderWeather() {
  var locOpt = {};
  try { if (window.AbortSignal && AbortSignal.timeout) locOpt.signal = AbortSignal.timeout(6000); } catch (e) {}
  fetch('/api/location', locOpt).then(function (r) { return r.json(); })
    .catch(function () { return null; })
    .then(function (loc) {
      // 定位失败也不能让天气空白：退回配置城市 / 默认城市，由服务端自动切国内源
      if (loc && loc.error) loc = null;
      loc = loc || {};
      var city = loc.city || loc.name ||
                 (CONFIG && CONFIG.weather && CONFIG.weather.city) || '北京';
      return fetch('/api/weather?lat=' + encodeURIComponent(loc.lat || 0) +
        '&lon=' + encodeURIComponent(loc.lon || 0) +
        '&city=' + encodeURIComponent(city))
        .then(function (r) { return r.json(); })
        .then(function (d) { d._city = loc.name || city; return d; });
    }).then(function (d) {
    var cityEl = document.getElementById('weatherCity');
    var statusEl = document.getElementById('weatherStatus');
    if (d.error) {
      cityEl.textContent = '天气';
      statusEl.textContent = '获取失败（可在管理页指定城市 / 切换天气源）';
      return;
    }
    statusEl.textContent = '';
    cityEl.textContent = d._city || d.city || '本地';
    var cur = d.text ? [d.text, textToEmoji(d.text)] : wmo(d.code);
    document.getElementById('weatherTemp').textContent = d.temp + '°';
    document.getElementById('weatherDesc').textContent = cur[1] + ' ' + cur[0];
    document.getElementById('weatherHL').textContent = '最高 ' + d.high + '° ~ 最低 ' + d.low + '°';

    var fc = document.getElementById('forecast');
    fc.innerHTML = '';
    for (var i = 1; i <= 5 && i < d.daily.length; i++) {
      var day = d.daily[i];
      var dt = new Date(day.date + (day.date.length === 10 ? 'T00:00:00' : ''));
      var wd = isNaN(dt.getTime()) ? '' : '周' + WEEK[dt.getDay()];
      var em = day.text ? textToEmoji(day.text) : wmo(day.code)[1];
      var el = document.createElement('div');
      el.className = 'fc-day';
      el.innerHTML = '<div class="d">' + wd + '</div><div class="e">' + em +
        '</div><div class="t">' + day.min + '°/' + day.max + '°</div>';
      fc.appendChild(el);
    }
  }).catch(function () {
    document.getElementById('weatherCity').textContent = '天气';
    document.getElementById('weatherStatus').textContent = '获取失败';
  });
}

// ---------- 样式应用 ----------
function applyStyle(cfg) {
  var s = cfg.style || {};
  var root = document.documentElement.style;
  root.setProperty('--cols', s.columns || 8);
  root.setProperty('--icon-size', (s.iconSize || 46) + 'px');
  root.setProperty('--tab-weight', s.fontWeight || 400);
  root.setProperty('--time-weight', s.timeFontWeight || 400);
  root.setProperty('--time-size', (s.timeFontSize || 76) + 'px');
  root.setProperty('--time-color', s.timeColor || '#ffffff');
  root.setProperty('--tab-color', s.tabColor || '#ffffff');
  root.setProperty('--mcols', s.mobileColumns || 4);
  root.setProperty('--micon', (s.mobileIconSize || 38) + 'px');
  root.setProperty('--mtime-size', (s.mobileTimeSize || 40) + 'px');
  root.setProperty('--mtab-font', (s.mobileTabFontSize || 12) + 'px');
  var blur = parseInt((cfg.site && cfg.site.bgBlur), 10);
  root.setProperty('--glass-blur', (isNaN(blur) ? 14 : blur) + 'px');
  MOBILE_MAX_TABS = Math.max(0, parseInt(s.mobileMaxTabs, 10) || 0);
  SHOW_SECONDS = s.showSeconds !== false;
  applyWidgetSpan();
}

function applyWidgetSpan() {
  var board = document.getElementById('board');
  if (!board || !CONFIG) return;
  var isMobile = window.matchMedia('(max-width: 760px)').matches;
  var cols = isMobile ? (CONFIG.style.mobileColumns || 4) : (CONFIG.style.columns || 8);
  var span = isMobile ? cols : Math.max(2, Math.round(cols / 2));
  board.style.setProperty('--widget-span', Math.min(span, cols));
}

// ---------- 日历 ----------
function renderCalendar() {
  var now = new Date();
  var y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  document.getElementById('calTitle').textContent = y + '年' + m + '月';
  var lunar = window.getLunar ? window.getLunar(now) : null;
  document.getElementById('calBig').textContent = d;
  document.getElementById('calSub').textContent = '星期' + WEEK[now.getDay()];
  document.getElementById('calLunar').textContent = lunar ? ('农历 ' + lunar.text) : '';

  var firstDay = new Date(y, m - 1, 1).getDay();
  var daysInMonth = new Date(y, m, 0).getDate();
  var daysPrev = new Date(y, m - 1, 0).getDate();
  var grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  WEEK.forEach(function (w) { var h = document.createElement('div'); h.className = 'wd'; h.textContent = w; grid.appendChild(h); });
  for (var i = 0; i < 42; i++) {
    var cell = document.createElement('div');
    cell.className = 'cell';
    var dayNum;
    if (i < firstDay) { dayNum = daysPrev - firstDay + 1 + i; cell.classList.add('out'); }
    else if (i >= firstDay + daysInMonth) { dayNum = i - (firstDay + daysInMonth) + 1; cell.classList.add('out'); }
    else { dayNum = i - firstDay + 1; if (dayNum === d) cell.classList.add('today'); }
    cell.textContent = dayNum;
    grid.appendChild(cell);
  }
}

// ---------- 混排面板 ----------
function iconHTML(icon, name) {
  var letter = esc((name || '?').trim().charAt(0));
  if (icon && /^(http|\/|data:)/.test(icon)) {
    return '<img src="' + esc(icon) + '" alt="" draggable="false" onerror="this.style.display=\'none\';this.parentNode.textContent=\'' +
      letter + '\'">';
  }
  return letter;
}

function widgetHTML(id) {
  if (id === 'w:weather') {
    return '<div class="board-item widget" data-id="w:weather">' +
      '<div class="panel glass"><div class="weather-head">' +
        '<span class="weather-city" id="weatherCity">天气</span>' +
        '<span class="hint" id="weatherStatus"></span></div>' +
      '<div class="weather-temp" id="weatherTemp">--°</div>' +
      '<div class="weather-desc" id="weatherDesc"></div>' +
      '<div class="weather-hl" id="weatherHL"></div>' +
      '<div class="forecast" id="forecast"></div></div></div>';
  }
  return '<div class="board-item widget" data-id="w:calendar">' +
    '<div class="panel glass"><div class="calendar-head">' +
      '<span class="calendar-title" id="calTitle"></span>' +
      '<span class="hint" id="calLunar"></span></div>' +
    '<div class="calendar-big" id="calBig"></div>' +
    '<div class="calendar-sub" id="calSub"></div>' +
    '<div class="calendar-grid" id="calGrid"></div></div></div>';
}

function tabHTML(t, id) {
  var url = esc(t.url || '#');
  var title = esc(t.name + (t.url ? '  •  ' + t.url : ''));
  return '<div class="board-item tab" data-id="' + esc(id) + '">' +
    '<a class="hit icon-hit" href="' + url + '" target="_blank" rel="noopener noreferrer" draggable="false" title="' + title + '">' +
      '<div class="icon">' + iconHTML(t.icon, t.name) + '</div></a>' +
    '<a class="hit name-hit" href="' + url + '" target="_blank" rel="noopener noreferrer" draggable="false" title="' + title + '">' +
      '<div class="name">' + esc(t.name || '') + '</div></a>' +
    '</div>';
}

function validIds() {
  return WIDGET_IDS.concat((CONFIG.tabs || []).map(function (t) { return 't:' + t.id; }));
}

function getOrder() {
  var ids = validIds();
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('onlytab_order') || 'null'); } catch (e) {}
  if (Array.isArray(saved) && saved.length === ids.length &&
      ids.every(function (x) { return saved.indexOf(x) > -1; })) return saved;
  var o = ((CONFIG.layout && CONFIG.layout.order) || []).filter(function (x) { return ids.indexOf(x) > -1; });
  ids.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); });
  return o;
}

function applyOrderToDOM(order) {
  var board = document.getElementById('board');
  order.forEach(function (id) {
    var el = board.querySelector('.board-item[data-id="' + id + '"]');
    if (el) board.appendChild(el); // 已存在的节点 append 即为移动
  });
}

function renderBoard() {
  var board = document.getElementById('board');
  var html = widgetHTML('w:weather') + widgetHTML('w:calendar');
  (CONFIG.tabs || []).forEach(function (t) { html += tabHTML(t, 't:' + t.id); });
  board.innerHTML = html;
  applyOrderToDOM(getOrder());
  applyWidgetSpan();
}

function applyMobileLimit() {
  var board = document.getElementById('board');
  if (!board) return;
  var isMobile = window.matchMedia('(max-width: 760px)').matches;
  var limit = (isMobile && MOBILE_MAX_TABS > 0) ? MOBILE_MAX_TABS : Infinity;
  Array.prototype.forEach.call(board.querySelectorAll('.board-item.tab'), function (el, i) {
    el.style.display = (i < limit) ? '' : 'none';
  });
}

// ---------- 拖动排序（鼠标 + 手机长按，widgets/tabs 混排） ----------
var _drag = null, _lpTimer = null, _suppressClick = false;
function itemFrom(node) { return node && node.closest ? node.closest('.board-item') : null; }
function clearDropMarks() {
  Array.prototype.forEach.call(
    document.querySelectorAll('.board-item.drop-before,.board-item.drop-after'),
    function (el) { el.classList.remove('drop-before', 'drop-after'); });
}
function toast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
}

function setOrder(order) {
  localStorage.setItem('onlytab_order', JSON.stringify(order));
  applyOrderToDOM(order);
  var token = sessionStorage.getItem('onlytab_admin_token') ||
              localStorage.getItem('onlytab_admin_token') || '';
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-admin-token'] = token;
  fetch('/api/order', { method: 'POST', headers: headers, body: JSON.stringify({ order: order }) })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (j.ok) { localStorage.removeItem('onlytab_order'); CONFIG.layout.order = order; }
      else toast('排序已存本机（服务端未接受）');
    })
    .catch(function () { toast('排序已存本机，稍后自动同步'); });
}

function commitMove(id, targetId, after) {
  var order = getOrder().slice();
  var from = order.indexOf(id);
  if (from < 0) return;
  order.splice(from, 1);
  var to = order.indexOf(targetId);
  if (to < 0) return;
  if (after) to++;
  order.splice(to, 0, id);
  setOrder(order);
}

function initDragSort() {
  var board = document.getElementById('board');
  board.addEventListener('pointerdown', function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    var item = itemFrom(e.target);
    if (!item) return;
    _drag = {
      id: item.dataset.id, x: e.clientX, y: e.clientY, el: item, pid: e.pointerId,
      touch: e.pointerType === 'touch', active: false, armed: false,
      target: null, after: false
    };
    if (_drag.touch) {
      _lpTimer = setTimeout(function () {
        if (_drag) { _drag.armed = true; _drag.el.classList.add('drag-ready'); }
      }, 220);
    }
  });
  // 禁用浏览器原生的「拖链接」行为，统一用 pointer 事件
  board.addEventListener('dragstart', function (e) { e.preventDefault(); });

  window.addEventListener('pointermove', function (e) {
    if (!_drag || e.pointerId !== _drag.pid) return;
    var dist = Math.hypot(e.clientX - _drag.x, e.clientY - _drag.y);
    if (!_drag.active) {
      if (_drag.touch && !_drag.armed) return;   // 手机需长按才进入拖动
      if (dist < 7) return;                       // 鼠标需移动阈值，避免误触
      _drag.active = true;
      _drag.el.classList.add('dragging');
      _drag.el.classList.remove('drag-ready');
      document.body.classList.add('dragging-active');
    }
    if (e.cancelable) e.preventDefault();
    var under = document.elementFromPoint(e.clientX, e.clientY);
    var over = itemFrom(under);
    clearDropMarks();
    if (over && over !== _drag.el && over.parentNode === board) {
      var r = over.getBoundingClientRect();
      _drag.target = over.dataset.id;
      _drag.after = (e.clientX > r.left + r.width / 2);
      over.classList.add(_drag.after ? 'drop-after' : 'drop-before');
    } else { _drag.target = null; }
  }, { passive: false });

  // 触屏拖动中阻止页面滚动
  window.addEventListener('touchmove', function (e) {
    if (_drag && _drag.active && e.cancelable) e.preventDefault();
  }, { passive: false });

  function finish() {
    clearTimeout(_lpTimer);
    if (!_drag) return;
    if (_drag.active) {
      _suppressClick = true;
      clearDropMarks();
      _drag.el.classList.remove('dragging', 'drag-ready');
      document.body.classList.remove('dragging-active');
      if (_drag.target && _drag.target !== _drag.id) commitMove(_drag.id, _drag.target, _drag.after);
    } else if (_drag.armed) {
      _drag.el.classList.remove('drag-ready');
    }
    _drag = null;
  }
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', function () {
    clearTimeout(_lpTimer);
    if (_drag) {
      _drag.el.classList.remove('dragging', 'drag-ready');
      document.body.classList.remove('dragging-active');
      clearDropMarks(); _drag = null;
    }
  });
  // 拖动结束后抑制一次点击，避免误打开标签
  board.addEventListener('click', function (e) {
    if (_suppressClick) { e.preventDefault(); e.stopPropagation(); _suppressClick = false; }
  }, true);
}

// ---------- 底部 / 管理入口 ----------
function renderFooter(cfg) {
  var s = cfg.site || {};
  var parts = [];
  if (s.copyright) parts.push('<span>' + esc(s.copyright) + '</span>');
  if (s.icp) parts.push('<a href="https://beian.miit.gov.cn" target="_blank" rel="noopener">' + esc(s.icp) + '</a>');
  if (s.police) parts.push('<a href="https://www.beian.gov.cn" target="_blank" rel="noopener">' + esc(s.police) + '</a>');
  document.getElementById('footer').innerHTML = parts.join('<span class="sep">|</span>');
}

function addAdminLink() {
  var a = document.createElement('a');
  a.href = '/admin'; a.title = '管理'; a.textContent = '⚙';
  a.style.cssText = 'position:fixed;left:14px;top:14px;width:38px;height:38px;' +
    'display:flex;align-items:center;justify-content:center;border-radius:50%;' +
    'background:var(--glass);border:1px solid var(--glass-border);color:#fff;' +
    'backdrop-filter:blur(10px);font-size:18px;cursor:pointer;z-index:50;';
  document.body.appendChild(a);
}

// ---------- 启动 ----------
async function boot() {
  tickClock();
  setInterval(tickClock, 1000);
  try { CONFIG = await (await fetch('/api/config')).json(); }
  catch (e) { CONFIG = null; }
  if (!CONFIG) CONFIG = { site: {}, search: { engines: [] }, weather: {}, tabs: [], layout: {} };
  if (!CONFIG.tabs) CONFIG.tabs = [];
  CONFIG.tabs.forEach(function (t, i) { if (!t.id) t.id = 't' + (i + 1); });
  if (!CONFIG.style) CONFIG.style = {};
  if (!CONFIG.layout) CONFIG.layout = { order: [] };

  applyBackground(CONFIG);
  applyStyle(CONFIG);
  initSearch(CONFIG);
  renderBoard();
  applyMobileLimit();
  initDragSort();
  renderWeather();
  renderCalendar();
  renderFooter(CONFIG);
  addAdminLink();

  var t = null;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(function () { applyWidgetSpan(); applyMobileLimit(); }, 120);
  });
}

boot();
