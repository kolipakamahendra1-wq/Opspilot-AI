import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, Html, Line, Sparkles } from "@react-three/drei";
import * as THREE from "three";

export const AGENT_STATES = ["CLASSIFY", "RETRIEVE", "CALL_TOOLS", "ANALYZE", "DECIDE", "APPROVAL", "EXECUTE", "VERIFY", "REPORT"];
const VIOLET = new THREE.Color("#a78bfa");
const SKY = new THREE.Color("#38bdf8");
const AMBER = new THREE.Color("#fbbf24");
const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function nodePositions(): THREE.Vector3[] {
  return AGENT_STATES.map((_, i) => {
    const t = i / (AGENT_STATES.length - 1);
    return new THREE.Vector3((t - 0.5) * 9.2, Math.sin(t * Math.PI * 1.6) * 0.9 - 0.2 + t * 0.6, Math.cos(t * Math.PI * 1.2) * 1.4);
  });
}

function colorAt(t: number) {
  return t < 0.5 ? VIOLET.clone().lerp(SKY, t * 2) : SKY.clone().lerp(AMBER, (t - 0.5) * 2);
}

/** Soft radial sprite used as an additive glow halo. */
function useGlowTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(0.25, "rgba(255,255,255,0.35)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
}

function Node({ position, index, label, glow, activeRef }: {
  position: THREE.Vector3; index: number; label: string; glow: THREE.Texture; activeRef: React.MutableRefObject<number>;
}) {
  const core = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Sprite>(null);
  const isGate = label === "APPROVAL";
  // On narrow screens full names collide; show step numbers only (the gate keeps its name).
  const compact = useThree((s) => s.size.width) < 560;
  const color = isGate ? AMBER : colorAt(index / (AGENT_STATES.length - 1));

  useFrame((_, dt) => {
    const active = activeRef.current === index;
    const target = active ? 1.6 : 1;
    if (core.current) core.current.scale.lerp(new THREE.Vector3(target, target, target), Math.min(1, dt * 6));
    if (halo.current) {
      const s = active ? 2.6 : 1.5;
      halo.current.scale.lerp(new THREE.Vector3(s, s, s), Math.min(1, dt * 5));
      (halo.current.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.lerp(
        (halo.current.material as THREE.SpriteMaterial).opacity, active ? 0.95 : 0.45, Math.min(1, dt * 5));
    }
  });

  return (
    <group position={position}>
      <mesh ref={core}>
        <sphereGeometry args={[0.13, 32, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <sprite ref={halo}>
        <spriteMaterial map={glow} color={color} transparent opacity={0.45} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.32, 0.004, 8, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} />
      </mesh>
      {isGate && (
        <>
          <mesh position={[-0.55, 0, 0]}><boxGeometry args={[0.025, 0.7, 0.025]} /><meshBasicMaterial color={AMBER} /></mesh>
          <mesh position={[0.55, 0, 0]}><boxGeometry args={[0.025, 0.7, 0.025]} /><meshBasicMaterial color={AMBER} /></mesh>
        </>
      )}
      <Html center distanceFactor={9} position={[0, index % 2 === 0 ? 0.62 : -0.62, 0]} style={{ pointerEvents: "none" }}>
        <div className="select-none whitespace-nowrap text-center font-mono text-[10px] tracking-[0.16em]"
          style={{ color: isGate ? "#fbbf24" : "rgba(236,235,230,0.82)" }}>
          <div className={compact && !isGate ? "" : "opacity-50"}>{String(index + 1).padStart(2, "0")}</div>
          {(!compact || isGate) && label}
        </div>
      </Html>
    </group>
  );
}

function LoopOrbit({ position }: { position: THREE.Vector3 }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (ref.current && !reduceMotion) ref.current.rotation.z -= dt * 1.2; });
  return (
    <group position={position} rotation={[0.3, 0, 0]}>
      <group ref={ref}>
        <mesh>
          <torusGeometry args={[0.62, 0.006, 8, 96, Math.PI * 1.6]} />
          <meshBasicMaterial color={SKY} transparent opacity={0.7} />
        </mesh>
        <mesh position={[0.62, 0, 0]}>
          <sphereGeometry args={[0.04, 16, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
    </group>
  );
}

function FlowParticles({ curve, count = 70 }: { curve: THREE.CatmullRomCurve3; count?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const offsets = useMemo(() => Array.from({ length: count }, (_, i) => i / count + Math.random() * 0.01), [count]);

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const t0 = reduceMotion ? 0 : clock.getElapsedTime() * 0.06;
    offsets.forEach((o, i) => {
      const t = (o + t0) % 1;
      dummy.position.copy(curve.getPointAt(t));
      const s = 0.5 + Math.sin(t * Math.PI) * 0.8;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
      mesh.current!.setColorAt(i, colorAt(t));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.028, 10, 10]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function Scene() {
  const group = useRef<THREE.Group>(null);
  const activeRef = useRef(0);
  const glow = useGlowTexture();
  const points = useMemo(nodePositions, []);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5), [points]);
  const linePts = useMemo(() => curve.getPoints(240), [curve]);
  const lineColors = useMemo(() => linePts.map((_, i) => colorAt(i / linePts.length)), [linePts]);

  useFrame(({ clock, pointer }, dt) => {
    const t = clock.getElapsedTime();
    activeRef.current = reduceMotion ? 5 : Math.floor(t * 0.9) % AGENT_STATES.length;
    if (group.current) {
      const targetY = (reduceMotion ? 0 : Math.sin(t * 0.15) * 0.18) + pointer.x * 0.25;
      const targetX = -0.12 - pointer.y * 0.12;
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetY, Math.min(1, dt * 2));
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, targetX, Math.min(1, dt * 2));
    }
  });

  return (
    <group ref={group}>
      <Line points={linePts} vertexColors={lineColors} lineWidth={1.2} transparent opacity={0.55} />
      <FlowParticles curve={curve} />
      <LoopOrbit position={points[2]} />
      {points.map((p, i) => (
        <Float key={AGENT_STATES[i]} speed={reduceMotion ? 0 : 1.2} rotationIntensity={0} floatIntensity={0.25}>
          <Node position={p} index={i} label={AGENT_STATES[i]} glow={glow} activeRef={activeRef} />
        </Float>
      ))}
      <Sparkles count={120} scale={[14, 6, 6]} size={1.6} speed={reduceMotion ? 0 : 0.25} color="#c4b5fd" opacity={0.5} />
    </group>
  );
}

export default function AgentGraph3D({ className }: { className?: string }) {
  return (
    <div className={className} aria-label="Animated 3D diagram of the nine agent states" role="img">
      <Canvas camera={{ position: [0, 0.4, 11.5], fov: 38 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }}>
        <Scene />
      </Canvas>
    </div>
  );
}
