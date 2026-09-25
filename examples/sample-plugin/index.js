/* 示例插件入口
 *
 * 运行环境说明（很重要）：
 * - 这里没有 require / Node / Electron，只有宿主下发的 dc 对象。
 * - 每个窗口（时钟 / 关灯 / 设置）都会执行一次这段代码，用 dc.hook 判断当前在哪。
 * - 用 dc.mount(fn) 注册挂载逻辑；fn 可以返回一个清理函数，插件被关闭或改设置时会调用。
 * - 出错只会记录到设置界面里的插件卡片上，不会影响时钟本身。
 */
dc.mount(function (slot, api) {
  const s = api.settings;

  // ---- 1. 时钟窗口：日期栏文字 ----
  if (api.hook === 'clock.infoBar') {
    api.clock.setInfoText(s.text);
  }

  // ---- 2. 关灯窗口：背景板内容 ----
  if (api.hook === 'lightsOff.background') {
    api.lightsOff.setText(s.text);
    const node = api.lightsOff.root();
    if (node) {
      node.style.fontSize = s.size + 'px';
      node.style.color = s.color;
      node.style.fontWeight = s.bold ? '700' : '400';
      node.style.alignSelf = s.position === 'top' ? 'flex-start' : (s.position === 'bottom' ? 'flex-end' : 'center');
      node.style.padding = '40px';
    }
  }

  // ---- 3. 设置窗口：主题美化 ----
  if (api.hook === 'settings.theme') {
    api.ui.applyVars({
      '--plugin-accent': s.accent,
    });
    api.ui.addStyle('\
      .nav-item.active .nav-text { color: var(--plugin-accent); }\
      .toggle-switch input:checked + .toggle-slider { background: var(--plugin-accent); }\
    ');
  }

  return function cleanup() {
    // 插件被关闭 / 改设置时会走到这里（DOM 由宿主回收，这里主要做你自己的收尾）
    api.log('示例插件已卸载');
  };
});
