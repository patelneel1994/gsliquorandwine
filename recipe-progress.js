'use strict';
// Small, browser-local state model. Recipe edits invalidate old step progress.
class RecipeProgress {
 constructor(recipe, storage) {
  this.steps = recipe.steps.slice();
  this.ingredients = (recipe.ingredients || []).slice();
  this.checkedIngredients = this.ingredients.map(() => false);
  this.timer = null;
  this.key = `gs-recipe-progress:${recipe.id}`;
  this.completed = 0;
  this.current = 0;
  this.experience = '';
  this.persistent = false;
  try { this.storage = storage === undefined ? globalThis.localStorage : storage; } catch { this.storage = null; }
  try {
   const saved = JSON.parse(this.storage?.getItem(this.key) || 'null');
   if (saved && JSON.stringify(saved.steps) === JSON.stringify(this.steps) &&
       Number.isInteger(saved.completed) && saved.completed >= 0 && saved.completed <= this.steps.length &&
       Number.isInteger(saved.current) && saved.current >= 0 && saved.current <= Math.min(saved.completed, this.steps.length - 1)) {
    this.completed = saved.completed;
    this.current = saved.current;
    if (JSON.stringify(saved.ingredients) === JSON.stringify(this.ingredients) && Array.isArray(saved.checkedIngredients)) {
     this.checkedIngredients = this.ingredients.map((_, i) => saved.checkedIngredients[i] === true);
    }
    if (saved.timer && Number.isFinite(saved.timer.remainingMs) && saved.timer.remainingMs >= 0 && saved.timer.remainingMs <= 86400000 &&
        (saved.timer.endsAt === null || (Number.isSafeInteger(saved.timer.endsAt) && saved.timer.endsAt > 0))) this.timer = saved.timer;
    this.experience = typeof saved.experience === 'string' ? saved.experience.slice(0, 1000) : '';
   }
  } catch { /* Unavailable or corrupted storage must not block a recipe. */ }
  this.save();
 }
 save() {
  try {
   if (!this.storage) throw Error('Storage unavailable');
   this.storage.setItem(this.key, JSON.stringify({ingredients:this.ingredients, checkedIngredients:this.checkedIngredients, timer:this.timer, steps:this.steps, completed:this.completed, current:this.current, experience:this.experience}));
   this.persistent = true;
  } catch { this.persistent = false; }
 }
 advance() {
  if (this.current === this.completed && this.completed < this.steps.length) this.completed++;
  this.current = Math.min(this.current + 1, this.steps.length - 1);
  this.save();
 }
 previous() { this.current = Math.max(0, this.current - 1); this.save(); }
 reset() { this.current = 0; this.completed = 0; this.experience = ''; this.checkedIngredients = this.ingredients.map(() => false); this.timer = null; this.save(); }
 checkIngredient(index, checked) { if (Number.isInteger(index) && index >= 0 && index < this.ingredients.length) { this.checkedIngredients[index] = Boolean(checked); this.save(); } }
 startTimer(minutes, now = Date.now()) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return false;
  const remainingMs = Math.round(minutes * 60000);
  this.timer = {remainingMs, endsAt:now + remainingMs}; this.save(); return true;
 }
 timerRemaining(now = Date.now()) { return this.timer ? Math.max(0, this.timer.endsAt === null ? this.timer.remainingMs : this.timer.endsAt - now) : 0; }
 pauseTimer(now = Date.now()) { if (this.timer) { this.timer = {remainingMs:this.timerRemaining(now), endsAt:null}; this.save(); } }
 resumeTimer(now = Date.now()) { if (this.timer && this.timer.endsAt === null && this.timer.remainingMs > 0) { this.timer.endsAt = now + this.timer.remainingMs; this.save(); } }
 clearTimer() { this.timer = null; this.save(); }
 setExperience(value) { this.experience = value.slice(0, 1000); this.save(); }
}
if (typeof module !== 'undefined' && module.exports) module.exports = RecipeProgress;
