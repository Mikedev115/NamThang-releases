
(function () {
  'use strict';

  var synth = window.speechSynthesis;
  var readBtn = document.getElementById('read-page');
  var readLabel = readBtn && readBtn.querySelector('.js-read-label');
  var status = document.getElementById('read-status');
  var demo = document.getElementById('demo');
  var said = document.getElementById('said');
  var voiceBox = document.getElementById('demo-voice');
  var voiceThai = null;
  var voiceEnglish = null;
  var queue = [];
  var reading = false;

  var labelRead = (readBtn && readBtn.dataset.labelRead) || 'Read this page';
  var labelStop = (readBtn && readBtn.dataset.labelStop) || 'Stop reading';
  var labelReading = (readBtn && readBtn.dataset.msgReading) || 'Reading: ';
  var labelStopped = (readBtn && readBtn.dataset.msgStopped) || 'Stopped';

  /* The browser exposes voices asynchronously; keep one of each language. */
  function pickVoice() {
    if (!synth) return;
    var voices = synth.getVoices() || [];
    voiceThai = null;
    voiceEnglish = null;
    for (var i = 0; i < voices.length; i++) {
      var lang = voices[i].lang || '';
      if (!voiceThai && /^th([-_]|$)/i.test(lang)) voiceThai = voices[i];
      if (!voiceEnglish && /^en([-_]|$)/i.test(lang)) voiceEnglish = voices[i];
    }
  }

  /* A sentence can hold both languages — "อ่านข้อมูล accessibility ที่ Windows…".
     Split it into runs and hand each run to the voice that can actually say it,
     in order, so the English voice says the English and the Thai voice the Thai. */
  function segments(text) {
    var out = [];
    var runs = String(text).split(/([\u0E00-\u0E7F]+)/);
    for (var i = 0; i < runs.length; i++) {
      var run = runs[i].replace(/\s+/g, ' ').trim();
      if (!run) continue;
      var thai = /[\u0E00-\u0E7F]/.test(run);
      if (!thai && !/[A-Za-z0-9]/.test(run)) continue;
      out.push({ text: run, thai: thai });
    }
    return out;
  }

  function speak(text, onEnd) {
    if (!synth) { if (onEnd) onEnd(); return; }
    var list = segments(text);
    var i = 0;

    function next() {
      if (i >= list.length) { if (onEnd) onEnd(); return; }
      var seg = list[i++];
      var u = new SpeechSynthesisUtterance(seg.text);
      u.lang = seg.thai ? 'th-TH' : 'en-US';
      var voice = seg.thai ? voiceThai : voiceEnglish;
      if (voice) u.voice = voice;
      u.rate = 1;
      u.onend = next;
      u.onerror = next;
      synth.speak(u);
    }

    if (!list.length) { if (onEnd) onEnd(); return; }
    next();
  }

  /* ---- read the page aloud ---- */

  function collect() {
    var nodes = document.querySelectorAll(
      '#main h1, #main h2, #main h3, #main .lede, #main p, #main dd, #main .stat__k, #main caption'
    );
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.classList.contains('eyebrow') || el.closest('.demo')) continue;
      var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
    }
    return out;
  }

  function step() {
    if (!reading || queue.length === 0) { stopReading(); return; }
    var text = queue.shift();
    if (status) status.textContent = labelReading + text.slice(0, 80);
    speak(text, step);
  }

  function startReading() {
    var chunks = collect();
    if (!chunks.length) return;
    reading = true;
    queue = chunks;
    readBtn.setAttribute('aria-pressed', 'true');
    if (readLabel) readLabel.textContent = labelStop;
    step();
  }

  function stopReading() {
    reading = false;
    queue = [];
    if (synth) synth.cancel();
    if (readBtn) {
      readBtn.setAttribute('aria-pressed', 'false');
      if (readLabel) readLabel.textContent = labelRead;
    }
    if (status) status.textContent = labelStopped;
  }

  if (synth && readBtn) {
    pickVoice();
    if (synth.addEventListener) {
      synth.addEventListener('voiceschanged', pickVoice);
    } else {
      synth.onvoiceschanged = pickVoice;
    }
    readBtn.hidden = false;
    readBtn.addEventListener('click', function () {
      if (reading) { stopReading(); } else { startReading(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && reading) { stopReading(); }
    });
    window.addEventListener('beforeunload', function () { synth.cancel(); });
  }

  /* ---- the focus demo ---- */

  function phraseFor(el) {
    var given = el.getAttribute('data-say');
    if (given) return given;
    var label = el.getAttribute('aria-label') || el.textContent || '';
    return label.replace(/\s+/g, ' ').trim();
  }

  function pulse() {
    if (!demo) return;
    demo.classList.add('is-saying');
    window.clearTimeout(pulse.t);
    pulse.t = window.setTimeout(function () {
      demo.classList.remove('is-saying');
    }, 1100);
  }

  /* ---- the scroll cue: when Tab takes focus off screen, show which way the page
     is about to move, then move slowly. A target already on screen gets no cue —
     the focus ring is the signal there. ---- */

  var cue = document.getElementById('scroll-cue');
  var keyNav = false;
  var cueTimer = 0;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') keyNav = true;
  });
  document.addEventListener('mousedown', function () { keyNav = false; });

  function hideCue() {
    if (cue) cue.classList.remove('is-on');
  }

  var glideId = 0;

  /* A glide the eye can follow. The browser's own smooth scroll covers any distance
     in roughly the same few hundred milliseconds, which reads as a jump on a long
     page; this one takes longer the further it has to go, with an ease-in-out. */
  function glideTo(targetY, duration) {
    var id = ++glideId;
    var startY = window.pageYOffset;
    var delta = targetY - startY;
    var startTime = null;

    function frame(now) {
      if (id !== glideId) return;
      if (startTime === null) startTime = now;
      var t = Math.min(1, (now - startTime) / duration);
      var eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      window.scrollTo({ top: Math.round(startY + delta * eased), behavior: 'instant' });
      if (t < 1) {
        window.requestAnimationFrame(frame);
      } else {
        hideCue();
      }
    }

    window.requestAnimationFrame(frame);
  }

  if ('onscrollend' in window) {
    window.addEventListener('scrollend', hideCue);
  }

  document.addEventListener('focusin', function (e) {
    var el = e.target;
    if (!keyNav || !(el instanceof Element)) return;
    if (!el.matches('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')) return;
    if (reduceMotion.matches) return;

    var r = el.getBoundingClientRect();
    var below = r.top > window.innerHeight - 48;
    var above = r.bottom < 96;
    if (!below && !above) return;

    if (cue) {
      cue.classList.toggle('is-up', above && !below);
      cue.classList.add('is-on');
    }

    var targetY = window.pageYOffset + r.top - (window.innerHeight - r.height) / 2;
    var maxY = document.documentElement.scrollHeight - window.innerHeight;
    targetY = Math.max(0, Math.min(maxY, targetY));

    window.clearTimeout(cueTimer);
    window.setTimeout(function () {
      var distance = Math.abs(targetY - window.pageYOffset);
      glideTo(targetY, Math.min(1000, 420 + distance * 0.25));
    }, 150);
    cueTimer = window.setTimeout(hideCue, 1500);
  });

  if (demo && said) {
    demo.addEventListener('focusin', function (e) {
      var target = e.target.closest('input, button, a');
      if (!target) return;
      said.textContent = phraseFor(target);
      pulse();
      if (voiceBox && voiceBox.checked && synth) {
        synth.cancel();
        speak(said.textContent);
      }
    });

    if (!synth && voiceBox) {
      var opt = voiceBox.closest('.demo__opt');
      if (opt) opt.hidden = true;
    }
  }
})();
