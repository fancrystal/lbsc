import { resolve } from 'node:path';
import { Store } from './store.js';

const store=new Store(process.env.APP_DB_PATH||resolve('data/app.sqlite'));
try{console.log(JSON.stringify(store.reconcileFrozen('deployment')))}finally{store.db.close()}
