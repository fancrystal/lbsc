import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

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
