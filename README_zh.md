# Digital Clock / 桌面大时钟

[English README](README.md)

一个美观、可深度定制的桌面翻页时钟，基于 **Electron** 构建。平滑的数字切换动画、多时区、自动昼夜配色、完整的闹钟系统、全屏关灯模式 —— 以及一套**外部插件系统**，不改核心代码也能扩展它的能力。

> 当前版本：**1.0.5.5**（设置 → 关于 里可以看到）

## 功能特性

### 动画
- **5 个动画家族** — 翻转（向上滑入 / 向下滑入）、缩放（缩小 / 放大）、淡入淡出、3D 旋转、无动画
- **方向可选** — 「翻转」「缩放」各自带一个方向选择项
- **错峰数字动画** — 每位数字独立延迟（0–300ms），支持从左到右 / 从右到左
- **模糊过渡** — 翻转家族的可选附加效果（时长 50–1000ms，强度 1–40px）
- **由小放大滑入** — 翻转家族的可选附加效果，新数字从可配置的起始比例放大滑入
- **速度调节** — 动画时长 50–1000ms
- 两项附加效果在 **JS 与 CSS 两侧都限定在翻转家族**，切到别的动画不会残留模糊或缩放

### 显示自定义
- **文本颜色 / 背景颜色** — 任意十六进制颜色，背景支持 RGBA 与透明度
- **字体** — 预设（Arial、Georgia、Microsoft YaHei、Courier New、Inter）或自定义字体名
- **字号** — 40–400px
- **秒 / 日期 / 星期** — 三个独立开关
- **日期位置** — 时间上方或下方（日期、星期、闹钟全关时这一项会自动隐藏）
- **信息文字比例** — 日期 / 时区文字相对时钟字号的独立比例（10%–100%）
- **自动昼夜配色** — 夜间黑底白字、白天白底黑字（06:00 / 18:00 切换），**关灯背景板会跟着一起变**

### 时间与时区
- **时间制式** — 跟随系统 / 24 小时制 / 12 小时制
- **AM/PM 位置** — 12 小时制下角标可放在时间区的四个角之一
- **多时区** — 最多 2 个额外时区，可自定义标签与 UTC 偏移
- **时间校准** — 让显示时间比系统时间调快或调慢，**精确到秒与毫秒**
- **定时自动校准** — 每隔固定时间自动叠加一个固定的提前/延后量，用来补偿走时误差

### 模式与关灯
- **普通 / 教育模式** — 教育模式会隐藏「进阶」分区（动画、时间、闹钟、数据），只留最常用的项
- **关灯（全屏纯色）** — 全屏纯色背景板，可选择是否仍显示时钟
- **多显示器** — 关灯显示在「时钟所在显示器」「主显示器」或「所有显示器」
- **锁定按钮** — 锁定后只能用「退出」按钮离开关灯
- **显隐状态还原** — 进关灯前若时钟是隐藏的（托盘切换），退出后依然隐藏

### 窗口与系统
- **6 种位置预设** — 左上、右上、居中、左下、右下、自定义 X/Y
- **拖拽自动保存** — 直接拖动窗口，位置自动存为「自定义」
- **图层模式** — 置顶 / 桌面普通模式
- **鼠标穿透** — 整个窗口可点击穿透
- **自定义托盘菜单** — 右键托盘图标弹出主题化菜单，左键切换时钟显示/隐藏
- **开机自启动** — 随 Windows 启动
- **静默自启动** — 开机启动时不显示时钟窗口，仅驻留托盘
- **双语界面** — 设置窗口支持中文 / English
- **设置窗口字号** — 5 档可调，且会记住上次的选择

### 闹钟
- **多闹钟管理** — 在设置面板创建、编辑、删除
- **自定义名称** — 自动编号，编号空缺自动复用
- **声音选择** — Beep / Chime / Alarm（Web Audio API）/ 无声音
- **星期重复** — 自由勾选一至日中的任意组合
- **稍后提醒** — 可配置间隔（时/分/秒），支持无限重试或指定次数
- **内联显示** — 时钟上显示 `! 07:30 !` 表示即将响铃，`? 07:30 ?` 表示等待重试；响铃时每 3 秒与闹钟名称交替
- **响铃行为** — 强制显示窗口、临时关闭穿透、强制置顶、数字红色闪烁（都可开关）；单击任意位置关闭
- **智能跳过** — 前一个闹钟无人处理时，7 分钟内的重叠闹钟自动关闭
- **错过恢复** — 程序关闭期间错过的闹钟在重启后顺延，并弹出系统通知
- **高级设置**（可折叠）— 响铃时长（5–300s）、闪烁、自动显示、自动取消穿透、自动置顶

### 数据与插件
- **偏好导出 / 导入** — 导出为一个 JSON 文件，含全部偏好与闹钟，可保存到你选定的任意位置
- **删除所有数据** — 一键恢复出厂状态
- **插件系统** — 导入、启用/禁用、配置、删除外部插件（详见下方[插件开发指南](#插件开发指南)）
- **关于界面** — 版本号、作者、两个仓库地址

## 截图

![时钟演示](docs/screenshots/clock-demo.png)

## 快速开始

```bash
# 安装依赖
npm install

# 从源码启动
npm start

# 打包便携版单文件
npm run pack

# 同时产出免安装目录 + 便携版单文件
npm run dist
```

产物在 `dist/` 目录下（`Digital Clock <版本>.exe` 是便携版）。

**国内网络**建议走镜像，并复用本地已下载的 Electron：

```bash
rm -rf dist/win-unpacked   # 每次都先清残留：上次构建的目录会让打包卡死
NODE_OPTIONS= \
  ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
  ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/" \
  npm run pack -- -c.electronDist=node_modules/electron/dist
```

> ⚠️ dev 版（`npm start`）与打包版共用同一个数据目录 `%APPDATA%/digital-clock/`。同时开两个实例会互相覆盖 `config.json`、争抢 GPU 缓存 —— 测试时请只留一个。

## 项目结构

```
├── main.js              # Electron 主进程（窗口、托盘、闹钟、插件管理器、IPC）
├── preload.js           # 上下文桥接（渲染进程唯一能碰到的 IPC 层）
├── index.html           # 时钟主窗口
├── renderer.js          # 时钟渲染、动画、实时更新
├── styles.css           # 时钟样式（动画、模糊/缩放、插件信息栏插槽）
├── plugin-host.js       # 插件沙箱运行时（三个窗口共用）
├── settings.html        # 设置窗口
├── settings.js          # 设置逻辑、国际化文案、插件面板
├── settings.css         # 设置页面样式
├── welcome.html/js/css  # 首次运行的欢迎界面
├── alarm-editor.*       # 闹钟编辑窗口
├── lights-off.*         # 关灯全屏窗口
├── examples/
│   └── sample-plugin/   # 随仓库提供的示例插件（三种钩子都有）
├── package.json         # 依赖与构建配置
├── docs/screenshots/    # 应用截图
└── LICENSE              # MIT
```

## 数据目录

全部位于 `%APPDATA%/digital-clock/`：

| 路径 | 内容 |
|---|---|
| `config.json` | 全部偏好设置 |
| `alarms.json` | 闹钟列表 |
| `plugins.json` | 插件的启用状态与各插件的设置值 |
| `plugins/<插件 id>/` | 已安装的插件 |
| `plugins-data/<插件 id>/data.json` | 插件自己的数据（只能通过插件 API 访问） |

## 配置说明

所有设置都能在设置窗口里改，下表是各分区与 `config.json` 字段的对应关系。

| 分区 | 设置项（`config.json` 字段） |
|---|---|
| **模式** | `mode`（normal/education）、`lightsOff`、`lightsOffDisplay`（clock/primary/all） |
| **外观** | `color`、`bgColor`、`fontFamily`、`fontSize`、`infoScale`、`autoColor`、`settingsFontSize` |
| **动画** | `animType`（flip/scale/fade/flip-3d/none）、`animFlipDir`（up/down）、`animScaleDir`（shrink/grow）、`animDuration`、`staggerDelay`、`staggerDirection`、`blurEnabled`、`blurDuration`、`blurStrength`、`scaleInEnabled`、`scaleInFactor` |
| **时间** | `showSeconds`、`showDate`、`showWeekday`、`datePosition`、`extraTimezones`、`hourFormat`（auto/24/12）、`ampmCorner`、`timeOffsetMs`、`autoAdjustEnabled`、`autoAdjustIntervalSec`、`autoAdjustAmountMs`、`autoAdjustBaseMs`、`autoAdjustAnchor` |
| **闹钟** | `alarms.json`，以及 `alarmSoundDuration`、`alarmFlash`、`alarmAutoShow`、`alarmAutoPassthrough`、`alarmAutoTop` |
| **位置** | `positionPreset`、`x`、`y`、`layerMode`（alwaysOnTop/normal） |
| **系统** | `autoStart`、`silentStart`、`language`（zh/en）、`passthrough` |
| **插件** | `plugins.json` —— 启用状态与各插件设置值 |
| **数据** | 导出 / 导入 / 删除全部数据 |
| **关于** | 版本号、作者、仓库地址 |

---

# 插件开发指南

插件让 Digital Clock 在不改核心代码的前提下被扩展：往关灯背景板上加内容、给时钟日期栏追加文字、美化设置界面 —— 并且每个插件都能带上自己的设置项。

## 一、能力边界（先看这段）

**沙箱运行。** 插件入口脚本由宿主用 `new Function('dc', code)` 在目标窗口里执行。这些窗口都是 `contextIsolation: true`、未开启 Node 集成，所以插件**不能** `require()`、不能直接读写文件、不能加载原生模块、也拿不到 Electron 的 API；唯一能用的是下面介绍的 `dc` 对象。

**三个钩子，一个插件可以声明多个。** 钩子决定了插件在哪些窗口里运行：

| 钩子 | 生效窗口 | 你能拿到什么 |
|---|---|---|
| `clock.infoBar` | 时钟窗口 | 信息栏里的一个插槽（跟日期 / 星期 / 时区 / 闹钟文字同一行）。窗口会按内容自动撑宽；只要你有内容，即使日期和星期都关了，信息栏也不会被隐藏。 |
| `lightsOff.background` | 关灯全屏窗口 | 背景板上一个铺满、居中的内容层。默认**不吃鼠标事件**，所以「双击背景 / ESC 退出关灯」依然有效。 |
| `settings.theme` | 设置窗口 | 可以用 CSS 变量和附加样式表给设置界面换肤。 |

**钩子决定「在哪个窗口运行」，权限决定「在那个窗口能碰什么」。** 想改窗口里的内容，还要声明对应的界面编辑权：

| 权限 | 配合的钩子 | 能做什么 |
|---|---|---|
| `ui.clock` | `clock.infoBar` | 编辑时钟窗口里的任意元素、往整个窗口叠加自己的层 |
| `ui.settings` | `settings.theme` | 编辑设置窗口里的任意元素、往整个窗口叠加自己的层 |
| `ui.lightsOffBg` | `lightsOff.background` | 支配关灯背景板的背景（颜色 / 渐变 / 图片 / 透明度 / 模糊） |

**如实说明边界。** `storage` 权限是真正被强制的（插件数据由主进程写到以插件 id 命名的目录里）；`net` 权限目前是「声明 + 首次启用时向你确认」，因为插件代码与宿主页面同源运行，它本来也能直接调 `fetch` —— 请把 `net` 当作意图声明，而不是硬性拦截。界面编辑权同理：它给的是**正当接口 + 自动还原 + 用户知情**，不是一堵墙。具体边界：

- **可改样式 / 文字 / 属性 / 类名，可隐藏元素，可往元素里追加内容；但不能删除宿主元素，也不能改宿主行为**（拖动、双击退出关灯、闹钟、保存设置……）。
- 少数元素受保护，连隐藏都会被拒绝：关灯窗口的退出 / 锁定 / 设置按钮，设置窗口的插件列表与插件导航项 —— 保证任何插件出问题时你都还能自救。
- 通过 `dc.ui` 做的每一处改动都会被登记，插件被禁用 / 卸载 / 改设置时逐个还原。
- 万一插件把界面改坏了：**托盘菜单 →「🛡️ 安全模式（停用插件）」**，一键停用全部插件并重启，界面立刻回到原始状态（这个菜单由主进程绘制，插件改不到）。连续多次「启动期渲染进程异常」时宿主也会自动进入安全模式，并在设置 → 插件页顶部显示提示条。
- 插件样式是全局的，请给自己的类名加前缀。**只安装你信任的插件。**

## 二、目录结构

插件就是一个普通文件夹：

```
my-plugin/
├── plugin.json      # 必需 —— 清单
├── index.js         # 入口脚本（文件名可用 "main" 指定）
├── style.css        # 可选样式表（用 "style" 指定）
└── settings.html    # 可选的自绘设置片段（用 "settingsView" 指定）
```

图片、字体、JSON 等资源可以放在同目录，用 `dc.assets.url('pic.png')` 取地址。

## 三、`plugin.json` 字段说明

```jsonc
{
  "id": "com.example.weather",     // 必需，命名规则见下表
  "name": "天气小条",               // 设置界面里显示的名字
  "version": "1.0.0",
  "author": "你的名字",
  "description": "一句话说明它是做什么的",
  "homepage": "https://example.com/weather",
  "apiVersion": 1,
  "hooks": ["clock.infoBar"],
  "permissions": ["storage", "net"],
  "main": "index.js",
  "style": "style.css",
  "settingsView": "settings.html",
  "settings": [ /* 见第五节 */ ]
}
```

| 字段 | 类型 | 必需 | 规则 |
|---|---|---|---|
| `id` | string | **是** | 需匹配 `/^[a-z0-9][a-z0-9._-]{1,63}$/i`，加载时会转小写。推荐反向域名写法。安装后的文件夹名、插件数据目录都以它为准。 |
| `name` | string | 否 | ≤ 64 字，缺省用 `id` |
| `version` | string | 否 | ≤ 24 字，缺省 `1.0.0` |
| `author` | string | 否 | ≤ 64 字 |
| `description` | string | 否 | ≤ 200 字 |
| `homepage` | string | 否 | 必须以 `https://` 开头，否则丢弃 |
| `apiVersion` | number | 否 | 缺省 1；当前宿主支持 **2**（`2` 起才有界面编辑权）。填高于宿主的版本会以 `api-too-new` 拒绝加载 |
| `hooks` | string[] | **是** | 至少包含一个已知钩子，未知项会被丢弃；一个可用钩子都没有则拒绝加载（`no-hooks`） |
| `permissions` | string[] | 否 | 可填 `storage`、`net`、`ui.clock`、`ui.settings`、`ui.lightsOffBg`，未知项丢弃；首次启用时宿主会把这些逐条列出来让你确认 |
| `main` | string | 否 | 插件目录内的相对路径，缺省 `index.js`；文件必须存在 |
| `style` | string | 否 | 相对路径的 CSS 文件；只会注入到「声明了该插件钩子」的窗口 |
| `settingsView` | string | 否 | 相对路径的 HTML 片段，插入前会被清洗（见第七节） |
| `settings` | object[] | 否 | 最多 24 个声明式设置项（见第五节） |

清单里的其他字段一律忽略 —— 宿主只读上面这些。

## 四、入口脚本与 `dc` API

`plugin.json` 里 `main` 指定的文件（缺省 `index.js`）会在**声明了钩子的每个窗口里各执行一次**，用 `dc.hook` 区分当前在哪：

```js
dc.mount(function (slot, dc) {
  if (dc.hook === 'clock.infoBar')       dc.clock.setInfoText(dc.settings.text);
  if (dc.hook === 'lightsOff.background') {
    dc.lightsOff.setText(dc.settings.text);
    slot.style.fontSize = dc.settings.size + 'px';
  }
  if (dc.hook === 'settings.theme')      dc.ui.applyVars({ '--plugin-accent': dc.settings.accent });

  return function cleanup() { /* 可选：被关闭、改设置或卸载时执行 */ };
});
```

### 通用成员

| 成员 | 说明 |
|---|---|
| `dc.id` / `dc.name` / `dc.version` | 插件身份信息 |
| `dc.hook` | 当前实例运行在哪个窗口 |
| `dc.apiVersion` | 宿主 API 版本（当前为 `2`）。需要界面编辑权时判定 `>= 2`，或用 `typeof dc.ui.get === 'function'` 探测 |
| `dc.settings` | 插件当前设置值的只读副本（对象已冻结） |
| `dc.theme()` | 返回 `{ isDark, fg, bg }`，按实际渲染出来的底色计算。**请用它来判断明暗，不要写死颜色。** |
| `dc.mount(fn)` | 注册挂载回调。`fn(slot, dc)` 会拿到 DOM 插槽；需要收尾就返回一个清理函数 |
| `dc.log(...)` | 带插件名前缀的 `console.log`，开发时方便 |
| `dc.on(name, cb)` / `dc.emit(name, payload)` | 插件自己的事件总线 |

### `dc.clock` —— 仅 `clock.infoBar`

| 成员 | 说明 |
|---|---|
| `dc.clock.setInfoText(text)` | 设置插槽文字。元素由宿主托管，所以宽度自适应、颜色继承（自动昼夜、闹钟闪烁）都会正常工作 |
| `dc.clock.clearInfoText()` | 清空文字（空插槽会收起，不再占位） |

### `dc.lightsOff` —— 仅 `lightsOff.background`

| 成员 | 说明 |
|---|---|
| `dc.lightsOff.root()` | 插件自己的内容层元素 |
| `dc.lightsOff.setText(text)` | 往里写文字 |
| `dc.lightsOff.setInteractive(true)` | 让该层接收鼠标事件。默认关闭；开启后那一块不再传递「双击退出关灯」，请谨慎并尽量缩小范围 |
| `dc.lightsOff.setBackground({ color, gradient, image, size, position, repeat, opacity, blur })` | **需 `ui.lightsOffBg`**：设置背景板的背景。`gradient` 优先于 `image`，`image` 优先于 `color`；`image` 只接受本插件目录内的 `file://` 资源或 `https://` 地址 |
| `dc.lightsOff.clearBackground()` | **需 `ui.lightsOffBg`**：恢复透明（露出宿主底色） |
| `dc.lightsOff.bgLayer()` | 背景层元素本身，想精细控制（动画、叠加）时可直接用 |

背景层在宿主底色**之上**、内容与控件**之下**，压不住「退出 / 设置 / 锁定」按钮。宿主仍然照常推送底色与昼夜切换（`onLightsOffBgUpdate`），想让背景跟着昼夜走就自己监听重设；不理会则固定成你设的样子。

### `dc.ui` —— 界面编辑

**换肤类（任意窗口可用，不需要界面权限）**

| 成员 | 说明 |
|---|---|
| `dc.ui.addStyle(cssText)` | 为该窗口追加一段样式表（卸载时移除） |
| `dc.ui.applyVars({ '--名字': 值 })` | 仅设置窗口：在 `:root` 上设置 CSS 自定义属性（卸载时还原）。设置界面本身就用 `--sfz`（基准字号）等一系列变量，覆盖它们即可整体换肤 |

**编辑类（需要该窗口的界面编辑权：时钟 `ui.clock`、设置 `ui.settings`）**

| 成员 | 说明 |
|---|---|
| `dc.ui.layer()` | 该窗口里属于你的自绘层：铺满、居中、默认不吃鼠标事件，可以自由往里画 |
| `dc.ui.get(sel)` | 取宿主元素的可写句柄（见下）；找不到返回 `null` |
| `dc.ui.hide(sel)` / `dc.ui.show(sel)` | 隐藏 / 恢复。受保护元素会抛错 |
| `dc.ui.setText(sel, text)` | 改文字 |
| `dc.ui.patch(sel, { style, class, attr })` | 批量改。`style` 键驼峰或短横线都行；`class` 可给字符串 / 数组（添加），或 `{ add, remove }` |
| `dc.ui.push(sel, html)` | 往元素**里追加**一段清洗过的片段（白名单同第七节），不替换原有内容 |
| `dc.ui.on(sel, type, cb)` | 绑定事件。会自动 `stopPropagation`（避免误触发宿主行为，例如「双击退出关灯」），并给元素加上 `no-drag`（时钟窗口整块是拖动区，不加就点不动） |
| `dc.ui.nav({ id, label, icon })` | 在设置窗口左侧导航新增一个属于你的页面，**返回该页的内容容器**（见下）。`id` 需匹配 `/^[a-z0-9][a-z0-9._-]{0,31}$/`，`label` ≤ 24 字，`icon` 建议单个 emoji |

`dc.ui.get(sel)` 返回的句柄把上面这些方法挂在元素上，可链式调用：

```js
dc.mount(function (slot, dc) {
  if (dc.hook !== 'clock.infoBar') return;
  const h = dc.ui.get('#time-display');
  if (!h) return;
  h.style('letterSpacing', '0.02em').cls('my-glow').attr('title', '由插件美化');
  h.on('click', () => dc.log('clicked'));
  dc.ui.get('#date-inline').hide();                    // 藏掉日期（卸载后自动回来）
  dc.ui.push('#info-bar', '<span class="my-mark">·</span>');
});
```

`h.node()` 只用于**读**（量尺寸、读计算样式）；直接改它不会被自动还原。

### 在设置界面里给自己开一页（`dc.ui.nav`）

设置窗口里页面很多时，别把东西全塞进插件卡片 —— 可以申请一个自己的导航页：

```js
dc.mount(function (slot, dc) {
  if (dc.hook !== 'settings.theme') return;
  const page = dc.ui.nav({ id: 'stats', label: '专注统计', icon: '📊' });
  if (!page) return;
  const p = document.createElement('p');
  p.textContent = '今天已专注 3 小时';
  page.appendChild(p);
  dc.ui.push('.plugin-nav-body', '<button type="button" class="my-reset">重置</button>');
  dc.ui.on('.my-reset', 'click', () => dc.storage.set('total', 0));
});
```

- 导航项插在「插件」项之后，与内置项**同款样式**，左侧多一条细色条表示这是插件页；点击即切换，不需要自己做路由。
- 返回的容器是普通 DOM 元素，你已经持有 `ui.settings` 权限，可以自由往里写内容、绑事件；宿主也提供了 `.plugin-nav-body button` 的兜底按钮样式。
- 上限：单个插件最多 3 个导航页，所有插件合计最多 5 个（超了会抛 `too-many-nav-pages`）。
- 插件被禁用/卸载/改设置时，导航项与该页面整块移除；如果你当时正停在这一页，宿主会自动退回「插件」页。
- 导航文案**不要加 `data-lang`**（那是宿主切换语言用的，会被覆盖）；要跟随中英切换请用 `MutationObserver` 观察 `document.documentElement.lang` 自己换。

几条硬性规则：

- **不能删除宿主元素**：没有 `remove()`，`push()` 只能追加。
- **受保护元素**（关灯退出 / 锁定 / 设置按钮、设置窗口插件列表与插件导航项）不能被隐藏，`patch` 里塞 `display:none` 同样会被拒绝。
- 关灯窗口不开放宿主元素编辑，只有 `dc.lightsOff.setBackground()` 那条背景通路。
- `sel` 就是普通 CSS 选择器，宿主只按你给的选择器办事 —— 选中什么就改什么，请自己保证选择器够准。

### 需要权限的成员

| 成员 | 需要权限 | 说明 |
|---|---|---|
| `dc.storage.get(key)` | `storage` | 读一个值（不存在返回 `undefined`） |
| `dc.storage.set(key, value)` | `storage` | 写一个值（JSON，总量 ≤ 256KB） |
| `dc.storage.all()` | `storage` | 读回整个对象 |
| `dc.fetchText(url, { timeout })` | `net` | 仅 `https`，默认 8 秒超时，返回内容截断到 20 万字符 |
| `dc.ui.get/hide/show/setText/patch/push/on/layer/nav` | `ui.clock` 或 `ui.settings` | 该窗口的宿主元素编辑权（按窗口判定，见第一节）；`nav()` 只在设置窗口有意义 |
| `dc.lightsOff.setBackground/clearBackground` | `ui.lightsOffBg` | 关灯背景板的背景 |

没声明权限就调用会抛错，错误会显示在该插件的设置卡片上。

### 资源

`dc.assets.base` 是插件自身目录的 `file://` 地址，`dc.assets.url('pic.png')` 用于拼路径（在时钟窗口、关灯窗口与清洗后的 `settingsView` 里都可用）。

## 五、声明式设置项

宿主会把每个条目渲染成与内建设置完全同款的一行：

```json
"settings": [
  { "key": "text",   "type": "text",   "label": "显示文字", "hint": "日期栏里会用到", "default": "你好" },
  { "key": "size",   "type": "number", "label": "关灯字号", "min": 12, "max": 200, "step": 2, "default": 48 },
  { "key": "accent", "type": "color",  "label": "强调色", "default": "#6C8CFF" },
  { "key": "bold",   "type": "toggle", "label": "加粗", "default": true },
  { "key": "pos",    "type": "select", "label": "位置", "default": "center",
    "options": [ { "value": "center", "label": "居中" }, { "value": "top", "label": "靠上" } ] },
  { "key": "notes",  "type": "textarea", "label": "备注", "default": "" }
]
```

| `type` | 渲染成 | 额外字段 |
|---|---|---|
| `text` | 单行输入框 | — |
| `textarea` | 三行文本域 | — |
| `number` | 数字输入框 + 实时数值 | `min`（默认 0）、`max`（默认 100）、`step`（默认 1） |
| `slider` | 滑条 + 实时数值 | `min`、`max`、`step` |
| `select` | 下拉框 | `options: [{ value, label }]`（≤ 24 项） |
| `toggle` | 与全局一致的开关 | — |
| `color` | 取色器 | — |

加载与保存时都会强制这些规则：

- `key` 需匹配 `/^[a-zA-Z0-9_-]{1,32}$/`，`label` ≤ 48 字，`hint` ≤ 120 字，最多 24 项。
- 未知 `type` 回退为 `text`；非法条目会被静默丢弃。
- 取值按类型收敛：开关存布尔；数字夹到 `[min, max]`；颜色必须是 `#rgb`–`#rrggbbaa`（否则用默认值）；下拉必须是声明过的选项之一；文本截断到 4000 字。
- 改动任一设置项会写进 `plugins.json` 并**重新运行插件**（先卸载再挂载，拿到新值）。所以请在 `mount` 里读 `dc.settings`，不要写在模块顶层。
- 同一个 `key` 也可以出现在你的 `settingsView` 里；声明式字段已经帮你持久化，自绘区域只在需要特殊排版时才用。

## 六、三个钩子的实战建议

- **日期栏文字** — 尽量短：时钟窗口会按「数字区宽度」与「信息栏宽度」的较大值撑开。推荐用 `setInfoText`，因为元素由宿主托管，颜色继承（自动昼夜、闹钟闪烁）都不会丢。
- **时钟窗口内容**（需 `ui.clock`）— 想改时间数字的字体 / 间距 / 加装饰，用 `dc.ui.get('#time-display')`；想放整块自己的东西，用 `dc.ui.layer()`，别去动 `#clock` 的拖动属性（`-webkit-app-region`），否则窗口拖不动了。
- **关灯背景板** — 适合放信息量大的内容（一句话、农历、倒计时）。记得这一层默认不吃鼠标事件；确实需要交互时再显式开启，并且把可交互区域做小，避免用户无法退出。
- **关灯背景**（需 `ui.lightsOffBg`）— 适合壁纸、渐变、氛围光。整层被 `filter: blur()` 会连内容一起糊掉时，把模糊放在背景层的子元素上，或直接用 `opacity` + 半透明色。
- **设置界面美化** — 尽量只注入变量而不是整段覆盖样式；`--sfz` 是设置界面的基准字号，用 `calc()` 基于它计算，能跟随用户选择自动缩放。改宿主元素时**别隐藏插件面板**（那是用户停用你的唯一入口，受保护）。
- **设置界面导航页**（需 `ui.settings`）— 功能一多就用 `dc.ui.nav()` 开自己的页，别把插件卡片撑成第二个设置界面；一个插件最多 3 页，超额会抛错。
- **通用** — `dc.ui` 的每一次调用都会校验权限与保护名单，写错选择器只会返回 `false`（不抛错）；但**受保护元素**和**越权调用**会抛错并显示在该插件的错误徽章上，开发时留意设置页面。

## 七、自绘设置视图（`settingsView`）

当声明式表单不够用时，把 `settingsView` 指向一个 HTML **片段**（不要 `<html>` / `<body>`）。插入前宿主会解析并清洗：

- **整段删除**：`script`、`style`、`iframe`、`object`、`embed`、`link`、`meta`、`form`
- **解包**（去掉标签、保留子内容）：不在下面白名单里的标签
- **允许的标签**：`a b br button code details div em h3 h4 hr i img input label li ol option p pre section select small span strong summary table tbody td th thead tr ul`
- **允许的属性**：仅 `class id title type value checked disabled placeholder min max step rows cols name href src alt width height role for selected data-key data-role data-plugin-field`；其余（包括所有 `on*` 事件属性）一律删除
- `href` 必须 `https://`；`src` 必须 `https://`，或者是**本插件目录内**的 `file://` 路径；`style` 只保留安全声明（`url()`、`expression()`、`@import`、`javascript:` 会被丢掉）

这里的内容是静态标记：不会执行脚本，事件属性也不会触发。需要持久化的数据请优先用第五节的声明式设置项。

## 八、打包成 `.dcplugin`

`.dcplugin` 本质就是一个 **zip 包**。`plugin.json` 放在压缩包根目录或者「外面套一层文件夹」都可以：

```
weather.dcplugin
├── plugin.json
├── index.js
└── style.css
```

Windows（PowerShell）：

```powershell
# 压缩文件夹里的内容，再改名为 .dcplugin
Compress-Archive -Path .\my-plugin\* -DestinationPath .\my-plugin.zip -Force
Rename-Item .\my-plugin.zip my-plugin.dcplugin
```

macOS / Linux：

```bash
cd my-plugin && zip -r ../my-plugin.dcplugin . -x '.*'
```

导入时会强制这些规则：

- 每个条目的路径必须安全：含 `..`、绝对路径、带盘符的一律拒绝（`bad-entry`）—— 恶意压缩包无法写到插件目录之外。
- 单文件上限 8MB，整个插件上限 20MB（`file-too-large` / `too-large`）。
- 宿主读取的文本文件（入口脚本、样式表、自绘设置页）上限 512KB；清单 256KB。
- 也支持**直接导入文件夹**（设置 → 插件 → 导入文件夹…），开发时迭代最快，连打包都不用。

## 九、安装与管理

设置 → **插件**：

- **导入插件…** 选 `.dcplugin` / `.zip`；**导入文件夹…** 选含 `plugin.json` 的目录
- 导入后会立即启用。若同 `id` 已存在，会先询问是否覆盖（已有设置值保留）
- 每张卡片显示名称、版本、作者、id、钩子与权限徽章；出错时会有红色错误徽章
- **设置** 展开该插件的声明式表单（有 `settingsView` 的话也会一起渲染）
- **重新加载** 清掉记录的错误并重新运行；**删除** 会同时删掉插件目录与它的数据
- 首次开启一个申请了权限的插件时，会先列出权限让你确认；申请了界面编辑权的会额外提示风险与自救入口
- **打开插件目录** 直接定位到 `%APPDATA%/digital-clock/plugins/`
- 插件面板顶部会出现**安全模式**提示条（如果你从托盘菜单开过安全模式）：一键退出即可恢复所有插件

> **界面被插件改坏了怎么办？** 托盘图标右键 →「🛡️ 安全模式（停用插件）」→ 全部插件停用并自动重启，界面立刻回到原始状态（插件文件与设置都还在）。连续多次出现「启动期渲染进程异常」时宿主也会自动进入安全模式。

## 十、示例插件

仓库里的 `examples/sample-plugin/` 是一个能跑通的完整插件，三种钩子、声明式设置、自绘设置页都有演示。用「导入文件夹…」选中它，日期栏文字、关灯背景板内容、设置界面强调色会立刻变化。它被刻意排除在打包产物之外 —— 想改就复制到别处再改。

## 十一、报错对照表

| 提示 | 含义 |
|---|---|
| `Invalid plugin id` | `id` 不符合命名规则 |
| `plugin.json is missing` | 根目录没有清单（也没有唯一的嵌套目录里有） |
| `Malformed plugin.json` | 不是合法 JSON，或不是对象 |
| `Entry file is missing` | `main` 指向的文件不存在 |
| `No usable hooks declared` | `hooks` 为空或只含未知值 |
| `Plugin needs a newer host API` | `apiVersion` 高于当前版本支持的能力 |
| `Illegal path inside the package` / `A file inside the package is too large` | 压缩包里有越权路径或超大文件 |
| `Plugin exceeds the size limit` | 插件总体积超过 20MB |
| `当前版本不支持导入压缩包` | 包里缺 `adm-zip` 依赖 —— 解压后用「导入文件夹…」 |
| `permission-denied: storage` / `net` / `ui.*` | 没声明权限就调用了对应 API |
| `only-https` | `dc.fetchText` 用了非 https 地址 |
| 缺少权限被拒绝：编辑时钟窗口内容 | 用了 `dc.ui.get/hide/patch…` 却没声明 `ui.clock`（同理 `ui.settings`） |
| 这个元素受保护，不能隐藏或删除 | 试图隐藏关灯的退出 / 锁定按钮，或设置窗口的插件列表 |
| 当前窗口不开放宿主元素编辑 | 在关灯窗口调了 `dc.ui.get()` —— 那里只有 `setBackground` 一条通路 |
| `bad-image-url` | `dc.lightsOff.setBackground({ image })` 的地址既不在本插件目录也不是 `https://` |

运行时错误按插件单独捕获、只上报一次，并显示在该插件的卡片上 —— 插件崩了不会拖垮时钟本身。

## 技术栈

- **Electron** — 桌面外壳（主进程 + preload + 渲染进程，全部开启 `contextIsolation`）
- **原生 JavaScript** — 无框架、无构建步骤
- **CSS 自定义属性** — 动画时长、模糊强度、缩放比例、插件换肤都走变量
- **IPC** — 所有特权操作都经过 `preload.js`，渲染进程看不到 `fs`
- **adm-zip** — 安全的 `.dcplugin` 解压（逐条校验条目，防 zip-slip）
- **electron-builder** — Windows 便携版单文件打包

## 仓库地址

- **Gitee**：<https://gitee.com/Yejack819/AniClock-Desktop.git>
- **GitHub**：<https://github.com/Yejack819/AniClock-Desktop>

## 许可证

MIT © 2026 Yejack819 · 由 DeepSeek 与 Yejack819 共同构建
