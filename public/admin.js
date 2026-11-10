'use strict';

var TOKEN = sessionStorage.getItem('onlytab_admin_token') || '';
var CURRENT_USER = '';
var CONFIG = null;

// 与服务端默认一致的兜底默认（用于“恢复默认”）
var DEFAULTS = {
  site: { title: 'OnlyTab', copyright: '© 2026 OnlyTab', icp: '', police: '', background: '' },
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
  weather: { mode: 'auto', city: '', provider: 'openmeteo', qweatherKey: '' },
  style: { columns: 8, iconSize: 46, fontWeight: 400, showSeconds: true },
  tabs: [
    { name: '百度', url: 'https://www.baidu.com', icon: 'https://www.baidu.com/favicon.ico' },
    { name: '必应', url: 'https://www.bing.com', icon: 'https://www.bing.com/favicon.ico' },
    { name: 'GitHub', url: 'https://github.com', icon: 'https://github.com/favicon.ico' },
    { name: '知乎', url: 'https://www.zhihu.com', icon: 'https://www.zhihu.com/favicon.ico' },
    { name: '哔哩哔哩', url: 'https://www.bilibili.com', icon: 'https://www.bilibili.com/favicon.ico' },
    { name: '高德地图', url: 'https://www.amap.com', icon: 'https://www.amap.com/favicon.ico' },
    { name: '网易云音乐', url: 'https://music.163.com', icon: 'https://music.163.com/favicon.ico' },
    { name: 'CSDN', url: 'https://www.csdn.net', icon: 'https://www.csdn.net/favicon.ico' }
  ]
};

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

// ---------- 登录 ----------
function showLogin(show) {
  document.getElementById('loginMask').classList.toggle('hidden', !show);
}

document.getElementById('loginBtn').onclick = doLogin;
document.getElementById('loginPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
document.getElementById('loginUser').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  var u = document.getElementById('loginUser').value.trim();
  var p = document.getElementById('loginPass').value;
  document.getElementById('loginErr').textContent = '';
  try {
    var res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: u, pass: p })
    });
    var j = await res.json();
    if (j.ok) {
      TOKEN = j.token; CURRENT_USER = j.user;
      sessionStorage.setItem('onlytab_admin_token', TOKEN);
      load();
    } else {
      document.getElementById('loginErr').textContent = '用户名或密码错误';
    }
  } catch (e) {
    document.getElementById('loginErr').textContent = '登录失败：' + e.message;
  }
}

// ---------- 修改账号 / 密码 ----------
document.getElementById('accBtn').onclick = async function () {
  var nu = document.getElementById('accUser').value.trim();
  var np = document.getElementById('accPass').value;
  var status = document.getElementById('accStatus');
  status.style.color = '#dc2626';
  if (!nu) { status.textContent = '用户名不能为空'; return; }
  if (np && np.length < 6) { status.textContent = '密码至少 6 位'; return; }
  try {
    var r = await api('/api/account', 'POST', { user: nu, pass: np });
    var j = await r.json();
    if (j.ok) {
      status.style.color = '#16a34a';
      status.textContent = '已修改，请重新登录';
      TOKEN = ''; CURRENT_USER = '';
      sessionStorage.removeItem('onlytab_admin_token');
      document.getElementById('accPass').value = '';
      setTimeout(function () { showLogin(true); }, 800);
    } else {
      status.textContent = j.error || '修改失败';
    }
  } catch (e) {
    status.textContent = '修改失败：' + e.message;
  }
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
  btn.onclick = function () { inp.click(); };
  inp.onchange = function () {
    if (inp.files && inp.files[0]) {
      btn.textContent = '上传中…';
      uploadFile(inp.files[0]).then(function (url) {
        onDone(url); btn.textContent = '上传成功 ✓';
        setTimeout(function () { btn.textContent = '上传图标'; }, 1500);
      }).catch(function (e) { btn.textContent = '上传失败'; alert('上传失败：' + e.message); });
    }
  };
}

// ---------- 渲染：标签 ----------
function iconPreview(icon, name) {
  var letter = (name || '?').trim().charAt(0);
  if (icon && (icon.startsWith('http') || icon.startsWith('/') || icon.startsWith('data:'))) {
    return '<img src="' + icon + '" style="width:100%;height:100%;object-fit:cover" onerror="this.parentNode.textContent=\'' + letter + '\'">';
  }
  return letter;
}

function renderTabs() {
  var box = document.getElementById('tabs');
  box.innerHTML = '';
  CONFIG.tabs.forEach(function (t, i) {
    var item = document.createElement('div');
    item.className = 'item';
    item.innerHTML =
      '<div class="top">' +
        '<div class="iconsm" id="prev-' + i + '">' + iconPreview(t.icon, t.name) + '</div>' +
        '<div style="flex:1">' +
          '<input type="text" placeholder="名称" value="' + escapeAttr(t.name) + '" data-i="' + i + '" class="t-name">' +
          '<input type="text" placeholder="跳转 URL（https://...）" value="' + escapeAttr(t.url) + '" data-i="' + i + '" class="t-url" style="margin-top:6px">' +
          '<div class="row" style="margin-top:6px">' +
            '<input type="text" placeholder="图标 URL 或 /uploads/xxx" value="' + escapeAttr(t.icon) + '" data-i="' + i + '" class="t-icon">' +
            '<span class="filebtn" id="up-' + i + '">上传图标</span>' +
            '<input type="file" id="upf-' + i + '" accept="image/*" class="hidden">' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="actions">' +
        '<button class="btn ghost sm" data-up="' + i + '">↑ 上移</button>' +
        '<button class="btn ghost sm" data-down="' + i + '">↓ 下移</button>' +
        '<button class="btn danger sm" data-del="' + i + '">删除</button>' +
      '</div>';
    box.appendChild(item);

    item.querySelector('.t-name').oninput = function (e) { CONFIG.tabs[i].name = e.target.value; document.getElementById('prev-' + i).innerHTML = iconPreview(CONFIG.tabs[i].icon, CONFIG.tabs[i].name); };
    item.querySelector('.t-url').oninput = function (e) { CONFIG.tabs[i].url = e.target.value; };
    var iconInput = item.querySelector('.t-icon');
    iconInput.oninput = function (e) { CONFIG.tabs[i].icon = e.target.value; document.getElementById('prev-' + i).innerHTML = iconPreview(CONFIG.tabs[i].icon, CONFIG.tabs[i].name); };
    document.getElementById('up-' + i).onclick = function () { document.getElementById('upf-' + i).click(); };
    document.getElementById('upf-' + i).onchange = function () {
      if (this.files && this.files[0]) {
        uploadFile(this.files[0]).then(function (url) {
          CONFIG.tabs[i].icon = url;
          iconInput.value = url;
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
      '<div class="actions"><button class="btn danger sm" data-del="' + i + '">删除</button></div>';
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
  if (CONFIG.search.engines.some(function (e) { return e.key === CONFIG.search.defaultEngine; })) {
    sel.value = CONFIG.search.defaultEngine;
  } else if (CONFIG.search.engines[0]) {
    sel.value = CONFIG.search.engines[0].key;
  }
}

// ---------- 工具 ----------
function escapeAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function move(arr, i, dir) { var j = i + dir; if (j < 0 || j >= arr.length) return; var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }

// ---------- 填充站点/天气 ----------
function renderSite() {
  document.getElementById('siteTitle').value = CONFIG.site.title || '';
  document.getElementById('siteBg').value = CONFIG.site.background || '';
  document.getElementById('siteCopyright').value = CONFIG.site.copyright || '';
  document.getElementById('siteIcp').value = CONFIG.site.icp || '';
  document.getElementById('sitePolice').value = CONFIG.site.police || '';
  document.getElementById('weatherMode').value = CONFIG.weather.mode || 'auto';
  document.getElementById('weatherCity').value = CONFIG.weather.city || '';
  document.getElementById('weatherProvider').value = CONFIG.weather.provider || 'openmeteo';
  document.getElementById('weatherKey').value = CONFIG.weather.qweatherKey || '';
  var st = CONFIG.style || {};
  document.getElementById('styleColumns').value = (st.columns != null) ? st.columns : 8;
  document.getElementById('styleIconSize').value = (st.iconSize != null) ? st.iconSize : 46;
  document.getElementById('styleWeight').value = (st.fontWeight != null) ? st.fontWeight : 400;
  document.getElementById('styleSeconds').value = (st.showSeconds !== false) ? '1' : '0';
}
function readSite() {
  CONFIG.site.title = document.getElementById('siteTitle').value.trim();
  CONFIG.site.background = document.getElementById('siteBg').value.trim();
  CONFIG.site.copyright = document.getElementById('siteCopyright').value.trim();
  CONFIG.site.icp = document.getElementById('siteIcp').value.trim();
  CONFIG.site.police = document.getElementById('sitePolice').value.trim();
  CONFIG.weather.mode = document.getElementById('weatherMode').value;
  CONFIG.weather.city = document.getElementById('weatherCity').value.trim();
  CONFIG.weather.provider = document.getElementById('weatherProvider').value;
  CONFIG.weather.qweatherKey = document.getElementById('weatherKey').value.trim();
  CONFIG.search.defaultEngine = document.getElementById('searchDefault').value;
  CONFIG.style = {
    columns: parseInt(document.getElementById('styleColumns').value, 10) || 8,
    iconSize: parseInt(document.getElementById('styleIconSize').value, 10) || 46,
    fontWeight: parseInt(document.getElementById('styleWeight').value, 10) || 400,
    showSeconds: document.getElementById('styleSeconds').value === '1'
  };
}

// ---------- 保存 ----------
function setStatus(msg, ok) {
  var s = document.getElementById('status');
  s.textContent = msg; s.style.color = ok ? '#34d399' : '#fca5a5';
  if (msg) setTimeout(function () { s.textContent = ''; }, 3000);
}

document.getElementById('saveBtn').onclick = function () {
  readSite();
  api('/api/config', 'POST', CONFIG).then(function (r) {
    if (r.ok) { setStatus('已保存 ✓', true); } else { setStatus('保存失败', false); }
  }).catch(function (e) { setStatus('保存失败：' + e.message, false); });
};

document.getElementById('resetBtn').onclick = function () {
  if (!confirm('将恢复为内置默认配置并保存，确定？')) return;
  CONFIG = JSON.parse(JSON.stringify(DEFAULTS));
  renderAll();
  api('/api/config', 'POST', CONFIG).then(function (r) { if (r.ok) setStatus('已恢复默认 ✓', true); });
};

document.getElementById('addTab').onclick = function () {
  CONFIG.tabs.push({ name: '新标签', url: 'https://', icon: '' });
  renderTabs();
};
document.getElementById('addEngine').onclick = function () {
  CONFIG.search.engines.push({ key: 'e' + Date.now(), name: '新引擎', url: 'https://www.google.com/search?q={q}' });
  renderEngines(); fillDefaultEngine();
};
bindUpload('siteBgUp', 'siteBgFile', function (url) { document.getElementById('siteBg').value = url; });

// ---------- 加载 ----------
function renderAll() {
  renderSite();
  fillDefaultEngine();
  renderEngines();
  renderTabs();
}

async function load() {
  try {
    var acc = await api('/api/account', 'GET'); // 校验会话有效性
    var aj = await acc.json();
    CURRENT_USER = aj.user;
    document.getElementById('accUser').value = CURRENT_USER;
    var r = await api('/api/config'); // 公开接口
    CONFIG = await r.json();
    showLogin(false);
    renderAll();
  } catch (e) {
    if (e.message !== 'unauthorized') { alert('加载失败：' + e.message); }
  }
}

// 有会话则直接加载，否则先展示登录遮罩
if (TOKEN) { load(); } else { showLogin(true); }
