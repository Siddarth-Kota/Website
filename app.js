(() => {
  'use strict';

  const nativeTransitions = 'CSSViewTransitionRule' in window && ['http:', 'https:'].includes(window.location.protocol);
  const softNavigation = ['http:', 'https:'].includes(window.location.protocol) &&
    typeof window.fetch === 'function' && typeof window.DOMParser === 'function';
  if (nativeTransitions || softNavigation) document.documentElement.classList.add('native-transitions');
  const pageCache = new Map();
  let disposePage = () => {};
  let changingPage = false;
  let queuedNavigation = null;
  let scrollFrame = 0;
  let activeTransition = null;
  let activeAnimation = null;
  let renderedHref = window.location.href.split('#')[0];
  // True while a page is revealed out of a via: its content shows at once
  // so the growing circle uncovers the real page, not an empty one.
  let revealInstantly = false;

  async function loadPage(href) {
    const url = new URL(href, window.location.href);
    url.hash = '';
    if (!pageCache.has(url.href)) {
      const request = (async () => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 10000);
        try {
          const response = await window.fetch(url.href, {
            credentials: 'same-origin', headers: { Accept: 'text/html' }, signal: controller.signal
          });
          if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Page unavailable');
          const source = new window.DOMParser().parseFromString(await response.text(), 'text/html');
          if (!source.body.matches('.home, .detail-page') || !source.querySelector('main')) throw new Error('Not a portfolio page');
          // Make page-relative assets safe when moving between / and /projects/.
          source.body.querySelectorAll('[href], [src], object[data]').forEach((element) => {
            ['href', 'src', 'data'].forEach((attribute) => {
              if (element.hasAttribute(attribute)) {
                element.setAttribute(attribute, new URL(element.getAttribute(attribute), response.url || url.href).href);
              }
            });
          });
          source.body.querySelectorAll('script').forEach((script) => script.remove());
          return { body: source.body, title: source.title,
            description: source.querySelector('meta[name="description"]')?.content || '',
            language: source.documentElement.lang || 'en' };
        } finally {
          clearTimeout(timeout);
        }
      })();
      pageCache.set(url.href, request);
      request.catch(() => pageCache.delete(url.href));
    }
    return pageCache.get(url.href);
  }

  function saveScroll() {
    window.history.replaceState({ ...window.history.state,
      portfolioScroll: { x: window.scrollX, y: window.scrollY } }, '', window.location.href);
  }

  async function changePage(href, options = {}) {
    if (changingPage) { queuedNavigation = { href, options }; return; }
    changingPage = true;
    if (!options.traversal) saveScroll();
    try {
      const page = await loadPage(href);
      if (queuedNavigation) return;
      const reveal = options.reveal ? { ...options.reveal, radius: Math.hypot(
        Math.max(options.reveal.x, window.innerWidth - options.reveal.x),
        Math.max(options.reveal.y, window.innerHeight - options.reveal.y)) } : null;
      const update = () => {
        disposePage();
        if (!options.traversal) window.history.pushState({ portfolioScroll: { x: 0, y: 0 } }, '', href);
        renderedHref = new URL(href, window.location.href).href.split('#')[0];
        document.title = page.title;
        document.documentElement.lang = page.language;
        const description = document.querySelector('meta[name="description"]');
        if (description) description.content = page.description;
        document.body.replaceWith(document.adoptNode(page.body.cloneNode(true)));
        if (reveal) {
          // A thin vector wavefront drawn inside the new page, just within the
          // edge of the reveal circle. Only its radius changes each frame.
          const wave = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          wave.setAttribute('class', 'reveal-wave');
          wave.setAttribute('aria-hidden', 'true');
          wave.innerHTML = `<circle class="wave-glow" cx="${reveal.x}" cy="${reveal.y}" r="0"/>` +
            `<circle class="wave-edge" cx="${reveal.x}" cy="${reveal.y}" r="0"/>`;
          document.body.append(wave);
        }
        disposePage = init();
        window.scrollTo({ left: options.scroll?.x || 0, top: options.scroll?.y || 0, behavior: 'instant' });
        const hash = new URL(href, window.location.href).hash;
        if (hash && !options.scroll) {
          try { document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior: 'instant' }); } catch {}
        }
        const heading = document.querySelector('h1');
        if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
      };
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduced && typeof document.startViewTransition === 'function') {
        const root = document.documentElement;
        if (options.reveal) { root.dataset.transition = 'reveal'; revealInstantly = true; }
        activeTransition = document.startViewTransition(update);
        activeTransition.ready.catch(() => {});
        if (options.reveal) {
          // A circle grows from the via until it covers the screen, showing
          // the new page inside it while the homepage sinks back behind.
          activeTransition.ready.then(() => {
            const { x, y, radius } = reveal;
            const timing = { duration: 760, easing: 'cubic-bezier(.65,.05,.25,1)', fill: 'both' };
            const clip = root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
              { ...timing, pseudoElement: '::view-transition-new(root)' });
            root.animate({ transform: ['scale(1)', 'scale(.97)'], opacity: [1, .3] },
              { ...timing, pseudoElement: '::view-transition-old(root)' });
            // The wavefront follows the clip's own eased progress, so the two
            // never drift apart.
            const wave = document.querySelector('.reveal-wave');
            const edge = wave?.querySelector('.wave-edge');
            const glow = wave?.querySelector('.wave-glow');
            const follow = () => {
              const progress = clip.effect.getComputedTiming().progress;
              if (!wave || progress === null) return;
              const r = progress * radius;
              edge.setAttribute('r', String(Math.max(0, r - 1.5)));
              glow.setAttribute('r', String(Math.max(0, r - 6)));
              wave.style.opacity = String(progress < .7 ? 1 : Math.max(0, 1 - (progress - .7) / .3));
              if (clip.playState === 'running') requestAnimationFrame(follow);
            };
            requestAnimationFrame(follow);
            root.animate({ transform: ['scale(1)', 'scale(.96)'], opacity: [1, .25] },
              { ...timing, pseudoElement: '::view-transition-old(root)' });
          }).catch(() => {});
        }
        await activeTransition.updateCallbackDone;
        await activeTransition.finished.catch(() => {});
      } else if (!reduced && document.body.animate) {
        activeAnimation = document.body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' });
        await activeAnimation.finished;
        update();
        activeAnimation = document.body.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 240, easing: 'ease-out' });
        await activeAnimation.finished;
      } else update();
    } catch {
      window.location.assign(href);
    } finally {
      revealInstantly = false;
      delete document.documentElement.dataset.transition;
      document.querySelector('.reveal-wave')?.remove();
      activeTransition = null;
      activeAnimation = null;
      changingPage = false;
      if (queuedNavigation) {
        const next = queuedNavigation;
        queuedNavigation = null;
        changePage(next.href, next.options);
      }
    }
  }

  if (softNavigation) {
    // These head assets stay mounted while the body changes.
    document.querySelectorAll('link[href], script[src]').forEach((element) => {
      const attribute = element.hasAttribute('href') ? 'href' : 'src';
      element.setAttribute(attribute, new URL(element.getAttribute(attribute), window.location.href).href);
    });
    window.history.scrollRestoration = 'manual';
    saveScroll();
    window.addEventListener('popstate', (event) => {
      if (window.location.href.split('#')[0] === renderedHref) {
        const position = event.state?.portfolioScroll || { x: 0, y: 0 };
        window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
        return;
      }
      activeTransition?.skipTransition();
      activeAnimation?.finish();
      changePage(window.location.href, { traversal: true, scroll: event.state?.portfolioScroll || { x: 0, y: 0 } });
    });
    window.addEventListener('scroll', () => {
      if (changingPage) return;
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(saveScroll);
    }, { passive: true });
  }

  function init() {
    const listeners = [];
    let destroyed = false;
    let resizeFrame = 0;
    let observer = null;
    const on = (target, type, listener, options) => {
      if (!target?.addEventListener) return;
      target.addEventListener(type, listener, options);
      listeners.push(() => target.removeEventListener?.(type, listener, options));
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stage = document.getElementById('chip-stage');
    const board = document.getElementById('home-board') || stage;
    const intro = document.getElementById('home-intro');
    const core = document.getElementById('chip-core');
    const svg = document.getElementById('routing-layer');
    const status = document.getElementById('route-status');
    let motion = !reduced.matches;
    let frame = 0;
    let lastTime = 0;
    let routes = [];
    let selected = null;
    let hovered = null;
    let navigationTimer = 0;
    let leavingHref = null;
    const prefetched = new Set();
    const NS = 'http://www.w3.org/2000/svg';
    // Intro sequence state. 'pending' keeps the homepage hidden until fonts
    // settle, 'running' while the chip powers up, 'done' afterwards.
    let introState = 'idle';
    let introAnimations = [];
    let introNodes = [];
    let introTimer = 0;
    let revealObserver = null;
    let packets = [];
    let nextPacketAt = performance.now() + 1200;
    let idle = false;
    let lastActivity = performance.now();
    let dividerTimer = 0;
    let lastLayoutKey = '';
    const root = document.documentElement;
    root.classList.add('motion-ready');
    if (reduced.matches) root.classList.remove('motion', 'intro-pending');

    function node(name, attributes = {}) {
      const element = document.createElementNS(NS, name);
      Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
      return element;
    }
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    // A via: plated ring with a drill hole, used where traces terminate.
    function via(point, className, ring, drill) {
      const group = node('g', { class: className, transform: `translate(${point.x} ${point.y})` });
      group.append(node('circle', { r: ring, class: 'via-ring' }), node('circle', { r: drill, class: 'via-drill' }));
      return group;
    }

    on(reduced, 'change', (event) => {
      motion = !event.matches;
      sync();
      if (event.matches) endIntro();
      if (event.matches) activeTransition?.skipTransition();
      if (event.matches) activeAnimation?.finish();
      if (event.matches && selected) completeNavigation();
      if (event.matches && leavingHref && navigationTimer) {
        clearTimeout(navigationTimer);
        window.location.assign(leavingHref);
      }
    });

    function navigate(href) {
      if (leavingHref) return;
      leavingHref = href;
      if (softNavigation) { changePage(href); return; }
      if (reduced.matches) { window.location.assign(href); return; }
      // Direct navigation is a fallback for file previews or fetch failures.
      if (nativeTransitions) { window.location.assign(href); return; }
      document.body.classList.add('is-leaving');
      navigationTimer = window.setTimeout(() => {
        navigationTimer = 0;
        window.location.assign(href);
      }, 180);
    }

    function pageDestination(link) {
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return null;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || !['http:', 'https:', 'file:'].includes(destination.protocol)) return null;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return null;
      if (/\.[^/]+$/.test(destination.pathname) && !destination.pathname.endsWith('.html')) return null;
      return destination;
    }

    function prefetchPage(destination) {
      if (!destination || !['http:', 'https:'].includes(destination.protocol) || prefetched.has(destination.href)) return;
      prefetched.add(destination.href);
      if (softNavigation) { loadPage(destination.href).catch(() => {}); return; }
      const preload = document.createElement('link');
      preload.rel = 'prefetch';
      preload.as = 'document';
      preload.href = destination.href;
      document.head.append(preload);
    }
    const warmLink = (event) => prefetchPage(pageDestination(event.target.closest?.('a[href]')));
    on(document, 'pointerover', warmLink);
    on(document, 'focusin', warmLink);

    // Internal links swap page content without reloading the document.
    // Downloads, email, anchors, and new tabs retain browser behavior.
    on(document, 'click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (reduced.matches && !softNavigation)) return;
      const destination = pageDestination(event.target.closest?.('a[href]'));
      if (!destination) return;
      event.preventDefault();
      prefetchPage(destination);
      // A homepage route already owns the transition while its pulse runs.
      if (!selected) navigate(destination.href);
    });

    // Rounded right-angle routes are calculated from the actual chip and label
    // bounds, so the same connections follow the responsive layout.
    function roundedPath(points) {
      let path = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length - 1; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        const c = points[i + 1];
        const before = Math.hypot(b.x - a.x, b.y - a.y);
        const after = Math.hypot(c.x - b.x, c.y - b.y);
        // 45-degree chamfers, as PCB routing uses, rather than rounded bends.
        const radius = Math.min(11, before / 2, after / 2);
        const entry = { x: b.x - (b.x - a.x) / (before || 1) * radius,
          y: b.y - (b.y - a.y) / (before || 1) * radius };
        const exit = { x: b.x + (c.x - b.x) / (after || 1) * radius,
          y: b.y + (c.y - b.y) / (after || 1) * radius };
        path += ` L ${entry.x} ${entry.y} L ${exit.x} ${exit.y}`;
      }
      const end = points[points.length - 1];
      return `${path} L ${end.x} ${end.y}`;
    }

    // Centers of the painted pins in a pin bank, along its long axis, in board
    // coordinates. Pin spacing comes from the same CSS variables that draw it.
    function pinCenters(bank, bounds, alongX) {
      if (!bank) return [];
      const style = window.getComputedStyle(bank);
      const pitch = parseFloat(style.getPropertyValue('--pin-pitch'));
      const start = parseFloat(style.getPropertyValue('--pin-start'));
      const end = parseFloat(style.getPropertyValue('--pin-end'));
      if (!Number.isFinite(pitch) || pitch <= 0 || !Number.isFinite(start) || !Number.isFinite(end)) return [];
      const rect = bank.getBoundingClientRect();
      const length = alongX ? rect.width : rect.height;
      const origin = alongX ? rect.left - bounds.left : rect.top - bounds.top;
      const centers = [];
      for (let offset = (start + end) / 2; offset + (end - start) / 2 <= length; offset += pitch) centers.push(origin + offset);
      return centers;
    }
    // Each trace takes the free pin nearest to where it would like to leave.
    let usedPins = new Map();
    function claimPin(key, centers, wanted) {
      const used = usedPins.get(key) || new Set();
      usedPins.set(key, used);
      const pick = [...centers].sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted)).find((pin) => !used.has(pin));
      if (pick === undefined) return wanted;
      used.add(pick);
      return pick;
    }

    function geometry(link) {
      const bounds = board.getBoundingClientRect();
      const chip = core.getBoundingClientRect();
      const label = link.getBoundingClientRect();
      const center = { x: chip.left + chip.width / 2 - bounds.left,
        y: chip.top + chip.height / 2 - bounds.top };
      const target = { x: label.left + label.width / 2 - bounds.left,
        y: label.top + label.height / 2 - bounds.top };
      const dx = target.x - center.x;
      const dy = target.y - center.y;
      let start;
      let end;
      let points;
      let pin;
      if (Math.abs(dx) / chip.width > Math.abs(dy) / chip.height) {
        const side = dx < 0 ? -1 : 1;
        const bank = core.querySelector(side < 0 ? '.pins-left' : '.pins-right');
        const tip = bank?.getBoundingClientRect();
        const wanted = center.y + clamp(dy * .32, -chip.height / 2 + 32, chip.height / 2 - 32);
        start = { x: tip ? (side < 0 ? tip.left : tip.right) - bounds.left : center.x + side * (chip.width / 2 + 9),
          y: claimPin(side < 0 ? 'left' : 'right', pinCenters(bank, bounds, false), wanted) };
        end = { x: (side < 0 ? label.right + 11 : label.left - 11) - bounds.left, y: target.y };
        pin = { x1: start.x, y1: start.y, x2: start.x - side * 6, y2: start.y };
        const elbow = (start.x + end.x) / 2;
        points = [start, { x: elbow, y: start.y }, { x: elbow, y: end.y }, end];
      } else {
        const side = dy < 0 ? -1 : 1;
        const bank = core.querySelector(side < 0 ? '.pins-top' : '.pins-bottom');
        const tip = bank?.getBoundingClientRect();
        const wanted = center.x + clamp(dx * .35, -chip.width / 2 + 30, chip.width / 2 - 30);
        start = { x: claimPin(side < 0 ? 'top' : 'bottom', pinCenters(bank, bounds, true), wanted),
          y: tip ? (side < 0 ? tip.top : tip.bottom) - bounds.top : center.y + side * (chip.height / 2 + 9) };
        end = { x: target.x, y: (side < 0 ? label.bottom + 11 : label.top - 11) - bounds.top };
        pin = { x1: start.x, y1: start.y, x2: start.x, y2: start.y - side * 6 };
        const elbow = (start.y + end.y) / 2;
        points = [start, { x: start.x, y: elbow }, { x: end.x, y: elbow }, end];
      }
      return { d: roundedPath(points), end, pin };
    }

    // The two frame traces start at the centers of painted bottom pins.
    // Pin spacing comes from the same CSS values that draw the pin bank.
    function buildIntroTraces(bounds) {
      const frameLines = document.getElementById('intro-traces');
      const cutouts = document.getElementById('trace-cutouts');
      const mask = document.getElementById('trace-clearance');
      const maskBase = document.getElementById('trace-mask-base');
      const bottomPins = core.querySelector('.pins-bottom');
      if (!intro || !bottomPins || !frameLines || !cutouts || !mask || !maskBase) return;
      frameLines.replaceChildren();
      cutouts.replaceChildren();
      [mask, maskBase].forEach((element) => {
        element.setAttribute('x', '0');
        element.setAttribute('y', '0');
        element.setAttribute('width', String(bounds.width));
        element.setAttribute('height', String(bounds.height));
      });
      const relative = (element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left - bounds.left, top: rect.top - bounds.top,
          right: rect.right - bounds.left, bottom: rect.bottom - bounds.top,
          width: rect.width, height: rect.height };
      };
      [core, intro, ...stage.querySelectorAll('[data-route]')].filter(Boolean).forEach((element) => {
        const rect = relative(element);
        const gap = element === intro ? 0 : 7;
        cutouts.append(node('rect', { x: rect.left - gap, y: rect.top - gap,
          width: rect.width + gap * 2, height: rect.height + gap * 2, rx: 3 }));
      });
      const chip = relative(core);
      const pins = relative(bottomPins);
      const copy = relative(intro);
      const centerX = chip.left + chip.width / 2;
      const bottomCenters = pinCenters(bottomPins, bounds, true);
      if (bottomCenters.length < 2) return;
      const copyCenterX = copy.left + copy.width / 2;
      [-1, 1].forEach((side) => {
        const targetX = centerX + side * chip.width * .24;
        const x = claimPin('bottom', bottomCenters, targetX);
        const elbowY = copy.top - 12;
        const edgeX = side < 0 ? copy.left - 12 : copy.right + 12;
        const bottomY = copy.bottom + 12;
        const points = [{ x, y: pins.bottom - .5 }, { x, y: elbowY },
          { x: edgeX, y: elbowY }, { x: edgeX, y: bottomY },
          { x: copyCenterX + side * 24, y: bottomY }];
        frameLines.append(node('path', { d: roundedPath(points), class: 'intro-trace' }));
        const endpoint = points[points.length - 1];
        frameLines.append(via(endpoint, 'intro-terminal', 2.6, .9));
      });
    }

    function rebuild() {
      if (!stage || !core || !svg) return;
      // Layout sizes (unaffected by the intro's transforms) decide whether
      // anything really moved. Mid-intro, an unchanged layout keeps the
      // traces already drawn; a real change finishes the intro first so
      // nothing is measured while scaled or offset.
      const layoutKey = [board, stage, core, intro].map((element) =>
        element ? `${element.offsetWidth}x${element.offsetHeight}` : '').join('|');
      if (introState === 'running') {
        if (layoutKey === lastLayoutKey) return;
        endIntro();
      }
      const bounds = board.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      lastLayoutKey = layoutKey;
      svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
      usedPins = new Map();
      buildIntroTraces(bounds);
      const lines = document.getElementById('route-lines');
      const dots = document.getElementById('ambient-signals');
      lines.replaceChildren();
      dots.replaceChildren();
      packets = [];
      routes = [...stage.querySelectorAll('[data-route]')].map((link) => {
        const { d, end, pin } = geometry(link);
        const key = link.dataset.route;
        // A wider, darker outline under each trace, like copper under solder mask.
        const outline = node('path', { d, class: 'route-mask' });
        const path = node('path', { d, class: 'route-line' });
        if (hovered === key) path.classList.add('is-hovered');
        if (selected?.key === key) path.classList.add('is-selected');
        lines.append(outline, path, via(end, 'route-via', 3.6, 1.3));
        const length = path.getTotalLength();
        return { key, link, path, d, length, end, pin };
      });
      render(performance.now(), 0);
      sync();
    }

    if (stage && core && svg && intro && motion) {
      splitName();
      introState = 'pending';
      root.classList.add('intro-pending');
    }

    let trail;
    let leadingDot;
    if (stage && core && svg) {
      trail = node('path', { class: 'selected-trail', opacity: 0 });
      leadingDot = node('circle', { class: 'selected-dot', r: 2.7, opacity: 0 });
      document.getElementById('active-signal').append(trail, leadingDot);
      stage.querySelectorAll('[data-route]').forEach((link) => {
        const hover = (on) => {
          hovered = on ? link.dataset.route : null;
          routes.forEach((route) => route.path.classList.toggle('is-hovered', route.key === hovered));
        };
        on(link, 'pointerenter', () => hover(true));
        on(link, 'pointerleave', () => hover(false));
        on(link, 'focus', () => hover(true));
        on(link, 'blur', () => hover(false));
        on(link, 'click', (event) => {
          // Preserve normal link behavior for modifiers, new tabs, and reduced
          // motion. Only ordinary navigation waits for the trace signal.
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          if (reduced.matches || !motion || !routes.length) return;
          event.preventDefault();
          if (selected || leavingHref) return;
          prefetchPage(pageDestination(link));
          const route = routes.find((item) => item.key === link.dataset.route);
          if (!route) { window.location.assign(link.href); return; }
          selected = { key: route.key, href: link.href, start: performance.now(),
            duration: 620 + Math.min(140, route.length * .15) };
          link.classList.add('is-selected');
          stage.classList.add('is-routing');
          route.path.classList.add('is-selected');
          stage.setAttribute('aria-busy', 'true');
          if (status) status.textContent = `Opening ${link.querySelector('strong').firstChild.textContent.trim()}.`;
          sync();
        });
      });
      const queueResize = () => {
        if (destroyed) return;
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(rebuild);
      };
      if ('ResizeObserver' in window) {
        observer = new ResizeObserver(queueResize);
        observer.observe(board);
        if (board !== stage) observer.observe(stage);
        if (intro) observer.observe(intro);
      } else on(window, 'resize', queueResize, { passive: true });
      document.fonts?.ready.then(queueResize);
      rebuild();
    }

    function completeNavigation() {
      if (!selected) return;
      const { href, key } = selected;
      selected = null;
      cancelAnimationFrame(frame);
      frame = 0;
      const route = routes.find((item) => item.key === key);
      // With view transitions available, the new page ripples out of the via.
      const via = route?.path.nextElementSibling?.getBoundingClientRect();
      if (motion && softNavigation && via && typeof document.startViewTransition === 'function') {
        leavingHref = href;
        changePage(href, { reveal: { x: via.left + via.width / 2, y: via.top + via.height / 2 } });
      } else navigate(href);
    }

    // ---------- Ambient bus traffic ----------
    // Data moves in short packets: a request leaves the chip on one trace and,
    // a moment later, a reply comes back on another. Pins flash as packets
    // leave or arrive; vias ripple when a request reaches them.
    function flashPin(route) {
      const signals = document.getElementById('active-signal');
      if (!route.pin || !signals) return;
      const flash = node('line', { ...route.pin, class: 'pin-flash' });
      signals.append(flash);
      flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, easing: 'ease-out' }).finished
        .then(() => flash.remove(), () => flash.remove());
    }
    function flashVia(route) {
      const signals = document.getElementById('active-signal');
      if (!signals) return;
      const ring = node('circle', { cx: route.end.x, cy: route.end.y, r: 3.6, class: 'via-flash' });
      signals.append(ring);
      ring.animate([{ opacity: .9, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(2.6)' }],
        { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' }).finished.then(() => ring.remove(), () => ring.remove());
    }
    function sendPacket(route, inbound, startAt, count = 3) {
      const layer = document.getElementById('ambient-signals');
      const dots = Array.from({ length: count }, (_, index) => {
        const dot = node('circle', { r: index ? 1.3 : 1.7, class: `ambient-dot packet-dot${index ? ' trail' : ''}`, opacity: 0 });
        layer?.append(dot);
        return dot;
      });
      packets.push({ route, inbound, startAt, dots, speed: 230, gap: 8, started: false });
    }
    function startTransaction(now) {
      const out = routes[Math.floor(Math.random() * routes.length)];
      const others = routes.filter((route) => route !== out);
      const back = others[Math.floor(Math.random() * others.length)];
      sendPacket(out, false, now);
      if (back) sendPacket(back, true, now + out.length / 230 * 1000 + 260 + Math.random() * 380);
    }
    function moveTraffic(timestamp) {
      const quiet = selected || idle || introState === 'running' || introState === 'pending';
      if (!quiet && routes.length && timestamp >= nextPacketAt) {
        startTransaction(timestamp);
        nextPacketAt = timestamp + 1700 + Math.random() * 2300;
      }
      packets = packets.filter((packet) => {
        const { route, dots, gap } = packet;
        if (timestamp < packet.startAt) return true;
        if (!packet.started) {
          packet.started = true;
          if (!packet.inbound) flashPin(route);
        }
        const travelled = (timestamp - packet.startAt) / 1000 * packet.speed;
        if (travelled > route.length + gap * (dots.length - 1)) {
          if (packet.inbound) flashPin(route); else flashVia(route);
          dots.forEach((dot) => dot.remove());
          return false;
        }
        dots.forEach((dot, index) => {
          const along = travelled - index * gap;
          if (along < 0 || along > route.length) { dot.setAttribute('opacity', '0'); return; }
          const point = route.path.getPointAtLength(packet.inbound ? route.length - along : along);
          dot.setAttribute('cx', point.x);
          dot.setAttribute('cy', point.y);
          dot.setAttribute('opacity', index ? (index === 1 ? '.6' : '.3') : '1');
        });
        return true;
      });
    }

    function render(timestamp, delta) {
      if (motion) moveTraffic(timestamp);
      if (!selected) {
        trail?.setAttribute('opacity', '0');
        leadingDot?.setAttribute('opacity', '0');
        return;
      }
      const route = routes.find((item) => item.key === selected.key);
      if (!route) { completeNavigation(); return; }
      const progress = clamp((timestamp - selected.start) / selected.duration, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      const distance = eased * route.length;
      const point = route.path.getPointAtLength(distance);
      trail.setAttribute('d', route.d);
      trail.setAttribute('stroke-dasharray', `30 ${route.length + 30}`);
      trail.setAttribute('stroke-dashoffset', String(30 - distance));
      trail.setAttribute('opacity', '1');
      leadingDot.setAttribute('cx', point.x);
      leadingDot.setAttribute('cy', point.y);
      leadingDot.setAttribute('opacity', '1');
      if (progress >= 1) completeNavigation();
    }
    function tick(timestamp) {
      frame = 0;
      const delta = lastTime ? Math.min(.1, (timestamp - lastTime) / 1000) : 0;
      lastTime = timestamp;
      if (!idle && !selected && timestamp - lastActivity > 20000) sleep();
      render(timestamp, delta);
      // Asleep with nothing in flight, the loop stops entirely until woken.
      const running = selected || (motion && !(idle && !packets.length));
      if (running && !document.hidden && routes.length) frame = requestAnimationFrame(tick);
    }

    // ---------- Low-power mode ----------
    // After 20s without input the chip clock-gates: traffic stops and the
    // traces dim. Any input wakes it with a burst on every trace.
    function sleep() {
      idle = true;
      board?.classList.add('is-idle');
    }
    function wake() {
      idle = false;
      board?.classList.remove('is-idle');
      const now = performance.now();
      routes.forEach((route, index) => sendPacket(route, false, now + index * 70, 2));
      nextPacketAt = now + 2600;
      sync();
    }
    function sync() {
      if (destroyed) return;
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      if (!routes.length) return;
      render(performance.now(), 0);
      if ((motion || selected) && !document.hidden) frame = requestAnimationFrame(tick);
    }
    on(document, 'visibilitychange', sync);
    on(window, 'pageshow', () => {
      clearTimeout(navigationTimer);
      leavingHref = null;
      document.body.classList.remove('is-leaving');
      selected = null;
      stage?.classList.remove('is-routing');
      stage?.removeAttribute('aria-busy');
      routes.forEach((route) => {
        route.link.classList.remove('is-selected');
        route.path.classList.remove('is-selected');
      });
      if (status) status.textContent = '';
      sync();
    });
    // ---------- Homepage intro: chip powers up, traces branch outward ----------
    function splitName() {
      const heading = core?.querySelector('h1');
      if (!heading || heading.dataset.split) return;
      heading.dataset.split = 'true';
      const lines = [...heading.childNodes].filter((child) => child.nodeType === 3 && child.textContent.trim());
      heading.setAttribute('aria-label', lines.map((line) => line.textContent.trim()).join(' '));
      lines.forEach((child) => {
        const line = document.createElement('span');
        line.className = 'name-line';
        line.setAttribute('aria-hidden', 'true');
        [...child.textContent.trim()].forEach((character) => {
          const letter = document.createElement('span');
          letter.className = 'name-char';
          letter.textContent = character;
          line.append(letter);
        });
        child.replaceWith(line);
      });
      heading.querySelectorAll('br').forEach((lineBreak) => lineBreak.remove());
    }

    function endIntro() {
      clearTimeout(introTimer);
      introTimer = 0;
      introAnimations.forEach((animation) => animation.cancel());
      introAnimations = [];
      introNodes.forEach((element) => element.remove());
      introNodes = [];
      board?.classList.remove('is-intro');
      root.classList.remove('intro-pending');
      if (introState !== 'idle') introState = 'done';
    }

    function playIntro(quick) {
      if (!core || !routes.length || typeof core.animate !== 'function') { endIntro(); return; }
      introState = 'running';
      const k = quick ? .5 : 1;
      const easeOut = 'cubic-bezier(.16,1,.3,1)';
      const easeInOut = 'cubic-bezier(.65,0,.35,1)';
      const play = (element, frames, delay, duration, options = {}) => {
        if (!element?.animate) return;
        introAnimations.push(element.animate(frames, { delay: delay * k, duration: duration * k,
          easing: easeOut, fill: 'backwards', ...options }));
      };
      const draw = (path, length) => [
        { strokeDasharray: `${length} ${length}`, strokeDashoffset: length },
        { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 }];
      const unblur = (from) => [{ opacity: 0, filter: 'blur(8px)', ...from },
        { opacity: 1, filter: 'blur(0px)', translate: '0 0', scale: '1' }];

      board.classList.add('is-intro');
      root.classList.remove('intro-pending');

      // 1. The die appears, then the name resolves letter by letter.
      play(core, unblur({ scale: '.94', filter: 'blur(12px)' }), 0, 900);
      core.querySelectorAll('.name-char').forEach((letter, index) => {
        play(letter, unblur({ translate: '0 .35em' }), 180 + index * 36, 700);
      });
      core.querySelectorAll('.pin-bank').forEach((bank) => {
        const horizontal = bank.matches('.pins-top, .pins-bottom');
        play(bank, [{ opacity: 0, scale: horizontal ? '0 1' : '1 0' }, { opacity: 1, scale: '1 1' }], 420, 650);
      });
      play(core, [{ borderColor: '#292929' }, { borderColor: '#4c9cff', offset: .3 }, { borderColor: '#292929' }],
        600, 1300, { easing: 'ease-out', fill: 'none' });

      // 2. Each trace draws out from the chip with a signal riding its front,
      //    middle routes first, then the outer pairs. Labels land as it arrives.
      const chip = core.getBoundingClientRect();
      const cx = chip.left + chip.width / 2;
      const cy = chip.top + chip.height / 2;
      const signalLayer = document.getElementById('active-signal');
      const ordered = routes.map((route) => {
        const box = route.link.getBoundingClientRect();
        return { route, dx: box.left + box.width / 2 - cx, dy: box.top + box.height / 2 - cy };
      }).sort((a, b) => Math.abs(a.dy) - Math.abs(b.dy) || a.dx - b.dx);
      let routesEnd = 0;
      ordered.forEach(({ route, dx, dy }, index) => {
        const start = 640 + Math.floor(index / 2) * 150 + (index % 2) * 40;
        const duration = 720;
        const length = route.length;
        routesEnd = Math.max(routesEnd, start + duration);
        play(route.path, draw(route.path, length), start, duration, { easing: easeInOut });
        play(route.path.previousElementSibling, draw(route.path, length), start, duration, { easing: easeInOut });
        play(route.path.nextElementSibling, [{ opacity: 0 }, { opacity: 1 }], start + duration * .85, 300);
        if (signalLayer) {
          const pulse = node('path', { d: route.d, class: 'intro-pulse' });
          signalLayer.append(pulse);
          introNodes.push(pulse);
          const dash = `28 ${length + 28}`;
          play(pulse, [{ strokeDasharray: dash, strokeDashoffset: 28 },
            { strokeDasharray: dash, strokeDashoffset: 28 - length }], start, duration, { easing: easeInOut, fill: 'both' });
          play(pulse, [{ opacity: 1 }, { opacity: 0 }], start + duration, 420, { fill: 'forwards' });
        }
        const distance = Math.hypot(dx, dy) || 1;
        play(route.link, unblur({ translate: `${-dx / distance * 18}px ${-dy / distance * 18}px` }),
          start + duration * .62, 760);
      });

      // 3. Two frame traces drop from the bottom pins and wrap the introduction.
      const frameStart = routesEnd - 380;
      document.querySelectorAll('#intro-traces .intro-trace').forEach((path) => {
        play(path, draw(path, path.getTotalLength()), frameStart, 1000, { easing: easeInOut });
      });
      document.querySelectorAll('#intro-traces .intro-terminal').forEach((dot) => {
        play(dot, [{ opacity: 0 }, { opacity: .5 }], frameStart + 900, 300);
      });
      play(intro, unblur({ translate: '0 14px' }), frameStart + 180, 950);

      const finish = Math.max(...introAnimations.map((animation) => animation.effect.getComputedTiming().endTime || 0));
      introTimer = window.setTimeout(endIntro, finish + 40);
    }

    if (introState === 'pending') {
      let seen = false;
      try {
        seen = window.sessionStorage.getItem('chip-intro-seen') === '1';
        window.sessionStorage.setItem('chip-intro-seen', '1');
      } catch {}
      const fontsSettled = Promise.race([document.fonts?.ready || Promise.resolve(),
        new Promise((resolve) => window.setTimeout(resolve, 1200))]);
      fontsSettled.then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!destroyed && introState === 'pending') playIntro(seen);
      })));
      // Clicking or pressing a key during the intro skips straight to the end.
      const skip = () => { if (introState === 'running') endIntro(); };
      on(board, 'pointerdown', skip);
      on(document, 'keydown', skip);
    }

    // ---------- Content pages: text rises into place as it enters view ----------
    function splitWords(heading) {
      if (heading.dataset.split) return;
      heading.dataset.split = 'true';
      let index = 0;
      const walk = (parent) => [...parent.childNodes].forEach((child) => {
        if (child.nodeType === 1) { walk(child); return; }
        if (child.nodeType !== 3) return;
        const fragment = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { fragment.append(part); return; }
          const mask = document.createElement('span');
          const word = document.createElement('span');
          mask.className = 'w';
          word.textContent = part;
          word.style.setProperty('--wi', String(index));
          index += 1;
          mask.append(word);
          fragment.append(mask);
        });
        child.replaceWith(fragment);
      });
      walk(heading);
    }

    // ---------- Activity (wakes the chip from low-power mode) ----------
    if (stage && motion) {
      const activity = () => {
        lastActivity = performance.now();
        if (idle) wake();
      };
      ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((type) =>
        on(window, type, activity, { passive: true }));
    }
    // ---------- Content pages: pulses along the divider lines ----------
    const dividers = [...document.querySelectorAll('.detail-nav, .project-card, .experience-row, .skills-row,' +
      ' .project-facts, .career-copy, .case-next, .detail-footer')];
    if (dividers.length && motion && document.body.animate) {
      const pulse = () => {
        dividerTimer = window.setTimeout(pulse, 3200 + Math.random() * 3200);
        if (document.hidden) return;
        const visible = dividers.filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 200;
        });
        const line = visible[Math.floor(Math.random() * visible.length)];
        if (!line) return;
        const style = window.getComputedStyle(line);
        const edge = parseFloat(style.borderTopWidth) > 0 ? 'top' : (parseFloat(style.borderBottomWidth) > 0 ? 'bottom' : null);
        if (!edge) return;
        if (style.position === 'static') line.style.position = 'relative';
        const spark = document.createElement('span');
        spark.className = 'divider-pulse';
        spark.setAttribute('aria-hidden', 'true');
        spark.style[edge] = '-1px';
        line.append(spark);
        const travel = Math.max(0, line.clientWidth - 140);
        spark.animate([{ transform: 'translateX(0)', opacity: 0 }, { opacity: 1, offset: .15 },
          { opacity: 1, offset: .8 }, { transform: `translateX(${travel}px)`, opacity: 0 }],
          { duration: 1500 + travel * .9, easing: 'cubic-bezier(.45,0,.25,1)' }).finished
          .then(() => spark.remove(), () => spark.remove());
      };
      dividerTimer = window.setTimeout(pulse, 1800);
    }

    // Menu underline: a real element shared across pages, so the page
    // transition slides it to the new item instead of fading it.
    const menu = document.querySelector('.detail-nav');
    const currentItem = menu?.querySelector('a[aria-current]');
    if (menu && currentItem) {
      const indicator = document.createElement('span');
      indicator.className = 'nav-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      menu.append(indicator);
      menu.classList.add('has-indicator');
      const place = () => {
        const items = [...menu.querySelectorAll('a')];
        const wrapped = items.some((item) => item.offsetTop !== items[0].offsetTop);
        indicator.style.left = `${currentItem.offsetLeft}px`;
        indicator.style.width = `${currentItem.offsetWidth}px`;
        indicator.style.top = `${wrapped ? currentItem.offsetTop + currentItem.offsetHeight + 5 : menu.clientHeight - 1}px`;
        indicator.style.height = wrapped ? '1px' : '2px';
      };
      place();
      on(window, 'resize', place, { passive: true });
      document.fonts?.ready.then(() => { if (!destroyed) place(); });
    }

    const shell = document.querySelector('.detail-page .content-shell');
    if (shell && motion && 'IntersectionObserver' in window) {
      const targets = [...shell.querySelectorAll([
        '.back-link', '.section-heading', '.project-heading > *', '.project-facts > div', '.project-figure',
        '.case-copy section', '.case-next', '.project-card', '.experience-row', '.about-statement > *',
        '.about-copy > p', '.skills-heading', '.skill-groups > div', '.career-copy', '.resume-heading',
        '.resume-preview', '.contact-section > *'].join(','))];
      shell.querySelectorAll('h1').forEach(splitWords);
      targets.forEach((target) => target.classList.add('reveal'));
      revealObserver = new IntersectionObserver((entries) => {
        entries.filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
          .forEach((entry, index) => {
            entry.target.style.setProperty('--d', `${Math.min(index * 85, 680)}ms`);
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          });
      }, { rootMargin: '0px 0px -6% 0px' });
      targets.forEach((target) => {
        if (revealInstantly && target.getBoundingClientRect().top < window.innerHeight) {
          target.classList.add('is-visible', 'instant');
        } else revealObserver.observe(target);
      });
    }

    // ---------- Project images: tool-window frame opens a zoom view ----------
    const figures = [...document.querySelectorAll('.project-image-frame img')];
    let viewer = null;
    if (figures.length && typeof HTMLDialogElement === 'function') {
      viewer = document.createElement('dialog');
      viewer.className = 'image-viewer';
      viewer.setAttribute('aria-label', 'Image viewer');
      viewer.innerHTML = '<div class="viewer-bar"><span class="viewer-name"></span>' +
        '<button type="button" class="viewer-close" aria-label="Close image">Close <span aria-hidden="true">✕</span></button></div>' +
        '<img class="viewer-image" alt="">';
      document.body.append(viewer);
      const close = () => viewer.close();
      on(viewer.querySelector('.viewer-close'), 'click', close);
      // Clicking the dimmed backdrop (outside the window) closes it.
      on(viewer, 'click', (event) => { if (event.target === viewer) close(); });
      figures.forEach((image) => {
        image.tabIndex = 0;
        image.setAttribute('role', 'button');
        image.setAttribute('aria-label', `Enlarge image: ${image.alt}`);
        const open = () => {
          const big = viewer.querySelector('.viewer-image');
          big.src = image.currentSrc || image.src;
          big.alt = image.alt;
          viewer.querySelector('.viewer-name').textContent =
            image.closest('.project-image-frame')?.querySelector('.window-name')?.textContent || '';
          viewer.showModal();
        };
        on(image, 'click', open);
        on(image, 'keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
        });
      });
    }

    sync();
    return () => {
      destroyed = true;
      clearTimeout(dividerTimer);
      if (viewer?.open) viewer.close();
      endIntro();
      revealObserver?.disconnect();
      listeners.forEach((remove) => remove());
      observer?.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(resizeFrame);
      clearTimeout(navigationTimer);
    };
  }
  const boot = () => { disposePage = init(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
