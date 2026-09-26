/* window-layout.js — [v1.0.5.5] 窗口定位与层级的纯函数（不依赖 Electron，可单独单测）
 *
 * 为什么单独抽一个文件：位置预设必须按窗口的**真实尺寸**计算，而真实尺寸要等渲染进程
 * 按字号/内容算完才定下来（启动时窗口先按 800×400 创建，随后被撑大）。这套数学既用于
 * 启动流程、也用于每次尺寸变化后的重新对齐，抽成纯函数才能在本机（沙箱里跑不起 GUI）
 * 用 Node 直接跑单测证明它对。
 */
'use strict';

function rectOf(display) {
  if (!display) return null;
  return display.workArea || display.bounds || null;
}

// 点是否落在某个矩形里
function contains(rect, point) {
  return !!rect && point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

// 找到点所在的显示器；都不命中时取中心最近的那块（显示器被拔掉/换分辨率时用得到）
function displayForPoint(point, displays) {
  const list = (displays || []).filter(d => rectOf(d));
  if (!list.length) return null;
  for (let i = 0; i < list.length; i++) {
    if (contains(rectOf(list[i]), point)) return list[i];
  }
  let best = null;
  let bestDist = Infinity;
  list.forEach(d => {
    const a = rectOf(d);
    const dx = a.x + a.width / 2 - point.x;
    const dy = a.y + a.height / 2 - point.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) { bestDist = dist; best = d; }
  });
  return best;
}

// 预设定位：area 为显示器可用区域，size 为窗口**当前**尺寸
function computePresetPosition(preset, area, size) {
  const a = area || { x: 0, y: 0, width: 1920, height: 1080 };
  const w = Math.max(1, Math.round(size && size.width ? size.width : 1));
  const h = Math.max(1, Math.round(size && size.height ? size.height : 1));
  switch (preset) {
    case 'top-left': return { x: a.x, y: a.y };
    case 'top-right': return { x: a.x + a.width - w, y: a.y };
    case 'bottom-left': return { x: a.x, y: a.y + a.height - h };
    case 'bottom-right': return { x: a.x + a.width - w, y: a.y + a.height - h };
    case 'center':
    default: return { x: a.x + Math.round((a.width - w) / 2), y: a.y + Math.round((a.height - h) / 2) };
  }
}

// 把位置夹进「窗口所在的那块显示器」（而不是主屏）。
// 窗口比可用区域还大时贴住左上角，保证标题/内容起点始终可见。
function clampPositionToDisplays(pos, size, displays, anchorPoint) {
  const w = Math.max(1, Math.round(size && size.width ? size.width : 1));
  const h = Math.max(1, Math.round(size && size.height ? size.height : 1));
  const display = displayForPoint(anchorPoint || pos, displays);
  const a = rectOf(display);
  if (!a) return { x: Math.round(pos.x), y: Math.round(pos.y) };
  const minX = a.x;
  const minY = a.y;
  const maxX = a.x + a.width - w;
  const maxY = a.y + a.height - h;
  return {
    x: Math.round(Math.min(Math.max(pos.x, minX), Math.max(minX, maxX))),
    y: Math.round(Math.min(Math.max(pos.y, minY), Math.max(minY, maxY))),
  };
}

// 关灯层级自愈：时钟必须压在关灯背景板之上。满足任一条件就该抢回：
//   ① 时钟丢了置顶（闹钟结束、设置窗口改图层模式、别的应用全屏都可能造成）；
//   ② 背景板被提升成置顶（Windows 对「窗口进入全屏」的处理会把它抬上来）。
// 关灯没开时不动 —— 那种情况层级归用户配置管。
function shouldRaiseClockAboveBoards(state) {
  const s = state || {};
  if (!s.lightsOffActive) return false;
  return s.clockTopmost !== true || s.boardPromoted === true;
}

module.exports = { computePresetPosition, clampPositionToDisplays, displayForPoint, contains, rectOf, shouldRaiseClockAboveBoards };
