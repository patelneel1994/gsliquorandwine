'use strict';
const gate = document.querySelector('#age-gate');
const site = document.querySelector('#site');
function stored(store, key) { try { return store.getItem(key); } catch { return null; } }
function openGate() { site.inert = true; if (!gate.open) gate.showModal(); }
function closeGate() { gate.close(); site.inert = false; document.querySelector('.header .brand').focus(); }
// Block access until explicitly confirmed, including when storage is unavailable.
let remembered = false;
try { remembered = stored(localStorage, 'gs-age-21') === 'yes' || stored(sessionStorage, 'gs-age-21') === 'yes'; } catch {}
if (!remembered) openGate();
gate.addEventListener('cancel', e => e.preventDefault());
document.querySelector('#confirm-age').addEventListener('click', () => {
  try { (document.querySelector('#remember-age').checked ? localStorage : sessionStorage).setItem('gs-age-21', 'yes'); } catch {}
  closeGate();
});
document.querySelector('#deny-age').addEventListener('click', () => {
  document.querySelector('#age-actions').hidden = true;
  document.querySelector('#age-message').hidden = false;
  document.querySelector('#age-back').hidden = false;
  document.querySelector('#age-back').focus();
});
document.querySelector('#age-back').addEventListener('click', () => {
  document.querySelector('#age-actions').hidden = false;
  document.querySelector('#age-message').hidden = true;
  document.querySelector('#age-back').hidden = true;
  document.querySelector('#confirm-age').focus();
});
document.querySelector('#reset-age').addEventListener('click', () => {
  try { localStorage.removeItem('gs-age-21'); sessionStorage.removeItem('gs-age-21'); } catch {}
  document.querySelector('#age-back').click(); openGate();
});
const grid = document.querySelector('#recipe-grid');
const status = document.querySelector('#recipe-status');
let recipes = [], filter = 'All';
const palettes = {Whiskey:['#e7d9be','#b96531'],Tequila:['#dfe3ce','#b5c365'],Vodka:['#e7d8cb','#c19768'],Rum:['#e3cdbb','#b7723e'],Gin:['#d8e1d8','#91a79a'],Other:['#e3d6df','#b48d9d']};
function node(tag, text, cls) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; }
function illustration(category, recipeId) {
 const colors = recipeId === 'grinch-lemon-drop' ? ['#dce5c8','#89a74b'] : palettes[category] || palettes.Other;
 const art = node('div', undefined, 'drink-art'); art.style.setProperty('--art-bg', colors[0]);
 // SVG markup contains only fixed templates and palette constants, never recipe input.
 art.innerHTML = `<svg viewBox="0 0 150 190" aria-hidden="true"><ellipse cx="75" cy="176" rx="54" ry="5" fill="#594636" opacity=".12"/><path d="M28 66h94l-10 99q-37 14-74 0Z" fill="#fffdf2" fill-opacity=".65" stroke="#6d6352" stroke-width="1.5"/><path d="M34 96h82l-9 65q-32 10-64 0Z" fill="${colors[1]}" fill-opacity=".85"/><path d="m50 86 25 7-7 29-25-7zm33 31 24-4 4 27-24 4z" fill="#fff9df" fill-opacity=".5" stroke="#fff9df"/><ellipse cx="75" cy="66" rx="47" ry="7" fill="#fffdf2" stroke="#6d6352" stroke-width="1.5"/><circle cx="36" cy="65" r="26" fill="${category === 'Whiskey' ? '#d9a151' : '#9da65d'}" stroke="#fff1c5" stroke-width="3"/><circle cx="36" cy="65" r="19" fill="none" stroke="#fff1c5"/><path d="M36 46v38M17 65h38m-32-13 26 26m-26 0 26-26" stroke="#fff1c5" stroke-width="2"/></svg>`;
 return art;
}
function render() {
 grid.replaceChildren();
 const q = document.querySelector('#search').value.trim().toLowerCase();
 const visible = recipes.filter(r => (filter === 'All' || r.category === filter) && [r.title,r.description,...r.ingredients].join(' ').toLowerCase().includes(q));
 status.textContent = visible.length ? `${visible.length} recipe${visible.length === 1 ? '' : 's'} to explore` : 'No recipes found. Try another search or choose All recipes.';
 visible.forEach(r => {
  const article = node('article', undefined, 'recipe-card'); const button = node('button'); button.type = 'button'; button.setAttribute('aria-label', `View ${r.title} recipe`);
  button.append(illustration(r.category, r.id)); const meta = node('div', undefined, 'recipe-meta'); meta.append(node('span',r.category),node('span',`${r.minutes} MIN PREP · ${r.yieldLabel ? 'LARGE BATCH' : '1 SERVING'}`));
  button.append(meta,node('h3',r.title),node('p',r.description),node('span','View recipe ↗','read')); button.addEventListener('click',()=>openRecipe(r)); article.append(button); grid.append(article);
 });
}
const recipeDialog = document.querySelector('#recipe-dialog');
let recipeTimerInterval;
recipeDialog.addEventListener('close', () => clearInterval(recipeTimerInterval));
function openRecipe(r) {
 clearInterval(recipeTimerInterval);
 const state = new RecipeProgress(r);
 const body = document.querySelector('#recipe-body'); body.replaceChildren(); const title = node('h2',r.title); title.id='recipe-title';
 body.append(title,node('p',`${r.category} · ${r.minutes} min prep · ${r.yieldLabel || 'Makes 1 serving'}`,'recipe-meta'),node('p',r.description));
 if (r.chill) body.append(node('p', r.chill, 'recipe-note'));
 if (r.note) body.append(node('p', r.note, 'recipe-note'));
 body.append(node('h3','What you’ll need'));
 body.append(ingredientChecklist(r, state), guidedRecipe(r, state));
 if (r.attribution) body.append(node('p', r.attribution, 'recipe-credit'));
 body.append(recipeVote(r), node('p','Enjoy responsibly. For adults 21 and over.'));
 history.replaceState(null, '', recipeLink(r));
 if (!recipeDialog.open) recipeDialog.showModal();
}
function recipeLink(recipe) {
 const link = new URL(window.location.href);
 link.hash = `recipe=${encodeURIComponent(recipe.id)}`;
 return link.href;
}
function openSharedRecipe() {
 if (gate.open || recipeDialog.open || !location.hash.startsWith('#recipe=')) return;
 let id; try { id = decodeURIComponent(location.hash.slice(8)); } catch { return; }
 const recipe = recipes.find(item => item.id === id);
 if (recipe) openRecipe(recipe);
}
gate.addEventListener('close', openSharedRecipe);
window.addEventListener('hashchange', openSharedRecipe);
recipeDialog.addEventListener('close', () => {
 if (location.hash.startsWith('#recipe=')) history.replaceState(null, '', `${location.pathname}${location.search}#recipes`);
});
function guidedRecipe(recipe, state) {
 const section = node('section', undefined, 'guided-recipe');
 const heading = node('h3', 'Make it with us.');
 const intro = node('p', 'One step at a time. Mark each step done as you go.');
 const progressLabel = node('p', '', 'progress-label'); progressLabel.setAttribute('role', 'status');
 const progress = node('progress'); progress.max = recipe.steps.length; progress.setAttribute('aria-label', 'Recipe steps completed');
 const stepPanel = node('div', undefined, 'current-step');
 const stepLabel = node('span', '', 'step-label');
 const stepText = node('p'); stepText.tabIndex = -1;
 const back = node('button', 'Previous step', 'button outline'); back.type = 'button';
 const next = node('button', 'Done, next step', 'button'); next.type = 'button';
 const actions = node('div', undefined, 'actions'); actions.append(back, next);
 stepPanel.append(stepLabel, stepText, actions);
 const saved = node('p', '', 'progress-saved');
 const reset = node('button', 'Start over', 'text-link'); reset.type = 'button';
 const completion = node('section', undefined, 'recipe-complete');
 completion.append(node('h3', 'You made it. How did it turn out?'),node('p', 'Share your experience or a photo of your creation with friends.'));
 const experienceLabel = node('label', 'Your experience (optional)'); experienceLabel.htmlFor = 'recipe-experience';
 const experience = node('textarea'); experience.id = 'recipe-experience'; experience.maxLength = 1000; experience.rows = 3; experience.placeholder = 'My take on this recipe…'; experience.value = state.experience;
 const privacy = node('p', 'Your draft stays on this device. You choose what to share.', 'share-help');
 const shareStatus = node('p', '', 'share-feedback'); shareStatus.setAttribute('role', 'status');
 const copy = node('button', 'Copy caption', 'button outline'); copy.type = 'button';
 const facebook = node('a', 'Open Facebook ↗', 'button outline'); facebook.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(recipeLink(recipe))}`; facebook.target = '_blank'; facebook.rel = 'noopener noreferrer';
 const instagram = node('a', 'Open Instagram ↗', 'button outline'); instagram.href = 'https://www.instagram.com/'; instagram.target = '_blank'; instagram.rel = 'noopener noreferrer';
 facebook.addEventListener('click', () => trackShare(recipe, 'facebook'));
 instagram.addEventListener('click', () => trackShare(recipe, 'instagram'));
 const shareActions = node('div', undefined, 'actions'); shareActions.append(copy, facebook, instagram);
 const caption = () => [`I made ${recipe.title} with G & S Liquor & Wines!`,state.experience.trim(),recipeLink(recipe),'For adults 21+. Enjoy responsibly.'].filter(Boolean).join('\n\n');
 const manualCaption = node('textarea'); manualCaption.readOnly = true; manualCaption.rows = 5; manualCaption.hidden = true; manualCaption.setAttribute('aria-label', 'Caption to copy manually');
 experience.addEventListener('input', () => {state.setExperience(experience.value); updateSaved(); manualCaption.hidden = true;});
 copy.addEventListener('click', async () => {
  try {
   if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable');
   await navigator.clipboard.writeText(caption());
   shareStatus.textContent = 'Caption copied. Open Facebook or Instagram, add your photo, and paste it into your post.';
  } catch {
   manualCaption.value = caption(); manualCaption.hidden = false; manualCaption.focus(); manualCaption.select();
   shareStatus.textContent = 'Select and copy the caption below, then paste it into your post.';
  }
 });
 if (navigator.share) {
  const nativeShare = node('button', 'Share from your device', 'button'); nativeShare.type = 'button';
  nativeShare.addEventListener('click', async () => {
   trackShare(recipe, 'device');
   nativeShare.disabled = true;
   try { await navigator.share({title:recipe.title,text:caption()}); shareStatus.textContent = 'Share options opened. Complete your post in the app you chose.'; }
   catch (error) { shareStatus.textContent = error.name === 'AbortError' ? 'Sharing canceled. Your draft is still here.' : 'Sharing is unavailable here. Copy your caption and open Facebook or Instagram instead.'; }
   finally { nativeShare.disabled = false; }
  });
  shareActions.prepend(nativeShare);
 }
 completion.append(experienceLabel, experience, privacy, shareActions,node('p', 'Copy your caption before opening Facebook or Instagram. Paste it into your post and add a photo there. Device sharing options depend on the apps installed.', 'share-help'),manualCaption,shareStatus);
 function updateSaved() { saved.textContent = state.persistent ? 'Progress saved on this device. Come back whenever you’re ready.' : 'Progress lasts while this recipe is open; browser storage is unavailable.'; }
 function update(moveFocus = false) {
  progress.value = state.completed;
  progressLabel.textContent = `${state.completed} of ${recipe.steps.length} steps completed`;
  stepLabel.textContent = `Step ${state.current + 1} of ${recipe.steps.length}${state.current < state.completed ? ' · Done' : ''}`;
  stepText.textContent = recipe.steps[state.current];
  back.disabled = state.current === 0;
  next.textContent = state.completed === recipe.steps.length && state.current === recipe.steps.length - 1 ? 'All steps complete' : state.current < state.completed ? 'Next step' : state.current === recipe.steps.length - 1 ? 'Finish recipe' : 'Done, next step';
  next.disabled = state.completed === recipe.steps.length && state.current === recipe.steps.length - 1;
  completion.hidden = state.completed !== recipe.steps.length;
  reset.hidden = state.completed === 0 && state.current === 0;
  updateSaved();
  if (moveFocus) {
   if (!completion.hidden && state.current === recipe.steps.length - 1) { completion.querySelector('h3').tabIndex = -1; completion.querySelector('h3').focus(); }
   else stepText.focus();
  }
 }
 back.addEventListener('click', () => {state.previous(); update(true);});
 next.addEventListener('click', () => {state.advance(); update(true);});
 reset.addEventListener('click', () => {if (!confirm('Start over? This clears your steps, ingredient checklist, timer, and experience draft on this device.')) return; state.reset(); openRecipe(recipe);});
 const overview = node('details', undefined, 'step-overview'); overview.append(node('summary', 'Read all steps'));
 const list = node('ol'); recipe.steps.forEach(step => list.append(node('li', step))); overview.append(list);
 section.append(heading,intro,progressLabel,progress,stepPanel,recipeTimer(recipe,state),saved,reset,overview,completion); update(); return section;
}

function ingredientChecklist(recipe, state) {
 const list = node('ul', undefined, 'ingredient-checklist');
 const count = node('p', '', 'ingredient-count'); count.setAttribute('role', 'status');
 const update = () => { count.textContent = `${state.checkedIngredients.filter(Boolean).length} of ${recipe.ingredients.length} ingredients ready`; };
 recipe.ingredients.forEach((ingredient, index) => {
  const item = node('li'); const label = node('label'); const input = node('input');
  input.type = 'checkbox'; input.checked = state.checkedIngredients[index];
  input.addEventListener('change', () => {state.checkIngredient(index, input.checked); update();});
  label.append(input, node('span', ingredient)); item.append(label); list.append(item);
 });
 const section = node('div'); section.append(count,list); update(); return section;
}
function recipeTimer(recipe, state) {
 const section = node('section', undefined, 'recipe-timer');
 section.append(node('h3', 'Chill & freeze timer'));
 const label = node('label', 'Set minutes'); const minutes = node('input'); minutes.type = 'number'; minutes.min = '1'; minutes.max = '1440'; minutes.step = '1'; minutes.value = recipe.id === 'grinch-lemon-drop' ? '300' : '30'; label.append(minutes);
 const display = node('output', '', 'timer-display'); display.setAttribute('aria-label', 'Time remaining'); display.setAttribute('aria-live', 'off');
 const notice = node('p', '', 'timer-notice'); notice.setAttribute('role', 'status');
 const start = node('button', 'Start timer', 'button'); start.type = 'button';
 const pause = node('button', 'Pause', 'button outline'); pause.type = 'button';
 const clear = node('button', 'Clear timer', 'text-link'); clear.type = 'button';
 const actions = node('div', undefined, 'actions'); actions.append(start,pause,clear);
 function paint() {
  const remaining = state.timerRemaining(); const seconds = Math.ceil(remaining / 1000);
  display.textContent = state.timer ? `${String(Math.floor(seconds / 3600)).padStart(2,'0')}:${String(Math.floor(seconds / 60) % 60).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}` : 'Set a time to get started';
  start.hidden = Boolean(state.timer); label.hidden = Boolean(state.timer); pause.hidden = !state.timer || remaining === 0; clear.hidden = !state.timer;
  pause.textContent = state.timer?.endsAt === null ? 'Resume' : 'Pause';
  if (state.timer) {
   const text = remaining === 0 ? 'Timer finished. Check your drink before continuing.' : state.timer.endsAt === null ? 'Timer paused.' : state.persistent ? 'Timer running. You can close this recipe and return later.' : 'Timer running. Keep this recipe open; browser storage is unavailable.';
   if (notice.textContent !== text) notice.textContent = text;
  }
 }
 start.addEventListener('click', () => {
  if (!minutes.checkValidity() || !state.startTimer(Number(minutes.value))) { notice.textContent = 'Enter a whole number between 1 and 1,440 minutes.'; minutes.reportValidity(); return; }
  notice.textContent = ''; paint();
 });
 pause.addEventListener('click', () => {if(state.timer?.endsAt === null) state.resumeTimer(); else state.pauseTimer(); paint();});
 clear.addEventListener('click', () => {state.clearTimer(); notice.textContent = ''; paint();});
 section.append(label,display,actions,notice,node('p', 'Time is tracked while you’re away. There is no alarm or notification when this page is closed.', 'share-help'));
 paint(); recipeTimerInterval = setInterval(paint,1000); return section;
}
function trackShare(recipe, platform) {
 // Count the click only; never send the visitor’s caption or experience draft.
 GSData.share(recipe.id, platform).catch(() => {});
}
function recipeVote(recipe) {
 const section = node('section', undefined, 'recipe-vote');
 const title = node('h3', 'A recipe worth sharing?');
 const description = node('p', 'Give this recipe your vote. No sign-up needed.');
 const button = node('button', recipe.voted ? 'Voted — thank you!' : 'Vote for this recipe', 'button');
 button.type = 'button'; button.disabled = Boolean(recipe.voted);
 const count = node('span', `${recipe.votes || 0} vote${recipe.votes === 1 ? '' : 's'}`, 'vote-count');
 const feedback = node('p', '', 'vote-feedback'); feedback.setAttribute('role', 'status');
 button.addEventListener('click', async () => {
  button.disabled = true; button.textContent = 'Counting your vote…'; feedback.textContent = '';
  try {
   const result = await GSData.vote(recipe.id);
   recipe.votes = result.votes; recipe.voted = true;
   count.textContent = `${result.votes} vote${result.votes === 1 ? '' : 's'}`;
   button.textContent = 'Voted — thank you!'; feedback.textContent = 'Your vote has been counted.';
  } catch (error) {button.disabled = false; button.textContent = 'Vote for this recipe'; feedback.textContent = ['PGRST202','PGRST205','42P01'].includes(error.code) ? 'Voting is temporarily unavailable. Please try again later.' : error.message;}
 });
 const actions = node('div', undefined, 'actions'); actions.append(button, count);
 section.append(title, description, actions, feedback); return section;
}
document.querySelector('.close').addEventListener('click',()=>recipeDialog.close());
recipeDialog.addEventListener('click',e=>{if(e.target===recipeDialog){const b=recipeDialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)recipeDialog.close();}});
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});render();}));
document.querySelector('#search').addEventListener('input',render);
(async () => {
 let preview = false;
 try { recipes = await GSData.recipes(); }
 catch {
  try { const response = await fetch('recipes.json'); if(!response.ok) throw Error(); recipes = await response.json(); preview = true; }
  catch { status.textContent = 'Recipes could not load. Please refresh the page to try again.'; return; }
 }
 render();
 if(preview) status.textContent += ' · Showing sample recipes; live recipe service is unavailable.';
 openSharedRecipe();
})();

// Show the store's schedule in Ardmore time, regardless of the visitor's timezone.
function updateHours() {
 const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',weekday:'short',hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(new Date());
 const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
 const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(values.weekday);
 const hour = Number(values.hour) + Number(values.minute) / 60;
 const opens = day === 0 ? 10 : 8, closes = day === 0 ? 20 : day >= 5 ? 22 : 21;
 const open = hour >= opens && hour < closes;
 const badge = document.querySelector('#today-hours');
 badge.hidden = false;
 badge.classList.toggle('is-open', open);
 badge.textContent = open ? `Open today until ${closes - 12} PM` : hour < opens ? `Opens today at ${opens} AM` : `Closed for today · See you tomorrow`;
 document.querySelectorAll('[data-days]').forEach(row => row.classList.toggle('is-today',row.dataset.days.split(',').includes(String(day))));
}
updateHours();
setInterval(updateHours, 60000);
