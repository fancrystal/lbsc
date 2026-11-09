import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { DatabaseSync } from 'node:sqlite';

test('旧版截图迁移后保留48小时且重启不重置计时',t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-08T08:10:00Z')});
 const dir=mkdtempSync(join(tmpdir(),'jgxm-'));const path=join(dir,'db.sqlite');let s;
 try {
  s=new Store(path);const a=s.createUser('a','A','123456',{wechat:'a'}),b=s.createUser('b','B','123456',{wechat:'b'});
  const type=s.saveType({name:'包',initial:300,cap:600,rate:1,pledge:1,enabled:1});s.adjustPoints(a,300,'test','admin');s.adjustPoints(b,300,'test','admin');s.issueGift(a,type,'admin');
  s.reserve(a,type,'2026-11-08');s.reserve(b,type,'2026-11-08');s.match(type,'2026-11-08','test');s.finalize(type,'2026-11-08');
  const order=s.ordersFor(b).find(o=>o.buyer_id===b);s.submitProof(b,order.id,'旧截图');
  s.db.exec('DROP INDEX matches_proof_retention_idx; ALTER TABLE matches DROP COLUMN proof_uploaded_at');s.db.close();s=null;
  t.mock.timers.setTime(Date.parse('2026-11-09T00:00:00Z'));s=new Store(path);assert.equal(s.proofFor(a,order.id),'旧截图');s.db.close();s=null;
  t.mock.timers.setTime(Date.parse('2026-11-10T00:00:00Z'));s=new Store(path);s.cleanupProofs();assert.equal(s.proofFor(a,order.id),'旧截图');
  t.mock.timers.setTime(Date.parse('2026-11-11T00:00:00Z'));s.cleanupProofs();assert.throws(()=>s.proofFor(a,order.id));
 } finally {try{s?.db.close()}catch{}rmSync(dir,{recursive:true,force:true})}
});

test('收款资料和凭证加密保存，重启后授权用户仍可查看',()=>{
 const dir=mkdtempSync(join(tmpdir(),'jgxm-'));const path=join(dir,'db.sqlite');let s;
 try{s=new Store(path);const a=s.createUser('a','A','password1',{wechat:'secret-account',alipay:'secret-alipay'}),b=s.createUser('b','B','password1',{wechat:'b',alipay:'b'});
 const t=s.saveType({name:'包',initial:300,cap:600,rate:1,pledge:1,enabled:1});s.adjustPoints(a,300,'初始','admin');s.adjustPoints(b,300,'初始','admin');s.issueGift(a,t,'admin');s.reserve(a,t,'2026-11-08');s.reserve(b,t,'2026-11-08');s.match(t,'2026-11-08','admin');s.finalize(t,'2026-11-08');const o=s.ordersFor(b).find(x=>x.buyer_id===b);s.submitProof(b,o.id,'secret-proof');
 assert.notEqual(s.get('SELECT wechat FROM users WHERE id=?',a).wechat,'secret-account');assert.notEqual(s.get('SELECT proof FROM matches WHERE id=?',o.id).proof,'secret-proof');s.db.close();
 s=new Store(path);assert.equal(s.ordersFor(b).find(x=>x.id===o.id).wechat,'secret-account');assert.equal(s.ordersFor(a).find(x=>x.id===o.id).has_proof,1);assert.equal(s.ordersFor(a).find(x=>x.id===o.id).proof,undefined);assert.equal(s.proofFor(a,o.id),'secret-proof');assert.throws(()=>s.proofFor(999,o.id));s.db.close();
 }finally{try{s?.db.close()}catch{}rmSync(dir,{recursive:true,force:true})}
});

test('已有明文资料迁移后仍可读取，密钥丢失时拒绝启动',()=>{
 const dir=mkdtempSync(join(tmpdir(),'jgxm-'));const path=join(dir,'db.sqlite');let s;
 try{s=new Store(path);const id=s.createUser('a','A','password1',{wechat:'w',alipay:'a'});s.run('UPDATE users SET wechat=? WHERE id=?','legacy-account',id);s.run("DELETE FROM settings WHERE key='sensitive_migration_v1'");s.db.close();s=new Store(path);assert.equal(s.user(id).wechat,'legacy-account');assert.notEqual(s.get('SELECT wechat FROM users WHERE id=?',id).wechat,'legacy-account');s.db.close();s=null;rmSync(path+'.key');assert.throws(()=>new Store(path),/密钥丢失/)}finally{try{s?.db.close()}catch{}rmSync(dir,{recursive:true,force:true})}
});

test('旧版默认地址只迁移一次，删除后重启不会恢复',()=>{
 const dir=mkdtempSync(join(tmpdir(),'jgxm-'));const path=join(dir,'db.sqlite');let s;
 try{s=new Store(path);const id=s.createUser('a','A','password1',{wechat:'w',alipay:'a'});s.run("DELETE FROM settings WHERE key='addresses_migrated'");s.run('INSERT INTO addresses(user_id,name,phone,address) VALUES(?,?,?,?)',id,'甲','123','旧地址');s.db.close();
 s=new Store(path);const address=s.addresses(id)[0];assert.equal(address.address,'旧地址');assert.equal(s.get('SELECT COUNT(*) n FROM addresses').n,0);s.deleteAddress(id,address.id);s.db.close();s=new Store(path);assert.equal(s.addresses(id).length,0);
 }finally{try{s?.db.close()}catch{}rmSync(dir,{recursive:true,force:true})}
});

test('数据库不会保存可直接使用的登录令牌',()=>{
 const s=new Store(':memory:');const u=s.createUser('a','A','password1',{wechat:'w',alipay:'a'});const token=s.login('a','password1');
 assert.notEqual(s.get('SELECT token FROM sessions WHERE user_id=?',u).token,token);assert.equal(s.session(token).id,u);
});

test('已完成加密迁移的数据库重启时不重复重写用户记录',()=>{
 const dir=mkdtempSync(join(tmpdir(),'jgxm-'));const path=join(dir,'db.sqlite');let s;
 try{s=new Store(path);s.createUser('a','A','password1',{wechat:'w',alipay:'a'});s.run("CREATE TRIGGER no_rewrite BEFORE UPDATE ON users BEGIN SELECT RAISE(ABORT,'unexpected rewrite'); END");s.db.close();s=new Store(path);assert.equal(s.user(1).wechat,'w')}
 finally{try{s?.db.close()}catch{}rmSync(dir,{recursive:true,force:true})}
});
