import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('reservation cards show the initial amount as the lower bound',async()=>{
 const handlers={},element={innerHTML:'',addEventListener:(name,fn)=>{handlers[name]=fn}};
 const fixtures={me:{id:1,name:'User',phone:'13800000000',points:600,frozen:0},types:[{id:1,name:'Gift 1',initial:300,cap:600,current_value:450,pledge:125,rate:'1'}],gifts:[],orders:[],products:[],reservations:[],'shop-orders':[],ledger:[],addresses:[],schedule:{start:0,match:960,final:970,deadline:1320}};
 const context={document:{querySelector:()=>element},localStorage:{getItem:()=> 'token'},fetch:async url=>({ok:true,json:async()=>fixtures[url.slice(5)]}),setInterval:()=>0,console};
 runInNewContext(readFileSync('web/app.js','utf8'),context);await new Promise(resolve=>setImmediate(resolve));
 await handlers.click({target:{closest:()=>({dataset:{tab:'\u9884\u7ea6'}})}});
 assert.match(element.innerHTML,/\u4e0b\u9650 300 \u00b7 \u4e0a\u9650 600/);
 assert.doesNotMatch(element.innerHTML,/\u5f53\u524d\u91d1\u989d 450/);
 assert.match(element.innerHTML,/data-pledge="125"/);
});
