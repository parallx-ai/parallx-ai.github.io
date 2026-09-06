// Geometry is fixed while a sphere is selected. Let the browser animate the
// light along those paths without measuring or rebuilding SVG on every frame.
const IMPACT_MS = 420;
const BRANCH_MS = 620;
const TRAIL = 0.45;
const END_MS = IMPACT_MS + BRANCH_MS * (1 + TRAIL);

export function initSphereInteractions(hero: HTMLElement, reducedMotion: MediaQueryList) {
  const svg = hero.querySelector<SVGSVGElement>('.hero-rays')!;
  const states = [...hero.querySelectorAll<HTMLButtonElement>('.hero-sphere')].map((button, index) => {
    const ray = svg.querySelector<SVGGElement>(`[data-ray="${index}"]`)!;
    return {
      button, ray,
      incoming: ray.querySelector<SVGPathElement>('.ray-incoming')!,
      branches: [...ray.querySelectorAll<SVGPathElement>('.ray-branch')],
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

  function geometry(state: State) {
    const bounds = hero.getBoundingClientRect();
    const rect = state.button.getBoundingClientRect();
    if (!rect.width) return false;
    svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    const x = rect.left + rect.width / 2 - bounds.left;
    const y = rect.top + rect.height / 2 - bounds.top;
    const sourceX = x + (bounds.width / 2 - x) * 0.3;
    const spread = Math.max(rect.width * 0.7, bounds.width * 0.14);
    state.incoming.setAttribute('d', `M${sourceX},0 L${x},${y}`);
    state.branches.forEach((branch, index) => {
      branch.setAttribute('d', `M${x},${y} L${x + (index ? 1 : -1) * spread},${bounds.height + 12}`);
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
      { strokeDashoffset: String(TRAIL), opacity: 0 },
      { strokeDashoffset: String(TRAIL - 0.01), opacity: 1, offset: 0.01 / (1 + TRAIL) },
      { strokeDashoffset: String(TRAIL - 1), opacity: 1, offset: 1 / (1 + TRAIL) },
      { strokeDashoffset: '-1', opacity: 0 },
    ];
    state.ray.setAttribute('opacity', '1');
    state.animations = [
      state.incoming.animate(travel, { duration: IMPACT_MS * (1 + TRAIL), fill: 'both' }),
      ...state.branches.map((branch) => branch.animate(travel, { duration: BRANCH_MS * (1 + TRAIL), delay: IMPACT_MS, fill: 'both' })),
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
