/* ============================================================
 * 天空：湛蓝渐变穹顶 + 程序化积云 + 太阳光斑（低开销 3 层噪声）
 * ============================================================ */
(function () {
  const S = window.Seaside;

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

  const FRAG = `
    uniform float uTime;
    varying vec3 vWorld;
    ${NOISE_GLSL}
    ${SKY_GLSL}

    void main(){
      vec3 d = normalize(vWorld - cameraPosition);
      vec3 col = skyGrad(d);

      // 程序化积云（仅在地平线以上计算，省算力）
      if (d.y > 0.02) {
        vec2 cuv = d.xz / (d.y + 0.16);
        cuv = cuv * 1.1 + vec2(uTime * 0.006, uTime * 0.0023);
        float f  = fbm3(cuv * 0.55 + vec2(13.7, 7.1));
        float f2 = fbm3(cuv * 1.35 + vec2(uTime * 0.011, 0.0));
        float dens = smoothstep(0.54, 0.82, f * 0.72 + f2 * 0.38);
        dens *= smoothstep(0.02, 0.16, d.y);
        vec3 cc = mix(vec3(1.0, 1.0, 1.0), vec3(0.68, 0.74, 0.84),
                      clamp((f2 - 0.42) * 1.7, 0.0, 1.0));
        cc += vec3(1.0, 0.88, 0.72) * pow(max(dot(d, uSunDir), 0.0), 6.0) * 0.22;
        col = mix(col, cc, dens * 0.9);
      }

      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;

  const VERT = `
    varying vec3 vWorld;
    void main(){
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;

  S.buildSky = function (scene) {
    const geo = new THREE.SphereGeometry(900, 40, 20);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: S.SUN_DIR.clone() }
      }
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    scene.add(mesh);
    S.skyUniforms = mat.uniforms;
    S.skyMesh = mesh;
    return mesh;
  };
})();
