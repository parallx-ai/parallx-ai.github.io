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
  animations = [];
  style = { translate: '0px 0px' };
  capturedPointer = null;
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelector(selector) { return this.selectors[selector]; }
  querySelectorAll(selector) { return this.selectors[selector]; }
  getBoundingClientRect() {
    this.layoutReads++;
    const [x, y] = (this.position?.style.translate ?? '0px 0px').split(' ').map(parseFloat);
    return { ...this.rect, left: this.rect.left + x, top: this.rect.top + y };
  }
  matches() { return this.focusVisible; }
  closest(selector) { return selector === '.sphere-position' ? this.position : null; }
  setPointerCapture(id) { this.capturedPointer = id; }
  hasPointerCapture(id) { return this.capturedPointer === id; }
  releasePointerCapture() { this.capturedPointer = null; }
  animate(keyframes, options) {
    this.animations.push({ keyframes, options });
    return { cancel() {} };
  }
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
    requestAnimationFrame: (callback) => { frames.set(++id, { callback: () => callback(now), time: now + 16 }); return id; },
    cancelAnimationFrame: (key) => frames.delete(key),
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
    button.position = new Element();
    button.rect = { left: 100 + index * 900, top: 276, width: 100, height: 100 };
    button.setAttribute('aria-pressed', 'false');
    const ray = new Element();
    ray.setAttribute('opacity', '0');
    ray.selectors['.ray-incoming'] = new Element();
    ray.selectors['.ray-branch'] = [new Element(), new Element()];
    ray.selectors['.ray-impact'] = new Element();
    svg.selectors[`[data-ray="${index}"]`] = ray;
    svg.selectors[`.ray-incoming-travel[data-ray-travel="${index}"]`] = new Element();
    svg.selectors[`.ray-branch-travel[data-ray-travel="${index}"]`] = [new Element(), new Element()];
    return ray;
  });
  hero.selectors['.hero-rays'] = svg;
  hero.selectors['.hero-sphere'] = buttons;
  const media = new Element();
  media.matches = reduced;
  initSphereInteractions(hero, media);
  return {
    hero, svg, buttons, rays, media, frames,
    tick(time) {
      now = time;
      const pending = [...frames.entries()].filter(([, timer]) => timer.time <= time);
      pending.forEach(([key, timer]) => { frames.delete(key); timer.callback(); });
    },
    resize() { onResize(); },
    hide() { hero.dataset.running = 'false'; onMotion(); },
  };
}

test('hover only enlarges; a click reveals at impact without a geometry loop', (t) => {
  const { buttons: [button], rays: [ray], tick, frames } = fixture(t);
  button.emit('pointerenter', { pointerType: 'mouse' });
  assert.equal(button.dataset.active, 'true');
  assert.equal(button.dataset.revealed, 'false');
  assert.equal(ray.getAttribute('opacity'), '0');
  assert.equal(frames.size, 0);
  button.emit('click');
  const initialLayoutReads = button.layoutReads;
  tick(100);
  assert.equal(button.dataset.revealed, 'false');
  assert.equal(ray.getAttribute('opacity'), '1');
  tick(500);
  assert.equal(button.layoutReads, initialLayoutReads, 'the ray must not remeasure the sphere while it travels');
  assert.equal(button.dataset.revealed, 'true');
  const incoming = ray.querySelector('.ray-incoming').getAttribute('d');
  assert.match(incoming, /^M150,250 L.* L.* Z$/);
  const branches = ray.querySelectorAll('.ray-branch');
  assert.ok(branches.every((path) => path.getAttribute('d').startsWith('M150,250 L')));
  assert.notEqual(branches[0].getAttribute('d'), branches[1].getAttribute('d'));
  tick(1600);
  assert.equal(ray.getAttribute('opacity'), '0');
  assert.equal(button.dataset.revealed, 'true');
  assert.equal(frames.size, 0);
  button.emit('pointerleave');
  assert.equal(button.dataset.revealed, 'true', 'click selection survives pointer leave');
  button.emit('click');
  assert.equal(button.dataset.revealed, 'false');
});

test('deselecting before impact cancels the pending reveal even while hovered', (t) => {
  const { buttons: [button], rays: [ray], tick, frames } = fixture(t);
  button.emit('pointerenter', { pointerType: 'mouse' });
  button.emit('click');
  tick(100);
  button.emit('click');
  tick(1600);
  assert.equal(button.dataset.revealed, 'false');
  assert.equal(ray.getAttribute('opacity'), '0');
  assert.equal(frames.size, 0);
  assert.equal(button.dataset.active, 'true');
});

test('a ray starts at click time; selecting another sphere cancels the old one', (t) => {
  const { buttons: [first, second], tick } = fixture(t);
  first.emit('pointerenter', { pointerType: 'mouse' });
  tick(300);
  first.emit('click');
  first.emit('pointerleave');
  tick(500);
  assert.equal(first.dataset.revealed, 'false');
  tick(800);
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

test('keyboard focus only enlarges; activation triggers the ray and Escape cancels it', (t) => {
  const { hero, buttons: [button], tick, frames } = fixture(t);
  button.focusVisible = true;
  button.emit('focus');
  assert.equal(button.dataset.active, 'true');
  assert.equal(frames.size, 0);
  tick(100);
  button.emit('blur');
  tick(500);
  assert.equal(button.dataset.revealed, 'false');
  button.emit('focus');
  button.emit('click', { detail: 0 });
  assert.ok(frames.size > 0);
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
  assert.match(ray.querySelector('.ray-incoming').getAttribute('d'), /^M250,250 L/);
  button.rect.width = 0;
  resize();
  tick(300);
  assert.equal(button.dataset.revealed, 'true');
  assert.equal(ray.getAttribute('opacity'), '0');
  assert.equal(frames.size, 0);
});

test('filled beams meet at one sharp tip, widen toward the edges, and reveal before fading together', (t) => {
  const { buttons: [button], rays: [ray], svg } = fixture(t);
  button.emit('click');
  const beams = [ray.querySelector('.ray-incoming'), ...ray.querySelectorAll('.ray-branch')];
  const travel = [svg.querySelector('.ray-incoming-travel[data-ray-travel="0"]'), ...svg.querySelectorAll('.ray-branch-travel[data-ray-travel="0"]')];
  const baseCenters = [];
  beams.forEach((beam, index) => {
    const coordinates = beam.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number);
    assert.equal(coordinates.length, 6, 'each beam is a filled triangle');
    const [x, y, ax, ay, bx, by] = coordinates;
    assert.deepEqual([x, y], [150, 250], 'all three tips meet at the sphere center');
    const width = Math.hypot(ax - bx, ay - by);
    assert.ok(width > 18, 'the outer base must be visibly wider than a stroked line');
    assert.ok(Number(travel[index].getAttribute('stroke-width')) > width, 'the reveal mask must cover the full beam width');
    baseCenters.push([(ax + bx) / 2, (ay + by) / 2]);
  });
  assert.ok(baseCenters[0][1] < 0, 'the incoming wide base extends beyond the top edge');
  assert.ok(baseCenters.slice(1).every(([, y]) => y > 900), 'the branches widen beyond the bottom edge');
  assert.ok(baseCenters[1][0] < 150 && baseCenters[2][0] > 150, 'the branches diverge');
  assert.match(travel[0].getAttribute('d'), /L150,250$/);
  assert.ok(travel.slice(1).every((path) => path.getAttribute('d').startsWith('M150,250 L')));
  const incomingTiming = travel[0].animations[0].options;
  const branchTiming = travel[1].animations[0].options;
  const fadeTiming = ray.animations[0].options;
  assert.equal(branchTiming.delay, incomingTiming.duration, 'branches begin only when the incoming beam reaches the sphere');
  assert.ok(fadeTiming.delay > branchTiming.delay + branchTiming.duration, 'the full tapered shape remains visible before it fades');
});

const pointer = { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, clientX: 150, clientY: 326 };
const offset = (button) => button.position.style.translate.split(' ').map(parseFloat);
const displacement = (button) => Math.hypot(...offset(button));

for (const pointerType of ['mouse', 'touch', 'pen']) {
  test(`${pointerType} dragging is constrained, suppresses the click, and settles home`, (t) => {
    const { buttons: [button], rays: [ray], tick, frames } = fixture(t);
    button.emit('pointerdown', { ...pointer, pointerType });
    assert.equal(button.capturedPointer, 1);
    button.emit('pointermove', { ...pointer, pointerType, clientX: 650, clientY: 700 });
    const held = displacement(button);
    assert.ok(held > 0 && held < 50, 'a long drag moves the sphere only a short distance');
    assert.equal(button.dataset.revealed, 'false');
    assert.equal(ray.getAttribute('opacity'), '0');
    button.emit('pointerup', { ...pointer, pointerType });
    assert.equal(button.capturedPointer, null);
    button.emit('click', { detail: 1 });
    assert.equal(button.getAttribute('aria-pressed'), 'false', 'release must not activate the sphere');
    tick(250);
    assert.ok(displacement(button) > 0 && displacement(button) < held, 'return is gradual');
    tick(2000);
    assert.deepEqual(offset(button), [0, 0]);
    assert.equal(frames.size, 0, 'no return loop remains idle');
    button.emit('click', { detail: 1 });
    assert.equal(ray.getAttribute('opacity'), '1', 'the next intentional click still works');
  });
}

test('pointer jitter still permits a click, and non-primary pointers do not start drags', (t) => {
  const { buttons: [button], rays: [ray] } = fixture(t);
  button.emit('pointerdown', { ...pointer, button: 2 });
  assert.equal(button.capturedPointer, null);
  button.emit('pointerdown', { ...pointer, isPrimary: false });
  assert.equal(button.capturedPointer, null);
  button.emit('pointerdown', pointer);
  button.emit('pointermove', { ...pointer, clientX: 153, clientY: 328 });
  button.emit('pointerup', pointer);
  assert.deepEqual(offset(button), [0, 0]);
  button.emit('click', { detail: 1 });
  assert.equal(ray.getAttribute('opacity'), '1');
});

test('dragging starts heavy and keeps slowing without hitting a fixed boundary', (t) => {
  const { buttons: [button] } = fixture(t);
  button.emit('pointerdown', pointer);
  let previous = 0;
  let previousStep = 25;
  for (const distance of [25, 50, 75, 100]) {
    button.emit('pointermove', { ...pointer, clientX: pointer.clientX + distance });
    const current = displacement(button);
    const step = current - previous;
    assert.ok(step > 0 && step < previousStep * 0.85, 'equal pulls move the sphere progressively less');
    assert.ok(step < 12.5, 'even the initial pull travels less than half the pointer distance');
    previous = current;
    previousStep = step;
  }
  button.emit('pointermove', { ...pointer, clientX: pointer.clientX + 500 });
  const far = displacement(button);
  button.emit('pointermove', { ...pointer, clientX: pointer.clientX + 1000 });
  assert.ok(displacement(button) > far + 3, 'farther pulls still visibly move the sphere instead of flattening against a boundary');
  assert.ok(displacement(button) < 50, 'large pulls still keep the sphere near its origin');
  button.emit('pointermove', pointer);
  assert.deepEqual(offset(button), [0, 0], 'reversing the pull brings it back through the origin');
  button.emit('pointermove', { ...pointer, clientX: pointer.clientX - 500 });
  assert.ok(Math.abs(offset(button)[0] + far) < 1e-9, 'resistance is symmetric in the opposite direction');
});

test('re-grabbing a returning sphere does not jump or reset outward resistance', (t) => {
  const { buttons: [button], tick } = fixture(t);
  button.emit('pointerdown', pointer);
  button.emit('pointermove', { ...pointer, clientX: 220 });
  button.emit('pointerup', pointer);
  tick(400);
  const intermediate = offset(button);
  button.emit('pointerdown', { ...pointer, clientX: 200 });
  assert.deepEqual(offset(button), intermediate);
  tick(700);
  assert.deepEqual(offset(button), intermediate, 'holding pauses the return');
  button.emit('pointermove', { ...pointer, clientX: 207 });
  assert.ok(offset(button)[0] > intermediate[0]);
  assert.ok(offset(button)[0] - intermediate[0] < 7, 'movement remains resisted');
  button.emit('pointermove', { ...pointer, clientX: 1000 });
  assert.ok(displacement(button) < 50, 'a long second drag remains heavily resisted');
  button.emit('pointerup', pointer);
  tick(2800);
  assert.deepEqual(offset(button), [0, 0]);
});

test('re-grabbing at the same offset preserves resistance for further pulls', (t) => {
  const { buttons: [continuous, grabbed] } = fixture(t);
  for (const button of [continuous, grabbed]) {
    button.emit('pointerdown', pointer);
    button.emit('pointermove', { ...pointer, clientX: pointer.clientX + 250 });
  }
  grabbed.emit('pointerup', pointer);
  grabbed.emit('pointerdown', { ...pointer, clientX: pointer.clientX + 250 });
  for (const button of [continuous, grabbed]) {
    button.emit('pointermove', { ...pointer, clientX: pointer.clientX + 350 });
  }
  assert.ok(Math.abs(displacement(continuous) - displacement(grabbed)) < 1e-9, 're-grabbing cannot make outward motion lighter');
});

test('a click during return keeps its ray aligned using cached geometry', (t) => {
  const { buttons: [button], rays: [ray], tick } = fixture(t);
  button.emit('pointerdown', pointer);
  button.emit('pointermove', { ...pointer, clientX: 200 });
  button.emit('pointerup', pointer);
  tick(200);
  button.emit('pointerdown', pointer);
  button.emit('pointerup', pointer);
  button.emit('click', { detail: 1 });
  const layoutReads = button.layoutReads;
  tick(600);
  const tip = ray.querySelector('.ray-incoming').getAttribute('d').match(/^M([^,]+),([^ ]+)/);
  assert.equal(Number(tip[1]), 150 + offset(button)[0]);
  assert.equal(Number(tip[2]), 250 + offset(button)[1]);
  assert.equal(button.layoutReads, layoutReads);
});

for (const interruption of ['pointercancel', 'lostpointercapture', 'Escape', 'hide']) {
  test(`${interruption} releases the sphere and cancels pending ray work`, (t) => {
    const { hero, buttons: [button], rays: [ray], tick, hide, frames } = fixture(t);
    button.emit('click');
    button.emit('pointerdown', pointer);
    button.emit('pointermove', { ...pointer, clientX: 240 });
    assert.equal(ray.getAttribute('opacity'), '0', 'drag interrupts the travelling ray');
    if (interruption === 'Escape') hero.emit('keydown', { key: 'Escape' });
    else if (interruption === 'hide') hide();
    else button.emit(interruption, pointer);
    assert.equal(button.dataset.dragging, 'false');
    assert.equal(button.capturedPointer, null);
    tick(2000);
    assert.deepEqual(offset(button), [0, 0]);
    assert.equal(frames.size, 0);
    button.emit('click', { detail: 0 });
    assert.equal(button.getAttribute('aria-pressed'), String(interruption === 'Escape'), 'keyboard activation is never swallowed by drag suppression');
  });
}

test('reduced motion keeps dragging direct, updates orbits, and returns without animation', (t) => {
  const { hero, buttons: [button], frames } = fixture(t, true);
  hero.dataset.running = 'false';
  let orbitUpdates = 0;
  hero.addEventListener('sphere:move', () => orbitUpdates++);
  button.emit('pointerdown', pointer);
  button.emit('pointermove', { ...pointer, clientX: 180 });
  assert.ok(displacement(button) > 0);
  assert.equal(orbitUpdates, 1);
  button.emit('pointerup', pointer);
  assert.deepEqual(offset(button), [0, 0]);
  assert.equal(orbitUpdates, 2);
  assert.equal(frames.size, 0);
});

test('switching to reduced motion stops an in-progress return', (t) => {
  const { buttons: [button], media, tick, frames } = fixture(t);
  button.emit('pointerdown', pointer);
  button.emit('pointermove', { ...pointer, clientX: 250 });
  button.emit('pointerup', pointer);
  tick(200);
  media.matches = true;
  media.emit('change');
  assert.deepEqual(offset(button), [0, 0]);
  assert.equal(frames.size, 0);
});
