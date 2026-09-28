/* ============================================================
 * 玩家：指针锁定第一人称 / 行走 / 跳跃 / 游泳
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

  /* ---------- 输入 ---------- */
  S.keys = {};
  window.addEventListener('keydown', (e) => { S.keys[e.code] = true; });
  window.addEventListener('keyup', (e) => { S.keys[e.code] = false; });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement && st.mode !== 'boat') {
      st.yaw -= e.movementX * 0.0022;
      st.pitch = S.clamp(st.pitch - e.movementY * 0.0022, -1.35, 1.35);
    }
  });

  /* ---------- 更新 ---------- */
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();

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
      p.x = S.clamp(p.x + move.x * sp * dt, -S.CFG.WORLD_LIMIT, S.CFG.WORLD_LIMIT);
      p.z = S.clamp(p.z + move.z * sp * dt, -S.CFG.WORLD_LIMIT, S.CFG.WORLD_LIMIT);
      const ground = S.terrainHeight(p.x, p.z) + S.CFG.EYE;

      if (st.grounded) {
        p.y = ground;
        if ((k.Space) && st.grounded) { st.velY = 4.6; st.grounded = false; }
        const moving = move.lengthSq() > 0;
        if (moving) {
          st.bobT += dt * sp * 1.7;
          p.y += Math.sin(st.bobT) * 0.035;
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
      p.x = S.clamp(p.x + move.x * sp * dt, -S.CFG.WORLD_LIMIT, S.CFG.WORLD_LIMIT);
      p.z = S.clamp(p.z + move.z * sp * dt, -S.CFG.WORLD_LIMIT, S.CFG.WORLD_LIMIT);
      const targetY = S.waveHeight(p.x, p.z, t) - 0.18;
      p.y += (targetY - p.y) * Math.min(1, dt * 6);
      const th2 = S.terrainHeight(p.x, p.z);
      if (th2 > -0.75) { st.mode = 'walk'; p.y = th2 + S.CFG.EYE; st.grounded = true; }
    }

    camera.rotation.order = 'YXZ';
    camera.rotation.set(st.pitch, st.yaw, 0);

    // 冲刺视野微扩
    const targetFov = (st.sprint && move.lengthSq() > 0 && st.mode === 'walk') ? 72 : 66;
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
