import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer, RoundedBox, ContactShadows, Html } from '@react-three/drei';
import { useReducedMotion, type MotionValue } from 'framer-motion';
import type { Group, Mesh } from 'three';
import { explodeFromProgress } from './clusterMath';

export interface ModuleSpec {
  label: string;
  color: string;
}

/**
 * Eight module blocks (CRM, HR, invoicing, marketing...) that fly apart to
 * read as distinct tools, then merge into one solid block — the "8 tools,
 * one system" claim rendered as a real object instead of a stock icon grid.
 * Explode/merge is driven directly by scroll position through the section,
 * not a timer, so the object *is* the scroll story. The cursor also tilts
 * it slightly and a toggle swaps every surface for its edges — proof this
 * is live geometry, not a looping video.
 */
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

function Tiles({
  modules,
  mergedLabel,
  progress,
  spin,
  blueprint,
  onTick,
}: {
  modules: ModuleSpec[];
  mergedLabel: string;
  progress: MotionValue<number>;
  spin: boolean;
  blueprint: boolean;
  onTick?: () => void;
}) {
  const group = useRef<Group>(null);
  const tileRefs = useRef<(Mesh | null)[]>([]);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const explodeRef = useRef(0);
  const prevExplodeRef = useRef(0);
  const centerRef = useRef<Mesh>(null);
  const mergedLabelRef = useRef<HTMLDivElement>(null);

  const radius = 1.55;
  const count = modules.length;
  const basePositions = useMemo(
    () =>
      modules.map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        return {
          x: Math.cos(angle) * radius,
          z: Math.sin(angle) * radius,
          y: Math.sin(angle * 2) * 0.3,
          angle,
        };
      }),
    [count],
  );

  useFrame((_, delta) => {
    const e = explodeFromProgress(progress.get());
    explodeRef.current = e;

    // Snap-tick at full separation and full merge — the two "clicks" of the story.
    const prev = prevExplodeRef.current;
    if ((prev < 0.98 && e >= 0.98) || (prev > 0.02 && e <= 0.02)) {
      onTick?.();
    }
    prevExplodeRef.current = e;

    if (spin && group.current) {
      group.current.rotation.y += delta * (0.08 + (1 - e) * 0.08);
    }

    tileRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const p = basePositions[i];
      mesh.position.set(p.x * e, p.y * e, p.z * e);
      mesh.rotation.set(0.3 * e, -p.angle * e, 0.08 * e);
    });

    labelRefs.current.forEach((el, i) => {
      if (!el) return;
      const target = e > 0.55 ? 1 : 0;
      const current = parseFloat(el.dataset.opacity || '0');
      const next = current + (target - current) * Math.min(delta * 6, 1);
      el.dataset.opacity = String(next);
      el.style.opacity = String(next);
    });

    if (centerRef.current) {
      const s = 1 - e * 0.15;
      centerRef.current.scale.set(s, s, s);
    }

    if (mergedLabelRef.current) {
      mergedLabelRef.current.style.opacity = String(1 - Math.min(e * 1.4, 1));
    }
  });

  return (
    <group ref={group} rotation={[0.1, 0, 0]}>
      {modules.map((m, i) => {
        const p = basePositions[i];
        return (
          <group key={m.label} position={[p.x, p.y, p.z]}>
            <RoundedBox
              ref={(el) => (tileRefs.current[i] = el as unknown as Mesh)}
              args={[0.62, 0.62, 0.1]}
              radius={0.08}
              smoothness={4}
            >
              <meshPhysicalMaterial
                color={blueprint ? '#0a2a4a' : m.color}
                roughness={0.32}
                metalness={0.35}
                clearcoat={0.6}
                clearcoatRoughness={0.25}
                wireframe={blueprint}
              />
            </RoundedBox>
            <Html center distanceFactor={6} style={{ pointerEvents: 'none' }}>
              <div
                ref={(el) => (labelRefs.current[i] = el)}
                style={{
                  opacity: 0,
                  borderColor: blueprint ? undefined : `${m.color}66`,
                  background: blueprint ? undefined : `linear-gradient(0deg, ${m.color}14, ${m.color}14), hsl(var(--background) / 0.92)`,
                  boxShadow: blueprint ? undefined : `0 0 0 1px ${m.color}22, 0 4px 14px -4px ${m.color}55`,
                }}
                className="whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium text-foreground translate-y-6"
              >
                {m.label}
              </div>
            </Html>
          </group>
        );
      })}

      {/* The merged center block — "one system" */}
      <RoundedBox ref={centerRef} args={[0.95, 0.95, 0.18]} radius={0.1} smoothness={4}>
        <meshPhysicalMaterial
          color={blueprint ? '#0a2a4a' : '#CC3D19'}
          roughness={0.28}
          metalness={0.5}
          clearcoat={0.7}
          clearcoatRoughness={0.2}
          wireframe={blueprint}
        />
      </RoundedBox>
      <Html center distanceFactor={6} style={{ pointerEvents: 'none' }}>
        <div
          ref={mergedLabelRef}
          className="whitespace-nowrap rounded-full bg-foreground text-background px-3 py-1 text-[11px] font-semibold"
          style={{ opacity: 1 - Math.min(explodeRef.current * 1.4, 1) }}
        >
          {mergedLabel}
        </div>
      </Html>
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

  return (
    <div className={className} aria-hidden>
      <Canvas camera={{ position: [3.2, 2.1, 3.2], fov: 36 }} gl={{ antialias: true, alpha: true }} dpr={[1, 1.5]} frameloop={active ? 'always' : 'never'}>
        <ambientLight intensity={0.5} />
        <Suspense fallback={null}>
          <Environment resolution={64} frames={1}>
            <Lightformer intensity={3} color="#fff6ea" position={[-4, 3, 2]} scale={[6, 3, 1]} />
            <Lightformer intensity={1.8} color="#eaf3ff" position={[4, 1, -2]} rotation-y={Math.PI / 2} scale={[1, 6, 1]} />
            <Lightformer intensity={1.2} color="#ffffff" position={[0, -3, 2]} scale={[8, 2, 1]} />
          </Environment>
          <PointerTilt>
            <Tiles
              modules={modules}
              mergedLabel={mergedLabel}
              progress={progress}
              spin={!reduceMotion}
              blueprint={blueprint}
              onTick={onTick}
            />
          </PointerTilt>
          <ContactShadows position={[0, -1.15, 0]} opacity={0.3} scale={7} blur={2.6} far={2} />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default ModuleCluster3D;
