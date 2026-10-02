// qr-code.js — [v1.0.5.6] 极简二维码编码器（给设置窗口的「局域网」面板画访问地址用）
//
// 为什么要自己写：项目只有 adm-zip 一个生产依赖，为了一个二维码引入第三方包不划算。
// 本实现只覆盖本场景需要的子集：byte（UTF-8）模式、纠错等级 M、版本 1–6、8 种掩码罚分选优。
// 内容为内网地址（约 60 字符），版本 4 就够，留到 6 有余量；超出则明确抛错，不静默出错图。
//
// 依据 ISO/IEC 18004；结构与判定顺序（含罚分规则 1–4）与参考实现一致，
// 保证同一份内容选出的掩码一致，便于逐模块比对验证。
//
// 浏览器里挂到 window.DCQR；Node 里 module.exports 同一份实现（供 docs/tests 校验）。

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DCQR = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ====== 查表：纠错等级 M ======
  // 每块的纠错码字数 / 分块数（索引 = 版本号 1..6）
  var ECC_PER_BLOCK_M = [0, 10, 16, 26, 18, 24, 16];
  var NUM_BLOCKS_M = [0, 1, 1, 1, 2, 2, 4];
  // 每个版本的总码字数
  var RAW_CODEWORDS = [0, 26, 44, 70, 100, 134, 172];
  var MAX_VERSION = 6;
  var PENALTY_N1 = 3, PENALTY_N2 = 3, PENALTY_N3 = 40, PENALTY_N4 = 10;
  var M_ECL_BITS = 0; // L=1, M=0, Q=3, H=2

  // ====== GF(256) ======
  var EXP = new Uint8Array(512);
  var LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D; // 本原多项式 x^8+x^4+x^3+x^2+1
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function reedSolomonDivisor(degree) {
    var result = new Uint8Array(degree);
    result[degree - 1] = 1;
    var root = 1;
    for (var i = 0; i < degree; i++) {
      for (var j = 0; j < degree; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  }

  function reedSolomonRemainder(data, divisor) {
    var result = new Uint8Array(divisor.length);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ result[0];
      result.copyWithin(0, 1);
      result[result.length - 1] = 0;
      for (var j = 0; j < divisor.length; j++) result[j] ^= gfMul(divisor[j], factor);
    }
    return result;
  }

  // ====== 文本 → 码字 ======
  function utf8Bytes(text) {
    var s = String(text === undefined || text === null ? '' : text);
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(s));
    // 老环境的兜底：手写 UTF-8 编码
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var cp = s.charCodeAt(i);
      if (cp < 0x80) out.push(cp);
      else if (cp < 0x800) out.push(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F));
      else if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < s.length) {
        var lo = s.charCodeAt(++i);
        var point = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
        out.push(0xF0 | (point >> 18), 0x80 | ((point >> 12) & 0x3F), 0x80 | ((point >> 6) & 0x3F), 0x80 | (point & 0x3F));
      } else out.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
    }
    return out;
  }

  // 数据码字数 = 总码字 − 纠错码字（每块纠错字数 × 分块数）
  function dataCodewords(version) {
    return RAW_CODEWORDS[version] - ECC_PER_BLOCK_M[version] * NUM_BLOCKS_M[version];
  }

  function bitsNeeded(version, byteLen) {
    // byte 模式：4 位模式指示 + 8 位字符计数（版本 1–9）+ 8 位/字节
    return 4 + 8 + byteLen * 8;
  }

  function pickVersion(byteLen) {
    for (var v = 1; v <= MAX_VERSION; v++) {
      if (bitsNeeded(v, byteLen) <= dataCodewords(v) * 8) return v;
    }
    return 0;
  }

  function toCodewords(bytes, version) {
    var capacityBits = dataCodewords(version) * 8;
    var bits = [];
    function push(value, len) {
      for (var i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    }
    push(0b0100, 4);                       // byte 模式
    push(bytes.length, 8);                 // 字符计数
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);
    push(0, Math.min(4, capacityBits - bits.length)); // 终止符
    while (bits.length % 8 !== 0) bits.push(0);
    var out = [];
    for (var j = 0; j < bits.length; j += 8) {
      var byte = 0;
      for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[j + k];
      out.push(byte);
    }
    for (var pad = 0xEC; out.length < dataCodewords(version); pad ^= 0xEC ^ 0x11) out.push(pad);
    return out;
  }

  // 分块 → 加纠错 → 交错
  function addEccAndInterleave(data, version) {
    var numBlocks = NUM_BLOCKS_M[version];
    var eccLen = ECC_PER_BLOCK_M[version];
    var rawCodewords = RAW_CODEWORDS[version];
    var numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);

    var divisor = reedSolomonDivisor(eccLen);
    var blocks = [];
    for (var i = 0, offset = 0; i < numBlocks; i++) {
      var len = shortBlockLen - eccLen + (i < numShortBlocks ? 0 : 1);
      var dat = data.slice(offset, offset + len);
      offset += len;
      var ecc = Array.from(reedSolomonRemainder(dat, divisor));
      if (i < numShortBlocks) dat.push(0); // 占位，交错时跳过
      blocks.push(dat.concat(ecc));
    }

    var result = [];
    var maxLen = blocks[0].length;
    for (var idx = 0; idx < maxLen; idx++) {
      for (var b = 0; b < blocks.length; b++) {
        if (idx === shortBlockLen - eccLen && b < numShortBlocks) continue;
        result.push(blocks[b][idx]);
      }
    }
    return result;
  }

  // ====== 矩阵 ======
  function makeGrid(size) {
    var m = [];
    for (var y = 0; y < size; y++) {
      m.push(new Uint8Array(size)); // 0 = 浅，1 = 深（先当作「未填」，配合 isFunction 使用）
    }
    return m;
  }

  function QrModel(version) {
    this.version = version;
    this.size = version * 4 + 17;
    this.modules = makeGrid(this.size);
    this.isFunction = makeGrid(this.size);
    this.drawFunctionPatterns();
  }

  QrModel.prototype.setFunction = function (x, y, dark) {
    this.modules[y][x] = dark ? 1 : 0;
    this.isFunction[y][x] = 1;
  };

  QrModel.prototype.drawFinder = function (x, y) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        var xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunction(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  };

  QrModel.prototype.drawAlignment = function (x, y) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        this.setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  };

  QrModel.prototype.alignmentPositions = function () {
    if (this.version === 1) return [];
    var numAlign = Math.floor(this.version / 7) + 2;
    var step = Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    for (var pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  };

  QrModel.prototype.drawFormatBits = function (mask) {
    var data = (M_ECL_BITS << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;

    function bit(v, i2) { return ((v >>> i2) & 1) !== 0; }

    for (var a = 0; a <= 5; a++) this.setFunction(8, a, bit(bits, a));
    this.setFunction(8, 7, bit(bits, 6));
    this.setFunction(8, 8, bit(bits, 7));
    this.setFunction(7, 8, bit(bits, 8));
    for (var b = 9; b < 15; b++) this.setFunction(14 - b, 8, bit(bits, b));

    for (var c = 0; c < 8; c++) this.setFunction(this.size - 1 - c, 8, bit(bits, c));
    for (var d = 8; d < 15; d++) this.setFunction(8, this.size - 15 + d, bit(bits, d));
    this.setFunction(8, this.size - 8, true); // 固定深色模块
  };

  QrModel.prototype.drawFunctionPatterns = function () {
    for (var i = 0; i < this.size; i++) {
      this.setFunction(6, i, i % 2 === 0);
      this.setFunction(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(this.size - 4, 3);
    this.drawFinder(3, this.size - 4);

    var pos = this.alignmentPositions();
    var n = pos.length;
    for (var a = 0; a < n; a++) {
      for (var b = 0; b < n; b++) {
        var corner = (a === 0 && b === 0) || (a === 0 && b === n - 1) || (a === n - 1 && b === 0);
        if (!corner) this.drawAlignment(pos[a], pos[b]);
      }
    }
    this.drawFormatBits(0); // 先占位，选定掩码后重画
  };

  QrModel.prototype.drawCodewords = function (codewords) {
    var i = 0;
    for (var right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < this.size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < codewords.length * 8) {
            this.modules[y][x] = (codewords[i >>> 3] >>> (7 - (i & 7))) & 1;
            i++;
          }
        }
      }
    }
  };

  QrModel.prototype.applyMask = function (mask) {
    for (var y = 0; y < this.size; y++) {
      for (var x = 0; x < this.size; x++) {
        var invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: invert = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          case 7: invert = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
          default: throw new Error('bad-mask');
        }
        if (!this.isFunction[y][x] && invert) this.modules[y][x] ^= 1;
      }
    }
  };

  function addHistory(runLength, history, size) {
    if (history[0] === 0) runLength += size; // 首段前面是浅色边界
    history.pop();
    history.unshift(runLength);
  }

  function countPatterns(history) {
    var n = history[1];
    var core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
    return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0)
      + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
  }

  function terminateAndCount(color, runLength, history, size) {
    if (color) { addHistory(runLength, history, size); runLength = 0; }
    runLength += size; // 末尾补浅色边界
    addHistory(runLength, history, size);
    return countPatterns(history);
  }

  QrModel.prototype.penaltyScore = function () {
    var size = this.size, result = 0, x, y;

    for (y = 0; y < size; y++) {
      var runColor = false, runLen = 0, hist = [0, 0, 0, 0, 0, 0, 0];
      for (x = 0; x < size; x++) {
        var dark = this.modules[y][x] === 1;
        if (dark === runColor) {
          runLen++;
          if (runLen === 5) result += PENALTY_N1;
          else if (runLen > 5) result++;
        } else {
          addHistory(runLen, hist, size);
          if (!runColor) result += countPatterns(hist) * PENALTY_N3;
          runColor = dark;
          runLen = 1;
        }
      }
      result += terminateAndCount(runColor, runLen, hist, size) * PENALTY_N3;
    }

    for (x = 0; x < size; x++) {
      var cColor = false, cLen = 0, cHist = [0, 0, 0, 0, 0, 0, 0];
      for (y = 0; y < size; y++) {
        var darkC = this.modules[y][x] === 1;
        if (darkC === cColor) {
          cLen++;
          if (cLen === 5) result += PENALTY_N1;
          else if (cLen > 5) result++;
        } else {
          addHistory(cLen, cHist, size);
          if (!cColor) result += countPatterns(cHist) * PENALTY_N3;
          cColor = darkC;
          cLen = 1;
        }
      }
      result += terminateAndCount(cColor, cLen, cHist, size) * PENALTY_N3;
    }

    for (y = 0; y < size - 1; y++) {
      for (x = 0; x < size - 1; x++) {
        var c = this.modules[y][x];
        if (c === this.modules[y][x + 1] && c === this.modules[y + 1][x] && c === this.modules[y + 1][x + 1]) {
          result += PENALTY_N2;
        }
      }
    }

    var darkCount = 0;
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (this.modules[y][x] === 1) darkCount++;
    var total = size * size;
    var k = Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;
    return result;
  };

  // ====== 对外接口 ======
  // encode(text, options?) → { size, modules: Array<Array<0|1>>, version, mask }
  // options.mask（0–7）可强制指定掩码，仅供测试与对拍使用；正常调用走罚分自动选优。
  function encode(text, options) {
    var forceMask = options && Number.isInteger(options.mask) && options.mask >= 0 && options.mask <= 7
      ? options.mask : null;
    var bytes = utf8Bytes(text);
    var version = pickVersion(bytes.length);
    if (!version) throw new Error('qr-content-too-long');
    var codewords = addEccAndInterleave(toCodewords(bytes, version), version);
    var model = new QrModel(version);
    model.drawCodewords(codewords);

    var bestMask = 0, minPenalty = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      model.applyMask(mask);
      model.drawFormatBits(mask);
      if (forceMask === null) {
        var penalty = model.penaltyScore();
        if (penalty < minPenalty) { minPenalty = penalty; bestMask = mask; }
      }
      model.applyMask(mask); // 撤销
    }
    if (forceMask !== null) bestMask = forceMask;
    model.applyMask(bestMask);
    model.drawFormatBits(bestMask);

    var out = [];
    for (var y = 0; y < model.size; y++) {
      var row = new Array(model.size);
      for (var x = 0; x < model.size; x++) row[x] = model.modules[y][x] === 1 ? 1 : 0;
      out.push(row);
    }
    return { size: model.size, modules: out, version: version, mask: bestMask };
  }

  // 画到 canvas：默认深色模块用浅色（适合本应用深色界面），四周留 4 模块静区
  function toCanvas(text, canvas, options) {
    var opts = options || {};
    var scale = Math.max(1, Math.round(opts.scale || 4));
    var margin = opts.margin === undefined ? 4 : Math.max(0, opts.margin);
    var qr = encode(text);
    var dim = (qr.size + margin * 2) * scale;
    if (canvas.width !== dim) canvas.width = dim;
    if (canvas.height !== dim) canvas.height = dim;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, dim, dim);
    ctx.fillStyle = opts.light || '#ffffff';
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = opts.dark || '#111111';
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        if (qr.modules[y][x]) ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
      }
    }
    return qr;
  }

  return {
    encode: encode,
    toCanvas: toCanvas,
    // 供自测/对拍使用（不参与正常运行路径）
    _internals: {
      utf8Bytes: utf8Bytes,
      pickVersion: pickVersion,
      dataCodewords: dataCodewords,
      toCodewords: toCodewords,
      addEccAndInterleave: addEccAndInterleave,
      RAW_CODEWORDS: RAW_CODEWORDS,
      ECC_PER_BLOCK_M: ECC_PER_BLOCK_M,
      NUM_BLOCKS_M: NUM_BLOCKS_M,
    },
  };
});
