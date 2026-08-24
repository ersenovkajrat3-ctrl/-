/* Сетка — звук вместо 3D. Всё синтезируется в Web Audio: ни одного внешнего файла,
   поэтому игра остаётся одностраничной и работает офлайн.
   Слои: гул трибун (громкость зависит от заполняемости арены), удар по мячу,
   свисток, рёв/стон трибун на очко, короткий стингер на победу. */
(function (global) {
  const S = global.SETKA || (global.SETKA = {});

  const Audio = {
    ctx: null, master: null, crowdGain: null, crowdSource: null, enabled: true, started: false, fill: 0.6,

    init() {
      if (this.ctx || typeof window === 'undefined') return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    },
    resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    setEnabled(on) {
      this.enabled = on;
      if (this.master) this.master.gain.value = on ? 0.9 : 0;
      if (!on) this.stopCrowd();
    },

    noiseBuffer(seconds) {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    },

    /* ---------- гул трибун ---------- */
    startCrowd(fill) {
      this.init();
      if (!this.ctx || !this.enabled) return;
      this.fill = fill != null ? fill : this.fill;
      if (this.crowdSource) { this.setCrowdLevel(this.fill); return; }
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(4);
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = 0.6;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 110;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(lp); lp.connect(hp); hp.connect(gain); gain.connect(this.master);
      src.start();
      this.crowdSource = src; this.crowdGain = gain; this.crowdFilter = lp;
      this.setCrowdLevel(this.fill);
    },
    setCrowdLevel(fill) {
      this.fill = fill;
      if (!this.crowdGain) return;
      const t = this.ctx.currentTime;
      this.crowdGain.gain.cancelScheduledValues(t);
      this.crowdGain.gain.linearRampToValueAtTime(0.02 + fill * 0.10, t + 0.6);
      if (this.crowdFilter) this.crowdFilter.frequency.linearRampToValueAtTime(480 + fill * 420, t + 0.6);
    },
    stopCrowd() {
      if (!this.crowdSource) return;
      try { this.crowdSource.stop(); } catch (e) { /* уже остановлен */ }
      this.crowdSource.disconnect();
      this.crowdSource = null; this.crowdGain = null;
    },

    /* ---------- разовые звуки ---------- */
    hit(power = 1) {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(0.12);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 900 + power * 900; bp.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.20 * power, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + 0.14);
      // низкий «щелчок» ладони по мячу
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220 + power * 90, t);
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.09);
      og.gain.setValueAtTime(0.16 * power, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(og); og.connect(this.master);
      osc.start(t); osc.stop(t + 0.12);
    },
    whistle(long) {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const dur = long ? 0.55 : 0.22;
      const osc = ctx.createOscillator(), osc2 = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'square'; osc2.type = 'square';
      osc.frequency.setValueAtTime(2350, t);
      osc2.frequency.setValueAtTime(2680, t);
      const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
      lfo.frequency.value = 24; lfoGain.gain.value = 60;
      lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11, t + 0.02);
      g.gain.setValueAtTime(0.11, t + dur - 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); osc2.connect(g); g.connect(this.master);
      osc.start(t); osc2.start(t); lfo.start(t);
      osc.stop(t + dur); osc2.stop(t + dur); lfo.stop(t + dur);
    },
    /** реакция трибун: сила зависит от важности момента */
    crowdReact(positive, strength = 1) {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = ctx.createBufferSource();
      const dur = 0.5 + strength * 0.9;
      src.buffer = this.noiseBuffer(dur + 0.2);
      const bp = ctx.createBiquadFilter();
      bp.type = positive ? 'bandpass' : 'lowpass';
      bp.frequency.setValueAtTime(positive ? 700 : 380, t);
      bp.frequency.linearRampToValueAtTime(positive ? 1500 : 240, t + dur * 0.5);
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      const peak = (positive ? 0.16 : 0.09) * (0.5 + this.fill * 0.8) * strength;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + (positive ? 0.08 : 0.16));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + 0.1);
    },
    /** короткий музыкальный акцент: победа, выход в еврокубки */
    stinger(kind = 'win') {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx, t0 = ctx.currentTime;
      const notes = kind === 'win' ? [523.25, 659.25, 783.99, 1046.5] : [392, 466.16, 587.33];
      notes.forEach((f, i) => {
        const t = t0 + i * 0.09;
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, t);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.setValueAtTime(2600, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.10, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(lp); lp.connect(g); g.connect(this.master);
        osc.start(t); osc.stop(t + 0.55);
      });
    },
    click() {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(880, t);
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + 0.07);
    },
  };

  S.Audio = Audio;
})(typeof window !== 'undefined' ? window : globalThis);
