import * as THREE from "three";

export default function createCrowd(vertices, colors) {
  const corners = Array.from(
    { length: 4 },
    (_, i) => new THREE.Vector3(...vertices.slice(i * 3, i * 3 + 3)),
  );
  const columns = Math.max(
    1,
    Math.ceil(corners[0].distanceTo(corners[1]) / 1.8),
  );
  const rows = Math.max(1, Math.ceil(corners[0].distanceTo(corners[3]) / 1.8));
  const count = columns * rows;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const colorsArray = new Float32Array(count * 3);
  const palette = colors.map((color) => new THREE.Color(color));
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      const index = column * rows + row;
      const along = (column + 0.5) / columns;
      const across = (row + 0.5) / rows;
      const inner = corners[0].clone().lerp(corners[1], along);
      const outer = corners[3].clone().lerp(corners[2], along);
      const point = inner.lerp(outer, across);
      positions.set([point.x, point.y, point.z + 0.4], index * 3);
      const hash =
        Math.abs(Math.sin(column * 12.9898 + row * 78.233) * 43758.5453) % 1;
      seeds[index] = hash;
      const color = palette[Math.floor(hash * 997) % palette.length];
      colorsArray.set([color.r, color.g, color.b], index * 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("color", new THREE.BufferAttribute(colorsArray, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uEnergy: { value: 0 } },
    vertexShader: `
      attribute vec3 color;
      attribute float aSeed;
      uniform float uTime;
      uniform float uEnergy;
      varying vec3 vColor;
      varying float vCore;
      varying float vCycle;
      varying float vShout;
      void main() {
        vColor = color;
        float phase = uTime * (3.0 + aSeed * 3.0) + aSeed * 40.0;
        float activity = clamp(uEnergy * 2.0, 0.0, 1.0);
        float bob = sin(uTime * 1.6 + aSeed * 30.0) * 0.45 * activity;
        vec2 sway = vec2(sin(uTime * 1.1 + aSeed * 50.0), cos(uTime * 0.9 + aSeed * 70.0)) * (0.5 + uEnergy * 0.6) * activity;
        float jump = max(sin(phase), 0.0) * uEnergy * 1.3;
        vec3 displaced = position + vec3(sway, bob + jump);
        float core = 8.0 + uEnergy * 2.0 * max(sin(phase), 0.0);
        float size = core + activity * 16.0;
        vCore = core / size * 0.5;
        vCycle = fract(phase / 6.2831853);
        vShout = activity * step(0.35, fract(aSeed * 7.0 + 0.5 * sin(uTime * 0.5 + aSeed * 20.0)));
        gl_PointSize = size;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vCore;
      varying float vCycle;
      varying float vShout;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5));
        float coreAlpha = 1.0 - smoothstep(vCore * 0.75, vCore, radius);
        float ringRadius = mix(vCore, 0.5, vCycle);
        float ring = (1.0 - smoothstep(0.0, 0.05, abs(radius - ringRadius)))
          * (1.0 - vCycle) * vShout * 0.9;
        float alpha = max(coreAlpha, ring);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vColor, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  let lastTime = null;
  let clock = 0;
  let currentEnergy = 0;
  return {
    points,
    update(time, energy, active = true) {
      const dt =
        lastTime === null ? 0 : Math.min(Math.max(time - lastTime, 0), 0.1);
      lastTime = time;
      if (!active) return;
      clock += dt;
      const target = Math.min(energy, 1);
      currentEnergy += (target - currentEnergy) * (1 - Math.exp(-dt * 5));
      material.uniforms.uTime.value = clock;
      material.uniforms.uEnergy.value = currentEnergy;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
