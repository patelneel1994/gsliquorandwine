'use strict';
// Uses Supabase's HTTPS Auth and Data APIs; no application server is required.
class SupabaseRecipes {
 constructor(config, options = {}) {
  this.url = config.url.replace(/\/$/, '');
  this.key = config.publishableKey;
  this.fetch = options.fetch || globalThis.fetch.bind(globalThis);
  this.storage = options.storage;
  if (this.storage === undefined) { try { this.storage = globalThis.sessionStorage; } catch { this.storage = null; } }
  this.sessionKey = `gs-admin-session:${this.url}`;
  this.session = null;
  try { this.session = JSON.parse(this.storage?.getItem(this.sessionKey) || 'null'); } catch {}
  this.refreshing = null;
 }
 saveSession(session) {
  this.session = session ? {...session, expires_at: session.expires_at || Math.floor(Date.now()/1000) + session.expires_in} : null;
  try { if (this.session) this.storage?.setItem(this.sessionKey, JSON.stringify(this.session)); else this.storage?.removeItem(this.sessionKey); } catch {}
 }
 async http(path, {method='GET', body, token, keepalive=false, headers={}} = {}) {
  let response;
  try {
   response = await this.fetch(this.url + path, {method, headers:{apikey:this.key, 'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}), ...headers}, ...(body !== undefined ? {body:JSON.stringify(body)} : {}), keepalive});
  } catch { throw Error('Could not connect to the recipe service. Check your connection and try again.'); }
  const result = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
   const error = Error(result?.msg || result?.error_description || result?.message || 'The request could not be completed. Please try again.');
   error.status = response.status; error.code = result?.code;
   if (['PGRST202','PGRST205','42P01'].includes(error.code)) error.message = 'Supabase setup is incomplete. Run supabase/setup.sql in the project SQL Editor.';
   throw error;
  }
  return result;
 }
 async token() {
  if (!this.session?.access_token) throw Error('Sign in to manage recipes.');
  if (this.session.expires_at > Date.now()/1000 + 60) return this.session.access_token;
  if (!this.refreshing) {
   this.refreshing = (async () => {
    try { const session = await this.http('/auth/v1/token?grant_type=refresh_token', {method:'POST',body:{refresh_token:this.session.refresh_token}}); this.saveSession(session); return session.access_token; }
    catch(error) { if(error.status === 400 || error.status === 401 || error.status === 403) this.saveSession(null); throw error; }
    finally { this.refreshing = null; }
   })();
  }
  return this.refreshing;
 }
 async signIn(email, password) {
  const session = await this.http('/auth/v1/token?grant_type=password', {method:'POST',body:{email,password}});
  this.saveSession(session);
  try { if (!await this.isAdmin()) throw Error('This account does not have admin access.'); }
  catch(error) { await this.signOut().catch(() => {}); throw error; }
 }
 async signOut() {
  const token = this.session?.access_token;
  try { if(token) await this.http('/auth/v1/logout?scope=local', {method:'POST',token}); }
  finally { this.saveSession(null); }
 }
 async rpc(name, body = {}, admin = false, keepalive = false) {
  return this.http(`/rest/v1/rpc/${name}`,{method:'POST',body,keepalive,...(admin ? {token:await this.token()} : {})});
 }
 async isAdmin() {
  if (!this.session) return false;
  const token = await this.token();
  await this.http('/auth/v1/user', {token});
  return (await this.rpc('gs_is_admin',{},true)) === true;
 }
 async recipes() { return this.rpc('gs_list_recipes',{p_voter:this.voter(false)}); }
 voter(create = true) {
  // Browser-scoped random identifier for lightweight vote deduplication.
  try {
   const existing = globalThis.localStorage.getItem('gs-voter-id');
   if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing || '')) return existing;
  } catch {}
  if (!create) return this.memoryVoter || null;
  if (this.memoryVoter) return this.memoryVoter;
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const id = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  this.memoryVoter = id;
  try { globalThis.localStorage.setItem('gs-voter-id',id); } catch {}
  return id;
 }
 vote(id) { return this.rpc('gs_vote',{p_recipe_id:id,p_voter:this.voter()}); }
 share(id, platform) { return this.rpc('gs_record_share',{p_recipe_id:id,p_platform:platform},false,true); }
 stats() { return this.rpc('gs_recipe_stats',{},true); }
 async saveRecipe(id, recipe) {
  const token = await this.token();
  if (!id) id = globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : this.voter() + '-' + Date.now();
  // Explicitly write recipe content only; votes and activity are separate records.
  const content = {};
  for (const field of ['title','category','minutes','description','ingredients','steps','yieldLabel','chill','attribution','note']) if(recipe[field] !== undefined) content[field] = recipe[field];
  await this.http('/rest/v1/gs_recipes?on_conflict=id',{method:'POST',token,headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:{id,content}});
 }
 async deleteRecipe(id) { return this.http(`/rest/v1/gs_recipes?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',token:await this.token(),headers:{Prefer:'return=minimal'}}); }
}
globalThis.GSData = new SupabaseRecipes(globalThis.GS_SUPABASE);
