/* ============================================================
 * UI：开始界面 / 状态栏 / 提示 / 帮助 / 工具栏
 * ============================================================ */
(function () {
  const S = window.Seaside;
  const $ = (id) => document.getElementById(id);

  S.ui = {
    setMode(txt) { $('chipMode').textContent = txt; },
    setFps(v) { const el = $('chipFps'); if (el) el.textContent = v + ' FPS'; },
    setPrompt(txt) {
      const el = $('prompt');
      if (txt) { el.textContent = txt; el.classList.add('show'); }
      else el.classList.remove('show');
    },
    setContinueHint(v) { $('continueHint').classList.toggle('show', v); },
    setUnderwater(v) { $('underwaterTint').classList.toggle('show', v); },
    toggleHelp() { $('helpPanel').classList.toggle('show'); }
  };

  S.bindUI = function () {
    $('btnStart').addEventListener('click', () => S.start());

    $('btnMusic').addEventListener('click', function () {
      const on = S.audio.toggleMusic();
      if (on !== null) this.classList.toggle('off', !on);
    });
    $('btnAmbient').addEventListener('click', function () {
      const on = S.audio.toggleAmbient();
      if (on !== null) this.classList.toggle('off', !on);
    });
    $('btnFull').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    });
    $('btnGlow').addEventListener('click', function () {
      const on = !S.postFXOn();
      S.setPostFX(on);
      this.classList.toggle('off', !on);
    });
    $('btnHelp').addEventListener('click', () => S.ui.toggleHelp());

    // 点击画面重新锁定鼠标
    document.getElementById('gameCanvas').addEventListener('click', () => {
      if (S.started && !document.pointerLockElement) {
        document.body.requestPointerLock();
        S.ui.setContinueHint(false);
      }
    });

    document.addEventListener('pointerlockchange', () => {
      if (S.started) {
        S.ui.setContinueHint(!document.pointerLockElement);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) S.audio.suspend();
      else S.audio.resume();
    });

    window.addEventListener('keydown', (e) => {
      if (!S.started) return;
      if (e.code === 'KeyE') S.tryBoard();
      if (e.code === 'KeyM') {
        const on = S.audio.toggleMusic();
        $('btnMusic').classList.toggle('off', on === false);
      }
      if (e.code === 'KeyH') S.ui.toggleHelp();
      if (e.code === 'KeyB') {
        const on = !S.postFXOn();
        S.setPostFX(on);
        $('btnGlow').classList.toggle('off', !on);
      }
      if (e.code === 'Space') e.preventDefault();
    });
  };
})();
