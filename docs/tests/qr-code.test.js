// docs/tests/qr-code.test.js — [v1.0.5.6] 自写二维码编码器自测
//
// 直接用 node 跑，不依赖任何第三方包：
//   node docs/tests/qr-code.test.js
//
// 说明：本编码器在开发时已用两条独立证据链验证过一次（脚本放在项目外的临时目录，用完即删）：
//   A. 与 npm qrcode（强制 byte 模式）对拍：强制同掩码时逐模块完全一致 —— 覆盖数据编码、
//      RS 纠错、分块交错、矩阵排版、格式信息位；
//   B. 往返测试：把自写矩阵栅格化成像素后交给 jsQR 解码，12/12 还原出原始文本。
// 本文件把这套结果固化成**不依赖外部包**的回归测试：结构不变式 + 矩阵指纹（sha256）。
// 指纹一旦变化即说明编码结果变了，需重新用 A/B 两条链路复验。

'use strict';

const path = require('path');
const crypto = require('crypto');

const QR = require(path.join(__dirname, '..', '..', 'qr-code.js'));
const I = QR._internals;

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

function fingerprint(qr) {
  return crypto.createHash('sha256').update(qr.modules.map(r => r.join('')).join('')).digest('hex');
}

// ====== 1. 版本选择 ======
eq('版本: 空串也能编码（v1）', I.pickVersion(0), 1);
eq('版本: 14 字节装进 v1', I.pickVersion(14), 1);
eq('版本: 15 字节升到 v2', I.pickVersion(15), 2);
eq('版本: 26 字节仍是 v2', I.pickVersion(26), 2);
eq('版本: 27 字节升到 v3', I.pickVersion(27), 3);
eq('版本: 62 字节升到 v4', I.pickVersion(62), 4);
eq('版本: 105 字节装进 v6', I.pickVersion(105), 6);
eq('版本: 107 字节超出能力（返回 0）', I.pickVersion(107), 0);

// 数据码字数 = 总码字 − 每块纠错 × 分块数
eq('容量: v1 数据码字 16', I.dataCodewords(1), 16);
eq('容量: v4 数据码字 64', I.dataCodewords(4), 64);
eq('容量: v6 数据码字 108', I.dataCodewords(6), 108);
[1, 2, 3, 4, 5, 6].forEach(v => {
  const blocks = I.NUM_BLOCKS_M[v];
  const ecc = I.ECC_PER_BLOCK_M[v];
  eq('容量 v' + v + ': 数据 + 纠错 = 总码字', I.dataCodewords(v) + ecc * blocks, I.RAW_CODEWORDS[v]);
});

// ====== 2. 码字与纠错（含手算参照）======
const hello = I.utf8Bytes('HELLO');
eq('码字: HELLO 长度 5', hello.length, 5);
eq('码字: 模式指示 0100 + 计数 5 + "HELLO"',
  Array.from(I.toCodewords(hello, 1)).join(','),
  [0x40, 0x54, 0x84, 0x54, 0xC4, 0xC4, 0xF0, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC].join(','));
const full = Array.from(I.addEccAndInterleave(I.toCodewords(hello, 1), 1));
eq('纠错: v1 共 26 个码字', full.length, 26);
eq('纠错: 前 16 个是数据码字', full.slice(0, 16).join(','), Array.from(I.toCodewords(hello, 1)).join(','));
ok('纠错: 后 10 个非全零', full.slice(16).some(v => v !== 0), full.slice(16).join(','));

// UTF-8：中文 3 字节 / emoji 4 字节
eq('字节化: 中文 3 字节', I.utf8Bytes('中').length, 3);
eq('字节化: emoji 4 字节', I.utf8Bytes('😀').length, 4);

// ====== 3. 结构不变式 ======
const url = 'http://192.168.100.100:8788/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/';
const q = QR.encode(url);
eq('结构: 版本 4', q.version, 4);
eq('结构: 尺寸 33×33', q.size, 33);
eq('结构: 模块行数', q.modules.length, 33);
ok('结构: 每行等宽', q.modules.every(r => r.length === 33));
ok('结构: 只有 0/1', q.modules.every(r => r.every(v => v === 0 || v === 1)));
eq('结构: mask 在 0–7', q.mask >= 0 && q.mask <= 7, true);

// 三个定位图形：角上 7×7 的外框必须为深色，中心 3×3 必须为深色
function finderOk(m, x0, y0) {
  for (let dy = 0; dy < 7; dy++) {
    for (let dx = 0; dx < 7; dx++) {
      const dark = m[y0 + dy][x0 + dx] === 1;
      const border = dx === 0 || dy === 0 || dx === 6 || dy === 6;
      const center = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      if (border || center) { if (!dark) return false; }
      else if (dark) return false;
    }
  }
  return true;
}
ok('结构: 左上定位图形', finderOk(q.modules, 0, 0));
ok('结构: 右上定位图形', finderOk(q.modules, q.size - 7, 0));
ok('结构: 左下定位图形', finderOk(q.modules, 0, q.size - 7));
// 时序图形：第 6 行/列在数据区之外应为交替
ok('结构: 时序行交替', (() => {
  for (let x = 8; x < q.size - 8; x++) {
    if (q.modules[6][x] !== (x % 2 === 0 ? 1 : 0)) return false;
  }
  return true;
})());
eq('结构: 固定深色模块', q.modules[q.size - 8][8], 1);
// 格式信息：左下角一竖 + 右上角一横的两份副本必须一致
ok('结构: 两份格式信息一致', (() => {
  const size = q.size;
  const a = [];
  for (let i = 0; i <= 5; i++) a.push(q.modules[i][8]);
  a.push(q.modules[7][8], q.modules[8][8], q.modules[8][7]);
  for (let i = 9; i < 15; i++) a.push(q.modules[8][14 - i]);
  const b = [];
  for (let i = 0; i < 8; i++) b.push(q.modules[8][size - 1 - i]);
  for (let i = 8; i < 15; i++) b.push(q.modules[size - 15 + i][8]);
  return a.join('') === b.join('');
})());
// 格式信息能解回「纠错等级 M + 当前掩码」
ok('结构: 格式信息可解回 M + mask' + q.mask, (() => {
  let bits = 0;
  for (let i = 0; i <= 5; i++) bits |= q.modules[i][8] << i;
  bits |= q.modules[7][8] << 6;
  bits |= q.modules[8][8] << 7;
  bits |= q.modules[8][7] << 8;
  for (let i = 9; i < 15; i++) bits |= q.modules[8][14 - i] << i;
  const data = (bits ^ 0x5412) >>> 10;      // 去掉固定掩码
  const ecl = data >>> 3, mask = data & 7;
  return ecl === 0 && mask === q.mask;      // 0 = 纠错等级 M
})());

// ====== 4. 稳定性与边界 ======
ok('稳定: 同一输入两次结果一致', fingerprint(QR.encode(url)) === fingerprint(QR.encode(url)));
ok('确定性: 不同输入结果不同', fingerprint(QR.encode(url)) !== fingerprint(QR.encode('http://10.0.0.5:8788/' + 'b'.repeat(32) + '/')));
ok('边界: 空串不抛错', QR.encode('').size === 21);
let threw = '';
try { QR.encode('x'.repeat(200)); } catch (e) { threw = e.message; }
eq('边界: 超长内容明确抛错', threw, 'qr-content-too-long');
let badMask = '';
try { QR.encode('x', { mask: 9 }); } catch (e) { badMask = e.message; }
eq('边界: 非法掩码不影响正常编码（被忽略）', badMask, '');

// ====== 5. 矩阵指纹（回归锁）======
// 指纹由上述 A/B 两条验证链确认过的实现产出；若此处失败，说明编码结果变了，
// 必须重新与参考实现对拍 + 用解码器往返复验，不能直接改指纹。
[
  { text: url, version: 4, size: 33, mask: 2, sha256: '2478235722dc19fa2f94cb6b16b2aa18ff33c35dad386296d302b6a03ce6df4b' },
  { text: 'http://192.168.1.7:8788/b7c3f19d4e5a6b8c9d0e1f2a3b4c5d6e/', version: 4, size: 33, mask: 2, sha256: 'd6bd6158b4675c09d0645b103892d1d4c3e59c3b2fe9921bb9724f659a9858bf' },
  { text: 'HELLO', version: 1, size: 21, mask: 4, sha256: '32fbc389880456d584e32bdf2c31372391c92f9f853e119a75bec5e14c380a23' },
  { text: 'x'.repeat(106), version: 6, size: 41, mask: 3, sha256: '7c10b09ae528505dc913009ca42f0eafedf2129151607b984f7a08e1ff9c1ffc' },
].forEach(c => {
  const qr = QR.encode(c.text);
  const label = '指纹: len=' + c.text.length;
  eq(label + ' 版本', qr.version, c.version);
  eq(label + ' 尺寸', qr.size, c.size);
  eq(label + ' 掩码', qr.mask, c.mask);
  eq(label + ' sha256', fingerprint(qr), c.sha256);
});

// ====== 6. 画布渲染（用最简 canvas 替身，验证静区与像素对齐）======
(function () {
  const calls = { fillRect: [], fillStyle: [] };
  const ctx = {
    set fillStyle(v) { calls.fillStyle.push(v); },
    get fillStyle() { return calls.fillStyle[calls.fillStyle.length - 1]; },
    clearRect() {},
    fillRect(x, y, w, h) { calls.fillRect.push([x, y, w, h]); },
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const rendered = QR.toCanvas('HELLO', canvas, { scale: 4, margin: 4 });
  const dim = (rendered.size + 8) * 4;
  eq('画布: 尺寸含 4 模块静区', canvas.width, dim);
  eq('画布: 高度同步', canvas.height, dim);
  eq('画布: 先铺浅色底', calls.fillStyle[0], '#ffffff');
  eq('画布: 再画深色模块', calls.fillStyle[1], '#111111');
  const darkCount = rendered.modules.reduce((n, r) => n + r.reduce((m, v) => m + v, 0), 0);
  eq('画布: 填充次数 = 1 次底色 + 深色模块数', calls.fillRect.length, darkCount + 1);
  eq('画布: 第一笔是整幅底色', calls.fillRect[0].join(','), [0, 0, dim, dim].join(','));
  eq('画布: 静区留白（首个模块起点 = 静区×缩放）', calls.fillRect[1][0], 16);
})();

// ====== 汇总 ======
console.log('qr-code 自测：pass=' + pass + ' fail=' + fail);
if (failures.length) {
  console.log('\n失败项：');
  failures.forEach(f => console.log('  ✗ ' + f));
}
process.exit(fail ? 1 : 0);
