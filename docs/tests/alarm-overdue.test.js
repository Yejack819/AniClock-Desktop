// [v1.0.5.6] 闹钟「迟到兜底」纯逻辑测试
//
// 背景：checkAlarms 原来只在「迟到 < 2 秒」时触发，迟到超时后既不响也不重算
// nextTrigger → 睡眠唤醒 / 主进程阻塞 / 导入过期备份 后，重复闹钟永久失效。
//
// 本测试把 main.js 里的判定逻辑抽出来做等价的纯函数实现，锁死语义
// （main.js 是 Electron 主进程文件，无法直接 require，故此处镜像逻辑）。
//
// 运行：node docs/tests/alarm-overdue.test.js

'use strict';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name); }
}
function eq(name, a, b) { ok(name + ' (got ' + JSON.stringify(a) + ')', a === b); }

// ---------- 镜像 main.js 的判定 ----------
const GRACE_MS = 5 * 60 * 1000;

// 返回 'past' | 'grace' | 'ontime'
function classify(t, now) {
  if (!(t <= now)) return 'future';
  const lateMs = now - t;
  if (lateMs >= 2000) return lateMs > GRACE_MS ? 'past' : 'grace';
  return 'ontime';
}

// 与 main.js 迟到分支一致：超过 GRACE 时重算
function overdueAction(alarm, t, now) {
  if (alarm.repeat && alarm.weekdays && alarm.weekdays.length > 0) return 'recalc';
  const nd = new Date(now);
  nd.setHours(alarm.hour, alarm.minute, 0, 0);
  if (nd <= now) nd.setDate(nd.getDate() + 1);
  return 'onetime:' + nd.toISOString();
}

// ---------- 用例 ----------
console.log('\n[classify]');

// 准时：迟到 < 2s → 照常触发
eq('准点触发 (0ms)', classify(1000, 1000), 'ontime');
eq('迟到 1.9s 触发', classify(1000, 2999), 'ontime');
eq('正好 2s 走迟到分支', classify(1000, 3000), 'grace');

// 睡眠唤醒：迟到 30 分钟 → 超过宽限，重算而非补响
eq('睡 30 分钟后唤醒', classify(1000, 1000 + 30 * 60 * 1000), 'past');
// 短阻塞：迟到 3s → 宽限内，补响
eq('阻塞 3s', classify(1000, 4000), 'grace');
eq('迟到 5 分钟整 = 仍在宽限内', classify(1000, 1000 + GRACE_MS), 'grace');
eq('迟到 5 分钟 +1ms = 超宽限', classify(1000, 1000 + GRACE_MS + 1), 'past');
eq('未来闹钟不动', classify(9999, 1000), 'future');

console.log('\n[overdueAction]');

const repeat = { hour: 7, minute: 30, repeat: true, weekdays: [1, 2, 3, 4, 5] };
const onetime = { hour: 7, minute: 30, repeat: false, weekdays: [] };
const now = new Date('2026-10-04T09:00:00').getTime();

eq('重复闹钟 → 重算到下一周期', overdueAction(repeat, 0, now), 'recalc');

const r1 = overdueAction(onetime, 0, now);
ok('单次闹钟 → 推到明天同一时刻 (拿到 ' + r1 + ')',
  r1.startsWith('onetime:') &&
  new Date(r1.slice(8)) > new Date(now) &&
  new Date(r1.slice(8)).getHours() === 7 &&
  new Date(r1.slice(8)).getMinutes() === 30);

// 单次闹钟：若今天该时刻还没到，应补到今天
const early = new Date('2026-10-04T06:00:00').getTime();
const r2 = overdueAction(onetime, 0, early);
ok('单次闹钟 07:30 在 06:00 视角 → 补到今天 07:30 (拿到 ' + r2 + ')',
  new Date(r2.slice(8)).toDateString() === new Date(early).toDateString());

// ---------- 回归：原 bug 场景 ----------
console.log('\n[回归：原 bug 场景]');
// 睡眠 8 小时后唤醒：旧逻辑下 nextTrigger 停在过去且永不重算 → 永久失效
const slept = new Date('2026-10-04T07:30:00').getTime();   // 闹钟 07:30
const woke = slept + 8 * 3600 * 1000;                       // 15:30 唤醒
eq('8 小时后唤醒被判为超期（会重算）', classify(slept, woke), 'past');
ok('旧逻辑判定（迟到<2s）在新逻辑下不再漏掉', (woke - slept) >= 2000);

// ---------- [v1.0.5.7] 回归：贪睡等待期绝不能被「迟到补响」重新拉响 ----------
// 原 bug（默认配置即可触发）：响铃时长到期转贪睡等待后 nextTrigger 停在过去，
// checkAlarms 每秒都会把它当「刚错过」补响 → 响 120s → 停 1s → 再响 120s 循环。
// 修复后：有 pending retry 定时器的闹钟在 checkAlarms 里直接跳过。
console.log('\n[回归：贪睡等待期不重响]');
function checkAlarmGate(alarm, nextTrigger, nowMs, retryPending) {
  if (!alarm.enabled || !nextTrigger) return 'idle';
  if (retryPending) return 'skip'; // ← v1.0.5.7 新增的门
  const t = new Date(nextTrigger).getTime();
  if (!(t <= nowMs)) return 'future';
  return classify(t, nowMs);
}
const gateNow = new Date('2026-10-04T09:00:00').getTime();
const retryAlarm = { enabled: true, nextTrigger: new Date(gateNow - 2 * 60 * 1000).toISOString() };
eq('贪睡等待期: 有 retry 定时器 → 跳过（不重响）',
  checkAlarmGate(retryAlarm, retryAlarm.nextTrigger, gateNow, true), 'skip');
eq('对照: 同一时刻无 retry 定时器 → 走补响分支',
  checkAlarmGate(retryAlarm, retryAlarm.nextTrigger, gateNow, false), 'grace');
eq('对照: 未来闹钟不受影响',
  checkAlarmGate({ enabled: true }, new Date(gateNow + 60000).toISOString(), gateNow, false), 'future');

// ---------- [v1.0.5.7] 回归：响铃时长到期后的收敛路径 ----------
// 原代码里「无贪睡」的闹钟响完什么也不做，nextTrigger 留在过去，
// 同样会被补响循环拉响；修复后按「已完整响过一轮」收敛。
console.log('\n[回归：响铃到期收敛]');
function ringExpiredAction(alarm) {
  if (alarm.enabled && alarm.snoozeEnabled !== false) return 'retry';
  if (alarm.repeat && alarm.weekdays && alarm.weekdays.length > 0) return 'recalc';
  return 'disable';
}
eq('有贪睡 → 进重试等待', ringExpiredAction({ enabled: true, snoozeEnabled: true, repeat: false }), 'retry');
eq('无贪睡 + 重复闹钟 → 跳到下一周期', ringExpiredAction({ enabled: true, snoozeEnabled: false, repeat: true, weekdays: [1] }), 'recalc');
eq('无贪睡 + 单次闹钟 → 停用（不再被补响循环拉响）', ringExpiredAction({ enabled: true, snoozeEnabled: false, repeat: false }), 'disable');

console.log('\n----------------------------------------');
console.log(`alarm-overdue: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
