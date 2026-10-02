/* window-position.test.js — 位置数学的回归测试
 *
 * 跑法：node docs/tests/window-position.test.js
 * 为什么单独留一份：这套数学错了很久（预设按写死的 800×400 算，窗口被字号撑开后右下角/居中就偏），
 * 而且沙箱里跑不起 GUI，只有纯函数单测能在没有界面的环境里证明它是对的。
 */
'use strict';
const path = require('path');
const { computePresetPosition, clampPositionToDisplays, displayForPoint, shouldRaiseClockAboveBoards } = require(path.join(__dirname, '..', '..', 'window-layout.js'));

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++; else fail++;
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + ' = ' + JSON.stringify(actual) + (ok ? '' : '（期望 ' + JSON.stringify(expected) + '）'));
}

const AREA = { x: 0, y: 0, width: 1920, height: 1040 };       // 主屏可用区
const RIGHT = { x: 1920, y: 0, width: 1920, height: 1040 };    // 右侧副屏
const LEFT = { x: -1920, y: 0, width: 1920, height: 1040 };    // 左侧副屏
const D = a => ({ workArea: a, bounds: a });

console.log('--- 预设：必须按「当前尺寸」贴住目标边 ---');
// 与旧行为一致性：窗口就是 800×400 时，结果等同旧代码的 screenW-800 / screenH-400
check('bottom-right 800×400（与旧行为一致）', computePresetPosition('bottom-right', AREA, { width: 800, height: 400 }), { x: 1120, y: 640 });
// 修复点：窗口被撑大后，右下角仍然贴住右下角
const br = computePresetPosition('bottom-right', AREA, { width: 1200, height: 520 });
check('bottom-right 1200×520', br, { x: 720, y: 520 });
check('bottom-right 1200×520 右边缘仍贴合', br.x + 1200, 1920);
check('bottom-right 1200×520 下边缘仍贴合', br.y + 520, 1040);
const tr = computePresetPosition('top-right', AREA, { width: 1200, height: 520 });
check('top-right 1200×520 贴合右上', [tr.x + 1200, tr.y], [1920, 0]);
const bl = computePresetPosition('bottom-left', AREA, { width: 1200, height: 520 });
check('bottom-left 1200×520 贴合左下', [bl.x, bl.y + 520], [0, 1040]);
check('top-left 与尺寸无关', computePresetPosition('top-left', AREA, { width: 1200, height: 520 }), { x: 0, y: 0 });

console.log('--- 预设：居中要真的居中 ---');
[[800, 400], [1200, 520], [1919, 1039]].forEach(([w, h]) => {
  const c = computePresetPosition('center', AREA, { width: w, height: h });
  // 奇数尺寸落在半像素上，允许 0.5px 的取整偏差
  check('center ' + w + '×' + h + ' 水平居中', Math.abs(c.x + w / 2 - AREA.width / 2) <= 0.5, true);
  check('center ' + w + '×' + h + ' 垂直居中', Math.abs(c.y + h / 2 - AREA.height / 2) <= 0.5, true);
});
check('未知预设回退居中', computePresetPosition('nope', AREA, { width: 800, height: 400 }), computePresetPosition('center', AREA, { width: 800, height: 400 }));

console.log('--- 自定义位置：必须留在窗口所在的那块屏（这是原来的 bug） ---');
const displays = [D(AREA), D(RIGHT)];
check('副屏坐标不被拉回主屏', clampPositionToDisplays({ x: 2600, y: 300 }, { width: 800, height: 400 }, displays), { x: 2600, y: 300 });
// 旧实现：Math.min(2600, 1920-100) = 1820，会跳到主屏
check('旧实现会把 2600 夹成 1820（反证）', Math.min(2600, 1920 - 100), 1820);
check('右边缘越界夹回副屏', clampPositionToDisplays({ x: 3700, y: 300 }, { width: 800, height: 400 }, displays), { x: 3040, y: 300 });
check('上方越界夹回顶部', clampPositionToDisplays({ x: 2600, y: -50 }, { width: 800, height: 400 }, displays), { x: 2600, y: 0 });

console.log('--- 自定义位置：左侧负坐标副屏 / 窗口比屏还大 / 屏幕已拔掉 ---');
const threeDisplays = [D(LEFT), D(AREA), D(RIGHT)];
check('左侧副屏负坐标保持', clampPositionToDisplays({ x: -1500, y: 100 }, { width: 800, height: 400 }, threeDisplays), { x: -1500, y: 100 });
check('窗口比屏还大时贴左上角', clampPositionToDisplays({ x: 2400, y: 300 }, { width: 2200, height: 1200 }, displays), { x: 1920, y: 0 });
check('屏幕被拔掉时落到最近的屏', clampPositionToDisplays({ x: 5000, y: 500 }, { width: 800, height: 400 }, displays), { x: 3040, y: 500 });
check('没有显示器信息时原样返回', clampPositionToDisplays({ x: 2600, y: 300 }, { width: 800, height: 400 }, []), { x: 2600, y: 300 });

console.log('--- 显示器命中判定 ---');
check('命中主屏', displayForPoint({ x: 100, y: 100 }, displays).workArea.x, 0);
check('命中副屏', displayForPoint({ x: 2000, y: 100 }, displays).workArea.x, 1920);
check('落在缝隙外时取最近', displayForPoint({ x: 9999, y: 100 }, displays).workArea.x, 1920);
check('无显示器返回 null', displayForPoint({ x: 0, y: 0 }, []), null);

console.log('--- 关灯层级自愈的判定规则 ---');
check('关灯中·时钟丢了置顶 → 抢回', shouldRaiseClockAboveBoards({ lightsOffActive: true, clockTopmost: false, boardPromoted: false }), true);
check('关灯中·背景板被抬成置顶 → 抢回', shouldRaiseClockAboveBoards({ lightsOffActive: true, clockTopmost: true, boardPromoted: true }), true);
check('关灯中·一切正常 → 不动', shouldRaiseClockAboveBoards({ lightsOffActive: true, clockTopmost: true, boardPromoted: false }), false);
check('未关灯·即使时钟不置顶 → 不动（归用户配置管）', shouldRaiseClockAboveBoards({ lightsOffActive: false, clockTopmost: false, boardPromoted: false }), false);
check('未关灯·背景板被置顶 → 不动', shouldRaiseClockAboveBoards({ lightsOffActive: false, clockTopmost: true, boardPromoted: true }), false);

console.log('\n合计：' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
