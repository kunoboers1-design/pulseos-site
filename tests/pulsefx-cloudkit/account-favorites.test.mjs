import test from 'node:test';
import assert from 'node:assert/strict';
import { isFavorite, saveFavorite } from '../../pulsefx/icloud/account-favorites.mjs';
test('Browser favorites inherit iCloud and keep user identities isolated', () => {
  const values = new Map(), storage = {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const a={key:'user-a/zone/account',favorite:true},b={key:'user-b/zone/account',favorite:true};
  assert.equal(isFavorite(a,storage),true);
  assert.equal(saveFavorite(a,false,storage),true);
  assert.equal(isFavorite(a,storage),false);
  assert.equal(isFavorite(b,storage),true);
  assert.equal(a.favorite,true);
});
test('Unavailable storage keeps the native favorite and reports save failure', () => {
  const storage={getItem(){throw Error();},setItem(){throw Error();}};
  assert.equal(isFavorite({favorite:true},storage),true);
  assert.equal(saveFavorite({key:'a'},false,storage),false);
});
