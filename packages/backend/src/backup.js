import { DatabaseSync, backup } from 'node:sqlite';
import { closeSync, openSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function backupDatabase(source, destination){
 const src=resolve(source),dst=resolve(destination);if(src===dst)throw new Error('备份目标不能与源数据库相同');
 const db=new DatabaseSync(src,{readOnly:true});let created=false;
 try{const fd=openSync(dst,'wx',0o600);created=true;closeSync(fd);await backup(db,dst)}
 catch(error){if(created)try{unlinkSync(dst)}catch{}throw error}
 finally{db.close()}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [source,destination]=process.argv.slice(2);if(!source||!destination){console.error('用法：node packages/backend/src/backup.js 源数据库 新备份文件');process.exitCode=1}
 else backupDatabase(source,destination).then(()=>console.log('数据库备份完成；请单独安全备份密钥。')).catch(e=>{console.error('备份失败：',e.message);process.exitCode=1});
}
