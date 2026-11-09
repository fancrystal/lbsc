import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('企货销首页、礼包图片和手机号在用户页面展示',async()=>{
 const handlers={},element={innerHTML:'',addEventListener:(name,fn)=>{handlers[name]=fn}};
 const fixtures={me:{id:1,name:'测试',phone:'13800000001',points:100,frozen:0},types:[{id:1,name:'一包',current_max:300,cap:600,rate:'1'}],gifts:[{id:1,name:'一包',value:300,locked:0}],orders:[{id:2,buyer_id:1,seller_id:2,seller_name:'卖家',seller_phone:'13900000002',status:'completed',type_name:'一包'}],products:[],reservations:[],'shop-orders':[],ledger:[],addresses:[],schedule:{start:0,match:960,final:970,deadline:1320}};
 const context={document:{querySelector:()=>element},localStorage:{getItem:()=> 'token'},fetch:async url=>({ok:true,json:async()=>fixtures[url.slice(5)]}),setInterval:()=>0,console};
 runInNewContext(readFileSync('web/app.js','utf8'),context);await new Promise(resolve=>setImmediate(resolve));
 assert.match(element.innerHTML,/企货销/);assert.match(element.innerHTML,/打造一个帮助数万商家销货的免佣金平台/);
 await handlers.click({target:{closest:()=>({dataset:{tab:'预约'}})}});assert.match(element.innerHTML,/src="\/gift-box.png"/);
 await handlers.click({target:{closest:()=>({dataset:{action:'gifts'}})}});assert.match(element.innerHTML,/src="\/gift-box.png"/);
 await handlers.click({target:{closest:()=>({dataset:{action:'profile'}})}});assert.match(element.innerHTML,/手机号<input[^>]*value="13800000001"[^>]*readonly/);
 await handlers.click({target:{closest:()=>({dataset:{action:'orders'}})}});assert.match(element.innerHTML,/卖方手机号：13900000002/);
});

test('后台大盘展示统计并支持按日期查询',async()=>{
 const handlers={},element={innerHTML:'',addEventListener:(name,fn)=>{handlers[name]=fn}},calls=[];
 const dashboard={date:'2026-11-08',totals:{registered_users:2,eligible_users:1},daily:{new_users:1,reservation_users:2,reservations:2,match_orders:2,completed_matches:1,cancelled_matches:1,shop_orders:1},types:[{id:1,name:'一包',enabled:1,reservations:2,active_gifts:3,available_gifts:2,locked_gifts:1}]};
 const fixtures={me:{role:'admin'},users:[],types:[],gifts:[],matches:[],products:[],'shop-orders':[],audit:[],schedule:{},dashboard};
 const context={document:{querySelector:()=>element},localStorage:{getItem:()=> 'token'},fetch:async(url)=>{const key=url.slice(5).replace(/^admin\//,'');calls.push(key);return {ok:true,json:async()=>key.startsWith('dashboard?')?dashboard:fixtures[key]}},FormData:class{constructor(f){return Object.entries(f.values)}},alert:message=>{throw Error(message)},console};
 runInNewContext(readFileSync('web/admin.js','utf8'),context);await new Promise(resolve=>setImmediate(resolve));
 await handlers.click({target:{closest:()=>({dataset:{tab:'大盘'}})}});assert.match(element.innerHTML,/当日预约人数/);assert.match(element.innerHTML,/当前持有包数/);assert.match(element.innerHTML,/一包/);
 await handlers.submit({preventDefault(){},target:{dataset:{form:'dashboard'},values:{date:'2026-11-08'}}});assert.ok(calls.includes('dashboard?date=2026-11-08'));
});

test('后台货到通知可同时填写提货码和留言并发送',async()=>{
 const handlers={},element={innerHTML:'',addEventListener:(name,fn)=>{handlers[name]=fn}},sent=[];
 const fixtures={me:{role:'admin'},users:[],types:[],gifts:[],matches:[],products:[],'shop-orders':[{id:7,user_name:'用户',name:'商品',price:10,recipient:'甲',phone:'123',address:'地址',code:'原提货码',message:'原留言'}],audit:[],schedule:{current:{start:0,match:960,final:970,deadline:1320},pending:{start:0,match:960,final:970,deadline:1320}}};
 const context={document:{querySelector:()=>element},localStorage:{getItem:()=> 'admin-token'},fetch:async(url,opt)=>{const key=url.slice(5).replace(/^admin\//,'');if(key==='notice'){sent.push(JSON.parse(opt.body));return {ok:true,json:async()=>({ok:true})}}return {ok:true,json:async()=>fixtures[key]}},FormData:class {constructor(f){return Object.entries(f.values)}},confirm:()=>true,alert:message=>{throw Error(message)},console};
 runInNewContext(readFileSync('web/admin.js','utf8'),context);await new Promise(resolve=>setImmediate(resolve));
 await handlers.click({target:{closest:()=>({dataset:{tab:'商城订单'}})}});
 await handlers.click({target:{closest:()=>({dataset:{action:'notice',id:'7'}})}});
 assert.match(element.innerHTML,/data-form="notice"/);assert.match(element.innerHTML,/name="code"[^>]*value="原提货码"/);assert.match(element.innerHTML,/name="message"[^>]*>原留言<\/textarea>/);
 await handlers.submit({preventDefault(){},target:{dataset:{form:'notice'},values:{id:'7',code:'新码',message:'请领取'}}});
 assert.deepEqual(sent,[{id:'7',code:'新码',message:'请领取'}]);
});

test('预约页显示当前最高金额及冻结金额',async()=>{
 const handlers={},element={innerHTML:'',addEventListener:(name,fn)=>{handlers[name]=fn}};
 const fixtures={me:{id:1,name:'测试',phone:'a',points:600,frozen:0},types:[{id:1,name:'现金1包',initial:300,cap:600,current_max:450,rate:'1'}],gifts:[],orders:[],products:[],reservations:[],'shop-orders':[],ledger:[],addresses:[],schedule:{start:0,match:960,final:970,deadline:1320}};
 const context={document:{querySelector:()=>element},localStorage:{getItem:()=> 'token'},fetch:async url=>({ok:true,json:async()=>fixtures[url.slice(5)]}),setInterval:()=>0,console};
 runInNewContext(readFileSync('web/app.js','utf8'),context);await new Promise(resolve=>setImmediate(resolve));
 await handlers.click({target:{closest:()=>({dataset:{tab:'预约'}})}});
 assert.match(element.innerHTML,/当前最高金额 450/);assert.match(element.innerHTML,/预约冻结 450 积分/);assert.match(element.innerHTML,/data-pledge="450"/);
});

test('个人页提供积分互转入口和填写手机号的表单',async()=>{
 const handlers={},element={innerHTML:'',addEventListener:(name,fn)=>{handlers[name]=fn}};
 const fixtures={me:{id:1,name:'测试',phone:'a',points:100,frozen:30},types:[],gifts:[],orders:[],products:[],reservations:[],'shop-orders':[],ledger:[],addresses:[],schedule:{start:0,match:960,final:970,deadline:1320}};
 const context={document:{querySelector:()=>element},localStorage:{getItem:()=> 'token'},fetch:async url=>({ok:true,json:async()=>fixtures[url.slice(5)]}),crypto:{randomUUID:()=> 'test-request-0001'},setInterval:()=>0,console};
 runInNewContext(readFileSync('web/app.js','utf8'),context);await new Promise(resolve=>setImmediate(resolve));
 await handlers.click({target:{closest:()=>({dataset:{tab:'我的'}})}});assert.match(element.innerHTML,/积分互转/);
 await handlers.click({target:{closest:()=>({dataset:{action:'points-transfer'}})}});assert.match(element.innerHTML,/可用积分：70/);assert.match(element.innerHTML,/name="phone"/);assert.match(element.innerHTML,/name="amount"/);
});

test('付款凭证未选图片时提交按钮禁用',async()=>{
 const handlers={},element={innerHTML:'',addEventListener:(name,fn)=>{handlers[name]=fn}};
 const fixtures={me:{id:1,name:'测试',phone:'a',points:100,frozen:0},types:[],gifts:[],orders:[{id:1,buyer_id:1,seller_id:2,type_name:'测试',status:'unpaid'}],products:[],reservations:[],'shop-orders':[],ledger:[],addresses:[],schedule:{start:0,match:960,final:970,deadline:1320}};
 const context={document:{querySelector:()=>element},localStorage:{getItem:()=> 'test-token'},fetch:async url=>({ok:true,json:async()=>fixtures[url.slice(5)]}),setInterval:()=>0,console};
 runInNewContext(readFileSync('web/app.js','utf8'),context);await new Promise(resolve=>setImmediate(resolve));
 await handlers.click({target:{closest:()=>({dataset:{action:'orders'}})}});
 assert.match(element.innerHTML,/data-form="proof"[\s\S]*<button class="primary" disabled>提交付款凭证/);
 const button={disabled:true},form={dataset:{form:'proof'},querySelector:()=>button};
 handlers.change({target:{name:'proof',files:[{}],closest:()=>form}});assert.equal(button.disabled,false);
 handlers.change({target:{name:'proof',files:[],closest:()=>form}});assert.equal(button.disabled,true);
});

test('登录与注册密码输入框允许六位密码',()=>{
 const handlers={},element={innerHTML:'',addEventListener:(name,fn)=>{handlers[name]=fn}};
 const context={document:{querySelector:()=>element},localStorage:{getItem:()=>''},setInterval:()=>0,console};
 runInNewContext(readFileSync('web/app.js','utf8'),context);assert.match(element.innerHTML,/minlength="6"/);
});

test('用户端商城打开商品时按需读取并展示详情',async()=>{
 const handlers={},element={innerHTML:'',addEventListener:(name,fn)=>{handlers[name]=fn}};
 const fixtures={me:{id:1,name:'测试',phone:'a',points:100,frozen:0},types:[],gifts:[],orders:[],products:[{id:1,name:'测试商品',price:10,stock:1,sort:0,cover:''}],reservations:[], 'shop-orders':[],ledger:[],addresses:[],schedule:{start:0,match:960,final:970,deadline:1320},'product?id=1':{id:1,name:'测试商品',price:10,stock:1,cover:'',detail:'商品详情内容',images:'[]'}};
 const context={document:{querySelector:()=>element},localStorage:{getItem:()=> 'test-token'},fetch:async url=>({ok:true,json:async()=>fixtures[url.slice(5)]}),setInterval:()=>0,console,confirm:()=>true};
 runInNewContext(readFileSync('web/app.js','utf8'),context);await new Promise(resolve=>setImmediate(resolve));
 await handlers.click({target:{closest:()=>({dataset:{tab:'商城'}})}});assert.match(element.innerHTML,/测试商品/);
 await handlers.click({target:{closest:()=>({dataset:{action:'product',id:'1'}})}});assert.match(element.innerHTML,/商品详情内容/);
});
