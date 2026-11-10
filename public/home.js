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
function wmo(c){ return WMO[c] || ['未知', '🌡️']; }

var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
var SHOW_SECONDS = true;

// 和风等文本天气 -> 表情
function textToEmoji(t) {
  if (!t) return '🌡️';
  if (t.indexOf('雷') > -1) return '⛈️';
  if (t.indexOf('雪') > -1) return '🌨️';
  if (t.indexOf('雨') > -1) return '🌧️';
  if (t.indexOf('雾') > -1 || t.indexOf('霾') > -1) return '🌫️';
  if (t.indexOf('阴') > -1) return '☁️';
  if (t.indexOf('多云') > -1) return '⛅';
  if (t.indexOf('晴') > -1) return '☀️';
  return '🌡️';
}

// ---------- 全局配置 ----------
var CONFIG = null;

function applyBackground(cfg){
  var s = cfg.site || {};
  if (s.title) document.title = s.title;
  // 图片背景模式
  if (s.bgMode === 'image' && s.bgValue) {
    document.body.style.backgroundImage = 'url("' + s.bgValue + '")';
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundColor = 'transparent';
    return;
  }
  // 预设渐变 / 自定义颜色模式（bgValue 为渐变或纯色 CSS）
  if ((s.bgMode === 'preset' || s.bgMode === 'custom') && s.bgValue) {
    document.body.style.background = s.bgValue;
    document.body.style.backgroundImage = 'none';
    return;
  }
  // 兼容旧版：直接填了 background（图片 URL）
  if (s.background && (s.background.startsWith('http') || s.background.startsWith('/') || s.background.startsWith('data:'))) {
    document.body.style.backgroundImage = 'url("' + s.background + '")';
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundRepeat = 'no-repeat';
  }
  // 否则保留 CSS 默认渐变
}

// ---------- 时钟 ----------
function tickClock(){
  var now = new Date();
  var p = function(n){ return n < 10 ? '0' + n : '' + n; };
  var t = p(now.getHours()) + ':' + p(now.getMinutes());
  if (SHOW_SECONDS) t += ':' + p(now.getSeconds());
  document.getElementById('clock').textContent = t;
  var wd = '星期' + WEEK[now.getDay()];
  document.getElementById('date').textContent =
    now.getFullYear() + '年' + (now.getMonth()+1) + '月' + now.getDate() + '日 ' + wd;
}

// ---------- 搜索 ----------
function initSearch(cfg){
  var sel = document.getElementById('engineSelect');
  sel.innerHTML = '';
  (cfg.search.engines || []).forEach(function(e){
    var o = document.createElement('option');
    o.value = e.key; o.textContent = e.name;
    sel.appendChild(o);
  });
  var saved = localStorage.getItem('onlytab_engine');
  var def = cfg.search.defaultEngine || (cfg.search.engines[0] && cfg.search.engines[0].key);
  sel.value = (saved && cfg.search.engines.some(function(e){return e.key===saved;})) ? saved : def;
  sel.onchange = function(){ localStorage.setItem('onlytab_engine', sel.value); };

  document.getElementById('searchForm').onsubmit = function(ev){
    ev.preventDefault();
    var q = document.getElementById('searchInput').value.trim();
    if (!q) return;
    var eng = (cfg.search.engines || []).filter(function(e){ return e.key === sel.value; })[0]
            || cfg.search.engines[0];
    if (!eng) return;
    var url = eng.url.replace('{q}', encodeURIComponent(q));
    if (url.indexOf(encodeURIComponent(q)) === -1) url = url + encodeURIComponent(q);
    window.location.href = url;
  };
}

// ---------- 天气（经服务端代理，使用国内源） ----------
function renderWeather(){
  fetch('/api/location').then(function(r){ return r.json(); }).then(function(loc){
    if (loc.error) throw new Error(loc.msg || '定位失败');
    return fetch('/api/weather?lat=' + loc.lat + '&lon=' + loc.lon)
      .then(function(r){ return r.json(); })
      .then(function(d){ d._city = loc.name; return d; });
  }).then(function(d){
    var cityEl = document.getElementById('weatherCity');
    var statusEl = document.getElementById('weatherStatus');
    if (d.error) {
      cityEl.textContent = '天气';
      statusEl.textContent = '获取失败（可在管理页指定城市 / 切换天气源）';
      return;
    }
    statusEl.textContent = '';
    cityEl.textContent = d._city || '本地';
    var cur = d.text ? [d.text, textToEmoji(d.text)] : wmo(d.code);
    document.getElementById('weatherTemp').textContent = d.temp + '°';
    document.getElementById('weatherDesc').textContent = cur[1] + ' ' + cur[0];
    document.getElementById('weatherHL').textContent = '最高 ' + d.high + '° ~ 最低 ' + d.low + '°';

    var fc = document.getElementById('forecast');
    fc.innerHTML = '';
    for (var i = 1; i <= 5 && i < d.daily.length; i++) {
      var day = d.daily[i];
      var dt = new Date(day.date + (day.date.length === 10 ? 'T00:00:00' : ''));
      var wd = '周' + WEEK[dt.getDay()];
      var em = day.text ? textToEmoji(day.text) : wmo(day.code)[1];
      var el = document.createElement('div');
      el.className = 'fc-day';
      el.innerHTML = '<div class="d">' + wd + '</div>' +
        '<div class="e">' + em + '</div>' +
        '<div class="t">' + day.min + '°/' + day.max + '°</div>';
      fc.appendChild(el);
    }
  }).catch(function(e){
    document.getElementById('weatherCity').textContent = '天气';
    document.getElementById('weatherStatus').textContent = '获取失败';
  });
}

// ---------- 样式应用（来自管理页配置） ----------
function applyStyle(cfg){
  var s = cfg.style || {};
  var root = document.documentElement.style;
  root.setProperty('--cols', s.columns || 8);
  root.setProperty('--icon-size', (s.iconSize || 46) + 'px');
  root.setProperty('--tab-weight', s.fontWeight || 400);
  root.setProperty('--time-weight', s.timeFontWeight || 200);
  root.setProperty('--time-size', (s.timeFontSize || 76) + 'px');
  root.setProperty('--time-color', s.timeColor || '#ffffff');
  root.setProperty('--tab-color', s.tabColor || '#ffffff');
  SHOW_SECONDS = s.showSeconds !== false;
}

// ---------- 日历 ----------
function renderCalendar(){
  var now = new Date();
  var y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  document.getElementById('calTitle').textContent = y + '年' + m + '月';

  var lunar = window.getLunar ? window.getLunar(now) : null;
  var wd = '星期' + WEEK[now.getDay()];
  document.getElementById('calBig').textContent = d;
  document.getElementById('calSub').textContent = wd;
  document.getElementById('calLunar').textContent = lunar ? ('农历 ' + lunar.text) : '';

  var firstDay = new Date(y, m - 1, 1).getDay();
  var daysInMonth = new Date(y, m, 0).getDate();
  var daysPrev = new Date(y, m - 1, 0).getDate();
  var grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  WEEK.forEach(function(w){ var h = document.createElement('div'); h.className = 'wd'; h.textContent = w; grid.appendChild(h); });

  var total = 42; // 6 周
  for (var i = 0; i < total; i++) {
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

// ---------- 标签 ----------
function iconHTML(icon, name){
  var letter = (name || '?').trim().charAt(0);
  if (icon && (icon.startsWith('http') || icon.startsWith('/') || icon.startsWith('data:'))) {
    return '<img src="' + icon + '" alt="" onerror="this.style.display=\'none\';this.parentNode.textContent=\'' +
      letter + '\'">';
  }
  return letter;
}

function renderTabs(cfg){
  var wrap = document.getElementById('tabs');
  wrap.innerHTML = '';
  (cfg.tabs || []).forEach(function(t){
    var a = document.createElement('a');
    a.className = 'tab';
    a.href = t.url || '#';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = t.name + (t.url ? '  •  ' + t.url : '');
    a.innerHTML = '<div class="icon">' + iconHTML(t.icon, t.name) + '</div>' +
      '<div class="name">' + (t.name || '') + '</div>';
    wrap.appendChild(a);
  });
}

// ---------- 底部 ----------
function renderFooter(cfg){
  var s = cfg.site || {};
  var parts = [];
  if (s.copyright) parts.push('<span>' + s.copyright + '</span>');
  if (s.icp) parts.push('<a href="https://beian.miit.gov.cn" target="_blank" rel="noopener">' + s.icp + '</a>');
  if (s.police) parts.push('<a href="https://www.beian.gov.cn" target="_blank" rel="noopener">' + s.police + '</a>');
  document.getElementById('footer').innerHTML = parts.join('<span class="sep">|</span>');
}

// ---------- 管理入口浮标 ----------
function addAdminLink(){
  var a = document.createElement('a');
  a.href = '/admin';
  a.title = '管理';
  a.textContent = '⚙';
  a.style.cssText = 'position:fixed;left:14px;top:14px;width:38px;height:38px;' +
    'display:flex;align-items:center;justify-content:center;border-radius:50%;' +
    'background:var(--glass);border:1px solid var(--glass-border);color:#fff;' +
    'backdrop-filter:blur(10px);font-size:18px;cursor:pointer;z-index:50;';
  document.body.appendChild(a);
}

// ---------- 启动 ----------
async function boot(){
  tickClock();
  setInterval(tickClock, 1000);

  try {
    var res = await fetch('/api/config');
    CONFIG = await res.json();
  } catch (e) {
    CONFIG = null;
  }
  if (!CONFIG) CONFIG = { site: {}, search: { engines: [] }, weather: {}, tabs: [] };

  applyBackground(CONFIG);
  applyStyle(CONFIG);
  initSearch(CONFIG);
  renderWeather();
  renderCalendar();
  renderTabs(CONFIG);
  renderFooter(CONFIG);
  addAdminLink();
}

boot();
