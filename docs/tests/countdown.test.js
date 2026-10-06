// docs/tests/countdown.test.js — [v1.0.5.7] 倒计时纯逻辑自测
//
// 不依赖 Electron / 网络，直接用 node 跑：
//   node docs/tests/countdown.test.js
// 覆盖：时长解析与格式化、名称归一、id 校验、记录归一时序、状态迁移、
//       每拍判定（wait/ring/expire）、列表摘要、创建/编辑校验。

'use strict';

const path = require('path');
const CD = require(path.join(__dirname, '..', '..', 'countdown.js'));

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) { pass++; return true; }
  fail++;
  failures.push(name + (extra === undefined ? '' : '  →  ' + extra));
  return false;
}
function eq(name, actual, expected) {
  return ok(name, actual === expected, 'got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected));
}

// 固定时间轴，避开 Date.now() 带来的不确定
const T0 = 1759600000000; // 2025-10-04T...Z 附近（具体值不重要，只要固定）

// ========== 时长格式化 ==========
eq('formatClock 0 → 00:00', CD.formatClock(0), '00:00');
eq('formatClock 59 → 00:59', CD.formatClock(59), '00:59');
eq('formatClock 90 → 01:30', CD.formatClock(90), '01:30');
eq('formatClock 3599 → 59:59', CD.formatClock(3599), '59:59');
eq('formatClock 3600 → 01:00:00（小时补零，保持等宽）', CD.formatClock(3600), '01:00:00');
eq('formatClock 3661 → 01:01:01', CD.formatClock(3661), '01:01:01');
eq('formatClock 负数 → 00:00', CD.formatClock(-5), '00:00');
eq('formatDuration 300000ms → 05:00', CD.formatDuration(300000), '05:00');
eq('formatRemaining 向上取整（299999ms → 05:00，不是 04:59）', CD.formatRemaining(299999), '05:00');
eq('formatRemaining 恰好 299000ms → 04:59', CD.formatRemaining(299000), '04:59');
eq('formatRemaining 0 → 00:00', CD.formatRemaining(0), '00:00');
eq('formatRemaining 负数 → 00:00', CD.formatRemaining(-1000), '00:00');
eq('formatRemaining 超过 1 小时带小时位', CD.formatRemaining(3661000), '01:01:01');

// ========== 时长解析 ==========
eq('parse "5" → 5 分钟', CD.parseDurationText('5'), 300000);
eq('parse "90" → 90 分钟', CD.parseDurationText('90'), 5400000);
eq('parse "1:30" → 1 分 30 秒（与 MM:SS 显示口径一致）', CD.parseDurationText('1:30'), 90000);
eq('parse "1:02:03" → 1 时 2 分 3 秒', CD.parseDurationText('1:02:03'), 3723000);
eq('parse "2h30m" → 2.5 小时', CD.parseDurationText('2h30m'), 9000000);
eq('parse "2h30m10s"', CD.parseDurationText('2h30m10s'), 9010000);
eq('parse "45s" → 45 秒', CD.parseDurationText('45s'), 45000);
eq('parse "  10 m  " 容忍空白', CD.parseDurationText('  10 m  '), 600000);
eq('parse "" → null', CD.parseDurationText(''), null);
eq('parse 空值 → null', CD.parseDurationText(null), null);
eq('parse "abc" → null', CD.parseDurationText('abc'), null);
eq('parse "0" → null（零时长无意义）', CD.parseDurationText('0'), null);
eq('parse 超过 24 小时 → null', CD.parseDurationText('25h'), null);
eq('parse "3s" → 3 秒（在下限之上）', CD.parseDurationText('3s'), 3000);
eq('parse "1" → 60 秒（纯数字按分钟）', CD.parseDurationText('1'), 60000);
eq('parse "0s" → null（零时长）', CD.parseDurationText('0s'), null);

// ========== 时长范围 ==========
eq('clampDuration 1000 合法', CD.clampDuration(1000), 1000);
eq('clampDuration 999 低于下限 → null', CD.clampDuration(999), null);
eq('clampDuration 0 → null', CD.clampDuration(0), null);
eq('clampDuration 24h 合法', CD.clampDuration(86400000), 86400000);
eq('clampDuration 24h+1 → null', CD.clampDuration(86400001), null);
eq('clampDuration NaN → null', CD.clampDuration('abc'), null);
eq('clampDuration 小数四舍五入', CD.clampDuration(1500.6), 1501);

// ========== 名称归一 ==========
eq('normalizeName 去首尾空白', CD.normalizeName('  煮面  '), '煮面');
eq('normalizeName 剔换行/制表等控制字符', CD.normalizeName('煮\n面\t汤'), '煮面汤');
eq('normalizeName 折叠连续空白', CD.normalizeName('a   b'), 'a b');
eq('normalizeName 截断 40 字', CD.normalizeName('x'.repeat(60)).length, 40);
eq('normalizeName 非字符串 → 空', CD.normalizeName(null), '');
eq('normalizeName 数字 → 字符串', CD.normalizeName(123), '123');
ok('normalizeName 中文不被剥掉', CD.normalizeName('番茄钟') === '番茄钟');

// ========== id ==========
ok('newId 形状合法', CD.isValidId(CD.newId(T0, 'a1b2c3')));
eq('newId 可注入', CD.newId(T0, 'xy9'), 'cd_1759600000000_xy9');
ok('isValidId 拒绝目录穿越', !CD.isValidId('../../etc/passwd'));
ok('isValidId 拒绝带分号的注入', !CD.isValidId('cd_1_a;drop'));
ok('isValidId 拒绝大写/空格', !CD.isValidId('cd_1_A B'));
ok('isValidId 拒绝缺少 cd_ 前缀', !CD.isValidId('1759600000000_a1b2c3'));
ok('isValidId 拒绝非字符串', !CD.isValidId(null) && !CD.isValidId(123));

// ========== 构造 / 剩余时间 ==========
const cd5 = CD.makeCountdown({ id: 'cd_1759600000000_a1b2c3', name: '煮面', durationMs: 300000 }, T0);
eq('makeCountdown 起始剩余 = 整段', cd5.remainingMs, 300000);
eq('makeCountdown state = running', cd5.state, 'running');
eq('makeCountdown nextTrigger = now + 时长', cd5.nextTrigger, new Date(T0 + 300000).toISOString());
eq('makeCountdown 默认声音 beep', cd5.sound, 'beep');
eq('effectiveRemaining 起跑瞬间 ≈ 整段', CD.effectiveRemaining(cd5, T0), 300000);
eq('effectiveRemaining 过 1 分钟后', CD.effectiveRemaining(cd5, T0 + 60000), 240000);
eq('effectiveRemaining 到点后不为负', CD.effectiveRemaining(cd5, T0 + 999999), 0);

// ========== 暂停 / 继续 ==========
const paused = CD.pauseCountdown(cd5, T0 + 60000);
eq('暂停 → state = paused', paused.state, 'paused');
eq('暂停 → 冻结剩余量', paused.remainingMs, 240000);
eq('暂停 → 清空 nextTrigger', paused.nextTrigger, null);
eq('暂停态剩余时间不再流逝', CD.effectiveRemaining(paused, T0 + 999999), 240000);
const resumed = CD.resumeCountdown(paused, T0 + 999999);
eq('继续 → state = running', resumed.state, 'running');
eq('继续 → 从冻结剩余量重新起算', resumed.nextTrigger, new Date(T0 + 999999 + 240000).toISOString());
eq('继续 → 剩余量不变', CD.effectiveRemaining(resumed, T0 + 999999), 240000);
ok('暂停/继续不改原对象（纯函数）', cd5.state === 'running' && cd5.nextTrigger !== null);

// ========== 改时长 / 再来一次 ==========
const retimed = CD.retimeCountdown(paused, 600000, T0);
eq('改时长 → durationMs 更新', retimed.durationMs, 600000);
eq('改时长 → 从新时长重新计时', retimed.remainingMs, 600000);
eq('改时长 → 恢复 running', retimed.state, 'running');
eq('改时长非法值 → 退回原时长', CD.retimeCountdown(paused, -1, T0).durationMs, 300000);
eq('再来一次 → 用原时长重置', CD.restartCountdown(retimed, T0).durationMs, 600000);
eq('再来一次 → 剩余回到整段', CD.effectiveRemaining(CD.restartCountdown(retimed, T0), T0), 600000);

// ========== 每拍判定 ==========
const GRACE = 5 * 60 * 1000;
eq('tickDecision 未到点 → wait', CD.tickDecision(cd5, T0 + 1000, GRACE), 'wait');
eq('tickDecision 准点 → ring', CD.tickDecision(cd5, T0 + 300000, GRACE), 'ring');
eq('tickDecision 迟到 1 分钟（grace 内）→ ring', CD.tickDecision(cd5, T0 + 360000, GRACE), 'ring');
eq('tickDecision 迟到 6 分钟（超 grace）→ expire', CD.tickDecision(cd5, T0 + 300000 + 360000, GRACE), 'expire');
eq('tickDecision 暂停态 → wait', CD.tickDecision(paused, T0 + 9999999, GRACE), 'wait');
eq('tickDecision 坏记录 → wait', CD.tickDecision(null, T0, GRACE), 'wait');
eq('tickDecision nextTrigger 非法 → wait', CD.tickDecision({ state: 'running', nextTrigger: 'x' }, T0, GRACE), 'wait');

// ========== 记录归一 ==========
ok('normalizeRecord 合法记录通过', !!CD.normalizeRecord(cd5));
eq('normalizeRecord 去掉多余字段', CD.normalizeRecord({ ...cd5, evil: 1 }).evil, undefined);
eq('normalizeRecord 补 snake 默认值', CD.normalizeRecord({ ...cd5, snoozeMinutes: undefined }).snoozeMinutes, 5);
eq('normalizeRecord 剔除坏 id', CD.normalizeRecord({ ...cd5, id: '../x' }), null);
eq('normalizeRecord 剔除坏时长', CD.normalizeRecord({ ...cd5, durationMs: 0 }), null);
eq('normalizeRecord 剔除 running 但无 nextTrigger', CD.normalizeRecord({ ...cd5, nextTrigger: null }), null);
ok('normalizeRecord 暂停态可以没有 nextTrigger',
  !!CD.normalizeRecord({ ...cd5, state: 'paused', nextTrigger: null, remainingMs: 1000 }));
eq('normalizeRecord 暂停态非法剩余量 → 退回整段', CD.normalizeRecord({ ...cd5, state: 'paused', nextTrigger: null, remainingMs: 0 }).remainingMs, 300000);
eq('normalizeRecord 非法 state → 视为 running', CD.normalizeRecord({ ...cd5, state: 'weird' }).state, 'running');
eq('normalizeRecord 非法声音 → beep', CD.normalizeRecord({ ...cd5, sound: 'nuke' }).sound, 'beep');
eq('normalizeRecord 数组 → null', CD.normalizeRecord([]), null);
eq('normalizeRecord 字符串 → null', CD.normalizeRecord('x'), null);
// 手机端最可能的攻击面：超长名称 / 换行注入
eq('normalizeRecord 长名称被截断', CD.normalizeRecord({ ...cd5, name: 'y'.repeat(200) }).name.length, 40);

// ========== 对外视图 ==========
const pub = CD.toPublic(cd5, T0 + 60000);
eq('toPublic 剩余量按请求时刻算', pub.remainingMs, 240000);
eq('toPublic 带 endAt 供本地倒扣', pub.endAt, cd5.nextTrigger);
eq('toPublic 不含 snooze 内部字段', pub.snoozeMinutes, undefined);
eq('toPublic 暂停态 endAt = null', CD.toPublic(paused, T0).endAt, null);
eq('toPublic null → null', CD.toPublic(null, T0), null);

// ========== 摘要 ==========
eq('summarize 空列表 count = 0', CD.summarize([], T0).count, 0);
eq('summarize 空列表 nearest = null', CD.summarize([], T0).nearest, null);
const cShort = CD.makeCountdown({ id: 'cd_1759600000001_aaaaaa', name: '短', durationMs: 60000 }, T0);
const cLong = CD.makeCountdown({ id: 'cd_1759600000002_bbbbbb', name: '长', durationMs: 3600000 }, T0);
const sum = CD.summarize([cLong, cShort], T0);
eq('summarize 计数', sum.count, 2);
eq('summarize running 计数', sum.running, 2);
eq('summarize 取最近到期的那个', sum.nearest.name, '短');
eq('summarize 带格式化文案', sum.nearest.text, '01:00');
const sumPaused = CD.summarize([CD.pauseCountdown(cLong, T0)], T0);
eq('summarize 全暂停 → running = 0', sumPaused.running, 0);
eq('summarize 全暂停 → paused = 1', sumPaused.paused, 1);
eq('summarize 全暂停 → nearest.state = paused', sumPaused.nearest.state, 'paused');
eq('summarize 忽略非对象项', CD.summarize([null, 1, undefined], T0).count, 0);

// ========== 贪睡间隔 ==========
eq('snoozeMs 默认 5 分钟', CD.snoozeMs({}), 300000);
eq('snoozeMs 1 时 2 分 3 秒', CD.snoozeMs({ snoozeHours: 1, snoozeMinutes: 2, snoozeSeconds: 3 }), 3723000);
eq('snoozeMs 全零 → 兜底 1 秒', CD.snoozeMs({ snoozeHours: 0, snoozeMinutes: 0, snoozeSeconds: 0 }), 1000);

// ========== 创建校验 ==========
const vc = CD.validateCreate({ name: '  番茄钟  ', durationMs: 1500000 }, T0, { defaultName: '倒计时' });
ok('validateCreate 合法', vc.ok);
eq('validateCreate 名称已归一', vc.value.name, '番茄钟');
eq('validateCreate 到点时刻正确', vc.value.nextTrigger, new Date(T0 + 1500000).toISOString());
ok('validateCreate 缺名称 → 用兜底名', CD.validateCreate({ durationMs: 1000 }, T0, { defaultName: '倒计时' }).value.name === '倒计时');
ok('validateCreate 无兜底名 → Countdown', CD.validateCreate({ durationMs: 1000 }, T0).value.name === 'Countdown');
eq('validateCreate 坏时长 → 拒绝', CD.validateCreate({ durationMs: 0 }, T0).ok, false);
eq('validateCreate 坏时长错误码', CD.validateCreate({ durationMs: 0 }, T0).error, 'bad-duration');
eq('validateCreate 超 24h → 拒绝', CD.validateCreate({ durationMs: 86400001 }, T0).ok, false);
eq('validateCreate 非对象 payload → 拒绝', CD.validateCreate('x', T0).ok, false);
eq('validateCreate 剔除非法声音', CD.validateCreate({ durationMs: 1000, sound: 'boom' }, T0).value.sound, 'beep');
eq('validateCreate snoozeCount 夹取', CD.validateCreate({ durationMs: 1000, snoozeCount: 99999 }, T0).value.snoozeCount, 999);
ok('validateCreate 生成合法 id', CD.isValidId(CD.validateCreate({ durationMs: 1000 }, T0).value.id));

// ========== 编辑校验 ==========
eq('validateUpdate 空对象 → 拒绝', CD.validateUpdate({}).ok, false);
eq('validateUpdate 空对象错误码', CD.validateUpdate({}).error, 'empty-update');
eq('validateUpdate 只改名称', CD.validateUpdate({ name: 'x' }).value.name, 'x');
eq('validateUpdate 改名称不误改时长', CD.validateUpdate({ name: 'x' }).value.durationMs, undefined);
eq('validateUpdate 坏时长 → 拒绝', CD.validateUpdate({ durationMs: -5 }).ok, false);
eq('validateUpdate 非对象 → 拒绝', CD.validateUpdate(null).ok, false);
eq('validateUpdate 归一名称（换行属控制字符，直接剔除）', CD.validateUpdate({ name: ' a\nb ' }).value.name, 'ab');
eq('validateUpdate 归一名称（普通空格折叠）', CD.validateUpdate({ name: ' a   b ' }).value.name, 'a b');

// ========== 上限常量 ==========
ok('MAX_ITEMS 是 50', CD.MAX_ITEMS === 50);
ok('MAX_NAME_LEN 是 40', CD.MAX_NAME_LEN === 40);

// ========== 汇总 ==========
console.log('countdown 自测：pass=' + pass + ' fail=' + fail);
if (failures.length) {
  console.log('\n失败项：');
  failures.forEach(f => console.log('  ✗ ' + f));
}
process.exit(fail ? 1 : 0);
