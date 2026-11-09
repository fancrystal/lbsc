import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.js';
import { backupDatabase } from '../src/backup.js';

test('在线备份包含尚在 WAL 中的已提交数据且不覆盖已有备份',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'jgxm-backup-'));const source=join(dir,'db.sqlite'),dest=join(dir,'backup.sqlite');let s,copy,restored;
 try{s=new Store(source);s.createUser('a','A','password1',{wechat:'w',alipay:'a'});await backupDatabase(source,dest);
 copy=new DatabaseSync(dest,{readOnly:true});assert.equal(copy.prepare('SELECT COUNT(*) n FROM users').get().n,1);copy.close();copy=null;
 await assert.rejects(()=>backupDatabase(source,dest));
 assert.throws(()=>new Store(dest),/密钥丢失/);copyFileSync(source+'.key',dest+'.key');restored=new Store(dest);assert.equal(restored.user(1).wechat,'w');
 }finally{try{restored?.db.close()}catch{}try{copy?.close()}catch{}try{s?.db.close()}catch{}rmSync(dir,{recursive:true,force:true})}
});
