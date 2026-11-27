import { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useReducedMotion, type MotionValue } from 'framer-motion';
import { CanvasTexture, SRGBColorSpace, type Group, type Mesh } from 'three';
import { explodeFromProgress } from './clusterMath';
import brandLogo from '@/assets/logo.png';

export interface ModuleSpec {
  label: string;
  color: string;
  icon: LucideIcon;
}

/**
 * Eight module "app icons" (CRM, HR, invoicing, marketing...) fly apart to
 * read as distinct tools, then merge into one block carrying the brand logo —
 * the "8 tools, one system" claim as a real object. Explode/merge is driven by
 * scroll position, the cursor tilts it, and a toggle shows the wireframe.
 *
 * Built to stay smooth: standard materials and plain lights (no environment
 * map, no contact-shadow pass), and logos/labels baked into textures instead
 * of DOM overlays that would be re-positioned every frame.
 */

const TEX = 512;

/** Lucide icon → SVG markup, rendered once off-DOM. */
function iconSvg(Icon: ModuleSpec['icon'], color: string): string {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(<Icon size={24} color={color} strokeWidth={1.75} />));
  const svg = host.innerHTML;
  root.unmount();
  return svg.includes('xmlns') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, start: number) {
  let size = start;
  do {
    ctx.font = `600 ${size}px "Inter Tight", Inter, system-ui, sans-serif`;
    size -= 2;
  } while (ctx.measureText(text).width > maxWidth && size > 20);
}

/** Paper app-icon face: tinted glyph plate, module icon, module name. */
async function moduleFace(m: ModuleSpec): Promise<CanvasTexture> {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const ctx = c.getContext('2d')!;
  roundedRect(ctx, 0, 0, TEX, TEX, 64);
  ctx.fillStyle = '#FBF8F3';
  ctx.fill();

  // glyph plate tinted with the module colour
  roundedRect(ctx, TEX / 2 - 112, 78, 224, 224, 52);
  ctx.fillStyle = `${m.color}1f`;
  ctx.fill();
  const svg = iconSvg(m.icon, m.color);
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  ctx.drawImage(img, TEX / 2 - 76, 114, 152, 152);

  ctx.fillStyle = '#17120E';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, m.label, TEX - 72, 54);
  ctx.fillText(m.label, TEX / 2, 392);

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Brand face for the merged block: logo + "Ét system". */
async function brandFace(label: string): Promise<CanvasTexture> {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const ctx = c.getContext('2d')!;
  roundedRect(ctx, 0, 0, TEX, TEX, 64);
  ctx.fillStyle = '#111827';
  ctx.fill();
  const logo = await loadImage(brandLogo);
  ctx.drawImage(logo, TEX / 2 - 150, 52, 300, 300);
  ctx.fillStyle = '#F8FAFC';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, label, TEX - 80, 58);
  ctx.fillText(label, TEX / 2, 412);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function useFaces(modules: ModuleSpec[], mergedLabel: string) {
  // Only redraw when what is painted changes, not on every parent render.
  const key = modules.map((m) => `${m.label}|${m.color}`).join('·') + `·${mergedLabel}`;
  const latest = useRef(modules);
  latest.current = modules;
  const [faces, setFaces] = useState<{ modules: CanvasTexture[]; brand: CanvasTexture } | null>(null);
  useEffect(() => {
    let alive = true;
    let made: CanvasTexture[] = [];
    const draw = async () => {
      // wait for the web font so the baked labels use the real typeface
      await document.fonts?.ready;
      const [brand, ...mods] = await Promise.all([brandFace(mergedLabel), ...latest.current.map(moduleFace)]);
      made = [brand, ...mods];
      if (alive) setFaces({ modules: mods, brand });
      else made.forEach((t) => t.dispose());
    };
    draw().catch(() => {
      /* textures are decoration; the blocks still render without them */
    });
    return () => {
      alive = false;
      made.forEach((t) => t.dispose());
    };
  }, [key, mergedLabel]);
  return faces;
}

/** Compile shaders and upload textures once, even while the loop is paused
 *  offscreen, so the first visible frame doesn't stall. */
function WarmUp({ token }: { token: unknown }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    gl.compile(scene, camera);
    gl.render(scene, camera);
  }, [gl, scene, camera, token]);
  return null;
}

function PointerTilt({ children }: { children: React.ReactNode }) {
  const outer = useRef<Group>(null);
  useFrame((state) => {
    if (!outer.current) return;
    const { x, y } = state.pointer; // normalized device coords, -1..1
    outer.current.rotation.x += (-y * 0.18 - outer.current.rotation.x) * 0.06;
    outer.current.rotation.y += (x * 0.22 - outer.current.rotation.y) * 0.06;
  });
  return <group ref={outer}>{children}</group>;
}

const TILE = 0.62;
const TILE_DEPTH = 0.1;
const CENTER = 0.95;
const CENTER_DEPTH = 0.18;

function Tiles({
  modules,
  faces,
  progress,
  spin,
  blueprint,
  onTick,
}: {
  modules: ModuleSpec[];
  faces: { modules: CanvasTexture[]; brand: CanvasTexture } | null;
  progress: MotionValue<number>;
  spin: boolean;
  blueprint: boolean;
  onTick?: () => void;
}) {
  const group = useRef<Group>(null);
  const tileRefs = useRef<(Group | null)[]>([]);
  const prevExplodeRef = useRef(0);
  const centerRef = useRef<Group>(null);

  const radius = 1.55;
  const count = modules.length;
  const basePositions = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, y: Math.sin(angle * 2) * 0.3, angle };
      }),
    [count],
  );

  useFrame((_, delta) => {
    const e = explodeFromProgress(progress.get());

    // Snap-tick at full separation and full merge — the two "clicks" of the story.
    const prev = prevExplodeRef.current;
    if ((prev < 0.98 && e >= 0.98) || (prev > 0.02 && e <= 0.02)) onTick?.();
    prevExplodeRef.current = e;

    if (spin && group.current) group.current.rotation.y += delta * (0.08 + (1 - e) * 0.08);

    tileRefs.current.forEach((tile, i) => {
      if (!tile) return;
      const p = basePositions[i];
      tile.position.set(p.x * e, p.y * e, p.z * e);
      // face outward-ish while apart so the logos read; flat when merged
      tile.rotation.set(0.3 * e, -p.angle * e + Math.PI / 2 * e, 0.08 * e);
      const s = 0.85 + 0.15 * e;
      tile.scale.set(s, s, s);
    });

    if (centerRef.current) {
      const s = 1 - e * 0.15;
      centerRef.current.scale.set(s, s, s);
    }
  });

  return (
    <group ref={group} rotation={[0.1, 0, 0]}>
      {modules.map((m, i) => (
        <group key={m.label} ref={(el) => (tileRefs.current[i] = el)}>
          <RoundedBox args={[TILE, TILE, TILE_DEPTH]} radius={0.08} smoothness={3}>
            <meshStandardMaterial
              color={blueprint ? '#7fb3ff' : '#F3EEE6'}
              roughness={0.45}
              metalness={0.05}
              wireframe={blueprint}
            />
          </RoundedBox>
          {faces && !blueprint && (
            <>
              <mesh position={[0, 0, TILE_DEPTH / 2 + 0.002]}>
                <planeGeometry args={[TILE * 0.96, TILE * 0.96]} />
                <meshBasicMaterial map={faces.modules[i]} transparent toneMapped={false} />
              </mesh>
              <mesh position={[0, 0, -TILE_DEPTH / 2 - 0.002]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[TILE * 0.96, TILE * 0.96]} />
                <meshBasicMaterial map={faces.modules[i]} transparent toneMapped={false} />
              </mesh>
            </>
          )}
        </group>
      ))}

      {/* The merged center block — "one system", carrying the brand logo */}
      <group ref={centerRef}>
        <RoundedBox args={[CENTER, CENTER, CENTER_DEPTH]} radius={0.1} smoothness={3}>
          <meshStandardMaterial color={blueprint ? '#7fb3ff' : '#111827'} roughness={0.35} metalness={0.2} wireframe={blueprint} />
        </RoundedBox>
        {faces && !blueprint && (
          <>
            <mesh position={[0, 0, CENTER_DEPTH / 2 + 0.002]}>
              <planeGeometry args={[CENTER * 0.96, CENTER * 0.96]} />
              <meshBasicMaterial map={faces.brand} transparent toneMapped={false} />
            </mesh>
            <mesh position={[0, 0, -CENTER_DEPTH / 2 - 0.002]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[CENTER * 0.96, CENTER * 0.96]} />
              <meshBasicMaterial map={faces.brand} transparent toneMapped={false} />
            </mesh>
          </>
        )}
      </group>
    </group>
  );
}

export function ModuleCluster3D({
  modules,
  mergedLabel,
  progress,
  blueprint = false,
  active = true,
  onTick,
  className,
}: {
  modules: ModuleSpec[];
  mergedLabel: string;
  progress: MotionValue<number>;
  blueprint?: boolean;
  /** false stops the render loop entirely (section scrolled offscreen). */
  active?: boolean;
  onTick?: () => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const faces = useFaces(modules, mergedLabel);

  return (
    <div className={className} aria-hidden>
      <Canvas
        camera={{ position: [3.2, 2.1, 3.2], fov: 36 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
        frameloop={active ? 'always' : 'never'}
      >
        <ambientLight intensity={1.1} />
        <directionalLight position={[-4, 5, 3]} intensity={1.6} color="#fff6ea" />
        <directionalLight position={[4, 1, -2]} intensity={0.6} color="#eaf3ff" />
        <WarmUp token={faces} />
        <PointerTilt>
          <Tiles modules={modules} faces={faces} progress={progress} spin={!reduceMotion} blueprint={blueprint} onTick={onTick} />
        </PointerTilt>
      </Canvas>
    </div>
  );
}

export default ModuleCluster3D;
