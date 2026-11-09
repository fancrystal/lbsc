import test from 'node:test';
import assert from 'node:assert/strict';
import { nextValue, matchParticipants } from '../src/domain.js';

test('礼包每日复利按整数四舍五入且不超过上限', () => {
  assert.equal(nextValue(300, 1, 600), 303);
  assert.equal(nextValue(303, 1, 600), 306);
  assert.equal(nextValue(599, 1, 600), 600);
  assert.equal(nextValue(600, 1, 600), 600);
});

test('两人各有一笔买入卖出，且不与自己匹配', () => {
  const orders = matchParticipants(['a', 'b'], () => 0.5);
  assert.deepEqual(orders, [{buyer: 'a', seller: 'b'}, {buyer: 'b', seller: 'a'}]);
});

test('多人匹配时每人买入和卖出各一次', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const orders = matchParticipants(ids, () => 0.5);
  assert.equal(orders.length, ids.length);
  assert.equal(new Set(orders.map(x => x.buyer)).size, ids.length);
  assert.equal(new Set(orders.map(x => x.seller)).size, ids.length);
  assert.ok(orders.every(x => x.buyer !== x.seller));
  assert.deepEqual(matchParticipants(['a'], () => 0.5), []);
});
