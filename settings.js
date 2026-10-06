// settings.js — 设置窗口
const LOCALE = {
  zh: {
    settingsTitle: '时钟设置', settingsHeader: '时钟设置',
    secAppearance: '--- 外观 ---', secDate: '--- 日期 ---', secAnimation: '--- 动画 ---', secTime: '--- 时间 ---', secPosition: '--- 位置 ---', secSystem: '--- 系统 ---',
    textColor: '文本颜色', autoColor: '根据白天/黑夜自动切换黑白',
    bgColor: '背景颜色', alpha: '透明度',
    fontFamily: '字体', customFont: '自定义...',
    fontSize: '字号', infoScale: '日期/时区比例', animSpeed: '动画时间', animType: '动画效果',
    animSlideUp: '上滑翻转', animSlideDown: '下滑翻转', animFade: '淡入淡出',
    animShrink: '缩（旧变小）', animExpand: '放（旧变大）', animFlip3d: '3D旋转', animNone: '无动画',
    // [v1.0.5.4] 翻转/缩放 合并为动画家族 + 方向
    animFlip: '翻转', animScale: '缩放',
    animFlipDir: '翻转方向', animScaleDir: '缩放方向',
    flipDirUp: '向上滑入（旧数字向上移出）', flipDirDown: '向下滑入（旧数字向下移出）',
    scaleDirShrink: '缩小（旧数字变小消失）', scaleDirGrow: '放大（旧数字变大消失）',
    // [v1.0.5.7] 数字动画节奏（缓动曲线）
    animEase: '动画节奏', easeDefault: '弹性（默认）', easeLinear: '匀速',
    easeIn: '慢起', easeOut: '慢停', easeInOut: '两头慢',
    staggerDelay: '错峰延迟', staggerDir: '错峰方向', staggerLTR: '从左到右', staggerRTL: '从右到左',
    blurEnabled: '添加模糊', blurDuration: '模糊持续', blurStrength: '模糊强度',
    scaleInEnabled: '由小放大滑入', scaleInFactor: '初始大小',
    showSeconds: '显示秒',
    showDate: '显示日期', showWeekday: '显示星期', datePosition: '日期位置',
    dateAbove: '上方', dateBelow: '下方',
    secTZ: '--- 多时区 ---', tzAdd: '添加', tzRemove: 'X', tzHint: '最多添加 2 个时区',
    position: '窗口位置', posTL: '左上', posTR: '右上', posCenter: '居中',
    posBL: '左下', posBR: '右下', posCustom: '自定义', applyPos: '应用位置',
    layerMode: '图层模式', layerTop: '置顶', layerNormal: '桌面',
    autoStart: '开机自启动', silentStart: '静默自启动',
    silentStartHint: '开机启动时不显示时钟窗口，仅驻留系统托盘；点击托盘图标即可随时唤出',
    language: '语言', langZh: '中文', langEn: 'English',
    autoStartFail: '设置开机自启动失败：', permissionDenied: '权限被拒绝',
    passthrough: '鼠标穿透（整个窗口）', passthroughWarn: '开启鼠标穿透后无法拖动窗口以更改其位置',
    secAlarm: '--- 闹钟 ---',
    alarmAdd: '+ 添加闹钟', alarmEdit: '编辑', alarmDelete: '删除',
    alarmRepeatNone: '仅一次', alarmRepeatDays: '重复', alarmDisabled: '已关闭',
    dayNames: ['日', '一', '二', '三', '四', '五', '六'],
    alarmSounds: { beep: 'Beep', chime: 'Chime', alarm: 'Alarm', none: '无声音' },
    confirmDelete: '确定要删除闹钟"{{name}}"吗？',
    snoozeLabel: '稍后',
    alarmAdvanced: '▶ 高级设置', alarmSoundDuration: '声音播放最长时间',
    alarmFlash: '闹钟响时闪烁',
    alarmAutoShow: '闹钟响时自动取消隐藏', alarmAutoPassthrough: '闹钟响时自动关闭鼠标穿透',
    alarmAutoTop: '闹钟响时自动置顶',
    // [v1.0.5.7] 倒计时
    navCountdown: '倒计时',
    countdownAdd: '+ 添加倒计时', countdownEdit: '编辑', countdownDelete: '删除',
    countdownEmpty: '暂无倒计时，点击下方按钮添加',
    countdownAdvanced: '▶ 高级设置',
    countdownSound: '到点提示音', countdownSoundHint: '新建倒计时默认用这个提示音；单个倒计时的声音可在编辑窗里单独改。',
    countdownShowInInfoBar: '在时钟上显示倒计时',
    soundBeep: 'Beep', soundChime: 'Chime', soundAlarm: 'Alarm', soundNone: '无声音',
    cdPause: '暂停', cdResume: '继续', cdRestart: '再来一次',
    cdRunning: '进行中', cdPaused: '已暂停', cdRinging: '⏳ 正在响',
    cdRemaining: '剩余', cdTotal: '时长',
    cdConfirmDelete: '确定要删除倒计时"{{name}}"吗？',
    secData: '--- 数据管理 ---',
    deleteDataDesc: '删除所有保存的数据（config.json 和 alarms.json），应用将恢复出厂状态。此操作不可撤销！',
    deleteDataBtn: '🗑️ 删除所有保存的数据',
    confirmDeleteData: '确定要删除所有保存的数据吗？\n\n此操作将删除所有配置和闹钟数据，且不可撤销！\n\n应用将自动重启以完成重置。',
    deleteDataSuccess: '数据已删除，应用即将重启...',
    // [v1.0.5.3] 偏好设置导入 / 导出
    dataTransferDesc: '导出/导入偏好设置：导出的文件包含全部偏好与闹钟，可保存到任意位置（U 盘、网盘目录均可），重装或换机后导入即可恢复。',
    exportDataBtn: '📤 导出偏好设置…',
    importDataBtn: '📥 导入偏好设置…',
    exportSuccess: '已导出到：',
    exportFailed: '导出失败：',
    importConfirm: '导入将覆盖当前全部偏好设置与闹钟数据，并重启应用。确定继续吗？',
    importSuccess: '导入成功，正在重启应用…',
    importFailed: '导入失败：',
    importInvalidJson: '文件不是合法的 JSON，请确认选择的是导出的备份文件。',
    importInvalidFormat: '文件格式不正确，请选择由本应用导出的备份文件。',
    // [v1.0.5] 倒计时 / 状态
    alarmRinging: '🔔 正在响铃',
    alarmRetrying: '⏰ 稍后提醒中',
    alarmAboutToRing: '即将响铃',
    countdownDays: '距提醒还有{d}天{h}小时{m}分钟',
    countdownHours: '距提醒还有{h}小时{m}分钟',
    countdownMins: '距提醒还有{m}分钟',
    // [v1.0.5] 设置界面
    secSettingsUI: '--- 设置界面 ---',
    settingsFontSize: '设置窗口字体大小',
    fontXs: '极小', fontSm: '小', fontMd: '中', fontLg: '大', fontXl: '极大',
    // [v1.0.5.5] 自绘标题栏按钮
    winMinimize: '最小化', winMaximize: '最大化', winClose: '关闭',
    // [v1.0.5] 模式切换 + 关灯
    secMode: '--- 模式 ---',
    modeLabel: '模式',
    modeNormal: '正常模式', modeEducation: '教育模式',
    lightsOff: '关灯（全屏纯色背景）',
    lightsOffDisplay: '关灯显示器', displayClock: '时钟所在显示器', displayPrimary: '主显示器', displayAll: '所有显示器',
    lightsOffOn: '已开启关灯',
    lightsOffFail: '开启关灯失败：',
    // [v1.0.5.1] 左侧导航
    navMode: '模式', navAppearance: '外观', navAnimation: '动画', navTime: '时间',
    navAlarm: '闹钟', navPosition: '位置', navSystem: '系统', navData: '数据管理',
    // [v1.0.5.3] 12 小时制
    hourFormat: '时间制式', hourFormatAuto: '跟随系统', hourFormat24: '24 小时制', hourFormat12: '12 小时制',
    ampmCorner: 'AM/PM 位置',
    cornerTopRight: '右上角', cornerTopLeft: '左上角', cornerBottomRight: '右下角', cornerBottomLeft: '左下角',
    // [v1.0.5.4] 时间校准 + 关于
    timeCalib: '时间校准',
    calibAhead: '调快（显示比系统时间快）', calibBehind: '调慢（显示比系统时间慢）',
    calibAmount: '校准量', calibSec: '秒', calibMs: '毫秒', calibReset: '归零',
    calibOff: '当前未校准（跟随系统时间）',
    calibSummaryFast: '当前：显示比系统时间快 {v}',
    calibSummarySlow: '当前：显示比系统时间慢 {v}',
    navAbout: '关于',
    aboutTagline: '可深度定制的桌面翻页时钟',
    aboutAuthors: '作者', aboutFoot: '基于 Electron 构建 · 感谢使用',
    aboutVersion: '版本',
    navPlugins: '插件',
    pluginIntro: '插件可以给关灯背景板加内容、给时钟日期栏加文字、美化设置界面；申请了界面编辑权的插件还能改这两个窗口里的文字与样式（不会删除宿主元素，卸载或改设置时自动还原）。插件代码在受限沙箱里运行，只能使用宿主提供的接口。',
    pluginImportBtn: '📦 导入插件…', pluginImportFolderBtn: '导入文件夹…', pluginFolderBtn: '打开插件目录',
    pluginEmpty: '还没有安装插件。点上面的按钮导入插件包（.dcplugin / .zip）或文件夹。',
    pluginSettingsBtn: '设置', pluginReloadBtn: '重新加载', pluginDeleteBtn: '删除',
    pluginEnable: '启用', pluginEnabled: '已启用', pluginDisabled: '已禁用',
    pluginGrantTitle: '这个插件申请了额外权限：',
    pluginGrantAsk: '\n\n仅在你信任插件来源时继续。要启用吗？',
    pluginGrantUiWarn: '\n\n⚠️ 它会修改窗口里的文字与样式（不会删除宿主元素，卸载或改设置时自动还原）。万一界面被改坏，可在托盘菜单里开启安全模式一键停用全部插件。',
    pluginPermStorage: '读写自己的数据', pluginPermNet: '访问网络（https）',
    pluginPermUiClock: '编辑时钟窗口内容', pluginPermUiSettings: '编辑设置窗口内容', pluginPermUiLightsBg: '控制关灯背景板背景',
    pluginPermMic: '使用麦克风',
    pluginHookLightsOff: '关灯背景板', pluginHookInfoBar: '时钟日期栏', pluginHookSettingsTheme: '设置界面美化',
    pluginSafeText: '安全模式：全部插件已暂停，时钟与设置界面回到原始状态。确认插件没问题后可退出。',
    pluginSafeExit: '退出安全模式并重启', pluginSafeBadge: '安全模式已暂停',
    pluginSafeConfirm: '退出安全模式需要重启应用，确定继续吗？', pluginSafeOn: '已关闭安全模式，正在重启…',
    pluginRuntimeDenied: '缺少权限被拒绝：', pluginRuntimeProtected: '这个元素受保护，不能隐藏或删除',
    pluginRuntimeNoUi: '当前窗口不开放宿主元素编辑（关灯窗口只开放背景）',
    pluginImported: '已导入并启用：', pluginExists: '同名插件已存在，要用新版本覆盖吗？\n（现有设置会保留）',
    pluginSaveFailed: '设置保存失败：',
    pluginRemoved: '已删除插件：', pluginImportFailed: '导入失败：',
    pluginRemoveConfirm: '确定删除这个插件吗？它的数据与设置也会一并删除。',
    pluginNoSettings: '这个插件没有设置项。',
    pluginErrorLabel: '插件加载失败：', pluginRuntimeError: '插件运行出错：',
    pluginOpenFolderDone: '插件目录：', pluginOpenFolderFail: '无法打开插件目录：',
    pluginMissingFolder: '插件目录里存在无法读取的插件（缺 plugin.json 或入口文件），已折叠显示。',
    pluginSettingsSection: '插件设置',
    pluginErrBadId: '插件 id 不合法', pluginErrBadManifest: 'plugin.json 格式不正确',
    pluginErrManifestMissing: '缺少 plugin.json', pluginErrMainMissing: '缺少入口文件',
    pluginErrNoHooks: '没有声明任何可用钩子', pluginErrApiTooNew: '插件要求的接口版本高于当前应用',
    pluginErrTooLarge: '插件体积超过上限', pluginErrBadEntry: '插件包里有非法路径',
    pluginErrFileTooLarge: '插件包里有超大文件', pluginErrExists: '同名插件已存在',
    pluginErrIsPluginsDir: '不能把插件目录本身当作插件导入',
    pluginErrZipMissing: '当前版本不支持导入压缩包，请把插件解压后改用「导入文件夹…」',
    // [v1.0.5.4] 定时自动校准

    autoAdjust: '定时自动校准',
    autoInterval: '调整间隔', autoAmount: '每次调整',
    autoDirAhead: '提前', autoDirBehind: '延后',
    unitSecond: '秒', unitMinute: '分钟', unitHour: '小时',
    autoOff: '未开启定时自动校准',
    autoZeroAmount: '每次调整量为 0，不会产生变化',
    autoSummary: '已累计 {delta} · 每 {interval}{dir} {amount} · 下次调整还有 {left}',
    autoClamped: '已累计 {delta}（已达上限 {cap}）',
    autoResetAccum: '重置累积量',
    autoHint: '按固定间隔自动叠加提前/延后量，补偿走时误差；改动设置会重新计时，不会跳变',
    // [v1.0.5.6] 局域网只读镜像
    navLan: '局域网',
    lanIntro: '手机和这台电脑连上同一个 Wi-Fi 后，用手机浏览器打开下面的地址，就能看到这块时钟（外观跟随当前设置）。手机端只能看，改不了任何设置，也看不到你的闹钟。',
    lanEnable: '在局域网上共享时钟',
    lanEnableHint: '开启后会占用一个本地端口供同一网络内的设备访问；关闭后手机上的地址立刻打不开。',
    lanPort: '端口',
    lanPortHint: '被占用时会自动顺延到下一个可用端口。',
    lanStatusOff: '未开启共享',
    lanStatusRunning: '正在共享 · 端口 {port} · 访问码已生效',
    lanStatusRunningShifted: '正在共享 · 端口 {port}（{want} 被占用，已顺延）· 访问码已生效',
    lanStatusRequests: '已响应 {n} 次请求',
    lanStatusError: '启动失败：{msg}',
    lanStatusStarting: '正在启动…',
    lanErrPortInUse: '端口被占用（已试过后续端口）',
    lanErrPortDenied: '端口被系统拒绝，换个端口试试',
    lanErrListenFailed: '无法监听，请检查系统网络设置',
    lanErrPageMissing: '手机端页面文件缺失，请重新安装应用',
    lanQrHint: '用手机相机或微信扫一扫',
    lanAddresses: '访问地址',
    lanNoAddress: '没检测到可用的内网地址（电脑可能没连 Wi-Fi 或网线）。',
    lanCopy: '复制地址',
    lanCopied: '已复制到剪贴板',
    lanCopyFail: '复制失败，请手动选中地址复制',
    lanPreview: '在本机浏览器打开',
    lanNewToken: '更换访问码',
    lanTokenConfirm: '更换访问码后，之前分享出去的链接会立刻失效（手机需要重新扫码）。确定继续吗？',
    // [v1.0.5.6] 访问方式三选一
    lanAuthMode: '访问方式',
    lanAuthRandom: '随机访问码（推荐）',
    lanAuthFixed: '自定义访问码',
    lanAuthNone: '不需要访问码',
    lanCodeLabel: '自定义访问码',
    lanCodeHint: '4–32 位，只能用小写字母、数字、- 和 _（会自动转小写）。示例：my-clock、home_2026。',
    lanCodeInvalid: '这个访问码不合法（需 4–32 位，只能用 a-z 0-9 - _），当前暂时用随机码顶替 —— 先改好它，或切回「随机访问码」。',
    lanCurrentCode: '访问码',
    lanCopyCode: '复制访问码',
    lanHintRandom: '地址里那 6 位短码就是访问码：同一网络下，不知道码就打不开。点「更换访问码」可让旧链接立刻失效。',
    lanHintFixed: '地址里就是你自己设的访问码。改一次，之前分享出去的链接立刻失效。',
    lanHintNone: '当前不需要访问码：同一网络下任何设备都能打开这个页面，也能添加/管理倒计时。其余仍是只读的 —— 不会泄露闹钟、窗口位置或文件路径。',
    lanCountdownHint: '手机端可以添加、编辑、暂停、继续、重新计时和取消倒计时（点底部胶囊进全屏倒计时，长按胶囊开抽屉）；配置、闹钟和窗口位置始终只读。手机端到点时会自己响铃提醒，那个开关在手机抽屉里（喇叭按钮），与桌面端的声音设置互不影响。在时钟上长按约半秒，可调手机端自己的字号。',
    countdownDefaultMinutes: '新建时的默认时长',
    countdownDefaultHint: '桌面编辑窗与手机端新建倒计时都用这个时长（1–1440 分钟）。',
    unitMinutes: '分钟',
    lanWarnNone: '无码模式建议只在可信的家庭 Wi-Fi 下使用。',
    lanWarnFixed: '自定义码越短越好记，但也越好猜 —— 家用 Wi-Fi 够用，公用网络建议用随机码。',
    lanFirewallHint: '连不上时先查两件事：① 手机和电脑是否在同一个 Wi-Fi；② Windows 防火墙是否拦住了这个端口（首次开启时若弹出提示，勾选「专用网络」允许即可；被判定为「公用网络」时会默认拦截）。',
  },
  en: {
    settingsTitle: 'Clock Settings', settingsHeader: 'Clock Settings',
    secAppearance: '--- Appearance ---', secDate: '--- Date ---', secAnimation: '--- Animation ---', secTime: '--- Time ---', secPosition: '--- Position ---', secSystem: '--- System ---',
    textColor: 'Text Color', autoColor: 'Auto-switch black/white (day/night)',
    bgColor: 'Background', alpha: 'Opacity',
    fontFamily: 'Font', customFont: 'Custom...',
    fontSize: 'Font Size', infoScale: 'Date/TZ size ratio', animSpeed: 'Anim Duration', animType: 'Animation',
    animSlideUp: 'Slide Up', animSlideDown: 'Slide Down', animFade: 'Fade',
    animShrink: 'Shrink', animExpand: 'Expand', animFlip3d: '3D Flip', animNone: 'None',
    // [v1.0.5.4] Flip / Scale families with direction
    animFlip: 'Flip', animScale: 'Scale',
    animFlipDir: 'Flip Direction', animScaleDir: 'Scale Direction',
    flipDirUp: 'Slide up (old digit exits upward)', flipDirDown: 'Slide down (old digit exits downward)',
    scaleDirShrink: 'Shrink (old digit shrinks away)', scaleDirGrow: 'Grow (old digit grows away)',
    // [v1.0.5.7] Digit animation easing
    animEase: 'Easing', easeDefault: 'Spring (default)', easeLinear: 'Linear',
    easeIn: 'Ease In', easeOut: 'Ease Out', easeInOut: 'Ease In-Out',
    staggerDelay: 'Stagger Delay', staggerDir: 'Stagger Direction', staggerLTR: 'Left to Right', staggerRTL: 'Right to Left',
    blurEnabled: 'Add Blur', blurDuration: 'Blur Duration', blurStrength: 'Blur Strength',
    scaleInEnabled: 'Scale-in', scaleInFactor: 'Start Size',
    showSeconds: 'Show Seconds',
    showDate: 'Show Date', showWeekday: 'Show Weekday', datePosition: 'Date Position',
    dateAbove: 'Above', dateBelow: 'Below',
    secTZ: '--- Time Zones ---', tzAdd: 'Add', tzRemove: 'X', tzHint: 'Max 2 time zones',
    position: 'Window Position', posTL: 'Top-Left', posTR: 'Top-Right', posCenter: 'Center',
    posBL: 'Bottom-Left', posBR: 'Bottom-Right', posCustom: 'Custom', applyPos: 'Apply',
    layerMode: 'Layer Mode', layerTop: 'Always on Top', layerNormal: 'Normal',
    autoStart: 'Auto Start on Boot', silentStart: 'Silent Start',
    silentStartHint: 'Start without showing the clock window — stays in the system tray; click the tray icon to show it anytime.',
    language: 'Language', langZh: 'Chinese', langEn: 'English',
    autoStartFail: 'Failed to set auto-start: ', permissionDenied: 'Permission denied',
    passthrough: 'Mouse passthrough (entire window)', passthroughWarn: 'When enabled, you cannot drag the window to move it.',
    secAlarm: '--- Alarm ---',
    alarmAdd: '+ Add Alarm', alarmEdit: 'Edit', alarmDelete: 'Delete',
    alarmRepeatNone: 'Once', alarmRepeatDays: 'Repeat', alarmDisabled: 'Disabled',
    dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    alarmSounds: { beep: 'Beep', chime: 'Chime', alarm: 'Alarm', none: 'None' },
    confirmDelete: 'Are you sure you want to delete "{{name}}"?',
    snoozeLabel: 'Snooze',
    alarmAdvanced: '▶ Advanced', alarmSoundDuration: 'Max sound duration',
    alarmFlash: 'Flash on alarm',
    alarmAutoShow: 'Auto-show window on alarm', alarmAutoPassthrough: 'Auto-disable passthrough on alarm',
    alarmAutoTop: 'Auto-force always-on-top on alarm',
    // [v1.0.5.7] Countdown
    navCountdown: 'Countdown',
    countdownAdd: '+ Add Countdown', countdownEdit: 'Edit', countdownDelete: 'Delete',
    countdownEmpty: 'No countdowns yet. Click below to add one.',
    countdownAdvanced: '▶ Advanced',
    countdownSound: 'Alert sound', countdownSoundHint: 'Used as the default sound for new countdowns; each countdown can override it in its editor.',
    countdownShowInInfoBar: 'Show countdown on the clock',
    soundBeep: 'Beep', soundChime: 'Chime', soundAlarm: 'Alarm', soundNone: 'None',
    cdPause: 'Pause', cdResume: 'Resume', cdRestart: 'Restart',
    cdRunning: 'Running', cdPaused: 'Paused', cdRinging: '⏳ Ringing',
    cdRemaining: 'Left', cdTotal: 'Duration',
    cdConfirmDelete: 'Delete countdown "{{name}}"?',
    secData: '--- Data Management ---',
    deleteDataDesc: 'Delete all saved data (config.json and alarms.json). The app will reset to factory state. This action is IRREVERSIBLE!',
    deleteDataBtn: '🗑️ Delete All Saved Data',
    confirmDeleteData: 'Delete all saved data?\n\nThis will delete ALL configuration and alarm data. This action is IRREVERSIBLE!\n\nThe app will restart to complete the reset.',
    deleteDataSuccess: 'Data deleted. App is restarting...',
    // [v1.0.5.3] Preferences export / import
    dataTransferDesc: 'Export/import preferences: the exported file contains all settings and alarms. Save it anywhere (USB drive, cloud folder) and import it to restore after a reinstall or on a new machine.',
    exportDataBtn: '📤 Export Preferences…',
    importDataBtn: '📥 Import Preferences…',
    exportSuccess: 'Exported to: ',
    exportFailed: 'Export failed: ',
    importConfirm: 'Importing will overwrite ALL current preferences and alarms, then restart the app. Continue?',
    importSuccess: 'Imported. Restarting...',
    importFailed: 'Import failed: ',
    importInvalidJson: 'Not a valid JSON file. Please pick a backup exported by this app.',
    importInvalidFormat: 'Invalid file format. Please pick a backup exported by this app.',
    // [v1.0.5] Countdown / status
    alarmRinging: '🔔 Ringing',
    alarmRetrying: '⏰ Snoozing',
    alarmAboutToRing: 'About to ring',
    countdownDays: 'Reminder in {d}d {h}h {m}m',
    countdownHours: 'Reminder in {h}h {m}m',
    countdownMins: 'Reminder in {m}m',
    // [v1.0.5] Settings UI
    secSettingsUI: '--- Settings UI ---',
    settingsFontSize: 'Settings Font Size',
    fontXs: 'XS', fontSm: 'S', fontMd: 'M', fontLg: 'L', fontXl: 'XL',
    // [v1.0.5.5] Custom titlebar buttons
    winMinimize: 'Minimize', winMaximize: 'Maximize', winClose: 'Close',
    // [v1.0.5] Mode switch + Lights Off
    secMode: '--- Mode ---',
    modeLabel: 'Mode',
    modeNormal: 'Normal', modeEducation: 'Education',
    lightsOff: 'Lights Off (fullscreen solid background)',
    lightsOffDisplay: 'Lights Off Display', displayClock: 'Display with Clock', displayPrimary: 'Primary Display', displayAll: 'All Displays',
    lightsOffOn: 'Lights Off is ON',
    lightsOffFail: 'Failed to enable Lights Off: ',
    // [v1.0.5.1] Sidebar navigation
    navMode: 'Mode', navAppearance: 'Appearance', navAnimation: 'Animation', navTime: 'Time',
    navAlarm: 'Alarm', navPosition: 'Position', navSystem: 'System', navData: 'Data',
    // [v1.0.5.3] 12-hour clock
    hourFormat: 'Hour Format', hourFormatAuto: 'Follow system', hourFormat24: '24-hour', hourFormat12: '12-hour',
    ampmCorner: 'AM/PM Position',
    cornerTopRight: 'Top right', cornerTopLeft: 'Top left', cornerBottomRight: 'Bottom right', cornerBottomLeft: 'Bottom left',
    // [v1.0.5.4] Time calibration + About
    timeCalib: 'Time Calibration',
    calibAhead: 'Ahead (faster than system)', calibBehind: 'Behind (slower than system)',
    calibAmount: 'Offset', calibSec: 's', calibMs: 'ms', calibReset: 'Reset',
    calibOff: 'Not calibrated (follows system time)',
    calibSummaryFast: 'Current: {v} ahead of system time',
    calibSummarySlow: 'Current: {v} behind system time',
    navAbout: 'About',
    aboutTagline: 'A deeply customizable desktop flip clock',
    aboutAuthors: 'Authors', aboutFoot: 'Built with Electron · Thanks for using',
    aboutVersion: 'Version',
    // [v1.0.5.5] Plugins
    navPlugins: 'Plugins',
    pluginIntro: 'Plugins can add content to the Lights Off board, add text to the clock info bar, and restyle this settings window. Plugins holding a UI permission can also edit text and styles inside those two windows (host elements are never deleted, and every change is restored on unload). Plugin code runs in a restricted sandbox with only the host API available.',
    pluginImportBtn: '📦 Import plugin…', pluginImportFolderBtn: 'Import folder…', pluginFolderBtn: 'Open plugins folder',
    pluginEmpty: 'No plugins installed yet. Use the buttons above to import a .dcplugin / .zip package or a folder.',
    pluginSettingsBtn: 'Settings', pluginReloadBtn: 'Reload', pluginDeleteBtn: 'Delete',
    pluginEnable: 'Enable', pluginEnabled: 'Enabled', pluginDisabled: 'Disabled',
    pluginGrantTitle: 'This plugin requests extra permissions:',
    pluginGrantAsk: '\n\nContinue only if you trust the source. Enable it?',
    pluginGrantUiWarn: '\n\n⚠️ It edits text and styles inside host windows (host elements are never deleted, and changes are restored on unload). If the UI ever breaks, use Safe Mode from the tray menu to disable all plugins at once.',
    pluginPermStorage: 'read/write its own data', pluginPermNet: 'network access (https)',
    pluginPermUiClock: 'edit clock window content', pluginPermUiSettings: 'edit settings window content', pluginPermUiLightsBg: 'control the Lights Off board background',
    pluginPermMic: 'use the microphone',
    pluginHookLightsOff: 'Lights Off board', pluginHookInfoBar: 'Clock info bar', pluginHookSettingsTheme: 'Settings theme',
    pluginSafeText: 'Safe mode: all plugins are paused, clock and settings are back to their original state. Leave safe mode once you have checked the plugin.',
    pluginSafeExit: 'Leave safe mode & restart', pluginSafeBadge: 'paused by safe mode',
    pluginSafeConfirm: 'Leaving safe mode restarts the app. Continue?', pluginSafeOn: 'Safe mode off, restarting…',
    pluginRuntimeDenied: 'Denied, missing permission: ', pluginRuntimeProtected: 'This element is protected and cannot be hidden or removed',
    pluginRuntimeNoUi: 'This window does not allow host element editing (Lights Off only exposes the background)',
    pluginImported: 'Imported and enabled: ', pluginExists: 'A plugin with the same id already exists. Overwrite it with the new version?\n(Existing settings are kept)',
    pluginSaveFailed: 'Failed to save setting: ',
    pluginRemoved: 'Plugin removed: ', pluginImportFailed: 'Import failed: ',
    pluginRemoveConfirm: 'Delete this plugin? Its data and settings will be removed too.',
    pluginNoSettings: 'This plugin has no settings.',
    pluginErrorLabel: 'Plugin failed to load: ', pluginRuntimeError: 'Plugin runtime error: ',
    pluginOpenFolderDone: 'Plugins folder: ', pluginOpenFolderFail: 'Could not open the plugins folder: ',
    pluginMissingFolder: 'Some folders in the plugins directory are unreadable (missing plugin.json or entry file); they are collapsed.',
    pluginSettingsSection: 'Plugin settings',
    pluginErrBadId: 'Invalid plugin id', pluginErrBadManifest: 'Malformed plugin.json',
    pluginErrManifestMissing: 'plugin.json is missing', pluginErrMainMissing: 'Entry file is missing',
    pluginErrNoHooks: 'No usable hooks declared', pluginErrApiTooNew: 'Plugin needs a newer host API',
    pluginErrTooLarge: 'Plugin exceeds the size limit', pluginErrBadEntry: 'Illegal path inside the package',
    pluginErrFileTooLarge: 'A file inside the package is too large', pluginErrExists: 'A plugin with the same id already exists',
    pluginErrIsPluginsDir: 'You cannot import the plugins folder itself',
    pluginErrZipMissing: 'This build cannot import archives — unzip the plugin and use “Import folder…” instead',
    // [v1.0.5.4] Scheduled auto-calibration
    autoAdjust: 'Scheduled auto-calibration',
    autoInterval: 'Interval', autoAmount: 'Each step',
    autoDirAhead: 'Advance', autoDirBehind: 'Delay',
    unitSecond: 's', unitMinute: 'min', unitHour: 'h',
    autoOff: 'Scheduled auto-calibration is off',
    autoZeroAmount: 'Step is 0, nothing will change',
    autoSummary: 'Accumulated {delta} · {dir} {amount} every {interval} · next in {left}',
    autoClamped: 'Accumulated {delta} (capped at {cap})',
    autoResetAccum: 'Reset accumulated',
    autoHint: 'Adds a fixed advance/delay every interval to compensate drift. Changing settings re-anchors without jumping.',
    // [v1.0.5.6] LAN read-only mirror
    navLan: 'LAN',
    lanIntro: 'Connect your phone to the same Wi-Fi, then open the address below in the phone browser to see this clock (it follows your current settings). The phone view is read-only: it cannot change anything, and it never sees your alarms.',
    lanEnable: 'Share the clock on the local network',
    lanEnableHint: 'Enabling occupies a local port for devices on the same network. Turning it off makes the address stop working immediately.',
    lanPort: 'Port',
    lanPortHint: 'If the port is taken, the next free one is used automatically.',
    lanStatusOff: 'Not sharing',
    lanStatusRunning: 'Sharing · port {port} · access code active',
    lanStatusRunningShifted: 'Sharing · port {port} ({want} was taken, shifted) · access code active',
    lanStatusRequests: '{n} requests served',
    lanStatusError: 'Failed to start: {msg}',
    lanStatusStarting: 'Starting…',
    lanErrPortInUse: 'the port is in use (the following ports were tried too)',
    lanErrPortDenied: 'the port was refused by the system, try another one',
    lanErrListenFailed: 'cannot listen, check your system network settings',
    lanErrPageMissing: 'the phone page file is missing, please reinstall the app',
    lanQrHint: 'Scan with your phone camera',
    lanAddresses: 'Addresses',
    lanNoAddress: 'No usable LAN address detected (this computer may be offline).',
    lanCopy: 'Copy address',
    lanCopied: 'Copied to clipboard',
    lanCopyFail: 'Copy failed, please select the address manually',
    lanPreview: 'Open in this computer\'s browser',
    lanNewToken: 'New access code',
    lanTokenConfirm: 'Generating a new access code invalidates any link you shared before (the phone must scan again). Continue?',
    // [v1.0.5.6] access mode (three options)
    lanAuthMode: 'Access',
    lanAuthRandom: 'Random code (recommended)',
    lanAuthFixed: 'Custom code',
    lanAuthNone: 'No access code',
    lanCodeLabel: 'Custom access code',
    lanCodeHint: '4-32 characters, lowercase letters, digits, - and _ only (converted to lowercase automatically). e.g. my-clock, home_2026.',
    lanCodeInvalid: 'That access code is not valid (needs 4-32 chars from a-z 0-9 - _). A random code is being used for now - fix it or switch back to "Random code".',
    lanCurrentCode: 'Access code',
    lanCopyCode: 'Copy code',
    lanHintRandom: 'The 6-character code in the address is the access code: on the same network, nobody can open the clock without it. "New access code" invalidates old links immediately.',
    lanHintFixed: 'The address contains the access code you chose. Changing it invalidates any link you shared before.',
    lanHintNone: 'No access code is required: any device on the same network can open this page and manage countdowns. Everything else stays read-only - alarms, window position and file paths are never exposed.',
    lanCountdownHint: 'From the phone you can add, edit, pause, resume, restart and cancel countdowns (tap the bottom pill for a full-screen countdown, long-press it for the sheet). Configuration, alarms and window position always stay read-only. The phone also rings by itself when a countdown hits zero - that switch lives in the phone\'s own sheet (the bell button) and is independent of the desktop sound setting. Long-press the clock to size it for that phone.',
    countdownDefaultMinutes: 'Default duration for new countdowns',
    countdownDefaultHint: 'Used by both the desktop editor and the phone page when creating a countdown (1–1440 minutes).',
    unitMinutes: 'min',
    lanWarnNone: 'Use no-code mode only on a Wi-Fi network you trust.',
    lanWarnFixed: 'A short custom code is easy to remember but also easy to guess - fine at home, use a random code on public networks.',
    lanFirewallHint: 'If the phone cannot connect, check two things: (1) the phone and this computer are on the same Wi-Fi; (2) whether Windows Firewall blocks the port (allow it for "Private networks" when prompted; networks classified as "Public" are blocked by default).',
  },
};

const $ = id => document.getElementById(id);
const els = {
  text_color: $('text-color'), auto_color: $('auto-color'),
  bg_color: $('bg-color'), bg_alpha: $('bg-alpha'), bg_alpha_label: $('bg-alpha-label'),
  font_select: $('font-select'), font_custom: $('font-custom'),
  font_size: $('font-size'), font_size_label: $('font-size-label'),
  info_scale: $('info-scale'), info_scale_label: $('info-scale-label'),
  anim_speed: $('anim-speed'), anim_speed_label: $('anim-speed-label'),
  anim_type: $('anim-type'),
  anim_ease: $('anim-ease'), // [v1.0.5.7] 动画节奏
  // [v1.0.5.4] 翻转/缩放 方向选择
  anim_flip_dir: $('anim-flip-dir'),
  anim_flip_dir_row: document.getElementById('anim-flip-dir-row'),
  anim_scale_dir: $('anim-scale-dir'),
  anim_scale_dir_row: document.getElementById('anim-scale-dir-row'),
  date_position_row: document.getElementById('date-position-row'),
  stagger_delay: $('stagger-delay'), stagger_delay_label: $('stagger-delay-label'),
  stagger_dir: $('stagger-dir'),
  blur_controls: document.getElementById('blur-controls'),
  blur_enabled: $('blur-enabled'),
  blur_detail: document.getElementById('blur-detail'),
  blur_duration: $('blur-duration'), blur_duration_label: $('blur-duration-label'),
  blur_strength: $('blur-strength'), blur_strength_label: $('blur-strength-label'),
  scale_controls: document.getElementById('scale-controls'),
  scale_in_enabled: $('scale-in-enabled'),
  scale_detail: document.getElementById('scale-detail'),
  scale_factor: $('scale-factor'), scale_factor_label: $('scale-factor-label'),
  show_seconds: $('show-seconds'), show_date: $('show-date'), show_weekday: $('show-weekday'), date_position: $('date-position'),
  layer_mode: $('layer-mode'), auto_start: $('auto-start'), silent_start: $('silent-start'), language_select: $('language-select'),
  pos_x: $('pos-x'), pos_y: $('pos-y'), apply_pos: $('apply-pos'),
  pos_buttons: document.querySelectorAll('.position-buttons button'),
  custom_pos: document.getElementById('custom-pos-controls'),
  tz_list: document.getElementById('tz-list'), tz_label: document.getElementById('tz-label-input'),
  tz_offset: document.getElementById('tz-offset-input'), tz_add_btn: document.getElementById('tz-add-btn'),
  tz_hint: document.getElementById('tz-hint'),
  passthrough_switch: document.getElementById('passthrough-switch'),
  settings_font_size: document.getElementById('settings-font-size'),
  hour_format_select: document.getElementById('hour-format-select'),
  ampm_corner_select: document.getElementById('ampm-corner-select'),
  ampm_corner_row: document.getElementById('ampm-corner-row'),
  // [v1.0.5.4] 时间校准 + 关于
  calib_dir: document.getElementById('calib-dir-select'),
  calib_sec: document.getElementById('calib-sec'),
  calib_ms: document.getElementById('calib-ms'),
  calib_reset_btn: document.getElementById('calib-reset-btn'),
  calib_summary: document.getElementById('calib-summary'),
  // [v1.0.5.4] 定时自动校准
  auto_adjust_switch: document.getElementById('auto-adjust-switch'),
  auto_interval: document.getElementById('auto-interval'),
  auto_interval_unit: document.getElementById('auto-interval-unit'),
  auto_dir: document.getElementById('auto-dir'),
  auto_sec: document.getElementById('auto-sec'),
  auto_ms: document.getElementById('auto-ms'),
  auto_summary: document.getElementById('auto-summary'),
  auto_reset_btn: document.getElementById('auto-reset-btn'),
  about_version: document.getElementById('about-version'),
  about_authors: document.getElementById('about-authors'),
  about_gitee: document.getElementById('about-gitee'),
  about_github: document.getElementById('about-github'),
  alarm_list: document.getElementById('alarm-list'),
  alarm_add_btn: document.getElementById('alarm-add-btn'),
  alarm_advanced_toggle: document.getElementById('alarm-advanced-toggle'),
  alarm_advanced_content: document.getElementById('alarm-advanced-content'),
  alarm_sound_duration: document.getElementById('alarm-sound-duration'),
  alarm_sound_duration_label: document.getElementById('alarm-sound-duration-label'),
  alarm_flash: document.getElementById('alarm-flash'),
  alarm_auto_show: document.getElementById('alarm-auto-show'),
  alarm_auto_passthrough: document.getElementById('alarm-auto-passthrough'),
  alarm_auto_top: document.getElementById('alarm-auto-top'),
  // [v1.0.5.7] 倒计时
  countdown_list: document.getElementById('countdown-list'),
  countdown_add_btn: document.getElementById('countdown-add-btn'),
  countdown_advanced_toggle: document.getElementById('countdown-advanced-toggle'),
  countdown_advanced_content: document.getElementById('countdown-advanced-content'),
  countdown_sound: document.getElementById('countdown-sound'),
  countdown_show_info: document.getElementById('countdown-show-info'),
  countdown_default_minutes: document.getElementById('countdown-default-minutes'),
  delete_data_btn: document.getElementById('delete-data-btn'),
  export_data_btn: document.getElementById('export-data-btn'),
  import_data_btn: document.getElementById('import-data-btn'),
  // [v1.0.5.5] 插件
  plugin_import_btn: document.getElementById('plugin-import-btn'),
  plugin_import_folder_btn: document.getElementById('plugin-import-folder-btn'),
  plugin_folder_btn: document.getElementById('plugin-folder-btn'),
  plugin_status: document.getElementById('plugin-status'),
  plugin_empty: document.getElementById('plugin-empty'),
  plugin_list: document.getElementById('plugin-list'),
  plugin_safe_banner: document.getElementById('plugin-safe-banner'),
  plugin_safe_exit: document.getElementById('plugin-safe-exit'),
  data_transfer_status: document.getElementById('data-transfer-status'),
  mode_select: document.getElementById('mode-select'),
  lights_off_switch: document.getElementById('lights-off-switch'),
  lights_off_display: document.getElementById('lights-off-display-select'),
  // [v1.0.5.6] 局域网只读镜像
  lan_enabled: document.getElementById('lan-enabled'),
  lan_port: document.getElementById('lan-port'),
  lan_auth_mode: document.getElementById('lan-auth-mode'),
  lan_code_row: document.getElementById('lan-code-row'),
  lan_code: document.getElementById('lan-code'),
  lan_code_error: document.getElementById('lan-code-error'),
  lan_auth_note: document.getElementById('lan-auth-note'),
  lan_auth_warn: document.getElementById('lan-auth-warn'),
  lan_code_line: document.getElementById('lan-code-line'),
  lan_code_value: document.getElementById('lan-code-value'),
  lan_code_copy: document.getElementById('lan-code-copy'),
  lan_status: document.getElementById('lan-status'),
  lan_status_text: document.getElementById('lan-status-text'),
  lan_body: document.getElementById('lan-body'),
  lan_qr: document.getElementById('lan-qr'),
  lan_address_list: document.getElementById('lan-address-list'),
  lan_no_address: document.getElementById('lan-no-address'),
  lan_copy_btn: document.getElementById('lan-copy-btn'),
  lan_preview_btn: document.getElementById('lan-preview-btn'),
  lan_token_btn: document.getElementById('lan-token-btn'),
};

let config = {};
let currentLang = 'zh';
let alarmList = [];
let activeAlarmIds = { ringingId: null, retryIds: [] };

// [v1.0.5.4] 动画家族归一化：旧的 slide-up/slide-down/shrink/expand → 翻转/缩放 + 方向
const ANIM_LEGACY_MAP = { 'slide-up': ['flip', 'up'], 'slide-down': ['flip', 'down'], 'shrink': ['scale', 'shrink'], 'expand': ['scale', 'grow'] };
const ANIM_TYPES = ['flip', 'scale', 'fade', 'flip-3d', 'none'];
// [v1.0.5.7] 数字动画节奏。'default' = 不写 --anim-ease，各动画用自己的原曲线（老配置的迁移态）
const ANIM_EASES = ['default', 'linear', 'ease-in', 'ease-out', 'ease-in-out'];
function normalizeAnimConfig(c) {
  const hit = ANIM_LEGACY_MAP[c.animType];
  if (hit) {
    c.animType = hit[0];
    if (hit[0] === 'flip') c.animFlipDir = hit[1];
    else c.animScaleDir = hit[1];
  }
  if (ANIM_TYPES.indexOf(c.animType) < 0) c.animType = 'flip';
  if (c.animFlipDir !== 'up' && c.animFlipDir !== 'down') c.animFlipDir = 'up';
  if (c.animScaleDir !== 'shrink' && c.animScaleDir !== 'grow') c.animScaleDir = 'shrink';
  if (ANIM_EASES.indexOf(c.animEase) < 0) c.animEase = 'default';
  return c;
}

function syncAnimUI(){
  const at = els.anim_type.value;
  els.anim_speed.disabled = at === 'none';
  els.anim_ease.disabled = at === 'none'; // [v1.0.5.7] 没有动画时节奏无从谈起
  // 方向选择只在对应动画家族下出现
  if (els.anim_flip_dir_row) els.anim_flip_dir_row.classList.toggle('hidden', at !== 'flip');
  if (els.anim_scale_dir_row) els.anim_scale_dir_row.classList.toggle('hidden', at !== 'scale');
  // 「模糊」「由小放大滑入」是翻转的可选附加项，只服务翻转家族（避免残留在其它动画上）
  const canExtras = at === 'flip';
  els.blur_controls.classList.toggle('hidden', !canExtras);
  els.scale_controls.classList.toggle('hidden', !canExtras);
  if(canExtras && els.blur_enabled.checked){
    els.blur_detail.classList.remove('hidden');
    const maxV=parseInt(els.anim_speed.value,10);
    els.blur_duration.max=maxV;
    if(parseInt(els.blur_duration.value,10)>maxV){
      els.blur_duration.value=maxV;
      els.blur_duration_label.textContent=maxV;
      saveAndApply({blurDuration:maxV});
    }
  } else {
    els.blur_detail.classList.add('hidden');
  }
  if(canExtras && els.scale_in_enabled.checked){
    els.scale_detail.classList.remove('hidden');
  } else {
    els.scale_detail.classList.add('hidden');
  }
}
function rgbToHex(r,g,b){return '#'+[r,g,b].map(x=>{const h=x.toString(16);return h.length===1?'0'+h:h;}).join('');}
function buildBgColor() {
  const h = els.bg_color.value;
  return 'rgba('+parseInt(h.slice(1,3),16)+','+parseInt(h.slice(3,5),16)+','+parseInt(h.slice(5,7),16)+','+parseFloat(els.bg_alpha.value)+')';
}

function applyLanguage(lang) {
  currentLang = lang;
  const dict = LOCALE[lang] || LOCALE.zh;
  document.querySelectorAll('[data-lang]').forEach(el => {
    const key = el.dataset.lang;
    if (dict[key]) el.textContent = dict[key];
  });
  // [v1.0.5.5] 标题栏按钮的 tooltip（文案在 title 而不是文本节点上）
  document.querySelectorAll('[data-lang-title]').forEach(el => {
    const key = el.dataset.langTitle;
    if (dict[key]) el.title = dict[key];
  });
  document.title = dict.settingsTitle;
  syncCalibUI(); // [v1.0.5.4] 校准摘要文案随语言切换
  syncAutoAdjustUI(); // [v1.0.5.4] 自动校准摘要同理
  renderLanPanel(); // [v1.0.5.6] 局域网状态文案与地址列表也带语言
  renderAlarmList(); // re-render with new locale
  renderCountdownList(); // [v1.0.5.7] 倒计时列表文案（状态徽章/按钮）也带语言
}

function renderTZList() {
  const tzs = config.extraTimezones || [];
  els.tz_list.innerHTML = '';
  const dict = LOCALE[currentLang] || LOCALE.zh;
  tzs.forEach((tz, idx) => {
    const div = document.createElement('div');
    div.className = 'tz-item';
    const sign = (Number(tz.offset) || 0) >= 0 ? '+' : '';
    // [v1.0.5.7] tz.label 是自由文本（可从偏好备份导入），必须转义后再进 innerHTML
    div.innerHTML = '<span class="tz-label">'+escapeHtml(tz.label)+'</span><span class="tz-offset">UTC'+sign+(Number(tz.offset) || 0)+'</span><button class="tz-del-btn" data-idx="'+idx+'">'+dict.tzRemove+'</button>';
    els.tz_list.appendChild(div);
  });
  els.tz_list.querySelectorAll('.tz-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      saveAndApply({ extraTimezones: (config.extraTimezones || []).filter((_, i) => i !== idx) });
      renderTZList();
    });
  });
  const count = tzs.length;
  els.tz_hint.style.display = count >= 2 ? '' : 'none';
  els.tz_add_btn.disabled = count >= 2;
}

function renderAlarmList() {
  const dict = LOCALE[currentLang] || LOCALE.zh;
  els.alarm_list.innerHTML = '';
  syncDatePositionUI(); // [v1.0.5.4] 闹钟开关变化会影响「日期位置」是否该显示

  if (alarmList.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:16px;color:#666;font-size:13px;';
    empty.textContent = currentLang === 'zh' ? '暂无闹钟，点击下方按钮添加' : 'No alarms. Click below to add one.';
    els.alarm_list.appendChild(empty);
    return;
  }

  alarmList.forEach(alarm => {
    if (!alarm) return;
    const item = document.createElement('div');
    item.className = 'alarm-item';

    const time = String(alarm.hour).padStart(2, '0') + ':' + String(alarm.minute).padStart(2, '0');

    let meta = '';
    if (alarm.enabled === false) {
      meta = dict.alarmDisabled;
    } else if (alarm.repeat && Array.isArray(alarm.weekdays) && alarm.weekdays.length > 0) {
      // [v1.0.5.7] weekdays 必须是数组：手改/旧备份里的字符串会让 .map 抛错瘫掉整个闹钟列表
      const days = alarm.weekdays.map(d => dict.dayNames[d] || '').join(' ');
      const soundName = dict.alarmSounds[alarm.sound] || alarm.sound;
      const snoozeStr = buildSnoozeStr(alarm, dict);
      meta = dict.alarmRepeatDays + ': ' + days + ' · ' + soundName + (snoozeStr ? ' · ' + snoozeStr : '');
    } else {
      const soundName = dict.alarmSounds[alarm.sound] || alarm.sound;
      const snoozeStr = buildSnoozeStr(alarm, dict);
      meta = dict.alarmRepeatNone + ' · ' + soundName + (snoozeStr ? ' · ' + snoozeStr : '');
    }
    // [v1.0.5] 追加倒计时 / 状态
    meta += getAlarmStatusSuffix(alarm, new Date(), dict);

    const nameStr = alarm.name || '';

    const isActive = alarm.id === activeAlarmIds.ringingId || activeAlarmIds.retryIds.includes(alarm.id);
    const isEnabled = alarm.enabled !== false;

    // [v1.0.5.7] alarm.id 会拼进多个属性选择器（可随偏好备份导入任意文本），必须转义
    const idAttr = escapeHtml(String(alarm.id || ''));

    item.innerHTML =
      '<div class="alarm-toggle-col">' +
        '<label class="toggle-switch">' +
          '<input type="checkbox" class="alarm-toggle-input" data-id="' + idAttr + '"' + (isEnabled ? ' checked' : '') + '>' +
          '<span class="toggle-slider"></span>' +
        '</label>' +
      '</div>' +
      '<div class="alarm-time' + (isEnabled ? '' : ' disabled') + '">' + time + '</div>' +
      '<div class="alarm-info">' +
        '<div class="alarm-name">' + escapeHtml(nameStr) + '</div>' +
        '<div class="alarm-meta">' + escapeHtml(meta) + '</div>' +
      '</div>' +
      '<div class="alarm-actions">' +
        '<button class="alarm-edit-btn" data-id="' + idAttr + '"' + (isActive ? ' disabled' : '') + '>' + dict.alarmEdit + '</button>' +
        '<button class="alarm-del-btn" data-id="' + idAttr + '">' + dict.alarmDelete + '</button>' +
      '</div>';

    els.alarm_list.appendChild(item);
  });

  // Bind events
  els.alarm_list.querySelectorAll('.alarm-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.electronAPI.openAlarmEditor(btn.dataset.id);
    });
  });
  els.alarm_list.querySelectorAll('.alarm-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const alarm = alarmList.find(a => a.id === btn.dataset.id);
      if (!alarm) return;
      const confirmMsg = (dict.confirmDelete || '确定要删除吗？').replace('{{name}}', alarm.name || '');
      if (!confirm(confirmMsg)) return;
      await window.electronAPI.deleteAlarm(btn.dataset.id);
      // List will be refreshed via onAlarmsUpdated
    });
  });
  els.alarm_list.querySelectorAll('.alarm-toggle-input').forEach(input => {
    input.addEventListener('change', () => {
      window.electronAPI.toggleAlarm(input.dataset.id);
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ====== [v1.0.5.7] 倒计时面板 ======
// 列表只存「公开字段」（id/name/durationMs/remainingMs/state/endAt），剩余时间在这里
// 每秒本地倒扣 —— 主进程只在列表变更时推一次，不陪你每秒走 IPC。
let cdItems = [];
let cdRingingId = null;
let cdTickTimer = null;
const cdNodes = new Map(); // id -> { remain, bar, badge }

// 与 countdown.js 同口径：向上取整到秒 + 小时补零（宽度恒定，不会抖）
function cdFmt(ms) {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = n => (n < 10 ? '0' : '') + n;
  return h > 0 ? p(h) + ':' + p(m) + ':' + p(ss) : p(m) + ':' + p(ss);
}
// 用 Date.now()：endAt 是真实系统时刻，手动校准偏移只影响时钟显示
function cdRemain(item, nowMs) {
  if (!item) return 0;
  if (item.state === 'paused') return Math.max(0, Number(item.remainingMs) || 0);
  const t = item.endAt ? new Date(item.endAt).getTime() : NaN;
  if (!Number.isFinite(t)) return Math.max(0, Number(item.remainingMs) || 0);
  return Math.max(0, t - nowMs);
}
function cdStateLabel(item, dict) {
  if (item && item.id === cdRingingId) return { text: dict.cdRinging, cls: 'ringing' };
  if (item && item.state === 'paused') return { text: dict.cdPaused, cls: 'paused' };
  return { text: dict.cdRunning, cls: '' };
}

function tickCountdownList() {
  if (!cdNodes.size) return;
  const dict = LOCALE[currentLang] || LOCALE.zh;
  const nowMs = Date.now();
  cdItems.forEach(item => {
    if (!item) return;
    const n = cdNodes.get(item.id);
    if (!n) return;
    const left = cdRemain(item, nowMs);
    const txt = cdFmt(left);
    if (n.remain && n.remain.textContent !== txt) n.remain.textContent = txt;
    if (n.bar) {
      const pct = item.durationMs > 0 ? Math.max(0, Math.min(100, (left / item.durationMs) * 100)) : 0;
      const w = pct.toFixed(2) + '%';
      if (n.bar.style.width !== w) n.bar.style.width = w;
    }
    if (n.badge) {
      const st = cdStateLabel(item, dict);
      if (n.badge.textContent !== st.text) n.badge.textContent = st.text;
      const cls = 'cd-badge' + (st.cls ? ' ' + st.cls : '');
      if (n.badge.className !== cls) n.badge.className = cls;
    }
  });
}

function bindCountdownEvents(dict) {
  const q = sel => els.countdown_list.querySelectorAll(sel);
  q('.cd-pause-btn').forEach(b => b.addEventListener('click', () => window.electronAPI.countdownPause(b.dataset.id)));
  q('.cd-resume-btn').forEach(b => b.addEventListener('click', () => window.electronAPI.countdownResume(b.dataset.id)));
  q('.cd-restart-btn').forEach(b => b.addEventListener('click', () => window.electronAPI.countdownRestart(b.dataset.id)));
  q('.alarm-edit-btn').forEach(b => b.addEventListener('click', () => window.electronAPI.openCountdownEditor(b.dataset.id)));
  q('.alarm-del-btn').forEach(b => b.addEventListener('click', async () => {
    const item = cdItems.find(a => a && a.id === b.dataset.id);
    if (!item) return;
    const msg = (dict.cdConfirmDelete || 'Delete?').replace('{{name}}', item.name || '');
    if (!confirm(msg)) return;
    await window.electronAPI.countdownDelete(b.dataset.id);
    // 列表随后由 countdown-state 广播刷新
  }));
}

function renderCountdownList() {
  if (!els.countdown_list) return;
  const dict = LOCALE[currentLang] || LOCALE.zh;
  cdNodes.clear();
  els.countdown_list.innerHTML = '';

  if (!cdItems.length) {
    const empty = document.createElement('div');
    empty.id = 'countdown-empty';
    empty.textContent = dict.countdownEmpty;
    els.countdown_list.appendChild(empty);
    return;
  }

  const nowMs = Date.now();
  cdItems.forEach(item => {
    if (!item) return;
    const idAttr = escapeHtml(String(item.id || ''));
    const paused = item.state === 'paused';
    const left = cdRemain(item, nowMs);
    const pct = item.durationMs > 0 ? Math.max(0, Math.min(100, (left / item.durationMs) * 100)) : 0;
    const st = cdStateLabel(item, dict);

    const row = document.createElement('div');
    row.className = 'alarm-item' + (paused ? ' is-paused' : '');
    row.innerHTML =
      '<div class="alarm-time' + (paused ? ' disabled' : '') + '" data-role="remain">' + cdFmt(left) + '</div>' +
      '<div class="alarm-info">' +
        '<div class="alarm-name">' + escapeHtml(item.name || '') +
          '<span class="cd-badge' + (st.cls ? ' ' + st.cls : '') + '" data-role="badge">' + st.text + '</span>' +
        '</div>' +
        '<div class="alarm-meta">' + dict.cdTotal + ': ' + cdFmt(item.durationMs) + '</div>' +
        '<div class="cd-progress"><i data-role="bar" style="width:' + pct.toFixed(2) + '%"></i></div>' +
      '</div>' +
      '<div class="alarm-actions">' +
        (paused
          ? '<button class="cd-resume-btn" data-id="' + idAttr + '">' + dict.cdResume + '</button>'
          : '<button class="cd-pause-btn" data-id="' + idAttr + '">' + dict.cdPause + '</button>') +
        '<button class="cd-restart-btn" data-id="' + idAttr + '">' + dict.cdRestart + '</button>' +
        '<button class="alarm-edit-btn" data-id="' + idAttr + '">' + dict.countdownEdit + '</button>' +
        '<button class="alarm-del-btn" data-id="' + idAttr + '">' + dict.countdownDelete + '</button>' +
      '</div>';
    els.countdown_list.appendChild(row);
    cdNodes.set(item.id, {
      remain: row.querySelector('[data-role="remain"]'),
      bar: row.querySelector('[data-role="bar"]'),
      badge: row.querySelector('[data-role="badge"]'),
    });
  });

  bindCountdownEvents(dict);
  tickCountdownList();
}

function applyCountdownState(state) {
  cdItems = (state && Array.isArray(state.items)) ? state.items : [];
  cdRingingId = (state && state.ringingId) || null;
  renderCountdownList();
}

async function refreshCountdownPanel() {
  try {
    applyCountdownState(await window.electronAPI.countdownList());
  } catch (e) {
    applyCountdownState({ items: [] });
  }
}

// 高级设置里的两档偏好
function syncCountdownUI() {
  if (els.countdown_sound) els.countdown_sound.value = config.countdownSound || 'beep';
  if (els.countdown_show_info) els.countdown_show_info.checked = config.countdownShowInInfoBar !== false;
  if (els.countdown_default_minutes) {
    els.countdown_default_minutes.value = String(clampDefaultMinutes(config.countdownDefaultMinutes));
  }
}
// 1–1440 分钟：0 / 空 / 非法都回落到 5
function clampDefaultMinutes(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.min(1440, n);
}

function buildSnoozeStr(alarm, dict) {
  if (alarm.snoozeEnabled === false) return '';
  const h = alarm.snoozeHours || 0;
  const m = alarm.snoozeMinutes !== undefined ? alarm.snoozeMinutes : 5;
  const s = alarm.snoozeSeconds || 0;
  const isDefault = h === 0 && m === 5 && s === 0;
  let parts = [];
  if (h > 0) parts.push(h + 'h');
  if (m > 0) parts.push(m + 'm');
  if (s > 0) parts.push(s + 's');
  const timeStr = isDefault ? '' : parts.join(' ');
  const countStr = alarm.snoozeCount > 0 ? (dict.snoozeLabel || 'Snooze') + ' x' + alarm.snoozeCount : (dict.snoozeLabel || 'Snooze');
  if (timeStr) return countStr + ' ' + timeStr;
  return countStr;
}

// [v1.0.5] 计算闹钟倒计时/状态字符串（含前导 " · "）
function getAlarmStatusSuffix(alarm, now, dict) {
  // 正在响铃
  if (alarm.id === activeAlarmIds.ringingId) {
    return ' · ' + dict.alarmRinging;
  }
  // 稍后提醒中
  if (activeAlarmIds.retryIds.includes(alarm.id)) {
    return ' · ' + dict.alarmRetrying;
  }
  // 未启用 → 不附加
  if (alarm.enabled === false) return '';
  // 没有 nextTrigger → 不附加
  if (!alarm.nextTrigger) return '';
  const t = new Date(alarm.nextTrigger);
  if (isNaN(t.getTime())) return '';
  const diffMs = t.getTime() - now.getTime();
  // 已过期（正常情况不会发生，防御性处理）
  if (diffMs <= 0) return ' · ' + dict.alarmAboutToRing;
  const diffMin = Math.floor(diffMs / 60000);
  // 不到 1 分钟
  if (diffMin < 1) return ' · ' + dict.alarmAboutToRing;
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays > 0) {
    const remainingHours = Math.floor((diffMs % 86400000) / 3600000);
    const remainingMins = Math.floor((diffMs % 3600000) / 60000);
    return ' · ' + dict.countdownDays.replace('{d}', diffDays).replace('{h}', remainingHours).replace('{m}', remainingMins);
  } else if (diffHours > 0) {
    const remainingMins = Math.floor((diffMs % 3600000) / 60000);
    return ' · ' + dict.countdownHours.replace('{h}', diffHours).replace('{m}', remainingMins);
  } else {
    return ' · ' + dict.countdownMins.replace('{m}', diffMin);
  }
}

function syncUIFromConfig() {
  els.auto_color.checked = !!config.autoColor;
  els.text_color.value = config.color || '#ffffff';
  // [v1.0.5.7] bgColor 兜底：config.json 被手改 / 极旧配置里可能为 null，直接 .match() 会抛错瘫掉整个设置窗口
  const m = String(config.bgColor || '').match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (m) { els.bg_color.value = rgbToHex(+m[1],+m[2],+m[3]); els.bg_alpha.value = parseFloat(m[4]); }
  else { els.bg_color.value = '#000000'; els.bg_alpha.value = 0; }
  els.bg_alpha_label.textContent = Math.round(els.bg_alpha.value * 100) + '%';
  els.text_color.disabled=els.auto_color.checked;els.bg_color.disabled=els.auto_color.checked;
  const opts = Array.from(els.font_select.options).map(o => o.value);
  if (opts.includes(config.fontFamily)) { els.font_select.value = config.fontFamily; els.font_custom.classList.add('hidden'); }
  else { els.font_select.value = 'custom'; els.font_custom.classList.remove('hidden'); els.font_custom.value = config.fontFamily; }
  els.font_size.value = config.fontSize; els.font_size_label.textContent = config.fontSize;
  // [v1.0.5.7] infoScale 必须是数字：手改/导入的非数字会让 toFixed 抛错，
  // async init 中断 → 窗口能显示但所有控件全部失灵
  const infoScaleVal = Number.isFinite(Number(config.infoScale)) ? Number(config.infoScale) : 0.3;
  els.info_scale.value = infoScaleVal; els.info_scale_label.textContent = infoScaleVal.toFixed(2);
  els.anim_speed.value = config.animDuration || 350; els.anim_speed_label.textContent = config.animDuration || 350;
  normalizeAnimConfig(config);
  els.anim_type.value = config.animType;
  els.anim_ease.value = config.animEase; // [v1.0.5.7] normalizeAnimConfig 已兜底成合法档
  els.anim_flip_dir.value = config.animFlipDir;
  els.anim_scale_dir.value = config.animScaleDir;
  els.stagger_delay.value = config.staggerDelay || 0; els.stagger_delay_label.textContent = config.staggerDelay || 0;
  els.stagger_dir.value = config.staggerDirection || 'ltr';
  els.blur_enabled.checked = !!config.blurEnabled;
  els.blur_duration.value = config.blurDuration || 300; els.blur_duration_label.textContent = config.blurDuration || 300;
  els.blur_strength.value = config.blurStrength || 15; els.blur_strength_label.textContent = config.blurStrength || 15;
  els.scale_in_enabled.checked = !!config.scaleInEnabled;
  els.scale_factor.value = Math.round((config.scaleInFactor||0.3)*100);
  els.scale_factor_label.textContent = Math.round((config.scaleInFactor||0.3)*100);
  syncAnimUI();
  els.show_seconds.checked = config.showSeconds !== false;
  els.show_date.checked = config.showDate !== false;
  els.show_weekday.checked = config.showWeekday !== false;
  syncDatePositionUI(); // [v1.0.5.4]
  els.date_position.value = config.datePosition || 'below';
  // [v1.0.5.3] 时间制式 + AM/PM 角标
  els.hour_format_select.value = config.hourFormat || 'auto';
  els.ampm_corner_select.value = config.ampmCorner || 'top-right';
  syncHourFormatUI();
  // [v1.0.5.4] 时间校准回填（拆成 方向 + 秒 + 毫秒）
  const offMs = Number(config.timeOffsetMs) || 0;
  els.calib_dir.value = offMs < 0 ? 'behind' : 'ahead';
  els.calib_sec.value = Math.floor(Math.abs(offMs) / 1000);
  els.calib_ms.value = Math.abs(offMs) % 1000;
  syncCalibUI();
  // [v1.0.5.4] 定时自动校准回填
  els.auto_adjust_switch.checked = !!config.autoAdjustEnabled;
  const ivSec = Math.max(AUTO_MIN_INTERVAL_SEC, Number(config.autoAdjustIntervalSec) || 3600);
  // 按能被整除的最大单位回填，保证输入框里是个好看的整数
  let ivUnit = '1';
  if (ivSec % 3600 === 0) ivUnit = '3600';
  else if (ivSec % 60 === 0) ivUnit = '60';
  els.auto_interval_unit.value = ivUnit;
  els.auto_interval.value = ivSec / parseInt(ivUnit, 10);
  const autoAmt = Number(config.autoAdjustAmountMs) || 0;
  els.auto_dir.value = autoAmt < 0 ? 'behind' : 'ahead';
  els.auto_sec.value = Math.floor(Math.abs(autoAmt) / 1000);
  els.auto_ms.value = Math.abs(autoAmt) % 1000;
  syncAutoAdjustUI();
  els.layer_mode.value = config.layerMode || 'alwaysOnTop';
  els.auto_start.checked = !!config.autoStart;
  els.silent_start.checked = !!config.silentStart;
  syncSilentStartUI();
  els.language_select.value = config.language || 'zh';
  els.settings_font_size.value = config.settingsFontSize || 'md';
  applySettingsFontSize(config.settingsFontSize || 'md');
  els.passthrough_switch.checked = !!config.passthrough;
  // [v1.0.5.6] 局域网只读镜像（开关以配置为准：即便上次启动失败，配置仍是「开着」）
  if (els.lan_enabled) els.lan_enabled.checked = !!config.lanMirrorEnabled;
  if (els.lan_port) els.lan_port.value = config.lanMirrorPort || 8788;
  // [v1.0.5.6] 访问方式：白名单外的值一律落回 random（和服务侧的 normalizeAuthMode 一致）
  if (els.lan_auth_mode) {
    els.lan_auth_mode.value = ['random', 'fixed', 'none'].indexOf(config.lanMirrorAuthMode) >= 0
      ? config.lanMirrorAuthMode : 'random';
  }
  if (els.lan_code && !els.lan_code.value) els.lan_code.value = config.lanMirrorFixedCode || '';
  // [v1.0.5] 模式 + 关灯
  els.mode_select.value = config.mode || 'normal';
  els.lights_off_switch.checked = !!config.lightsOff;
  els.lights_off_display.value = config.lightsOffDisplay || 'clock';
  applyMode(config.mode || 'normal');
  applyLanguage(config.language || 'zh');
  els.pos_buttons.forEach(b => b.classList.toggle('active', b.dataset.pos === config.positionPreset));
  if (config.positionPreset === 'custom') {
    els.custom_pos.classList.remove('hidden'); els.pos_x.value = config.x; els.pos_y.value = config.y;
  } else { els.custom_pos.classList.add('hidden'); }
  renderTZList();

  // Alarm advanced settings
  const sd = config.alarmSoundDuration !== undefined ? config.alarmSoundDuration : 120;
  els.alarm_sound_duration.value = sd;
  els.alarm_sound_duration_label.textContent = sd;
  els.alarm_flash.checked = config.alarmFlash !== false;
  els.alarm_auto_show.checked = config.alarmAutoShow !== false;
  els.alarm_auto_passthrough.checked = config.alarmAutoPassthrough !== false;
  els.alarm_auto_top.checked = config.alarmAutoTop !== false;

  // [v1.0.5.7] Countdown 高级设置
  syncCountdownUI();

  // [v1.0.5.1] 恢复上次停留的面板（需在 applyMode 之后，以避开教育模式隐藏项）
  activatePanel(config.settingsTab || 'mode', false);
}

async function saveAndApply(nc) {
  const langChanged = nc.language && nc.language !== config.language;
  config = { ...config, ...nc };
  try { await window.electronAPI.saveConfig(config); } catch (e) {}
  window.electronAPI.notifyClockUpdate(config);
  if (langChanged) applyLanguage(config.language);
}

// [v1.0.5] 设置界面字体大小
function applySettingsFontSize(size) {
  document.body.classList.remove('settings-xs', 'settings-sm', 'settings-md', 'settings-lg', 'settings-xl');
  document.body.classList.add('settings-' + (size || 'md'));
}

// [v1.0.5.3] 12 小时制：auto 档按系统区域设置判断（hourCycle h11/h12 即 12 小时制）
function hourFormatIs12(fmt) {
  if (fmt === '12') return true;
  if (fmt === '24') return false;
  try {
    const o = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
    if (o.hourCycle) return o.hourCycle === 'h11' || o.hourCycle === 'h12';
  } catch (e) {}
  return false;
}

// 只有 12 小时制真正生效时，才显示「AM/PM 位置」这一项
function syncHourFormatUI() {
  if (!els.ampm_corner_row) return;
  els.ampm_corner_row.classList.toggle('hidden', !hourFormatIs12(els.hour_format_select.value));
}

// [v1.0.5.4] 「日期位置」只在信息栏确实有内容时才有意义：日期 / 星期 / 闹钟 全关就隐藏
// [v1.0.5.5] 静默自启动只在「开机自启动」开启时才有意义，否则置灰
function syncSilentStartUI() {
  if (!els.silent_start) return;
  const row = els.silent_start.closest('.setting-row');
  if (row) row.classList.toggle('is-disabled', !els.auto_start.checked);
}

function syncDatePositionUI() {
  if (!els.date_position_row) return;
  const hasAlarms = (alarmList || []).some(a => a && a.enabled !== false);
  const visible = hasAlarms || els.show_date.checked || els.show_weekday.checked;
  els.date_position_row.classList.toggle('hidden', !visible);
}

// [v1.0.5.4] 时间校准：正=调快，负=调慢；秒与毫秒合成毫秒数
function calibOffsetMs() {
  const sec = Math.max(0, Math.min(59, parseInt(els.calib_sec.value, 10) || 0));
  const ms = Math.max(0, Math.min(999, parseInt(els.calib_ms.value, 10) || 0));
  const total = sec * 1000 + ms;
  return els.calib_dir.value === 'behind' ? -total : total;
}

// 校准量实时摘要
function syncCalibUI() {
  if (!els.calib_summary) return;
  const dict = LOCALE[currentLang] || LOCALE.zh;
  const value = calibOffsetMs();
  const abs = Math.abs(value);
  if (abs === 0) {
    els.calib_summary.textContent = dict.calibOff;
    els.calib_summary.classList.remove('active');
    return;
  }
  const unit = currentLang === 'zh' ? ' 秒' : ' s';
  const template = value > 0 ? dict.calibSummaryFast : dict.calibSummarySlow;
  els.calib_summary.textContent = (template || '').replace('{v}', (abs / 1000).toFixed(3) + unit);
  els.calib_summary.classList.add('active');
}

// ====== [v1.0.5.4] 定时自动校准（与 renderer.js 同一套计算规则）======
const AUTO_MIN_INTERVAL_SEC = 5, AUTO_MAX_ABS_MS = 3600000; // 最小间隔 5 秒；累积上限 ±1 小时
function clampAuto(v) { return Math.max(-AUTO_MAX_ABS_MS, Math.min(AUTO_MAX_ABS_MS, v)); }

// 阶梯累积 = base + floor(已过间隔数) × 每次量；确定性计算，重启不丢，时钟回拨/未锚定按 0 步
function autoDeltaMsOf(c, nowMs) {
  if (!c || !c.autoAdjustEnabled) return 0;
  const interval = Math.max(AUTO_MIN_INTERVAL_SEC, Number(c.autoAdjustIntervalSec) || AUTO_MIN_INTERVAL_SEC) * 1000;
  const amount = Number(c.autoAdjustAmountMs) || 0;
  const base = Number(c.autoAdjustBaseMs) || 0;
  if (!amount) return clampAuto(base);
  const anchor = Number(c.autoAdjustAnchor) || nowMs;
  const steps = Math.floor(Math.max(0, nowMs - anchor) / interval);
  return clampAuto(base + steps * amount);
}

function fmtOffset(ms) {
  const sign = ms > 0 ? '+' : (ms < 0 ? '−' : '');
  return sign + (Math.abs(ms) / 1000).toFixed(3) + (currentLang === 'zh' ? ' 秒' : ' s');
}
function fmtInterval(sec) {
  const dict = LOCALE[currentLang] || LOCALE.zh;
  if (sec % 3600 === 0) return (sec / 3600) + ' ' + dict.unitHour;
  if (sec % 60 === 0) return (sec / 60) + ' ' + dict.unitMinute;
  return sec + ' ' + dict.unitSecond;
}
function fmtCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return (h > 0 ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
}

function readAutoIntervalSec() {
  const n = Math.max(1, Math.min(999, parseInt(els.auto_interval.value, 10) || 1));
  return n * (parseInt(els.auto_interval_unit.value, 10) || 60);
}
function readAutoAmountMs() {
  const sec = Math.max(0, Math.min(59, parseInt(els.auto_sec.value, 10) || 0));
  const ms = Math.max(0, Math.min(999, parseInt(els.auto_ms.value, 10) || 0));
  const total = sec * 1000 + ms;
  return els.auto_dir.value === 'behind' ? -total : total;
}

// 保存并重新锚定：把「按旧配置算出的当前累积量」承接为 base —— 改设置既不跳变也不丢量；
// 关闭开关时改为归零（累积量随之失效，回到仅手动校准）
function commitAutoAdjust(patch) {
  const now = Date.now();
  const stillOn = patch.autoAdjustEnabled !== undefined ? !!patch.autoAdjustEnabled : !!config.autoAdjustEnabled;
  const carried = stillOn ? autoDeltaMsOf(config, now) : 0;
  saveAndApply({ autoAdjustBaseMs: carried, autoAdjustAnchor: stillOn ? now : 0, ...patch });
  syncAutoAdjustUI();
}

function syncAutoAdjustUI() {
  const on = !!config.autoAdjustEnabled;
  if (els.auto_adjust_switch) els.auto_adjust_switch.checked = on;
  document.querySelectorAll('.auto-only').forEach(el => el.classList.toggle('hidden', !on));
  if (!els.auto_summary) return;
  const dict = LOCALE[currentLang] || LOCALE.zh;
  if (!on) {
    els.auto_summary.textContent = dict.autoOff;
    els.auto_summary.classList.remove('active');
    return;
  }
  const now = Date.now();
  const amount = Number(config.autoAdjustAmountMs) || 0;
  const intervalSec = Math.max(AUTO_MIN_INTERVAL_SEC, Number(config.autoAdjustIntervalSec) || AUTO_MIN_INTERVAL_SEC);
  const delta = autoDeltaMsOf(config, now);
  if (!amount) {
    els.auto_summary.textContent = dict.autoZeroAmount;
    els.auto_summary.classList.remove('active');
    return;
  }
  if (Math.abs(delta) >= AUTO_MAX_ABS_MS) {
    els.auto_summary.textContent = (dict.autoClamped || '')
      .replace('{delta}', fmtOffset(delta)).replace('{cap}', fmtOffset(AUTO_MAX_ABS_MS));
    els.auto_summary.classList.add('active');
    return;
  }
  const periodMs = intervalSec * 1000;
  const anchor = Number(config.autoAdjustAnchor) || now;
  const leftMs = periodMs - ((((now - anchor) % periodMs) + periodMs) % periodMs);
  els.auto_summary.textContent = (dict.autoSummary || '')
    .replace('{delta}', fmtOffset(delta))
    .replace('{interval}', fmtInterval(intervalSec))
    .replace('{dir}', amount > 0 ? dict.autoDirAhead : dict.autoDirBehind)
    .replace('{amount}', fmtOffset(Math.abs(amount)))
    .replace('{left}', fmtCountdown(leftMs));
  els.auto_summary.classList.add('active');
}

// [v1.0.5] 模式切换（正常/教育）
const EDU_ANIM_DURATION = 500; // 教育模式固定动画时长
function applyMode(mode) {
  const isEdu = mode === 'education';
  document.body.classList.toggle('mode-education', isEdu);
  if (isEdu && els.anim_type) {
    // 教育模式强制淡入淡出，隐藏动画设置
    els.anim_type.value = 'fade';
    els.anim_speed.value = EDU_ANIM_DURATION;
    if (els.anim_speed_label) els.anim_speed_label.textContent = EDU_ANIM_DURATION;
  }
  ensureActivePanel();
}

// ====== [v1.0.5.1] 左侧导航 ======
const navItems = Array.from(document.querySelectorAll('.nav-item'));
const panels = Array.from(document.querySelectorAll('.panel'));

// 教育模式下被整块隐藏的导航项不可进入
function isNavAvailable(btn) {
  return !(document.body.classList.contains('mode-education') && btn.classList.contains('edu-hide'));
}

// 切换右侧面板；请求的面板不可用时回退到第一个可用面板
function activatePanel(id, persist) {
  let btn = navItems.find(b => b.dataset.panel === id);
  if (!btn || !isNavAvailable(btn)) btn = navItems.find(isNavAvailable);
  if (!btn) return;
  navItems.forEach(b => b.classList.toggle('active', b === btn));
  panels.forEach(p => p.classList.toggle('active', p.dataset.panel === btn.dataset.panel));
  const scroller = document.getElementById('settings-content');
  if (scroller) scroller.scrollTop = 0;
  // [v1.0.5.5] 进入插件分区时刷新插件列表（清单以主进程为准，避免显示过期状态）
  // 插件渲染逻辑在文件末尾的 IIFE 里，作用域不互通，这里走显式桥接
  if (btn.dataset.panel === 'plugins' && window.DCPlugins && typeof window.DCPlugins.render === 'function') window.DCPlugins.render();
  // [v1.0.5.6] 进入局域网分区时拉一次最新状态（端口/地址/二维码都是主进程现算的）
  if (btn.dataset.panel === 'lan') refreshLanPanel();
  // [v1.0.5.7] 进入倒计时分区时拉一次最新列表（别拿几分钟前的旧快照展示）
  if (btn.dataset.panel === 'countdown') refreshCountdownPanel();
  if (persist) saveAndApply({ settingsTab: btn.dataset.panel });
}

// 当前面板被模式切换隐藏时，自动跳到可用面板
function ensureActivePanel() {
  const active = navItems.find(b => b.classList.contains('active'));
  if (!active || !isNavAvailable(active)) activatePanel('mode', false);
}

// [v1.0.5.5] 插件会动态往导航里插入自己的页面（dc.ui.nav）——
// navItems / panels 是加载时一次性抓取的数组，插件增删页面后必须重新抓一遍，
// 否则插件页切不过去、被删掉的页面还会留在数组里。
function refreshNavItems() {
  navItems.length = 0;
  panels.length = 0;
  navItems.push(...Array.from(document.querySelectorAll('.nav-item')));
  panels.push(...Array.from(document.querySelectorAll('.panel')));
  // 当前活动面板若已从 DOM 里消失（插件被卸载/重新加载），退回插件页而不是留一片空白
  if (!document.querySelector('.panel.active')) activatePanel('plugins', false);
}

// [v1.0.5.6] ====== 局域网只读镜像面板 ======
// 服务本身在主进程（渲染进程没有 Node，开不了端口）；这里只做开关、端口、访问方式、状态与二维码。
// ⚠️ lanMirror* 这几个键由主进程独占写入（见 main.js 的 LAN_OWNED_KEYS）：
// 本地 config 快照只是用于回显，绝不能靠整份回写去改它们 —— 一律走 setLanMirror。
let lanState = null;      // 最近一次从主进程拿到的状态
let lanBusy = false;      // 正在请求主进程（切开关/换端口/换码/改访问方式）
let lanFlashTimer = null; // 临时提示（如「已复制」）的清除定时器

const LAN_AUTH_MODES = ['random', 'fixed', 'none'];
// 与服务侧 lan-mirror.js 的规则保持一致：小写字母/数字/-/_，4–32 位
const LAN_CODE_RE = /^[a-z0-9_-]{4,32}$/;
const LAN_RESERVED_CODES = ['api'];

// 和服务侧 sanitizeCode 同规则：去空白、转小写、空白转 -、剔非法字符、合并连续 -、
// 去掉首尾 - 和 _、截断到 32 位。输入框失焦时立刻回显规整结果，所见即所得。
function sanitizeLanCode(value) {
  return String(value === undefined || value === null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+/, '')
    .replace(/[-_]+$/, '')
    .slice(0, 32);
}

function isValidLanCode(value) {
  const v = String(value || '');
  return LAN_CODE_RE.test(v) && LAN_RESERVED_CODES.indexOf(v) < 0;
}

function langLanMode() {
  if (els.lan_auth_mode && LAN_AUTH_MODES.indexOf(els.lan_auth_mode.value) >= 0) return els.lan_auth_mode.value;
  return (lanState && LAN_AUTH_MODES.indexOf(lanState.authMode) >= 0) ? lanState.authMode : 'random';
}

function lanDict() { return LOCALE[currentLang] || LOCALE.zh; }

function lanErrText(code) {
  const d = lanDict();
  if (!code) return '';
  if (code === 'port-in-use') return d.lanErrPortInUse;
  if (code === 'port-denied') return d.lanErrPortDenied;
  if (code === 'listen-failed') return d.lanErrListenFailed;
  return code;
}

function lanUrls() { return (lanState && lanState.urls) ? lanState.urls : []; }

function lanMainUrl() { const list = lanUrls(); return list.length ? list[0].url : ''; }

// 复制：优先用剪贴板 API；file:// 下若被拒，退回临时 textarea + execCommand
async function lanCopy(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* 退回兜底方案 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const done = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!done;
  } catch (e) { return false; }
}

function drawLanQr(text) {
  const canvas = els.lan_qr;
  if (!canvas) return;
  if (!text || !window.DCQR || typeof window.DCQR.toCanvas !== 'function') {
    canvas.classList.add('hidden');
    return;
  }
  try {
    const scale = 4;
    const qr = window.DCQR.toCanvas(text, canvas, { scale: scale, margin: 4, dark: '#141414', light: '#ffffff' });
    const px = (qr.size + 8) * scale;
    canvas.style.width = px + 'px';
    canvas.style.height = px + 'px';
    canvas.classList.remove('hidden');
  } catch (e) {
    canvas.classList.add('hidden'); // 内容超长等极端情况：宁可不显示，也不显示错误二维码
  }
}

function lanStatusText() {
  const d = lanDict();
  const st = lanState;
  if (lanBusy) return { cls: 'lan-status off', text: d.lanStatusStarting };
  if (!st || !st.running) {
    if (st && st.error) return { cls: 'lan-status error', text: d.lanStatusError.replace('{msg}', lanErrText(st.error)) };
    return { cls: 'lan-status off', text: d.lanStatusOff };
  }
  const want = Number(els.lan_port && els.lan_port.value);
  const shifted = Number.isFinite(want) && st.port !== want;
  let text = shifted
    ? d.lanStatusRunningShifted.replace('{port}', st.port).replace('{want}', want)
    : d.lanStatusRunning.replace('{port}', st.port);
  if (st.requests) text += ' · ' + d.lanStatusRequests.replace('{n}', st.requests);
  if (st.pageAvailable === false) text += ' · ' + d.lanStatusError.replace('{msg}', d.lanErrPageMissing);
  return { cls: 'lan-status', text: text };
}

function renderLanPanel() {
  if (!els.lan_status) return;
  const d = lanDict();
  const enabled = !!(els.lan_enabled && els.lan_enabled.checked);
  const mode = langLanMode();
  if (els.lan_enabled) els.lan_enabled.disabled = lanBusy;
  if (els.lan_port) els.lan_port.disabled = !enabled || lanBusy;
  if (els.lan_auth_mode) els.lan_auth_mode.disabled = lanBusy;

  // 自定义码输入行只在「自定义访问码」下出现
  const codeEditing = mode === 'fixed';
  if (els.lan_code_row) els.lan_code_row.classList.toggle('hidden', !codeEditing);
  if (els.lan_code) els.lan_code.disabled = lanBusy;
  // 输入框里的内容不合法 → 就地红字提示（主进程此时会退回随机码，见 authFallback）
  const typed = els.lan_code ? els.lan_code.value : '';
  const typedBad = codeEditing && !isValidLanCode(sanitizeLanCode(typed));
  if (els.lan_code_error) els.lan_code_error.classList.toggle('hidden', !typedBad);
  if (els.lan_auth_note) {
    els.lan_auth_note.textContent = mode === 'none' ? d.lanHintNone
      : mode === 'fixed' ? d.lanHintFixed : d.lanHintRandom;
  }
  if (els.lan_auth_warn) {
    // 主进程报「自定义码不合法，已退回随机码」时也必须提示，即使输入框里看着没问题
    const warnText = mode === 'none' ? d.lanWarnNone
      : (mode === 'fixed' ? (lanState && lanState.authFallback ? d.lanCodeInvalid : d.lanWarnFixed) : '');
    els.lan_auth_warn.textContent = warnText;
    els.lan_auth_warn.classList.toggle('hidden', !warnText);
  }
  // 「更换访问码」只在随机模式下有意义（自定义的码由用户自己管，无码模式压根没有码）
  if (els.lan_token_btn) els.lan_token_btn.classList.toggle('hidden', mode !== 'random');

  const s = lanStatusText();
  els.lan_status.className = s.cls;
  els.lan_status_text.textContent = s.text;

  const running = !!(lanState && lanState.running);
  els.lan_body.classList.toggle('hidden', !running);
  if (!running) {
    // 收起时顺手清掉二维码与地址（下次展开一定是新数据，避免闪出旧地址）
    if (els.lan_qr) els.lan_qr.classList.add('hidden');
    els.lan_address_list.innerHTML = '';
    if (els.lan_code_line) els.lan_code_line.classList.add('hidden');
    return;
  }

  // 当前访问码：随机模式下单独亮出来，方便手机上手输（地址整串太长，念不清）
  const token = (lanState && typeof lanState.token === 'string') ? lanState.token : '';
  const showCode = running && mode === 'random' && !!token;
  if (els.lan_code_line) els.lan_code_line.classList.toggle('hidden', !showCode);
  if (showCode && els.lan_code_value) els.lan_code_value.textContent = token;

  const urls = lanUrls();
  const multi = urls.length > 1;
  els.lan_address_list.innerHTML = '';
  urls.forEach(u => {
    const row = document.createElement('div');
    row.className = 'lan-addr';
    const ip = document.createElement('span');
    ip.className = 'lan-addr-ip';
    ip.textContent = u.name ? u.name + ' · ' + u.ip : u.ip;
    const url = document.createElement('span');
    url.className = 'lan-addr-url';
    url.textContent = u.url;
    row.appendChild(ip);
    row.appendChild(url);
    if (multi) { // 只有一个地址时用底部的主按钮复制，避免重复
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lan-addr-copy';
      btn.textContent = d.lanCopy;
      btn.addEventListener('click', async () => {
        const okCopy = await lanCopy(u.url);
        flashLanStatus(okCopy ? d.lanCopied : d.lanCopyFail, !okCopy);
      });
      row.appendChild(btn);
    }
    els.lan_address_list.appendChild(row);
  });
  els.lan_no_address.classList.toggle('hidden', urls.length > 0);
  drawLanQr(urls.length ? urls[0].url : '');
  els.lan_copy_btn.disabled = !urls.length;
  els.lan_preview_btn.disabled = !urls.length;
}

// 临时提示（已复制 / 复制失败），2.2 秒后回到正常状态文案
function flashLanStatus(text, isError) {
  if (!els.lan_status_text) return;
  if (lanFlashTimer) clearTimeout(lanFlashTimer);
  els.lan_status.className = 'lan-status' + (isError ? ' error' : '');
  els.lan_status_text.textContent = text;
  lanFlashTimer = setTimeout(() => { lanFlashTimer = null; renderLanPanel(); }, 2200);
}

// lanMirror* 这几个键由主进程独占写入：本地快照跟着它，避免下次 saveAndApply 时又拿旧值回写
function adoptLanToken() {
  if (!config || !lanState) return;
  if (typeof lanState.token === 'string' && lanState.token) config.lanMirrorToken = lanState.token;
  if (LAN_AUTH_MODES.indexOf(lanState.authMode) >= 0) config.lanMirrorAuthMode = lanState.authMode;
  if (typeof lanState.fixedCode === 'string') config.lanMirrorFixedCode = lanState.fixedCode;
  // 把服务端规整后的自定义码写回输入框（用户可能输入了 "My Clock" → 显示 "my-clock"）。
  // 正在输入时不打断（避免光标被挪到末尾）。
  if (els.lan_code && document.activeElement !== els.lan_code) {
    els.lan_code.value = config.lanMirrorFixedCode || '';
  }
}

async function refreshLanPanel() {
  const api = window.electronAPI;
  if (!api || typeof api.lanMirrorStatus !== 'function') return;
  // [v1.0.5.7] 拉状态失败时保留旧 lanState（置 null 会错显示「未开启共享」）
  try { const st = await api.lanMirrorStatus(); if (st) lanState = st; } catch (e) {}
  adoptLanToken();
  renderLanPanel();
}

// 统一入口：把开关/端口交给主进程，回来后用真实状态刷新界面
// [v1.0.5.7] lanBusy 期间的变更不再静默丢弃：合并进 pending，本轮结束后立刻补发
let pendingLanPatch = null;
async function applyLanMirror(patch) {
  const api = window.electronAPI;
  if (lanBusy) {
    pendingLanPatch = Object.assign({}, pendingLanPatch || {}, patch || {});
    return;
  }
  lanBusy = true;
  renderLanPanel();
  try {
    lanState = await api.setLanMirror(patch);
  } catch (e) {
    // [v1.0.5.7] 失败保留旧状态（原来置 null，面板会错显示成「未开启共享」）
    lanBusy = false;
    renderLanPanel();
    flashLanStatus(String((e && e.message) || e), true);
    return;
  }
  lanBusy = false;
  adoptLanToken();
  renderLanPanel();
  if (pendingLanPatch) {
    const p = pendingLanPatch;
    pendingLanPatch = null;
    applyLanMirror(p);
  }
}

function initLanPanel() {
  if (!els.lan_enabled) return;

  // 访问方式的当前取值（随输入框实时读，避免用户改了输入框却没触发 change 时漏掉）
  function authPatch() {
    const mode = langLanMode();
    const p = { authMode: mode };
    if (mode === 'fixed') p.fixedCode = sanitizeLanCode(els.lan_code ? els.lan_code.value : '');
    return p;
  }

  els.lan_enabled.addEventListener('change', () => {
    config = { ...config, lanMirrorEnabled: els.lan_enabled.checked };
    const port = parseInt(els.lan_port.value, 10);
    const patch = { enabled: els.lan_enabled.checked, ...authPatch() };
    if (Number.isFinite(port)) patch.port = port;
    applyLanMirror(patch);
  });

  els.lan_port.addEventListener('change', () => {
    let port = parseInt(els.lan_port.value, 10);
    if (!Number.isFinite(port)) port = config.lanMirrorPort || 8788;
    port = Math.max(1024, Math.min(65535, Math.round(port)));
    els.lan_port.value = port;
    config = { ...config, lanMirrorPort: port };
    // [v1.0.5.7] 关着也照发：save-config 会用磁盘值覆盖 LAN_OWNED_KEYS，
    // 只写本地快照的话端口改动会在下次整份回写时被静默还原（authMode/fixedCode
    // 早就这么做了，唯独端口漏了）
    applyLanMirror({ port: port });
  });

  // 访问方式：随机 / 自定义 / 不需要访问码。
  // 开关关着时也照发 —— 配置要先落盘，否则下次打开开关会按磁盘上的旧值启动。
  els.lan_auth_mode.addEventListener('change', () => {
    const mode = langLanMode();
    config = { ...config, lanMirrorAuthMode: mode };
    // 切到自定义但没有可用的码：给个合理默认，省得用户对着空/非法输入框发愣。
    // 优先沿用上次存过的合法码，否则用 my-clock（之前这里会沿用「上一次输错的码」，
    // 结果一进自定义模式就顶着非法码 + 红字提示）。
    if (mode === 'fixed' && els.lan_code) {
      const cur = sanitizeLanCode(els.lan_code.value);
      if (!isValidLanCode(cur)) {
        const stored = sanitizeLanCode(config.lanMirrorFixedCode || '');
        els.lan_code.value = isValidLanCode(stored) ? stored : 'my-clock';
      }
    }
    applyLanMirror(authPatch());
  });

  // 自定义码：输入时就地校验（不发请求），失焦/回车才真正落到主进程
  if (els.lan_code) {
    els.lan_code.addEventListener('input', () => {
      if (!els.lan_code_error) return;
      const bad = !isValidLanCode(sanitizeLanCode(els.lan_code.value));
      els.lan_code_error.classList.toggle('hidden', !bad);
    });
    els.lan_code.addEventListener('change', () => {
      const code = sanitizeLanCode(els.lan_code.value);
      els.lan_code.value = code; // 回显规整结果（去空白/转小写/剔非法字符）
      config = { ...config, lanMirrorFixedCode: code };
      applyLanMirror(authPatch());
    });
  }

  els.lan_copy_btn.addEventListener('click', async () => {
    const d = lanDict();
    const url = lanMainUrl();
    if (!url) return;
    const done = await lanCopy(url);
    flashLanStatus(done ? d.lanCopied : d.lanCopyFail, !done);
  });

  els.lan_preview_btn.addEventListener('click', () => {
    const url = lanMainUrl();
    if (url && window.electronAPI.openLanMirrorUrl) window.electronAPI.openLanMirrorUrl(url);
  });

  // 复制「访问码」本身：手机上要手输时念/打这 6 位比整串地址方便
  if (els.lan_code_copy) {
    els.lan_code_copy.addEventListener('click', async () => {
      const d = lanDict();
      const code = (lanState && lanState.token) ? lanState.token : '';
      if (!code) return;
      const done = await lanCopy(code);
      flashLanStatus(done ? d.lanCopied : d.lanCopyFail, !done);
    });
  }

  els.lan_token_btn.addEventListener('click', async () => {
    const d = lanDict();
    if (!confirm(d.lanTokenConfirm)) return;
    const api = window.electronAPI;
    lanBusy = true;
    renderLanPanel();
    // [v1.0.5.7] 失败保留旧状态（原来置 null，面板会错显示成「未开启共享」）
    try { const ns = await api.newLanMirrorToken(); if (ns) lanState = ns; }
    catch (e) { flashLanStatus(String((e && e.message) || e), true); }
    lanBusy = false;
    adoptLanToken();
    renderLanPanel();
  });
}

(async function init() {
  try { config = await window.electronAPI.getConfig(); } catch (e) { config = {}; }
  syncUIFromConfig();
  await refreshLightsOffDisplays();

  // [v1.0.5.1] 左侧导航点击切换面板
  // [v1.0.5.5] 改成事件委托：插件可以随时往导航里插入自己的页面，逐项绑定会漏掉动态项
  const navRoot = document.getElementById('settings-nav');
  if (navRoot) {
    navRoot.addEventListener('click', event => {
      const btn = event.target && event.target.closest ? event.target.closest('.nav-item') : null;
      if (btn && btn.dataset.panel) activatePanel(btn.dataset.panel, true);
    });
  }

  // [v1.0.5.6] 局域网只读镜像面板接线（开关/端口/复制/预览/换码）
  initLanPanel();

  // [v1.0.5.5] 自绘标题栏（窗口 frame:false）：按钮接线 + 最大化状态同步
  // 双击拖拽区最大化、贴边分屏由 Electron 对 -webkit-app-region: drag 的原生支持负责，这里不重复处理。
  (function initWinBar() {
    const api = window.electronAPI;
    if (!api || typeof api.windowControl !== 'function') return;
    const bind = (id, action) => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => api.windowControl(action));
    };
    bind('win-min', 'minimize');
    bind('win-max', 'toggle-maximize');
    bind('win-close', 'close');
    if (typeof api.onWindowMaximized === 'function') {
      api.onWindowMaximized(v => document.body.classList.toggle('is-maximized', !!v));
    }
  })();

  // [v1.0.5.4] 关于界面：版本（四位）/ 作者 / 仓库地址
  try {
    const info = window.electronAPI.getAppInfo ? await window.electronAPI.getAppInfo() : null;
    if (info) {
      if (els.about_version) els.about_version.textContent = info.version || '—';
      if (els.about_authors) els.about_authors.textContent = info.authors || '—';
      if (els.about_gitee) {
        els.about_gitee.textContent = info.gitee || '—';
        els.about_gitee.addEventListener('click', () => window.electronAPI.openExternal(info.gitee));
      }
      if (els.about_github) {
        els.about_github.textContent = info.github || '—';
        els.about_github.addEventListener('click', () => window.electronAPI.openExternal(info.github));
      }
    }
  } catch (e) {}

  // Load alarms
  try { alarmList = await window.electronAPI.getAllAlarms() || []; } catch (e) { alarmList = []; }
  renderAlarmList();

  // Get active alarm IDs (for disabling edit buttons)
  try { activeAlarmIds = await window.electronAPI.getActiveAlarmIds() || { ringingId: null, retryIds: [] }; } catch (e) {}
  renderAlarmList();

  // [v1.0.5] 关灯状态变化（如从关灯窗口点退出）→ 同步开关
  window.electronAPI.onLightsOffStateChanged && window.electronAPI.onLightsOffStateChanged((enabled) => {
    els.lights_off_switch.checked = !!enabled;
    if (config.lightsOff !== !!enabled) {
      config.lightsOff = !!enabled;
    }
  });

  // Listen for alarm updates
  window.electronAPI.onAlarmsUpdated && window.electronAPI.onAlarmsUpdated((alarms) => {
    alarmList = alarms || [];
    renderAlarmList();
  });

  // Listen for active alarm IDs changes
  window.electronAPI.onActiveAlarmIdsChanged && window.electronAPI.onActiveAlarmIdsChanged((ids) => {
    activeAlarmIds = ids || { ringingId: null, retryIds: [] };
    renderAlarmList();
  });

  // [v1.0.5.7] 倒计时：初始拉一次 + 订阅变更广播；列表剩余时间每秒本地倒扣
  await refreshCountdownPanel();
  window.electronAPI.onCountdownState && window.electronAPI.onCountdownState((state) => {
    applyCountdownState(state);
  });
  if (cdTickTimer) clearInterval(cdTickTimer);
  cdTickTimer = setInterval(tickCountdownList, 1000);

  // 外观
  function syncColorUI(){els.text_color.disabled=els.auto_color.checked;els.bg_color.disabled=els.auto_color.checked;}
  els.auto_color.addEventListener('change', function(){syncColorUI();saveAndApply({autoColor:els.auto_color.checked});});
  els.text_color.addEventListener('input', () => saveAndApply({ color: els.text_color.value }));
  els.bg_color.addEventListener('input', () => saveAndApply({ bgColor: buildBgColor() }));
  els.bg_alpha.addEventListener('input', () => { els.bg_alpha_label.textContent = Math.round(els.bg_alpha.value*100)+'%'; saveAndApply({ bgColor: buildBgColor() }); });
  els.font_select.addEventListener('change', () => {
    if (els.font_select.value === 'custom') { els.font_custom.classList.remove('hidden'); els.font_custom.focus(); }
    else { els.font_custom.classList.add('hidden'); saveAndApply({ fontFamily: els.font_select.value }); }
  });
  els.font_custom.addEventListener('change', () => { const v = els.font_custom.value.trim(); if (v) saveAndApply({ fontFamily: v }); });
  els.font_size.addEventListener('input', () => { const v = parseInt(els.font_size.value,10); els.font_size_label.textContent = v; saveAndApply({ fontSize: v }); });
  els.info_scale.addEventListener('input', () => {
    const v = parseFloat(els.info_scale.value);
    // [v1.0.5.7] 空值/非数字不落盘（避免 NaN 写进 config 后下次启动瘫掉 init）
    if (!Number.isFinite(v)) return;
    els.info_scale_label.textContent = v.toFixed(2); saveAndApply({ infoScale: v });
  });
  els.anim_speed.addEventListener('input', function() { var v = parseInt(els.anim_speed.value,10); els.anim_speed_label.textContent = v; saveAndApply({ animDuration: v }); syncAnimUI(); });
  els.anim_type.addEventListener('change', function() { saveAndApply({ animType: els.anim_type.value }); syncAnimUI(); });
  // [v1.0.5.7] 动画节奏（匀速 / 慢起 / 慢停 / 两头慢 / 弹性）
  els.anim_ease.addEventListener('change', function() { saveAndApply({ animEase: els.anim_ease.value }); syncAnimUI(); });
  // [v1.0.5.4] 翻转 / 缩放 的方向
  els.anim_flip_dir.addEventListener('change', function() { saveAndApply({ animFlipDir: els.anim_flip_dir.value }); });
  els.anim_scale_dir.addEventListener('change', function() { saveAndApply({ animScaleDir: els.anim_scale_dir.value }); });
  els.stagger_delay.addEventListener('input', function() { var v = parseInt(els.stagger_delay.value,10); els.stagger_delay_label.textContent = v; saveAndApply({ staggerDelay: v }); });
  els.stagger_dir.addEventListener('change', function() { saveAndApply({ staggerDirection: els.stagger_dir.value }); });
  els.blur_enabled.addEventListener('change', function() { saveAndApply({ blurEnabled: els.blur_enabled.checked }); syncAnimUI(); });
  els.blur_duration.addEventListener('input', function() { var v = parseInt(els.blur_duration.value,10); els.blur_duration_label.textContent = v; saveAndApply({ blurDuration: v }); });
  els.blur_strength.addEventListener('input', function() { var v = parseInt(els.blur_strength.value,10); els.blur_strength_label.textContent = v; saveAndApply({ blurStrength: v }); });
  els.scale_in_enabled.addEventListener('change', function() { saveAndApply({ scaleInEnabled: els.scale_in_enabled.checked }); syncAnimUI(); });
  els.scale_factor.addEventListener('input', function() { var v = parseInt(els.scale_factor.value,10); els.scale_factor_label.textContent = v; saveAndApply({ scaleInFactor: v/100 }); });

  els.show_seconds.addEventListener('change', () => saveAndApply({ showSeconds: els.show_seconds.checked }));

  // [v1.0.5.3] 时间制式 / AM/PM 位置
  els.hour_format_select.addEventListener('change', () => {
    saveAndApply({ hourFormat: els.hour_format_select.value });
    syncHourFormatUI();
  });
  els.ampm_corner_select.addEventListener('change', () => {
    saveAndApply({ ampmCorner: els.ampm_corner_select.value });
  });

  // [v1.0.5.4] 时间校准（改完即时生效，时钟的秒边界会跟着重排）
  function applyCalib() {
    saveAndApply({ timeOffsetMs: calibOffsetMs() });
    syncCalibUI();
  }
  els.calib_sec.addEventListener('input', applyCalib);
  els.calib_ms.addEventListener('input', applyCalib);
  els.calib_dir.addEventListener('change', applyCalib);
  els.calib_reset_btn.addEventListener('click', () => {
    els.calib_dir.value = 'ahead';
    els.calib_sec.value = 0;
    els.calib_ms.value = 0;
    applyCalib();
  });

  // [v1.0.5.4] 定时自动校准：任何改动都重新锚定（承接既有累积量，不跳变）
  els.auto_adjust_switch.addEventListener('change', () => commitAutoAdjust({ autoAdjustEnabled: els.auto_adjust_switch.checked }));
  els.auto_interval.addEventListener('input', () => commitAutoAdjust({ autoAdjustIntervalSec: readAutoIntervalSec() }));
  els.auto_interval_unit.addEventListener('change', () => commitAutoAdjust({ autoAdjustIntervalSec: readAutoIntervalSec() }));
  els.auto_sec.addEventListener('input', () => commitAutoAdjust({ autoAdjustAmountMs: readAutoAmountMs() }));
  els.auto_ms.addEventListener('input', () => commitAutoAdjust({ autoAdjustAmountMs: readAutoAmountMs() }));
  els.auto_dir.addEventListener('change', () => commitAutoAdjust({ autoAdjustAmountMs: readAutoAmountMs() }));
  els.auto_reset_btn.addEventListener('click', () => {
    saveAndApply({ autoAdjustBaseMs: 0, autoAdjustAnchor: Date.now() });
    syncAutoAdjustUI();
  });
  // 摘要里的「下次调整还有 …」需要每秒刷新
  setInterval(syncAutoAdjustUI, 1000);

  // 日期
  els.show_date.addEventListener('change', () => { saveAndApply({ showDate: els.show_date.checked }); syncDatePositionUI(); });
  els.show_weekday.addEventListener('change', () => { saveAndApply({ showWeekday: els.show_weekday.checked }); syncDatePositionUI(); });
  els.date_position.addEventListener('change', () => saveAndApply({ datePosition: els.date_position.value }));

  // 多时区
  els.tz_add_btn.addEventListener('click', () => {
    const cur = config.extraTimezones || [];
    if (cur.length >= 2) return;
    const label = els.tz_label.value.trim();
    if (!label) return;
    // [v1.0.5.7] 偏移必须是 [-12, 14] 内的数字（原来 NaN/任意值都能写进配置）
    let offset = parseInt(els.tz_offset.value, 10);
    if (!Number.isFinite(offset)) offset = 0;
    offset = Math.max(-12, Math.min(14, offset));
    els.tz_offset.value = String(offset);
    saveAndApply({ extraTimezones: [...cur, { label, offset }] });
    renderTZList();
    els.tz_label.value = '';
    els.tz_offset.value = '0';
  });

  // 位置
  els.pos_buttons.forEach(btn => btn.addEventListener('click', async () => {
    const p = btn.dataset.pos; els.pos_buttons.forEach(b => b.classList.remove('active')); btn.classList.add('active');
    if (p === 'custom') { els.custom_pos.classList.remove('hidden'); saveAndApply({ positionPreset: 'custom' }); }
    else { els.custom_pos.classList.add('hidden'); await window.electronAPI.moveWindow({ preset: p }); saveAndApply({ positionPreset: p }); }
  }));
  els.apply_pos.addEventListener('click', async () => {
    const x = parseInt(els.pos_x.value,10)||0, y = parseInt(els.pos_y.value,10)||0;
    await window.electronAPI.moveWindow({x,y});
    els.pos_buttons.forEach(b => b.classList.toggle('active', b.dataset.pos === 'custom'));
    saveAndApply({x, y, positionPreset: 'custom'});
  });

  // 系统
  els.layer_mode.addEventListener('change', async () => { await window.electronAPI.setLayerMode(els.layer_mode.value); saveAndApply({ layerMode: els.layer_mode.value }); });

  // [v1.0.5] 模式切换
  els.mode_select.addEventListener('change', () => {
    const m = els.mode_select.value;
    if (m === 'education') {
      // 教育模式：强制淡入淡出 + 固定时长
      els.anim_type.value = 'fade';
      els.anim_speed.value = EDU_ANIM_DURATION;
      els.anim_speed_label.textContent = EDU_ANIM_DURATION;
      saveAndApply({ mode: m, animType: 'fade', animDuration: EDU_ANIM_DURATION });
    } else {
      saveAndApply({ mode: m });
    }
    applyMode(m);
  });

  // [v1.0.5] 关灯显示器
  async function refreshLightsOffDisplays() {
    try {
      const displays = await window.electronAPI.getDisplays();
      const current = els.lights_off_display.value || config.lightsOffDisplay || 'clock';
      const dict = LOCALE[currentLang] || LOCALE.zh;
      const options = [
        { value: 'clock', label: dict.displayClock },
        { value: 'primary', label: dict.displayPrimary },
        { value: 'all', label: dict.displayAll },
      ];
      (displays || []).forEach((display, index) => {
        const displayLabel = (currentLang === 'zh' ? '显示器 ' : 'Display ') + (index + 1) + (display.primary ? (currentLang === 'zh' ? '（主）' : ' (Primary)') : '');
        options.push({ value: 'display:' + display.id, label: displayLabel });
      });
      els.lights_off_display.innerHTML = options.map(option => '<option value="' + option.value + '">' + option.label + '</option>').join('');
      els.lights_off_display.value = options.some(option => option.value === current) ? current : 'clock';
    } catch (e) {}
  }

  // [v1.0.5] 关灯
  els.lights_off_display.addEventListener('change', async () => {
    await saveAndApply({ lightsOffDisplay: els.lights_off_display.value });
    if (config.lightsOff) {
      // 主进程负责安全地关闭旧窗口后再按新范围重建，避免关闭/重建竞态
      await window.electronAPI.restartLightsOff();
    }
  });
  els.lights_off_switch.addEventListener('change', async () => {
    const en = els.lights_off_switch.checked;
    const r = await window.electronAPI.setLightsOff(en);
    if (!r.success) {
      els.lights_off_switch.checked = !en;
      const d = LOCALE[currentLang] || LOCALE.zh;
      alert(d.lightsOffFail + (r.error || ''));
    }
    saveAndApply({ lightsOff: en });
  });

  els.auto_start.addEventListener('change', async () => {
    const en = els.auto_start.checked;
    const silent = els.silent_start.checked;
    const r = await window.electronAPI.setAutoStart(en, silent);
    if (!r.success) {
      // [v1.0.5.7] 失败必须收口：原来只回退了开关、saveAndApply 照常执行 ——
      // UI 显示未启用、config 里是 true、注册表没写成功，三者不一致
      els.auto_start.checked = !en;
      const d = LOCALE[currentLang] || LOCALE.zh;
      alert(d.autoStartFail + (r.error || d.permissionDenied));
      return;
    }
    saveAndApply({ autoStart: en });
    syncSilentStartUI();
  });

  // [v1.0.5.5] 静默自启动：需要把参数同步写进开机启动项
  els.silent_start.addEventListener('change', async () => {
    const silent = els.silent_start.checked;
    const r = await window.electronAPI.setAutoStart(els.auto_start.checked, silent);
    if (!r.success) { els.silent_start.checked = !silent; const d=LOCALE[currentLang]||LOCALE.zh; alert(d.autoStartFail+(r.error||d.permissionDenied)); return; }
    saveAndApply({ silentStart: silent });
  });
  els.language_select.addEventListener('change', async () => {
    await saveAndApply({ language: els.language_select.value });
    await refreshLightsOffDisplays();
  });
  // [v1.0.5] 设置字体大小
  els.settings_font_size.addEventListener('change', () => {
    const v = els.settings_font_size.value;
    applySettingsFontSize(v);
    saveAndApply({ settingsFontSize: v });
  });
  els.passthrough_switch.addEventListener('change', () => {
    const en = els.passthrough_switch.checked;
    window.electronAPI.setPassthrough(en);
    saveAndApply({ passthrough: en });
  });

  // ====== 闹钟 ======
  els.alarm_add_btn.addEventListener('click', () => {
    window.electronAPI.openAlarmEditor(null);
  });

  // ====== 闹钟高级设置 ======
  // Collapse toggle
  els.alarm_advanced_toggle.addEventListener('click', () => {
    const isOpen = !els.alarm_advanced_content.classList.contains('hidden');
    els.alarm_advanced_content.classList.toggle('hidden');
    const label = (LOCALE[currentLang] || LOCALE.zh).alarmAdvanced || '▶ Advanced';
    const text = label.replace(/^[▶▼]\s*/, '');
    els.alarm_advanced_toggle.textContent = (isOpen ? '▶' : '▼') + ' ' + text;
  });

  els.alarm_sound_duration.addEventListener('input', () => {
    const v = parseInt(els.alarm_sound_duration.value, 10);
    els.alarm_sound_duration_label.textContent = v;
    saveAndApply({ alarmSoundDuration: v });
  });
  els.alarm_flash.addEventListener('change', () => {
    saveAndApply({ alarmFlash: els.alarm_flash.checked });
  });
  els.alarm_auto_show.addEventListener('change', () => {
    saveAndApply({ alarmAutoShow: els.alarm_auto_show.checked });
  });
  els.alarm_auto_passthrough.addEventListener('change', () => {
    saveAndApply({ alarmAutoPassthrough: els.alarm_auto_passthrough.checked });
  });
  els.alarm_auto_top.addEventListener('change', () => {
    saveAndApply({ alarmAutoTop: els.alarm_auto_top.checked });
  });

  // ====== [v1.0.5.7] 倒计时 ======
  els.countdown_add_btn.addEventListener('click', () => {
    window.electronAPI.openCountdownEditor(null);
  });

  els.countdown_advanced_toggle.addEventListener('click', () => {
    const isOpen = !els.countdown_advanced_content.classList.contains('hidden');
    els.countdown_advanced_content.classList.toggle('hidden');
    const label = (LOCALE[currentLang] || LOCALE.zh).countdownAdvanced || '▶ Advanced';
    const text = label.replace(/^[▶▼]\s*/, '');
    els.countdown_advanced_toggle.textContent = (isOpen ? '▶' : '▼') + ' ' + text;
  });

  els.countdown_sound.addEventListener('change', () => {
    saveAndApply({ countdownSound: els.countdown_sound.value });
  });
  els.countdown_show_info.addEventListener('change', () => {
    saveAndApply({ countdownShowInInfoBar: els.countdown_show_info.checked });
  });
  if (els.countdown_default_minutes) {
    els.countdown_default_minutes.addEventListener('change', () => {
      const min = clampDefaultMinutes(els.countdown_default_minutes.value);
      els.countdown_default_minutes.value = String(min);
      saveAndApply({ countdownDefaultMinutes: min });
    });
  }

  // ====== [v1.0.5.3] 偏好设置导出 / 导入 ======
  function showDataStatus(text, isError) {
    if (!els.data_transfer_status) return;
    els.data_transfer_status.textContent = text;
    els.data_transfer_status.classList.remove('hidden');
    els.data_transfer_status.classList.toggle('error', !!isError);
  }

  els.export_data_btn.addEventListener('click', async () => {
    const dict = LOCALE[currentLang] || LOCALE.zh;
    els.export_data_btn.disabled = true;
    try {
      const r = await window.electronAPI.exportData();
      if (r.canceled) return;
      showDataStatus(r.success ? dict.exportSuccess + r.path : dict.exportFailed + (r.error || ''), !r.success);
    } finally {
      els.export_data_btn.disabled = false;
    }
  });

  els.import_data_btn.addEventListener('click', async () => {
    const dict = LOCALE[currentLang] || LOCALE.zh;
    if (!confirm(dict.importConfirm)) return;
    els.import_data_btn.disabled = true;
    let r;
    try {
      r = await window.electronAPI.importData();
    } finally {
      els.import_data_btn.disabled = false;
    }
    if (!r || r.canceled) return;
    if (!r.success) {
      let msg;
      if (r.error === 'invalid-json') msg = dict.importInvalidJson;
      else if (r.error === 'invalid-format') msg = dict.importInvalidFormat;
      else msg = dict.importFailed + (r.error || '');
      showDataStatus(msg, true);
      return;
    }
    // 导入成功后锁定按钮并整进程重启，让主进程/时钟窗口全部按新配置重载
    els.import_data_btn.disabled = true;
    els.export_data_btn.disabled = true;
    showDataStatus(dict.importSuccess, false);
    setTimeout(() => { window.electronAPI.relaunchApp(); }, 900);
  });

  // ====== [v1.0.5] 删除所有保存的数据 ======
  els.delete_data_btn.addEventListener('click', async () => {
    const dict = LOCALE[currentLang] || LOCALE.zh;
    if (!confirm(dict.confirmDeleteData)) return;
    els.delete_data_btn.disabled = true;
    els.delete_data_btn.textContent = dict.deleteDataSuccess;
    // deleteAllData 内部会强制重启，这之后代码不会执行
    await window.electronAPI.deleteAllData();
  });

  window.addEventListener('beforeunload', () => {
    window.electronAPI.saveConfig(config);
    if (typeof alarmRefreshTimer !== 'undefined') { clearInterval(alarmRefreshTimer); alarmRefreshTimer = null; }
  });

  // 时钟窗口被拖动时同步更新位置按钮状态 / 时区变化时同步列表
  window.electronAPI.onConfigUpdated((nc) => {
    if (nc.positionPreset === undefined && nc.x === undefined && nc.y === undefined && nc.extraTimezones === undefined) {
      // Check if any alarm advanced setting / 时间制式 changed
      const syncKeys = ['alarmSoundDuration','alarmFlash','alarmAutoShow','alarmAutoPassthrough','alarmAutoTop','hourFormat','ampmCorner','autoStart','silentStart'];
      if (!syncKeys.some(k => nc[k] !== undefined)) return;
    }
    Object.assign(config, nc);
    if (nc.language && nc.language !== currentLang) {
      applyLanguage(nc.language);
      refreshLightsOffDisplays();
    }
    if (nc.lightsOffDisplay !== undefined) {
      els.lights_off_display.value = nc.lightsOffDisplay;
    }
    els.pos_buttons.forEach(b => b.classList.toggle('active', b.dataset.pos === config.positionPreset));
    if (config.positionPreset === 'custom') {
      els.custom_pos.classList.remove('hidden');
      els.pos_x.value = config.x; els.pos_y.value = config.y;
    } else {
      els.custom_pos.classList.add('hidden');
    }
    if (nc.extraTimezones !== undefined) renderTZList();
    // Sync alarm advanced settings
    if (nc.alarmSoundDuration !== undefined) {
      els.alarm_sound_duration.value = nc.alarmSoundDuration;
      els.alarm_sound_duration_label.textContent = nc.alarmSoundDuration;
    }
    if (nc.alarmFlash !== undefined) els.alarm_flash.checked = nc.alarmFlash;
    if (nc.alarmAutoShow !== undefined) els.alarm_auto_show.checked = nc.alarmAutoShow;
    if (nc.alarmAutoPassthrough !== undefined) els.alarm_auto_passthrough.checked = nc.alarmAutoPassthrough;
    if (nc.alarmAutoTop !== undefined) els.alarm_auto_top.checked = nc.alarmAutoTop;
    // [v1.0.5.5] 开机 / 静默自启动
    if (nc.autoStart !== undefined) { els.auto_start.checked = !!nc.autoStart; syncSilentStartUI(); }
    if (nc.silentStart !== undefined) els.silent_start.checked = !!nc.silentStart;
    // [v1.0.5.3] 时间制式 / AM/PM 角标
    if (nc.hourFormat !== undefined) { els.hour_format_select.value = nc.hourFormat; syncHourFormatUI(); }
    if (nc.ampmCorner !== undefined) els.ampm_corner_select.value = nc.ampmCorner;
  });

  // ====== [v1.0.5.5] 插件 ======
  let pluginList = [];
  let pluginsRenderTimer = null;
  let pluginSafeMode = false; // [v1.0.5.5] 安全模式：插件全部暂停

  function dict() { return LOCALE[currentLang] || LOCALE.zh; }

  function pluginErrorText(code) {
    const map = {
      'bad-manifest': dict().pluginErrBadManifest, 'bad-id': dict().pluginErrBadId,
      'manifest-missing': dict().pluginErrManifestMissing, 'main-missing': dict().pluginErrMainMissing,
      'no-hooks': dict().pluginErrNoHooks, 'api-too-new': dict().pluginErrApiTooNew,
      'too-large': dict().pluginErrTooLarge, 'bad-entry': dict().pluginErrBadEntry,
      'file-too-large': dict().pluginErrFileTooLarge, 'exists': dict().pluginErrExists,
      'is-plugins-dir': dict().pluginErrIsPluginsDir,
      'invalid-path': dict().pluginErrBadEntry, 'symlink-not-allowed': dict().pluginErrBadEntry,
      'zip-support-missing': dict().pluginErrZipMissing,
    };
    return map[code] || String(code || '');
  }
  function hookLabel(h) {
    if (h === 'lightsOff.background') return dict().pluginHookLightsOff;
    if (h === 'clock.infoBar') return dict().pluginHookInfoBar;
    if (h === 'settings.theme') return dict().pluginHookSettingsTheme;
    return h;
  }
  function permLabel(p) {
    if (p === 'storage') return dict().pluginPermStorage;
    if (p === 'net') return dict().pluginPermNet;
    if (p === 'ui.clock') return dict().pluginPermUiClock;
    if (p === 'ui.settings') return dict().pluginPermUiSettings;
    if (p === 'ui.lightsOffBg') return dict().pluginPermUiLightsBg;
    if (p === 'mic') return dict().pluginPermMic;
    return p;
  }
  // 运行时报错（沙箱里抛出来的）翻成人话；认不出来的原样显示
  function pluginRuntimeText(msg) {
    const s = String(msg || '');
    if (s.indexOf('permission-denied:') === 0) {
      return dict().pluginRuntimeDenied + permLabel(s.slice('permission-denied:'.length).split('（')[0].trim());
    }
    if (s.indexOf('protected-element:') === 0) return dict().pluginRuntimeProtected;
    if (s.indexOf('ui-not-supported-in-this-window') === 0) return dict().pluginRuntimeNoUi;
    return s;
  }
  function showPluginStatus(text, isError) {
    if (!els.plugin_status) return;
    els.plugin_status.textContent = text;
    els.plugin_status.classList.remove('hidden');
    els.plugin_status.classList.toggle('error', !!isError);
  }
  function setPluginBusy(busy) {
    [els.plugin_import_btn, els.plugin_import_folder_btn].forEach(b => { if (b) b.disabled = !!busy; });
  }

  // 按 manifest 里声明的字段类型生成设置项，复用现有 .setting-row 样式
  function buildPluginSettingRow(field, value, onChange) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    const label = document.createElement('label');
    label.textContent = field.label;
    if (field.hint) label.title = field.hint;
    row.appendChild(label);

    let input;
    if (field.type === 'toggle') {
      const sw = document.createElement('label');
      sw.className = 'toggle-switch';
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = value === true;
      const slider = document.createElement('span');
      slider.className = 'toggle-slider';
      sw.appendChild(input); sw.appendChild(slider);
      row.appendChild(sw);
    } else if (field.type === 'select') {
      input = document.createElement('select');
      (field.options || []).forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label || o.value;
        input.appendChild(opt);
      });
      input.value = value;
      row.appendChild(input);
    } else if (field.type === 'textarea') {
      row.classList.add('row-col');
      input = document.createElement('textarea');
      input.className = 'custom-input';
      input.rows = 3;
      input.value = value === undefined ? '' : value;
      row.appendChild(input);
    } else if (field.type === 'color') {
      input = document.createElement('input');
      input.type = 'color';
      input.value = /^#[0-9a-fA-F]{6}$/.test(String(value)) ? value : '#ffffff';
      row.appendChild(input);
    } else if (field.type === 'slider' || field.type === 'number') {
      input = document.createElement('div');
      input.className = 'bg-row';
      const range = document.createElement('input');
      range.type = field.type === 'slider' ? 'range' : 'number';
      if (field.type === 'number') range.className = 'custom-input';
      range.min = field.min; range.max = field.max; range.step = field.step;
      range.value = value;
      const num = document.createElement('span');
      num.className = 'sub-label';
      num.textContent = String(value);
      range.addEventListener('input', () => { num.textContent = range.value; });
      range.addEventListener('change', () => onChange(field, Number(range.value)));
      input.appendChild(range); input.appendChild(num);
      row.appendChild(input);
      row._input = range;
      return row;
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'custom-input';
      input.value = value === undefined ? '' : value;
      row.classList.add('row-col');
      row.appendChild(input);
    }
    row._input = input;
    input.addEventListener('change', () => {
      const v = field.type === 'toggle' ? input.checked : input.value;
      onChange(field, v);
    });
    return row;
  }

  async function renderPluginSettings(card, plugin) {
    const holder = card.querySelector('.plugin-settings');
    if (!holder) return;
    holder.innerHTML = '';
    const schema = plugin.settings || [];
    const values = plugin.values || {};
    schema.forEach(field => {
      holder.appendChild(buildPluginSettingRow(field, values[field.key], async (f, v) => {
        // [v1.0.5.7] 走设置界面专用通道：已禁用的插件不在 bundle 里，原来的
        // setPluginSetting 会被归属校验拒绝（not-owner），改动被静默吞掉
        const setter = typeof window.electronAPI.setPluginSettingUi === 'function'
          ? window.electronAPI.setPluginSettingUi
          : window.electronAPI.setPluginSetting;
        const r = await setter(plugin.id, f.key, v);
        if (r && r.success) plugin.values[f.key] = r.value;
        else showPluginStatus(plugin.name + '：' + dict().pluginSaveFailed + pluginRuntimeText((r && r.error) || 'save-failed'), true);
      }));
    });
    if (plugin.hasSettingsView) {
      const r = await window.electronAPI.getPluginSettingsView(plugin.id);
      if (r && r.success && r.html) {
        const box = document.createElement('div');
        box.className = 'plugin-view';
        const ok = window.DCPluginHost ? window.DCPluginHost.renderSettingsView(box, r.html, plugin.assetsBase) : false;
        if (ok) holder.appendChild(box);
      }
    }
    if (!holder.childElementCount) {
      const note = document.createElement('div');
      note.className = 'plugin-section-label';
      note.textContent = dict().pluginNoSettings;
      holder.appendChild(note);
    }
  }

  function buildPluginCard(plugin) {
    const card = document.createElement('div');
    card.className = 'plugin-card' + (plugin.enabled ? '' : ' is-off') + (plugin.error ? ' has-error' : '');
    card.dataset.id = plugin.id;

    const head = document.createElement('div');
    head.className = 'plugin-head';
    const text = document.createElement('div');
    text.className = 'plugin-head-text';

    const name = document.createElement('div');
    name.className = 'plugin-name';
    name.textContent = plugin.name;
    const ver = document.createElement('span');
    ver.className = 'plugin-ver';
    ver.textContent = plugin.version ? 'v' + plugin.version : '';
    name.appendChild(ver);
    text.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'plugin-meta';
    const bits = [];
    if (plugin.author) bits.push(plugin.author);
    bits.push(plugin.id);
    meta.textContent = bits.join(' · ');
    text.appendChild(meta);

    if (plugin.description) {
      const desc = document.createElement('div');
      desc.className = 'plugin-desc';
      desc.textContent = plugin.description;
      text.appendChild(desc);
    }

    const badges = document.createElement('div');
    badges.className = 'plugin-badges';
    (plugin.hooks || []).forEach(h => {
      const b = document.createElement('span');
      b.className = 'plugin-badge';
      b.textContent = hookLabel(h);
      badges.appendChild(b);
    });
    (plugin.permissions || []).forEach(p => {
      const b = document.createElement('span');
      b.className = 'plugin-badge warn';
      b.textContent = permLabel(p);
      badges.appendChild(b);
    });
    if (plugin.error) {
      const b = document.createElement('span');
      b.className = 'plugin-badge err';
      b.textContent = dict().pluginErrorLabel + pluginErrorText(plugin.error);
      badges.appendChild(b);
    } else if (plugin.runtimeError) {
      const b = document.createElement('span');
      b.className = 'plugin-badge err';
      b.textContent = dict().pluginRuntimeError + pluginRuntimeText(plugin.runtimeError);
      badges.appendChild(b);
    }
    if (plugin.blocked) {
      const b = document.createElement('span');
      b.className = 'plugin-badge warn';
      b.textContent = dict().pluginSafeBadge;
      badges.appendChild(b);
    }
    text.appendChild(badges);
    head.appendChild(text);

    const sw = document.createElement('label');
    sw.className = 'toggle-switch';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!plugin.enabled;
    cb.disabled = !plugin.readable;
    const slider = document.createElement('span');
    slider.className = 'toggle-slider';
    sw.appendChild(cb); sw.appendChild(slider);
    head.appendChild(sw);
    card.appendChild(head);

    const actions = document.createElement('div');
    actions.className = 'plugin-actions';
    const settingsBtn = document.createElement('button');
    settingsBtn.textContent = dict().pluginSettingsBtn;
    const reloadBtn = document.createElement('button');
    reloadBtn.textContent = dict().pluginReloadBtn;
    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.textContent = dict().pluginDeleteBtn;
    actions.appendChild(settingsBtn); actions.appendChild(reloadBtn); actions.appendChild(delBtn);
    card.appendChild(actions);

    const body = document.createElement('div');
    body.className = 'plugin-body hidden';
    const secLabel = document.createElement('div');
    secLabel.className = 'plugin-section-label';
    secLabel.textContent = dict().pluginSettingsSection;
    const settingsBox = document.createElement('div');
    settingsBox.className = 'plugin-settings';
    body.appendChild(secLabel);
    body.appendChild(settingsBox);
    card.appendChild(body);

    settingsBtn.addEventListener('click', () => {
      const willShow = body.classList.contains('hidden');
      body.classList.toggle('hidden', !willShow);
      if (willShow) renderPluginSettings(card, plugin);
    });

    reloadBtn.addEventListener('click', async () => {
      await window.electronAPI.reloadPlugin(plugin.id);
      showPluginStatus(dict().pluginReloadBtn + ': ' + plugin.name);
    });

    delBtn.addEventListener('click', async () => {
      if (!confirm(dict().pluginRemoveConfirm + '\n\n' + plugin.name)) return;
      const r = await window.electronAPI.removePlugin(plugin.id);
      if (r && r.success) { showPluginStatus(dict().pluginRemoved + plugin.name); renderPluginList(); }
    });

    cb.addEventListener('change', async () => {
      const want = cb.checked;
      if (want && (plugin.permissions || []).length) {
        const list = plugin.permissions.map(p => '• ' + permLabel(p)).join('\n');
        // 界面编辑权风险更高：说清能改到什么程度，并告知出问题时的自救入口
        const hasUi = (plugin.permissions || []).some(p => p.indexOf('ui.') === 0);
        const extra = hasUi ? dict().pluginGrantUiWarn : '';
        const ok = confirm(plugin.name + '\n\n' + dict().pluginGrantTitle + '\n' + list + extra + dict().pluginGrantAsk);
        if (!ok) { cb.checked = false; return; }
      }
      const r = await window.electronAPI.setPluginEnabled(plugin.id, want);
      if (!r || !r.success) { cb.checked = !want; return; }
      card.classList.toggle('is-off', !want);
      showPluginStatus((want ? dict().pluginEnabled : dict().pluginDisabled) + ': ' + plugin.name);
    });

    return card;
  }

  async function renderPluginList() {
    if (!els.plugin_list) return;
    refreshPluginSafeBanner();
    try { pluginList = (await window.electronAPI.getPluginList()) || []; }
    catch (e) { pluginList = []; }
    els.plugin_list.innerHTML = '';
    const readable = pluginList.filter(p => p.readable);
    const broken = pluginList.filter(p => !p.readable);

    if (!pluginList.length) {
      if (els.plugin_empty) els.plugin_empty.classList.remove('hidden');
      return;
    }
    if (els.plugin_empty) els.plugin_empty.classList.add('hidden');

    readable.forEach(p => els.plugin_list.appendChild(buildPluginCard(p)));

    if (broken.length) {
      const box = document.createElement('div');
      box.className = 'plugin-empty';
      box.textContent = dict().pluginMissingFolder + ' (' + broken.map(b => b.id).join(', ') + ')';
      els.plugin_list.appendChild(box);
    }
  }

  function schedulePluginRender() {
    if (pluginsRenderTimer) clearTimeout(pluginsRenderTimer);
    pluginsRenderTimer = setTimeout(() => { pluginsRenderTimer = null; renderPluginList(); }, 150);
  }

  async function doPluginImport(kind) {
    setPluginBusy(true);
    try {
      let r = await window.electronAPI.importPlugin(kind);
      if (!r || r.canceled || r.error === 'canceled') return;
      if (!r.success && r.error === 'exists' && r.stageId) {
        const ok = confirm(dict().pluginExists + '\n\n' + (r.manifest ? r.manifest.name + ' v' + r.manifest.version : ''));
        if (!ok) { await window.electronAPI.cancelPluginImport(r.stageId); return; }
        r = await window.electronAPI.commitPlugin(r.stageId, true);
      }
      if (r && r.success) { showPluginStatus(dict().pluginImported + r.name); renderPluginList(); }
      else showPluginStatus(dict().pluginImportFailed + pluginErrorText(r && r.error), true);
    } finally { setPluginBusy(false); }
  }

  if (els.plugin_import_btn) els.plugin_import_btn.addEventListener('click', () => doPluginImport('file'));
  if (els.plugin_import_folder_btn) els.plugin_import_folder_btn.addEventListener('click', () => doPluginImport('folder'));
  if (els.plugin_folder_btn) els.plugin_folder_btn.addEventListener('click', async () => {
    const r = await window.electronAPI.openPluginFolder();
    if (r && r.success) showPluginStatus(dict().pluginOpenFolderDone + r.path);
    else showPluginStatus(dict().pluginOpenFolderFail + ((r && r.error) || ''), true);
  });
  if (window.electronAPI.onPluginsChanged) window.electronAPI.onPluginsChanged(() => schedulePluginRender());

  // [v1.0.5.5] 安全模式：停用全部插件时的提示条 + 一键退出（退出需重启才生效）
  async function refreshPluginSafeBanner() {
    if (!els.plugin_safe_banner) return;
    let state = null;
    try { state = await window.electronAPI.getPluginRuntimeState(); } catch (e) {}
    pluginSafeMode = !!(state && state.safeMode);
    els.plugin_safe_banner.classList.toggle('hidden', !pluginSafeMode);
  }
  if (els.plugin_safe_exit) els.plugin_safe_exit.addEventListener('click', async () => {
    if (!confirm(dict().pluginSafeConfirm)) return;
    try { await window.electronAPI.setPluginSafeMode(false); } catch (e) {}
    showPluginStatus(dict().pluginSafeOn);
    window.electronAPI.relaunchApp();
  });
  refreshPluginSafeBanner();

  // 供外层 activatePanel 调用（两个作用域不互通）
  // refreshNav 供 plugin-host 在插件增删导航页后刷新宿主数组（见 refreshNavItems）
  window.DCPlugins = { render: renderPluginList, schedule: schedulePluginRender, refreshNav: refreshNavItems };
  // 启动时若上次停在插件分区，初始化那一刻桥接还没建立，这里补渲染一次
  renderPluginList();

  // [v1.0.5] 每 30 秒刷新闹钟列表以更新倒计时
  let alarmRefreshTimer = setInterval(() => {
    if (alarmList.length > 0) renderAlarmList();
  }, 30000);
})();
