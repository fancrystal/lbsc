import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';

test('重置礼包类型会释放旧预约质押、清理旧礼包交易并创建新的商品礼包',()=>{
 const s=new Store(':memory:');
 try{
  const seller=s.createUser('seller','卖家','123456',{wechat:'seller'}),buyer=s.createUser('buyer','买家','123456',{wechat:'buyer'});
  const old=s.saveType({name:'旧礼包',initial:300,cap:600,rate:1,pledge:100,enabled:1});
  s.adjustPoints(seller,100,'测试','admin');s.adjustPoints(buyer,100,'测试','admin');s.issueGift(seller,old,'admin');
  s.reserve(seller,old,'2026-11-08');s.reserve(buyer,old,'2026-11-08');
  const types=s.replaceGiftTypes([
   {name:'商品1包',initial:500,cap:1000,rate:1,pledge:100,enabled:1},
   {name:'商品2包',initial:1000,cap:2000,rate:1,pledge:200,enabled:1},
   {name:'商品3包',initial:2000,cap:4000,rate:1,pledge:300,enabled:1},
   {name:'商品4包',initial:4000,cap:8000,rate:1,pledge:400,enabled:1},
   {name:'商品5包',initial:8000,cap:16000,rate:1,pledge:500,enabled:1}
  ],'admin');
  assert.deepEqual(types.map(t=>[t.name,t.initial,t.cap,t.pledge,t.enabled]),[
   ['商品1包',500,1000,100,1],['商品2包',1000,2000,200,1],['商品3包',2000,4000,300,1],['商品4包',4000,8000,400,1],['商品5包',8000,16000,500,1]
  ]);
  assert.equal(s.get('SELECT COUNT(*) count FROM gifts').count,0);assert.equal(s.get('SELECT COUNT(*) count FROM reservations').count,0);assert.equal(s.get('SELECT COUNT(*) count FROM matches').count,0);
  assert.equal(s.user(seller).frozen,0);assert.equal(s.user(buyer).frozen,0);
 }finally{s.db.close()}
});

test('重置礼包类型不会重复退回已取消预约的质押',()=>{
 const s=new Store(':memory:');
 try{
  const user=s.createUser('user','用户','123456',{wechat:'user'}),type=s.saveType({name:'旧礼包',initial:300,cap:600,rate:1,pledge:100,enabled:1});
  s.adjustPoints(user,100,'测试','admin');s.reserve(user,type,'2026-11-08');s.match(type,'2026-11-08','admin');s.finalize(type,'2026-11-08');
  assert.equal(s.user(user).frozen,0);
  s.replaceGiftTypes([{name:'商品1包',initial:500,cap:1000,rate:1,pledge:100,enabled:1}],'admin');
  assert.equal(s.user(user).frozen,0);
 }finally{s.db.close()}
});

test('冻结质押账目修正以当前有效预约为准',()=>{
 const s=new Store(':memory:');
 try{
  const user=s.createUser('user','用户','123456',{wechat:'user'}),type=s.saveType({name:'商品1包',initial:500,cap:1000,rate:1,pledge:100,enabled:1});
  s.adjustPoints(user,100,'测试','admin');s.reserve(user,type,'2026-11-08');s.run('UPDATE users SET frozen=-100 WHERE id=?',user);
  s.reconcileFrozen('admin');
  assert.equal(s.user(user).frozen,100);assert.equal(s.get("SELECT frozen_delta FROM ledger WHERE reason='冻结质押账目修正' ORDER BY id DESC LIMIT 1").frozen_delta,200);
 }finally{s.db.close()}
});

test('礼包类型按创建顺序从低金额商品1包到高金额商品5包展示',()=>{
 const s=new Store(':memory:');
 try{
  s.saveType({name:'商品1包',initial:500,cap:1000,rate:1,pledge:100,enabled:1});
  s.saveType({name:'商品2包',initial:1000,cap:2000,rate:1,pledge:200,enabled:1});
  s.saveType({name:'商品3包',initial:2000,cap:4000,rate:1,pledge:300,enabled:1});
  assert.deepEqual(s.types().map(t=>t.name),['商品1包','商品2包','商品3包']);
 }finally{s.db.close()}
});

test('预约使用后台设置的固定质押，礼包价值变化不调整已冻结额度',()=>{
 const s=new Store(':memory:');
 try{
  const a=s.createUser('a','甲','123456',{wechat:'a'}),b=s.createUser('b','乙','123456',{wechat:'b'});
  const type=s.saveType({name:'包',initial:300,cap:600,rate:1,pledge:100,enabled:1});
  s.adjustPoints(a,200,'test','admin');s.adjustPoints(b,200,'test','admin');const gift=s.issueGift(a,type,'admin');s.run('UPDATE gifts SET value=450 WHERE id=?',gift);
  assert.throws(()=>s.reserve(a,type,'2026-11-08',450),/金额已变化/);
  s.reserve(a,type,'2026-11-08',100);s.reserve(b,type,'2026-11-08',100);assert.equal(s.user(b).frozen,100);
  s.saveType({name:'包',initial:300,cap:600,rate:1,pledge:150,enabled:1},type);
  s.match(type,'2026-11-08','test');s.finalize(type,'2026-11-08');assert.equal(s.user(b).frozen,100);
  const order=s.ordersFor(b).find(o=>o.buyer_id===b);assert.equal(order.price,450);s.expire('2026-11-08');assert.equal(s.user(b).points,100);assert.equal(s.user(b).frozen,0);
  const c=s.createUser('c','丙','123456',{wechat:'c'});s.adjustPoints(c,200,'test','admin');s.reserve(c,type,'2026-11-09',150);assert.equal(s.user(c).frozen,150);
 }finally{s.db.close()}
});

test('旧价值模式预约固定匹配后仍按原规则退回差额',()=>{
 const s=new Store(':memory:');
 try {
  const a=s.createUser('a','甲','123456',{wechat:'a'}),b=s.createUser('b','乙','123456',{wechat:'b'});
  const type=s.saveType({name:'礼包',initial:300,cap:600,rate:1,pledge:450,enabled:1});
  s.adjustPoints(a,600,'测试','admin');s.adjustPoints(b,600,'测试','admin');
  const cheap=s.issueGift(a,type,'admin'),expensive=s.issueGift(b,type,'admin');s.run('UPDATE gifts SET value=450 WHERE id=?',expensive);
  assert.equal(s.types().find(x=>x.id===type).current_value,450);
  assert.throws(()=>s.reserve(a,type,'2026-11-08',300),/金额已变化/);assert.equal(s.user(a).frozen,0);
  s.reserve(a,type,'2026-11-08');s.reserve(b,type,'2026-11-08');assert.equal(s.user(a).frozen,450);assert.equal(s.user(b).frozen,450);
  s.run("UPDATE reservations SET pledge_mode='value' WHERE type_id=?",type);s.match(type,'2026-11-08','test');s.finalize(type,'2026-11-08');
  const buyer=s.ordersFor(b).find(o=>o.buyer_id===b);assert.equal(buyer.gift_id,cheap);assert.equal(buyer.price,300);
  assert.equal(s.user(b).frozen,300);assert.equal(s.user(a).frozen,450);
  s.submitProof(b,buyer.id,'截图');s.confirm(a,buyer.id);assert.equal(s.user(b).frozen,0);
 }finally{s.db.close()}
});

test('礼包类型必须单独设置预约质押',()=>{
 const s=new Store(':memory:');try{assert.throws(()=>s.saveType({name:'礼包',initial:300,cap:600,rate:1,enabled:1}),/礼包参数/)}finally{s.db.close()}
});

test('旧价值模式预约遇到更高价值且不足补足时取消订单',()=>{
 const s=new Store(':memory:');
 try {
  const a=s.createUser('a','甲','123456',{wechat:'a'}),b=s.createUser('b','乙','123456',{wechat:'b'});
  const type=s.saveType({name:'礼包',initial:300,cap:600,rate:1,pledge:300,enabled:1});s.adjustPoints(a,300,'测试','admin');s.adjustPoints(b,300,'测试','admin');
  const gift=s.issueGift(a,type,'admin');s.reserve(a,type,'2026-11-08');s.reserve(b,type,'2026-11-08');s.run('UPDATE gifts SET value=400 WHERE id=?',gift);
  s.run("UPDATE reservations SET pledge_mode='value' WHERE type_id=?",type);s.match(type,'2026-11-08','test');s.finalize(type,'2026-11-08');const order=s.ordersFor(b).find(o=>o.buyer_id===b);
  assert.equal(order.status,'cancelled');assert.equal(s.user(b).frozen,0);assert.equal(s.user(b).points,300);assert.equal(s.giftsFor(a)[0].locked,0);
 }finally{s.db.close()}
});

test('新规则上线前的预约保留原质押数值',()=>{
 const s=new Store(':memory:');
 try {
  const a=s.createUser('a','甲','123456',{wechat:'a'}),b=s.createUser('b','乙','123456',{wechat:'b'});
  const type=s.saveType({name:'礼包',initial:300,cap:600,rate:1,pledge:100,enabled:1});s.adjustPoints(a,300,'测试','admin');s.adjustPoints(b,300,'测试','admin');s.issueGift(a,type,'admin');
  s.reserve(a,type,'2026-11-08');s.reserve(b,type,'2026-11-08');
  s.run('UPDATE reservations SET pledge=100 WHERE type_id=?',type);s.run('UPDATE users SET frozen=100 WHERE id IN (?,?)',a,b);
  s.db.exec('ALTER TABLE reservations DROP COLUMN pledge_mode');s.migrateReservationPledgeMode();
  s.match(type,'2026-11-08','test');s.finalize(type,'2026-11-08');
  assert.equal(s.user(b).frozen,100);assert.equal(s.ordersFor(b).find(o=>o.buyer_id===b).price,300);
 }finally{s.db.close()}
});

test('注册和修改密码允许六位纯数字，同时拒绝不足六位或超过上限的密码',()=>{
 const s=new Store(':memory:');const u=s.createUser('a','A','123456',{wechat:'a',alipay:'a'});
 assert.ok(s.login('a','123456'));s.changePassword(u,'123456','654321');assert.ok(s.login('a','654321'));
 assert.throws(()=>s.createUser('b','B','12345',{wechat:'b',alipay:'b'}));
 assert.throws(()=>s.changePassword(u,'654321','1'.repeat(129)));
});

test('预约冻结、双方匹配和确认收款原子完成礼包转移', () => {
  const s = new Store(':memory:');
  const a = s.createUser('a', 'A', 'password1', {wechat:'a',alipay:'a'});
  const b = s.createUser('b', 'B', 'password1', {wechat:'b',alipay:'b'});
  const t = s.saveType({name:'商品1包',initial:300,cap:600,rate:1,pledge:100,enabled:1});
  s.adjustPoints(a, 300, '初始', 'admin'); s.adjustPoints(b, 300, '初始', 'admin');
  const g = s.issueGift(a,t,'admin');
  s.reserve(a,t,'2026-11-08'); s.reserve(b,t,'2026-11-08');
  assert.throws(() => s.redeem(a,g), /锁定/);
  s.match(t,'2026-11-08','admin'); s.finalize(t,'2026-11-08');
  const buy=s.ordersFor(b).find(o=>o.buyer_id===b);
  assert.equal(buy.price,300);
  s.submitProof(b,buy.id,'凭证'); s.confirm(a,buy.id);
  assert.equal(s.giftsFor(b)[0].id,g);
  assert.equal(s.user(b).points,300); assert.equal(s.user(b).frozen,0);
  assert.throws(() => s.confirm(a,buy.id));
});

test('超时扣除买方冻结质押、卖方礼包解锁且允许申诉', () => {
  const s=new Store(':memory:');
  const a=s.createUser('a','A','password1',{wechat:'a',alipay:'a'}), b=s.createUser('b','B','password1',{wechat:'b',alipay:'b'});
  const t=s.saveType({name:'包',initial:300,cap:600,rate:1,pledge:100,enabled:1});
  s.adjustPoints(a,300,'初始','admin');s.adjustPoints(b,300,'初始','admin');
  const g=s.issueGift(a,t,'admin');s.reserve(a,t,'2026-11-08');s.reserve(b,t,'2026-11-08');
  s.match(t,'2026-11-08','admin');s.finalize(t,'2026-11-08');s.expire('2026-11-08');
  const order=s.ordersFor(b).find(o=>o.buyer_id===b);
  assert.equal(order.status,'expired');assert.equal(s.user(b).points,200);assert.equal(s.user(b).frozen,0);
  assert.equal(s.giftsFor(a)[0].locked,0);s.appeal(b,order.id,'已付款');
  assert.equal(s.ordersFor(b).find(o=>o.id===order.id).status,'appeal');
  assert.equal(s.redeem(a,g),300);
});

test('商城购买扣积分和库存并保存默认地址快照',()=>{
  const s=new Store(':memory:');const u=s.createUser('a','A','password1',{wechat:'a',alipay:'a'});
  s.adjustPoints(u,500,'初始','admin');s.setAddress(u,'张三','13800000000','上海市');
  const p=s.saveProduct({name:'蔬菜月卡',price:300,stock:1,enabled:1});
  s.purchase(u,p); assert.equal(s.user(u).points,200);
  assert.equal(s.shopOrders(u)[0].address,'上海市');
  assert.throws(()=>s.purchase(u,p),/库存/);
});

test('凌晨重复执行只溢价一次，同日发放礼包不提前溢价',()=>{
 const s=new Store(':memory:');const u=s.createUser('a','A','password1',{wechat:'a',alipay:'a'});
 const t=s.saveType({name:'包',initial:300,cap:600,rate:1,pledge:10,enabled:1});const g=s.issueGift(u,t,'admin');
 s.run("UPDATE gifts SET created='2026-11-07T04:00:00.000Z' WHERE id=?",g);
 s.grow('2026-11-08');s.grow('2026-11-08');assert.equal(s.giftsFor(u)[0].value,303);
 const g2=s.issueGift(u,t,'admin');s.run("UPDATE gifts SET created='2026-11-08T04:00:00.000Z' WHERE id=?",g2);
 s.grow('2026-11-08');assert.equal(s.giftsFor(u).find(x=>x.id===g2).value,300);
});

test('单人预约取消时解冻积分和礼包',()=>{
 const s=new Store(':memory:');const u=s.createUser('a','A','password1',{wechat:'a',alipay:'a'});
 const t=s.saveType({name:'包',initial:300,cap:600,rate:1,pledge:100,enabled:1});s.adjustPoints(u,300,'初始','admin');s.issueGift(u,t,'admin');s.reserve(u,t,'2026-11-08');s.match(t,'2026-11-08','admin');s.finalize(t,'2026-11-08');
 assert.equal(s.user(u).frozen,0);assert.equal(s.giftsFor(u)[0].locked,0);
});

test('超时申诉可由管理员退回质押并转移仍可用的原礼包',()=>{
 const s=new Store(':memory:');const a=s.createUser('a','A','password1',{wechat:'a',alipay:'a'}),b=s.createUser('b','B','password1',{wechat:'b',alipay:'b'});
 const t=s.saveType({name:'包',initial:300,cap:600,rate:1,pledge:100,enabled:1});s.adjustPoints(a,300,'初始','admin');s.adjustPoints(b,300,'初始','admin');
 const g=s.issueGift(a,t,'admin');s.reserve(a,t,'2026-11-08');s.reserve(b,t,'2026-11-08');s.match(t,'2026-11-08','admin');s.finalize(t,'2026-11-08');s.expire('2026-11-08');
 const o=s.ordersFor(b).find(x=>x.buyer_id===b);s.appeal(b,o.id,'已付款');s.resolve(o.id,'refund_transfer','核实到账','admin');
 assert.equal(s.user(b).points,300);assert.equal(s.giftsFor(b)[0].id,g);assert.throws(()=>s.resolve(o.id,'refund_transfer','重复','admin'));
});

test('价值上限不能低于流通礼包且新溢价率次日生效',()=>{
 const s=new Store(':memory:');const u=s.createUser('a','A','password1',{wechat:'a',alipay:'a'});
 const t=s.saveType({name:'包',initial:300,cap:600,rate:1,pledge:100,enabled:1});const g=s.issueGift(u,t,'admin');
 assert.throws(()=>s.saveType({name:'包',initial:200,cap:299,rate:2,pledge:100,enabled:1},t),/上限/);
 s.saveType({name:'包',initial:300,cap:600,rate:2,pledge:100,enabled:1},t);
 const type=s.types()[0];assert.equal(type.rate,'1');assert.equal(type.pending_rate,'2');
 s.run("UPDATE gifts SET created='2026-11-07T04:00:00Z' WHERE id=?",g);
 s.run("UPDATE types SET effective_day='2026-11-08' WHERE id=?",t);s.grow('2026-11-08');assert.equal(s.giftsFor(u)[0].value,306);
});

test('匹配固定后买方看到的卖方收款资料不会随资料修改而变化',()=>{
 const s=new Store(':memory:');const a=s.createUser('a','A','password1',{wechat:'old-wechat',alipay:'old-alipay'}),b=s.createUser('b','B','password1',{wechat:'b',alipay:'b'});
 const t=s.saveType({name:'包',initial:300,cap:600,rate:1,pledge:10,enabled:1});s.adjustPoints(a,300,'初始','admin');s.adjustPoints(b,300,'初始','admin');s.issueGift(a,t,'admin');s.reserve(a,t,'2026-11-08');s.reserve(b,t,'2026-11-08');s.match(t,'2026-11-08','admin');s.finalize(t,'2026-11-08');
 s.updateProfile(a,{name:'新名称',wechat:'new-wechat',alipay:'new-alipay'});
 const o=s.ordersFor(b).find(x=>x.buyer_id===b);assert.equal(o.wechat,'old-wechat');assert.equal(o.seller_name,'A');assert.equal(o.seller_phone,'a');
});

test('预约时无包但匹配固定时已获礼包可以作为卖方成交',()=>{
 const s=new Store(':memory:');const a=s.createUser('a','A','password1',{wechat:'a',alipay:'a'}),b=s.createUser('b','B','password1',{wechat:'b',alipay:'b'});
 const t=s.saveType({name:'包',initial:300,cap:600,rate:1,pledge:10,enabled:1});s.adjustPoints(a,300,'初始','admin');s.adjustPoints(b,300,'初始','admin');s.reserve(a,t,'2026-11-08');s.reserve(b,t,'2026-11-08');
 const g=s.issueGift(a,t,'admin');s.match(t,'2026-11-08','admin');s.finalize(t,'2026-11-08');const o=s.ordersFor(b).find(x=>x.buyer_id===b);
 assert.equal(o.status,'unpaid');assert.equal(o.gift_id,g);assert.equal(s.giftsFor(a)[0].locked,1);
});

test('礼包类型的预约质押必须大于零',()=>{
 const s=new Store(':memory:');
 assert.throws(()=>s.saveType({name:'包',initial:300,cap:600,rate:1,pledge:0,enabled:1}),/礼包参数/);
});

test('积分增减或礼包提货超过安全整数上限时回滚',()=>{
 const s=new Store(':memory:');const u=s.createUser('a','A','password1',{wechat:'a',alipay:'a'});
 s.adjustPoints(u,Number.MAX_SAFE_INTEGER,'初始','admin');assert.throws(()=>s.adjustPoints(u,1,'过量','admin'),/上限/);
 const t=s.saveType({name:'包',initial:300,cap:600,rate:1,pledge:10,enabled:1});const g=s.issueGift(u,t,'admin');
 assert.throws(()=>s.redeem(u,g),/上限/);assert.equal(s.giftsFor(u)[0].id,g);assert.equal(s.user(u).points,Number.MAX_SAFE_INTEGER);
});

test('地址簿支持多个地址、默认地址切换和删除',()=>{
 const s=new Store(':memory:');const u=s.createUser('a','A','password1',{wechat:'a',alipay:'a'}),v=s.createUser('b','B','password1',{wechat:'b',alipay:'b'});
 const a=s.addAddress(u,'甲','13800000000','地址甲'),b=s.addAddress(u,'乙','13900000000','地址乙');assert.equal(s.addresses(u).length,2);
 s.defaultAddress(u,b);assert.equal(s.addresses(u).find(x=>x.is_default).id,b);assert.throws(()=>s.defaultAddress(v,b));
 s.deleteAddress(u,b);assert.equal(s.addresses(u).find(x=>x.is_default).id,a);
});

test('匹配订单按编号分页且不返回凭证内容',()=>{
 const s=new Store(':memory:');const a=s.createUser('a','A','password1',{wechat:'a',alipay:'a'}),b=s.createUser('b','B','password1',{wechat:'b',alipay:'b'});
 const t=s.saveType({name:'包',initial:300,cap:600,rate:1,pledge:10,enabled:1});s.adjustPoints(a,300,'初始','admin');const r=s.reserve(a,t,'2026-11-08');
 for(let i=0;i<105;i++)s.run("INSERT INTO matches(day,type_id,buyer_id,seller_id,reservation_id,status,proof,created) VALUES(?,?,?,?,?,'submitted',?,?)",'2026-11-08',t,a,b,r,s.encrypt('凭证'),'2026-11-08');
 const first=s.ordersFor(a),second=s.ordersFor(a,first.at(-1).id);assert.equal(first.length,100);assert.equal(second.length,5);assert.equal(first[0].has_proof,1);assert.equal(first[0].proof,undefined);assert.equal(s.proofFor(b,first[0].id),'凭证');assert.throws(()=>s.proofFor(999,first[0].id));
});

test('拒绝过长的申诉和处理说明',()=>{
 const s=new Store(':memory:');assert.throws(()=>s.appeal(1,1,'a'.repeat(2001)),/长度/);assert.throws(()=>s.resolve(1,'cancel','a'.repeat(2001),'admin'),/长度/);
});
