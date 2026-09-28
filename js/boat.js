/* ============================================================
 * 小船：浮动/俯仰横摇/驾驶物理/登船下船/尾迹泡沫
 * ============================================================ */
(function () {
  const S = window.Seaside;

  S.boat = null;

  S.initBoat = function (scene) {
    const g = S.buildBoatMesh();
    scene.add(g);
    S.boat = {
      g, x: 14, z: 42, heading: 2.7, v: 0, occ: false,
      pitch: 0, roll: 0, wakeTimer: 0, wakes: []
    };
    g.position.set(14, 0.3, 42);
    g.rotation.y = 2.7;
  };

  const fwd = new THREE.Vector3();
  const rightV = new THREE.Vector3();

  S.updateBoat = function (dt, t) {
    const b = S.boat;
    if (!b) return;
    const k = S.keys || {};

    fwd.set(Math.sin(b.heading), 0, Math.cos(b.heading));
    rightV.set(Math.cos(b.heading), 0, -Math.sin(b.heading));

    // 输入
    let acc = 0, turn = 0;
    if (b.occ) {
      if (k.KeyW || k.ArrowUp) acc = 3.4;
      if (k.KeyS || k.ArrowDown) acc = -2.4;
      if (k.KeyA || k.ArrowLeft) turn = 1;
      if (k.KeyD || k.ArrowRight) turn = -1;
    }
    b.v += acc * dt;
    b.v *= 1 - 0.5 * dt;
    b.v = S.clamp(b.v, -2.4, 7.0);

    const turnRate = turn * 1.5 * S.clamp(Math.abs(b.v) / 2.5, 0.12, 1) * (b.v < 0 ? -1 : 1);
    b.heading += turnRate * dt;

    // 移动 + 搁浅保护
    const nx = b.x + fwd.x * b.v * dt;
    const nz = b.z + fwd.z * b.v * dt;
    if (S.terrainHeight(nx, nz) > -0.5) {
      b.v *= -0.25;
    } else {
      b.x = nx; b.z = nz;
    }

    // 浮动姿态（四点采样波浪）
    const y0 = S.waveHeight(b.x, b.z, t) + 0.22;
    const hb = S.waveHeight(b.x + fwd.x * 1.5, b.z + fwd.z * 1.5, t);
    const hs = S.waveHeight(b.x - fwd.x * 1.5, b.z - fwd.z * 1.5, t);
    const hl = S.waveHeight(b.x - rightV.x * 0.7, b.z - rightV.z * 0.7, t);
    const hr = S.waveHeight(b.x + rightV.x * 0.7, b.z + rightV.z * 0.7, t);
    const targetPitch = -Math.atan((hb - hs) / 3.0) * 0.9;
    const targetRoll = Math.atan((hl - hr) / 1.4) * 0.8;
    b.pitch += (targetPitch - b.pitch) * Math.min(1, dt * 4);
    b.roll += (targetRoll - b.roll) * Math.min(1, dt * 4);

    b.g.position.set(b.x, y0, b.z);
    b.g.rotation.order = 'YXZ';
    b.g.rotation.y = b.heading;
    b.g.rotation.x = b.pitch;
    b.g.rotation.z = b.roll;

    // 尾迹泡沫
    b.wakeTimer -= dt;
    if (Math.abs(b.v) > 1.2 && b.wakeTimer <= 0) {
      b.wakeTimer = 0.14;
      const side = Math.random() > 0.5 ? 1 : -1;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(
        b.x - fwd.x * 1.7 + rightV.x * side * 0.55,
        S.waveHeight(b.x, b.z, t) + 0.09,
        b.z - fwd.z * 1.7 + rightV.z * side * 0.55
      );
      m.userData.life = 0;
      scene$add(m);
      b.wakes.push(m);
    }
    for (let i = b.wakes.length - 1; i >= 0; i--) {
      const w = b.wakes[i];
      w.userData.life += dt;
      const p = w.userData.life / 1.5;
      if (p >= 1) {
        w.parent.remove(w);
        w.geometry.dispose(); w.material.dispose();
        b.wakes.splice(i, 1);
      } else {
        w.material.opacity = 0.38 * (1 - p);
        w.scale.setScalar(1 + p * 1.8);
        w.position.y = S.waveHeight(w.position.x, w.position.z, t) + 0.09;
      }
    }
  };

  // 兼容：尾迹加入当前场景
  let _scene = null;
  function scene$add(m) {
    if (!_scene) { // 延迟获取
      _scene = S.boat.g.parent;
    }
    _scene.add(m);
  }

  /* ---------- 登船 / 下船 ---------- */
  S.tryBoard = function () {
    const b = S.boat, p = S.player;
    if (!b || !p) return;
    if (p.mode !== 'boat') {
      const d = Math.hypot(p.pos.x - b.x, p.pos.z - b.z);
      if (d < 5.5) {
        b.occ = true;
        p.mode = 'boat';
      }
    } else {
      b.occ = false;
      const ex = b.x + rightV.x * 2.4;
      const ez = b.z + rightV.z * 2.4;
      p.pos.set(ex, 0, ez);
      const th = S.terrainHeight(ex, ez);
      p.mode = th < -0.55 ? 'swim' : 'walk';
      p.pos.y = th + S.CFG.EYE;
      p.velY = 0; p.grounded = true;
    }
  };

  // 驾船时相机跟随
  const camTarget = new THREE.Vector3();
  const camDesired = new THREE.Vector3();
  S.updateBoatCam = function (dt, camera) {
    const b = S.boat;
    fwd.set(Math.sin(b.heading), 0, Math.cos(b.heading));
    camDesired.set(
      b.x - fwd.x * 7.8,
      b.g.position.y + 3.3,
      b.z - fwd.z * 7.8
    );
    camera.position.lerp(camDesired, Math.min(1, dt * 3.2));
    camTarget.set(b.x + fwd.x * 5.0, b.g.position.y + 1.0, b.z + fwd.z * 5.0);
    camera.lookAt(camTarget);
  };
})();
