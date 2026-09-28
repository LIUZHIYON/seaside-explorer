/* ============================================================
 * 地形：高度图生成 + 沙滩网格 + 顶点色（湿沙/水下过渡）
 * ============================================================ */
(function () {
  const S = window.Seaside;

  // 生成高度图数据纹理，供水面着色器逐像素查询水深
  S.buildHeightMap = function () {
    const N = 256, W = S.CFG.WORLD_SIZE;
    const data = new Uint8Array(N * N * 4);
    const range = S.CFG.HEIGHT_MAX - S.CFG.HEIGHT_MIN;

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const wx = (i / (N - 1) - 0.5) * W;
        const wz = (j / (N - 1) - 0.5) * W;
        const h = S.terrainHeight(wx, wz);
        const v = S.clamp((h - S.CFG.HEIGHT_MIN) / range, 0, 1);
        const scaled = v * 255;
        const idx = (j * N + i) * 4;
        data[idx] = Math.floor(scaled);          // 整数部分
        data[idx + 1] = Math.round((scaled % 1) * 255); // 小数部分
        data[idx + 2] = 0;
        data[idx + 3] = 255;
      }
    }

    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  };

  // 细沙颗粒贴图（程序化 canvas）
  function makeSandTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#d9c08d';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5200; i++) {
      const b = 150 + Math.floor(Math.random() * 105);
      ctx.fillStyle = `rgba(${b},${b - 24 + Math.floor(Math.random() * 20)},${Math.floor(b * 0.62)},0.5)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.4, 1.4);
    }
    for (let i = 0; i < 60; i++) { // 少量贝壳碎屑/深色颗粒
      ctx.fillStyle = 'rgba(120,100,80,0.35)';
      ctx.beginPath();
      ctx.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 1.6, 0, 7);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(48, 48);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  S.buildTerrain = function (scene) {
    const W = S.CFG.WORLD_SIZE, SEG = 240;
    const geo = new THREE.PlaneGeometry(W, W, SEG, SEG);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cSand = new THREE.Color('#e6cf9b');
    const cSandHi = new THREE.Color('#f0deb2');
    const cWet = new THREE.Color('#bfa276');
    const cShallow = new THREE.Color('#6fae9c');
    const cDeep = new THREE.Color('#2c6b74');
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = S.terrainHeight(x, z);
      pos.setY(i, h);

      // 基础沙色 + 干湿过渡
      const mottle = (S.fbm(x * 0.35 + 3, z * 0.35) - 0.5) * 0.35;
      tmp.copy(cSand).lerp(cSandHi, S.clamp(h * 0.12 + mottle, 0, 1));
      const wet = 1 - S.smoothstep(-0.7, 0.75, h);          // 水线附近湿沙
      tmp.lerp(cWet, wet * 0.8);
      const sub = S.smoothstep(-0.2, -6.5, h);              // 水下海床变深
      tmp.lerp(cShallow, S.smoothstep(-0.3, -1.6, h) * 0.85);
      tmp.lerp(cDeep, sub * 0.9);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: makeSandTexture(),
      roughness: 0.96,
      metalness: 0.0
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    scene.add(mesh);
    return mesh;
  };
})();
