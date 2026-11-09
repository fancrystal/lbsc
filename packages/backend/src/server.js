import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { Store, day } from './store.js';

const root=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))};
const minutes=()=>{const d=new Date(Date.now()+8*3600000);return d.getUTCHours()*60+d.getUTCMinutes()};
async function body(req,limit=8_000_000){let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>limit){const error=new Error('内容过大');error.status=413;throw error}chunks.push(c)}return size?JSON.parse(Buffer.concat(chunks).toString('utf8')):{}}
const id=(s)=>{const n=Number(s);if(!Number.isSafeInteger(n)||n<1)throw new Error('编号无效');return n};
const sortValue=s=>{const n=Number(s);if(!Number.isSafeInteger(n))throw new Error('排序无效');return n};
const normalizeIp=ip=>ip?.startsWith('::ffff:')&&isIP(ip.slice(7))===4?ip.slice(7):ip;
export function clientAddress(req,trusted=[]){const peer=normalizeIp(req.socket.remoteAddress||'');const allowed=new Set(trusted.map(normalizeIp));if(!allowed.has(peer))return peer||'unknown';const raw=req.headers['x-forwarded-for'];if(typeof raw!=='string'||raw.length>2048)return peer;const chain=raw.split(',').map(x=>normalizeIp(x.trim()));if(!chain.every(isIP))return peer;chain.push(peer);for(let i=chain.length-1;i>=0;i--)if(!allowed.has(chain[i]))return chain[i];return chain[0]||peer}

export function createServer(path=resolve(root,'data/app.sqlite')) {
 if(path!==':memory:')mkdirSync(resolve(root,'data'),{recursive:true});
 const store=new Store(path);
 if(process.env.ADMIN_PASSWORD && !store.get("SELECT id FROM users WHERE role='admin'"))store.createUser(process.env.ADMIN_USER||'admin','管理员',process.env.ADMIN_PASSWORD,{},'admin');
 const server=http.createServer(async(req,res)=>{
  try {
   const url=new URL(req.url,'http://localhost'), p=url.pathname, method=req.method;
   if(p==='/healthz'&&method==='GET'){try{store.get('SELECT 1 AS ok');tick(store);return json(res,200,{status:'ok'})}catch{return json(res,503,{status:'unavailable'})}}
   const imagePath=p.match(/^\/media\/products\/(\d+)$/);
   if(imagePath&&method==='GET'){const product=store.get('SELECT cover FROM products WHERE id=? AND enabled=1',id(imagePath[1]));const match=product?.cover?.match(/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/);if(!match){res.writeHead(404);return res.end('Not found')}const bytes=Buffer.from(match[2],'base64');res.writeHead(200,{'content-type':'image/'+match[1],'content-length':bytes.length,'cache-control':'no-store','x-content-type-options':'nosniff'});return res.end(bytes)}
   if(!p.startsWith('/api/')){
    const files={'/':'web/index.html','/admin':'web/admin.html','/app.js':'web/app.js','/admin.js':'web/admin.js','/style.css':'web/style.css'};
    if(!files[p]||method!=='GET'){res.writeHead(404);return res.end('Not found')}
    const file=resolve(root,files[p]);const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'}[extname(file)];res.writeHead(200,{'content-type':mime,'x-content-type-options':'nosniff'});return res.end(readFileSync(file));
   }
   const isRegistration=p==='/api/register'&&method==='POST',smallBody=isRegistration||(p==='/api/login'&&method==='POST');
   if(isRegistration)store.registrationGate(clientAddress(req,(process.env.TRUST_PROXY_IPS||'').split(',').map(s=>s.trim()).filter(Boolean)));
   if(smallBody&&Number(req.headers['content-length'])>16384){res.setHeader('Connection','close');return json(res,413,{error:'内容过大'})}
   tick(store);
   const d=method==='POST'||method==='PUT'?await body(req,smallBody?16384:8_000_000):{};
   if(isRegistration){const user=store.createUser(d.phone,d.name,d.password,d);return json(res,200,{id:user})}
   if(p==='/api/login'&&method==='POST')return json(res,200,{token:store.loginLimited(d.phone,d.password,clientAddress(req,(process.env.TRUST_PROXY_IPS||'').split(',').map(s=>s.trim()).filter(Boolean)))});
   const token=(req.headers.authorization||'').replace(/^Bearer /,'');const user=store.session(token);
   if(!user)return json(res,401,{error:'请先登录'});
   if(p==='/api/logout'&&method==='POST'){store.logout(token);return json(res,200,{ok:true})}
   if(p==='/api/me'&&method==='GET')return json(res,200,store.user(user.id));
   if(p==='/api/profile'&&method==='POST'){store.updateProfile(user.id,d);return json(res,200,{ok:true})}
   if(p==='/api/password'&&method==='POST'){store.changePassword(user.id,d.oldPassword,d.password);return json(res,200,{ok:true})}
   if(p==='/api/types'&&method==='GET')return json(res,200,store.types().filter(t=>t.enabled));
   if(p==='/api/gifts'&&method==='GET')return json(res,200,store.giftsFor(user.id));
   if(p==='/api/redeem'&&method==='POST')return json(res,200,{points:store.redeem(user.id,id(d.id))});
   if(p==='/api/schedule'&&method==='GET')return json(res,200,store.schedule());
   if(p==='/api/reserve'&&method==='POST'){const schedule=store.schedule();if(minutes()<schedule.start||minutes()>=schedule.match)throw new Error('当前不在预约时间');return json(res,200,{id:store.reserve(user.id,id(d.typeId),day())})}
   if(p==='/api/reservations'&&method==='GET')return json(res,200,store.all('SELECT r.*,t.name FROM reservations r JOIN types t ON t.id=r.type_id WHERE r.user_id=? ORDER BY r.id DESC',user.id));
   if(p==='/api/orders'&&method==='GET')return json(res,200,store.ordersFor(user.id,url.searchParams.has('before')?id(url.searchParams.get('before')):undefined));
   if(p==='/api/proof'&&method==='GET')return json(res,200,{proof:store.proofFor(user.id,id(url.searchParams.get('id')),user.role==='admin')});
   if(p==='/api/proof'&&method==='POST'){const order=store.get('SELECT day FROM matches WHERE id=?',id(d.id));if(!order||order.day!==day()||minutes()>=store.schedule(order.day).deadline)throw new Error('已超过提交时间，请申诉');if(!/^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(String(d.proof||'')))throw new Error('请上传图片凭证');store.submitProof(user.id,id(d.id),d.proof);return json(res,200,{ok:true})}
   if(p==='/api/confirm'&&method==='POST'){const order=store.get('SELECT day FROM matches WHERE id=?',id(d.id));if(!order||order.day!==day()||minutes()>=store.schedule(order.day).deadline)throw new Error('确认时间已截止，请联系管理员处理');store.confirm(user.id,id(d.id));return json(res,200,{ok:true})}
   if(p==='/api/appeal'&&method==='POST'){store.appeal(user.id,id(d.id),d.text);return json(res,200,{ok:true})}
   if(p==='/api/ledger'&&method==='GET')return json(res,200,store.all('SELECT * FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 200',user.id));
   if(p==='/api/points-transfer'&&method==='POST')return json(res,200,{id:store.transferPoints(user.id,d.phone,d.amount,d.requestId)});
   if(p==='/api/products'&&method==='GET'){const before=url.searchParams.has('before')?id(url.searchParams.get('before')):Number.MAX_SAFE_INTEGER,sort=url.searchParams.has('sort')?sortValue(url.searchParams.get('sort')):(url.searchParams.has('before')?0:Number.MAX_SAFE_INTEGER);return json(res,200,store.all("SELECT id,name,price,stock,sort,CASE WHEN cover LIKE 'data:image/%' THEN '/media/products/'||id WHEN length(cover)<=2048 AND (cover LIKE 'https://%' OR cover LIKE 'http://%') THEN cover ELSE '' END cover FROM products WHERE enabled=1 AND (sort<? OR (sort=? AND id<?)) ORDER BY sort DESC,id DESC LIMIT 20",sort,sort,before))}
   if(p==='/api/product'&&method==='GET'){const product=store.get("SELECT id,name,price,stock,detail,images,CASE WHEN cover LIKE 'data:image/%' THEN '/media/products/'||id WHEN length(cover)<=2048 AND (cover LIKE 'https://%' OR cover LIKE 'http://%') THEN cover ELSE '' END cover FROM products WHERE id=? AND enabled=1",id(url.searchParams.get('id')));if(!product)throw new Error('商品不存在或已下架');return json(res,200,product)}
   if(p==='/api/address'&&method==='GET')return json(res,200,store.addresses(user.id).find(a=>a.is_default)||{});
   if(p==='/api/address'&&method==='POST'){store.setAddress(user.id,d.name,d.phone,d.address);return json(res,200,{ok:true})}
   if(p==='/api/addresses'&&method==='GET')return json(res,200,store.addresses(user.id));
   if(p==='/api/addresses/add'&&method==='POST')return json(res,200,{id:store.addAddress(user.id,d.name,d.phone,d.address)});
   if(p==='/api/addresses/edit'&&method==='POST'){store.editAddress(user.id,id(d.id),d.name,d.phone,d.address);return json(res,200,{ok:true})}
   if(p==='/api/addresses/default'&&method==='POST'){store.defaultAddress(user.id,id(d.id));return json(res,200,{ok:true})}
   if(p==='/api/addresses/delete'&&method==='POST'){store.deleteAddress(user.id,id(d.id));return json(res,200,{ok:true})}
   if(p==='/api/purchase'&&method==='POST')return json(res,200,{id:store.purchase(user.id,id(d.id))});
   if(p==='/api/shop-orders'&&method==='GET')return json(res,200,store.shopOrders(user.id));
   if(p==='/api/read-shop-order'&&method==='POST'){store.run('UPDATE shop_orders SET unread=0 WHERE id=? AND user_id=?',id(d.id),user.id);return json(res,200,{ok:true})}
   if(!p.startsWith('/api/admin/'))return json(res,404,{error:'接口不存在'});
   if(user.role!=='admin')return json(res,403,{error:'无权限'});
   const actor=String(user.id);
   if(p==='/api/admin/users'&&method==='GET')return json(res,200,store.all('SELECT id,phone,name,points,frozen,role,created FROM users ORDER BY id DESC'));
   if(p==='/api/admin/points'&&method==='POST'){store.adjustPoints(id(d.userId),Number(d.amount),d.reason,actor);return json(res,200,{ok:true})}
   if(p==='/api/admin/types'&&method==='GET')return json(res,200,store.types());
   if(p==='/api/admin/type'&&method==='POST')return json(res,200,{id:store.saveType(d,d.id? id(d.id):null)});
   if(p==='/api/admin/gifts'&&method==='GET')return json(res,200,store.all("SELECT g.*,u.name user_name,t.name type_name FROM gifts g JOIN users u ON u.id=g.user_id JOIN types t ON t.id=g.type_id ORDER BY g.id DESC LIMIT 500"));
   if(p==='/api/admin/issue'&&method==='POST')return json(res,200,{id:store.issueGift(id(d.userId),id(d.typeId),actor)});
   if(p==='/api/admin/revoke'&&method==='POST'){store.revokeGift(id(d.id),actor,d.reason);return json(res,200,{ok:true})}
   if(p==='/api/admin/schedule'&&method==='GET')return json(res,200,{current:store.schedule(),pending:store.schedule(new Date(Date.parse(day()+'T00:00:00Z')+86400000).toISOString().slice(0,10))});
   if(p==='/api/admin/schedule'&&method==='POST')return json(res,200,{effective:store.setSchedule({start:Number(d.start),match:Number(d.match),final:Number(d.final),deadline:Number(d.deadline)},actor)});
   if(p==='/api/admin/match'&&method==='POST'){const schedule=store.schedule();if(minutes()<schedule.match||minutes()>=schedule.final)throw new Error('仅可在匹配时段重新匹配');store.match(id(d.typeId),day(),actor);return json(res,200,{ok:true})}
   if(p==='/api/admin/matches'&&method==='GET')return json(res,200,store.all('SELECT m.id,m.day,m.type_id,m.buyer_id,m.seller_id,m.reservation_id,m.gift_id,m.price,m.status,substr(m.appeal,1,2000) appeal,substr(m.resolution,1,2000) resolution,m.created,(m.proof IS NOT NULL) has_proof,t.name type_name,b.name buyer_name,s.name seller_name FROM matches m JOIN types t ON t.id=m.type_id JOIN users b ON b.id=m.buyer_id JOIN users s ON s.id=m.seller_id WHERE m.id<? ORDER BY m.id DESC LIMIT 100',url.searchParams.has('before')?id(url.searchParams.get('before')):Number.MAX_SAFE_INTEGER));
   if(p==='/api/admin/resolve'&&method==='POST'){store.resolve(id(d.id),d.decision,d.reason,actor);return json(res,200,{ok:true})}
   if(p==='/api/admin/products'&&method==='GET')return json(res,200,store.all('SELECT id,name,price,stock,enabled,sort FROM products WHERE id<? ORDER BY id DESC LIMIT 50',url.searchParams.has('before')?id(url.searchParams.get('before')):Number.MAX_SAFE_INTEGER));
   if(p==='/api/admin/product'&&method==='GET'){const product=store.get('SELECT * FROM products WHERE id=?',id(url.searchParams.get('id')));if(!product)throw new Error('商品不存在');return json(res,200,product)}
   if(p==='/api/admin/product'&&method==='POST'){const result=store.saveProduct(d,d.id?id(d.id):null);store.audit(actor,'商品设置',{id:result});return json(res,200,{id:result})}
   if(p==='/api/admin/shop-orders'&&method==='GET')return json(res,200,store.all('SELECT o.*,u.name user_name FROM shop_orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 500'));
   if(p==='/api/admin/notice'&&method==='POST'){if(!d.code&&!d.message)throw new Error('请输入提货码或留言');const r=store.run('UPDATE shop_orders SET code=?,message=?,unread=1 WHERE id=?',String(d.code||''),String(d.message||''),id(d.id));if(!r.changes)throw new Error('订单不存在');store.audit(actor,'发送提货信息',{id:d.id});return json(res,200,{ok:true})}
   if(p==='/api/admin/audit'&&method==='GET')return json(res,200,store.all('SELECT * FROM audit ORDER BY id DESC LIMIT 500'));
   return json(res,404,{error:'接口不存在'});
  }catch(e){return json(res,e.status||400,{error:e.message||'操作失败'})}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;
 return {server,store};
}

export function tick(store,current=day(),currentMinutes=minutes()){
 store.cleanupProofs();
 const clock=Date.parse(current+'T00:00:00Z')+currentMinutes*60000;
 const heartbeat=store.get("SELECT value FROM settings WHERE key='heartbeat'");
 const previous=heartbeat?Number(heartbeat.value):null;
 const last=store.get("SELECT MAX(day) d FROM jobs WHERE kind='growth'").d;
 const firstGift=last?null:store.get("SELECT MIN(date(created,'+8 hours')) d FROM gifts").d;
 const waiting=store.get("SELECT MIN(day) d FROM reservations WHERE status='waiting'").d;
 const openOrder=store.get("SELECT MIN(day) d FROM matches WHERE status IN ('unpaid','submitted')").d;
 const first=[current,last,firstGift,waiting,openOrder].filter(Boolean).sort()[0];
 let cursor=first;
 while(cursor<=current){
  const m=cursor===current?currentMinutes:1440;const schedule=store.schedule(cursor);
  store.grow(cursor);
  if(m>schedule.final+2){for(const t of store.types())if(!store.get('SELECT 1 FROM jobs WHERE day=? AND kind=?',cursor,`final:${t.id}`)){store.cancelMissed(t.id,cursor);store.run('INSERT OR IGNORE INTO jobs VALUES(?,?)',cursor,`match:${t.id}`);store.run('INSERT OR IGNORE INTO jobs VALUES(?,?)',cursor,`final:${t.id}`)}}
  if(m>=schedule.match){for(const t of store.types())if(!store.get('SELECT 1 FROM jobs WHERE day=? AND kind=?',cursor,`match:${t.id}`)){if(!store.get("SELECT 1 FROM matches WHERE type_id=? AND day=? AND status<>'draft'",t.id,cursor))store.match(t.id,cursor,'system');store.run('INSERT OR IGNORE INTO jobs VALUES(?,?)',cursor,`match:${t.id}`)}}
  if(m>=schedule.final){for(const t of store.types())if(!store.get('SELECT 1 FROM jobs WHERE day=? AND kind=?',cursor,`final:${t.id}`)){store.finalize(t.id,cursor);store.run('INSERT OR IGNORE INTO jobs VALUES(?,?)',cursor,`final:${t.id}`)}}
  if(m>=schedule.deadline&&!store.get("SELECT 1 FROM jobs WHERE day=? AND kind='expire'",cursor)){const cutoff=Date.parse(cursor+'T00:00:00Z')+schedule.deadline*60000;const hold=previous===null||(previous<cutoff&&clock-previous>120000);store.expire(cursor,hold);store.run("INSERT OR IGNORE INTO jobs VALUES(?,'expire')",cursor)}
  cursor=new Date(Date.parse(cursor+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 }
 store.run("INSERT INTO settings(key,value) VALUES('heartbeat',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",String(clock));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {server,store}=createServer();try{tick(store)}catch(e){console.error('定时任务失败',e)}setInterval(()=>{try{tick(store)}catch(e){console.error('定时任务失败',e)}},30000).unref();
 server.listen(Number(process.env.PORT||3100),process.env.HOST||'127.0.0.1',()=>console.log('服务运行于 http://127.0.0.1:'+Number(process.env.PORT||3100)));
}
