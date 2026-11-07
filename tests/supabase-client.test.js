'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {webcrypto} = require('node:crypto');
function memoryStorage() {const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};}
function client(respond) {
 const calls=[];const storage=memoryStorage();
 const context={GS_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_example'},sessionStorage:storage,localStorage:memoryStorage(),crypto:webcrypto,Uint8Array,Date,fetch:async(url,options)=>{calls.push({url,...options});const reply=await respond(url,options);return {ok:reply.status>=200&&reply.status<300,status:reply.status,json:async()=>reply.body};}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('supabase-client.js','utf8'),context);
 return {api:context.GSData,calls,storage,context};
}
function session() {return {access_token:'user-jwt',refresh_token:'refresh',expires_in:3600,user:{id:'admin'}};}
test('public recipes and votes use only the publishable key and a stable browser identifier',async()=>{
 const {api,calls}=client(async(url)=>({status:200,body:url.endsWith('gs_vote')?{votes:1,voted:true}:[]}));
 await api.recipes();await api.vote('sample');await api.vote('sample');
 assert.equal(calls[0].headers.apikey,'sb_publishable_example');
 assert.equal(calls[0].headers.Authorization,undefined);
 const first=JSON.parse(calls[1].body),second=JSON.parse(calls[2].body);
 assert.equal(first.p_voter,second.p_voter);assert.match(first.p_voter,/^[a-f0-9-]{36}$/);
 assert.equal(JSON.parse(calls[0].body).p_voter,null);
});
test('admin sign-in verifies the user and database role before editing',async()=>{
 const {api,calls}=client(async(url)=>({status:200,body:url.includes('/token?')?session():url.endsWith('gs_is_admin')?true:url.includes('/user')?{id:'admin'}:null}));
 await api.signIn('owner@example.com','test-password');
 await api.saveRecipe('sample',{title:'Recipe',category:'Rum',minutes:5,description:'Example',ingredients:['Ice'],steps:['Stir.'],votes:999});
 const write=calls.find(c=>c.url.includes('/gs_recipes?'));
 assert.equal(write.headers.Authorization,'Bearer user-jwt');
 assert.equal(JSON.parse(write.body).content.votes,undefined);
 const login=JSON.parse(calls[0].body);assert.equal(login.email,'owner@example.com');
 assert.ok(calls.some(c=>c.url.endsWith('/auth/v1/user')));
 await api.signOut();assert.equal(api.session,null);
});
test('non-admin users are signed out and cannot gain editor access',async()=>{
 const {api}=client(async(url)=>({status:200,body:url.includes('/token?')?session():url.endsWith('gs_is_admin')?false:{}}));
 await assert.rejects(api.signIn('visitor@example.com','test'),/does not have admin access/);
 assert.equal(api.session,null);
 await assert.rejects(api.stats(),/Sign in/);
});
test('expired sessions refresh and stats use the refreshed user JWT',async()=>{
 const {api,calls}=client(async(url)=>({status:200,body:url.includes('refresh_token')?{...session(),access_token:'fresh-jwt'}:[]}));
 api.saveSession({...session(),expires_at:1});await api.stats();
 assert.ok(calls[0].url.includes('grant_type=refresh_token'));
 assert.equal(calls[1].headers.Authorization,'Bearer fresh-jwt');
});
test('share tracking sends only the recipe and platform, and supports navigation keepalive',async()=>{
 const {api,calls}=client(async()=>({status:204,body:null}));
 await api.share('sample','instagram');
 assert.equal(calls[0].keepalive,true);
 assert.deepEqual(JSON.parse(calls[0].body),{p_recipe_id:'sample',p_platform:'instagram'});
});
test('missing database setup gives an actionable error and invalid refresh clears the session',async()=>{
 const missing=client(async()=>({status:404,body:{code:'PGRST202'}}));
 await assert.rejects(missing.api.recipes(),/Run supabase\/setup.sql/);
 const expired=client(async()=>({status:400,body:{error_description:'Expired refresh token'}}));
 expired.api.saveSession({...session(),expires_at:1});
 await assert.rejects(expired.api.stats(),/Expired refresh token/);assert.equal(expired.api.session,null);
});
