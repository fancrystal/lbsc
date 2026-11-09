import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { tick } from '../src/server.js';

test('转账截图上传满48小时后由定时任务清理，订单不受影响',t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-08T08:10:00Z')});
 const s=new Store(':memory:');
 try {
  const a=s.createUser('a','A','password1',{wechat:'a'}),b=s.createUser('b','B','password1',{wechat:'b'});
  const type=s.saveType({name:'包',initial:300,cap:600,rate:1,pledge:1,enabled:1});
  s.adjustPoints(a,300,'测试','admin');s.adjustPoints(b,300,'测试','admin');s.issueGift(a,type,'admin');
  s.reserve(a,type,'2026-11-08');s.reserve(b,type,'2026-11-08');s.match(type,'2026-11-08','admin');s.finalize(type,'2026-11-08');
  const order=s.ordersFor(b).find(o=>o.buyer_id===b);s.submitProof(b,order.id,'截图');s.confirm(a,order.id);
  t.mock.timers.setTime(Date.parse('2026-11-10T08:09:59Z'));tick(s);assert.equal(s.proofFor(a,order.id),'截图');
  t.mock.timers.setTime(Date.parse('2026-11-10T08:10:00Z'));tick(s);assert.throws(()=>s.proofFor(a,order.id));
  assert.equal(s.ordersFor(b).find(o=>o.id===order.id).status,'completed');
 } finally {s.db.close()}
});

test('停机跨过截止时间时订单进入人工处理，不能自动扣质押',()=>{
 const s=new Store(':memory:');const a=s.createUser('a','A','password1',{wechat:'a',alipay:'a'}),b=s.createUser('b','B','password1',{wechat:'b',alipay:'b'});
 const t=s.saveType({name:'礼包',initial:300,cap:600,rate:1,pledge:100,enabled:1});s.adjustPoints(a,400,'初始','admin');s.adjustPoints(b,400,'初始','admin');
 const g=s.issueGift(a,t,'admin');s.run("UPDATE gifts SET created='2026-11-07T04:00:00Z' WHERE id=?",g);
 s.reserve(a,t,'2026-11-08');s.reserve(b,t,'2026-11-08');
 tick(s,'2026-11-08',970);assert.equal(s.ordersFor(b).find(x=>x.buyer_id===b).status,'unpaid');
 tick(s,'2026-11-09',0);tick(s,'2026-11-09',0);
 assert.equal(s.user(b).points,400);assert.equal(s.user(b).frozen,100);assert.equal(s.ordersFor(b).find(x=>x.buyer_id===b).status,'dispute');assert.equal(s.giftsFor(a)[0].value,306);
 const order=s.ordersFor(b).find(x=>x.buyer_id===b);s.resolve(order.id,'cancel','系统故障','admin');assert.equal(s.user(b).frozen,0);assert.equal(s.giftsFor(a)[0].locked,0);assert.equal(s.user(b).points,400);
});

test('错过整个匹配窗口时取消预约并释放礼包和质押',()=>{
 const s=new Store(':memory:');const a=s.createUser('a','A','password1',{wechat:'a',alipay:'a'}),b=s.createUser('b','B','password1',{wechat:'b',alipay:'b'});
 const t=s.saveType({name:'礼包',initial:300,cap:600,rate:1,pledge:100,enabled:1});s.adjustPoints(a,300,'初始','admin');s.adjustPoints(b,300,'初始','admin');s.issueGift(a,t,'admin');s.reserve(a,t,'2026-11-08');s.reserve(b,t,'2026-11-08');
 tick(s,'2026-11-08',1321);assert.equal(s.user(b).points,300);assert.equal(s.user(b).frozen,0);assert.equal(s.giftsFor(a)[0].locked,0);assert.equal(s.ordersFor(b).length,0);
});

test('服务正常运行时按时扣除超时买方质押',()=>{
 const s=new Store(':memory:');const a=s.createUser('a','A','password1',{wechat:'a',alipay:'a'}),b=s.createUser('b','B','password1',{wechat:'b',alipay:'b'});
 const t=s.saveType({name:'礼包',initial:300,cap:600,rate:1,pledge:100,enabled:1});s.adjustPoints(a,300,'初始','admin');s.adjustPoints(b,300,'初始','admin');s.issueGift(a,t,'admin');s.reserve(a,t,'2026-11-08');s.reserve(b,t,'2026-11-08');
 tick(s,'2026-11-08',970);tick(s,'2026-11-08',1319);tick(s,'2026-11-08',1320);assert.equal(s.user(b).points,200);assert.equal(s.user(b).frozen,0);assert.equal(s.ordersFor(b).find(x=>x.buyer_id===b).status,'expired');
});

test('后台设置的新时间从次日生效并用于匹配',()=>{
 const s=new Store(':memory:');const a=s.createUser('a','A','password1',{wechat:'a',alipay:'a'}),b=s.createUser('b','B','password1',{wechat:'b',alipay:'b'});
 const t=s.saveType({name:'礼包',initial:300,cap:600,rate:1,pledge:100,enabled:1});s.adjustPoints(a,300,'初始','admin');s.adjustPoints(b,300,'初始','admin');s.issueGift(a,t,'admin');
 s.setSchedule({start:60,match:900,final:910,deadline:1200},'admin','2026-11-07');
 assert.equal(s.schedule('2026-11-07').match,960);assert.equal(s.schedule('2026-11-08').match,900);
 s.reserve(a,t,'2026-11-08');s.reserve(b,t,'2026-11-08');tick(s,'2026-11-08',909);assert.equal(s.ordersFor(b).length,0);
 tick(s,'2026-11-08',910);assert.equal(s.ordersFor(b).find(x=>x.buyer_id===b).status,'unpaid');
 assert.throws(()=>s.setSchedule({start:900,match:800,final:910,deadline:1200},'admin','2026-11-08'));
});

test('重启时无礼包的历史预约也会被取消并退回质押',()=>{
 const s=new Store(':memory:');const a=s.createUser('a','A','password1',{wechat:'a',alipay:'a'});
 const t=s.saveType({name:'礼包',initial:300,cap:600,rate:1,pledge:100,enabled:1});s.adjustPoints(a,300,'初始','admin');s.reserve(a,t,'2026-11-08');
 tick(s,'2026-11-09',30);assert.equal(s.user(a).frozen,0);assert.equal(s.get('SELECT status FROM reservations WHERE user_id=?',a).status,'unmatched');
});
