/* ============================================================
 * 后处理：亮部提取 → 高斯模糊（两次）→ 合成（辉光/暗角/颗粒）
 * 纯 WebGL2 手写，不依赖 examples/jsm
 * ============================================================ */
(function () {
  const S = window.Seaside;

  let renderer, scene, camera;
  let rtScene, rtA, rtB, quad, quadCam;
  let matBright, matBlur, matComposite;
  let enabled = true;

  const VERT = `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  const FRAG_BRIGHT = `
    uniform sampler2D tDiffuse;
    uniform float uThreshold;
    varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float k = smoothstep(uThreshold, uThreshold + 0.6, l);
      gl_FragColor = vec4(c * k, 1.0);
    }`;

  const FRAG_BLUR = `
    uniform sampler2D tDiffuse;
    uniform vec2 uDir;
    varying vec2 vUv;
    void main(){
      vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227027;
      sum += texture2D(tDiffuse, vUv + uDir * 1.3846).rgb * 0.316216;
      sum += texture2D(tDiffuse, vUv - uDir * 1.3846).rgb * 0.316216;
      sum += texture2D(tDiffuse, vUv + uDir * 3.2308).rgb * 0.070270;
      sum += texture2D(tDiffuse, vUv - uDir * 3.2308).rgb * 0.070270;
      gl_FragColor = vec4(sum, 1.0);
    }`;

  const FRAG_COMPOSITE = `
    uniform sampler2D tScene;
    uniform sampler2D tBloom;
    uniform float uStrength;
    uniform float uTime;
    varying vec2 vUv;
    float h21(vec2 p){ p = fract(p*vec2(123.34, 345.45)); p += dot(p, p+34.345); return fract(p.x*p.y); }
    void main(){
      vec3 base = texture2D(tScene, vUv).rgb;
      vec3 bloom = texture2D(tBloom, vUv).rgb;
      vec3 col = base + bloom * uStrength;
      // 暗角
      float d = distance(vUv, vec2(0.5));
      col *= 1.0 - smoothstep(0.45, 0.95, d) * 0.32;
      // 细微胶片颗粒
      col += (h21(vUv * 900.0 + uTime) - 0.5) * 0.014;
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`;

  S.initPostFX = function (r, s, c) {
    renderer = r; scene = s; camera = c;

    const size = new THREE.Vector2();
    renderer.getSize(size);
    const pr = renderer.getPixelRatio();
    const w = Math.max(2, Math.floor(size.x * pr));
    const h = Math.max(2, Math.floor(size.y * pr));

    rtScene = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, samples: 4,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter
    });
    const hw = Math.max(2, Math.floor(w / 2)), hh = Math.max(2, Math.floor(h / 2));
    rtA = new THREE.WebGLRenderTarget(hw, hh, { type: THREE.HalfFloatType });
    rtB = new THREE.WebGLRenderTarget(hw, hh, { type: THREE.HalfFloatType });

    matBright = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG_BRIGHT,
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: 0.72 } }, depthTest: false
    });
    matBlur = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG_BLUR,
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, depthTest: false
    });
    matComposite = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG_COMPOSITE,
      uniforms: {
        tScene: { value: null }, tBloom: { value: null },
        uStrength: { value: 0.42 }, uTime: { value: 0 }
      }, depthTest: false
    });

    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matBright);
    quad.frustumCulled = false;
    const qs = new THREE.Scene();
    qs.add(quad);
    S._quadScene = qs;
    quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    S._quadCam = quadCam;
  };

  function pass(mat, target) {
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(S._quadScene, quadCam);
  }

  S.renderPostFX = function (time) {
    if (!enabled || !rtScene) { renderer.render(scene, camera); return; }
    const size = new THREE.Vector2();
    renderer.getSize(size);
    const pr = renderer.getPixelRatio();
    const w = Math.max(2, Math.floor(size.x * pr));
    const h = Math.max(2, Math.floor(size.y * pr));
    if (rtScene.width !== w || rtScene.height !== h) S.resizePostFX(w, h);

    renderer.setRenderTarget(rtScene);
    renderer.clear();
    renderer.render(scene, camera);

    // 亮部提取
    matBright.uniforms.tDiffuse.value = rtScene.texture;
    pass(matBright, rtA);

    // 横向 / 纵向模糊
    matBlur.uniforms.tDiffuse.value = rtA.texture;
    matBlur.uniforms.uDir.value.set(1 / rtA.width, 0);
    pass(matBlur, rtB);
    matBlur.uniforms.tDiffuse.value = rtB.texture;
    matBlur.uniforms.uDir.value.set(0, 1 / rtA.height);
    pass(matBlur, rtA);

    // 合成到屏幕
    matComposite.uniforms.tScene.value = rtScene.texture;
    matComposite.uniforms.tBloom.value = rtA.texture;
    matComposite.uniforms.uTime.value = time;
    quad.material = matComposite;
    renderer.setRenderTarget(null);
    renderer.render(S._quadScene, quadCam);
  };

  S.resizePostFX = function (w, h) {
    if (!rtScene) return;
    rtScene.setSize(w, h);
    rtA.setSize(Math.max(2, Math.floor(w / 2)), Math.max(2, Math.floor(h / 2)));
    rtB.setSize(Math.max(2, Math.floor(w / 2)), Math.max(2, Math.floor(h / 2)));
  };

  S.setPostFX = function (on) { enabled = !!on; };
  S.postFXOn = function () { return enabled; };
})();
