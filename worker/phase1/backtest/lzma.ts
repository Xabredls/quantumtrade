/**
 * Minimal pure-JS LZMA1 decoder ("LZMA alone" .lzma files, which is what Dukascopy .bi5 files are).
 * Written so no npm package is needed. Port of the reference decoder (LzmaSpec) — decode only.
 */
class RangeDecoder {
  range = 0xffffffff;
  code = 0;
  pos: number;
  constructor(private buf: Uint8Array, start: number) {
    if (buf[start] !== 0) throw new Error('LZMA: bad range-coder header');
    this.pos = start + 1;
    for (let i = 0; i < 4; i++) this.code = ((this.code << 8) | this.next()) >>> 0;
  }
  private next(): number {
    if (this.pos >= this.buf.length) throw new Error('LZMA: input truncated');
    return this.buf[this.pos++];
  }
  private normalize() {
    if (this.range < 0x1000000) {
      this.range = (this.range << 8) >>> 0;
      this.code = ((this.code << 8) | this.next()) >>> 0;
    }
  }
  bit(probs: Uint16Array, i: number): number {
    const p = probs[i];
    const bound = (this.range >>> 11) * p;
    let b: number;
    if (this.code < bound) { this.range = bound; probs[i] = p + ((2048 - p) >>> 5); b = 0; }
    else { this.range -= bound; this.code -= bound; probs[i] = p - (p >>> 5); b = 1; }
    this.normalize();
    return b;
  }
  direct(n: number): number {
    let res = 0;
    for (; n > 0; n--) {
      this.range >>>= 1;
      let b = 0;
      if (this.code >= this.range) { this.code -= this.range; b = 1; }
      this.normalize();
      res = ((res << 1) | b) >>> 0;
    }
    return res;
  }
  tree(probs: Uint16Array, off: number, bits: number): number {
    let m = 1;
    for (let i = 0; i < bits; i++) m = (m << 1) + this.bit(probs, off + m);
    return m - (1 << bits);
  }
  reverse(probs: Uint16Array, off: number, bits: number): number {
    let m = 1, sym = 0;
    for (let i = 0; i < bits; i++) { const b = this.bit(probs, off + m); m = (m << 1) + b; sym |= b << i; }
    return sym;
  }
}

const probs = (n: number) => new Uint16Array(n).fill(1024);

class LenDecoder {
  choice = probs(2);
  low = probs(16 << 3);
  mid = probs(16 << 3);
  high = probs(256);
  decode(rc: RangeDecoder, posState: number): number {
    if (rc.bit(this.choice, 0) === 0) return rc.tree(this.low, posState << 3, 3);
    if (rc.bit(this.choice, 1) === 0) return 8 + rc.tree(this.mid, posState << 3, 3);
    return 16 + rc.tree(this.high, 0, 8);
  }
}

export function lzmaDecode(input: Uint8Array): Uint8Array {
  if (input.length < 13) throw new Error('LZMA: input too short');
  let d = input[0];
  if (d >= 9 * 5 * 5) throw new Error('LZMA: bad properties byte');
  const lc = d % 9; d = Math.floor(d / 9);
  const lp = d % 5, pb = Math.floor(d / 5);
  const lo = input[5] | (input[6] << 8) | (input[7] << 16) | (input[8] << 24);
  const hi = input[9] | (input[10] << 8) | (input[11] << 16) | (input[12] << 24);
  const unknownSize = lo === -1 && hi === -1;
  const size = unknownSize ? -1 : (lo >>> 0) + (hi >>> 0) * 4294967296;
  if (!unknownSize && size > 512 * 1024 * 1024) throw new Error('LZMA: unreasonable output size');

  const rc = new RangeDecoder(input, 13);
  let out = new Uint8Array(unknownSize ? 1 << 16 : size);
  let outPos = 0;
  const ensure = (n: number) => {
    if (outPos + n <= out.length) return;
    const bigger = new Uint8Array(Math.max(out.length * 2, outPos + n));
    bigger.set(out); out = bigger;
  };

  const literal = probs(0x300 << (lc + lp));
  const isMatch = probs(12 << 4), isRep = probs(12), isRepG0 = probs(12), isRepG1 = probs(12), isRepG2 = probs(12), isRep0Long = probs(12 << 4);
  const posSlot = Array.from({ length: 4 }, () => probs(64));
  const posSpecial = probs(1 + 128 - 14);
  const align = probs(16);
  const lenDec = new LenDecoder(), repLenDec = new LenDecoder();
  let state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0;
  const pbMask = (1 << pb) - 1, lpMask = (1 << lp) - 1;

  while (unknownSize || outPos < size) {
    const posState = outPos & pbMask;
    if (rc.bit(isMatch, (state << 4) + posState) === 0) {
      const prev = outPos > 0 ? out[outPos - 1] : 0;
      const base = 0x300 * (((outPos & lpMask) << lc) + (prev >> (8 - lc)));
      let sym = 1;
      if (state >= 7) {
        let mb = out[outPos - rep0 - 1];
        do {
          const matchBit = (mb >> 7) & 1; mb <<= 1;
          const b = rc.bit(literal, base + ((1 + matchBit) << 8) + sym);
          sym = (sym << 1) | b;
          if (matchBit !== b) break;
        } while (sym < 0x100);
      }
      while (sym < 0x100) sym = (sym << 1) | rc.bit(literal, base + sym);
      ensure(1);
      out[outPos++] = sym & 0xff;
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
      continue;
    }
    let len: number;
    if (rc.bit(isRep, state) !== 0) {
      if (outPos === 0) throw new Error('LZMA: corrupt data');
      if (rc.bit(isRepG0, state) === 0) {
        if (rc.bit(isRep0Long, (state << 4) + posState) === 0) {
          state = state < 7 ? 9 : 11;
          ensure(1);
          out[outPos] = out[outPos - rep0 - 1]; outPos++;
          continue;
        }
      } else {
        let dist: number;
        if (rc.bit(isRepG1, state) === 0) dist = rep1;
        else {
          if (rc.bit(isRepG2, state) === 0) dist = rep2;
          else { dist = rep3; rep3 = rep2; }
          rep2 = rep1;
        }
        rep1 = rep0; rep0 = dist;
      }
      len = repLenDec.decode(rc, posState);
      state = state < 7 ? 8 : 11;
    } else {
      rep3 = rep2; rep2 = rep1; rep1 = rep0;
      len = lenDec.decode(rc, posState);
      state = state < 7 ? 7 : 10;
      const slot = rc.tree(posSlot[len < 4 ? len : 3], 0, 6);
      if (slot < 4) rep0 = slot;
      else {
        const nbits = (slot >> 1) - 1;
        let dist = ((2 | (slot & 1)) << nbits) >>> 0;
        if (slot < 14) dist += rc.reverse(posSpecial, dist - slot, nbits);
        else {
          dist += (rc.direct(nbits - 4) << 4) >>> 0;
          dist += rc.reverse(align, 0, 4);
        }
        rep0 = dist >>> 0;
        if (rep0 === 0xffffffff) break; // end-of-stream marker
      }
    }
    len += 2;
    if (rep0 >= outPos) throw new Error('LZMA: corrupt data (bad distance)');
    if (!unknownSize && outPos + len > size) throw new Error('LZMA: corrupt data (overrun)');
    ensure(len);
    for (let i = 0; i < len; i++) { out[outPos] = out[outPos - rep0 - 1]; outPos++; }
  }
  return out.subarray(0, outPos);
}
