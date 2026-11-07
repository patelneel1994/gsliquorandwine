'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RecipeProgress = require('../recipe-progress.js');
const recipe = {id:'sample',steps:['Mix ingredients.','Chill.','Serve.']};
function memoryStorage() {
 const values = new Map();
 return {getItem:key => values.get(key) ?? null, setItem:(key,value) => values.set(key,value)};
}
test('complete steps, review without double-counting, and resume a draft', () => {
 const storage = memoryStorage();
 const state = new RecipeProgress(recipe, storage);
 assert.equal(state.persistent, true);
 assert.equal(state.completed, 0);
 state.advance();
 assert.equal(state.completed, 1);
 assert.equal(state.current, 1);
 state.previous(); state.advance();
 assert.equal(state.completed, 1);
 state.setExperience('Bright and lemony!');
 const resumed = new RecipeProgress(recipe, storage);
 assert.equal(resumed.current, 1);
 assert.equal(resumed.completed, 1);
 assert.equal(resumed.experience, 'Bright and lemony!');
 resumed.advance(); resumed.advance(); resumed.advance();
 assert.equal(resumed.completed, 3);
 assert.equal(resumed.current, 2);
 resumed.reset();
 assert.equal(resumed.completed, 0);
 assert.equal(resumed.current, 0);
 assert.equal(resumed.experience, '');
});
test('recipe edits invalidate progress, while other recipes stay independent', () => {
 const storage = memoryStorage();
 const original = new RecipeProgress(recipe, storage); original.advance();
 const other = new RecipeProgress({...recipe,id:'another'}, storage);
 assert.equal(other.completed, 0);
 const edited = new RecipeProgress({...recipe,steps:['New first step.',...recipe.steps.slice(1)]}, storage);
 assert.equal(edited.completed, 0);
});
test('unavailable, corrupted, and out-of-range storage never break the recipe', () => {
 const blocked = {getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 const state = new RecipeProgress(recipe, blocked); state.advance();
 assert.equal(state.completed, 1); assert.equal(state.persistent, false);
 const storage = memoryStorage();
 storage.setItem('gs-recipe-progress:sample', '{broken json');
 assert.equal(new RecipeProgress(recipe, storage).completed, 0);
 storage.setItem('gs-recipe-progress:sample', JSON.stringify({steps:recipe.steps,completed:99,current:99}));
 assert.equal(new RecipeProgress(recipe, storage).completed, 0);
});
test('one-step recipes complete and experience drafts have bounded size', () => {
 const state = new RecipeProgress({id:'one',steps:['Stir.']}, memoryStorage());
 state.previous(); assert.equal(state.current, 0);
 state.advance(); assert.equal(state.completed, 1); assert.equal(state.current, 0);
 state.setExperience('x'.repeat(1100)); assert.equal(state.experience.length, 1000);
});
test('ingredient checklist persists and resets when ingredients change', () => {
 const storage = memoryStorage();
 const full = {...recipe,ingredients:['Lime','Ice']};
 const state = new RecipeProgress(full, storage); state.checkIngredient(0,true); state.checkIngredient(99,true);
 assert.deepEqual(new RecipeProgress(full,storage).checkedIngredients,[true,false]);
 const edited = new RecipeProgress({...full,ingredients:['Lemon','Ice']},storage);
 assert.deepEqual(edited.checkedIngredients,[false,false]);
 edited.checkIngredient(1,true); edited.reset();
 assert.deepEqual(edited.checkedIngredients,[false,false]);
});
test('timer tracks elapsed wall time across reloads, pauses, resumes and expires', () => {
 const storage = memoryStorage();
 const state = new RecipeProgress(recipe,storage);
 assert.equal(state.startTimer(5,1000000),true);
 assert.equal(state.timerRemaining(1060000),240000);
 const resumed = new RecipeProgress(recipe,storage);
 assert.equal(resumed.timerRemaining(1060000),240000);
 resumed.pauseTimer(1060000);
 assert.equal(resumed.timerRemaining(2000000),240000);
 resumed.resumeTimer(2000000);
 assert.equal(resumed.timerRemaining(2120000),120000);
 assert.equal(resumed.timerRemaining(2300000),0);
 resumed.clearTimer(); assert.equal(resumed.timer,null);
 for (const value of [0,-1,1441,Infinity,NaN,1.5]) assert.equal(resumed.startTimer(value),false);
 resumed.startTimer(1); resumed.reset(); assert.equal(resumed.timer,null);
});
