/* ============================================================
 * 场景道具：棕榈树 / 礁石海蚀柱 / 浮木 / 草丛 / 贝壳
 *           小船模型 / 海鸥 / 鱼群
 * ============================================================ */
(function () {
  const S = window.Seaside;
  const swayables = (S.swayables = []);
  const birds = (S.birds = []);
  const fishSchools = (S.fishSchools = []);

  /* ---------- 棕榈树 ---------- */
  function leafGeometry(rand) {
    const geo = new THREE.PlaneGeometry(0.6, 2.5, 1, 7);
    geo.translate(0, 1.25, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / 2.5;
      pos.setZ(i, -(t * t) * 1.25 + t * 0.35);          // 弯垂
      pos.setX(i, pos.getX(i) * (1 - t * 0.78));         // 收窄
    }
    geo.computeVertexNormals();
    return geo;
  }

  S.makePalm = function (x, z, scale, seed) {
    const g = new THREE.Group();
    const rand = (n) => S.hash2(seed + n * 3.7, seed * 1.31 + n);
    const leanAzi = rand(1) * Math.PI * 2;
    const lean = new THREE.Vector3(Math.cos(leanAzi), 0, Math.sin(leanAzi)).multiplyScalar(0.1 + rand(2) * 0.14);
    const dir = new THREE.Vector3(0, 1, 0);
    const cursor = new THREE.Vector3(0, 0, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x9a7b57, roughness: 1 });

    for (let i = 0; i < 7; i++) {
      const r1 = 0.21 - i * 0.014, r2 = 0.245 - i * 0.014;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, 0.62, 7), trunkMat);
      const tilt = (i / 7) * 0.55;
      const d = new THREE.Vector3(lean.x * tilt, 1, lean.z * tilt).normalize();
      seg.position.copy(cursor).addScaledVector(d, 0.3);
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      seg.castShadow = true;
      g.add(seg);
      cursor.addScaledVector(d, 0.56);
    }

    const top = new THREE.Group();
    top.position.copy(cursor);
    const leafGeo = leafGeometry(rand);
    for (let i = 0; i < 12; i++) {
      const c = 0.32 + rand(i + 10) * 0.14;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(c, 0.62 + rand(i) * 0.1, 0.3),
        roughness: 0.9, side: THREE.DoubleSide
      });
      const leaf = new THREE.Mesh(leafGeo, mat);
      leaf.rotation.x = -Math.PI / 2 + 0.18 + rand(i + 20) * 0.22;
      leaf.rotation.y = (i / 12) * Math.PI * 2 + rand(i + 30) * 0.5;
      leaf.castShadow = true;
      top.add(leaf);
    }
    for (let i = 0; i < 3; i++) { // 椰子
      const nut = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x6b4f2f, roughness: 0.9 })
      );
      nut.position.set(Math.cos(i * 2.1) * 0.18, -0.1, Math.sin(i * 2.1) * 0.18);
      top.add(nut);
    }
    g.add(top);
    swayables.push({ obj: top, phase: rand(40) * 6.28, amp: 0.05, axis: 'z' });

    const baseH = S.terrainHeight(x, z);
    g.position.set(x, baseH - 0.15, z);
    g.rotation.y = rand(50) * Math.PI * 2;
    g.scale.setScalar(scale);
    return g;
  };

  /* ---------- 礁石 ---------- */
  S.makeRock = function (r, seed) {
    const geo = new THREE.IcosahedronGeometry(r, 2);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = S.fbm(v.x * 0.9 + seed, (v.y + v.z) * 0.9 + seed * 2.1) - 0.5;
      v.multiplyScalar(1 + n * 0.52);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x635c53, roughness: 1, flatShading: true });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    return m;
  };

  /* ---------- 浮木 ---------- */
  function makeDriftwood(x, z, seed) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xb0907a, roughness: 1 });
    const main = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 4.4, 7), mat);
    main.rotation.z = Math.PI / 2 - 0.08;
    main.castShadow = true;
    g.add(main);
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.0, 6), mat);
    branch.position.set(0.8, 0.32, 0.2);
    branch.rotation.set(0.6, 0.4, 1.1);
    branch.castShadow = true;
    g.add(branch);
    g.position.set(x, S.terrainHeight(x, z) + 0.16, z);
    g.rotation.y = S.hash2(seed, 7.7) * Math.PI * 2;
    return g;
  }

  /* ---------- 草丛（交叉面片） ---------- */
  function makeGrassTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    for (let i = 0; i < 14; i++) {
      const bx = 14 + Math.random() * 100;
      ctx.strokeStyle = `rgb(${60 + Math.random() * 40},${120 + Math.random() * 60},${50 + Math.random() * 30})`;
      ctx.lineWidth = 2.4 - Math.random() * 1.4;
      ctx.beginPath();
      ctx.moveTo(bx, 128);
      ctx.quadraticCurveTo(bx + (Math.random() - 0.5) * 44, 70, bx + (Math.random() - 0.5) * 70, Math.random() * 36);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ---------- 小船模型 ---------- */
  S.buildBoatMesh = function () {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0xb07a3f, roughness: 0.75 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x7d5230, roughness: 0.85 });

    const shape = new THREE.Shape();
    shape.moveTo(0, 2.1);
    shape.quadraticCurveTo(0.62, 1.2, 0.58, 0.1);
    shape.lineTo(0.52, -1.15);
    shape.quadraticCurveTo(0.5, -1.32, 0.36, -1.32);
    shape.lineTo(-0.36, -1.32);
    shape.quadraticCurveTo(-0.5, -1.32, -0.52, -1.15);
    shape.lineTo(-0.58, 0.1);
    shape.quadraticCurveTo(-0.62, 1.2, 0, 2.1);
    const hullGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.6, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.09, bevelSegments: 2
    });
    hullGeo.rotateX(Math.PI / 2);
    hullGeo.translate(0, 0.5, 0);
    const hull = new THREE.Mesh(hullGeo, wood);
    hull.castShadow = true;
    g.add(hull);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.05, 2.15), woodDark);
    floor.position.set(0, 0.22, 0.1);
    g.add(floor);

    const benchGeo = new THREE.BoxGeometry(1.02, 0.07, 0.3);
    const b1 = new THREE.Mesh(benchGeo, woodDark); b1.position.set(0, 0.42, 0.62); g.add(b1);
    const b2 = new THREE.Mesh(benchGeo, woodDark); b2.position.set(0, 0.42, -0.62); g.add(b2);

    // 船桨
    const oarMat = new THREE.MeshStandardMaterial({ color: 0xc59a63, roughness: 0.8 });
    for (const sx of [-1, 1]) {
      const oar = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.9, 6), oarMat);
      shaft.rotation.z = Math.PI / 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.14), oarMat);
      blade.position.x = 0.95;
      oar.add(shaft, blade);
      oar.position.set(sx * 0.28, 0.47, -0.05);
      oar.rotation.y = sx * -0.35;
      g.add(oar);
    }

    // 船头小旗
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 5), woodDark);
    pole.position.set(0, 1.0, 1.75);
    g.add(pole);
    const flagGeo = new THREE.PlaneGeometry(0.42, 0.24);
    flagGeo.translate(0.21, 0, 0);
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({
      color: 0xff7a4d, side: THREE.DoubleSide, roughness: 0.9
    }));
    flag.position.set(0, 1.5, 1.75);
    g.add(flag);
    swayables.push({ obj: flag, phase: 2.2, amp: 0.5, axis: 'y' });

    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  };

  /* ---------- 海鸥 ---------- */
  function makeBird() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 6), mat);
    body.geometry.rotateX(Math.PI / 2);
    g.add(body);
    const wingGeo = new THREE.PlaneGeometry(0.55, 0.17);
    wingGeo.translate(0.28, 0, 0);
    const wingL = new THREE.Mesh(wingGeo, new THREE.MeshStandardMaterial({ color: 0xf5f5f2, side: THREE.DoubleSide, roughness: 0.9 }));
    const wingR = wingL.clone();
    wingR.rotation.y = Math.PI;
    g.add(wingL, wingR);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5),
      new THREE.MeshStandardMaterial({ color: 0xe8a13c }));
    beak.geometry.rotateX(Math.PI / 2);
    beak.position.z = 0.3;
    g.add(beak);
    g.userData.wings = [wingL, wingR];
    return g;
  }

  /* ---------- 鱼群 ---------- */
  function makeFishSchool(scene, cx, cz, count, color) {
    const geo = new THREE.ConeGeometry(0.07, 0.26, 5);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    inst.frustumCulled = false;
    scene.add(inst);
    fishSchools.push({
      inst, cx, cz, count,
      baseY: S.terrainHeight(cx, cz) + 1.2,
      r: 1.6 + S.hash2(cx, cz) * 1.4,
      speed: 0.5 + S.hash2(cz, cx) * 0.4,
      phase: S.hash2(cx + 1, cz) * 6.28
    });
  }

  /* ---------- 程序化树木（递归分枝 + 叶团） ---------- */
  S.makeTree = function (x, z, seed, scale) {
    const g = new THREE.Group();
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 1 });
    const leafMats = [
      new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 0.95, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x4f9c52, roughness: 0.95, flatShading: true })
    ];

    function branch(origin, dir, len, rad, depth) {
      const end = origin.clone().addScaledVector(dir, len);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.72, rad, len, 6), barkMat);
      m.position.copy(origin).addScaledVector(dir, len * 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      m.castShadow = true;
      g.add(m);
      if (depth <= 0) {
        const blob = new THREE.Mesh(
          new THREE.IcosahedronGeometry(len * 0.95, 1),
          leafMats[Math.floor(S.hash2(seed + depth, end.x) * 2) % 2]
        );
        blob.position.copy(end).addScaledVector(dir, len * 0.2);
        blob.scale.set(1.05, 0.8, 1.05);
        blob.castShadow = true;
        g.add(blob);
        return;
      }
      const n = 2 + (S.hash2(seed * 7 + depth, 3) > 0.55 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const nd = dir.clone().normalize();
        nd.x += (S.hash2(seed * 7 + i, depth) - 0.5) * 1.6;
        nd.z += (S.hash2(seed * 11 + i, depth) - 0.5) * 1.6;
        nd.y += 0.22;
        branch(end, nd.normalize(), len * 0.72, rad * 0.66, depth - 1);
      }
    }
    branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, 1, 0), 1.6, 0.19, 2);

    g.position.set(x, S.terrainHeight(x, z) - 0.12, z);
    g.scale.setScalar(scale);
    g.rotation.y = S.hash2(seed, 17) * 6.28;
    return g;
  };

  /* ---------- 水下礁石与海草（清澈海水里能看见） ---------- */
  function addUnderwater(scene, grassMat) {
    for (let i = 0; i < 16; i++) {
      const x = (S.hash2(i, 91) - 0.5) * 130;
      const z = 20 + S.hash2(i, 93) * 80;
      const h = S.terrainHeight(x, z);
      if (h > -1.0 || h < -5.5) continue;
      const r = 0.5 + S.hash2(i, 95) * 1.3;
      const rock = S.makeRock(r, i * 21.3);
      rock.material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x4f6656).offsetHSL(0, 0.05, (S.hash2(i, 97) - 0.5) * 0.12),
        roughness: 1, flatShading: true
      });
      rock.position.set(x, h - r * 0.25, z);
      scene.add(rock);
    }
    // 海草丛
    for (let i = 0; i < 22; i++) {
      const x = (S.hash2(i, 101) - 0.5) * 120;
      const z = 22 + S.hash2(i, 103) * 70;
      const h = S.terrainHeight(x, z);
      if (h > -0.7 || h < -3.8) continue;
      const tuft = new THREE.Group();
      for (let k = 0; k < 2; k++) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.9), grassMat);
        p.position.y = 0.42;
        p.rotation.y = k * Math.PI / 2 + S.hash2(i, k) * 1.1;
        tuft.add(p);
      }
      tuft.position.set(x, h, z);
      tuft.scale.setScalar(0.7 + S.hash2(i, 107) * 0.7);
      swayables.push({ obj: tuft, phase: S.hash2(i, 109) * 6.28, amp: 0.16, axis: 'z' });
      scene.add(tuft);
    }
  }

  /* ---------- 螃蟹（走近会钻进沙里） ---------- */
  const crabs = (S.crabs = []);
  function makeCrab() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xd9552f, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat);
    body.scale.set(1.25, 0.5, 1.0);
    body.castShadow = true;
    g.add(body);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.19, 4), mat);
        leg.position.set(s * 0.15, -0.03, 0.07 - i * 0.06);
        leg.rotation.z = s * 1.05;
        leg.rotation.x = (i - 1) * 0.28;
        g.add(leg);
      }
      const claw = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.055, 0.07), mat);
      claw.position.set(s * 0.19, 0.0, 0.15);
      claw.rotation.y = s * 0.45;
      g.add(claw);
    }
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), eyeMat);
      eye.position.set(s * 0.05, 0.07, 0.11);
      g.add(eye);
    }
    return g;
  }

  function addCrabs(scene) {
    for (let i = 0; i < 12; i++) {
      const x = (S.hash2(i, 111) - 0.5) * 110;
      const z = 10 + S.hash2(i, 113) * 13;
      const h = S.terrainHeight(x, z);
      if (h < 0.05 || h > 2.2) continue;
      const g = makeCrab();
      g.scale.setScalar(1.6);
      scene.add(g);
      crabs.push({ g, x, z, hz: z, a: S.hash2(i, 115) * 6.28, hide: 0, scared: false, seed: i * 3.1 });
    }
  }

  /* ---------- 总装 ---------- */
  S.buildProps = function (scene) {
    // 棕榈树
    const palms = [
      [-8, -32, 1.15, 11], [10, -54, 0.95, 23], [-26, -46, 1.3, 37],
      [24, -27, 1.05, 51], [-40, -26, 0.9, 67], [2, -72, 1.2, 83], [34, -44, 1.0, 97]
    ];
    for (const [x, z, sc, sd] of palms) scene.add(S.makePalm(x, z, sc, sd));

    // 海蚀柱群（参考图中的标志巨石）
    const stacks = [[-34, 17, 4.3], [-22, 25, 3.3], [-30, 35, 2.7]];
    for (const [x, z, r] of stacks) {
      const rock = S.makeRock(r, x * 0.7 + z);
      rock.position.set(x, -r * 0.22, z);
      rock.scale.y = 1.25;
      scene.add(rock);
    }
    // 西侧海岬礁石
    for (let i = 0; i < 7; i++) {
      const x = -95 - S.hash2(i, 3) * 70;
      const z = -30 + S.hash2(i, 9) * 70;
      const r = 1.2 + S.hash2(i, 13) * 2.6;
      const rock = S.makeRock(r, i * 17.3);
      rock.position.set(x, S.terrainHeight(x, z) - r * 0.3, z);
      scene.add(rock);
    }
    // 小岛礁石
    for (let i = 0; i < 4; i++) {
      const x = 124 + (S.hash2(i, 21) - 0.5) * 16;
      const z = 58 + (S.hash2(i, 25) - 0.5) * 16;
      const r = 1.0 + S.hash2(i, 29) * 1.6;
      const rock = S.makeRock(r, i * 31.7);
      rock.position.set(x, S.terrainHeight(x, z) - r * 0.3, z);
      scene.add(rock);
    }

    // 浮木
    scene.add(makeDriftwood(4, -15, 5));
    scene.add(makeDriftwood(-13, -19, 15));
    scene.add(makeDriftwood(17, -9, 25));

    // 草丛
    const grassTex = makeGrassTexture();
    const grassMat = new THREE.MeshStandardMaterial({
      map: grassTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1
    });
    for (let i = 0; i < 30; i++) {
      const x = (S.hash2(i, 41) - 0.5) * 150;
      const z = -14 - S.hash2(i, 43) * 70;
      const h = S.terrainHeight(x, z);
      if (h < 1.0) continue;
      const tuft = new THREE.Group();
      for (let k = 0; k < 2; k++) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.1), grassMat);
        p.position.y = 0.5;
        p.rotation.y = k * Math.PI / 2 + S.hash2(i, k) * 1.2;
        tuft.add(p);
      }
      tuft.position.set(x, h, z);
      tuft.scale.setScalar(0.8 + S.hash2(i, 47) * 0.9);
      scene.add(tuft);
    }

    // 贝壳 / 海星
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xf2ead9, roughness: 0.6 });
    const starMat = new THREE.MeshStandardMaterial({ color: 0xe8875f, roughness: 0.8 });
    for (let i = 0; i < 12; i++) {
      const x = (S.hash2(i, 61) - 0.5) * 100;
      const z = -8 - S.hash2(i, 63) * 40;
      const h = S.terrainHeight(x, z);
      if (h < 0.3) continue;
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), i % 3 === 0 ? starMat : shellMat);
      shell.scale.set(1, 0.4, 0.8);
      shell.position.set(x, h + 0.03, z);
      shell.rotation.y = S.hash2(i, 65) * 6.28;
      scene.add(shell);
    }

    // 海鸥
    for (let i = 0; i < 5; i++) {
      const b = makeBird();
      scene.add(b);
      birds.push({
        g: b, cx: -20 + S.hash2(i, 71) * 60, cz: 10 + S.hash2(i, 73) * 40,
        r: 26 + S.hash2(i, 75) * 30, h: 22 + S.hash2(i, 77) * 14,
        speed: 0.14 + S.hash2(i, 79) * 0.1, phase: S.hash2(i, 81) * 6.28, dir: i % 2 ? 1 : -1,
        diveT: 6 + S.hash2(i, 83) * 16, diving: false, diveP: 0
      });
    }

    // 阔叶树
    for (const [x, z, sc, sd] of [
      [-28, -58, 1.1, 3], [34, -56, 0.95, 9], [-62, -34, 1.15, 15],
      [126, 58, 1.3, 21], [133, 68, 1.0, 27], [-14, -72, 1.05, 33]
    ]) scene.add(S.makeTree(x, z, sd, sc));

    // 水下礁石与海草
    addUnderwater(scene, grassMat);

    // 螃蟹
    addCrabs(scene);

    // 鱼群
    makeFishSchool(scene, 32, 62, 12, 0xe8c86a);
    makeFishSchool(scene, -18, 80, 12, 0x7fb2d9);
  };

  const _dummy = new THREE.Object3D();
  S.updateProps = function (t, dt) {
    dt = dt || 0.016;
    for (const sw of swayables) {
      if (sw.axis === 'z') sw.obj.rotation.z = Math.sin(t * 1.15 + sw.phase) * sw.amp;
      else sw.obj.rotation.y = Math.sin(t * 2.6 + sw.phase) * sw.amp;
    }
    for (const b of birds) {
      const a = t * b.speed * b.dir + b.phase;
      // 俯冲入海：周期性下潜再拉起
      b.diveT -= dt;
      if (b.diveT <= 0) {
        b.diving = !b.diving;
        b.diveT = b.diving ? 2.4 : 9 + S.hash2(b.phase, 5) * 15;
      }
      b.diveP += ((b.diving ? 1 : 0) - b.diveP) * Math.min(1, dt * 1.6);
      const yOff = -b.diveP * (b.h - 2.2);
      b.g.position.set(
        b.cx + Math.cos(a) * b.r,
        b.h + Math.sin(t * 0.5 + b.phase) * 2.2 + yOff,
        b.cz + Math.sin(a) * b.r
      );
      const tx = -Math.sin(a) * b.dir, tz = Math.cos(a) * b.dir;
      b.g.rotation.y = Math.atan2(tx, tz);
      b.g.rotation.z = 0.3 * b.dir;
      const flap = Math.sin(t * 9 + b.phase) * 0.5;
      b.g.userData.wings[0].rotation.z = flap;
      b.g.userData.wings[1].rotation.z = -flap;
    }
    for (const fs of fishSchools) {
      const cy = fs.baseY + Math.sin(t * 0.4 + fs.phase) * 0.4;
      const ccx = fs.cx + Math.cos(t * 0.13 + fs.phase) * 3.0;
      const ccz = fs.cz + Math.sin(t * 0.11 + fs.phase) * 3.0;
      for (let i = 0; i < fs.count; i++) {
        const a = t * fs.speed + (i / fs.count) * 6.28;
        const rr = fs.r + Math.sin(t * 0.7 + i) * 0.3;
        _dummy.position.set(
          ccx + Math.cos(a) * rr,
          cy + Math.sin(t * 1.3 + i * 1.7) * 0.25,
          ccz + Math.sin(a) * rr
        );
        _dummy.rotation.set(0, -a + Math.sin(t * 8 + i) * 0.2, 0);
        _dummy.updateMatrix();
        fs.inst.setMatrixAt(i, _dummy.matrix);
      }
      fs.inst.instanceMatrix.needsUpdate = true;
    }

    // 螃蟹：岸边游走，玩家靠近就钻进沙里
    const pp = S.player.pos;
    for (const c of crabs) {
      const dist = Math.hypot(pp.x - c.x, pp.z - c.z);
      if (dist < 4.5) c.scared = true; else if (dist > 7.0) c.scared = false;
      c.hide += ((c.scared ? 1 : 0) - c.hide) * Math.min(1, dt * 3.2);

      if (!c.scared && c.hide < 0.4) {
        c.a += (S.hash2(c.seed + Math.floor(t * 0.6), 3) - 0.5) * 1.6 * dt;
        const nx = c.x + Math.sin(c.a) * 0.6 * dt;
        const nz = c.z + Math.cos(c.a) * 0.6 * dt;
        const th = S.terrainHeight(nx, nz);
        if (th > 0.05 && th < 1.7 && Math.abs(nz - c.hz) < 9) { c.x = nx; c.z = nz; }
        else c.a += 2.4;
      }
      c.g.position.set(c.x, S.terrainHeight(c.x, c.z) + 0.07 - c.hide * 0.42, c.z);
      c.g.rotation.y = c.a + Math.PI / 2;
      c.g.rotation.z = Math.sin(t * 9 + c.seed) * 0.06 * (1 - c.hide);
      c.g.visible = c.hide < 0.93;
    }
  };
})();
