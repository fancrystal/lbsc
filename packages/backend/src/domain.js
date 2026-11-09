import { randomInt } from 'node:crypto';
/** Calculate an integer daily value; percent is supplied as a non-negative decimal. */
export function nextValue(value, percent, cap) {
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(cap) || cap < value) throw new RangeError('无效的礼包价值或上限');
  const rate = String(percent);
  if (!/^\d+(\.\d+)?$/.test(rate)) throw new RangeError('无效的溢价率');
  const [whole, fraction = ''] = rate.split('.');
  const scale = 10n ** BigInt(fraction.length);
  const rateUnits = BigInt(whole) * scale + BigInt(fraction || '0');
  const denominator = 100n * scale;
  const numerator = BigInt(value) * (denominator + rateUnits);
  const rounded = (numerator * 2n + denominator) / (denominator * 2n);
  return Number(rounded > BigInt(cap) ? BigInt(cap) : rounded);
}

/** Shuffle participants into a cycle: everyone buys and sells once, never to self. */
export function matchParticipants(ids, random = () => randomInt(0, 2 ** 32) / 2 ** 32) {
  if (new Set(ids).size !== ids.length) throw new Error('预约用户重复');
  if (ids.length < 2) return [];
  const shuffled = [...ids];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    if (j < 0 || j > i) throw new RangeError('随机数无效');
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.map((buyer, i) => ({ buyer, seller: shuffled[(i + 1) % shuffled.length] }));
}
