'use strict';
const status = document.querySelector('#admin-status');
const login = document.querySelector('#login');
const workspace = document.querySelector('#workspace');
const editor = document.querySelector('#editor');
let editing = null;
function showAuth(authenticated){login.hidden=authenticated;workspace.hidden=!authenticated;document.querySelector('#logout').hidden=!authenticated;if(!authenticated)editor.hidden=true;}
function message(text){status.textContent=text;}
function reportError(error){if(error.status===401||error.status===403)showAuth(false);message(error.message);}
async function load(){
 const [recipes] = await Promise.all([GSData.recipes(), loadStats()]); const list=document.querySelector('#admin-recipes');list.replaceChildren();
 if(!recipes.length){const item=document.createElement('li');item.textContent='No recipes yet. Add your first recipe to get started.';list.append(item);}
 recipes.forEach(recipe=>{const item=document.createElement('li');const title=document.createElement('span');title.textContent=`${recipe.title} · ${recipe.category}`;const actions=document.createElement('div');actions.className='actions';const edit=document.createElement('button');edit.textContent='Edit';edit.addEventListener('click',()=>openEditor(recipe));const remove=document.createElement('button');remove.textContent='Delete';remove.setAttribute('aria-label',`Delete ${recipe.title}`);remove.addEventListener('click',async()=>{if(!confirm(`Delete “${recipe.title}”? This will remove it from the website.`))return;remove.disabled=true;try{await GSData.deleteRecipe(recipe.id);if(editing===recipe.id)editor.hidden=true;await load();message('Recipe deleted.');}catch(error){reportError(error);remove.disabled=false;}});actions.append(edit,remove);item.append(title,actions);list.append(item);});
}
function openEditor(recipe){editing=recipe?.id || null;editor.reset();document.querySelector('#editor-heading').textContent=recipe?'Edit recipe':'New recipe';document.querySelector('#save').textContent=recipe?'Save changes':'Publish recipe';if(recipe){for(const key of ['title','category','minutes','description','yieldLabel','chill','attribution','note'])editor.elements[key].value=recipe[key] || '';for(const key of ['ingredients','steps'])editor.elements[key].value=recipe[key].join('\n');}editor.hidden=false;document.querySelector('#editor-heading').focus();editor.scrollIntoView({block:'start'});}
login.addEventListener('submit',async event=>{event.preventDefault();const button=login.querySelector('button');button.disabled=true;message('Signing in…');try{await GSData.signIn(document.querySelector('#admin-email').value.trim(),document.querySelector('#password').value);login.reset();showAuth(true);await load();message('Signed in. Ready to create something good.');}catch(error){reportError(error);}finally{button.disabled=false;}});
document.querySelector('#logout').addEventListener('click',async()=>{try{await GSData.signOut();message('You’re signed out.');}catch(error){message('Signed out on this device. The service could not confirm remote sign-out.');}finally{showAuth(false);editor.reset();}});
document.querySelector('#new-recipe').addEventListener('click',()=>openEditor());
document.querySelector('#cancel').addEventListener('click',()=>{editor.hidden=true;document.querySelector('#new-recipe').focus();});
editor.addEventListener('submit',async event=>{event.preventDefault();const save=document.querySelector('#save');save.disabled=true;message('Saving recipe…');const data={};for(const key of ['title','category','description','yieldLabel','chill','attribution','note'])data[key]=editor.elements[key].value.trim();data.minutes=Number(editor.elements.minutes.value);for(const key of ['ingredients','steps'])data[key]=editor.elements[key].value.split('\n').map(line=>line.trim()).filter(Boolean);try{await GSData.saveRecipe(editing,data);editor.hidden=true;await load();message('Recipe published. Customers can now see it on the website.');document.querySelector('#new-recipe').focus();}catch(error){reportError(error);}finally{save.disabled=false;}});
(async()=>{try{const authenticated=await GSData.isAdmin();showAuth(authenticated);if(authenticated){await load();message('Ready to manage your recipes.');}else{message('Sign in with your admin email and password.');}}catch(error){showAuth(false);reportError(error);}})();

async function loadStats() {
 const stats = await GSData.stats();
 const body = document.querySelector('#activity-rows'); body.replaceChildren();
 for (const recipe of stats) {
  const row = document.createElement('tr');
  const title = document.createElement('th'); title.scope = 'row'; title.textContent = recipe.title; row.append(title);
  for (const count of [recipe.votes, recipe.shares.facebook, recipe.shares.instagram, recipe.shares.device]) {const cell = document.createElement('td');cell.textContent = count.toLocaleString();row.append(cell);}
  body.append(row);
 }
 document.querySelector('#activity-status').textContent = stats.length ? 'Counts are up to date.' : 'Add a recipe to start seeing activity here.';
}
document.querySelector('#refresh-stats').addEventListener('click', async event => {
 const button = event.currentTarget; button.disabled = true;
 try { await loadStats(); } catch (error) {document.querySelector('#activity-status').textContent = error.message;} finally {button.disabled = false;}
});
