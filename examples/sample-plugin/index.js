/* 示例插件入口 [v1.0.5.7 / apiVersion 3]
 *
 * 运行环境说明（很重要）：
 * - 这段代码跑在一个 <iframe sandbox="allow-scripts"> 里（**与宿主跨源**）：
 *   没有 require / Node / Electron，也拿不到 window.parent 的任何东西。
 * - 你拥有的 DOM 世界就是本 iframe：document.body 是你的画布，随便建元素。
 * - 想操作**宿主**（时钟日期栏、关灯背景、设置界面）必须走 dc 提供的方法，宿主会做权限校验。
 * - 每个窗口（时钟 / 关灯 / 设置）各跑一次这段代码，用 dc.hook 判断当前在哪。
 * - 用 dc.mount(fn) 注册挂载逻辑；fn 可以返回清理函数，插件被关闭或改设置时调用。
 * - 出错只会记录到设置界面的插件卡片上，不会影响时钟本身。
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
    // root() 现在是本 iframe 的 body —— 样式直接写在这上面
    const node = api.root();
    if (node) {
      node.style.fontSize = s.size + 'px';
      node.style.color = s.color;
      node.style.fontWeight = s.bold ? '700' : '400';
      node.style.justifyContent = s.position === 'top' ? 'flex-start' : (s.position === 'bottom' ? 'flex-end' : 'center');
      node.style.padding = '40px';
    }
  }

  // ---- 3. 设置窗口：主题美化 ----
  // [v1.0.5.7] ui.addStyle / ui.applyVars（宿主侧那份）现在需要 ui.settings 权限
  //（清单里已声明）；插件自己沙箱文档里的样式注入则不需要任何权限。
  if (api.hook === 'settings.theme') {
    api.ui.applyVars({ '--plugin-accent': s.accent });
    api.ui.addStyle(
      '.nav-item.active .nav-text { color: var(--plugin-accent); }' +
      '.toggle-switch input:checked + .toggle-slider { background: var(--plugin-accent); }'
    );
  }

  return function cleanup() {
    api.log('示例插件已卸载');
  };
});
