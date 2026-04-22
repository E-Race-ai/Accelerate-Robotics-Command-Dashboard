/* ═══════════════════════════════════════════════════════
   brand.js — Accelerate Robotics Shared Animations
   Import via: <script src="/js/brand.js"></script>
   ═══════════════════════════════════════════════════════ */

/**
 * Animate a number from 0 to target with easing.
 * @param {HTMLElement} el — element whose textContent gets updated
 * @param {number} target — final number
 * @param {string} prefix — e.g. '$'
 * @param {string} suffix — e.g. 'M' or 'K'
 * @param {number} duration — ms, default 1800
 */
function animateCounter(el, target, prefix, suffix, duration) {
  prefix = prefix || '';
  suffix = suffix || '';
  duration = duration || 1800;
  var start = performance.now();
  function update(now) {
    var t = Math.min((now - start) / duration, 1);
    /* WHY: Cubic ease-out for natural deceleration */
    var ease = 1 - Math.pow(1 - t, 3);
    var val = target * ease;
    if (suffix === 'M' || suffix === 'B') {
      el.textContent = prefix + val.toFixed(1) + suffix;
    } else if (suffix === 'K') {
      el.textContent = prefix + Math.round(val).toLocaleString() + suffix;
    } else {
      el.textContent = prefix + Math.round(val).toLocaleString();
    }
    if (t < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

/**
 * Initialize all counters on the page.
 * Finds elements with [data-counter] and animates them.
 * Usage: <span class="brand-stat-val" data-counter="9">0</span>
 *        <span class="brand-stat-val" data-counter="2.4" data-prefix="$" data-suffix="M">$0</span>
 */
function initCounters() {
  document.querySelectorAll('[data-counter]').forEach(function(el) {
    var target = parseFloat(el.getAttribute('data-counter'));
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    animateCounter(el, target, prefix, suffix);
  });
}

/**
 * Fire a confetti burst from a canvas element.
 * @param {HTMLCanvasElement} canvas
 */
function fireConfetti(canvas) {
  var ctx = canvas.getContext('2d');
  var parent = canvas.parentElement;
  canvas.width = parent.offsetWidth;
  canvas.height = parent.offsetHeight;

  /* WHY: Brand colors for on-brand celebration */
  var colors = ['#0055ff', '#00c8ff', '#7c3aed', '#06b6d4', '#f59e0b', '#22c55e', '#ec4899', '#ff6b6b'];
  var particles = [];

  for (var i = 0; i < 80; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.7) * 14,
      w: Math.random() * 8 + 4,
      h: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 12,
      /* WHY: Slight gravity variance makes the burst feel organic */
      gravity: 0.25 + Math.random() * 0.15,
      life: 1
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var alive = false;
    for (var j = 0; j < particles.length; j++) {
      var p = particles[j];
      if (p.life <= 0) continue;
      alive = true;
      p.x += p.vx;
      p.vy += p.gravity;
      p.y += p.vy;
      p.vx *= 0.98;
      p.rotation += p.rotSpeed;
      p.life -= 0.012;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(draw);
  }
  draw();
}

/**
 * Set up IntersectionObserver for staggered reveal animations.
 * Elements with class 'brand-reveal' get animation-delay based on data-delay attribute.
 * Call once on DOMContentLoaded.
 */
function initRevealAnimations() {
  document.querySelectorAll('.brand-reveal').forEach(function(el) {
    var delay = el.getAttribute('data-delay') || '0';
    el.style.animationDelay = delay + 's';
  });
}

/**
 * Set the active nav link based on current page path.
 * Matches href against window.location.pathname.
 */
function initActiveNavLink() {
  var path = window.location.pathname;
  document.querySelectorAll('.brand-nav-links a').forEach(function(a) {
    var href = a.getAttribute('href');
    if (href && path.indexOf(href) !== -1) {
      a.classList.add('active');
    }
  });
}

/* Auto-initialize on DOM ready */
document.addEventListener('DOMContentLoaded', function() {
  initRevealAnimations();
  initActiveNavLink();
  /* WHY: 400ms delay lets the reveal animations settle before counters start rolling */
  setTimeout(initCounters, 400);
});
