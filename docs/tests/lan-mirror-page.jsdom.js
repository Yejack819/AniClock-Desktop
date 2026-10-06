/* lan-mirror-page.jsdom.js — [v1.0.5.7] 手机端页面的「无窗口」验收（jsdom）
 *
 * 验的是手机页上的倒计时抽屉：快照合并、卡片渲染、本地倒扣、写请求契约（令牌头）、
 * 二次确认删除、抽屉开合。跑的是页面里那段真实的内联脚本，不是复刻。
 *
 * 跑法（jsdom 只装在项目外，不污染项目依赖）：
 *   npm install jsdom --registry=https://registry.npmmirror.com --no-audit --no-fund
 *   NODE_PATH=$HOME/.workbuddy/binaries/node/workspace/node_modules node docs/tests/lan-mirror-page.jsdom.js
 *
 * 边界：jsdom 没有真实网络与触摸事件模型 —— 这里只替换 window.fetch 并派发合成事件，
 * 所以「触控手感」验不了，能验的是数据流与 DOM 结果。真机触控由
 * docs/tests/lan-mirror-app-smoke.js + 手工扫码覆盖。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'lan-mirror-page.html'), 'utf-8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('[PASS] ' + name); return true; }
  fail++;
  failures.push(name + (extra === undefined ? '' : '  →  ' + extra));
  console.log('[FAIL] ' + name + (extra === undefined ? '' : '  →  ' + extra));
  return false;
}
function eq(name, actual, expected) {
  return ok(name, actual === expected, 'got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected));
}

const CFG = {
  language: 'zh', color: '#ffffff', bgColor: 'rgba(0,0,0,0)', fontFamily: 'Arial',
  infoScale: 0.3, hourFormat: 'auto', ampmCorner: 'top-right', showSeconds: true,
  showDate: true, showWeekday: true, datePosition: 'below', autoColor: false, extraTimezones: [],
  animType: 'flip', animFlipDir: 'up', animScaleDir: 'shrink', animDuration: 350,
  staggerDelay: 0, staggerDirection: 'ltr', timeOffsetMs: 0, autoAdjustEnabled: false,
  autoAdjustIntervalSec: 3600, autoAdjustAmountMs: 0, autoAdjustBaseMs: 0, autoAdjustAnchor: 0,
  countdownDefaultMinutes: 7, // 故意不是默认的 5：验证页面会跟随宿主偏好
};

const calls = [];
let serverItems = [];

function jsonRes(obj, code) {
  return Promise.resolve({
    ok: (code || 200) < 400, status: code || 200,
    json: () => Promise.resolve(obj),
  });
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://192.168.1.9:8788/',
  beforeParse(win) {
    // 页面脚本在解析期就会跑（pull() 立刻发请求），所以桩必须在这里装
    win.fetch = function (url, opt) {
      opt = opt || {};
      const u = String(url);
      const method = String(opt.method || 'GET').toUpperCase();
      calls.push({ url: u, method, headers: opt.headers || {}, body: opt.body });
      if (/\/api\/write-nonce$/.test(u)) return jsonRes({ nonce: 'n-' + calls.length, ttlMs: 300000 });
      if (/\/api\/state$/.test(u)) {
        return jsonRes({ now: Date.now(), readOnly: true, cfg: CFG, countdownCanEdit: true, countdowns: serverItems });
      }
      if (/\/api\/countdowns$/.test(u) && method === 'POST') {
        const b = JSON.parse(opt.body || '{}');
        serverItems = serverItems.concat([{
          id: 'cd_000001_a1', name: b.name || 'Countdown', durationMs: b.durationMs,
          remainingMs: b.durationMs, state: 'running',
          endAt: new Date(Date.now() + b.durationMs).toISOString(),
        }]);
        return jsonRes({ ok: true, value: null, items: serverItems });
      }
      return jsonRes({ ok: true, value: null, items: serverItems });
    };
  },
});
const w = dom.window;
const d = w.document;
const $ = id => d.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));

w.addEventListener('error', e => { fail++; failures.push('页面运行期异常: ' + ((e.error && e.error.stack) || e.message)); });

(async () => {
  await wait(90);

  // ---- 1) 快照合并 ----
  // [v1.0.5.7] 「一条都没有」**不等于**结构性隐藏：它和「全部暂停」同属「未激活」，
  // 胶囊照样出现（空态 = 新建入口），只是 3 秒没操作会淡出。
  // （做成 display:none 的话就是「怎么点都不出来」——实测踩过这个坑。）
  for (let i = 0; i < 30 && $('cd-fab').classList.contains('hidden-fab'); i++) await wait(20);
  ok('一条倒计时都没有 → 胶囊仍出现（空态，走未激活逻辑）',
    !$('cd-fab').classList.contains('hidden-fab'));
  ok('空态胶囊文案是「新建倒计时」入口',
    /倒计时|Countdown/.test($('cd-fab-text').textContent), $('cd-fab-text').textContent);
  eq('默认时长跟随宿主偏好（7 分钟）', $('cd-unit-m').textContent, '7');
  eq('默认分钟已按偏好归位（小时为 0）', $('cd-unit-h').textContent, '0');
  ok('首次进页面给出「长按时钟可调字号」提示', !$('hint').hidden && $('hint').classList.contains('show'));

  // ---- 2) 长按时钟 → 手机端显示面板 → 新建入口 → 抽屉 ----
  // jsdom 未必有 PointerEvent：页面会按 window.PointerEvent 是否存在选择绑定哪套事件
  const EV_DOWN = w.PointerEvent ? 'pointerdown' : 'mousedown';
  const EV_MOVE = w.PointerEvent ? 'pointermove' : 'mousemove';
  const EV_UP = w.PointerEvent ? 'pointerup' : 'mouseup';
  const pressDown = (x, y) => $('clock').dispatchEvent(
    new w.MouseEvent(EV_DOWN, { bubbles: true, clientX: x === undefined ? 200 : x, clientY: y === undefined ? 200 : y }));
  const pressMove = (x, y) => $('clock').dispatchEvent(
    new w.MouseEvent(EV_MOVE, { bubbles: true, clientX: x, clientY: y }));
  const pressUp = () => $('clock').dispatchEvent(new w.MouseEvent(EV_UP, { bubbles: true }));

  // 底部胶囊现在是「单击 = 进全屏 / 长按 = 开抽屉」：要开抽屉就必须手动走一遍长按
  const fabPress = () => $('cd-fab').dispatchEvent(
    new w.MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 600 }));
  async function fabLongPress() {
    fabPress();
    await wait(560);
    // 真机上长按抬手多半还会补一次 click → 页面会吞掉它（顺便把长按标志复位）
    $('cd-fab').click();
  }

  pressDown();
  ok('长按未满 520ms 时面板不出现', !$('ui-sheet').classList.contains('show'));
  await wait(620);
  ok('长按时钟 → 手机端显示面板打开', $('ui-sheet').classList.contains('show'));
  ok('面板遮罩同时显示', $('ui-scrim').classList.contains('show'));
  pressUp();
  ok('面板打开后一次性提示条收起', !$('hint').classList.contains('show'));
  ok('面板保留「新建倒计时」入口（可写宿主）', !$('ui-new-cd').hidden);

  $('ui-new-cd').click();
  ok('点「新建倒计时」→ 面板收起', !$('ui-sheet').classList.contains('show'));
  ok('点「新建倒计时」→ 倒计时抽屉打开', $('cd-sheet').classList.contains('show'));
  ok('抽屉遮罩同时显示', $('cd-scrim').classList.contains('show'));
  ok('空列表提示可见', !$('cd-empty').hidden);
  ok('可写模式下表单可见', !$('cd-form').hidden);

  // ---- 3) 快捷片 ----
  const chips = $('cd-chips').querySelectorAll('button');
  eq('快捷片 7 个', chips.length, 7);
  chips[2].click(); // 5 分钟
  eq('点快捷片 → 分钟 = 5', $('cd-unit-m').textContent, '5');
  eq('点快捷片 → 小时 = 0', $('cd-unit-h').textContent, '0');
  ok('点中的快捷片进入 active', chips[2].classList.contains('active'));

  // ---- 4) 步进器 ----
  const mUp = $('cd-chips').parentNode.querySelector('button[data-unit="m"][data-delta="1"]');
  mUp.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
  eq('步进器 +1 → 6 分钟', $('cd-unit-m').textContent, '6');
  $('cd-unit-s').parentNode.querySelector('button[data-unit="s"][data-delta="1"]')
    .dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
  eq('秒步进 → 1 秒', $('cd-unit-s').textContent, '1');
  eq('合计文案同步', $('cd-total').textContent.indexOf('06:01') >= 0, true);

  // ---- 5) 提交（新建）----
  $('cd-name').value = '泡面';
  $('cd-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await wait(40);

  const post = calls.filter(c => c.method === 'POST' && /\/api\/countdowns$/.test(c.url))[0];
  ok('提交发出了 POST /api/countdowns', !!post);
  if (post) {
    eq('写请求 Content-Type', post.headers['Content-Type'], 'application/json');
    ok('写请求带一次性令牌头 X-DC-Nonce', !!post.headers['X-DC-Nonce'], JSON.stringify(post.headers));
    eq('先领令牌再提交（先 GET write-nonce）',
      calls.indexOf(post) > calls.findIndex(c => /\/api\/write-nonce$/.test(c.url)), true);
    const sent = JSON.parse(post.body);
    eq('提交时长（6 分 1 秒）', sent.durationMs, 361000);
    eq('提交名称', sent.name, '泡面');
  }
  eq('写请求全部同源相对路径', calls.every(c => c.url.indexOf('http') !== 0), true);

  // ---- 6) 卡片渲染 + 本地倒扣 ----
  const cards = $('cd-list').querySelectorAll('.cd-card');
  eq('列表渲染 1 张卡片', cards.length, 1);
  ok('卡片时间形如 06:0x', /^06:0\d$/.test(cards[0].querySelector('.cd-time').textContent),
    cards[0].querySelector('.cd-time').textContent);
  eq('卡片名称', cards[0].querySelector('.cd-name').textContent, '泡面');
  eq('卡片状态文案', cards[0].querySelector('.cd-state').textContent, '进行中');
  eq('进度条有宽度', cards[0].querySelector('.cd-bar > i').style.width !== '', true);

  // ---- 7) 关闭抽屉 → 胶囊回到倒计时读数 ----
  $('cd-close').click();
  ok('点关闭 → 抽屉收起', !$('cd-sheet').classList.contains('show'));
  ok('关闭后胶囊回来', !$('cd-fab').classList.contains('hidden-fab'));
  ok('胶囊显示最近倒计时读数', /^\d\d:\d\d$/.test($('cd-fab-text').textContent.trim()),
    $('cd-fab-text').textContent);

  // ---- 8) 删除要二次确认 ----
  await fabLongPress();
  const delBtn = $('cd-list').querySelector('button[data-act="cancel"]');
  delBtn.click();
  ok('第一次点「取消」→ 进入确认态（不真删）', delBtn.classList.contains('armed'));
  eq('第一次点 → 文案变「确认取消」', delBtn.textContent, '确认取消');
  eq('确认态下没有发删除请求', calls.filter(c => /\/cancel$/.test(c.url)).length, 0);
  const before = calls.length;
  delBtn.click();
  await wait(40);
  ok('第二次点 → 真的发 cancel 请求',
    calls.length > before && calls.some(c => /\/api\/countdowns\/cd_000001_a1\/cancel$/.test(c.url)));

  // ---- 9) 只读宿主（老版本 / 未注入写入口）：看得到、改不了 ----
  {
    const dom2 = new JSDOM(html, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      url: 'http://192.168.1.9:8788/',
      beforeParse(win) {
        win.fetch = function (url) {
          if (/\/api\/write-nonce$/.test(String(url))) return jsonRes({ nonce: 'x', ttlMs: 300000 });
          return jsonRes({
            now: Date.now(), readOnly: true, cfg: CFG, countdownCanEdit: false,
            countdowns: [{
              id: 'cd_000002_b2', name: '只读', durationMs: 60000, remainingMs: 60000,
              state: 'running', endAt: new Date(Date.now() + 60000).toISOString(),
            }],
          });
        };
      },
    });
    await new Promise(r => setTimeout(r, 120));
    const d2 = dom2.window.document;
    ok('只读宿主：胶囊仍出现（因为有条目）', !d2.getElementById('cd-fab').classList.contains('hidden-fab'));
    d2.getElementById('cd-fab').dispatchEvent(
      new dom2.window.MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 600 }));
    await new Promise(r => setTimeout(r, 560));
    ok('只读宿主：表单隐藏', d2.getElementById('cd-form').hidden);
    ok('只读宿主：卡片照常渲染',
      d2.getElementById('cd-list').querySelectorAll('.cd-card').length === 1);
    ok('只读宿主：给出不可编辑的说明', !d2.getElementById('cd-readonly').hidden);
    dom2.window.close();
  }

  // ---- 10) 宿主完全不支持倒计时（老版本服务端）：页面不炸、不留痕 ----
  {
    const dom3 = new JSDOM(html, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      url: 'http://192.168.1.9:8788/',
      beforeParse(win) {
        win.fetch = win.fetch = function () {
          // 老版本快照：没有 countdowns / countdownCanEdit
          return jsonRes({ now: Date.now(), readOnly: true, cfg: CFG });
        };
      },
    });
    await new Promise(r => setTimeout(r, 100));
    const d3 = dom3.window.document;
    ok('老宿主：胶囊保持隐藏', d3.getElementById('cd-fab').classList.contains('hidden-fab'));
    ok('老宿主：抽屉结构仍在（不报错）', !!d3.getElementById('cd-sheet'));
    dom3.window.close();
  }

  // ---- 11) 提示音开关与音色：只存本机，默认开，可关 ----
  // 装 Web Audio / 震动桩：页面是在「调用时」才取 window.AudioContext 与 navigator.vibrate，
  // 所以解析期之后再注入同样有效，不需要重建 dom
  const audio = { osc: 0, start: 0 };
  w.AudioContext = function () {
    return {
      state: 'running', currentTime: 0, destination: {},
      resume() { return Promise.resolve(); },
      createOscillator() {
        audio.osc++;
        return {
          type: '', frequency: { setValueAtTime() {} }, connect() {},
          start() { audio.start++; }, stop() {},
        };
      },
      createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
      },
    };
  };
  const vib = [];
  try {
    Object.defineProperty(w.navigator, 'vibrate', {
      configurable: true, writable: true, value: p => { vib.push(p); return true; },
    });
  } catch (e) { /* jsdom 个别版本 navigator 只读：震动断言会自然跳过 */ }

  {
    eq('提示音默认开（🔔）', $('cd-sound-btn').textContent, '🔔');
    eq('提示音默认开（aria-pressed）', $('cd-sound-btn').getAttribute('aria-pressed'), 'true');
    eq('音色默认 beep（中文标签）', $('cd-sound-kind').textContent, '蜂鸣');
    eq('未动过设置时不碰 localStorage', w.localStorage.getItem('dc.cdSound'), null);

    $('cd-sound-btn').click();
    eq('点一下 → 关（🔕）', $('cd-sound-btn').textContent, '🔕');
    eq('关：aria-pressed=false', $('cd-sound-btn').getAttribute('aria-pressed'), 'false');
    ok('关：喇叭图标置灰', $('cd-sound-btn').classList.contains('off'));
    ok('关：音色 chip 一并置灰', $('cd-sound-kind').classList.contains('off'));
    eq('关的结果写入本机 localStorage', w.localStorage.getItem('dc.cdSound'), '0');

    $('cd-sound-btn').click();
    eq('再点 → 开', $('cd-sound-btn').textContent, '🔔');
    eq('开的结果写入本机 localStorage', w.localStorage.getItem('dc.cdSound'), '1');

    $('cd-sound-kind').click();
    eq('点音色：beep → chime', w.localStorage.getItem('dc.cdSoundKind'), 'chime');
    eq('音色 chip 文案跟随', $('cd-sound-kind').textContent, '铃音');
    $('cd-sound-kind').click();
    $('cd-sound-kind').click();
    eq('音色循环一圈回到 beep', w.localStorage.getItem('dc.cdSoundKind'), 'beep');
    $('cd-sound-kind').click(); // 定在 chime：到点用例可顺带验证「非 beep 音色」也走同一条通路
    eq('最终音色 = chime', w.localStorage.getItem('dc.cdSoundKind'), 'chime');
  }

  // ---- 12) 到点提醒：横幅 + 音频 + 震动，重复有限次、去重、可停 ----
  {
    ok('到点前横幅是收起的', $('cd-alert').classList.contains('hidden'));
    audio.osc = 0; audio.start = 0;

    // 让宿主快照里出现一个「已经到点」的倒计时，再触发一次拉取（等价于手机切回前台）
    serverItems = [{
      id: 'cd_000003_c3', name: '泡面', durationMs: 60000, remainingMs: 0,
      state: 'running', endAt: new Date(Date.now() - 5000).toISOString(),
    }];
    d.dispatchEvent(new w.Event('visibilitychange'));
    await wait(60);
    eq('拉到了那条到点的倒计时', $('cd-list').querySelectorAll('.cd-card').length, 1);
    eq('卡片进入「提醒中」态', $('cd-list').querySelector('.cd-state').textContent, '提醒中');

    await wait(1200); // 等 cdAlertTick 的一拍
    ok('到点 → 横幅弹出', $('cd-alert').classList.contains('show'));
    ok('到点 → 横幅不再 hidden', !$('cd-alert').classList.contains('hidden'));
    eq('横幅显示倒计时名称', $('cd-alert-name').textContent, '泡面');
    eq('横幅副标题', $('cd-alert-sub').textContent, '时间到了');
    ok('到点 → 真的排上了音（Web Audio）', audio.start > 0, 'start=' + audio.start + ' osc=' + audio.osc);
    ok('到点 → 触觉反馈启动', vib.some(p => Array.isArray(p)), JSON.stringify(vib));

    // 响的是「一小段」：chime = 3 音/遍 × 最多 3 遍 = 9 个振荡器，绝不无限响
    await wait(2300);
    ok('是重复播放而不是只响一声', audio.start >= 4, 'start=' + audio.start);
    ok('播放次数有上限（3 遍内）', audio.start <= 9, 'start=' + audio.start);

    // 去重：同一个倒计时不会每秒重响
    const dedupe = audio.start;
    await wait(1200);
    eq('同一倒计时不重复触发', audio.start, dedupe);

    // 「知道了」→ 音频停 + 横幅收
    const stopped = audio.start;
    $('cd-alert-stop').click();
    ok('点「知道了」→ 横幅收起', $('cd-alert').classList.contains('hidden'));
    ok('点「知道了」→ 不再显示', !$('cd-alert').classList.contains('show'));
    await wait(1400);
    eq('停止后不再发声（定时器已清）', audio.start, stopped);
  }

  // ---- 13) 关掉提示音：到点仍有视觉横幅，但完全安静 ----
  {
    $('cd-sound-btn').click(); // 当前是开 → 关
    eq('已关闭提示音', w.localStorage.getItem('dc.cdSound'), '0');
    const a0 = audio.start, v0 = vib.length;

    serverItems = [{
      id: 'cd_000004_d4', name: '静音测试', durationMs: 60000, remainingMs: 0,
      state: 'running', endAt: new Date(Date.now() - 5000).toISOString(),
    }];
    d.dispatchEvent(new w.Event('visibilitychange'));
    await wait(1300);
    ok('静音下到点仍有横幅（视觉提醒保留）', $('cd-alert').classList.contains('show'));
    eq('横幅名称正确', $('cd-alert-name').textContent, '静音测试');
    eq('静音下完全不发声', audio.start, a0);
    eq('静音下不震动', vib.length, v0);
    $('cd-alert-stop').click();
    ok('清理：横幅已收起', $('cd-alert').classList.contains('hidden'));
  }

  // ---- 14) 手机端字号：长按面板调节，只写本机 localStorage ----
  {
    if ($('cd-sheet').classList.contains('show')) $('cd-close').click();
    ok('前置：倒计时抽屉已收起', !$('cd-sheet').classList.contains('show'));

    eq('未调过时 localStorage 里没有字号', w.localStorage.getItem('dc.clockScale'), null);
    const basePx = parseInt($('clock').style.fontSize, 10);
    ok('初始字号已由屏幕尺寸算出', basePx > 0, $('clock').style.fontSize);

    // 滑动超过 10px → 长按应被取消
    pressDown(200, 200);
    pressMove(200, 260);
    await wait(620);
    ok('手指移动超过 10px → 长按取消、不弹面板', !$('ui-sheet').classList.contains('show'));
    pressUp();

    pressDown(200, 200);
    await wait(620);
    pressUp();
    ok('重新长按 → 面板打开', $('ui-sheet').classList.contains('show'));
    eq('面板初值 100%', $('ui-scale-val').textContent, '100%');
    ok('未到边界时「−」可点', !$('ui-minus').disabled);
    ok('未到边界时「+」可点', !$('ui-plus').disabled);

    $('ui-plus').click();
    eq('点 + → 110%', $('ui-scale-val').textContent, '110%');
    eq('立刻写入本机 localStorage', w.localStorage.getItem('dc.clockScale'), '110');
    const bigPx = parseInt($('clock').style.fontSize, 10);
    ok('时钟字号真的变大了', bigPx > basePx, basePx + ' → ' + bigPx);
    ok('信息栏字号跟着一起缩放', parseInt($('info-bar').style.fontSize, 10) > 0,
      $('info-bar').style.fontSize);

    for (let i = 0; i < 8; i++) $('ui-plus').click();
    eq('放大封顶 150%', $('ui-scale-val').textContent, '150%');
    ok('到上限后 + 置灰', $('ui-plus').disabled);
    eq('上限值也落盘', w.localStorage.getItem('dc.clockScale'), '150');

    for (let i = 0; i < 20; i++) $('ui-minus').click();
    eq('缩小封顶 60%', $('ui-scale-val').textContent, '60%');
    ok('到下限后 − 置灰', $('ui-minus').disabled);
    const smallPx = parseInt($('clock').style.fontSize, 10);
    ok('缩到 60% 比初始更小', smallPx < basePx, basePx + ' → ' + smallPx);

    $('ui-reset').click();
    eq('恢复默认 → 100%', $('ui-scale-val').textContent, '100%');
    eq('恢复默认也落盘', w.localStorage.getItem('dc.clockScale'), '100');
    eq('恢复后字号回到初始值', parseInt($('clock').style.fontSize, 10), basePx);

    $('ui-scrim').click();
    ok('点遮罩 → 面板收起', !$('ui-sheet').classList.contains('show'));
    ok('面板收起后 ± 的状态不残留（下次打开会重算）', true);
  }

  // ---- 15) 底部胶囊显隐：只要宿主告知过倒计时就出现（**含空态**） ----
  {
    serverItems = [{
      id: 'cd_000005_e5', name: '运行中', durationMs: 600000, remainingMs: 600000,
      state: 'running', endAt: new Date(Date.now() + 600000).toISOString(),
    }];
    d.dispatchEvent(new w.Event('visibilitychange'));
    await wait(70);
    ok('有运行中的倒计时 → 胶囊出现', !$('cd-fab').classList.contains('hidden-fab'));
    ok('运行态胶囊不带 paused', !$('cd-fab').classList.contains('paused'));

    serverItems = [{
      id: 'cd_000006_f6', name: '暂停的', durationMs: 600000, remainingMs: 300000,
      state: 'paused', endAt: null,
    }];
    d.dispatchEvent(new w.Event('visibilitychange'));
    await wait(70);
    ok('有倒计时但全部暂停 → 胶囊仍显示（暂停不算未激活）',
      !$('cd-fab').classList.contains('hidden-fab'));
    ok('全暂停时胶囊标出 paused 态', $('cd-fab').classList.contains('paused'));

    serverItems = [];
    d.dispatchEvent(new w.Event('visibilitychange'));
    await wait(70);
    ok('倒计时一条不剩 → 胶囊不隐藏，回到空态（新建入口）',
      !$('cd-fab').classList.contains('hidden-fab'));
    ok('空态胶囊不再带 has/paused 标记，改带 empty',
      !$('cd-fab').classList.contains('paused') && !$('cd-fab').classList.contains('has')
      && $('cd-fab').classList.contains('empty'), $('cd-fab').className);
  }

  // ---- 16) 底部胶囊的自动隐藏：**只有未激活才 3 秒淡出**；激活中常驻 ----
  {
    ok('样式里有 idle 态（淡出用）', /#cd-fab\.idle\s*\{[^}]*opacity:\s*0/.test(html));

    serverItems = [{
      id: 'cd_000007_g7', name: '自动隐藏', durationMs: 600000, remainingMs: 600000,
      state: 'running', endAt: new Date(Date.now() + 600000).toISOString(),
    }];
    d.dispatchEvent(new w.Event('visibilitychange'));
    await wait(70);
    ok('有运行中的倒计时 → 胶囊正常显示', !$('cd-fab').classList.contains('hidden-fab'));

    d.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
    ok('一次操作后胶囊是可见态', !$('cd-fab').classList.contains('idle'));

    // 关键回归：跑着的倒计时不能把胶囊收走（否则读数看不见、也点不进全屏）
    await wait(3300);
    ok('激活中（有运行中）→ 放着不动超过 3 秒也**不**淡出（常驻）',
      !$('cd-fab').classList.contains('idle'));
    ok('激活中常驻时读数仍在走',
      /^\d\d:\d\d$/.test($('cd-fab-text').textContent.trim()), $('cd-fab-text').textContent);

    // 转「全暂停」= 未激活 → 从这一刻起才排 3 秒淡出
    serverItems = [{
      id: 'cd_000007_g7', name: '自动隐藏', durationMs: 600000, remainingMs: 300000,
      state: 'paused', endAt: null,
    }];
    d.dispatchEvent(new w.Event('visibilitychange'));
    await wait(70);
    ok('转全暂停后仍在显示（刚切换，计时是重新开始的）',
      !$('cd-fab').classList.contains('hidden-fab') && !$('cd-fab').classList.contains('idle'));

    await wait(3300);
    ok('未激活（全暂停）3 秒没操作 → 自动淡出（idle）', $('cd-fab').classList.contains('idle'));

    d.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
    ok('再操作 → 胶囊立刻回来（**不是**永久隐藏）', !$('cd-fab').classList.contains('idle'));
    ok('回来后读数正确（唤醒时按最新值重画）',
      /^\d\d:\d\d$/.test($('cd-fab-text').textContent.trim()), $('cd-fab-text').textContent);

    // 抽屉开着的时候不该参与自动隐藏计时；关掉后重新开始
    await fabLongPress();
    ok('长按胶囊 → 抽屉打开', $('cd-sheet').classList.contains('show'));
    ok('抽屉打开 → 胶囊结构性隐藏', $('cd-fab').classList.contains('hidden-fab'));
    await wait(3300);
    ok('抽屉开着期间不会偷偷变成 idle 态',
      $('cd-fab').classList.contains('hidden-fab') && !$('cd-fab').classList.contains('idle'));

    $('cd-close').click();
    ok('关掉抽屉 → 胶囊回来且不带 idle',
      !$('cd-fab').classList.contains('hidden-fab') && !$('cd-fab').classList.contains('idle'));

    await wait(3300);
    ok('关屉后再等 3 秒 → 又自动淡出（计时真的重新开始了，此处仍是全暂停）',
      $('cd-fab').classList.contains('idle'));

    // 隐藏状态下从「暂停」转回「运行」→ 必须立刻现身（否则没有入口点进全屏）
    serverItems = [{
      id: 'cd_000007_g7', name: '自动隐藏', durationMs: 600000, remainingMs: 300000,
      state: 'running', endAt: new Date(Date.now() + 300000).toISOString(),
    }];
    d.dispatchEvent(new w.Event('visibilitychange'));
    await wait(70);
    ok('由暂停转运行 → 胶囊立刻从 idle 唤回并常驻',
      !$('cd-fab').classList.contains('idle') && !$('cd-fab').classList.contains('hidden-fab'));

    // ---- 全部「关掉」（一条都没有）：与「全暂停」**完全同一套**逻辑 ----
    // 用户规格：全关 / 没有倒计时 也是 3 秒没操作淡出、点一下回来（不是永久隐藏）。
    serverItems = [];
    d.dispatchEvent(new w.Event('visibilitychange'));
    d.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
    await wait(70);
    ok('全清空后胶囊仍在（空态，不是结构性隐藏）',
      !$('cd-fab').classList.contains('hidden-fab'));
    await wait(3300);
    ok('空态 3 秒没操作 → 也自动淡出（与全暂停完全一致）',
      $('cd-fab').classList.contains('idle'), $('cd-fab').className);
    d.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
    await wait(50);
    ok('点一下 → 空态胶囊立刻回来',
      !$('cd-fab').classList.contains('idle') && !$('cd-fab').classList.contains('hidden-fab'),
      $('cd-fab').className);

    // 清干净，别影响后面的用例
    serverItems = [];
    d.dispatchEvent(new w.Event('visibilitychange'));
    d.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
    await wait(50);
  }

  // ---- 17) 全屏倒计时：单击胶囊进入 / 橙区宽度 = 剩余比例 / 时钟胶囊返回 ----
  {
    serverItems = [{
      id: 'cd_000008_h8', name: '泡面', durationMs: 600000, remainingMs: 300000,
      state: 'running', endAt: new Date(Date.now() + 300000).toISOString(),
    }];
    d.dispatchEvent(new w.Event('visibilitychange'));
    await wait(80);
    ok('全屏初始是收起的', !$('fs-view').classList.contains('show'));

    $('cd-fab').click(); // 单击（没有 pointerdown → 不会被当成长按）
    ok('单击胶囊 → 全屏打开', $('fs-view').classList.contains('show'));
    ok('全屏里不再显示底部倒计时胶囊', $('cd-fab').classList.contains('hidden-fab'));
    ok('单击胶囊不会顺带打开抽屉', !$('cd-sheet').classList.contains('show'));

    const w0 = parseFloat($('fs-fill').style.width);
    ok('橙色宽度 = 剩余比例（10 分钟剩 5 分钟 ≈ 50%）', Math.abs(w0 - 50) < 1.5, $('fs-fill').style.width);
    eq('大字显示剩余时间', $('fs-time').textContent, '05:00');
    eq('大字下方是倒计时名称', $('fs-name').textContent, '泡面');
    eq('大字逐位渲染（mm:ss 共 4 位）', $('fs-time').querySelectorAll('.fs-d').length, 4);
    ok('时钟胶囊按电脑设置带秒', /^\d\d:\d\d:\d\d$/.test($('fs-pill-time').textContent),
      $('fs-pill-time').textContent);

    // 走一秒：读数变化、变化的位带动画、橙区变窄
    // ⚠️ 别写死 wait(1150)：jsdom 的 setInterval 有漂移（实测 ~700~800ms 一拍），
    //    固定时长偶尔会落在同一秒里 → 轮询到「真的变了」为止（上限 3 秒）
    const before = $('fs-time').textContent;
    let walked = false;
    for (let i = 0; i < 30 && !walked; i++) { await wait(100); walked = $('fs-time').textContent !== before; }
    ok('读数在走', walked, before + ' -> ' + $('fs-time').textContent);
    // 「只给真的变了的位加动画」：变化位数 == 带 .flip 的位数
    const nowTxt = $('fs-time').textContent;
    let diff = 0;
    for (let i = 0; i < nowTxt.length; i++) if (nowTxt.charAt(i) !== before.charAt(i)) diff++;
    eq('变化的位带翻转动画类（未变的位不带）',
      $('fs-time').querySelectorAll('.fs-d.flip').length, diff);
    ok('橙区随时间变窄', parseFloat($('fs-fill').style.width) < w0, $('fs-fill').style.width);

    // 换成「刚建好」的倒计时 → 橙色几乎铺满
    serverItems = [{
      id: 'cd_000009_i0', name: '满格', durationMs: 60000, remainingMs: 60000,
      state: 'running', endAt: new Date(Date.now() + 60000).toISOString(),
    }];
    d.dispatchEvent(new w.Event('visibilitychange'));
    await wait(1150);
    // 剩余 100% → 橙区铺满（等一拍 tickCd，这中间会走掉一秒多，所以不放宽到 100）
    ok('剩余 100% → 橙区几乎铺满', parseFloat($('fs-fill').style.width) > 95, $('fs-fill').style.width);
    eq('大字与名称跟着换成新的那条', $('fs-name').textContent, '满格');
    ok('带小时才会加 .long（mm:ss 不加）', !$('fs-time').classList.contains('long'));

    // 换成一个已归零的（endAt 在过去）→ 橙区收干净
    serverItems = [{
      id: 'cd_000010_j0', name: '归零', durationMs: 60000, remainingMs: 0,
      state: 'running', endAt: new Date(Date.now() - 5000).toISOString(),
    }];
    d.dispatchEvent(new w.Event('visibilitychange'));
    await wait(1150);
    eq('剩余 0 → 橙区完全收起', parseFloat($('fs-fill').style.width), 0);
    eq('大字归零', $('fs-time').textContent, '00:00');

    // 时钟胶囊 → 回时钟
    $('fs-pill').click();
    ok('点时钟胶囊 → 回到时钟', !$('fs-view').classList.contains('show'));
    ok('回来后底部胶囊恢复显示', !$('cd-fab').classList.contains('hidden-fab'));

    // 倒计时被取消光 → 全屏自动退出（不用手动点）
    $('cd-fab').click();
    ok('重新进入全屏', $('fs-view').classList.contains('show'));
    serverItems = [];
    d.dispatchEvent(new w.Event('visibilitychange'));
    await wait(1150);
    ok('倒计时被取消光 → 全屏自动退出', !$('fs-view').classList.contains('show'));

    d.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
    await wait(50);
  }

  // ---- 18) 全屏时钟胶囊的秒数、以及全屏与提醒条的层叠关系 ----
  {
    const dom4 = new JSDOM(html, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      url: 'http://192.168.1.9:8788/',
      beforeParse(win) {
        win.fetch = function (url) {
          if (/\/api\/write-nonce$/.test(String(url))) return jsonRes({ nonce: 'x', ttlMs: 300000 });
          return jsonRes({
            now: Date.now(), readOnly: true, countdownCanEdit: true,
            cfg: Object.assign({}, CFG, { showSeconds: false }),
            countdowns: [{
              id: 'cd_000011_k0', name: '无秒', durationMs: 60000, remainingMs: 60000,
              state: 'running', endAt: new Date(Date.now() + 60000).toISOString(),
            }],
          });
        };
      },
    });
    await new Promise(r => setTimeout(r, 130));
    const d4 = dom4.window.document;
    d4.getElementById('cd-fab').click();
    ok('（showSeconds=false）单击胶囊仍能进全屏',
      d4.getElementById('fs-view').classList.contains('show'));
    ok('时钟胶囊不带秒（跟随电脑设置）',
      /^\d\d:\d\d$/.test(d4.getElementById('fs-pill-time').textContent),
      d4.getElementById('fs-pill-time').textContent);
    ok('倒计时大字照常带秒（倒计时必须看得到秒）',
      /^\d\d:\d\d$/.test(d4.getElementById('fs-time').textContent),
      d4.getElementById('fs-time').textContent);
    ok('层叠：全屏 40 < 到点提醒条 60（提醒永远压在全屏之上）',
      /#fs-view \{[\s\S]*?z-index: 40/.test(html) && /#cd-alert \{[\s\S]*?z-index: 60/.test(html));
    dom4.window.close();
  }

  // ---- 19) 全屏里的时钟胶囊：3 秒没操作也淡出、一操作就回来 ----
  {
    ok('样式里有全屏时钟胶囊的 idle 态', /#fs-pill\.idle\s*\{[^}]*opacity:\s*0/.test(html));
    // 前面「归零」那条会触发到点提醒，提醒期间（90 秒）胶囊按设计不收 → 先点「知道了」清掉
    $('cd-alert-stop').click();
    serverItems = [{
      id: 'cd_000012_l0', name: '全屏胶囊', durationMs: 600000, remainingMs: 600000,
      state: 'running', endAt: new Date(Date.now() + 600000).toISOString(),
    }];
    d.dispatchEvent(new w.Event('visibilitychange'));
    await wait(80);
    $('cd-fab').click(); // 单击进全屏
    ok('单击底部胶囊 → 进全屏', $('fs-view').classList.contains('show'));
    ok('刚进全屏时刻钟胶囊可见', !$('fs-pill').classList.contains('idle'));
    await wait(3300);
    ok('全屏里 3 秒没操作 → 时钟胶囊淡出', $('fs-pill').classList.contains('idle'));
    d.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
    ok('摸一下屏幕 → 时钟胶囊立刻回来', !$('fs-pill').classList.contains('idle'));
    await wait(3300);
    ok('再等 3 秒 → 又淡出（计时真的重新开始了）', $('fs-pill').classList.contains('idle'));
    $('fs-pill').click();
    ok('点时钟胶囊 → 退出全屏', !$('fs-view').classList.contains('show'));
    ok('退出全屏后时钟胶囊不带 idle（下次进来是可见的）', !$('fs-pill').classList.contains('idle'));
    serverItems = [];
    d.dispatchEvent(new w.Event('visibilitychange'));
    await wait(50);
  }

  // ---- 20) 页面自愈：宿主换了页面 → 手机端自动重载（根治「改了不生效」的假 bug） ----
  // 背景：宿主原来把页面缓存在内存里永不失效，改完不重启 app，手机端跑旧脚本 →
  // 被误判成「功能有 bug」。现在宿主把版本注进页面、快照也带同一个版本，页面自行比对。
  {
    const { VirtualConsole } = require('jsdom');
    // 用「带内嵌版本」的页面副本 + 指定的快照版本，看页面是否尝试导航（jsdom 会报 Not implemented: navigation）
    async function probeBuild(embedded, served) {
      const nav = [];
      const vc = new VirtualConsole();
      vc.on('jsdomError', e => nav.push(String((e && e.message) || e)));
      const h = html.replace(/__DC_PAGE_BUILD__/g, embedded);
      // eslint-disable-next-line no-new
      new JSDOM(h, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        url: 'http://192.168.1.9:8788/', virtualConsole: vc,
        beforeParse(win) {
          win.fetch = function (url) {
            if (/\/api\/state$/.test(String(url))) {
              return Promise.resolve({
                ok: true, status: 200,
                json: () => Promise.resolve({
                  now: Date.now(), readOnly: true, build: served, cfg: CFG,
                  countdownCanEdit: true, countdowns: [],
                }),
              });
            }
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
          };
        },
      });
      await wait(140);
      return nav.filter(m => /navigation|Not implemented/i.test(m)).length;
    }

    ok('页面里有版本占位符（与宿主 PAGE_BUILD_TOKEN 一致）', /PAGE_BUILD = ['"]__DC_PAGE_BUILD__['"]/.test(html));
    ok('占位符在源码里只出现一次（多一处会被全量替换换坏，自愈失效）',
      (html.match(/__DC_PAGE_BUILD__/g) || []).length === 1);
    eq('版本一致 → 不重载', await probeBuild('111:222', '111:222'), 0);
    ok('版本不一致 → 自动重载（旧页面不会继续跑）', (await probeBuild('111:222', '333:444')) > 0);
    eq('宿主没给 build（老宿主/stat 失败）→ 不重载，不误伤', await probeBuild('111:222', ''), 0);
    eq('页面未被宿主替换（file:// 直开）→ 不重载', await probeBuild('__DC_PAGE_BUILD__', '333:444'), 0);
  }

  console.log('\nlan-mirror-page(jsdom)：pass=' + pass + ' fail=' + fail);
  if (failures.length) {
    console.log('\n失败项：');
    failures.forEach(f => console.log('  ✗ ' + f));
  }
  process.exit(fail ? 1 : 0);
})();
