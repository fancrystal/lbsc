import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';

test('接口贯通注册、预约、交易、积分购买和提货通知',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-08T07:00:00Z')});
 const {server,store}=createServer(':memory:');store.createUser('admin','管理员','password1',{},'admin');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
 const req=async(path,body,token='')=>{const response=await fetch(root+'/api/'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data};
 try {
  const admin=(await req('login',{phone:'admin',password:'password1'})).token;
  const a=(await req('register',{phone:'a',name:'甲',password:'password1',wechat:'wa',alipay:'aa'})).id;
  const b=(await req('register',{phone:'b',name:'乙',password:'password1',wechat:'wb',alipay:'ab'})).id;
  const tokenA=(await req('login',{phone:'a',password:'password1'})).token,tokenB=(await req('login',{phone:'b',password:'password1'})).token;
  const type=(await req('admin/type',{name:'现金1包',initial:300,cap:600,rate:1,pledge:100,enabled:1},admin)).id;
  for(const userId of [a,b])await req('admin/points',{userId,amount:500,reason:'测试'},admin);
  await req('admin/issue',{userId:a,typeId:type},admin);
  await req('reserve',{typeId:type,expectedPledge:300},tokenA);await req('reserve',{typeId:type,expectedPledge:300},tokenB);
  t.mock.timers.setTime(Date.parse('2026-11-08T08:00:00Z'));await req('reservations',null,tokenA);
  t.mock.timers.setTime(Date.parse('2026-11-08T08:10:00Z'));const order=(await req('orders',null,tokenB)).find(o=>o.buyer_id===b);assert.equal(order.price,300);
  const missingProof=await fetch(root+'/api/proof',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+tokenB},body:JSON.stringify({id:order.id,proof:''})});assert.equal(missingProof.status,400);
  await req('proof',{id:order.id,proof:'data:image/png;base64,iVBORw0KGgo='},tokenB);
  const listed=(await req('orders',null,tokenA)).find(o=>o.id===order.id);assert.equal(listed.has_proof,1);assert.equal(listed.proof,undefined);
  assert.equal((await req('proof?id='+order.id,null,tokenA)).proof,'data:image/png;base64,iVBORw0KGgo=');
  const adminOrder=(await req('admin/matches',null,admin)).find(o=>o.id===order.id);assert.equal(adminOrder.has_proof,1);assert.equal(adminOrder.proof,undefined);assert.equal((await req('proof?id='+order.id,null,admin)).proof,'data:image/png;base64,iVBORw0KGgo=');
  await req('register',{phone:'c',name:'丙',password:'password1',wechat:'wc',alipay:'ac'});const tokenC=(await req('login',{phone:'c',password:'password1'})).token;
  const forbidden=await fetch(root+'/api/proof?id='+order.id,{headers:{authorization:'Bearer '+tokenC}});assert.equal(forbidden.status,400);
  await req('confirm',{id:order.id},tokenA);
  const gift=(await req('gifts',null,tokenB))[0];assert.equal(gift.value,300);await req('redeem',{id:gift.id},tokenB);
  await req('addresses/add',{name:'乙',phone:'13900000000',address:'收货地址'},tokenB);
  const product=(await req('admin/product',{name:'蔬菜月卡',price:100,stock:1,enabled:1},admin)).id;
  const purchase=(await req('purchase',{id:product},tokenB)).id;await req('admin/notice',{id:purchase,code:'123456',message:'请领取'},admin);
  let shop=await req('shop-orders',null,tokenB);assert.equal(shop[0].unread,1);assert.equal(shop[0].code,'123456');await req('read-shop-order',{id:purchase},tokenB);
  shop=await req('shop-orders',null,tokenB);assert.equal(shop[0].unread,0);assert.equal((await req('me',null,tokenB)).points,700);
 } finally {await new Promise(r=>server.close(r));store.db.close()}
});
