/* =========================================================
   A surprise for you  ·  script.js
   ---------------------------------------------------------
   Flow:  lock  →  envelope  →  mail  →  letter
   ========================================================= */
(() => {
  "use strict";

  /* ---------- EASY SETTINGS (edit these) ---------- */
  const CONFIG = {
    passcode: "0911",          // the 4-digit code
    hint: "MANT-SORRY",        // shown under the hearts as "Hint: ..."
    musicVolume: 0.85,         // 0 – 1
    musicFadeMs: 2500,         // fade-in time after unlocking
    toEnvelopeDelay: 1900,     // ms between "correct" and the envelope screen
    toMailDelay: 1500,         // ms between tapping the envelope and the mail screen
  };

  /* ---------- helpers ---------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const rand = (min, max) => Math.random() * (max - min) + min;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const screens = {
    lock: $("#screen-lock"),
    envelope: $("#screen-envelope"),
    mail: $("#screen-mail"),
    letter: $("#screen-letter"),
  };
  let current = screens.lock;

  /* =========================================================
     SCREEN TRANSITIONS
     ========================================================= */
  function goTo(name, origin) {
    const next = screens[name];
    if (!next || next === current) return;

    const prev = current;
    current = next;

    // letter reveals as a growing circle from the tap point
    if (origin) {
      next.style.setProperty("--cx", `${origin.x}px`);
      next.style.setProperty("--cy", `${origin.y}px`);
    }

    next.scrollTop = 0;
    next.classList.remove("is-done");
    next.classList.add("is-active");
    document.body.dataset.screen = name;

    prev.classList.remove("is-active");
    // keep the previous screen visible underneath while the circle expands
    const leaveDelay = name === "letter" ? 1300 : 0;
    setTimeout(() => prev.classList.add("is-done"), leaveDelay);
    if (name === "letter") {
      prev.style.transitionDelay = `${leaveDelay}ms`;
    }
  }

  const centerOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  /* =========================================================
     1) PASSCODE
     ========================================================= */
  const lock = screens.lock;
  const slots = $$(".slot", lock);
  const hintEl = $("#hint");
  const retryBtn = $("#retry");
  const pad = $("#pad");

  hintEl.textContent = `Hint: ${CONFIG.hint}`;

  let entry = "";
  let busy = false; // true while showing wrong / correct state

  function renderSlots() {
    slots.forEach((slot, i) => {
      const filled = i < entry.length;
      if (filled) $(".slot__digit", slot).textContent = entry[i];   // the digit stays visible
      slot.classList.toggle("is-filled", filled);
    });
  }

  function pressKey(key) {
    if (busy) return;

    if (key === "remove") {
      entry = entry.slice(0, -1);
      renderSlots();
      return;
    }

    if (key === "enter") {
      submit();
      return;
    }

    if (entry.length >= CONFIG.passcode.length) return;
    entry += key;
    renderSlots();
  }

  // ENTER: nothing typed -> little nudge; otherwise check the code
  function submit() {
    if (!entry.length) {
      slots.forEach((s) => { s.classList.remove("is-nudge"); void s.offsetWidth; s.classList.add("is-nudge"); });
      return;
    }
    busy = true;
    if (entry === CONFIG.passcode) onCorrect();
    else onWrong();
  }

  function onWrong() {
    lock.classList.add("is-wrong");
    if (navigator.vibrate) navigator.vibrate([90, 50, 90]);
    setTimeout(() => retryBtn.focus({ preventScroll: true }), 400);
  }

  function resetEntry() {
    entry = "";
    renderSlots();
    lock.classList.remove("is-wrong");
    busy = false;
  }
  retryBtn.addEventListener("click", resetEntry);

  function onCorrect() {
    lock.classList.add("is-correct");
    hintEl.textContent = "Unlocked ♥";
    startMusic();                       // allowed: we're still inside the user's tap / key press chain
    const c = centerOf(slots[1]);
    burst(c.x + slots[1].offsetWidth / 2, c.y, 34);
    $("#sound").classList.add("is-visible");
    setTimeout(() => goTo("envelope"), CONFIG.toEnvelopeDelay);
  }

  // on-screen keypad (pointerdown feels snappier than click on phones)
  pad.addEventListener("click", (e) => {
    const btn = e.target.closest(".key");
    if (btn) pressKey(btn.dataset.key);
  });

  // physical keyboard
  document.addEventListener("keydown", (e) => {
    if (current !== lock || busy) return;
    if (e.key === "Enter") {
      e.preventDefault();
      pressKey("enter");
      const btn = pad.querySelector('[data-key="enter"]');
      btn.classList.add("is-pressed"); setTimeout(() => btn.classList.remove("is-pressed"), 130);
    } else if (/^[0-9]$/.test(e.key)) {
      pressKey(e.key);
      const btn = pad.querySelector(`[data-key="${e.key}"]`);
      if (btn) { btn.classList.add("is-pressed"); setTimeout(() => btn.classList.remove("is-pressed"), 130); }
    } else if (e.key === "Backspace") {
      pressKey("remove");
    }
  });

  /* =========================================================
     2) ENVELOPE  →  3) MAIL
     ========================================================= */
  const envelope = $("#envelope");
  let opened = false;

  envelope.addEventListener("click", () => {
    if (opened) return;
    opened = true;
    envelope.classList.add("is-open");
    envelope.closest(".stage").classList.add("is-opening");
    const c = centerOf(envelope);
    setTimeout(() => burst(c.x, c.y - 30, 22), 450);
    setTimeout(() => goTo("mail"), CONFIG.toMailDelay);
  });

  /* =========================================================
     3) MAIL  →  4) LETTER
     ========================================================= */
  const attach = $("#attach");
  let revealed = false;

  attach.addEventListener("click", () => {
    if (revealed) return;
    revealed = true;
    const origin = centerOf(attach);
    goTo("letter", origin);
    setTimeout(() => burst(window.innerWidth / 2, window.innerHeight * 0.3, 40), 700);
  });

  /* =========================================================
     BACKGROUND MUSIC  (bgm.mp3, loops forever)
     ========================================================= */
  const bgm = $("#bgm");
  const soundBtn = $("#sound");
  bgm.loop = true;
  bgm.volume = 0;
  let fadeTimer = null;

  function fadeTo(target, ms = CONFIG.musicFadeMs) {
    cancelAnimationFrame(fadeTimer);
    const from = bgm.volume;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      bgm.volume = from + (target - from) * p;
      if (p < 1) fadeTimer = requestAnimationFrame(step);
    };
    fadeTimer = requestAnimationFrame(step);
  }

  function startMusic() {
    const attempt = bgm.play();
    if (attempt && typeof attempt.then === "function") {
      attempt
        .then(() => { fadeTo(CONFIG.musicVolume); soundBtn.classList.remove("is-off"); })
        .catch(() => {
          // blocked or file missing: try once more on the very next tap
          soundBtn.classList.add("is-off");
          document.addEventListener("pointerdown", () => {
            bgm.play().then(() => { fadeTo(CONFIG.musicVolume); soundBtn.classList.remove("is-off"); }).catch(() => {});
          }, { once: true });
        });
    }
  }

  soundBtn.addEventListener("click", () => {
    if (bgm.paused) {
      bgm.play().then(() => { fadeTo(CONFIG.musicVolume, 600); soundBtn.classList.remove("is-off"); }).catch(() => {});
    } else {
      bgm.pause();
      soundBtn.classList.add("is-off");
    }
  });

  /* =========================================================
     LETTER GARLAND (little hearts)
     ========================================================= */
  (function buildBunting() {
    const wrap = $("#bunting");
    const count = 44;
    for (let i = 0; i < count; i++) {
      const f = document.createElement("span");
      f.className = "flag";
      f.style.setProperty("--k", i);
      f.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#heart"/></svg>';
      wrap.appendChild(f);
    }
  })();

  /* =========================================================
     FLOATING HEARTS + CONFETTI
     ========================================================= */
  const floaters = $("#floaters");

  function spawnFloater() {
    if (document.hidden || floaters.childElementCount > 34) return;
    const el = document.createElement("span");
    const spark = Math.random() < 0.22;
    el.className = "floater";
    el.style.setProperty("--x", `${rand(0, 96).toFixed(1)}vw`);
    el.style.setProperty("--s", `${(spark ? rand(10, 20) : rand(14, 42)).toFixed(0)}px`);
    el.style.setProperty("--d", `${rand(8, 15).toFixed(1)}s`);
    el.style.setProperty("--drift", `${rand(-80, 80).toFixed(0)}px`);
    el.style.setProperty("--o", rand(0.25, 0.6).toFixed(2));
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${spark ? "sparkle" : "heart"}"/></svg>`;
    el.addEventListener("animationend", () => el.remove());
    floaters.appendChild(el);
  }

  if (!reduceMotion) {
    for (let i = 0; i < 10; i++) setTimeout(spawnFloater, i * 220);
    setInterval(spawnFloater, 600);
  }

  // tiny hearts pop wherever you tap (cute!)
  function tapHearts(x, y) {
    if (reduceMotion) return;
    for (let i = 0; i < 5; i++) {
      const el = document.createElement("span");
      el.className = "confetti confetti--heart";
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.color = ["#ffffff", "#bff0df", "#7cf0c4", "#8fd0f5"][i % 4];
      el.style.width = el.style.height = `${rand(10, 18)}px`;
      el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#heart"/></svg>';
      document.body.appendChild(el);
      const dx = rand(-46, 46);
      el.animate(
        [
          { transform: "translate(-50%, -50%) scale(0.3)", opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), ${rand(-90, -50)}px) scale(1) rotate(${rand(-25, 25)}deg)`, opacity: 0 },
        ],
        { duration: rand(700, 1100), easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" }
      ).onfinish = () => el.remove();
    }
  }
  document.addEventListener("pointerdown", (e) => tapHearts(e.clientX, e.clientY));

  function burst(x, y, count = 28) {
    if (reduceMotion) return;
    const colors = ["#ffffff", "#bff0df", "#5fdcb9", "#7cc8f5", "#2f8fd8", "#1fb38a"];
    for (let i = 0; i < count; i++) {
      const el = document.createElement("span");
      const isHeart = Math.random() < 0.6;
      const color = colors[Math.floor(Math.random() * colors.length)];
      el.className = "confetti" + (isHeart ? " confetti--heart" : "");
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      if (isHeart) {
        el.style.color = color;
        el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#heart"/></svg>';
      } else {
        el.style.background = color;
      }

      const angle = rand(-Math.PI, 0);              // fan upward
      const power = rand(80, 260);
      const dx = Math.cos(angle) * power;
      const up = Math.sin(angle) * power;           // negative = up
      const spin = rand(-540, 540);

      document.body.appendChild(el);
      el.animate(
        [
          { transform: "translate(0,0) rotate(0deg) scale(1)", opacity: 1 },
          { transform: `translate(${dx}px, ${up}px) rotate(${spin / 2}deg) scale(1)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${dx * 1.25}px, ${up + 300}px) rotate(${spin}deg) scale(0.7)`, opacity: 0 },
        ],
        { duration: rand(1100, 1900), easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" }
      ).onfinish = () => el.remove();
    }
  }
})();
