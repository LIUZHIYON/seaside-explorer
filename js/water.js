/* ============================================================
 * 海洋：Gerstner 波顶点位移 + 深度渐变/菲涅尔/白浪/岸沫 着色器
 * v2：Beer-Lambert 吸收（浅水清澈见底）+ 低开销噪声（3 层）
 * ============================================================ */
(function () {
  const S = window.Seaside;

  // 与 config.js 中 S.WAVES 保持一致的 GLSL 常量
  const WAVE_CONST = `
    const int NW = 5;
    const vec4 WAVES[NW] = vec4[NW](
      vec4(1.0, 0.25, 0.085, 64.0),
      vec4(0.62, 1.0, 0.09, 34.0),
      vec4(-0.35, 0.85, 0.10, 19.0),
      vec4(0.9, -0.42, 0.12, 10.0),
      vec4(0.5, 0.78, 0.14, 5.5)
    );`;

  // 3 层 fbm：视觉足够，开销约为 5 层的 60%
  const NOISE_GLSL = `
    float hash21(vec2 p){ p = fract(p*vec2(123.34, 345.45)); p += dot(p, p+34.345); return fract(p.x*p.y); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f*f*(3.0-2.0*f);
      float a = hash21(i), b = hash21(i+vec2(1.0,0.0));
      float c = hash21(i+vec2(0.0,1.0)), d = hash21(i+vec2(1.0,1.0));
      return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
    }
    float fbm3(vec2 p){
      float v = 0.0, a = 0.5;
      for(int i=0;i<3;i++){ v += a*vnoise(p); p = p*2.07 + vec2(17.3, 9.1); a *= 0.5; }
      return v * 1.14;
    }`;

  // 天空渐变函数：水面反射与天空盒共用，保证视觉一致
  const SKY_GLSL = `
    uniform vec3 uSunDir;
    vec3 skyGrad(vec3 d){
      float h = clamp(d.y, 0.0, 1.0);
      vec3 zen = vec3(0.02, 0.19, 0.64);
      vec3 hor = vec3(0.63, 0.81, 0.94);
      vec3 c = mix(hor, zen, pow(h, 0.5));
      float s = max(dot(d, uSunDir), 0.0);
      c += vec3(1.0, 0.85, 0.60) * pow(s, 8.0) * 0.18;
      c += vec3(1.0, 0.96, 0.86) * pow(s, 400.0) * 1.4;
      return c;
    }`;

  const VERT = `
    uniform float uTime;
    uniform float uWorldSize;
    uniform float uHMin;
    uniform float uHRange;
    uniform sampler2D uHeightMap;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying float vH;
    varying float vDepth;
    ${WAVE_CONST}

    float hmap(vec2 xz){
      vec2 uv = xz / uWorldSize + 0.5;
      vec4 t = texture2D(uHeightMap, uv);
      float v = t.r + t.g / 255.0;
      return v * uHRange + uHMin;
    }

    void main(){
      vec2 xz = position.xz;
      vec3 disp = vec3(0.0);
      vec3 tang = vec3(1.0, 0.0, 0.0);
      vec3 bin = vec3(0.0, 0.0, 1.0);
      for(int i = 0; i < NW; i++){
        vec2 d = normalize(WAVES[i].xy);
        float steep = WAVES[i].z;
        float L = WAVES[i].w;
        float k = 6.2831853 / L;
        float c = sqrt(9.8 / k);
        float f = k * (dot(d, xz) - c * uTime);
        float a = steep / k;
        float s = sin(f), co = cos(f);
        disp.x += d.x * a * co;
        disp.z += d.y * a * co;
        disp.y += a * s;
        tang += vec3(-d.x*d.x*steep*s, d.x*steep*co, -d.x*d.y*steep*s);
        bin  += vec3(-d.x*d.y*steep*s, d.y*steep*co, -d.y*d.y*steep*s);
      }
      vec3 wp = vec3(xz.x, 0.0, xz.y) + disp;
      vH = disp.y;
      vDepth = -hmap(xz);
      vNormal = normalize(cross(bin, tang));
      vWorld = wp;
      gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    }`;

  const FRAG = `
    uniform float uTime;
    uniform vec3 uCamPos;
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying float vH;
    varying float vDepth;
    ${NOISE_GLSL}
    ${SKY_GLSL}

    void main(){
      vec3 N = normalize(vNormal);
      // 高频细波扰动法线，产生粼粼波光
      float n1 = fbm3(vWorld.xz * 0.5 + uTime * 0.35);
      float n2 = fbm3(vWorld.xz * 0.5 - uTime * 0.28 + 31.7);
      N = normalize(N + vec3(n1 - 0.5, 0.0, n2 - 0.5) * 0.40);

      vec3 V = normalize(uCamPos - vWorld);
      float depth = max(vDepth, 0.0);
      // 水体吸收：越深越蓝越不透明（Beer-Lambert 近似）
      float absorb = 1.0 - exp(-depth * 0.42);
      vec3 shallowC = vec3(0.05, 0.55, 0.55);
      vec3 deepC = vec3(0.004, 0.11, 0.28);
      vec3 baseCol = mix(shallowC, deepC, absorb);

      vec3 R = reflect(-V, N);
      R.y = abs(R.y) + 0.02;
      R = normalize(R);
      vec3 sky = skyGrad(R);
      float fres = 0.04 + 0.92 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

      vec3 H = normalize(uSunDir + V);
      float ndh = max(dot(N, H), 0.0);
      float spec = pow(ndh, 260.0) * 2.6 + pow(ndh, 48.0) * 0.32;

      // 岸边碎浪：随周期涌上沙滩又退去
      float fn = fbm3(vWorld.xz * 0.16 + uTime * 0.10);
      float shore = smoothstep(0.55, 0.03, depth);
      float swash = 0.5 + 0.5 * sin(uTime * 0.85 - depth * 2.4 + fn * 6.2);
      // 浪尖白沫
      float crest = smoothstep(0.78, 1.28, vH * 0.95 + (fn - 0.5) * 0.55);
      float foamN = fbm3(vWorld.xz * 1.05 + vec2(uTime * 0.35, -uTime * 0.22));
      float foam = shore * (0.30 + 0.85 * swash) * smoothstep(0.34, 0.8, foamN) + crest * 0.9;
      foam = clamp(foam, 0.0, 1.0);

      vec3 col = mix(baseCol, sky, clamp(fres, 0.0, 1.0));
      col += vec3(1.0, 0.95, 0.82) * spec;
      col = mix(col, vec3(0.97, 0.99, 1.0), foam * 0.92);

      float dist = length(uCamPos - vWorld);
      float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
      col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));

      // 透明度同样服从吸收定律：浅水清澈见底，深水不透光
      float alpha = clamp(1.0 - exp(-depth * 0.62), 0.12, 1.0);
      alpha = max(alpha, foam);
      alpha = clamp(alpha + fres * 0.12, 0.0, 1.0);

      gl_FragColor = vec4(col, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;

  S.buildWater = function (scene, heightMapTex) {
    const geo = new THREE.PlaneGeometry(S.CFG.WORLD_SIZE, S.CFG.WORLD_SIZE, 224, 224);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uWorldSize: { value: S.CFG.WORLD_SIZE },
        uHMin: { value: S.CFG.HEIGHT_MIN },
        uHRange: { value: S.CFG.HEIGHT_MAX - S.CFG.HEIGHT_MIN },
        uHeightMap: { value: heightMapTex },
        uSunDir: { value: S.SUN_DIR.clone() },
        uCamPos: { value: new THREE.Vector3() },
        uFogColor: { value: new THREE.Color(0xbfe0f0) },
        uFogDensity: { value: 0.0022 }
      }
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
    S.waterUniforms = mat.uniforms;
    return mesh;
  };
})();
