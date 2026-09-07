// Geometry is fixed while a sphere is selected. Let the browser reveal the
// tapered beams through masks without per-frame layout reads.
const IMPACT_MS = 420;
const BRANCH_MS = 620;
const HOLD_MS = 140;
const FADE_MS = 280;
const END_MS = IMPACT_MS + BRANCH_MS + HOLD_MS + FADE_MS;

export function initSphereInteractions(hero: HTMLElement, reducedMotion: MediaQueryList) {
  const svg = hero.querySelector<SVGSVGElement>('.hero-rays')!;
  const states = [...hero.querySelectorAll<HTMLButtonElement>('.hero-sphere')].map((button, index) => {
    const ray = svg.querySelector<SVGGElement>(`[data-ray="${index}"]`)!;
    return {
      button, ray,
      incoming: ray.querySelector<SVGPathElement>('.ray-incoming')!,
      branches: [...ray.querySelectorAll<SVGPathElement>('.ray-branch')],
      incomingTravel: svg.querySelector<SVGPathElement>(`.ray-incoming-travel[data-ray-travel="${index}"]`)!,
      branchTravel: [...svg.querySelectorAll<SVGPathElement>(`.ray-branch-travel[data-ray-travel="${index}"]`)],
      impact: ray.querySelector<SVGCircleElement>('.ray-impact')!,
      hovered: false,
      focused: false,
      animations: [] as Animation[],
      impactTimer: 0,
      endTimer: 0,
    };
  });
  type State = typeof states[number];

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
    const x = rect.left + rect.width / 2 - bounds.left;
    const y = rect.top + rect.height / 2 - bounds.top;
    const sourceX = x + (bounds.width / 2 - x) * 0.3;
    const spread = Math.max(rect.width * 0.7, bounds.width * 0.14);
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
    return true;
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
    const active = state.hovered || state.focused || state.button.getAttribute('aria-pressed') === 'true';
    if (active === (state.button.dataset.active === 'true')) return;
    const animate = !reducedMotion.matches && hero.dataset.running === 'true';
    state.button.dataset.active = String(active);
    state.button.dataset.revealed = String(active && !animate);
    clearRay(state);
    if (active && animate) startRay(state);
  }

  function closeAll() {
    states.forEach((state) => {
      state.hovered = state.focused = false;
      state.button.setAttribute('aria-pressed', 'false');
      sync(state);
    });
  }

  states.forEach((state) => {
    state.button.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      state.hovered = true;
      sync(state);
    });
    const leave = () => { state.hovered = false; sync(state); };
    state.button.addEventListener('pointerleave', leave);
    state.button.addEventListener('pointercancel', leave);
    state.button.addEventListener('focus', () => {
      state.focused = state.button.matches(':focus-visible');
      sync(state);
    });
    state.button.addEventListener('blur', () => {
      state.focused = false;
      sync(state);
    });
    state.button.addEventListener('click', () => {
      const pinned = state.button.getAttribute('aria-pressed') !== 'true';
      states.forEach((other) => {
        other.button.setAttribute('aria-pressed', String(other === state && pinned));
        sync(other);
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
      if (state.animations.length) state.button.dataset.revealed = state.button.dataset.active;
      clearRay(state);
    });
  }
  reducedMotion.addEventListener('change', finishRays);
  new MutationObserver(finishRays).observe(hero, { attributes: true, attributeFilter: ['data-running'] });
  new ResizeObserver(() => {
    states.filter((state) => state.animations.length).forEach((state) => {
      if (!geometry(state)) {
        state.button.dataset.revealed = state.button.dataset.active;
        clearRay(state);
      }
    });
  }).observe(hero);
}
