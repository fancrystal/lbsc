import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Git 默认忽略环境变量、数据库、密钥和备份，但保留配置模板',()=>{
 const tempRoot=resolve(tmpdir()),dir=mkdtempSync(join(tempRoot,'jgxm-ignore-'));
 try{
  const init=spawnSync('git',['-c','init.defaultBranch=main','init','--quiet'],{cwd:dir});assert.equal(init.status,0);
  copyFileSync(resolve('.gitignore'),join(dir,'.gitignore'));
  for(const name of ['.env','.env.production','data/app.sqlite','data/app.sqlite.key','backups/archive.sqlite','other.sqlite-wal','.tmp/docker-test/app.sqlite']){
   const result=spawnSync('git',['check-ignore','-q','--no-index','--',name],{cwd:dir});assert.equal(result.status,0,`${name} 未被忽略`);
  }
  assert.equal(spawnSync('git',['check-ignore','-q','--no-index','--','.env.example'],{cwd:dir}).status,1);
 }finally{if(resolve(dir).startsWith(tempRoot+sep))rmSync(dir,{recursive:true,force:true})}
});
