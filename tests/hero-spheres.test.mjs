import assert from 'node:assert/strict';
import test from 'node:test';
import { initSphereInteractions } from '../src/scripts/hero-spheres.ts';

// Run with Node 22.6+: node --experimental-strip-types --test tests/hero-spheres.test.mjs
// Minimal DOM/event fixture with a controllable animation clock. Browser
// checks cover SVG rendering; these checks cover interrupted interactions.
class Element extends EventTarget {
  dataset = {};
  attributes = new Map();
  selectors = {};
  rect = { left: 0, top: 0, width: 100, height: 100 };
  focusVisible = false;
  layoutReads = 0;
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelector(selector) { return this.selectors[selector]; }
  querySelectorAll(selector) { return this.selectors[selector]; }
  getBoundingClientRect() { this.layoutReads++; return this.rect; }
  matches() { return this.focusVisible; }
  closest() { return null; }
  animate() { return { cancel() {} }; }
  emit(type, properties = {}) { this.dispatchEvent(Object.assign(new Event(type), properties)); }
}

function fixture(t, reduced = false) {
  let now = 0;
  let id = 0;
  let onMotion;
  let onResize;
  const frames = new Map();
  const globals = {
    Element,
    performance: { now: () => now },
    setTimeout: (callback, delay) => { frames.set(++id, { callback, time: now + delay }); return id; },
    clearTimeout: (key) => frames.delete(key),
    MutationObserver: class { constructor(callback) { onMotion = callback; } observe() {} },
    ResizeObserver: class { constructor(callback) { onResize = callback; } observe() {} },
  };
  const originals = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const hero = new Element();
  hero.rect = { left: 0, top: 76, width: 1440, height: 900 };
  hero.dataset.running = 'true';
  const svg = new Element();
  const buttons = [new Element(), new Element()];
  const rays = buttons.map((button, index) => {
    button.rect = { left: 100 + index * 900, top: 276, width: 100, height: 100 };
    button.setAttribute('aria-pressed', 'false');
    const ray = new Element();
    ray.selectors['.ray-incoming'] = new Element();
    ray.selectors['.ray-branch'] = [new Element(), new Element()];
    ray.selectors['.ray-impact'] = new Element();
    svg.selectors[`[data-ray="${index}"]`] = ray;
    return ray;
  });
  hero.selectors['.hero-rays'] = svg;
  hero.selectors['.hero-sphere'] = buttons;
  const media = new Element();
  media.matches = reduced;
  initSphereInteractions(hero, media);
  return {
    hero, buttons, rays, media, frames,
    tick(time) {
      now = time;
      const pending = [...frames.entries()].filter(([, timer]) => timer.time <= time);
      pending.forEach(([key, timer]) => { frames.delete(key); timer.callback(); });
    },
    resize() { onResize(); },
    hide() { hero.dataset.running = 'false'; onMotion(); },
  };
}

test('hover reveals only at impact, splits at the sphere center, and leaves no ray running', (t) => {
  const { buttons: [button], rays: [ray], tick, frames } = fixture(t);
  button.emit('pointerenter', { pointerType: 'mouse' });
  const initialLayoutReads = button.layoutReads;
  tick(100);
  assert.equal(button.dataset.revealed, 'false');
  assert.equal(ray.getAttribute('opacity'), '1');
  tick(500);
  assert.equal(button.layoutReads, initialLayoutReads, 'the ray must not remeasure the sphere while it travels');
  assert.equal(button.dataset.revealed, 'true');
  const incoming = ray.querySelector('.ray-incoming').getAttribute('d');
  assert.match(incoming, /^M[\d.]+,0 L150,250$/);
  const branches = ray.querySelectorAll('.ray-branch');
  assert.ok(branches.every((path) => path.getAttribute('d').startsWith('M150,250 L')));
  assert.notEqual(branches[0].getAttribute('d'), branches[1].getAttribute('d'));
  tick(1600);
  assert.equal(ray.getAttribute('opacity'), '0');
  assert.equal(button.dataset.revealed, 'true');
  assert.equal(frames.size, 0);
  button.emit('pointerleave');
  assert.equal(button.dataset.revealed, 'false');
});

test('leaving before impact cancels the pending reveal', (t) => {
  const { buttons: [button], rays: [ray], tick, frames } = fixture(t);
  button.emit('pointerenter', { pointerType: 'mouse' });
  tick(100);
  button.emit('pointerleave');
  tick(1600);
  assert.equal(button.dataset.revealed, 'false');
  assert.equal(ray.getAttribute('opacity'), '0');
  assert.equal(frames.size, 0);
});

test('clicking during hover pins without restarting the ray; selecting another sphere cancels the old one', (t) => {
  const { buttons: [first, second], tick } = fixture(t);
  first.emit('pointerenter', { pointerType: 'mouse' });
  tick(300);
  first.emit('click');
  first.emit('pointerleave');
  tick(500);
  assert.equal(first.dataset.revealed, 'true');
  assert.equal(first.getAttribute('aria-pressed'), 'true');
  second.emit('click');
  assert.equal(first.getAttribute('aria-pressed'), 'false');
  assert.equal(first.dataset.active, 'false');
  assert.equal(second.dataset.revealed, 'false');
  second.emit('click');
  tick(2000);
  assert.equal(second.dataset.active, 'false');
  assert.equal(second.dataset.revealed, 'false');
});

test('touch pointer entry does not reveal until tapped', (t) => {
  const { buttons: [button], tick, frames } = fixture(t);
  button.emit('pointerenter', { pointerType: 'touch' });
  assert.equal(frames.size, 0);
  button.emit('click');
  button.emit('pointerleave');
  tick(500);
  assert.equal(button.dataset.revealed, 'true');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
});

test('keyboard focus triggers the ray; blur and Escape cancel pending reveals', (t) => {
  const { hero, buttons: [button], tick } = fixture(t);
  button.focusVisible = true;
  button.emit('focus');
  tick(100);
  button.emit('blur');
  tick(500);
  assert.equal(button.dataset.revealed, 'false');
  button.emit('focus');
  button.emit('click');
  hero.emit('keydown', { key: 'Escape' });
  tick(2000);
  assert.equal(button.dataset.revealed, 'false');
  assert.equal(button.getAttribute('aria-pressed'), 'false');
});

test('reduced motion reveals immediately without scheduling an animation', (t) => {
  const { buttons: [button], frames } = fixture(t, true);
  button.emit('click');
  assert.equal(button.dataset.revealed, 'true');
  assert.equal(frames.size, 0);
});

test('enabling reduced motion or hiding the hero finishes active rays and stops the loop', (t) => {
  const { buttons: [first, second], rays, media, tick, hide, frames } = fixture(t);
  first.emit('click');
  tick(100);
  media.matches = true;
  media.emit('change');
  assert.equal(first.dataset.revealed, 'true');
  assert.equal(frames.size, 0);
  media.matches = false;
  second.emit('click');
  tick(200);
  hide();
  assert.equal(second.dataset.revealed, 'true');
  assert.ok(rays.every((ray) => ray.getAttribute('opacity') === '0'));
  assert.equal(frames.size, 0);
});

test('resizing tracks the sphere center and a hidden sphere does not get stuck awaiting impact', (t) => {
  const { buttons: [button], rays: [ray], tick, frames, resize } = fixture(t);
  button.emit('click');
  tick(100);
  button.rect.left = 200;
  resize();
  tick(200);
  assert.match(ray.querySelector('.ray-incoming').getAttribute('d'), /L250,250$/);
  button.rect.width = 0;
  resize();
  tick(300);
  assert.equal(button.dataset.revealed, 'true');
  assert.equal(ray.getAttribute('opacity'), '0');
  assert.equal(frames.size, 0);
});
