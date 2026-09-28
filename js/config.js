/* ============================================================
 * 听海 · Seaside Breeze —— 全局配置与共享数学函数
 * 地形高度函数与波浪函数在此唯一定义，供地形/水面/船只共用
 * ============================================================ */
(function () {
  const S = (window.Seaside = window.Seaside || {});

  S.CFG = {
    WORLD_SIZE: 520,      // 地形/水面覆盖范围（米）
    HEIGHT_MIN: -24,      // 高度图编码范围
    HEIGHT_MAX: 24,
    SEA_LEVEL: 0,
    EYE: 1.65,            // 眼睛离地高度
    WALK: 5.2,            // 步行速度
    RUN: 9.2,             // 冲刺速度
    SWIM: 2.6,            // 游泳速度
    WORLD_LIMIT: 242      // 玩家活动边界
  };

  S.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  S.lerp = (a, b, t) => a + (b - a) * t;

  S.smoothstep = (a, b, x) => {
    const t = S.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  /* ---------- 确定性值噪声（地形用） ---------- */
  S.hash2 = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  S.vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = S.hash2(xi, yi), b = S.hash2(xi + 1, yi);
    const c = S.hash2(xi, yi + 1), d = S.hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  S.fbm = (x, y, oct) => {
    oct = oct || 4;
    let val = 0, amp = 0.5, fx = x, fy = y;
    for (let i = 0; i < oct; i++) {
      val += amp * S.vnoise(fx, fy);
      fx = fx * 2.03 + 17.31; fy = fy * 2.03 + 9.17;
      amp *= 0.5;
    }
    return val;
  };

  /* ---------- 地形高度函数（海平面=0，陆地位于 -z 方向） ---------- */
  S.terrainHeight = (x, z) => {
    // 基础坡面：内陆 7.5m 高，向 +z 海洋方向下降，z=18 处过水面
    let h = 7.5 * (1 - S.smoothstep(-130, 18, z));
    h -= S.smoothstep(18, 150, z) * 9.0;                       // 深海区
    const inland = S.smoothstep(14, -46, z);                   // 沙丘起伏
    h += inland * (S.fbm(x * 0.021 + 7.3, z * 0.021 + 3.1) - 0.5) * 4.6;
    h += (S.fbm(x * 0.09, z * 0.09) - 0.5) * 0.6;              // 全域细碎起伏

    // 西侧海岬丘陵
    h += 10.5 * S.smoothstep(-58, -175, x) *
         (0.5 + 0.95 * S.fbm(x * 0.02 + 5.2, z * 0.02 + 9.7));

    // 东侧小岛（驾船可前往的目的地）
    const dx = x - 128, dz = z - 62;
    h += 6.4 * Math.exp(-(dx * dx + dz * dz) / 1500);

    // 边缘抬升（仅陆地侧），防止看到地形边界
    if (z < 5) h += 12 * S.smoothstep(158, 205, Math.max(Math.abs(x), Math.abs(z)));
    return h;
  };

  /* ---------- Gerstner 波浪（与水面着色器严格一致） ---------- */
  // 每个波：[dirX, dirZ, steepness, wavelength]
  S.WAVES = [
    [1.0, 0.25, 0.085, 64.0],
    [0.62, 1.0, 0.09, 34.0],
    [-0.35, 0.85, 0.10, 19.0],
    [0.9, -0.42, 0.12, 10.0],
    [0.5, 0.78, 0.14, 5.5],
    [0.85, 0.42, 0.10, 3.2],
    [-0.6, 0.3, 0.09, 2.1]
  ];

  S.waveHeight = (x, z, t) => {
    let y = 0;
    for (let i = 0; i < S.WAVES.length; i++) {
      const w = S.WAVES[i];
      const len = Math.hypot(w[0], w[1]);
      const dx = w[0] / len, dz = w[1] / len;
      const k = (2 * Math.PI) / w[3];
      const c = Math.sqrt(9.8 / k);
      const f = k * (dx * x + dz * z - c * t);
      y += (w[2] / k) * Math.sin(f);
    }
    return y;
  };

  /* ---------- 太阳方向（场景各处共用） ---------- */
  S.SUN_DIR = new THREE.Vector3(-0.34, 0.56, 0.76).normalize();
})();
