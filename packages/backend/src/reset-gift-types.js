import { resolve } from 'node:path';
import { Store } from './store.js';

const databasePath=process.env.APP_DB_PATH||resolve('data/app.sqlite');
const types=[
  {name:'商品1包',initial:500,cap:1000,rate:1,pledge:100,enabled:1},
  {name:'商品2包',initial:1000,cap:2000,rate:1,pledge:200,enabled:1},
  {name:'商品3包',initial:2000,cap:4000,rate:1,pledge:300,enabled:1},
  {name:'商品4包',initial:4000,cap:8000,rate:1,pledge:400,enabled:1},
  {name:'商品5包',initial:8000,cap:16000,rate:1,pledge:500,enabled:1}
];
const store=new Store(databasePath);
try{console.log(JSON.stringify(store.replaceGiftTypes(types,'deployment')))}finally{store.db.close()}
