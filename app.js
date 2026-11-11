(() => {
  'use strict';

  function init() {
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
    const NS = 'http://www.w3.org/2000/svg';

    function node(name, attributes = {}) {
      const element = document.createElementNS(NS, name);
      Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
      return element;
    }
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    reduced.addEventListener?.('change', (event) => {
      motion = !event.matches;
      sync();
      if (event.matches && selected) completeNavigation();
      if (event.matches && leavingHref) {
        clearTimeout(navigationTimer);
        window.location.assign(leavingHref);
      }
    });

    function navigate(href) {
      if (leavingHref) return;
      if (reduced.matches) { window.location.assign(href); return; }
      leavingHref = href;
      document.body.classList.add('is-leaving');
      navigationTimer = window.setTimeout(() => window.location.assign(href), 180);
    }

    // Let ordinary internal links fade between pages. Downloads, email,
    // anchor links, and opening a new tab retain their browser behavior.
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || reduced.matches) return;
      const link = event.target.closest('a[href]');
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || !['http:', 'https:', 'file:'].includes(destination.protocol)) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (/\.[^/]+$/.test(destination.pathname) && !destination.pathname.endsWith('.html')) return;
      event.preventDefault();
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
        const radius = Math.min(9, before / 2, after / 2);
        const entry = { x: b.x - (b.x - a.x) / (before || 1) * radius,
          y: b.y - (b.y - a.y) / (before || 1) * radius };
        const exit = { x: b.x + (c.x - b.x) / (after || 1) * radius,
          y: b.y + (c.y - b.y) / (after || 1) * radius };
        path += ` L ${entry.x} ${entry.y} Q ${b.x} ${b.y} ${exit.x} ${exit.y}`;
      }
      const end = points[points.length - 1];
      return `${path} L ${end.x} ${end.y}`;
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
      if (Math.abs(dx) / chip.width > Math.abs(dy) / chip.height) {
        const side = dx < 0 ? -1 : 1;
        start = { x: center.x + side * (chip.width / 2 + 9),
          y: center.y + clamp(dy * .32, -chip.height / 2 + 32, chip.height / 2 - 32) };
        end = { x: (side < 0 ? label.right + 11 : label.left - 11) - bounds.left, y: target.y };
        const elbow = (start.x + end.x) / 2;
        points = [start, { x: elbow, y: start.y }, { x: elbow, y: end.y }, end];
      } else {
        const side = dy < 0 ? -1 : 1;
        start = { x: center.x + clamp(dx * .35, -chip.width / 2 + 30, chip.width / 2 - 30),
          y: center.y + side * (chip.height / 2 + 9) };
        end = { x: target.x, y: (side < 0 ? label.bottom + 11 : label.top - 11) - bounds.top };
        const elbow = (start.y + end.y) / 2;
        points = [start, { x: start.x, y: elbow }, { x: end.x, y: elbow }, end];
      }
      return { d: roundedPath(points), end };
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
      const pinStyle = window.getComputedStyle(bottomPins);
      const pitch = parseFloat(pinStyle.getPropertyValue('--pin-pitch'));
      const start = parseFloat(pinStyle.getPropertyValue('--pin-start'));
      const end = parseFloat(pinStyle.getPropertyValue('--pin-end'));
      if (!Number.isFinite(pitch) || pitch <= 0 || !Number.isFinite(start) || !Number.isFinite(end)) return;
      const pinCenters = [];
      for (let offset = (start + end) / 2; offset + (end - start) / 2 <= pins.width; offset += pitch) {
        pinCenters.push(pins.left + offset);
      }
      if (pinCenters.length < 2) return;
      const copyCenterX = copy.left + copy.width / 2;
      [-1, 1].forEach((side) => {
        const targetX = centerX + side * chip.width * .24;
        const x = pinCenters.reduce((nearest, pin) => Math.abs(pin - targetX) < Math.abs(nearest - targetX) ? pin : nearest);
        const elbowY = copy.top - 12;
        const edgeX = side < 0 ? copy.left - 12 : copy.right + 12;
        const bottomY = copy.bottom + 12;
        const points = [{ x, y: pins.bottom - .5 }, { x, y: elbowY },
          { x: edgeX, y: elbowY }, { x: edgeX, y: bottomY },
          { x: copyCenterX + side * 24, y: bottomY }];
        frameLines.append(node('path', { d: roundedPath(points), class: 'intro-trace' }));
        const endpoint = points[points.length - 1];
        frameLines.append(node('circle', { cx: endpoint.x, cy: endpoint.y, r: 1.8, class: 'intro-terminal' }));
      });
    }

    function rebuild() {
      if (!stage || !core || !svg) return;
      const bounds = board.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
      buildIntroTraces(bounds);
      const lines = document.getElementById('route-lines');
      const dots = document.getElementById('ambient-signals');
      lines.replaceChildren();
      dots.replaceChildren();
      routes = [...stage.querySelectorAll('[data-route]')].map((link, index) => {
        const { d, end } = geometry(link);
        const key = link.dataset.route;
        const path = node('path', { d, class: 'route-line' });
        if (hovered === key) path.classList.add('is-hovered');
        if (selected?.key === key) path.classList.add('is-selected');
        const endpoint = node('circle', { cx: end.x, cy: end.y, r: 2, class: 'route-endpoint' });
        lines.append(path, endpoint);
        const dot = node('circle', { r: index % 3 === 0 ? 1.6 : 1.25,
          class: index % 3 === 0 ? 'ambient-dot blue' : 'ambient-dot' });
        dots.append(dot);
        return { key, link, path, d, length: path.getTotalLength(), dot,
          offset: .13 + index * .15, speed: 15 + index * 2 };
      });
      render(performance.now(), 0);
      sync();
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
        link.addEventListener('pointerenter', () => hover(true));
        link.addEventListener('pointerleave', () => hover(false));
        link.addEventListener('focus', () => hover(true));
        link.addEventListener('blur', () => hover(false));
        link.addEventListener('click', (event) => {
          // Preserve normal link behavior for modifiers, new tabs, and reduced
          // motion. Only ordinary navigation waits for the trace signal.
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          if (reduced.matches || !motion || !routes.length) return;
          event.preventDefault();
          if (selected) return;
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
      let resizeFrame = 0;
      const queueResize = () => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(rebuild);
      };
      if ('ResizeObserver' in window) {
        const observer = new ResizeObserver(queueResize);
        observer.observe(board);
        if (board !== stage) observer.observe(stage);
        if (intro) observer.observe(intro);
      } else window.addEventListener('resize', queueResize, { passive: true });
      document.fonts?.ready.then(queueResize);
      rebuild();
    }

    function completeNavigation() {
      if (!selected) return;
      const href = selected.href;
      selected = null;
      cancelAnimationFrame(frame);
      frame = 0;
      navigate(href);
    }
    function render(timestamp, delta) {
      routes.forEach((route) => {
        const advance = motion ? delta * route.speed / (route.length || 1) : 0;
        route.offset = (route.offset + advance) % 1;
        const point = route.path.getPointAtLength(route.offset * route.length);
        route.dot.setAttribute('cx', point.x);
        route.dot.setAttribute('cy', point.y);
        route.dot.setAttribute('opacity', selected ? '.12' : (motion ? '.7' : '0'));
      });
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
      render(timestamp, delta);
      if ((motion || selected) && !document.hidden && routes.length) frame = requestAnimationFrame(tick);
    }
    function sync() {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      if (!routes.length) return;
      render(performance.now(), 0);
      if ((motion || selected) && !document.hidden) frame = requestAnimationFrame(tick);
    }
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pageshow', () => {
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
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
