// Ray travel uses browser animations. Drag/return offsets are tracked directly,
// so even a ray playing during a return needs no per-frame layout reads.
const IMPACT_MS = 420;
const BRANCH_MS = 620;
const HOLD_MS = 140;
const FADE_MS = 280;
const END_MS = IMPACT_MS + BRANCH_MS + HOLD_MS + FADE_MS;
const DRAG_THRESHOLD = 6;
const DRAG_GAIN = 0.42;
const RETURN_MS = 2000;
type Drag = { pointerId: number; startX: number; startY: number; originX: number; originY: number; resistanceScale: number; moved: boolean };
type Return = { x: number; y: number; startedAt: number };
type RayBounds = { width: number; height: number; x: number; y: number; size: number };

export function initSphereInteractions(hero: HTMLElement, reducedMotion: MediaQueryList) {
  const svg = hero.querySelector<SVGSVGElement>('.hero-rays')!;
  const states = [...hero.querySelectorAll<HTMLButtonElement>('.hero-sphere')].map((button, index) => {
    const ray = svg.querySelector<SVGGElement>(`[data-ray="${index}"]`)!;
    return {
      button, ray, position: button.closest<HTMLElement>('.sphere-position')!,
      incoming: ray.querySelector<SVGPathElement>('.ray-incoming')!,
      branches: [...ray.querySelectorAll<SVGPathElement>('.ray-branch')],
      incomingTravel: svg.querySelector<SVGPathElement>(`.ray-incoming-travel[data-ray-travel="${index}"]`)!,
      branchTravel: [...svg.querySelectorAll<SVGPathElement>(`.ray-branch-travel[data-ray-travel="${index}"]`)],
      impact: ray.querySelector<SVGCircleElement>('.ray-impact')!,
      hovered: false,
      focused: false,
      selected: false,
      drag: null as Drag | null,
      returning: null as Return | null,
      suppressClick: false,
      x: 0, y: 0,
      bounds: null as RayBounds | null,
      animations: [] as Animation[],
      impactTimer: 0,
      endTimer: 0,
    };
  });
  type State = typeof states[number];
  let returnFrame = 0;

  function clearRay(state: State) {
    clearTimeout(state.impactTimer);
    clearTimeout(state.endTimer);
    state.impactTimer = state.endTimer = 0;
    state.animations.forEach((animation) => animation.cancel());
    state.animations = [];
    state.ray.setAttribute('opacity', '0');
  }

  function setBeam(shape: SVGPathElement, travel: SVGPathElement, tip: [number, number], base: [number, number], width: number, incoming = false) {
    const dx = base[0] - tip[0];
    const dy = base[1] - tip[1];
    const length = Math.hypot(dx, dy);
    const nx = -dy / length * width / 2;
    const ny = dx / length * width / 2;
    shape.setAttribute('d', `M${tip[0]},${tip[1]} L${base[0] + nx},${base[1] + ny} L${base[0] - nx},${base[1] - ny} Z`);
    const [from, to] = incoming ? [base, tip] : [tip, base];
    travel.setAttribute('d', `M${from[0]},${from[1]} L${to[0]},${to[1]}`);
    travel.setAttribute('stroke-width', String(width + 2));
  }

  function geometry(state: State) {
    const bounds = hero.getBoundingClientRect();
    const rect = state.button.getBoundingClientRect();
    if (!rect.width) return false;
    svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    state.bounds = {
      width: bounds.width, height: bounds.height,
      x: rect.left + rect.width / 2 - bounds.left - state.x,
      y: rect.top + rect.height / 2 - bounds.top - state.y,
      size: rect.width,
    };
    drawRay(state);
    return true;
  }

  function drawRay(state: State) {
    const bounds = state.bounds!;
    const x = bounds.x + state.x;
    const y = bounds.y + state.y;
    const sourceX = x + (bounds.width / 2 - x) * 0.3;
    const spread = Math.max(bounds.size * 0.7, bounds.width * 0.14);
    const incomingWidth = Math.max(18, Math.min(42, bounds.width * 0.025));
    const branchWidth = Math.max(18, Math.min(56, bounds.width * 0.036));
    const tip: [number, number] = [x, y];
    setBeam(state.incoming, state.incomingTravel, tip, [sourceX, -24], incomingWidth, true);
    state.branches.forEach((branch, index) => {
      const base: [number, number] = [x + (index ? 1 : -1) * spread, bounds.height + 24];
      setBeam(branch, state.branchTravel[index], tip, base, branchWidth * (index ? 1 : 0.65));
    });
    state.impact.setAttribute('cx', String(x));
    state.impact.setAttribute('cy', String(y));
  }

  function startRay(state: State) {
    if (!geometry(state)) {
      state.button.dataset.revealed = 'true';
      return;
    }
    const travel: Keyframe[] = [
      { strokeDashoffset: '1' },
      { strokeDashoffset: '0' },
    ];
    state.ray.setAttribute('opacity', '1');
    state.animations = [
      state.incomingTravel.animate(travel, { duration: IMPACT_MS, fill: 'both' }),
      ...state.branchTravel.map((branch) => branch.animate(travel, { duration: BRANCH_MS, delay: IMPACT_MS, fill: 'both' })),
      state.ray.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, delay: IMPACT_MS + BRANCH_MS + HOLD_MS, fill: 'both' }),
      state.impact.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 300, delay: IMPACT_MS, fill: 'both' }),
    ];
    state.impactTimer = setTimeout(() => {
      state.button.dataset.revealed = 'true';
      state.impactTimer = 0;
    }, IMPACT_MS);
    state.endTimer = setTimeout(() => clearRay(state), END_MS);
  }

  function sync(state: State) {
    state.button.dataset.active = String(state.hovered || state.focused || state.selected || !!state.drag);
  }

  function select(state: State, selected: boolean) {
    if (selected === state.selected) return;
    state.selected = selected;
    state.button.setAttribute('aria-pressed', String(selected));
    const animate = !reducedMotion.matches && hero.dataset.running === 'true';
    state.button.dataset.revealed = String(selected && !animate);
    clearRay(state);
    sync(state);
    if (selected && animate) startRay(state);
  }

  function move(state: State, x: number, y: number) {
    state.x = x;
    state.y = y;
    state.position.style.translate = `${x}px ${y}px`;
    if (state.animations.length) drawRay(state);
    // The orbit's normal drift loop is paused under reduced motion.
    if (hero.dataset.running !== 'true') hero.dispatchEvent(new Event('sphere:move'));
  }

  function returnTick(now: number) {
    returnFrame = 0;
    states.forEach((state) => {
      if (!state.returning) return;
      const elapsed = now - state.returning.startedAt;
      // Critically damped return: no bounce, a gentle start, and a slow settle.
      const t = elapsed / 240;
      const remaining = elapsed >= RETURN_MS ? 0 : (1 + t) * Math.exp(-t);
      move(state, state.returning.x * remaining, state.returning.y * remaining);
      if (!remaining) {
        state.returning = null;
        state.position.dataset.returning = 'false';
      }
    });
    if (states.some((state) => state.returning)) returnFrame = requestAnimationFrame(returnTick);
  }

  function returnHome(state: State) {
    if (!state.x && !state.y) return;
    if (reducedMotion.matches || hero.dataset.running !== 'true') {
      move(state, 0, 0);
      state.returning = null;
      state.position.dataset.returning = 'false';
      return;
    }
    state.returning = { x: state.x, y: state.y, startedAt: performance.now() };
    state.position.dataset.returning = 'true';
    if (!returnFrame) returnFrame = requestAnimationFrame(returnTick);
  }

  function release(state: State, cancelled = false) {
    if (!state.drag) return;
    const { pointerId, moved } = state.drag;
    state.drag = null;
    state.button.dataset.dragging = 'false';
    state.suppressClick = moved || cancelled;
    if (cancelled) state.hovered = false;
    if (state.button.hasPointerCapture(pointerId)) state.button.releasePointerCapture(pointerId);
    returnHome(state);
    sync(state);
  }

  function closeAll() {
    states.forEach((state) => {
      state.hovered = state.focused = false;
      release(state, true);
      select(state, false);
      sync(state);
    });
  }

  states.forEach((state) => {
    state.button.dataset.revealed = 'false';
    sync(state);
    state.button.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      state.hovered = true;
      sync(state);
    });
    const leave = () => { state.hovered = false; sync(state); };
    state.button.addEventListener('pointerleave', leave);
    state.button.addEventListener('focus', () => {
      state.focused = state.button.matches(':focus-visible');
      sync(state);
    });
    state.button.addEventListener('blur', () => {
      state.focused = false;
      sync(state);
    });
    state.button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary || state.drag) return;
      const resistanceScale = Math.min(18, Math.max(10, state.position.getBoundingClientRect().width * 0.1));
      // Invert the resistance at the current offset to re-grab a returning
      // sphere without jumping or resetting its resistance to outward motion.
      const distance = Math.hypot(state.x, state.y);
      const factor = distance ? Math.expm1(distance / resistanceScale) * resistanceScale / (DRAG_GAIN * distance) : 1;
      state.returning = null;
      state.position.dataset.returning = 'false';
      state.suppressClick = false;
      state.drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: state.x * factor, originY: state.y * factor, resistanceScale, moved: false };
      state.button.dataset.dragging = 'true';
      state.button.setPointerCapture(event.pointerId);
      sync(state);
    });
    state.button.addEventListener('pointermove', (event) => {
      const drag = state.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!drag.moved) {
        drag.moved = true;
        // A drag interrupts a travelling ray; only a fresh click starts one.
        clearRay(state);
        state.button.dataset.revealed = String(state.selected);
      }
      const x = drag.originX + dx;
      const y = drag.originY + dy;
      const distance = Math.hypot(x, y);
      // A heavy initial response keeps slowing with distance. Logarithmic
      // travel remains possible beyond any point, without a perceptible wall.
      const resistance = distance ? drag.resistanceScale * Math.log1p(DRAG_GAIN * distance / drag.resistanceScale) / distance : DRAG_GAIN;
      move(state, x * resistance, y * resistance);
    });
    state.button.addEventListener('pointerup', (event) => {
      if (state.drag?.pointerId === event.pointerId) release(state);
    });
    const cancelDrag = (event: PointerEvent) => {
      if (state.drag?.pointerId === event.pointerId) release(state, true);
    };
    state.button.addEventListener('pointercancel', cancelDrag);
    state.button.addEventListener('lostpointercapture', cancelDrag);
    state.button.addEventListener('click', (event) => {
      if (state.suppressClick && event.detail !== 0) {
        state.suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const pinned = !state.selected;
      states.forEach((other) => {
        select(other, other === state && pinned);
      });
    });
  });
  hero.addEventListener('click', (event) => {
    if (event.target instanceof Element && !event.target.closest('button')) closeAll();
  });
  hero.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAll();
  });

  function finishRays() {
    if (!reducedMotion.matches && hero.dataset.running === 'true') return;
    states.forEach((state) => {
      if (state.animations.length) state.button.dataset.revealed = String(state.selected);
      clearRay(state);
      release(state, true);
      state.returning = null;
      state.position.dataset.returning = 'false';
      move(state, 0, 0);
    });
    cancelAnimationFrame(returnFrame);
    returnFrame = 0;
  }
  reducedMotion.addEventListener('change', finishRays);
  new MutationObserver(finishRays).observe(hero, { attributes: true, attributeFilter: ['data-running'] });
  new ResizeObserver(() => {
    states.filter((state) => state.animations.length).forEach((state) => {
      if (!geometry(state)) {
        state.button.dataset.revealed = String(state.selected);
        clearRay(state);
      }
    });
  }).observe(hero);
}
