import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ Math, JSON });
for (const file of ['levels.js', 'menu.js']) {
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);
}
const Menu = vm.runInContext('Menu', context);

test('réglages : valeurs par défaut (son, tremblements, fond animé activés ; mode test désactivé)', () => {
  const s = Menu.loadSettings({ getItem: () => null });
  assert.equal(JSON.stringify(s), JSON.stringify({ sound: true, shake: true, rubber: true, testMode: false }));
});

test('mode test : enregistré et relu comme les autres réglages', () => {
  const data = {};
  const storage = { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  Menu.saveSettings(storage, { ...Menu.DEFAULT_SETTINGS, testMode: true });
  assert.equal(Menu.loadSettings(storage).testMode, true);
});

test('réglages : sauvegarde puis relecture, complétés par les valeurs par défaut', () => {
  const data = {};
  const storage = { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  Menu.saveSettings(storage, { sound: false, shake: true, rubber: false });
  assert.equal(JSON.stringify(Menu.loadSettings(storage)),
    JSON.stringify({ sound: false, shake: true, rubber: false, testMode: false }));
  data['esquive-reglages'] = JSON.stringify({ sound: false });
  assert.equal(JSON.stringify(Menu.loadSettings(storage)),
    JSON.stringify({ sound: false, shake: true, rubber: true, testMode: false }));
});

test('réglages : stockage indisponible ou corrompu toléré', () => {
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(Menu.loadSettings(broken).sound, true);
  assert.doesNotThrow(() => Menu.saveSettings(broken, { sound: false }));
  assert.equal(Menu.loadSettings({ getItem: () => '{pas du json' }).rubber, true);
});

test('étoiles : rendu HTML avec la bonne médaille pour chaque étoile', () => {
  const html = Menu.starsHtml(2);
  assert.equal((html.match(/class="star on/g) || []).length, 2);
  assert.ok(html.includes('bronze') && html.includes('silver') && html.includes('gold'));
  assert.equal((Menu.starsHtml(0).match(/class="star on/g) || []).length, 0);
});

test('écrans prévus : titre, niveaux, comment jouer, réglages, pause, fin', () => {
  assert.equal(JSON.stringify(Menu.SCREENS), JSON.stringify(['title', 'levels', 'howto', 'settings', 'pause', 'end']));
});
