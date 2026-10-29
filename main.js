(function () {
  "use strict";
  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* theme */
  var tbtn = $("[data-theme-toggle]");
  if (tbtn) {
    var dark = function () {
      return root.dataset.theme ? root.dataset.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    };
    var label = function () { tbtn.textContent = dark() ? "Light" : "Dark"; tbtn.setAttribute("aria-label", dark() ? "Switch to light theme" : "Switch to dark theme"); };
    tbtn.hidden = false;
    label();
    tbtn.addEventListener("click", function () {
      var next = dark() ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem("modules-tf-theme", next); } catch (e) {}
      label();
    });
  }

  /* step reveal, progress spine, active step */
  var steps = $$("[data-step]");
  var wrap = $(".steps");
  var rail = $$(".rail a");
  if (steps.length && "IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -15% 0px", threshold: 0.05 });
    steps.forEach(function (s) { io.observe(s); });
  } else {
    steps.forEach(function (s) { s.classList.add("in"); });
  }
  var ticking = false;
  function update() {
    ticking = false;
    if (!wrap) return;
    var vh = window.innerHeight, mid = vh * 0.45;
    var r = wrap.getBoundingClientRect();
    var top = r.top + 64, h = Math.max(r.height - 64 - 96, 1);
    var p = Math.min(1, Math.max(0, (mid - top) / h));
    wrap.style.setProperty("--p", p.toFixed(4));
    var cur = null;
    steps.forEach(function (s) { if (s.getBoundingClientRect().top < mid) cur = s; });
    steps.forEach(function (s) { s.classList.toggle("active", s === cur); });
    rail.forEach(function (a) {
      if (cur && a.getAttribute("href") === "#" + cur.id) a.setAttribute("aria-current", "step");
      else a.removeAttribute("aria-current");
    });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();

  /* tabs */
  $$("[data-tabs]").forEach(function (t) {
    var tabs = $$('[role="tab"]', t);
    function pick(tab) {
      tabs.forEach(function (x) {
        var on = x === tab;
        x.setAttribute("aria-selected", on);
        x.tabIndex = on ? 0 : -1;
        $("#" + x.getAttribute("aria-controls")).hidden = !on;
      });
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { pick(tab); });
      tab.addEventListener("keydown", function (e) {
        var n = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!n) return;
        var next = tabs[(i + n + tabs.length) % tabs.length];
        pick(next); next.focus(); e.preventDefault();
      });
    });
  });

  /* severity filter */
  var finds = $("[data-finds]");
  $$("[data-sev]", $(".filter") || document).forEach(function (b) {
    b.addEventListener("click", function () {
      var sev = b.dataset.sev;
      $$("[data-sev]", b.parentNode).forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
      $$("li", finds).forEach(function (li) { li.hidden = sev !== "all" && li.dataset.sev !== sev; });
    });
  });

  /* round toggle */
  var rounds = $("[data-rounds]");
  $$("[data-round]", $("[data-round-ctl]") || document).forEach(function (b) {
    b.addEventListener("click", function () {
      rounds.dataset.round = b.dataset.round;
      $$("[data-round]", b.parentNode).forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
    });
  });

  /* copy */
  $$("[data-copy]").forEach(function (b) {
    if (!navigator.clipboard) return;
    b.hidden = false;
    b.addEventListener("click", function () {
      var code = $("code", b.parentNode).textContent;
      navigator.clipboard.writeText(code).then(function () {
        b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1600);
      });
    });
  });
})();
