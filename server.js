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
    background: '', // 旧版：直接填图片 URL；留空则由下方 bgMode 控制
    bgMode: 'default', // default(默认渐变) | preset(预设渐变) | custom(自定义色) | image(图片)
    bgValue: '',      // preset/custom 时为 CSS 渐变/纯色；image 时为图片 URL
    bgColor1: '#1e3c72', // 自定义渐变 色1（六位十六进制）
    bgColor2: '#6dd5ed', // 自定义渐变 色2（六位十六进制）
    bgImage: '',       // 背景图片 URL（image 模式使用）
    bgBlur: 14         // 毛玻璃模糊半径 px（图片背景时可调，作用于所有 glass 面板）
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
    // openmeteo(国际,免密钥) | chinaweather(中国天气网,国内免登录免密钥) | qweather(和风天气,仅 JWT)
    provider: 'openmeteo',
    // 和风天气新版 JWT（Ed25519 签名）：私钥仅服务端保存，公钥上传到和风控制台。旧版 ?key= 已移除。
    qweatherPrivateKey: '', // Ed25519 私钥 PEM（由 /api/qweather-keygen 生成或自行填写）
    qweatherKid: '',       // 凭据 ID（控制台-项目管理-凭据 中查看）
    qweatherProjectId: ''  // 项目 ID（控制台-项目管理 中查看，作为 JWT 的 sub）
  },
  style: {
    columns: 8,          // 每行标签个数（桌面端横排）
    iconSize: 46,        // 图标大小 px
    fontWeight: 400,     // 标签字体粗细
    showSeconds: true,   // 是否显示秒
    timeFontWeight: 400, // 时钟/日期 字体粗细（v0.2 起不再默认特细）
    timeFontSize: 76,    // 时钟 字号(px)，日期按比例缩放
    timeColor: '#ffffff',// 时钟/日期 字体颜色（六位十六进制）
    tabColor: '#ffffff', // 标签下方名称 字体颜色（六位十六进制）
    // ---- 手机端适配（屏宽 <= 760px 生效，与桌面端互不干扰）----
    mobileColumns: 4,       // 手机端每行标签个数
    mobileIconSize: 38,     // 手机端图标大小 px
    mobileTimeSize: 40,     // 手机端时钟字号 px
    mobileTabFontSize: 12,  // 手机端标签名称字号 px
    mobileMaxTabs: 0        // 手机端最多显示标签数量，0 = 全部显示
  },
  // 首页混排顺序：'w:weather' / 'w:calendar' / 't:<标签id>'，可在首页拖动排序
  layout: {
    order: [],
    publicReorder: true // 允许未登录的首页访客保存排序（仅能调整顺序，不影响其它配置）
  },
  // 图标托管（xg-icons-hub）地址，仅用于自定义外链图标代理；内置预设图标已本地化到 public/icons
  iconHub: 'http://192.168.9.126:28080',
  account: null, // 登录账号（运行时由 initAccount 填充：{user, salt, hash}）
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

// ---------- v0.2 配置迁移 ----------
// 1) 给历史标签补稳定 id（拖动排序依赖 id）
// 2) 生成首页混排顺序（旧版本没有 layout 时：两个小组件在前，标签按原顺序在后）
// 3) 旧版默认 timeFontWeight=200 太细且日期行未联动，首次升级时提升为 400
function migrateConfig(cfg) {
  cfg.tabs = Array.isArray(cfg.tabs) ? cfg.tabs : [];
  const used = new Set();
  cfg.tabs.forEach((t) => { if (t && t.id) used.add(t.id); });
  let seq = 1;
  const nextId = () => { while (used.has('t' + seq)) seq++; const id = 't' + seq++; used.add(id); return id; };
  const seen = new Set();
  cfg.tabs.forEach((t) => {
    if (!t.id || seen.has(t.id)) t.id = nextId();
    seen.add(t.id);
  });

  const widgets = ['w:weather', 'w:calendar'];
  const valid = widgets.concat(cfg.tabs.map((t) => 't:' + t.id));
  const posted = (cfg.layout && Array.isArray(cfg.layout.order)) ? cfg.layout.order : [];
  const order = posted.filter((x) => typeof x === 'string' && valid.indexOf(x) > -1);
  valid.forEach((x) => { if (order.indexOf(x) < 0) order.push(x); });
  cfg.layout = {
    order: order,
    publicReorder: !(cfg.layout && cfg.layout.publicReorder === false)
  };

  // 一次性升级字体粗细（内部标记不暴露给公开接口）
  if (!cfg._v02 && cfg.style && cfg.style.timeFontWeight === 200) {
    cfg.style.timeFontWeight = 400;
  }
  cfg._v02 = true;
  return cfg;
}
config = migrateConfig(config);
saveConfig(config);

// 公开配置：剔除账号、私钥与所有内部字段
function publicConfig(cfg) {
  const out = {};
  Object.keys(cfg).forEach((k) => { if (k.charAt(0) !== '_') out[k] = cfg[k]; });
  delete out.account; // 账号 salt/hash 绝不公开
  if (out.weather) {
    const w = Object.assign({}, out.weather);
    delete w.qweatherPrivateKey;
    delete w.qweatherKey;
    out.weather = w;
  }
  return out;
}

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

function fetchText(url, timeoutMs, extraHeaders) {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    function go(u) {
      const mod = u.startsWith('https') ? httpsMod : httpMod;
      const req = mod.get(u, {
        headers: Object.assign({ 'User-Agent': 'OnlyTab/1.0', 'Accept': 'application/json' }, extraHeaders || {})
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

// 二进制拉取（用于图标代理）：返回 { buffer, contentType }
function fetchBuffer(url, timeoutMs, extraHeaders) {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    function go(u) {
      const mod = u.startsWith('https') ? httpsMod : httpMod;
      const req = mod.get(u, {
        headers: Object.assign({ 'User-Agent': 'OnlyTab/1.0' }, extraHeaders || {})
      }, (res) => {
        const loc = res.headers.location;
        if (res.statusCode >= 300 && res.statusCode < 400 && loc && redirects < 4) {
          redirects++; res.resume();
          return go(new URL(loc, u).toString());
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || 'application/octet-stream' }));
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs || 8000, () => req.destroy(new Error('timeout')));
    }
    go(url);
  });
}

// 简单内存缓存：loc 缓存 1h，wx 缓存 30min
const _cache = { loc: {}, wx: {}, icon: {} };
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
function pickIPCity(j) {
  const info = (j.ipdata && j.ipdata.info) || {};
  const city = j.city || info.city || (j.addr ? j.addr.replace(/^中国\s*/, '').trim().split(/\s+/)[0] : '');
  const province = j.province || info.province || j.region || '';
  if (!city) return '';
  return (province && city.indexOf(province) === -1 ? province + '·' + city : city);
}

// 多源并行，取最快成功者；单个源超时不再拖慢首屏天气（旧实现串行最坏 21s）
async function geoByIP() {
  const sources = [
    'https://www.ip.cn/api/index?ip=&type=0',
    'https://api.vore.top/api/IPdata',
    'https://ipapi.co/json/'
  ];
  const tasks = sources.map(async (s) => {
    const j = JSON.parse(await fetchText(s, 3000));
    const city = pickIPCity(j);
    if (!city) throw new Error('no city');
    return { city: city };
  });
  try { return await Promise.any(tasks); }
  catch (e) { return { city: '' }; }
}

// 生成和风天气 JWT（Ed25519 / EdDSA 签名，按官方规范）
function makeQweatherJWT(privatePem, kid, projectId) {
  const header = { alg: 'EdDSA', kid: kid };
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: projectId, iat: now - 30, exp: now + 900 };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = b64(header) + '.' + b64(payload);
  const key = crypto.createPrivateKey(privatePem);
  const sig = crypto.sign(null, Buffer.from(data), key).toString('base64url');
  return data + '.' + sig;
}

// 和风天气是否已完成 JWT 配置（v0.2 起不再支持旧版 ?key=）
function qweatherReady(cfg) {
  const w = cfg.weather || {};
  return !!(w.qweatherPrivateKey && w.qweatherKid && w.qweatherProjectId);
}
function qweatherHeaders(cfg) {
  const w = cfg.weather || {};
  return { Authorization: 'Bearer ' + makeQweatherJWT(w.qweatherPrivateKey, w.qweatherKid, w.qweatherProjectId) };
}

// 生成 Ed25519 密钥对（用于和风 JWT）：返回 { privateKey(PEM), publicKey(PEM) }
function genQweatherKeyPair() {
  const pair = crypto.generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' })
  };
}

// 城市名 -> 经纬度（和风已配 JWT 时用和风地理编码，否则 Open-Meteo）
async function geocode(city, cfg) {
  if (qweatherReady(cfg)) {
    try {
      const j = JSON.parse(await fetchText(
        'https://geoapi.qweather.com/v2/city/lookup?location=' + encodeURIComponent(city), 7000, qweatherHeaders(cfg)));
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
  let cityName;
  if (cfg.weather.mode === 'custom' && cfg.weather.city) cityName = cfg.weather.city;
  else {
    let g = {};
    try { g = await geoByIP(); } catch (e) {}
    cityName = g.city || '';
    // 内网 / NAS 上 IP 定位常不可用：退回配置城市或默认城市，保证首页天气仍可用
    if (!cityName) cityName = cfg.weather.city || '北京';
  }
  // 中国天气网按城市码取数，不需要经纬度，也不依赖国际地理编码
  if (cfg.weather.provider === 'chinaweather') {
    return { name: cityName, city: cityName, lat: 0, lon: 0, cityOnly: true };
  }
  // 国际地理编码同样可能不可用；失败时退化成「仅城市」，由 /api/weather 自动切国内源
  try {
    const coords = await geocode(cityName, cfg);
    return { name: coords.name || cityName, city: cityName, lat: coords.lat, lon: coords.lon };
  } catch (e) {
    return { name: cityName, city: cityName, lat: 0, lon: 0, cityOnly: true, degraded: true };
  }
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

async function qweather(lat, lon, cfg) {
  const loc = lon + ',' + lat;
  const headers = qweatherHeaders(cfg);
  const base = 'https://devapi.qweather.com/v7/weather/';
  const [nowT, dT] = await Promise.all([
    fetchText(base + 'now?location=' + loc, 8000, headers),
    fetchText(base + '7d?location=' + loc, 8000, headers)
  ]);
  const now = JSON.parse(nowT).now;
  const daily = JSON.parse(dT).daily;
  const fc = daily.map((x) => ({ date: x.fxDate, code: x.iconDay, min: +x.tempMin, max: +x.tempMax, text: x.textDay }));
  return {
    city: '', temp: Math.round(+now.temp), code: now.icon, text: now.text,
    high: Math.round(+daily[0].tempMax), low: Math.round(+daily[0].tempMin), daily: fc
  };
}

// ---------- 中国天气网（国内源，免登录 / 免密钥） ----------
const CWC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Referer': 'http://www.weather.com.cn/'
};
// 中国天气网天气现象代码 -> 文案（首页据文案匹配表情）
const CWC_CODE = {
  '00': '晴', '01': '多云', '02': '阴', '03': '阵雨', '04': '雷阵雨', '05': '雷阵雨伴冰雹',
  '06': '雨夹雪', '07': '小雨', '08': '中雨', '09': '大雨', '10': '暴雨', '11': '大暴雨',
  '12': '特大暴雨', '13': '阵雪', '14': '小雪', '15': '中雪', '16': '大雪', '17': '暴雪',
  '18': '雾', '19': '冻雨', '20': '沙尘暴', '21': '小到中雨', '22': '中到大雨', '23': '大到暴雨',
  '24': '暴雨到大暴雨', '25': '大暴雨到特大暴雨', '26': '小到中雪', '27': '中到大雪',
  '28': '大到暴雪', '29': '浮尘', '30': '扬沙', '31': '强沙尘暴', '32': '浓雾',
  '49': '霾', '53': '中度霾', '54': '重度霾', '99': '未知'
};
function cwcText(code) {
  const c = String(code == null ? '' : code).replace(/^[dn]/, '').slice(0, 2);
  return CWC_CODE[c] || CWC_CODE[String(code)] || '未知';
}

// 城市名 -> 中国天气网 9 位城市码
async function chinaWeatherCityCode(city) {
  const name = String(city || '').split(/[·\s,，]/).pop().replace(/(市|地区|自治州)$/, '');
  if (!name) throw new Error('缺少城市名');
  const t = await fetchText('http://toy1.weather.com.cn/search?cityname=' + encodeURIComponent(name), 8000, CWC_HEADERS);
  const s = t.trim().replace(/^\(+/, '').replace(/\)+;?\s*$/, '');
  let arr;
  try { arr = JSON.parse(s); } catch (e) { throw new Error('城市码解析失败'); }
  for (const it of (arr || [])) {
    const code = String((it && it.ref) || '').split('~')[0];
    if (/^\d{9}$/.test(code)) return code;
  }
  throw new Error('未找到城市码：' + name);
}

// 从 "var name = {...};" 形式中提取 JSON 对象（按花括号配对，避免正则截断嵌套）
function extractJSObject(text, name) {
  const re = new RegExp('var\\s+' + name + '\\s*=\\s*');
  const m = re.exec(text);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch (e) { return null; } } }
  }
  return null;
}

async function chinaWeather(city) {
  const code = await chinaWeatherCityCode(city);
  const t = await fetchText('http://d1.weather.com.cn/weather_index/' + code + '.html', 8000, CWC_HEADERS);
  const sk = extractJSObject(t, 'dataSK');
  const fc = extractJSObject(t, 'fc');
  if (!sk) throw new Error('中国天气网返回异常');
  const list = (fc && Array.isArray(fc.f)) ? fc.f : [];
  if (!list.length) throw new Error('无预报数据');
  const year = new Date().getFullYear();
  const daily = list.slice(0, 6).map((x) => {
    const md = String(x.fi || '').split('/');
    const mm = (md[0] || '1').padStart(2, '0');
    const dd = (md[1] || '1').padStart(2, '0');
    return {
      date: year + '-' + mm + '-' + dd,
      code: 0,
      text: cwcText(x.fa),
      min: Math.round(+x.fd),
      max: Math.round(+x.fc)
    };
  });
  return {
    city: sk.cityname || city,
    temp: Math.round(+sk.temp),
    code: 0,
    text: sk.weather || cwcText(list[0].fa),
    high: daily[0].max,
    low: daily[0].min,
    daily: daily
  };
}

async function getWeather(cfg, lat, lon, city) {
  const provider = (cfg.weather && cfg.weather.provider) || 'openmeteo';
  async function fallback() {
    // 主源失败时依次尝试国内免登录源、国际免密钥源
    try { return await chinaWeather(city || (cfg.weather && cfg.weather.city) || '北京'); }
    catch (e) { /* 继续尝试下一源 */ }
    if (lat && lon) return await openMeteo(lat, lon);
    throw new Error('所有天气源均不可用');
  }
  try {
    if (provider === 'chinaweather') return await chinaWeather(city || '北京');
    if (provider === 'qweather') {
      if (qweatherReady(cfg) && lat && lon) return await qweather(lat, lon, cfg);
      return await chinaWeather(city || '北京'); // JWT 未配置完整时给可用的国内源
    }
    // 定位退化（lat/lon 为 0）时不要拿 (0,0) 去查赤道天气，直接走国内源
    if (!lat || !lon) return await fallback();
    return await openMeteo(lat, lon);
  } catch (e) {
    return await fallback(e);
  }
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, 'http://localhost');
  const pathname = parsed.pathname;

  try {
    // 健康检查
    if (pathname === '/healthz') { sendJSON(res, 200, { ok: true }); return; }

    // 配置读取（公开：供首页使用；剔除账号、私钥与内部标记）
    if (pathname === '/api/config' && req.method === 'GET') {
      sendJSON(res, 200, publicConfig(config));
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
      const oldPriv = (config.weather && config.weather.qweatherPrivateKey) || '';
      const wasMigrated = config._v02;
      config = deepMerge(DEFAULT_CONFIG, posted);
      // 账号只允许通过 /api/account 修改，普通保存不覆盖
      config.account = posted.account || prevAccount;
      // 保护 JWT 私钥：客户端未传（或传占位/清除令牌）时保留服务端已有值
      const newPriv = (posted.weather && posted.weather.qweatherPrivateKey) || '';
      if (newPriv === '__CLEAR__') config.weather.qweatherPrivateKey = '';
      else if (!newPriv) config.weather.qweatherPrivateKey = (oldPriv && oldPriv !== '__CLEAR__') ? oldPriv : '';
      // 旧版 ?key= 字段即使被老客户端带上来也丢弃
      delete config.weather.qweatherKey;
      config._v02 = wasMigrated || true;
      config = migrateConfig(config); // 新增标签补 id、补齐混排顺序
      saveConfig(config);
      sendJSON(res, 200, { ok: true });
      return;
    }

    // 首页混排排序保存（默认公开，仅允许调整顺序；可设 layout.publicReorder=false 关闭）
    if (pathname === '/api/order' && req.method === 'POST') {
      const authed = authOK(req);
      if (!authed && config.layout.publicReorder === false) {
        sendJSON(res, 401, { error: 'unauthorized' }); return;
      }
      const buf = await readBody(req, 64 * 1024);
      let posted;
      try { posted = JSON.parse(buf.toString('utf8')); }
      catch { sendJSON(res, 400, { error: 'invalid json' }); return; }
      const order = posted && posted.order;
      const valid = ['w:weather', 'w:calendar'].concat(config.tabs.map((t) => 't:' + t.id));
      if (!Array.isArray(order) || order.length > 200 || order.length !== valid.length ||
          !order.every((x) => typeof x === 'string' && valid.indexOf(x) > -1) ||
          !valid.every((x) => order.indexOf(x) > -1)) {
        sendJSON(res, 400, { error: 'invalid order' }); return;
      }
      config.layout.order = order;
      saveConfig(config);
      sendJSON(res, 200, { ok: true, scope: authed ? 'admin' : 'public' });
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
        const loc = await cacheGet('loc', config.weather.mode + '|' + config.weather.city + '|' + config.weather.provider, () => resolveLocation(config));
        sendJSON(res, 200, loc);
      } catch (e) {
        sendJSON(res, 200, { error: true, msg: String(e && e.message || e) });
      }
      return;
    }

    // 天气：按配置的数据源取数（中国天气网 / 和风 JWT / Open-Meteo，自动兜底）
    if (pathname === '/api/weather' && req.method === 'GET') {
      const lat = parsed.searchParams.get('lat');
      const lon = parsed.searchParams.get('lon');
      const city = parsed.searchParams.get('city') || '';
      const onlyCity = config.weather.provider === 'chinaweather';
      if ((!lat || !lon) && !onlyCity) { sendJSON(res, 400, { error: 'missing lat/lon' }); return; }
      try {
        const key = (lat || '0') + ',' + (lon || '0') + '|' + city + '|' + config.weather.provider;
        const w = await cacheGet('wx', key, () => getWeather(config, +lat || 0, +lon || 0, city));
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

    // 生成和风 JWT 密钥对（需鉴权）：私钥存服务端并返回给管理员（已登录），公钥用于上传到和风控制台
    if (pathname === '/api/qweather-keygen' && req.method === 'POST') {
      if (!authOK(req)) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
      try {
        const kp = genQweatherKeyPair();
        config.weather = config.weather || {};
        config.weather.qweatherPrivateKey = kp.privateKey;
        saveConfig(config);
        sendJSON(res, 200, { ok: true, publicKey: kp.publicKey, privateKey: kp.privateKey });
      } catch (e) {
        sendJSON(res, 500, { error: String(e && e.message || e) });
      }
      return;
    }

    // 图标代理：服务端拉取图标 hub 图片并流式返回，规避图床防盗链（仅允许 iconHub 域名）
    if (pathname === '/api/icon' && req.method === 'GET') {
      const u = parsed.searchParams.get('u');
      if (!u) { sendJSON(res, 400, { error: 'missing u' }); return; }
      let target;
      try { target = new URL(decodeURIComponent(u)); } catch (e) { sendJSON(res, 400, { error: 'bad url' }); return; }
      let allowedHost;
      try { allowedHost = new URL(config.iconHub || 'http://192.168.9.126:28080').host; } catch (e) { allowedHost = '192.168.9.126:28080'; }
      if (target.protocol !== 'http:' && target.protocol !== 'https:') { sendJSON(res, 403, { error: 'forbidden' }); return; }
      if (target.host !== allowedHost) { sendJSON(res, 403, { error: 'forbidden host' }); return; }
      try {
        const cached = _cache.icon[target.href];
        if (cached && Date.now() - cached.t < 3600000) {
          res.writeHead(200, { 'Content-Type': cached.type, 'Cache-Control': 'public, max-age=3600' });
          return res.end(cached.buf);
        }
        const r = await fetchBuffer(target.href, 10000);
        _cache.icon[target.href] = { t: Date.now(), buf: r.buffer, type: r.contentType };
        res.writeHead(200, { 'Content-Type': r.contentType, 'Cache-Control': 'public, max-age=3600' });
        res.end(r.buffer);
      } catch (e) {
        sendJSON(res, 502, { error: 'fetch failed: ' + String(e && e.message || e) });
      }
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
