'use strict';

/**
 * OnlyTab —— 极简标签页（纯 Node，零依赖）
 * 提供：静态站点服务、配置读写 API、图标/背景上传 API。
 * 数据持久化在 DATA_DIR（默认 ./data），适合用 Docker 卷挂载。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const DEFAULT_CONFIG = {
  site: {
    title: 'OnlyTab',
    copyright: '© 2026 OnlyTab',
    icp: '',
    police: '',
    background: '' // 空 => 使用默认渐变背景；可填 URL 或 /uploads/xxx
  },
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
  weather: {
    mode: 'auto',        // auto | custom
    city: '',            // mode=custom 时使用的城市名
    provider: 'openmeteo', // openmeteo(国际,免密钥,国内可用) | qweather(和风天气,国内源,需Key)
    qweatherKey: ''      // 和风天气 Key（仅服务端使用，不暴露给浏览器）
  },
  style: {
    columns: 8,      // 每行标签个数（横排）
    iconSize: 46,    // 图标大小 px
    fontWeight: 400, // 标签字体粗细
    showSeconds: true // 是否显示秒
  },
  account: null, // 登录账号（运行时由 initAccount 填充：{user, salt, hash}）
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

// ---------- 配置读写 ----------
function deepMerge(base, override) {
  if (Array.isArray(base)) return Array.isArray(override) ? override : base;
  if (base && typeof base === 'object') {
    const out = Array.isArray(base) ? [] : {};
    for (const k of Object.keys(base)) {
      out[k] = (override && k in override) ? deepMerge(base[k], override[k]) : base[k];
    }
    // 保留 override 中多出来的键（如自定义引擎）
    if (override && typeof override === 'object' && !Array.isArray(override)) {
      for (const k of Object.keys(override)) {
        if (!(k in out)) out[k] = override[k];
      }
    }
    return out;
  }
  return override === undefined ? base : override;
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return deepMerge(DEFAULT_CONFIG, parsed);
  } catch (e) {
    // 文件不存在或损坏，写入默认配置
    saveConfig(DEFAULT_CONFIG);
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const tmp = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, CONFIG_FILE); // 原子写入
}

let config = loadConfig();

// ---------- 账号 / 会话（用户名 + 密码；默认 admin / OnlyTab，可在管理页修改） ----------
// 会话 token 存于内存，重启后需重新登录
const SESSIONS = new Set();

function sha256Hex(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function makeAccount(user, pass) {
  const salt = crypto.randomBytes(8).toString('hex');
  return { user: user, salt: salt, hash: sha256Hex(salt + ':' + pass) };
}
function verifyAccount(acc, user, pass) {
  if (!acc || !acc.user || !acc.hash || !acc.salt) return false;
  if (user !== acc.user) return false;
  const h = sha256Hex(acc.salt + ':' + pass);
  try { return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(acc.hash, 'hex')); }
  catch (e) { return false; }
}

// 初始化账号：环境变量 > 已保存 > 内置默认
(function initAccount() {
  if (ADMIN_USER && ADMIN_PASSWORD) {
    config.account = makeAccount(ADMIN_USER, ADMIN_PASSWORD);
    saveConfig(config);
  } else if (!config.account || !config.account.user || !config.account.hash) {
    config.account = makeAccount('admin', 'OnlyTab');
    saveConfig(config);
  }
})();

// ---------- 工具 ----------
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// 检查管理接口鉴权：需持有有效的登录会话 token
function authOK(req) {
  const t = req.headers['x-admin-token'] || '';
  return SESSIONS.has(t);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

// 安全地把请求路径映射到某个根目录下的真实文件，防止目录穿越
function safeResolve(rootDir, urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const full = path.normalize(path.join(rootDir, decoded));
  if (!full.startsWith(rootDir)) return null;
  return full;
}

function serveStatic(res, filePath) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not Found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ---------- 服务端对外请求（用于国内源天气 / IP 定位，避免浏览器跨域） ----------
const httpsMod = require('https');
const httpMod = require('http');

function fetchText(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    function go(u) {
      const mod = u.startsWith('https') ? httpsMod : httpMod;
      const req = mod.get(u, {
        headers: { 'User-Agent': 'OnlyTab/1.0', 'Accept': 'application/json' }
      }, (res) => {
        const loc = res.headers.location;
        if (res.statusCode >= 300 && res.statusCode < 400 && loc && redirects < 4) {
          redirects++; res.resume();
          return go(new URL(loc, u).toString());
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs || 8000, () => req.destroy(new Error('timeout')));
    }
    go(url);
  });
}

// 简单内存缓存：loc 缓存 1h，wx 缓存 30min
const _cache = { loc: {}, wx: {} };
function cacheGet(type, key, fn) {
  const c = _cache[type];
  const hit = c[key];
  const now = Date.now();
  const ttl = type === 'wx' ? 30 * 60000 : 60 * 60000;
  if (hit && now - hit.t < ttl) return Promise.resolve(hit.v);
  return fn().then((v) => { c[key] = { t: now, v }; return v; })
    .catch((e) => { if (hit) return hit.v; throw e; });
}

// 国内 IP 定位（依次尝试国内源，最后回退 ipapi.co）
async function geoByIP() {
  const sources = [
    'https://www.ip.cn/api/index?ip=&type=0',
    'https://api.vore.top/api/IPdata'
  ];
  for (const s of sources) {
    try {
      const j = JSON.parse(await fetchText(s, 7000));
      const info = (j.ipdata && j.ipdata.info) || {};
      const city = j.city || info.city || (j.addr ? j.addr.replace(/^中国\s*/, '').trim().split(/\s+/)[0] : '');
      const province = j.province || info.province || '';
      if (city) return { city: (province && city.indexOf(province) === -1 ? province + '·' + city : city) };
    } catch (e) { /* 尝试下一个 */ }
  }
  try {
    const j = JSON.parse(await fetchText('https://ipapi.co/json/', 7000));
    if (j.city) return { city: (j.region ? j.region + '·' : '') + j.city };
  } catch (e) {}
  return { city: '' };
}

// 城市名 -> 经纬度（有和风 Key 用和风，否则 Open-Meteo）
async function geocode(city, key) {
  if (key) {
    try {
      const j = JSON.parse(await fetchText(
        'https://geoapi.qweather.com/v2/city/lookup?location=' + encodeURIComponent(city) + '&key=' + key, 7000));
      if (j.location && j.location[0]) {
        const l = j.location[0];
        return { name: l.name, lat: parseFloat(l.lat), lon: parseFloat(l.lon) };
      }
    } catch (e) {}
  }
  const j = JSON.parse(await fetchText(
    'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=zh', 7000));
  if (j.results && j.results[0]) {
    const r = j.results[0];
    return { name: r.name, lat: r.latitude, lon: r.longitude };
  }
  throw new Error('城市解析失败');
}

async function resolveLocation(cfg) {
  let cityName, coords;
  if (cfg.weather.mode === 'custom' && cfg.weather.city) {
    cityName = cfg.weather.city;
    coords = await geocode(cityName, cfg.weather.qweatherKey);
  } else {
    const g = await geoByIP();
    cityName = g.city || '本地';
    if (!g.city) throw new Error('定位失败');
    coords = await geocode(g.city, cfg.weather.qweatherKey);
  }
  return { name: coords.name || cityName, lat: coords.lat, lon: coords.lon };
}

async function openMeteo(lat, lon) {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
    '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min' +
    '&timezone=auto&forecast_days=6';
  const j = JSON.parse(await fetchText(url, 8000));
  const d = j.daily;
  const daily = [];
  for (let i = 0; i < d.time.length; i++) {
    daily.push({ date: d.time[i], code: d.weather_code[i], min: d.temperature_2m_min[i], max: d.temperature_2m_max[i] });
  }
  return {
    city: '', temp: Math.round(j.current.temperature_2m), code: j.current.weather_code,
    high: Math.round(d.temperature_2m_max[0]), low: Math.round(d.temperature_2m_min[0]), daily: daily
  };
}

async function qweather(lat, lon, key) {
  const loc = lon + ',' + lat;
  const [nowT, dT] = await Promise.all([
    fetchText('https://devapi.qweather.com/v7/weather/now?location=' + loc + '&key=' + key, 8000),
    fetchText('https://devapi.qweather.com/v7/weather/7d?location=' + loc + '&key=' + key, 8000)
  ]);
  const now = JSON.parse(nowT).now;
  const daily = JSON.parse(dT).daily;
  const fc = daily.map((x) => ({ date: x.fxDate, code: x.iconDay, min: +x.tempMin, max: +x.tempMax, text: x.textDay }));
  return {
    city: '', temp: Math.round(+now.temp), code: now.icon, text: now.text,
    high: Math.round(+daily[0].tempMax), low: Math.round(+daily[0].tempMin), daily: fc
  };
}

async function getWeather(cfg, lat, lon) {
  if (cfg.weather.provider === 'qweather' && cfg.weather.qweatherKey) {
    return await qweather(lat, lon, cfg.weather.qweatherKey);
  }
  return await openMeteo(lat, lon);
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, 'http://localhost');
  const pathname = parsed.pathname;

  try {
    // 健康检查
    if (pathname === '/healthz') { sendJSON(res, 200, { ok: true }); return; }

    // 配置读取（公开：供首页使用；剔除账号信息与天气 Key 等敏感字段）
    if (pathname === '/api/config' && req.method === 'GET') {
      const out = Object.assign({}, config);
      delete out.account;
      if (out.weather) { const w = Object.assign({}, out.weather); delete w.qweatherKey; out.weather = w; }
      sendJSON(res, 200, out);
      return;
    }

    // 登录：用户名 + 密码 -> 会话 token
    if (pathname === '/api/login' && req.method === 'POST') {
      const buf = await readBody(req, 1 * 1024 * 1024);
      let posted;
      try { posted = JSON.parse(buf.toString('utf8')); }
      catch { sendJSON(res, 400, { ok: false, error: 'invalid json' }); return; }
      const user = (posted && posted.user || '').toString();
      const pass = (posted && posted.pass || '').toString();
      if (verifyAccount(config.account, user, pass)) {
        const token = crypto.randomBytes(16).toString('hex');
        SESSIONS.add(token);
        sendJSON(res, 200, { ok: true, token: token, user: config.account.user });
      } else {
        sendJSON(res, 200, { ok: false });
      }
      return;
    }

    // 当前登录账号查询（需鉴权）：返回用户名，供前端预填
    if (pathname === '/api/account' && req.method === 'GET') {
      if (!authOK(req)) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
      sendJSON(res, 200, { user: config.account.user });
      return;
    }

    // 配置保存
    if (pathname === '/api/config' && req.method === 'POST') {
      if (!authOK(req)) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
      const buf = await readBody(req);
      let posted;
      try { posted = JSON.parse(buf.toString('utf8')); }
      catch { sendJSON(res, 400, { error: 'invalid json' }); return; }
      const prevAccount = config.account;
      config = deepMerge(DEFAULT_CONFIG, posted);
      // 账号只允许通过 /api/account 修改，普通保存不覆盖
      config.account = posted.account || prevAccount;
      saveConfig(config);
      sendJSON(res, 200, { ok: true });
      return;
    }

    // 修改登录账号 / 密码（需登录；改成功后强制重新登录）
    if (pathname === '/api/account' && req.method === 'POST') {
      if (!authOK(req)) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
      const buf = await readBody(req, 1 * 1024 * 1024);
      let posted;
      try { posted = JSON.parse(buf.toString('utf8')); }
      catch { sendJSON(res, 400, { error: 'invalid json' }); return; }
      const nu = (posted && posted.user || '').toString().trim();
      const np = (posted && posted.pass || '').toString();
      const cur = config.account;
      const newUser = nu || (cur && cur.user) || 'admin';
      if (!newUser) { sendJSON(res, 400, { error: '用户名不能为空' }); return; }
      if (np) {
        if (np.length < 6) { sendJSON(res, 400, { error: '密码至少 6 位' }); return; }
        config.account = makeAccount(newUser, np);
      } else {
        // 仅修改用户名，保留原密码
        config.account = { user: newUser, salt: cur.salt, hash: cur.hash };
      }
      saveConfig(config);
      SESSIONS.clear(); // 改密后令所有会话失效，需重新登录
      sendJSON(res, 200, { ok: true });
      return;
    }

    // 定位：根据配置（自动IP / 指定城市）解析出经纬度与城市名
    if (pathname === '/api/location' && req.method === 'GET') {
      try {
        const loc = await cacheGet('loc', config.weather.mode + '|' + config.weather.city, () => resolveLocation(config));
        sendJSON(res, 200, loc);
      } catch (e) {
        sendJSON(res, 200, { error: true, msg: String(e && e.message || e) });
      }
      return;
    }

    // 天气：根据经纬度使用配置的天气源（国内和风 / Open-Meteo 兜底）
    if (pathname === '/api/weather' && req.method === 'GET') {
      const lat = parsed.searchParams.get('lat');
      const lon = parsed.searchParams.get('lon');
      if (!lat || !lon) { sendJSON(res, 400, { error: 'missing lat/lon' }); return; }
      try {
        const w = await cacheGet('wx', lat + ',' + lon + '|' + config.weather.provider, () => getWeather(config, +lat, +lon));
        sendJSON(res, 200, w);
      } catch (e) {
        sendJSON(res, 200, { error: true, msg: String(e && e.message || e) });
      }
      return;
    }

    // 上传（base64 JSON: {filename, data, mime}）
    if (pathname === '/api/upload' && req.method === 'POST') {
      if (!authOK(req)) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
      const buf = await readBody(req);
      let body;
      try { body = JSON.parse(buf.toString('utf8')); }
      catch { sendJSON(res, 400, { error: 'invalid json' }); return; }
      const data = body && body.data;
      let filename = (body && body.filename) || '';
      if (!data || typeof data !== 'string') { sendJSON(res, 400, { error: 'missing data' }); return; }
      const m = /^data:([^;]+);base64,(.*)$/.exec(data) || /^([^;]*);base64,(.*)$/.exec(data);
      let b64, mime;
      if (m) { mime = m[1] || body.mime || 'application/octet-stream'; b64 = m[2]; }
      else { b64 = data; mime = body.mime || 'application/octet-stream'; }
      const bin = Buffer.from(b64, 'base64');
      if (bin.length > 8 * 1024 * 1024) { sendJSON(res, 413, { error: 'file too large' }); return; }

      // 文件名安全化
      const extMap = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/x-icon': '.ico' };
      const ext = extMap[mime] || path.extname(filename).toLowerCase() || '.bin';
      const safeName = (crypto.randomBytes(8).toString('hex') + ext).replace(/[^a-zA-Z0-9._-]/g, '');
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      fs.writeFileSync(path.join(UPLOAD_DIR, safeName), bin);
      sendJSON(res, 200, { ok: true, url: '/uploads/' + safeName });
      return;
    }

    // 上传文件静态服务
    if (pathname.startsWith('/uploads/')) {
      const fp = safeResolve(UPLOAD_DIR, pathname.slice('/uploads'.length));
      if (!fp) { res.writeHead(403); res.end('Forbidden'); return; }
      serveStatic(res, fp);
      return;
    }

    // 管理页
    if (pathname === '/admin' || pathname === '/admin.html') {
      serveStatic(res, path.join(PUBLIC_DIR, 'admin.html'));
      return;
    }

    // 首页 / 静态资源
    if (pathname === '/' ) {
      serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
      return;
    }
    const fp = safeResolve(PUBLIC_DIR, pathname);
    if (!fp) { res.writeHead(403); res.end('Forbidden'); return; }
    serveStatic(res, fp);
  } catch (e) {
    sendJSON(res, 500, { error: String(e && e.message || e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`OnlyTab running at http://${HOST}:${PORT}  (data: ${DATA_DIR})`);
});
