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
  animEase: 'ease-in-out', // 故意不是默认的 default：验证「跟随电脑」时真的取宿主这一档
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
  ok('首次进页面给出「双击时钟可调字号」提示', !$('hint').hidden && $('hint').classList.contains('show'));

  // ---- 2) 双击时钟 → 手机端显示面板 → 新建入口 → 抽屉 ----
  // jsdom 未必有 PointerEvent：页面会按 window.PointerEvent 是否存在选择绑定哪套事件
  const EV_DOWN = w.PointerEvent ? 'pointerdown' : 'mousedown';
  const EV_UP = w.PointerEvent ? 'pointerup' : 'mouseup';
  const tapAt = (node, x, y) => node.dispatchEvent(
    new w.MouseEvent(EV_DOWN, { bubbles: true, clientX: x === undefined ? 200 : x, clientY: y === undefined ? 200 : y }));
  const pressDown = (x, y) => tapAt($('clock'), x, y);
  const pressUp = () => $('clock').dispatchEvent(new w.MouseEvent(EV_UP, { bubbles: true }));
  // 双击 = 两次「按下」。页面在**第二次按下**的瞬间就判定（不等抬手、不等 click）。
  // ⚠️ 双击之后页面会把紧随的 click 吞掉 450ms（防「点到刚弹出的遮罩」），
  //    所以这个 helper 末尾要等窗口过期，免得后面的按钮点击被一起吞掉。
  async function doubleTapClock(x, y) {
    pressDown(x, y); await wait(90); pressDown(x, y);
    await wait(500);
  }

  // 底部胶囊现在是「单击 = 进全屏 / 长按 = 开抽屉」：要开抽屉就必须手动走一遍长按
  const fabPress = () => $('cd-fab').dispatchEvent(
    new w.MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 600 }));
  async function fabLongPress() {
    fabPress();
    await wait(560);
    // 真机上长按抬手多半还会补一次 click → 页面会吞掉它（顺便把长按标志复位）
    $('cd-fab').click();
    // ⚠️ 长按打开抽屉后 450ms 内的 click 会被页面主动吞掉 —— 防的就是「抬手那一下正好落在
    //    刚铺开的遮罩上、把抽屉自己关掉」。所以这里必须等窗口过去，否则紧接着点抽屉里的
    //    按钮会被全部吞掉，一整片用例连锁失败（和双击开面板后要等 500ms 是同一个坑）。
    await wait(500);
  }

  pressDown();
  ok('只按一下（双击没完成）→ 面板不出现', !$('ui-sheet').classList.contains('show'));
  await wait(400); // 超过 320ms 的判定窗口
  pressDown();
  ok('第一下超时后再按一下 → 也不算双击', !$('ui-sheet').classList.contains('show'));
  await wait(90);
  pressDown();
  ok('双击时钟 → 手机端显示面板打开', $('ui-sheet').classList.contains('show'));
  ok('面板遮罩同时显示', $('ui-scrim').classList.contains('show'));
  pressUp();
  ok('面板打开后一次性提示条收起', !$('hint').classList.contains('show'));
  ok('双击时钟进来的面板：不出现「全屏倒计时专属」那一块', $('ui-fs-block').hidden);
  ok('面板保留「新建倒计时」入口（可写宿主）', !$('ui-new-cd').hidden);
  await wait(500); // 等「吞 click」的窗口过期（双击后 450ms 内的 click 会被吞掉）

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

    // 两次落点离得太远（> 40px）→ 不算双击
    pressDown(200, 200);
    await wait(90);
    pressDown(200, 300);
    ok('两次落点相差 100px → 不算双击、不弹面板', !$('ui-sheet').classList.contains('show'));
    await wait(400); // 让这一下彻底过期

    pressDown(200, 200);
    await wait(90);
    pressDown(200, 200);
    ok('重新双击 → 面板打开', $('ui-sheet').classList.contains('show'));
    // ⚠️ 真机/真引擎上，双击之后浏览器会补一次 click，而它的落点是按「面板已弹出」
    //    重新命中的 → 会正好点在刚铺满的遮罩上，把面板自己关掉（实测面板只活了 83ms）。
    //    所以双击触发后 450ms 内的 click 必须被吞掉。
    $('ui-scrim').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('★ 双击后紧随的 click 被吞掉（不会把刚打开的面板自己点掉）',
      $('ui-sheet').classList.contains('show'));
    await wait(500); // 让吞 click 的窗口过期，免得影响后面点按钮
    ok('（准备）窗口过期后面板仍在', $('ui-sheet').classList.contains('show'));
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

  // ---- 14b) [v1.0.5.7] 数字动画「节奏」：本机偏好 / 跟随电脑 / 弹性档 / 恢复默认 ----
  {
    eq('前置：本机没存过节奏', w.localStorage.getItem('dc.animEase'), null);

    pressDown(200, 200);
    await wait(90);
    pressDown(200, 200);
    await wait(520); // 等双击后「吞 click」的窗口过期
    ok('（准备）面板已打开', $('ui-sheet').classList.contains('show'));

    const easeChips = $('ui-ease-chips');
    ok('面板里有「节奏」chips', !!easeChips);
    const easeBtns = easeChips ? easeChips.querySelectorAll('button') : [];
    eq('节奏共 6 档（含「跟随电脑」）', easeBtns.length, 6);
    eq('档位顺序 = 跟随电脑/弹性/匀速/慢起/慢停/两头慢',
      Array.prototype.map.call(easeBtns, b => b.getAttribute('data-v')).join(','),
      'auto,default,linear,ease-in,ease-out,ease-in-out');
    const activeEase = easeChips && easeChips.querySelector('button.active');
    eq('默认高亮「跟随电脑」', activeEase && activeEase.getAttribute('data-v'), 'auto');
    eq('★ 跟随电脑时用宿主下发的节奏（--anim-ease=ease-in-out）',
      $('time-display').style.getPropertyValue('--anim-ease'), 'ease-in-out');

    const easeBtn = v => easeChips.querySelector('button[data-v="' + v + '"]');

    easeBtn('linear').click();
    await wait(50);
    eq('点「匀速」→ 落盘 dc.animEase=linear', w.localStorage.getItem('dc.animEase'), 'linear');
    eq('★ 时钟数字的 --anim-ease 改成 linear',
      $('time-display').style.getPropertyValue('--anim-ease'), 'linear');
    eq('★ 全屏大数字同步跟上（同一份曲线）',
      $('fs-time').style.getPropertyValue('--anim-ease'), 'linear');

    easeBtn('ease-in-out').click();
    await wait(50);
    eq('点「两头慢」→ 落盘 ease-in-out', w.localStorage.getItem('dc.animEase'), 'ease-in-out');
    eq('曲线写到 ease-in-out', $('time-display').style.getPropertyValue('--anim-ease'), 'ease-in-out');

    easeBtn('default').click();
    await wait(50);
    eq('点「弹性」→ 落盘 default', w.localStorage.getItem('dc.animEase'), 'default');
    eq('★ 弹性档**删掉**变量（不是写空串）→ 交给 CSS 各用各自的原曲线',
      $('time-display').style.getPropertyValue('--anim-ease'), '');

    easeBtn('auto').click();
    await wait(50);
    eq('点「跟随电脑」→ 本机值回到 auto', w.localStorage.getItem('dc.animEase'), 'auto');
    eq('跟随电脑 → 又用宿主的 ease-in-out',
      $('time-display').style.getPropertyValue('--anim-ease'), 'ease-in-out');

    // 恢复默认：本机键被清掉（而不是留一个 auto 值），仍回到跟随电脑
    easeBtn('linear').click();
    await wait(30);
    $('ui-reset').click();
    await wait(50);
    eq('★ 恢复默认 → 节奏键被清掉', w.localStorage.getItem('dc.animEase'), null);
    eq('恢复默认后曲线回到宿主的 ease-in-out',
      $('time-display').style.getPropertyValue('--anim-ease'), 'ease-in-out');

    $('ui-scrim').click();
    ok('（收尾）面板收起', !$('ui-sheet').classList.contains('show'));
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
    await wait(60);
    // ⚠️ 进全屏要等「形变 0.8s」放完，界面才真正切过去（#fs-view 才 .show）。
    //    但全屏的内部状态在按下那一刻就已就位（数字 / 水位条 / 按钮）——
    //    所以「读数」「橙区宽度」这类断言必须**立刻**做：等一秒后秒数已经走掉了。
    ok('单击胶囊：先只见形变（界面还没切过去）',
      !$('fs-view').classList.contains('show') && $('fs-morph').style.visibility === 'visible');
    ok('全屏里不再显示底部倒计时胶囊', $('cd-fab').classList.contains('hidden-fab'));
    ok('单击胶囊不会顺带打开抽屉', !$('cd-sheet').classList.contains('show'));

    const w0 = parseFloat($('fs-fill').style.width);
    ok('橙色宽度 = 剩余比例（10 分钟剩 5 分钟 ≈ 50%）', Math.abs(w0 - 50) < 1.5, $('fs-fill').style.width);
    eq('大字显示剩余时间', $('fs-time').getAttribute('data-t'), '05:00');
    eq('大字上方是倒计时名称', $('fs-name').textContent, '泡面');
    eq('大字逐位渲染（mm:ss 共 4 位）', $('fs-time').querySelectorAll('.digit-group').length, 4);
    ok('全屏大字的动画类与桌面时钟同源（anim-* + dir-*）',
      /anim-flip/.test($('fs-time').className) && /dir-up/.test($('fs-time').className)
      && /anim-flip/.test($('clock').className) && /dir-up/.test($('clock').className),
      'fs="' + $('fs-time').className + '" clock="' + $('clock').className + '"');
    ok('时钟胶囊按电脑设置带秒', /^\d\d:\d\d:\d\d$/.test($('fs-pill-time').textContent),
      $('fs-pill-time').textContent);

    // 走一秒：读数变化、变化的位带动画、橙区变窄
    // ⚠️ 别写死 wait(1150)：jsdom 的 setInterval 有漂移（实测 ~700~800ms 一拍），
    //    固定时长偶尔会落在同一秒里 → 轮询到「真的变了」为止（上限 3 秒）。
    // ⚠️ 数字的出场动画类是**临时**的（animDuration+30ms 后清掉，默认 380ms），
    //    所以要密轮询（50ms）并记录整个窗口内的峰值，别只在「变了」那一刻数。
    const before = $('fs-time').getAttribute('data-t');
    let walked = false, maxAnim = 0;
    for (let i = 0; i < 70; i++) {
      await wait(50);
      const c = $('fs-time').querySelectorAll('.digit-current.animate-out').length;
      if (c > maxAnim) maxAnim = c;
      if ($('fs-time').getAttribute('data-t') !== before) { walked = true; break; }
    }
    ok('读数在走', walked, before + ' -> ' + $('fs-time').getAttribute('data-t'));
    // 「只给真的变了的位加动画」：变化位数 == 带 .animate-out 的位数
    const nowTxt = $('fs-time').getAttribute('data-t') || '';
    let diff = 0;
    for (let i = 0; i < nowTxt.length; i++) if (nowTxt.charAt(i) !== before.charAt(i)) diff++;
    eq('只有变化的位出场动画（未变的位不动）', maxAnim, diff);
    ok('橙区随时间变窄', parseFloat($('fs-fill').style.width) < w0, $('fs-fill').style.width);

    // ★ 「切换界面」这一下要等「形变 0.8s」放完（上面这些断言都不依赖它）
    for (let i = 0; i < 40 && !$('fs-view').classList.contains('show'); i++) await wait(100);
    ok('单击胶囊 → 全屏打开', $('fs-view').classList.contains('show'));

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
    ok('字号由 fsFit 按可用宽度算好（不再靠 .long 类切档）',
      /^\d+(\.\d+)?px$/.test($('fs-time').style.fontSize), $('fs-time').style.fontSize);

    // 换成一个已归零的（endAt 在过去）→ 橙区收干净
    serverItems = [{
      id: 'cd_000010_j0', name: '归零', durationMs: 60000, remainingMs: 0,
      state: 'running', endAt: new Date(Date.now() - 5000).toISOString(),
    }];
    d.dispatchEvent(new w.Event('visibilitychange'));
    await wait(1150);
    eq('剩余 0 → 橙区完全收起', parseFloat($('fs-fill').style.width), 0);
    eq('大字归零', $('fs-time').getAttribute('data-t'), '00:00');

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
    await wait(1100); // 形变 0.8s + 淡入余量
    ok('（showSeconds=false）单击胶囊仍能进全屏',
      d4.getElementById('fs-view').classList.contains('show'));
    ok('时钟胶囊不带秒（跟随电脑设置）',
      /^\d\d:\d\d$/.test(d4.getElementById('fs-pill-time').textContent),
      d4.getElementById('fs-pill-time').textContent);
    ok('倒计时大字照常带秒（倒计时必须看得到秒）',
      /^\d\d:\d\d$/.test(d4.getElementById('fs-time').getAttribute('data-t')),
      d4.getElementById('fs-time').getAttribute('data-t'));
    ok('层叠：全屏 40 < 到点提醒条 60（提醒永远压在全屏之上）',
      /#fs-view \{[\s\S]*?z-index: 40/.test(html) && /#cd-alert \{[\s\S]*?z-index: 60/.test(html));
    // ⚠️ 胶囊从底部搬到顶部之后，到点提醒条（左右 12px 的整条横幅）正好压住它 →
    //    「提醒中」点不到胶囊、进不了全屏，全屏专属的「到点掠屏」就永远看不到。
    //    提醒条必须让到胶囊下方（66px = 14 + 44 + 8）。
    ok('★ 到点提醒条让开了顶部那颗倒计时胶囊（提醒中点得到胶囊）',
      /#cd-fab \{[\s\S]*?top: calc\(14px \+ env\(safe-area-inset-top\)\)/.test(html)
      && /#cd-alert \{[\s\S]*?top: calc\(env\(safe-area-inset-top, 0px\) \+ 66px\)/.test(html));
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
    await wait(1100);    // 形变 0.8s + 淡入余量
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

  // ---- 21) 全屏：左下角大数字 / 右下角两个大按钮 / 长按数字调字号 ----
  {
    const wcalls = [];
    let items21 = [{
      id: 'cd_000021_u1', name: '泡面', durationMs: 600000, remainingMs: 600000,
      state: 'running', endAt: new Date(Date.now() + 600000).toISOString(),
    }];
    const dom21 = new JSDOM(html, {
      runScripts: 'dangerously', pretendToBeVisual: true,
      url: 'http://192.168.1.9:8788/',
      beforeParse(win) {
        win.fetch = function (url, opt) {
          opt = opt || {};
          const u = String(url);
          wcalls.push({ url: u, method: String(opt.method || 'GET').toUpperCase(), headers: opt.headers || {} });
          if (/\/api\/write-nonce$/.test(u)) return jsonRes({ nonce: 'n21', ttlMs: 300000 });
          if (/\/api\/state$/.test(u)) {
            return jsonRes({
              now: Date.now(), readOnly: true, cfg: CFG,
              countdownCanEdit: true, countdowns: items21,
            });
          }
          const m = u.match(/\/api\/countdowns\/([^/]+)\/(pause|resume|cancel)$/);
          if (m) {
            const id = decodeURIComponent(m[1]), act = m[2];
            items21 = act === 'cancel' ? [] : items21.map(it => it.id === id
              ? Object.assign({}, it, {
                state: act === 'pause' ? 'paused' : 'running',
                endAt: act === 'pause' ? null : new Date(Date.now() + 600000).toISOString(),
              })
              : it);
            return jsonRes({ ok: true, value: null, items: items21 });
          }
          return jsonRes({ ok: true, value: null, items: items21 });
        };
      },
    });
    await new Promise(r => setTimeout(r, 140));
    const w21 = dom21.window, d21 = w21.document;
    const x = id => d21.getElementById(id);

    // —— 布局：底部一行两端对齐，左列数字、右列两个按钮 ——
    const bottom = d21.querySelector('.fs-bottom');
    ok('全屏底部是一个「两端对齐」的行容器',
      !!bottom && /\.fs-bottom\s*\{[^}]*justify-content:\s*space-between/.test(html));
    ok('底部留了安全区（刘海/小白条不会吃掉按钮）',
      /\.fs-bottom\s*\{[^}]*env\(safe-area-inset-bottom\)/.test(html));
    ok('大字在左、按钮在右（同一行内 .fs-left 排在 #fs-acts 之前）',
      !!bottom && bottom.children.length === 2
      && bottom.children[0].classList.contains('fs-left')
      && bottom.children[1].id === 'fs-acts');
    ok('大数字挂在左下角那一列里',
      !!x('fs-time') && x('fs-time').parentNode.classList.contains('fs-left'));
    ok('大数字能接收触摸（长按才能调字号）', /#fs-time\s*\{[^}]*pointer-events:\s*auto/.test(html));
    ok('字号由 fsFit 按可用宽度算出（不再写死档位）',
      /function fsFit\s*\(/.test(html) && !/#fs-time\.long/.test(html));
    ok('字号上限扣掉了右侧按钮的宽度（不会压到按钮/越界）',
      /var avail = Math\.max\(120, window\.innerWidth - FS_PAD \* 2 - \(actsW \? actsW \+ FS_GAP : 0\)\)/.test(html));
    ok('字号面板压在全屏之上（否则长按弹出的面板会被盖住）',
      /#ui-sheet, #ui-scrim \{ z-index: 50/.test(html));

    x('cd-fab').click();
    for (let i = 0; i < 40 && !x('fs-view').classList.contains('show'); i++) await wait(100);
    ok('单击胶囊 → 进全屏', x('fs-view').classList.contains('show'));

    ok('右下角两个大按钮都在（可写宿主）',
      !x('fs-acts').hidden && !!x('fs-toggle') && !!x('fs-cancel'));
    // [v1.0.5.7] 按钮改成「纯 CSS 画的图形」：不再有文字，状态由 data-act / .armed 决定，
    // 语义交给 aria-label（语言切换时由 fsPaintActs 重设）。
    eq('左按钮默认是「暂停」态（data-act=pause）', x('fs-toggle').getAttribute('data-act'), 'pause');
    eq('左按钮的语义走 aria-label', x('fs-toggle').getAttribute('aria-label'), '暂停');
    eq('右按钮的语义走 aria-label', x('fs-cancel').getAttribute('aria-label'), '取消');
    ok('两个按钮里都没有文字（全用 CSS 画）',
      x('fs-toggle').textContent.trim() === '' && x('fs-cancel').textContent.trim() === '',
      JSON.stringify([x('fs-toggle').textContent, x('fs-cancel').textContent]));
    ok('四个图形元素齐备（暂停 / 继续 / ✕ / ?）',
      !!x('fs-toggle').querySelector('.ico-pause') && !!x('fs-toggle').querySelector('.ico-play')
      && !!x('fs-cancel').querySelector('.ico-x') && !!x('fs-cancel').querySelector('.ico-q')
      && !!x('fs-cancel').querySelector('.ico-q .ico-q-dot'));
    ok('确认态是「?」而不是「✓」（按第一下只是问你，不是你已经确认了）',
      !/ico-check/.test(html));
    ok('「?」是纯 CSS 画的：缺左下角的圆环当钩 + 竖干 + 圆点',
      /\.ico-q::before \{[^}]*border-left-color: transparent; border-bottom-color: transparent/.test(html)
      && /\.ico-q::after \{[^}]*background: currentColor/.test(html)
      && /\.ico-q \.ico-q-dot \{[^}]*border-radius: 50%/.test(html));
    ok('状态 → 图形的映射写在 CSS 里（唯一事实来源）',
      /#fs-toggle\[data-act="pause"\] \.ico-pause \{ display: flex/.test(html)
      && /#fs-toggle\[data-act="resume"\] \.ico-play \{ display: block/.test(html)
      && /#fs-cancel:not\(\.armed\) \.ico-x \{ display: block/.test(html)
      && /#fs-cancel\.armed \.ico-q \{ display: block/.test(html));
    ok('图标是纯装饰（pointer-events:none → 落点永远落在按钮上）',
      /\.ico \{[^}]*pointer-events: none/.test(html));
    ok('底部按钮离屏幕底边留了安全距离（避开系统手势区）',
      /bottom: calc\(28px \+ env\(safe-area-inset-bottom\) \+ var\(--fs-lift, 0px\)\)/.test(html));
    ok('★ 按钮「按下即触发」，不依赖 click（真机上 click 会被合成层变动吞掉）',
      /function bindPressFire\(node, onFire\)/.test(html)
      && /bindPressFire\(el\('fs-toggle'\)/.test(html)
      && /bindPressFire\(el\('fs-cancel'\)/.test(html));
    ok('顶部时间胶囊的读屏标签跟着语言走（不再是硬编码中文）',
      /el\('fs-pill'\)\.setAttribute\('aria-label', T\('返回时钟', 'Back to clock'\)\)/.test(html));

    // ⚠️ 「单击胶囊进全屏」那一下会装 450ms 的吞 click 窗口 —— 防的是浏览器补发的那次合成 click
    //    落在同位置的 #fs-pill 上、把刚打开的全屏自己点掉。所以紧接着点按钮前必须等窗口过期，
    //    否则按钮的 click 会被整片吞掉（双击开面板后要等 500ms 是同一个坑）。
    await wait(500);

    // —— 暂停：**按下即触发**（只发 pointerdown、不发 click 也必须生效）——
    // 真机上 click 要 down/up 命中同一元素，而这一下 pointerdown 会顺带唤醒全屏里的时钟胶囊
    // （visibility + transform 变化 → 合成层重建）→ 整下 click 被丢掉，
    // 表现成「第一次点按钮没反应、得先点一下屏幕再来第二下」。所以按钮不等 click。
    wcalls.length = 0;
    x('fs-toggle').dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    await wait(80);
    const post = wcalls.filter(c => c.method === 'POST').pop();
    ok('★ 只发 pointerdown（没有 click）就已经写入宿主',
      !!post && /\/api\/countdowns\/cd_000021_u1\/pause$/.test(post.url), post && post.url);
    ok('写请求带一次性令牌头 X-DC-Nonce', !!post && !!post.headers['X-DC-Nonce'],
      post && JSON.stringify(post.headers));
    eq('暂停成功后 data-act 变 resume（图形跟着换成三角）', x('fs-toggle').getAttribute('data-act'), 'resume');
    eq('暂停成功后 aria-label 变「继续」', x('fs-toggle').getAttribute('aria-label'), '继续');
    x('fs-toggle').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(80);
    eq('★ 紧随其后的 click 被吞掉（不会重复写一次）',
      wcalls.filter(c => c.method === 'POST').length, 1);

    // —— 取消：两下才真删（这条走 click 分支 → 顺带验了键盘/辅助技术那条路径没坏）——
    wcalls.length = 0;
    x('fs-cancel').click();
    ok('第一次点「取消」→ 进入确认态（不真删）', x('fs-cancel').classList.contains('armed'));
    eq('第一次点 → 语义变「确认取消」', x('fs-cancel').getAttribute('aria-label'), '确认取消');
    eq('第一次点没发任何写请求', wcalls.filter(c => c.method === 'POST').length, 0);
    x('fs-cancel').click();
    await wait(80);
    const post2 = wcalls.filter(c => c.method === 'POST').pop();
    ok('第二次点 → POST 到 /countdowns/<id>/cancel', !!post2 && /\/cancel$/.test(post2.url), post2 && post2.url);
    ok('删掉当前这条 → 自动退出全屏', !x('fs-view').classList.contains('show'));

    // —— 只读宿主：没有可执行的动作 → 按钮整组收起来，不给假按钮 ——
    {
      const domRO = new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://192.168.1.9:8788/',
        beforeParse(win) {
          win.fetch = function () {
            return jsonRes({
              now: Date.now(), readOnly: true, cfg: CFG, countdownCanEdit: false,
              countdowns: [{
                id: 'cd_000023_w1', name: '只读', durationMs: 600000, remainingMs: 600000,
                state: 'running', endAt: new Date(Date.now() + 600000).toISOString(),
              }],
            });
          };
        },
      });
      await new Promise(r => setTimeout(r, 140));
      const dro = domRO.window.document;
      dro.getElementById('cd-fab').click();
      await wait(1100); // 形变 0.8s + 淡入余量
      ok('只读宿主也能进全屏（大字照看）',
        dro.getElementById('fs-view').classList.contains('show'));
      ok('只读宿主 → 右下角两个按钮整组隐藏',
        dro.getElementById('fs-acts').hidden === true);
      domRO.window.close();
    }

    // —— 双击全屏大数字 → 调的是「倒计时」，与主界面时钟字号互不影响 ——
    items21 = [{
      id: 'cd_000022_v1', name: '泡面', durationMs: 600000, remainingMs: 600000,
      state: 'running', endAt: new Date(Date.now() + 600000).toISOString(),
    }];
    d21.dispatchEvent(new w21.Event('visibilitychange'));
    await wait(80);
    x('cd-fab').click();
    await wait(1100); // 形变 0.8s + 淡入余量
    ok('重新进全屏（有一条运行中的）', x('fs-view').classList.contains('show'));

    const EV_D21 = w21.PointerEvent ? 'pointerdown' : 'mousedown';
    const tapFs = () => x('fs-time').dispatchEvent(
      new w21.MouseEvent(EV_D21, { bubbles: true, clientX: 120, clientY: 700 }));
    async function doubleTapFs() { tapFs(); await wait(90); tapFs(); await wait(500); }

    tapFs();
    ok('只按一下（双击没完成）→ 面板不出现', !x('ui-sheet').classList.contains('show'));
    await wait(90);
    tapFs();
    ok('双击全屏大数字 → 弹出面板', x('ui-sheet').classList.contains('show'));
    eq('面板标题按入口切成「倒计时显示」', x('ui-title').textContent, '倒计时显示');
    eq('面板里的行标签是「倒计时大小」', x('ui-scale-label').textContent, '倒计时大小');
    await wait(500); // 等「吞 click」的窗口过期（双击后 450ms 内的 click 会被吞掉）

    const clockSc0 = w21.localStorage.getItem('dc.clockScale');
    x('ui-plus').click();
    eq('调的是全屏那一档（dc.fsScale → 110）', w21.localStorage.getItem('dc.fsScale'), '110');
    eq('主界面时钟字号不受影响', w21.localStorage.getItem('dc.clockScale'), clockSc0);
    x('ui-reset').click();
    eq('「恢复默认」只复位全屏那一档', w21.localStorage.getItem('dc.fsScale'), '100');
    eq('复位后主界面时钟字号仍不受影响', w21.localStorage.getItem('dc.clockScale'), clockSc0);

    // ---- 模糊数字：只有「双击全屏大数字」的面板里才有 ----
    ok('★ 双击全屏大数字进来的面板：出现全屏专属那块（模糊数字 + 背景色）',
      !x('ui-fs-block').hidden);
    eq('模糊数字默认关（本机偏好还没写过）', w21.localStorage.getItem('dc.fsBlur'), null);
    eq('开关初始 aria-checked=false', x('ui-blur').getAttribute('aria-checked'), 'false');
    x('ui-blur').click();
    eq('点开关 → 写本机偏好 dc.fsBlur=1', w21.localStorage.getItem('dc.fsBlur'), '1');
    eq('开关翻成 aria-checked=true', x('ui-blur').getAttribute('aria-checked'), 'true');

    // ---- 背景色（水位条色相）：滑块用键盘走一遍（不依赖布局，jsdom 里也稳）----
    eq('色相默认 24（≈ 原来那个橙）', x('ui-hue').getAttribute('aria-valuenow'), '24');
    ok('水位条不再写死橙色：走 --fs-a/--fs-b 两个变量',
      /--fs-a: #ea580c/.test(html) && /linear-gradient\(90deg, var\(--fs-a\), var\(--fs-b\)\)/.test(html));
    x('ui-hue').dispatchEvent(new w21.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    eq('方向键 → 色相 26 并落盘', w21.localStorage.getItem('dc.fsHue'), '26');
    eq('--fs-a 按色相重算（夜档）', x('fs-view').style.getPropertyValue('--fs-a'), 'hsl(26, 82%, 45%)');
    eq('--fs-b 按色相重算（夜档）', x('fs-view').style.getPropertyValue('--fs-b'), 'hsl(26, 88%, 55%)');
    ok('日档也一起算了（白底用亮一档）',
      x('fs-view').style.getPropertyValue('--fs-da') === 'hsl(26, 88%, 62%)');
    x('ui-hue').dispatchEvent(new w21.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    eq('方向键往回 → 24', w21.localStorage.getItem('dc.fsHue'), '24');
    ok('色相滑块是自绘的（没有原生 input[type=range]）', !/<input[^>]*type="range"/.test(html));
    ok('滑块轨道是一整圈彩虹 + 圆点跟着色相上色',
      /\.ui-hue-track \{[^}]*linear-gradient\(90deg,#ff0000/.test(html)
      && /knob\.style\.background = 'hsl\('/.test(html));

    x('ui-close').click();
    ok('关掉面板 → 全屏还在（接着看大字）', x('fs-view').classList.contains('show'));
    ok('全屏字号面板会让底边上抬（CSS 预留了 --fs-lift，边调边看得见）',
      /\.fs-bottom\s*\{[^}]*var\(--fs-lift/.test(html) && /function fsLift\s*\(/.test(html));
    eq('关掉面板后抬头归零', x('fs-view').style.getPropertyValue('--fs-lift'), '0px');

    // ---- 模糊秒数：静止 5 秒 → 秒那两位变 --；一有操作立刻复原 ----
    let blurred = false;
    for (let i = 0; i < 40 && !blurred; i++) {
      await wait(200);
      blurred = /--$/.test(x('fs-time').getAttribute('data-t') || '');
    }
    eq('★ 静止 5 秒后秒数变成 --', blurred, true, x('fs-time').getAttribute('data-t'));
    const curTxt = Array.prototype.map.call(x('fs-time').querySelectorAll('.digit-current'),
      function (n) { return n.textContent; }).join('');
    ok('模糊的只是秒那两位，时与分照旧', /^\d\d--$/.test(curTxt), curTxt);
    ok('模糊态下秒那两位不再是数字（所以也不会带动画）',
      x('fs-time').querySelectorAll('.digit-group').length === 4
      && x('fs-time').querySelectorAll('.digit-group').length === curTxt.length, curTxt);

    d21.dispatchEvent(new w21.Event('pointerdown', { bubbles: true })); // 任意操作
    let back = false;
    for (let i = 0; i < 25 && !back; i++) {
      await wait(150);
      back = /\d\d$/.test(x('fs-time').getAttribute('data-t') || '');
    }
    ok('★ 有任何操作 → 秒数立刻恢复正常显示', back, x('fs-time').getAttribute('data-t'));

    // ---- 剩余不足 1 分钟 → 无论静止多久都不模糊（最后一分钟必须看得见秒）----
    items21 = [{
      id: 'cd_000024_x1', name: '临门一脚', durationMs: 60000, remainingMs: 45000,
      state: 'running', endAt: new Date(Date.now() + 45000).toISOString(),
    }];
    d21.dispatchEvent(new w21.Event('visibilitychange'));
    await wait(200);
    await wait(5600); // 远超 5 秒的静止阈值
    ok('★ 剩余不足 1 分钟 → 不模糊（照常显示秒）',
      /^\d\d:\d\d$/.test(x('fs-time').getAttribute('data-t') || ''), x('fs-time').getAttribute('data-t'));

    // ---- 关掉模糊开关 → 立刻恢复（本机偏好写 0）----
    await doubleTapFs();
    ok('（准备）面板重新打开', x('ui-sheet').classList.contains('show'));
    x('ui-blur').click();
    eq('再点开关 → dc.fsBlur=0', w21.localStorage.getItem('dc.fsBlur'), '0');
    eq('开关回到 aria-checked=false', x('ui-blur').getAttribute('aria-checked'), 'false');

    // —— 从全屏里点「新建倒计时」：必须先把全屏收掉，否则抽屉（31）会被全屏（40）盖住 ——
    x('ui-new-cd').click();
    ok('从全屏进「新建倒计时」→ 全屏先收起', !x('fs-view').classList.contains('show'));
    ok('且抽屉真的打开了（没有被全屏盖住）', x('cd-sheet').classList.contains('show'));
    x('cd-close').click();
    dom21.window.close();
  }

  // ============================================================
  // [v1.0.5.7] 本轮新增：到点掠屏 / 独立字体 / 独立动画 / 进出全屏形变 / 胶囊位置
  // ============================================================
  {
    // 起手就是「已经到点」的一条（剩余归零 + 仍在运行）→ 进全屏应当直接进入掠屏态
    let items31 = [{
      id: 'cd_000031_x1', name: '泡面', durationMs: 600000, remainingMs: 0,
      state: 'running', endAt: new Date(Date.now() - 5000).toISOString(),
    }];
    const dom31 = new JSDOM(html, {
      runScripts: 'dangerously', pretendToBeVisual: true,
      url: 'http://192.168.1.9:8788/',
      beforeParse(win) {
        win.fetch = function (url, opt) {
          opt = opt || {};
          const u = String(url), method = String(opt.method || 'GET').toUpperCase();
          if (/\/api\/write-nonce$/.test(u)) return jsonRes({ nonce: 'n31', ttlMs: 300000 });
          if (/\/api\/state$/.test(u)) {
            return jsonRes({ now: Date.now(), readOnly: true, cfg: CFG, countdownCanEdit: true, countdowns: items31 });
          }
          if (/\/api\/countdowns\//.test(u) && method === 'POST') {
            // 打过来的任何动作（pause / resume / …）都按「暂停」处理，够本轮验证用了
            items31 = items31.map(it => Object.assign({}, it, { state: 'paused', endAt: null }));
            return jsonRes({ ok: true, value: null, items: items31 });
          }
          return jsonRes({ ok: true, value: null, items: items31 });
        };
      },
    });
    const w31 = dom31.window, d31 = w31.document;
    const z = id => d31.getElementById(id);
    const ztap = (node, x, y) => node.dispatchEvent(new w31.MouseEvent(
      w31.PointerEvent ? 'pointerdown' : 'mousedown',
      { bubbles: true, clientX: x === undefined ? 200 : x, clientY: y === undefined ? 400 : y }));
    await wait(140);
    d31.dispatchEvent(new w31.Event('visibilitychange'));
    await wait(90);

    // ---------- A) 胶囊位置：与全屏里的时钟胶囊完全一致 ----------
    ok('★ 倒计时胶囊移到顶部居中（与 #fs-pill 同位置）',
      /#cd-fab \{\s*position: fixed; left: 50%; transform: translateX\(-50%\);\s*top: calc\(14px \+ env\(safe-area-inset-top\)\);/.test(html));
    // 用「完整规则头」当锚点：`#fs-pill {` 也可能被别的复合选择器命中，
    // 非贪婪往后找 top 就会捞到别的块里的 top:50%
    const fabTop = (html.match(/#cd-fab \{\s*position: fixed; left: 50%; transform: translateX\(-50%\);\s*top: ([^;]+);/) || [])[1];
    const pillTop = (html.match(/#fs-pill \{\s*position: fixed; left: 50%; transform: translateX\(-50%\);\s*top: ([^;]+);/) || [])[1];
    eq('两颗胶囊的 top 逐字一致（形变动画首尾才接得上）', fabTop, pillTop);
    ok('胶囊淡出方向跟着改成「向上收」（原来在底部才是向下）',
      /#cd-fab\.idle \{[\s\S]*?translateY\(-140%\)/.test(html));

    // ---------- 胶囊「按剩余比例上色」（有倒计时在跑、又没全屏时）----------
    ok('★ 胶囊有色块的宽度 = 剩余比例（--fab-pct 控制渐变断点，**不是固定一半**）',
      /#cd-fab::before \{[\s\S]*?linear-gradient\(90deg,\s*var\(--fab-a\) 0 var\(--fab-pct\), transparent var\(--fab-pct\) 100%\)/.test(html));
    ok('★ --fab-pct 注册成 <percentage>，断点才能 1s 线性过渡（像水位在退）',
      /@property --fab-pct \{[\s\S]*?syntax: '<percentage>'/.test(html));
    // ⚠️⚠️ 回归护栏：inherits 必须是 true。伪元素是靠**继承**取父元素自定义属性的，
    //    写成 false 时 #cd-fab::before 只能拿到 initial-value(0%) → 色块宽度归 0 → 颜色整个看不见
    //    （真机踩过：淡淡的颜色突然没了，而当时所有断言仍全绿）。
    ok('★ --fab-pct 的 inherits 是 true（false 会让 ::before 读到 0% → 色块宽度归零、颜色消失）',
      /@property --fab-pct \{[\s\S]*?inherits: true;/.test(html));
    // 过渡要写在**元素**上（值在 #cd-fab 上被改写；伪元素只是读，写它无效）
    ok('★ --fab-pct 的 1s 线性过渡写在 #cd-fab 元素上（伪元素只读值，写它无效）',
      /#cd-fab \{[\s\S]*?opacity \.26s ease, --fab-pct 1s linear;/.test(html));
    ok('伪元素自己的 transition 只管点亮那一步（不再重复写 --fab-pct）',
      /#cd-fab::before \{[\s\S]*?transition: opacity \.24s ease;/.test(html));
    ok('★ JS 每秒把剩余比例写进去（与全屏水位条同一条曲线 fsRatio）',
      /fab\.style\.setProperty\('--fab-pct', \(fsRatio\(p\.item\) \* 100\)\.toFixed\(2\) \+ '%'\)/.test(html));
    ok('★ 只有 .fab-live 才把它点亮（默认 opacity:0）',
      /#cd-fab::before \{[\s\S]*?opacity: 0/.test(html) && /#cd-fab\.fab-live::before \{ opacity: 1; \}/.test(html));
    ok('日间另有淡色端点（--fab-da，免得白底上用亮色发灰）',
      /body\.is-day #cd-fab::before \{[\s\S]*?var\(--fab-da\)/.test(html));
    ok('两个端点由 fsApplyAccent() 按水位条同一色相写行内',
      /setProperty\('--fab-a', 'hsla\(' \+ h \+ ', 85%, 60%, \.20\)'\)/.test(html)
      && /setProperty\('--fab-da', 'hsla\(' \+ h \+ ', 80%, 45%, \.14\)'\)/.test(html));
    ok('★ 只在「有倒计时在跑且未全屏」时上色（全暂停 / 空态不上色）',
      /classList\.toggle\('fab-live', live\)/.test(html)
      && /var live = !!p\.anyRunning && !fsOpen;/.test(html));
    ok('颜色压得很淡（alpha ≤ .2，只当状态提示、不抢读数）',
      /--fab-a: hsla\(25, 85%, 60%, \.20\);/.test(html) && /--fab-da: hsla\(25, 80%, 45%, \.14\);/.test(html));
    ok('伪元素不吃事件、文本抬到它上面（纯装饰）',
      /#cd-fab::before \{[\s\S]*?pointer-events: none/.test(html)
      && /#cd-fab > \* \{ position: relative; z-index: 1; \}/.test(html));

    // ---------- B) 进全屏：形变 0.8s 铺满 → **立刻**切界面（空等已归 0）----------
    ok('★ 有倒计时在跑 → 胶囊点亮「半边淡色」（.fab-live）',
      z('cd-fab').classList.contains('fab-live'), z('cd-fab').className);
    await wait(500); // 先躲开「双击吞 click」的窗口
    z('cd-fab').click();
    await wait(40);
    ok('★ 进全屏 ①：形变层出现（从胶囊矩形长大）', z('fs-morph').style.visibility === 'visible');
    // ★ 这一拍最关键：界面**还没切** —— #fs-view 整层都还没 .show，所以形变层底下
    //    露着的是**原样的时钟**（旧版这里立刻 .show，底下已经是全屏层了）。
    ok('★ 进全屏 ①：界面尚未切换（#fs-view 还没 .show，底下是时钟）',
      !z('fs-view').classList.contains('show'));
    // 形变层不是一块纯色：它身上也有一条水位条，宽度必须与真背景同值 ——
    // 否则长到整屏的那一刻会比背景少一截，切换时露馅（用户报「白块糊上去」的一半原因）。
    ok('★ 形变层带自己的水位条（不是纯色块）', !!z('fs-morph-fill'));
    eq('★ 形变层水位条与真背景同宽', z('fs-morph-fill').style.width, z('fs-fill').style.width);
    ok('水位条配色与全屏同源（linear-gradient + --fs-* 变量）',
      /#fs-morph-fill \{[\s\S]*?background: linear-gradient\(90deg, var\(--fs-a\), var\(--fs-b\)\)/.test(html));
    // ★ 时长常量锁死：形变 0.8s / 空等 **0** / 出全屏 0.32s。
    //   空等一度是 0.8s、0.3s（「形变放完再停一拍」），用户反馈都嫌停顿 → 归 0。
    ok('★ 形变时长 = 0.8s', /var FS_MORPH_OPEN_MS = 800;/.test(html));
    ok('★ 空等 = 0（形变放完立刻切界面，不再停一拍）',
      /var FS_MORPH_HOLD_MS = 0;/.test(html));
    ok('出全屏仍走较短的形变（回时钟干脆）', /var FS_MORPH_MS = 320;/.test(html));
    ok('形变收尾是「到位即隐」（进 / 出全屏都不溶解）',
      /function fsMorphRun\(from, to, done, ms\)/.test(html) && !/fadeOutMs/.test(html));
    await wait(460); // click 后 ≈500ms：仍在 0.8s 形变之内
    ok('★ 形变中途：形变层还在、界面仍未切',
      z('fs-morph').style.visibility === 'visible' && !z('fs-view').classList.contains('show'));
    await wait(540); // click 后 ≈1040ms > 形变 840ms → 已切界面、形变层已收
    ok('★ 形变放完即切界面（#fs-view 这时已 .show 淡入）',
      z('fs-view').classList.contains('show'));
    ok('形变层已收干净', z('fs-morph').style.visibility === 'hidden');
    ok('形变层不吃事件（纯装饰）',
      /#fs-morph \{[\s\S]*?pointer-events: none/.test(html));
    ok('形变层层级在全屏之上、面板与提醒条之下（z-index 45）',
      /#fs-morph \{[\s\S]*?z-index: 45/.test(html));

    z('fs-pill').click();
    await wait(40);
    ok('（准备）点时钟胶囊 → 回时钟', !z('fs-view').classList.contains('show'));
    ok('★ 出全屏时形变层再次出现（缩回胶囊）', z('fs-morph').style.visibility === 'visible');
    ok('★ 收缩期间胶囊先隐身（免得和目标位置那颗重叠）', z('cd-fab').classList.contains('fab-veil'));
    await wait(430);
    ok('收缩结束：胶囊恢复显示', !z('cd-fab').classList.contains('fab-veil'));
    ok('形变层收起（结束后）', z('fs-morph').style.visibility === 'hidden');

    // ---------- C) 双击时钟 → 独立字体 ----------
    await wait(500);
    ztap(z('clock'), 195, 400); await wait(80); ztap(z('clock'), 195, 400);
    await wait(60);
    ok('（准备）双击时钟打开面板', z('ui-sheet').classList.contains('show'));
    // ⚠️ 双击之后 450ms 内的 click 会被页面主动吞掉（防「这一下正好点在新铺开的遮罩上、
    //    把刚打开的面板自己关掉」）。所以这里必须等窗口过去，否则下面所有 chips 点击全被吞。
    await wait(500);
    ok('★ 时钟面板里出现「字体 / 动画」块（全屏专属那块不出现）',
      !z('ui-clock-block').hidden && z('ui-fs-block').hidden);
    const fontChips = () => z('ui-font-chips').querySelectorAll('button');
    eq('字体给 7 个选项（含「自定义…」）', fontChips().length, 7);
    eq('默认选中「跟随电脑」', z('ui-font-chips').querySelector('button.active').textContent, '跟随电脑');
    ok('默认字体跟随电脑（宿主下发的 Arial 排在最前）',
      /Arial/.test(d31.body.style.fontFamily), d31.body.style.fontFamily);

    fontChips()[2].click(); // 无衬线
    await wait(30);
    eq('点「无衬线」→ 落盘 dc.clockFont=sans', w31.localStorage.getItem('dc.clockFont'), 'sans');
    ok('★ 手机端字体真的换了（与电脑端独立）',
      /PingFang SC/.test(d31.body.style.fontFamily), d31.body.style.fontFamily);

    const lf0 = w31.localStorage.getItem('dc.clockFont');
    fontChips()[6].click(); // 自定义…
    await wait(30);
    ok('点「自定义…」→ 输入框展开', z('ui-font-custom').hidden === false);
    eq('只展开输入框，这时还没落盘', w31.localStorage.getItem('dc.clockFont'), lf0);

    z('ui-font-input').value = '微软雅黑';
    z('ui-font-ok').click();
    await wait(30);
    eq('输入名字并确定 → 落盘 custom:微软雅黑',
      w31.localStorage.getItem('dc.clockFont'), 'custom:微软雅黑');
    ok('★ 中文字体名没被剥成空串（老 bug：正则把非 ASCII 全吃了）',
      /微软雅黑/.test(d31.body.style.fontFamily), d31.body.style.fontFamily);
    eq('自定义 chip 处于选中态',
      z('ui-font-chips').querySelector('button.active').getAttribute('data-v'), 'custom');

    // ---------- D) 独立动画（家族 / 方向 / 时长）----------
    const animChips = () => z('ui-anim-chips').querySelectorAll('button');
    const dirChips = () => z('ui-dir-chips').querySelectorAll('button');
    eq('动画给 6 个选项（含「跟随电脑」）', animChips().length, 6);
    eq('默认跟随电脑', z('ui-anim-chips').querySelector('button.active').getAttribute('data-v'), 'auto');
    eq('默认时长跟随电脑（350ms）', z('ui-dur-val').textContent, '350ms');
    ok('跟随电脑时方向行显示电脑那套（翻转 → 向上 / 向下）',
      z('ui-dir-chips').hidden === false && /向上/.test(z('ui-dir-chips').textContent)
      && /向下/.test(z('ui-dir-chips').textContent), z('ui-dir-chips').textContent);
    eq('高亮的是电脑设的方向（up → 向上）',
      z('ui-dir-chips').querySelector('button.active').getAttribute('data-v'), 'up');

    z('ui-anim-chips').querySelector('button[data-v="scale"]').click();
    await wait(30);
    eq('点「缩放」→ 落盘 dc.animType=scale', w31.localStorage.getItem('dc.animType'), 'scale');
    ok('★ 时钟立刻换成缩放家族（与电脑端独立）',
      /anim-scale/.test(z('clock').className), z('clock').className);
    ok('方向行跟着换成 缩小 / 放大',
      /缩小/.test(z('ui-dir-chips').textContent) && /放大/.test(z('ui-dir-chips').textContent),
      z('ui-dir-chips').textContent);
    eq('缩放没选过方向时默认按「缩小」高亮',
      z('ui-dir-chips').querySelector('button.active').getAttribute('data-v'), 'shrink');

    z('ui-dir-chips').querySelector('button[data-v="grow"]').click();
    await wait(30);
    eq('点「放大」→ 落盘 dc.animDir=grow', w31.localStorage.getItem('dc.animDir'), 'grow');
    ok('class 里带上 dir-grow', /dir-grow/.test(z('clock').className), z('clock').className);

    z('ui-anim-chips').querySelector('button[data-v="fade"]').click();
    await wait(30);
    ok('★ 换成「淡入」后方向行整行收起（这个家族没有方向）', z('ui-dir-chips').hidden === true);
    eq('旧方向被清掉（免得切回缩放时残留）', w31.localStorage.getItem('dc.animDir'), '');

    z('ui-dur-plus').click();
    await wait(30);
    eq('点 + → 400ms 并落盘', w31.localStorage.getItem('dc.animDur'), '400');
    eq('面板数值同步', z('ui-dur-val').textContent, '400ms');
    eq('★ 本机时长真的写到计时元素上（覆盖电脑的 350）',
      z('time-display').style.getPropertyValue('--anim-duration'), '400ms');

    z('ui-reset').click();
    await wait(30);
    eq('「恢复默认」把字体键删掉（回到「从没设过」）', w31.localStorage.getItem('dc.clockFont'), null);
    eq('动画家族键也删掉', w31.localStorage.getItem('dc.animType'), null);
    eq('动画时长键也删掉', w31.localStorage.getItem('dc.animDur'), null);
    eq('字号回到 100%', w31.localStorage.getItem('dc.clockScale'), '100');
    ok('★ 时钟 class 跟着回到电脑那套（anim-flip dir-up）',
      /anim-flip/.test(z('clock').className) && /dir-up/.test(z('clock').className), z('clock').className);
    eq('面板也回到「跟随电脑」',
      z('ui-anim-chips').querySelector('button.active').getAttribute('data-v'), 'auto');
    z('ui-close').click();

    // ---------- E) 到点掠屏 ----------
    await wait(500);
    z('cd-fab').click();
    await wait(1100); // 形变 0.8s + 淡入余量
    ok('（准备）再进全屏', z('fs-view').classList.contains('show'));
    ok('★ 到点（剩余 0 且仍在运行）→ 全屏带 .rung（掠屏启动）',
      z('fs-view').classList.contains('rung'));
    ok('#fs-sweep 在 DOM 里且不含文字（纯装饰）',
      !!z('fs-sweep') && z('fs-sweep').textContent === '');
    ok('掠屏块默认是红色（浅—深—浅三档透明度）',
      /rgba\(220,\s*38,\s*38,\s*0\)/.test(z('fs-sweep').style.background)
      && /rgba\(220,\s*38,\s*38,\s*0?\.66\)/.test(z('fs-sweep').style.background),
      z('fs-sweep').style.background);
    ok('CSS：只有 .rung 才播动画，且从 -100% 单向推到 100vw（移出右边界后重来）',
      /#fs-view\.rung #fs-sweep \{ opacity: 1; animation: fsSweep/.test(html)
      && /@keyframes fsSweep \{[\s\S]*?from \{ transform: translateX\(-100%\); \}[\s\S]*?to\s+\{ transform: translateX\(100vw\); \}/.test(html));

    // 把背景色调到最左 → 色相 0（红）→ 掠屏必须换成反差色绿
    z('ui-hue').dispatchEvent(new w31.MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    eq('把背景色调到最左（色相 0 = 红）', w31.localStorage.getItem('dc.fsHue'), '0');
    ok('★ 用户选的本身就是红 → 掠屏改用反差色绿',
      /rgba\(34,\s*197,\s*94/.test(z('fs-sweep').style.background), z('fs-sweep').style.background);

    // 暂停这条 → 不再是「到点」→ 掠屏停
    // ⚠️ 刚「单击胶囊进全屏」→ 装了 450ms 的吞 click 窗口，等它过去再点（否则这下 click 被吞、按钮不响）
    await wait(500);
    z('fs-toggle').click();
    await wait(120);
    ok('★ 暂停后不再是「到点」→ .rung 收起、掠屏停',
      !z('fs-view').classList.contains('rung'));
    ok('（准备）这条确实被暂停了', z('fs-toggle').getAttribute('data-act') === 'resume');

    dom31.window.close();
  }

  console.log('\nlan-mirror-page(jsdom)：pass=' + pass + ' fail=' + fail);
  if (failures.length) {
    console.log('\n失败项：');
    failures.forEach(f => console.log('  ✗ ' + f));
  }
  process.exit(fail ? 1 : 0);
})();
