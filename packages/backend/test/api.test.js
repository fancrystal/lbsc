import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, clientAddress } from '../src/server.js';

test('礼包图片可由网站直接访问',async()=>{const {server,store}=createServer(':memory:');await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const res=await fetch(`http://127.0.0.1:${server.address().port}/gift-box.png`);assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'image/png');assert.ok((await res.arrayBuffer()).byteLength>1000)}finally{await new Promise(r=>server.close(r));store.db.close()}});

test('后台大盘按北京时间统计每日预约与实时礼包库存，普通用户无权限',async()=>{
 const {server,store}=createServer(':memory:');await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const root=`http://127.0.0.1:${server.address().port}/api/`;
 try{
  store.createUser('admin','管理员','123456',{},'admin');const a=store.createUser('a','甲','123456',{wechat:'a'}),b=store.createUser('b','乙','123456',{wechat:'b'});
  const type=store.saveType({name:'一包',initial:300,cap:600,rate:1,enabled:1});store.adjustPoints(a,300,'测试','admin');store.adjustPoints(b,300,'测试','admin');store.issueGift(a,type,'admin');
  store.reserve(a,type,'2026-11-08');store.reserve(b,type,'2026-11-08');store.match(type,'2026-11-08','test');store.finalize(type,'2026-11-08');
  const admin=store.login('admin','123456'),user=store.login('a','123456');
  const response=await fetch(root+'admin/dashboard?date=2026-11-08',{headers:{authorization:'Bearer '+admin}});assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.date,'2026-11-08');assert.equal(data.totals.registered_users,2);assert.equal(data.daily.reservation_users,2);assert.equal(data.daily.reservations,2);assert.equal(data.daily.match_orders,2);
  assert.equal(data.types[0].reservations,2);assert.equal(data.types[0].active_gifts,1);assert.equal(data.types[0].locked_gifts,1);
  assert.equal((await fetch(root+'admin/dashboard?date=2026-11-08',{headers:{authorization:'Bearer '+user}})).status,403);
  assert.equal((await fetch(root+'admin/dashboard?date=2026-02-30',{headers:{authorization:'Bearer '+admin}})).status,400);
 }finally{await new Promise(r=>server.close(r));store.db.close()}
});

test('积分互转校验可用余额并以请求号防止重复转账',async()=>{
 const {server,store}=createServer(':memory:');await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const root=`http://127.0.0.1:${server.address().port}/api/`;
 const post=(path,data,token='')=>fetch(root+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(data)});
 try {
  const a=store.createUser('13800000001','甲','123456',{wechat:'a'}),b=store.createUser('13800000002','乙','123456',{wechat:'b'});
  store.adjustPoints(a,500,'测试','admin');store.run('UPDATE users SET frozen=100 WHERE id=?',a);
  const token=store.login('13800000001','123456'),request={phone:'13800000002',amount:250,requestId:'request-id-0001'};
  const result=await Promise.all([post('points-transfer',request,token),post('points-transfer',request,token)]);assert.deepEqual(result.map(r=>r.status),[200,200]);
  assert.equal(store.user(a).points,250);assert.equal(store.user(a).frozen,100);assert.equal(store.user(b).points,250);
  assert.equal(store.all("SELECT * FROM ledger WHERE user_id=? AND amount=-250",a).length,1);assert.equal(store.all("SELECT * FROM ledger WHERE user_id=? AND amount=250",b).length,1);
  for(const [i,body] of [{phone:'13800000001',amount:1},{phone:'missing',amount:1},{phone:'13800000002',amount:151},{phone:'13800000002',amount:0},{phone:'13800000002',amount:1.5}].entries())assert.equal((await post('points-transfer',{...body,requestId:'invalid-request-'+i},token)).status,400);
  assert.equal((await post('points-transfer',{...request,amount:1},token)).status,400);
  assert.equal((await post('points-transfer',request)).status,401);
  assert.equal(store.user(a).points,250);assert.equal(store.user(b).points,250);
 }finally{await new Promise(r=>server.close(r));store.db.close()}
});

test('注册和修改资料至少保留一种收款方式', async () => {
 const {server,store}=createServer(':memory:');await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const root=`http://127.0.0.1:${server.address().port}/api/`;
 const post=(path,data,token='')=>fetch(root+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(data)});
 try {
  for(const [i,field] of ['wechat','alipay','bank'].entries()){
   const res=await post('register',{phone:'test'+i,name:'测试',password:'123456',[field]:'收款账号'});assert.equal(res.status,200);
  }
  assert.equal((await post('register',{phone:'empty',name:'测试',password:'123456',wechat:'  '})).status,400);
  const token=(await (await post('login',{phone:'test0',password:'123456'})).json()).token;
  assert.equal((await post('profile',{name:'测试',bank:'新银行卡'},token)).status,200);
  let me=await (await fetch(root+'me',{headers:{authorization:'Bearer '+token}})).json();assert.equal(me.bank,'新银行卡');assert.equal(me.wechat,'');
  assert.equal((await post('profile',{name:'测试',bank:'  '},token)).status,400);
  assert.equal((await post('profile',{name:'测试',bank:'a'.repeat(257)},token)).status,400);
  me=await (await fetch(root+'me',{headers:{authorization:'Bearer '+token}})).json();assert.equal(me.bank,'新银行卡');
 } finally {await new Promise(r=>server.close(r));store.db.close()}
});

test('注册登录后可读取个人资料，匿名不能读取', async () => {
 const {server}=createServer(':memory:'); await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const root=`http://127.0.0.1:${server.address().port}`;
 try {
  let res=await fetch(root+'/api/me'); assert.equal(res.status,401);
  res=await fetch(root+'/api/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:'13800000000',name:'测试',password:'password1',wechat:'w',alipay:'a'})});assert.equal(res.status,200);
  res=await fetch(root+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:'13800000000',password:'password1'})});const {token}=await res.json();assert.ok(token);
  res=await fetch(root+'/api/me',{headers:{authorization:`Bearer ${token}`}});assert.equal((await res.json()).name,'测试');
 } finally {await new Promise(r=>server.close(r))}
});

test('只有明确配置的可信代理才能提供客户端地址',()=>{
 const req={socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':'198.51.100.7, 10.0.0.1'}};
 assert.equal(clientAddress(req,[]),'127.0.0.1');assert.equal(clientAddress(req,['127.0.0.1','10.0.0.1']),'198.51.100.7');
 const fake={socket:{remoteAddress:'203.0.113.8'},headers:{'x-forwarded-for':'198.51.100.7'}};assert.equal(clientAddress(fake,['127.0.0.1']),'203.0.113.8');
});

test('健康检查不需要登录且只返回运行状态',async()=>{
 const {server,store}=createServer(':memory:');await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const r=await fetch(`http://127.0.0.1:${server.address().port}/healthz`);assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'ok'})}
 finally{await new Promise(r=>server.close(r));store.db.close()}
});

test('定时任务失败时健康检查返回不可用',async()=>{
 const {server,store}=createServer(':memory:');store.grow=()=>{throw Error('database error')};await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const r=await fetch(`http://127.0.0.1:${server.address().port}/healthz`);assert.equal(r.status,503);assert.deepEqual(await r.json(),{status:'unavailable'})}
 finally{await new Promise(r=>server.close(r));store.db.close()}
});

test('连续错误登录后暂时限制再次尝试', async () => {
 const {server,store}=createServer(':memory:');store.createUser('13800000000','用户','password1',{wechat:'w',alipay:'a'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
 try {for(let i=0;i<5;i++){const r=await fetch(root+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:'13800000000',password:'wrong'})});assert.equal(r.status,400)}
 const blocked=await fetch(root+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:'13800000000',password:'password1'})});assert.equal(blocked.status,429);
 }finally{await new Promise(r=>server.close(r))}
});

test('同一来源短期内重复注册会被限制',async()=>{
 const {server,store}=createServer(':memory:');await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
 try{for(let i=0;i<10;i++){const r=await fetch(root+'/api/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:'a'+i,name:'测试',password:'bad',wechat:'w',alipay:'a'})});assert.equal(r.status,400)}
 const limited=await fetch(root+'/api/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:'new',name:'测试',password:'password1',wechat:'w',alipay:'a'})});assert.equal(limited.status,429);
 }finally{await new Promise(r=>server.close(r));store.db.close()}
});

test('注册接口拒绝过大的请求体',async()=>{
 const {server,store}=createServer(':memory:');await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'x'.repeat(20000)})});assert.equal(r.status,413)}finally{await new Promise(r=>server.close(r));store.db.close()}
});

test('地址接口隔离用户并支持新增和设置默认地址',async()=>{
 const {server,store}=createServer(':memory:');store.createUser('a','A','password1',{wechat:'a',alipay:'a'});store.createUser('b','B','password1',{wechat:'b',alipay:'b'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
 const post=(p,d,t='')=>fetch(root+'/api/'+p,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+t},body:JSON.stringify(d)});
 try{const a=(await (await post('login',{phone:'a',password:'password1'})).json()).token,b=(await (await post('login',{phone:'b',password:'password1'})).json()).token;
 const created=await(await post('addresses/add',{name:'甲',phone:'123',address:'地址'},a)).json();assert.ok(created.id);
 assert.equal((await post('addresses/default',{id:created.id},b)).status,400);
 const addresses=await(await fetch(root+'/api/addresses',{headers:{authorization:'Bearer '+a}})).json();assert.equal(addresses.length,1);assert.equal(addresses[0].is_default,1);
 }finally{await new Promise(r=>server.close(r))}
});

test('商品摘要分页不携带图片原文，封面和详情按需读取',async()=>{
 const {server,store}=createServer(':memory:');store.createUser('admin','管理员','password1',{},'admin');store.createUser('a','A','password1',{wechat:'w',alipay:'a'});
 const image='data:image/png;base64,iVBORw0KGgo=';let last;for(let i=0;i<21;i++)last=store.saveProduct({name:'商品'+i,price:10,stock:1,enabled:1,cover:image,images:[image],detail:'详情'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
 try{const token=store.login('a','password1'),headers={authorization:'Bearer '+token};const list=await(await fetch(root+'/api/products',{headers})).json();assert.equal(list.length,20);assert.equal(list[0].cover,`/media/products/${last}`);assert.equal(list[0].images,undefined);
 const more=await(await fetch(root+'/api/products?before='+list.at(-1).id,{headers})).json();assert.equal(more.length,1);
 const cover=await fetch(root+list[0].cover);assert.equal(cover.status,200);assert.equal(cover.headers.get('content-type'),'image/png');
 const details=await(await fetch(root+'/api/product?id='+last,{headers})).json();assert.equal(details.detail,'详情');assert.deepEqual(JSON.parse(details.images),[image]);
 const adminToken=store.login('admin','password1'),adminHeaders={authorization:'Bearer '+adminToken};const adminList=await(await fetch(root+'/api/admin/products',{headers:adminHeaders})).json();assert.equal(adminList[0].images,undefined);assert.equal(adminList[0].cover,undefined);
 const adminDetails=await(await fetch(root+'/api/admin/product?id='+last,{headers:adminHeaders})).json();assert.equal(adminDetails.cover,image);assert.equal((await fetch(root+'/api/admin/product?id='+last,{headers})).status,403);
 }finally{await new Promise(r=>server.close(r));store.db.close()}
});

test('商品排序分页不会漏掉不同排序值的商品',async()=>{
 const {server,store}=createServer(':memory:');store.createUser('a','A','password1',{wechat:'w',alipay:'a'});for(let i=0;i<35;i++)store.saveProduct({name:'商品'+i,price:1,stock:1,enabled:1,sort:i%3});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const token=store.login('a','password1'),headers={authorization:'Bearer '+token},root=`http://127.0.0.1:${server.address().port}`;
 const first=await(await fetch(root+'/api/products',{headers})).json(),last=first.at(-1);const second=await(await fetch(root+`/api/products?before=${last.id}&sort=${last.sort}`,{headers})).json();assert.equal(first.length,20);assert.equal(second.length,15);assert.equal(new Set([...first,...second].map(x=>x.id)).size,35);
 }finally{await new Promise(r=>server.close(r));store.db.close()}
});

test('普通用户不能操作后台，管理员可发放礼包和积分', async () => {
 const {server,store}=createServer(':memory:');store.createUser('admin','管理员','password1',{},'admin');
 await new Promise(r=>server.listen(0,'127.0.0.1',r)); const root=`http://127.0.0.1:${server.address().port}`;
 const post=(p,d,token='')=>fetch(root+'/api/'+p,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(d)});
 try {
  const user=await (await post('register',{phone:'13800000000',name:'用户',password:'password1',wechat:'w',alipay:'a'})).json();
  const userToken=(await (await post('login',{phone:'13800000000',password:'password1'})).json()).token;
  assert.equal((await post('admin/points',{userId:user.id,amount:100,reason:'测试'},userToken)).status,403);
  const adminToken=(await (await post('login',{phone:'admin',password:'password1'})).json()).token;
  const t=await (await post('admin/type',{name:'礼包',initial:300,cap:600,rate:1,pledge:100,enabled:1},adminToken)).json();
  assert.equal((await post('admin/points',{userId:user.id,amount:100,reason:'测试'},adminToken)).status,200);
  assert.equal((await post('admin/issue',{userId:user.id,typeId:t.id},adminToken)).status,200);
  const gifts=await (await fetch(root+'/api/gifts',{headers:{authorization:'Bearer '+userToken}})).json();assert.equal(gifts[0].value,300);
 }finally {await new Promise(r=>server.close(r))}
});
