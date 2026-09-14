// ---------------------------------------------------------------------------
// Shared procedural environment builders used by multiple themes.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { noiseTexture } from "../three/util";
import { makeFlame } from "../effects/LightingEffects";

export function stoneMaterial(color: number, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
    map: noiseTexture("#808080", "#666", 500, 0.16),
  });
}

export function woodMaterial(color: number, roughness = 0.75): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.03,
    map: noiseTexture("#8a6a4a", "#5c4430", 420, 0.2),
  });
}

export interface TorchBuild {
  group: THREE.Group;
  flame: THREE.Mesh;
  light: THREE.PointLight;
}

export function buildTorch(height = 2.2, flameColor = 0xff9a3c): TorchBuild {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.85 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, height, 8), poleMat);
  pole.position.y = height / 2;
  pole.castShadow = true;
  group.add(pole);
  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.08, 0.16, 8),
    new THREE.MeshStandardMaterial({ color: 0x2c2018, roughness: 0.6, metalness: 0.5 }),
  );
  cup.position.y = height;
  group.add(cup);
  const flame = makeFlame(flameColor, 1.4);
  flame.position.y = height + 0.2;
  group.add(flame);
  const light = new THREE.PointLight(flameColor, 6, 8, 1.8);
  light.position.y = height + 0.3;
  group.add(light);
  return { group, flame, light };
}

export interface TowerBuild {
  group: THREE.Group;
  roof: THREE.Mesh;
}

export function buildTower(
  radius = 1.3,
  height = 5.5,
  stoneColor = 0x7d7468,
  roofColor = 0x5c2e2e,
): TowerBuild {
  const group = new THREE.Group();
  const mat = stoneMaterial(stoneColor);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.12, height, 12), mat);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.12, radius * 1.12, 0.4, 12), mat);
  rim.position.y = height;
  group.add(rim);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(radius * 1.22, radius * 1.7, 12),
    new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.8 }),
  );
  roof.position.y = height + radius * 0.85 + 0.15;
  roof.castShadow = true;
  group.add(roof);
  return { group, roof };
}

export function buildBanner(color: number, width = 0.7, height = 1.5): THREE.Group {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.6 }),
  );
  pole.position.y = height / 2 + 0.1;
  group.add(pole);
  const geo = new THREE.PlaneGeometry(width, height, 4, 8);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    side: THREE.DoubleSide,
    map: noiseTexture("#ffffff", "#dddddd", 120, 0.12),
  });
  const cloth = new THREE.Mesh(geo, mat);
  cloth.position.y = 0;
  cloth.castShadow = true;
  group.add(cloth);
  return group;
}

export function buildRock(scale = 1, color = 0x6c675f): THREE.Mesh {
  const geo = new THREE.DodecahedronGeometry(scale, 0);
  geo.scale(1, 0.75, 1);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }),
  );
  mesh.castShadow = true;
  return mesh;
}

export function buildMountain(radius: number, height: number, color: number): THREE.Mesh {
  const geo = new THREE.ConeGeometry(radius, height, 7, 3);
  // Roughen vertices slightly.
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < height / 2 - 0.01) {
      pos.setX(i, pos.getX(i) * (0.85 + Math.random() * 0.3));
      pos.setZ(i, pos.getZ(i) * (0.85 + Math.random() * 0.3));
    }
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }),
  );
  return mesh;
}

/** Simple glowing box "building" with window texture for cityscapes. */
export function buildSkyscraper(
  w: number,
  h: number,
  d: number,
  bodyColor: number,
  windowColor: number,
): THREE.Mesh {
  const tex = noiseTexture("#111", "#000", 40, 0.5);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, 128, 128);
  const c = new THREE.Color(windowColor);
  for (let y = 6; y < 128; y += 9) {
    for (let x = 6; x < 128; x += 9) {
      if (Math.random() < 0.45) {
        const a = 0.35 + Math.random() * 0.65;
        ctx.fillStyle = `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`;
        ctx.fillRect(x, y, 5, 4);
      }
    }
  }
  const windows = new THREE.CanvasTexture(canvas);
  windows.colorSpace = THREE.SRGBColorSpace;
  tex.dispose();
  const mat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.4,
    metalness: 0.6,
    emissive: 0xffffff,
    emissiveMap: windows,
    emissiveIntensity: 0.9,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  return mesh;
}
