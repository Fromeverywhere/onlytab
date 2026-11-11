'use strict';

var TOKEN = sessionStorage.getItem('onlytab_admin_token') || localStorage.getItem('onlytab_admin_token') || '';
var CURRENT_USER = '';
var CONFIG = null;

// 背景预设（5 个渐变方案）
var BG_PRESETS = [
  'linear-gradient(135deg,#1e3c72 0%,#2a5298 50%,#6dd5ed 100%)',
  'linear-gradient(135deg,#667eea 0%,#764ba2 100%)',
  'linear-gradient(135deg,#f6d365 0%,#fda085 100%)',
  'linear-gradient(135deg,#43e97b 0%,#38f9d7 100%)',
  'linear-gradient(135deg,#0f2027 0%,#203a43 50%,#2c5364 100%)'
];
var BG_PRESET_LABELS = ['深蓝', '紫粉', '日落', '薄荷', '暗夜'];
var BG_IMAGES = [
  'https://picsum.photos/seed/onlytab-a/1920/1080',
  'https://picsum.photos/seed/onlytab-b/1920/1080',
  'https://picsum.photos/seed/onlytab-c/1920/1080'
];
// 预设图标：已保存到本地 public/icons，直接走 /icons/xxx.png，不再依赖图床
var PRESET_ICONS = [
  { name: '百度', url: '/icons/baidu.png' },
  { name: 'Google', url: '/icons/google.png' },
  { name: 'GitHub', url: '/icons/github.png' },
  { name: '哔哩哔哩', url: '/icons/bilibili.png' },
  { name: 'YouTube', url: '/icons/youtube.png' },
  { name: 'ChatGPT', url: '/icons/chatgpt.png' },
  { name: 'DeepSeek', url: '/icons/deepseek.png' },
  { name: 'Claude', url: '/icons/claude.png' },
  { name: 'Gemini', url: '/icons/gemini.png' },
  { name: 'Notion', url: '/icons/notion.png' },
  { name: 'Telegram', url: '/icons/telegram.png' },
  { name: '豆瓣', url: '/icons/douban.png' },
  { name: '百度地图', url: '/icons/baidumap.png' },
  { name: 'CloudFlare', url: '/icons/cloudflare.png' },
  { name: 'Docker', url: '/icons/docker.png' },
  { name: 'HomeAssistant', url: '/icons/homeassistant.png' },
  { name: 'Vaultwarden', url: '/icons/vaultwarden.png' },
  { name: '天气', url: '/icons/weather.png' },
  { name: 'immich', url: '/icons/immich.png' },
  { name: 'Netflix', url: '/icons/netflix.png' }
];

// 与服务端默认一致的兜底默认（用于「恢复默认」）
var DEFAULTS = {
  site: { title: 'OnlyTab', copyright: '© 2026 OnlyTab', icp: '', police: '', background: '',
    bgMode: 'default', bgValue: '', bgColor1: '#1e3c72', bgColor2: '#6dd5ed', bgImage: '', bgBlur: 14 },
  search: {
    defaultEngine: 'baidu',
    engines: [
      { key: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd={q}' },
      { key: 'bing', name: '必应', url: 'https://www.bing.com/search?q={q}' },
      { key: 'google', name: 'Google', url: 'https://www.google.com/search?q={q}' },
      { key: 'sogou', name: '搜狗', url: 'https://www.sogou.com/web?query={q}' },
      { key: 'so', name: '360', url: 'https://www.so.com/s?q={q}' }
    ]
  },
  weather: { mode: 'auto', city: '', provider: 'openmeteo', qweatherPrivateKey: '', qweatherKid: '', qweatherProjectId: '' },
  style: { columns: 8, iconSize: 46, fontWeight: 400, showSeconds: true, timeFontWeight: 400, timeFontSize: 76,
    timeColor: '#ffffff', tabColor: '#ffffff', mobileColumns: 4, mobileIconSize: 38, mobileTimeSize: 40,
    mobileTabFontSize: 12, mobileMaxTabs: 0 },
  layout: { order: [], publicReorder: true },
  tabs: [
    { id: 't1', name: '百度', url: 'https://www.baidu.com', icon: '/icons/baidu.png' },
    { id: 't2', name: '必应', url: 'https://www.bing.com', icon: 'https://www.bing.com/favicon.ico' },
    { id: 't3', name: 'GitHub', url: 'https://github.com', icon: '/icons/github.png' },
    { id: 't4', name: '知乎', url: 'https://www.zhihu.com', icon: 'https://www.zhihu.com/favicon.ico' },
    { id: 't5', name: '哔哩哔哩', url: 'https://www.bilibili.com', icon: '/icons/bilibili.png' },
    { id: 't6', name: '高德地图', url: 'https://www.amap.com', icon: 'https://www.amap.com/favicon.ico' },
    { id: 't7', name: '网易云音乐', url: 'https://music.163.com', icon: 'https://music.163.com/favicon.ico' },
    { id: 't8', name: 'CSDN', url: 'https://www.csdn.net', icon: 'https://www.csdn.net/favicon.ico' }
  ]
};

// ---------- 子页面导航 ----------
function switchPage(name) {
  Array.prototype.forEach.call(document.querySelectorAll('.nav button'), function (b) {
    b.classList.toggle('active', b.dataset.page === name);
  });
  Array.prototype.forEach.call(document.querySelectorAll('.page'), function (s) {
    s.classList.toggle('hidden', s.dataset.page !== name);
  });
}
document.getElementById('nav').addEventListener('click', function (e) {
  var b = e.target.closest('.nav button');
  if (b) switchPage(b.dataset.page);
});

// ---------- API ----------
async function api(path, method, body) {
  var headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['x-admin-token'] = TOKEN;
  var opt = { method: method || 'GET', headers: headers };
  if (body !== undefined) opt.body = JSON.stringify(body);
  var res = await fetch(path, opt);
  if (res.status === 401) { showLogin(true); throw new Error('unauthorized'); }
  return res;
}
function showLogin(show) { document.getElementById('loginMask').classList.toggle('hidden', !show); }

document.getElementById('loginBtn').onclick = doLogin;
document.getElementById('loginPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
document.getElementById('loginUser').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
async function doLogin() {
  var u = document.getElementById('loginUser').value.trim();
  var p = document.getElementById('loginPass').value;
  document.getElementById('loginErr').textContent = '';
  try {
    var j = await (await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: u, pass: p })
    })).json();
    if (j.ok) {
      TOKEN = j.token; CURRENT_USER = j.user;
      sessionStorage.setItem('onlytab_admin_token', TOKEN);
      localStorage.setItem('onlytab_admin_token', TOKEN);
      load();
    } else document.getElementById('loginErr').textContent = '用户名或密码错误';
  } catch (e) { document.getElementById('loginErr').textContent = '登录失败：' + e.message; }
}

// ---------- 修改账号 ----------
document.getElementById('accBtn').onclick = async function () {
  var nu = document.getElementById('accUser').value.trim();
  var np = document.getElementById('accPass').value;
  var status = document.getElementById('accStatus');
  status.style.color = '#dc2626';
  if (!nu) { status.textContent = '用户名不能为空'; return; }
  if (np && np.length < 6) { status.textContent = '密码至少 6 位'; return; }
  try {
    var j = await (await api('/api/account', 'POST', { user: nu, pass: np })).json();
    if (j.ok) {
      status.style.color = '#16a34a'; status.textContent = '已修改，请重新登录';
      TOKEN = ''; CURRENT_USER = '';
      sessionStorage.removeItem('onlytab_admin_token');
      localStorage.removeItem('onlytab_admin_token');
      document.getElementById('accPass').value = '';
      setTimeout(function () { showLogin(true); }, 800);
    } else status.textContent = j.error || '修改失败';
  } catch (e) { status.textContent = '修改失败：' + e.message; }
};

// ---------- 上传 ----------
function uploadFile(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      api('/api/upload', 'POST', { filename: file.name, data: reader.result })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j.ok) resolve(j.url); else reject(new Error(j.error || 'upload failed')); })
        .catch(reject);
    };
    reader.onerror = function () { reject(new Error('read failed')); };
    reader.readAsDataURL(file);
  });
}
function bindUpload(btnId, fileId, onDone) {
  var btn = document.getElementById(btnId);
  var inp = document.getElementById(fileId);
  var original = btn.textContent;
  function handle(file) {
    if (!file) return;
    btn.textContent = '上传中…';
    uploadFile(file).then(function (url) {
      onDone(url); btn.textContent = '上传成功 ✓';
      setTimeout(function () { btn.textContent = original; }, 1800);
    }).catch(function (e) {
      btn.textContent = '上传失败'; alert('上传失败：' + e.message);
      setTimeout(function () { btn.textContent = original; }, 1800);
    });
  }
  btn.onclick = function (e) { e.stopPropagation(); inp.click(); };
  inp.onchange = function () { if (inp.files && inp.files[0]) handle(inp.files[0]); inp.value = ''; };
  var zone = document.getElementById('bgUploadZone');
  if (zone) {
    zone.addEventListener('click', function (e) { if (e.target.closest('button,img')) return; inp.click(); });
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('over'); });
    zone.addEventListener('drop', function (e) {
      e.preventDefault(); zone.classList.remove('over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]);
    });
  }
}

// ---------- 工具 ----------
function escapeAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function move(arr, i, dir) { var j = i + dir; if (j < 0 || j >= arr.length) return; var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
function normHex(v) {
  if (!v) return '';
  v = String(v).trim();
  if (/^#([0-9a-fA-F]{6})$/.test(v)) return v.toLowerCase();
  if (/^#([0-9a-fA-F]{3})$/.test(v)) return '#' + v.slice(1).split('').map(function (c) { return c + c; }).join('').toLowerCase();
  return '';
}
function toColorInput(v) { return normHex(v) || '#ffffff'; }
function iconPreview(icon, name) {
  var letter = escapeHtml((name || '?').trim().charAt(0));
  if (icon && /^(http|\/|data:)/.test(icon)) {
    return '<img src="' + icon.replace(/"/g, '%22') + '" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\';this.parentNode.textContent=\'' + letter + '\'">';
  }
  return letter;
}
function setStatus(msg, ok) {
  var s = document.getElementById('status');
  s.textContent = msg; s.style.color = ok ? '#16a34a' : '#dc2626';
  if (msg) setTimeout(function () { s.textContent = ''; }, 3000);
}

// ---------- 渲染：标签（紧凑多列） ----------
function renderTabs() {
  var box = document.getElementById('tabs');
  box.innerHTML = '';
  CONFIG.tabs.forEach(function (t, i) {
    var item = document.createElement('div');
    item.className = 'tedit';
    item.innerHTML =
      '<div class="trow">' +
        '<div class="ic" id="prev-' + i + '" title="点击选预设图标">' + iconPreview(t.icon, t.name) + '</div>' +
        '<input type="text" placeholder="名称" value="' + escapeAttr(t.name) + '" data-i="' + i + '" class="t-name" style="flex:1">' +
      '</div>' +
      '<input type="text" placeholder="跳转 URL（https://...）" value="' + escapeAttr(t.url) + '" data-i="' + i + '" class="t-url" style="width:100%;margin-bottom:6px">' +
      '<input type="text" placeholder="图标 URL 或选预设" value="' + escapeAttr(t.icon) + '" data-i="' + i + '" class="t-icon" style="width:100%;margin-bottom:6px">' +
      '<div class="mini">' +
        '<span class="pickbtn" data-pick="' + i + '">预设图标</span>' +
        '<span class="pickbtn" id="up-' + i + '">上传</span>' +
        '<input type="file" id="upf-' + i + '" accept="image/*" class="hidden">' +
        '<button class="btn ghost sm" type="button" data-up="' + i + '">↑</button>' +
        '<button class="btn ghost sm" type="button" data-down="' + i + '">↓</button>' +
        '<button class="btn danger sm" type="button" data-del="' + i + '">删</button>' +
      '</div>';
    box.appendChild(item);
    item.querySelector('.t-name').oninput = function (e) { CONFIG.tabs[i].name = e.target.value; document.getElementById('prev-' + i).innerHTML = iconPreview(CONFIG.tabs[i].icon, CONFIG.tabs[i].name); };
    item.querySelector('.t-url').oninput = function (e) { CONFIG.tabs[i].url = e.target.value; };
    var iconInput = item.querySelector('.t-icon');
    iconInput.oninput = function (e) { CONFIG.tabs[i].icon = e.target.value; document.getElementById('prev-' + i).innerHTML = iconPreview(CONFIG.tabs[i].icon, CONFIG.tabs[i].name); };
    document.getElementById('prev-' + i).onclick = function () { openIconPick(i); };
    item.querySelector('[data-pick]').onclick = function () { openIconPick(i); };
    document.getElementById('up-' + i).onclick = function () { document.getElementById('upf-' + i).click(); };
    document.getElementById('upf-' + i).onchange = function () {
      if (this.files && this.files[0]) {
        uploadFile(this.files[0]).then(function (url) {
          CONFIG.tabs[i].icon = url; iconInput.value = url;
          document.getElementById('prev-' + i).innerHTML = iconPreview(url, CONFIG.tabs[i].name);
        }).catch(function (e) { alert('上传失败：' + e.message); });
      }
    };
  });
  box.querySelectorAll('[data-up]').forEach(function (b) { b.onclick = function () { move(CONFIG.tabs, +b.dataset.up, -1); renderTabs(); }; });
  box.querySelectorAll('[data-down]').forEach(function (b) { b.onclick = function () { move(CONFIG.tabs, +b.dataset.down, 1); renderTabs(); }; });
  box.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { CONFIG.tabs.splice(+b.dataset.del, 1); renderTabs(); }; });
}

// ---------- 渲染：引擎 ----------
function renderEngines() {
  var box = document.getElementById('engines');
  box.innerHTML = '';
  CONFIG.search.engines.forEach(function (e, i) {
    var item = document.createElement('div');
    item.className = 'item';
    item.innerHTML =
      '<div class="row">' +
        '<div><label>名称</label><input type="text" value="' + escapeAttr(e.name) + '" data-i="' + i + '" class="e-name"></div>' +
        '<div><label>Key</label><input type="text" value="' + escapeAttr(e.key) + '" data-i="' + i + '" class="e-key"></div>' +
      '</div>' +
      '<label>搜索链接（用 {q} 表示关键词）</label>' +
      '<input type="text" value="' + escapeAttr(e.url) + '" data-i="' + i + '" class="e-url">' +
      '<div class="actions"><button class="btn danger sm" type="button" data-del="' + i + '">删除</button></div>';
    box.appendChild(item);
    item.querySelector('.e-name').oninput = function (ev) { CONFIG.search.engines[i].name = ev.target.value; };
    item.querySelector('.e-key').oninput = function (ev) { CONFIG.search.engines[i].key = ev.target.value; };
    item.querySelector('.e-url').oninput = function (ev) { CONFIG.search.engines[i].url = ev.target.value; };
  });
  box.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { CONFIG.search.engines.splice(+b.dataset.del, 1); renderEngines(); fillDefaultEngine(); }; });
}
function fillDefaultEngine() {
  var sel = document.getElementById('searchDefault');
  sel.innerHTML = '';
  CONFIG.search.engines.forEach(function (e) {
    var o = document.createElement('option'); o.value = e.key; o.textContent = e.name; sel.appendChild(o);
  });
  if (CONFIG.search.engines.some(function (e) { return e.key === CONFIG.search.defaultEngine; })) sel.value = CONFIG.search.defaultEngine;
  else if (CONFIG.search.engines[0]) sel.value = CONFIG.search.engines[0].key;
}

// ---------- 背景模式 / 色板 ----------
var _selPreset = '', _selImage = '';
function getBgMode() {
  var r = document.querySelector('input[name="bgMode"]:checked');
  return r ? r.value : 'default';
}
function setBgMode(m) {
  var r = document.querySelector('input[name="bgMode"][value="' + m + '"]');
  if (r) r.checked = true;
  applyBgMode();
}
function applyBgMode() {
  var m = getBgMode();
  Array.prototype.forEach.call(document.querySelectorAll('.mode-card'), function (c) {
    c.classList.toggle('active', c.dataset.mode === m);
  });
  Array.prototype.forEach.call(document.querySelectorAll('.bg-section'), function (sec) {
    var off = sec.dataset.for !== m;
    sec.classList.toggle('disabled', off);
    Array.prototype.forEach.call(sec.querySelectorAll('input,select,button,textarea'), function (el) {
      if (el.type !== 'file') el.disabled = off;
    });
  });
}
function onBgModeChange() {
  var m = getBgMode();
  if (m === 'preset' && !_selPreset) { _selPreset = BG_PRESETS[0]; highlightPreset(); }
  if (m === 'image' && !document.getElementById('bgImage').value) {
    document.getElementById('bgImage').value = BG_IMAGES[0];
    _selImage = BG_IMAGES[0]; highlightImage(); updateBgPreview();
  }
  applyBgMode();
}

function buildBgSwatches() {
  var sw = document.getElementById('bgSwatches');
  sw.innerHTML = '';
  BG_PRESETS.forEach(function (g, i) {
    var d = document.createElement('div');
    d.className = 'swatch'; d.style.background = g;
    d.innerHTML = '<span class="lbl">' + BG_PRESET_LABELS[i] + '</span>';
    d.onclick = function () { setBgMode('preset'); _selPreset = g; highlightPreset(); };
    sw.appendChild(d);
  });
  var im = document.getElementById('bgImages');
  im.innerHTML = '';
  BG_IMAGES.forEach(function (u) {
    var d = document.createElement('div');
    d.className = 'swatch'; d.style.backgroundImage = 'url("' + u + '")';
    d.onclick = function () {
      setBgMode('image');
      document.getElementById('bgImage').value = u; _selImage = u;
      highlightImage(); updateBgPreview();
    };
    im.appendChild(d);
  });
}
function highlightPreset() {
  var sw = document.getElementById('bgSwatches');
  Array.prototype.forEach.call(sw.children, function (x, i) { x.classList.toggle('active', _selPreset === BG_PRESETS[i]); });
}
function highlightImage() {
  var im = document.getElementById('bgImages');
  Array.prototype.forEach.call(im.children, function (x, i) { x.classList.toggle('active', _selImage === BG_IMAGES[i]); });
}
function applyBgActive() {
  _selPreset = (CONFIG.site.bgMode === 'preset') ? (CONFIG.site.bgValue || BG_PRESETS[0]) : '';
  _selImage = (CONFIG.site.bgMode === 'image') ? (CONFIG.site.bgValue || CONFIG.site.bgImage || '') : '';
  highlightPreset(); highlightImage(); updateBgPreview();
}
function updateBgPreview() {
  var url = document.getElementById('bgImage').value.trim();
  var img = document.getElementById('bgPreview');
  if (url) { img.src = url; img.classList.remove('hidden'); }
  else { img.removeAttribute('src'); img.classList.add('hidden'); }
}

// ---------- 毛玻璃滑块 / 数值 ----------
function bindBlurPair() {
  var r = document.getElementById('bgBlurRange'), n = document.getElementById('bgBlurNum');
  function clamp(v) { v = parseInt(v, 10); if (isNaN(v)) v = 14; return Math.max(0, Math.min(40, v)); }
  r.oninput = function () { n.value = r.value; };
  n.oninput = function () { var v = clamp(n.value); r.value = v; };
  n.onchange = function () { n.value = clamp(n.value); r.value = n.value; };
}
function getBlur() { return parseInt(document.getElementById('bgBlurRange').value, 10) || 0; }
function setBlur(v) {
  v = Math.max(0, Math.min(40, parseInt(v, 10) || 0));
  document.getElementById('bgBlurRange').value = v;
  document.getElementById('bgBlurNum').value = v;
}

// ---------- 时钟实时预览 ----------
function updateTimePreview() {
  var size = parseInt(document.getElementById('styleTimeSize').value, 10) || 76;
  var weight = parseInt(document.getElementById('styleTimeWeight').value, 10) || 400;
  var color = normHex(document.getElementById('styleTimeColorHex').value) || '#ffffff';
  var c = document.getElementById('tpClock'), d = document.getElementById('tpDate');
  c.style.fontSize = Math.min(size, 72) + 'px';
  c.style.fontWeight = weight; c.style.color = color;
  d.style.fontSize = Math.max(12, Math.min(size * 0.26, 20)) + 'px';
  d.style.fontWeight = weight; d.style.color = color;
}

// ---------- 预设图标选择弹层 ----------
var _pickTabIndex = -1;
function buildIconPick() {
  var grid = document.getElementById('iconPickGrid');
  grid.innerHTML = '';
  PRESET_ICONS.forEach(function (p) {
    var cell = document.createElement('div');
    cell.className = 'cell';
    cell.innerHTML = '<img src="' + p.url + '" alt="" onerror="this.style.visibility=\'hidden\'"><div class="n">' + escapeHtml(p.name) + '</div>';
    cell.onclick = function () {
      if (_pickTabIndex >= 0 && CONFIG.tabs[_pickTabIndex]) {
        CONFIG.tabs[_pickTabIndex].icon = p.url;
        var prev = document.getElementById('prev-' + _pickTabIndex);
        if (prev) prev.innerHTML = iconPreview(p.url, CONFIG.tabs[_pickTabIndex].name);
        var inp = document.querySelector('.t-icon[data-i="' + _pickTabIndex + '"]');
        if (inp) inp.value = p.url;
      }
      closeIconPick();
    };
    grid.appendChild(cell);
  });
}
function openIconPick(i) { _pickTabIndex = i; document.getElementById('iconPick').classList.add('show'); }
function closeIconPick() { _pickTabIndex = -1; document.getElementById('iconPick').classList.remove('show'); }
document.getElementById('iconPickClose').onclick = closeIconPick;
document.getElementById('iconPick').onclick = function (e) { if (e.target === this) closeIconPick(); };

// ---------- 颜色输入同步 ----------
function bindColorPair(colorId, hexId) {
  var c = document.getElementById(colorId), h = document.getElementById(hexId);
  c.oninput = function () { h.value = c.value; updateTimePreview(); };
  h.oninput = function () { var n = normHex(h.value); if (n) c.value = n; updateTimePreview(); };
}

// ---------- 和风 JWT 密钥对 ----------
document.getElementById('genKeyBtn').onclick = async function () {
  if (!confirm('将生成 Ed25519 密钥对：私钥保存到服务端，公钥用于上传到和风控制台。继续？')) return;
  try {
    var j = await (await api('/api/qweather-keygen', 'POST', {})).json();
    if (j.ok) {
      document.getElementById('weatherPrivKey').value = j.privateKey;
      document.getElementById('pubKeyBox').style.display = 'block';
      document.getElementById('pubKeyArea').value = j.publicKey;
      setStatus('已生成密钥对，请上传公钥到和风控制台', true);
    } else setStatus('生成失败', false);
  } catch (e) { setStatus('生成失败：' + e.message, false); }
};
document.getElementById('copyPubBtn').onclick = function () {
  var t = document.getElementById('pubKeyArea');
  if (t) { t.select(); try { document.execCommand('copy'); setStatus('公钥已复制', true); } catch (e) {} }
};

// ---------- 天气源说明切换 ----------
function updateProviderNote() {
  var p = document.getElementById('weatherProvider').value;
  document.getElementById('providerNoteOpenmeteo').classList.toggle('hidden', p !== 'openmeteo');
  document.getElementById('providerNoteChina').classList.toggle('hidden', p !== 'chinaweather');
  document.getElementById('providerNoteQweather').classList.toggle('hidden', p !== 'qweather');
}

// ---------- 填充配置 ----------
function renderSite() {
  document.getElementById('siteTitle').value = CONFIG.site.title || '';
  document.getElementById('siteCopyright').value = CONFIG.site.copyright || '';
  document.getElementById('siteIcp').value = CONFIG.site.icp || '';
  document.getElementById('sitePolice').value = CONFIG.site.police || '';
  var bg = CONFIG.site;
  setBgMode(bg.bgMode || 'default');
  document.getElementById('bgColor1').value = toColorInput(bg.bgColor1);
  document.getElementById('bgColor1Hex').value = bg.bgColor1 || '#1e3c72';
  document.getElementById('bgColor2').value = toColorInput(bg.bgColor2);
  document.getElementById('bgColor2Hex').value = bg.bgColor2 || '#6dd5ed';
  document.getElementById('bgImage').value = bg.bgImage || '';
  setBlur(bg.bgBlur != null ? bg.bgBlur : 14);
  applyBgActive();

  document.getElementById('weatherMode').value = CONFIG.weather.mode || 'auto';
  document.getElementById('weatherCity').value = CONFIG.weather.city || '';
  document.getElementById('weatherProvider').value = CONFIG.weather.provider || 'openmeteo';
  document.getElementById('weatherPrivKey').value = CONFIG.weather.qweatherPrivateKey || '';
  document.getElementById('weatherKid').value = CONFIG.weather.qweatherKid || '';
  document.getElementById('weatherProjectId').value = CONFIG.weather.qweatherProjectId || '';
  updateProviderNote();

  var st = CONFIG.style || {};
  document.getElementById('styleColumns').value = (st.columns != null) ? st.columns : 8;
  document.getElementById('styleIconSize').value = (st.iconSize != null) ? st.iconSize : 46;
  document.getElementById('styleWeight').value = (st.fontWeight != null) ? st.fontWeight : 400;
  document.getElementById('styleSeconds').value = (st.showSeconds !== false) ? '1' : '0';
  document.getElementById('styleTimeSize').value = (st.timeFontSize != null) ? st.timeFontSize : 76;
  document.getElementById('styleTimeWeight').value = (st.timeFontWeight != null) ? st.timeFontWeight : 400;
  document.getElementById('styleTimeColor').value = toColorInput(st.timeColor);
  document.getElementById('styleTimeColorHex').value = st.timeColor || '#ffffff';
  document.getElementById('styleTabColor').value = toColorInput(st.tabColor);
  document.getElementById('styleTabColorHex').value = st.tabColor || '#ffffff';
  document.getElementById('styleMobileColumns').value = (st.mobileColumns != null) ? st.mobileColumns : 4;
  document.getElementById('styleMobileIcon').value = (st.mobileIconSize != null) ? st.mobileIconSize : 38;
  document.getElementById('styleMobileTime').value = (st.mobileTimeSize != null) ? st.mobileTimeSize : 40;
  document.getElementById('styleMobileFont').value = (st.mobileTabFontSize != null) ? st.mobileTabFontSize : 12;
  document.getElementById('styleMobileMaxTabs').value = (st.mobileMaxTabs != null) ? st.mobileMaxTabs : 0;
  updateTimePreview();
}

function readSite() {
  CONFIG.site.title = document.getElementById('siteTitle').value.trim();
  CONFIG.site.copyright = document.getElementById('siteCopyright').value.trim();
  CONFIG.site.icp = document.getElementById('siteIcp').value.trim();
  CONFIG.site.police = document.getElementById('sitePolice').value.trim();

  var bgMode = getBgMode();
  var c1 = normHex(document.getElementById('bgColor1Hex').value) || normHex(document.getElementById('bgColor1').value) || '#1e3c72';
  var c2 = normHex(document.getElementById('bgColor2Hex').value) || normHex(document.getElementById('bgColor2').value) || '#6dd5ed';
  var bgImage = document.getElementById('bgImage').value.trim();
  CONFIG.site.bgMode = bgMode;
  CONFIG.site.bgColor1 = c1;
  CONFIG.site.bgColor2 = c2;
  CONFIG.site.bgImage = bgImage;
  CONFIG.site.bgBlur = getBlur();
  if (bgMode === 'preset') CONFIG.site.bgValue = _selPreset || BG_PRESETS[0];
  else if (bgMode === 'custom') CONFIG.site.bgValue = (c1 === c2) ? c1 : ('linear-gradient(135deg,' + c1 + ' 0%,' + c2 + ' 100%)');
  else if (bgMode === 'image') CONFIG.site.bgValue = bgImage;
  else CONFIG.site.bgValue = '';
  CONFIG.site.background = (bgMode === 'image' && bgImage) ? bgImage : '';

  CONFIG.weather.mode = document.getElementById('weatherMode').value;
  CONFIG.weather.city = document.getElementById('weatherCity').value.trim();
  CONFIG.weather.provider = document.getElementById('weatherProvider').value;
  delete CONFIG.weather.qweatherKey; // 旧版 API KEY 已移除
  var pk = document.getElementById('weatherPrivKey').value.trim();
  if (pk === '__CLEAR__') CONFIG.weather.qweatherPrivateKey = '__CLEAR__';
  else if (pk) CONFIG.weather.qweatherPrivateKey = pk;
  CONFIG.weather.qweatherKid = document.getElementById('weatherKid').value.trim();
  CONFIG.weather.qweatherProjectId = document.getElementById('weatherProjectId').value.trim();

  CONFIG.search.defaultEngine = document.getElementById('searchDefault').value;
  CONFIG.style = {
    columns: parseInt(document.getElementById('styleColumns').value, 10) || 8,
    iconSize: parseInt(document.getElementById('styleIconSize').value, 10) || 46,
    fontWeight: parseInt(document.getElementById('styleWeight').value, 10) || 400,
    showSeconds: document.getElementById('styleSeconds').value === '1',
    timeFontWeight: parseInt(document.getElementById('styleTimeWeight').value, 10) || 400,
    timeFontSize: parseInt(document.getElementById('styleTimeSize').value, 10) || 76,
    timeColor: normHex(document.getElementById('styleTimeColorHex').value) || normHex(document.getElementById('styleTimeColor').value) || '#ffffff',
    tabColor: normHex(document.getElementById('styleTabColorHex').value) || normHex(document.getElementById('styleTabColor').value) || '#ffffff',
    mobileColumns: parseInt(document.getElementById('styleMobileColumns').value, 10) || 4,
    mobileIconSize: parseInt(document.getElementById('styleMobileIcon').value, 10) || 38,
    mobileTimeSize: parseInt(document.getElementById('styleMobileTime').value, 10) || 40,
    mobileTabFontSize: parseInt(document.getElementById('styleMobileFont').value, 10) || 12,
    mobileMaxTabs: Math.max(0, parseInt(document.getElementById('styleMobileMaxTabs').value, 10) || 0)
  };
}

// ---------- 保存 / 排序 ----------
document.getElementById('saveBtn').onclick = function () {
  readSite();
  api('/api/config', 'POST', CONFIG).then(function (r) {
    if (r.ok) setStatus('已保存 ✓', true); else setStatus('保存失败', false);
  }).catch(function (e) { setStatus('保存失败：' + e.message, false); });
};
document.getElementById('resetBtn').onclick = function () {
  if (!confirm('将恢复为内置默认配置并保存，确定？')) return;
  CONFIG = JSON.parse(JSON.stringify(DEFAULTS));
  renderAll();
  api('/api/config', 'POST', CONFIG).then(function (r) { if (r.ok) setStatus('已恢复默认 ✓', true); });
};

function currentOrder() {
  return ['w:weather', 'w:calendar'].concat(CONFIG.tabs.map(function (t) { return 't:' + t.id; }));
}
async function saveOrder(order) {
  return (await api('/api/order', 'POST', { order: order })).json();
}
document.getElementById('resetLayoutBtn').onclick = async function () {
  var st = document.getElementById('layoutStatus');
  try {
    var j = await saveOrder(currentOrder());
    if (j.ok) {
      CONFIG.layout.order = currentOrder();
      localStorage.removeItem('onlytab_order');
      st.style.color = '#16a34a'; st.textContent = '已恢复默认顺序 ✓';
    } else st.textContent = '失败';
  } catch (e) { st.style.color = '#dc2626'; st.textContent = '失败：' + e.message; }
};
document.getElementById('syncOrderBtn').onclick = async function () {
  var raw = localStorage.getItem('onlytab_order');
  if (!raw) { setStatus('本机没有待同步的排序', false); return; }
  try {
    var order = JSON.parse(raw);
    var valid = currentOrder();
    if (!Array.isArray(order) || order.length !== valid.length || !valid.every(function (x) { return order.indexOf(x) > -1; })) {
      setStatus('本机排序与当前标签不匹配，已忽略', false); return;
    }
    var j = await saveOrder(order);
    if (j.ok) { localStorage.removeItem('onlytab_order'); CONFIG.layout.order = order; setStatus('排序已同步 ✓', true); }
    else setStatus('同步失败', false);
  } catch (e) { setStatus('同步失败：' + e.message, false); }
};

document.getElementById('addTab').onclick = function () {
  var seq = 1, ids = CONFIG.tabs.map(function (t) { return t.id; });
  while (ids.indexOf('t' + seq) > -1) seq++;
  CONFIG.tabs.push({ id: 't' + seq, name: '新标签', url: 'https://', icon: '' });
  renderTabs();
};
document.getElementById('addEngine').onclick = function () {
  CONFIG.search.engines.push({ key: 'e' + Date.now(), name: '新引擎', url: 'https://www.google.com/search?q={q}' });
  renderEngines(); fillDefaultEngine();
};

// ---------- 初始化绑定 ----------
bindUpload('siteBgUp', 'siteBgFile', function (url) {
  document.getElementById('bgImage').value = url;
  setBgMode('image'); _selImage = url;
  highlightImage(); updateBgPreview();
});
document.getElementById('bgImage').addEventListener('input', updateBgPreview);
document.getElementById('bgModeCards').addEventListener('change', onBgModeChange);
document.getElementById('weatherProvider').addEventListener('change', updateProviderNote);
['styleTimeSize', 'styleTimeWeight', 'styleTimeColorHex', 'styleTimeColor'].forEach(function (id) {
  var el = document.getElementById(id);
  el.addEventListener('input', updateTimePreview);
  el.addEventListener('change', updateTimePreview);
});
bindColorPair('styleTimeColor', 'styleTimeColorHex');
bindColorPair('styleTabColor', 'styleTabColorHex');
bindColorPair('bgColor1', 'bgColor1Hex');
bindColorPair('bgColor2', 'bgColor2Hex');
bindBlurPair();
buildBgSwatches();
buildIconPick();

// ---------- 加载 ----------
function renderAll() {
  renderSite();
  fillDefaultEngine();
  renderEngines();
  renderTabs();
}
async function load() {
  try {
    var aj = await (await api('/api/account', 'GET')).json();
    CURRENT_USER = aj.user;
    document.getElementById('accUser').value = CURRENT_USER;
    CONFIG = await (await api('/api/config')).json();
    if (!CONFIG.layout) CONFIG.layout = { order: [] };
    showLogin(false);
    renderAll();
  } catch (e) {
    if (e.message !== 'unauthorized') alert('加载失败：' + e.message);
  }
}

if (TOKEN) load(); else showLogin(true);
