import * as THREE from "three";

export default function createCrowd(vertices, colors) {
  const corners = Array.from({ length: 4 }, (_, i) =>
    new THREE.Vector3(...vertices.slice(i * 3, i * 3 + 3)),
  );
  const columns = Math.max(1, Math.ceil(corners[0].distanceTo(corners[1]) / 1.2));
  const rows = Math.max(1, Math.ceil(corners[0].distanceTo(corners[3]) / 1.2));
  const count = columns * rows;
  const positions = new Float32Array(count * 3);
  const baseHeights = new Float32Array(count);
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
      baseHeights[index] = point.z + 0.4;
      const color = palette[(column * 13 + row * 7) % palette.length];
      colorsArray.set([color.r, color.g, color.b], index * 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("color", new THREE.BufferAttribute(colorsArray, 3));
  const material = new THREE.ShaderMaterial({
    vertexShader: `
      attribute vec3 color;
      varying vec3 vColor;
      void main() {
        vColor = color;
        gl_PointSize = 3.5;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5));
        float alpha = (1.0 - smoothstep(0.3, 0.5, radius)) * 0.85;
        gl_FragColor = vec4(vColor, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return {
    points,
    update(time, energy) {
      for (let i = 0; i < count; i++) {
        positions[i * 3 + 2] = baseHeights[i] +
          Math.sin(time * 4 + i * 2.4) * Math.min(energy, 1) * 0.18;
      }
      geometry.attributes.position.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
