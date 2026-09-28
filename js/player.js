/* ============================================================
 * 玩家：第一人称控制（指针锁定 + 拖拽兜底 + 平滑加减速）
 * ============================================================ */
(function () {
  const S = window.Seaside;

  const st = (S.player = {
    mode: 'walk',                         // walk | swim | boat
    pos: new THREE.Vector3(0, 0, -10),
    yaw: Math.PI,                         // 面朝 +z（大海）
    pitch: -0.04,
    velY: 0, grounded: true, bobT: 0, sprint: false
  });
  st.pos.y = S.terrainHeight(0, -10) + S.CFG.EYE;

  const vel = new THREE.Vector3();        // 平滑速度，避免起步/刹车生硬

  /* ---------- 输入 ---------- */
  S.keys = {};
  window.addEventListener('keydown', (e) => { S.keys[e.code] = true; });
  window.addEventListener('keyup', (e) => { S.keys[e.code] = false; });

  /* ---------- 视角：优先指针锁定，失败时用拖拽 ---------- */
  const canvas = document.getElementById('gameCanvas');
  canvas.tabIndex = 0;
  canvas.style.outline = 'none';
  S.boatLookYaw = 0;                      // 驾船时鼠标环绕偏移
  S.pointerLockOK = false;

  let dragging = false, lastX = 0, lastY = 0;

  document.addEventListener('mousemove', (e) => {
    const locked = !!document.pointerLockElement;
    if (locked) {
      applyLook(-e.movementX * 0.0022, -e.movementY * 0.0022);
    } else if (dragging) {
      applyLook(-(e.clientX - lastX) * 0.0045, -(e.clientY - lastY) * 0.0045);
      lastX = e.clientX; lastY = e.clientY;
    }
  });

  function applyLook(dYaw, dPitch) {
    if (st.mode === 'boat') {
      S.boatLookYaw += dYaw;
      S.boatLookYaw = S.clamp(S.boatLookYaw, -1.4, 1.4);
      st.pitch = S.clamp(st.pitch + dPitch * 0.5, -0.9, 0.9);
    } else {
      st.yaw += dYaw;
      st.pitch = S.clamp(st.pitch + dPitch, -1.4, 1.4);
    }
  }

  canvas.addEventListener('mousedown', (e) => {
    canvas.focus();
    if (!document.pointerLockElement) {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    }
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('blur', () => { dragging = false; });

  document.addEventListener('pointerlockchange', () => {
    S.pointerLockOK = !!document.pointerLockElement;
  });

  /* ---------- 更新 ---------- */
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();
  const desired = new THREE.Vector3();

  S.updatePlayer = function (dt, t, camera) {
    const k = S.keys;
    let fz = 0, fx = 0;
    if (k.KeyW || k.ArrowUp) fz += 1;
    if (k.KeyS || k.ArrowDown) fz -= 1;
    if (k.KeyA || k.ArrowLeft) fx -= 1;
    if (k.KeyD || k.ArrowRight) fx += 1;
    st.sprint = !!(k.ShiftLeft || k.ShiftRight);

    forward.set(-Math.sin(st.yaw), 0, -Math.cos(st.yaw));
    right.set(Math.cos(st.yaw), 0, -Math.sin(st.yaw));
    move.set(0, 0, 0).addScaledVector(forward, fz).addScaledVector(right, fx);
    if (move.lengthSq() > 0) move.normalize();

    const th = S.terrainHeight(st.pos.x, st.pos.z);
    const p = st.pos;

    if (st.mode === 'walk') {
      const sp = st.sprint ? S.CFG.RUN : S.CFG.WALK;
      desired.copy(move).multiplyScalar(sp);
      vel.x += (desired.x - vel.x) * Math.min(1, dt * 9);
      vel.z += (desired.z - vel.z) * Math.min(1, dt * 9);
      p.x = S.clamp(p.x + vel.x * dt, -S.CFG.WORLD_LIMIT, S.CFG.WORLD_LIMIT);
      p.z = S.clamp(p.z + vel.z * dt, -S.CFG.WORLD_LIMIT, S.CFG.WORLD_LIMIT);

      const ground = S.terrainHeight(p.x, p.z) + S.CFG.EYE;
      if (st.grounded) {
        p.y = ground;
        if (k.Space) { st.velY = 4.6; st.grounded = false; }
        const spd = Math.hypot(vel.x, vel.z);
        if (spd > 0.5) {
          st.bobT += dt * (st.sprint ? 13 : 9);
          p.y += Math.sin(st.bobT) * 0.028;
        }
      } else {
        st.velY -= 12 * dt;
        p.y += st.velY * dt;
        if (p.y <= ground) { p.y = ground; st.velY = 0; st.grounded = true; }
      }
      if (S.terrainHeight(p.x, p.z) < -0.55) { st.mode = 'swim'; st.grounded = true; }
    }
    else if (st.mode === 'swim') {
      const sp = S.CFG.SWIM * (st.sprint ? 1.5 : 1);
      desired.copy(move).multiplyScalar(sp);
      vel.x += (desired.x - vel.x) * Math.min(1, dt * 4);
      vel.z += (desired.z - vel.z) * Math.min(1, dt * 4);
      p.x = S.clamp(p.x + vel.x * dt, -S.CFG.WORLD_LIMIT, S.CFG.WORLD_LIMIT);
      p.z = S.clamp(p.z + vel.z * dt, -S.CFG.WORLD_LIMIT, S.CFG.WORLD_LIMIT);
      const targetY = S.waveHeight(p.x, p.z, t) - 0.18;
      p.y += (targetY - p.y) * Math.min(1, dt * 6);
      const th2 = S.terrainHeight(p.x, p.z);
      if (th2 > -0.75) { st.mode = 'walk'; p.y = th2 + S.CFG.EYE; st.grounded = true; }
    }

    camera.rotation.order = 'YXZ';
    camera.rotation.set(st.pitch, st.yaw, 0);

    const spd = Math.hypot(vel.x, vel.z);
    const targetFov = (st.sprint && spd > 4 && st.mode === 'walk') ? 72 : 66;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5);
      camera.updateProjectionMatrix();
    }
  };

  /* ---------- UI 状态查询 ---------- */
  S.nearBoat = function () {
    if (!S.boat || S.player.mode === 'boat') return false;
    return Math.hypot(S.player.pos.x - S.boat.x, S.player.pos.z - S.boat.z) < 5.5;
  };
})();
