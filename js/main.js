/* ============================================================
 * 主入口：渲染器 / 灯光 / 场景装配 / 主循环
 * ============================================================ */
(function () {
  const S = window.Seaside;
  const CFG = S.CFG;

  /* ---------- 渲染器 ---------- */
  const canvas = document.getElementById('gameCanvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  /* ---------- 场景与相机 ---------- */
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xbfe0f0, 0.0022);
  const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 1600);

  /* ---------- 灯光 ---------- */
  const sunDir = S.SUN_DIR;
  const sun = new THREE.DirectionalLight(0xfff1d6, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfe0f5, 0xe8d8b0, 0.9);
  scene.add(hemi);

  /* ---------- 场景装配 ---------- */
  const heightMap = S.buildHeightMap();
  S.buildTerrain(scene);
  S.buildWater(scene, heightMap);
  S.buildSky(scene);
  S.buildProps(scene);
  S.initBoat(scene);

  /* ---------- 启动流程 ---------- */
  S.started = false;
  S.start = function () {
    if (S.started) return;
    S.started = true;
    S.audio.init();
    document.getElementById('startOverlay').classList.add('hide');
    setTimeout(() => {
      document.getElementById('startOverlay').style.display = 'none';
    }, 700);
    document.getElementById('hud').classList.add('show');
    document.body.requestPointerLock();
  };

  S.bindUI();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ---------- 主循环 ---------- */
  const clock = new THREE.Clock();
  let simT = 0;
  const camPos = new THREE.Vector3();
  // 自适应分辨率：帧率偏低时自动降采样，保证视角转动始终丝滑
  let fpsEma = 60, lowFrames = 0, quality = 0, fpsTimer = 0;

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    simT += dt;

    S.updateBoat(dt, simT);

    if (S.player.mode === 'boat') {
      S.updateBoatCam(dt, camera);
    } else {
      S.updatePlayer(dt, simT, camera);
      camera.position.copy(S.player.pos);
    }

    // 水面 / 天空 uniform
    S.waterUniforms.uTime.value = simT;
    S.waterUniforms.uCamPos.value.copy(camera.position);
    S.skyUniforms.uTime.value = simT;
    S.skyMesh.position.copy(camera.position);

    // 太阳阴影相机跟随玩家
    const anchor = S.player.mode === 'boat'
      ? S.boat.g.position
      : S.player.pos;
    sun.position.set(anchor.x + sunDir.x * 150, sunDir.y * 150, anchor.z + sunDir.z * 150);
    sun.target.position.set(anchor.x, 0, anchor.z);

    // 海底焦散时间
    if (S.terrainUniforms) S.terrainUniforms.uTime.value = simT;

    S.updateProps(simT, dt);

    // 潜水检测
    camPos.copy(camera.position);
    const submerged = camPos.y < S.waveHeight(camPos.x, camPos.z, simT) - 0.02;
    S.ui.setUnderwater(submerged);
    S.audio.setUnderwater(submerged);

    // UI 状态
    if (S.started) {
      const m = S.player.mode;
      S.ui.setMode(m === 'boat' ? '驾驶小船' : (m === 'swim' ? '游泳中' : '漫步中'));
      if (m === 'boat') S.ui.setPrompt('E 下船 · W/S 前进减速 · A/D 转向');
      else if (S.nearBoat()) S.ui.setPrompt('按 E 登上小船');
      else S.ui.setPrompt(null);
    }

    S.audio.tick();
    renderer.render(scene, camera);

    // 帧率监控与自适应画质
    fpsEma += (1 / Math.max(dt, 1e-4) - fpsEma) * 0.05;
    if (fpsEma < 48) lowFrames++; else if (lowFrames > 0) lowFrames--;
    if (lowFrames > 90 && quality < 2) {
      quality++;
      lowFrames = 0;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 1 ? 1.0 : 0.75));
    }
    fpsTimer += dt;
    if (fpsTimer > 0.5) { fpsTimer = 0; S.ui.setFps(Math.round(fpsEma)); }
  }
  loop();
})();
