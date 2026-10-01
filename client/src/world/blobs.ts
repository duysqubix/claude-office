// Cheap fake ambient occlusion: soft dark decals on the floor under furniture. All blobs added
// before `build()` share one mesh (one draw call).
import * as THREE from 'three';

let atlas: THREE.CanvasTexture | null = null;

/** Left half: round blob. Right half: soft rounded rectangle. White RGB, shape in alpha. */
function blobAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // Rounded rect blurred by stacking translucent insets.
  ctx.save();
  ctx.translate(128, 0);
  for (let i = 0; i < 26; i++) {
    const inset = 4 + i * 1.6;
    ctx.fillStyle = 'rgba(255,255,255,0.075)';
    ctx.beginPath();
    ctx.roundRect(inset, inset, 128 - inset * 2, 128 - inset * 2, 28 - i * 0.6);
    ctx.fill();
  }
  ctx.restore();
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  return atlas;
}

export class Blobs {
  private pos: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];

  /** Add a blob centred at (x, z), `w` × `d` metres, rotated by `yaw`. */
  add(x: number, z: number, w: number, d: number, opts: { yaw?: number; shape?: 'round' | 'rect'; y?: number } = {}): void {
    const { yaw = 0, shape = 'rect', y = 0.036 } = opts;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const base = this.pos.length / 3;
    const u0 = shape === 'round' ? 0 : 0.5;
    const hw = w / 2;
    const hd = d / 2;
    const corners = [
      [-hw, -hd, u0, 1],
      [hw, -hd, u0 + 0.5, 1],
      [hw, hd, u0 + 0.5, 0],
      [-hw, hd, u0, 0],
    ];
    for (const [lx, lz, u, v] of corners) {
      this.pos.push(x + lx * c + lz * s, y, z - lx * s + lz * c);
      this.uv.push(u, v);
    }
    this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  build(opacity = 0.32): THREE.Mesh | null {
    if (this.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        map: blobAtlas(),
        color: '#2A2238',
        transparent: true,
        opacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    mesh.name = 'blob-shadows';
    mesh.renderOrder = 1;
    this.pos = [];
    this.uv = [];
    this.idx = [];
    return mesh;
  }
}
