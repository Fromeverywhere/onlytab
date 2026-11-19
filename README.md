# OnlyTab

极简、低占用的浏览器新标签页 / 导航起始页 —— 纯 Node 零运行时依赖，Docker 一键部署。

**镜像即交付**：运行只需拉取 Docker 镜像，无需任何源码。

**源码已转为私有仓库维护，不再开源。** 私有源码仓 `Fromeverywhere/onlytab-src`（不对外公开）。本仓库仅作对外说明与发布入口。

```bash
docker pull fromeverywhere/onlytab:1.0
```

## 快速开始

```bash
docker run -d --name onlytab --restart unless-stopped \
  -p 3000:3000 \
  -v /your/path/data:/app/data \
  fromeverywhere/onlytab:1.0
```

或使用 docker-compose：

```yaml
services:
  onlytab:
    image: fromeverywhere/onlytab:1.0
    container_name: onlytab
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
    volumes:
      - /your/path/data:/app/data
```

```bash
docker compose up -d
```

打开 `http://<主机>:3000/`。控制台在 `/admin`，登录页在 `/login`。

**首次部署请立即修改默认账号**：`admin` / `OnlyTab`。

> 务必挂载数据卷 `:/app/data` —— 配置、上传的图标 / 背景、会话、天气缓存都在这一个目录里，备份 / 迁移只拷这一处；不挂卷重建容器会丢配置。

## 功能

- **首页**：时钟 + 日期 + 星期、搜索框（默认百度，可切换搜索引擎）、多分页面（滚轮或左侧图标栏翻页）、标签 / 分组 / 小组件混排，编辑模式下拖动排序。
- **小组件**：天气（默认中国天气网，另可选 Open-Meteo / 和风天气）、日历（含农历）、图片轮播，均可添加多个实例并单独设置大小与样式。
- **多用户与访客页**：管理员 / 普通用户两级权限；未登录访客看到独立的「访客公开页」，普通用户登录后是自己的分页面，互不可见。注册需管理员审批。
- **控制台（v1.0 面板式）**：左侧导航 + 顶栏 + 底部常驻保存条，可视化管理分页面、标签、分组、小组件、预设图标（Excel 导入导出）、背景与壁纸、字体、搜索引擎、版权备案、自定义 CSS。
- **主题与外观**：日间 / 夜间主题（固定 / 跟随系统 / 自定义时段），紫蓝青新品牌 logo 全平台统一，桌面与手机端均有新手指引。
- **交互**：自定义右键菜单（图标 / 组件 / 空白处各有菜单）、左上角日夜切换、手机端左侧抽屉面板导航。
- **零依赖**：后端单个 `server.js`（纯 Node `http`），镜像小、内存占用极低。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `DATA_DIR` | `./data` | 配置与上传文件目录（容器内为 `/app/data`） |
| `ADMIN_USER` | `admin` | 管理员用户名（选填，可在控制台修改） |
| `ADMIN_PASSWORD` | `OnlyTab` | 管理员密码（选填，部署后请修改） |

## 页面与接口

| 路径 | 说明 |
| --- | --- |
| `/` | 首页（未登录为访客公开页） |
| `/login` | 登录 / 注册申请 |
| `/admin` | 控制台（需登录） |
| `/healthz` | 健康检查 |

## 镜像标签

| 标签 | 说明 |
| --- | --- |
| `fromeverywhere/onlytab:1.0` | 精确版本（推荐固定用这个） |
| `fromeverywhere/onlytab:latest` | 最新版的移动别名 |
| `ghcr.io/fromeverywhere/onlytab:1.0` | 同内容镜像（GHCR） |

双标签由 CI 构建推送，内容一致。需要自托管的场景直接拉取镜像即可，无需也不提供源码。

## 姊妹项目

- **icons+**：图标托管 / 图床服务 —— 镜像 `fromeverywhere/iconsplus`
- **Webhook-To**：一站式 Webhook 通知处理与转发 —— 镜像 `fromeverywhere/webhook-to`

---

OnlyTab © 2026 Fromeverywhere
