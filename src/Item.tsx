import { useEffect, useRef, useState } from 'react'
import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import { Interactable, useInstanceState, useXRift } from '@xrift/world-components'
import { Group, MathUtils, Mesh, PointLight, Vector3 } from 'three'

const FIREWORK_DELAY_MS = 10_000
const COUNTDOWN_ZERO_HOLD_SEC = 0.18
const LAUNCH_DURATION_SEC = 1.4
const BURST_DURATION_SEC = 2.4
const ROCKET_IDLE_Y = 0.78
const BURST_HEIGHT = 16.2
const GROUND_BURST_Y = 1.08
const PARTICLE_COUNT = 42
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

const KIKU_COLORS = ['#ff4d6d', '#ffd166', '#7bdff2', '#cdb4db', '#80ed99', '#f7a072', '#f9c74f', '#90be6d']
const BOTAN_COLORS = ['#ff5d8f', '#ffd166', '#7bdff2', '#72efdd', '#ff99c8', '#ffe066']
const KANMURI_COLORS = ['#ffe066', '#ffd166', '#fff3bf', '#f4d35e', '#ffbf69']
const HACHI_COLORS = ['#ff9f1c', '#ffbf69', '#ffe066', '#f28482', '#f25c54']

type FireworkPattern = 'kiku' | 'botan' | 'kanmuri' | 'hachi'
type FireworkPhase = 'idle' | 'launch' | 'burst' | 'done'
type FireworkAudioKey = 'starMine' | 'mine'
type FireworkAudioPhase = 'launch' | 'burst'

const FIREWORK_PATTERNS: FireworkPattern[] = ['kiku', 'botan', 'kanmuri', 'hachi']
const FIREWORK_AUDIO_FILES: Record<FireworkAudioKey, string> = {
  starMine: 'star-mine.mp3',
  mine: 'mine.mp3',
}
const FIREWORK_SYNC_STATE_ID = 'item-starmine-firework'

interface FireworkSelection {
  pattern: FireworkPattern
  launches: boolean
  burstHeight: number
  audioKey: FireworkAudioKey
  audioPhase: FireworkAudioPhase
}

interface FireworkSyncState {
  revision: number
  resetAtMs: number
  firework: FireworkSelection
}

interface ParticleSeed {
  velocity: Vector3
  drift: Vector3
  wobbleAxis: Vector3
  wobbleAmount: number
  wobbleSpeed: number
  wobblePhase: number
  gravity: number
  fade: number
  scale: number
  color: string
}

const createShellDirection = (index: number) => {
  const y = 1 - ((index + 0.5) / PARTICLE_COUNT) * 2
  const radius = Math.sqrt(Math.max(1 - y * y, 0))
  const theta = GOLDEN_ANGLE * index

  return new Vector3(
    Math.cos(theta) * radius + MathUtils.randFloatSpread(0.18),
    y + MathUtils.randFloatSpread(0.16),
    Math.sin(theta) * radius + MathUtils.randFloatSpread(0.18),
  ).normalize()
}

const createFireworkSelection = (): FireworkSelection => {
  const launches = Math.random() >= 0.1

  return {
    pattern: FIREWORK_PATTERNS[Math.floor(Math.random() * FIREWORK_PATTERNS.length)],
    launches,
    burstHeight: launches ? BURST_HEIGHT : GROUND_BURST_Y,
    audioKey: launches ? 'starMine' : 'mine',
    audioPhase: launches ? 'launch' : 'burst',
  }
}

const createParticleSeed = (index: number, firework: FireworkSelection): ParticleSeed => {
  switch (firework.pattern) {
    case 'kiku': {
      const direction = createShellDirection(index)

      return {
        velocity: direction.clone().multiplyScalar(MathUtils.randFloat(4.9, 6.2)),
        drift: direction.clone().multiplyScalar(MathUtils.randFloat(0.28, 0.52)),
        wobbleAxis: new Vector3(0, 0, 0),
        wobbleAmount: 0,
        wobbleSpeed: 0,
        wobblePhase: 0,
        gravity: MathUtils.randFloat(0.75, 1.0),
        fade: 1.95,
        scale: MathUtils.randFloat(0.08, 0.14),
        color: KIKU_COLORS[index % KIKU_COLORS.length],
      }
    }

    case 'botan': {
      const direction = createShellDirection(index)
      const ringScale = index % 6 === 0 ? 0.72 : 1

      return {
        velocity: direction.clone().multiplyScalar(MathUtils.randFloat(5.2, 6.8) * ringScale),
        drift: new Vector3(0, 0, 0),
        wobbleAxis: new Vector3(0, 0, 0),
        wobbleAmount: 0,
        wobbleSpeed: 0,
        wobblePhase: 0,
        gravity: MathUtils.randFloat(0.95, 1.2),
        fade: 1.55,
        scale: MathUtils.randFloat(0.11, 0.18),
        color: BOTAN_COLORS[index % BOTAN_COLORS.length],
      }
    }

    case 'kanmuri': {
      const direction = createShellDirection(index)
      const horizontal = new Vector3(direction.x, 0, direction.z)

      if (horizontal.lengthSq() < 0.0001) {
        horizontal.set(1, 0, 0)
      }

      horizontal.normalize()

      const crownDirection = new Vector3(horizontal.x * 0.92, MathUtils.randFloat(0.18, 0.72), horizontal.z * 0.92).normalize()

      return {
        velocity: crownDirection.clone().multiplyScalar(MathUtils.randFloat(3.8, 5.1)),
        drift: new Vector3(
          horizontal.x * MathUtils.randFloat(0.08, 0.22),
          -MathUtils.randFloat(0.75, 1.25),
          horizontal.z * MathUtils.randFloat(0.08, 0.22),
        ),
        wobbleAxis: horizontal.clone(),
        wobbleAmount: MathUtils.randFloat(0.03, 0.08),
        wobbleSpeed: MathUtils.randFloat(3.5, 5.5),
        wobblePhase: MathUtils.randFloat(0, Math.PI * 2),
        gravity: MathUtils.randFloat(1.6, 2.05),
        fade: 2.15,
        scale: MathUtils.randFloat(0.1, 0.17),
        color: KANMURI_COLORS[index % KANMURI_COLORS.length],
      }
    }

    case 'hachi': {
      const direction = new Vector3(
        MathUtils.randFloatSpread(2.4),
        MathUtils.randFloat(-0.2, 1.1),
        MathUtils.randFloatSpread(2.4),
      ).normalize()

      const wobbleAxis = new Vector3(-direction.z, MathUtils.randFloatSpread(0.35), direction.x)

      if (wobbleAxis.lengthSq() < 0.0001) {
        wobbleAxis.set(1, 0, 0)
      }

      wobbleAxis.normalize()

      return {
        velocity: direction.clone().multiplyScalar(MathUtils.randFloat(3.8, 6.6)),
        drift: new Vector3(
          MathUtils.randFloatSpread(0.9),
          MathUtils.randFloat(-0.45, 0.25),
          MathUtils.randFloatSpread(0.9),
        ),
        wobbleAxis,
        wobbleAmount: MathUtils.randFloat(0.18, 0.55),
        wobbleSpeed: MathUtils.randFloat(10, 18),
        wobblePhase: MathUtils.randFloat(0, Math.PI * 2),
        gravity: MathUtils.randFloat(1.1, 1.45),
        fade: 1.7,
        scale: MathUtils.randFloat(0.09, 0.16),
        color: HACHI_COLORS[index % HACHI_COLORS.length],
      }
    }

    default: {
      const direction = createShellDirection(index)

      return {
        velocity: direction.clone().multiplyScalar(MathUtils.randFloat(4.9, 6.2)),
        drift: direction.clone().multiplyScalar(MathUtils.randFloat(0.28, 0.52)),
        wobbleAxis: new Vector3(0, 0, 0),
        wobbleAmount: 0,
        wobbleSpeed: 0,
        wobblePhase: 0,
        gravity: MathUtils.randFloat(0.75, 1.0),
        fade: 1.95,
        scale: MathUtils.randFloat(0.08, 0.14),
        color: KIKU_COLORS[index % KIKU_COLORS.length],
      }
    }
  }
}

const createParticleSeeds = (firework: FireworkSelection) => {
  return Array.from({ length: PARTICLE_COUNT }, (_, index) => createParticleSeed(index, firework))
}

const createFireworkSyncState = (revision = 0, resetAtMs = Date.now()): FireworkSyncState => {
  return {
    revision,
    resetAtMs,
    firework: createFireworkSelection(),
  }
}

export interface ItemProps {
  position?: [number, number, number]
  scale?: number
}

export const Item: React.FC<ItemProps> = ({ position = [0, 0, 0], scale = 1 }) => {
  const { baseUrl } = useXRift()
  const initialFireworkSyncStateRef = useRef<FireworkSyncState>(createFireworkSyncState())
  const [fireworkSyncState, setFireworkSyncState] = useInstanceState<FireworkSyncState>(
    FIREWORK_SYNC_STATE_ID,
    initialFireworkSyncStateRef.current,
  )
  const groupRef = useRef<Group>(null)
  const rocketRef = useRef<Group>(null)
  const flameRef = useRef<Mesh>(null)
  const fuseLightRef = useRef<PointLight>(null)
  const burstLightRef = useRef<PointLight>(null)
  const burstFlashRef = useRef<Mesh>(null)
  const shockwaveRef = useRef<Mesh>(null)
  const fireworkAudioRefs = useRef<Record<FireworkAudioKey, HTMLAudioElement | null>>({
    starMine: null,
    mine: null,
  })
  const particleRefs = useRef<Array<Mesh | null>>([])
  const particleSeedsRef = useRef<ParticleSeed[]>(createParticleSeeds(initialFireworkSyncStateRef.current.firework))
  const currentFireworkRef = useRef<FireworkSelection | null>(initialFireworkSyncStateRef.current.firework)
  const appliedSyncRevisionRef = useRef<number | null>(null)
  const phaseRef = useRef<FireworkPhase>('idle')
  const phaseStartedAtRef = useRef(0)
  const launchAtRef = useRef(0)
  const countdownValueRef = useRef<number | null>(null)
  const [phase, setPhase] = useState<FireworkPhase>('idle')
  const [countdownValue, setCountdownValue] = useState<number | null>(null)

  const burstHeight = currentFireworkRef.current?.burstHeight ?? BURST_HEIGHT

  const playFireworkAudio = (nextPhase: FireworkPhase) => {
    const currentFirework = currentFireworkRef.current

    if (!currentFirework || currentFirework.audioPhase !== nextPhase) {
      return
    }

    const fireworkAudio = fireworkAudioRefs.current[currentFirework.audioKey]

    if (!fireworkAudio) {
      return
    }

    fireworkAudio.currentTime = 0
    const playPromise = fireworkAudio.play()

    if (playPromise !== undefined) {
      void playPromise.catch(() => {})
    }
  }

  const transitionTo = (nextPhase: FireworkPhase, startedAt = Date.now(), playAudio = true) => {
    phaseRef.current = nextPhase
    phaseStartedAtRef.current = startedAt

    if (playAudio) {
      playFireworkAudio(nextPhase)
    }

    setPhase(nextPhase)
  }

  const syncCountdownValue = (nextCountdownValue: number | null) => {
    if (countdownValueRef.current === nextCountdownValue) {
      return
    }

    countdownValueRef.current = nextCountdownValue
    setCountdownValue(nextCountdownValue)
  }

  const syncBurstAnchors = () => {
    const nextBurstHeight = currentFireworkRef.current?.burstHeight ?? BURST_HEIGHT

    if (burstLightRef.current) {
      burstLightRef.current.position.set(0, nextBurstHeight, 0)
    }

    if (burstFlashRef.current) {
      burstFlashRef.current.position.set(0, nextBurstHeight, 0)
    }

    if (shockwaveRef.current) {
      shockwaveRef.current.position.set(0, nextBurstHeight, 0)
    }
  }

  const applyFireworkSelection = (nextFirework: FireworkSelection) => {
    currentFireworkRef.current = nextFirework
    particleSeedsRef.current = createParticleSeeds(nextFirework)
  }

  const resetVisualState = () => {
    syncBurstAnchors()

    if (rocketRef.current) {
      rocketRef.current.position.set(0, ROCKET_IDLE_Y, 0)
      rocketRef.current.rotation.set(0, 0, 0)
    }

    if (flameRef.current) {
      flameRef.current.scale.setScalar(1)
    }

    if (burstLightRef.current) {
      burstLightRef.current.intensity = 0
    }

    if (burstFlashRef.current) {
      burstFlashRef.current.scale.setScalar(0.01)
    }

    if (shockwaveRef.current) {
      shockwaveRef.current.scale.setScalar(0.01)
      shockwaveRef.current.rotation.set(-Math.PI / 2, 0, 0)
    }

    particleRefs.current.forEach((particle) => {
      if (!particle) {
        return
      }

      particle.scale.setScalar(0.01)
      particle.position.set(0, currentFireworkRef.current?.burstHeight ?? BURST_HEIGHT, 0)
    })
  }

  const applyFireworkSyncState = (nextFireworkSyncState: FireworkSyncState) => {
    applyFireworkSelection(nextFireworkSyncState.firework)
    resetVisualState()

    const nextLaunchAtMs = nextFireworkSyncState.resetAtMs + FIREWORK_DELAY_MS
    const now = Date.now()

    launchAtRef.current = nextLaunchAtMs

    if (now < nextLaunchAtMs) {
      transitionTo('idle', nextFireworkSyncState.resetAtMs, false)
      syncCountdownValue(Math.ceil((nextLaunchAtMs - now) / 1000))
      return
    }

    if (nextFireworkSyncState.firework.launches) {
      const launchElapsedSec = (now - nextLaunchAtMs) / 1000

      if (launchElapsedSec < LAUNCH_DURATION_SEC) {
        transitionTo('launch', nextLaunchAtMs, false)
        syncCountdownValue(launchElapsedSec <= COUNTDOWN_ZERO_HOLD_SEC ? 0 : null)
        return
      }

      const burstStartedAtMs = nextLaunchAtMs + LAUNCH_DURATION_SEC * 1000
      const burstElapsedSec = (now - burstStartedAtMs) / 1000

      if (burstElapsedSec < BURST_DURATION_SEC) {
        transitionTo('burst', burstStartedAtMs, false)
        syncCountdownValue(null)
        return
      }

      transitionTo('done', burstStartedAtMs + BURST_DURATION_SEC * 1000, false)
      syncCountdownValue(null)
      return
    }

    const burstElapsedSec = (now - nextLaunchAtMs) / 1000

    if (burstElapsedSec < BURST_DURATION_SEC) {
      transitionTo('burst', nextLaunchAtMs, false)
      syncCountdownValue(null)
      return
    }

    transitionTo('done', nextLaunchAtMs + BURST_DURATION_SEC * 1000, false)
    syncCountdownValue(null)
  }

  const resetFirework = () => {
    setFireworkSyncState((currentState) => createFireworkSyncState(currentState.revision + 1))
  }

  useEffect(() => {
    const starMineAudio = new Audio(`${baseUrl}${FIREWORK_AUDIO_FILES.starMine}`)
    const mineAudio = new Audio(`${baseUrl}${FIREWORK_AUDIO_FILES.mine}`)

    starMineAudio.preload = 'auto'
    mineAudio.preload = 'auto'
    starMineAudio.load()
    mineAudio.load()

    fireworkAudioRefs.current = {
      starMine: starMineAudio,
      mine: mineAudio,
    }

    return () => {
      for (const fireworkAudio of [starMineAudio, mineAudio]) {
        fireworkAudio.pause()
        fireworkAudio.currentTime = 0
      }

      fireworkAudioRefs.current = {
        starMine: null,
        mine: null,
      }
    }
  }, [baseUrl])

  useEffect(() => {
    if (appliedSyncRevisionRef.current === fireworkSyncState.revision) {
      return
    }

    appliedSyncRevisionRef.current = fireworkSyncState.revision
    applyFireworkSyncState(fireworkSyncState)
  }, [fireworkSyncState])

  useFrame((state, delta) => {
    const now = Date.now()
    const currentBurstHeight = currentFireworkRef.current?.burstHeight ?? BURST_HEIGHT
    let currentPhase = phaseRef.current
    let phaseElapsed = (now - phaseStartedAtRef.current) / 1000

    syncBurstAnchors()

    if (currentPhase === 'idle') {
      if (launchAtRef.current > 0 && now >= launchAtRef.current) {
        if (currentFireworkRef.current?.launches === false) {
          transitionTo('burst', now)
          currentPhase = 'burst'
          syncCountdownValue(null)
        } else {
          transitionTo('launch', now)
          currentPhase = 'launch'
        }

        phaseElapsed = 0
      } else if (launchAtRef.current > 0) {
        const remainingMs = Math.max(launchAtRef.current - now, 0)
        syncCountdownValue(Math.ceil(remainingMs / 1000))
      }
    } else if (currentPhase === 'launch' && phaseElapsed <= COUNTDOWN_ZERO_HOLD_SEC) {
      syncCountdownValue(0)
    } else {
      syncCountdownValue(null)
    }

    if (fuseLightRef.current) {
      if (currentPhase === 'idle') {
        const countdownRatio = MathUtils.clamp(1 - (launchAtRef.current - now) / FIREWORK_DELAY_MS, 0, 1)
        fuseLightRef.current.intensity = 1 + countdownRatio * 2.6 + Math.sin(state.clock.elapsedTime * (2 + countdownRatio * 8)) * 0.35
      } else {
        fuseLightRef.current.intensity = 0
      }
    }

    if (rocketRef.current) {
      rocketRef.current.rotation.y += delta * 0.8

      if (currentPhase === 'idle') {
        rocketRef.current.position.y = ROCKET_IDLE_Y + Math.sin(state.clock.elapsedTime * 2) * 0.02
      }

      if (currentPhase === 'launch') {
        const progress = MathUtils.clamp(phaseElapsed / LAUNCH_DURATION_SEC, 0, 1)
        const easedProgress = 1 - Math.pow(1 - progress, 3)
        rocketRef.current.position.y = MathUtils.lerp(ROCKET_IDLE_Y, currentBurstHeight, easedProgress)

        if (flameRef.current) {
          flameRef.current.scale.setScalar(0.95 + progress * 1.8)
        }

        if (progress >= 1) {
          transitionTo('burst')
        }
      }
    }

    if (burstLightRef.current) {
      if (currentPhase === 'burst') {
        const burstProgress = MathUtils.clamp(phaseElapsed / BURST_DURATION_SEC, 0, 1)
        burstLightRef.current.intensity = Math.pow(1 - burstProgress, 0.45) * 16
      } else {
        burstLightRef.current.intensity = 0
      }
    }

    if (burstFlashRef.current) {
      if (currentPhase === 'burst') {
        const burstProgress = MathUtils.clamp(phaseElapsed / BURST_DURATION_SEC, 0, 1)
        const flashScale = 0.8 + burstProgress * 4.2
        burstFlashRef.current.scale.setScalar(flashScale)
      } else {
        burstFlashRef.current.scale.setScalar(0.01)
      }
    }

    if (shockwaveRef.current) {
      if (currentPhase === 'burst') {
        const burstProgress = MathUtils.clamp(phaseElapsed / BURST_DURATION_SEC, 0, 1)
        const shockwaveScale = 0.8 + burstProgress * 8.5
        shockwaveRef.current.scale.set(shockwaveScale, shockwaveScale, shockwaveScale)
        shockwaveRef.current.rotation.z += delta * 1.6
      } else {
        shockwaveRef.current.scale.setScalar(0.01)
      }
    }

    if (currentPhase === 'burst') {
      const burstProgress = MathUtils.clamp(phaseElapsed / BURST_DURATION_SEC, 0, 1)

      particleRefs.current.forEach((particle, index) => {
        if (!particle) {
          return
        }

        const seed = particleSeedsRef.current[index]
        const burstTime = phaseElapsed
        const wobble = Math.sin(burstTime * seed.wobbleSpeed + seed.wobblePhase) * seed.wobbleAmount
        const burstDrift = burstTime * burstTime

        particle.position.set(
          seed.velocity.x * burstTime + seed.drift.x * burstDrift + seed.wobbleAxis.x * wobble,
          currentBurstHeight + seed.velocity.y * burstTime + seed.drift.y * burstDrift - seed.gravity * burstDrift + seed.wobbleAxis.y * wobble * 0.35,
          seed.velocity.z * burstTime + seed.drift.z * burstDrift + seed.wobbleAxis.z * wobble,
        )

        const currentScale = Math.max(seed.scale * (seed.fade - burstProgress * (seed.fade - 0.22)), 0.02)
        particle.scale.setScalar(currentScale)
      })

      if (burstProgress >= 1) {
        transitionTo('done')
      }
    }

    if (currentPhase !== 'burst') {
      particleRefs.current.forEach((particle) => {
        if (!particle) {
          return
        }

        particle.scale.setScalar(0.01)
        particle.position.set(0, currentBurstHeight, 0)
      })
    }
  })

  return (
    <group ref={groupRef} position={position} scale={scale}>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.4, 0.5, 0.3, 8]} />
          <meshStandardMaterial color="#3d3d3d" metalness={0.5} roughness={0.4} />
        </mesh>

        <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.16, 0.18, 0.38, 12]} />
          <meshStandardMaterial color="#262626" metalness={0.7} roughness={0.25} />
        </mesh>
      </RigidBody>

      {phase === 'done' ? (
        <Interactable id="item-starmine-reset" type="button" onInteract={resetFirework} interactionText="花火をリセット">
          <group>
            <mesh position={[0, 0.48, 0]}>
              <sphereGeometry args={[0.72, 16, 16]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>

            <mesh position={[0, 0.48, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.3, 0.035, 12, 32]} />
              <meshStandardMaterial color="#ffe066" emissive="#ffb703" emissiveIntensity={2} transparent opacity={0.9} />
            </mesh>
          </group>
        </Interactable>
      ) : null}

      <group ref={rocketRef} position={[0, ROCKET_IDLE_Y, 0]} visible={phase !== 'done' && phase !== 'burst'}>
        <mesh castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.34, 12]} />
          <meshStandardMaterial color="#d7263d" emissive="#8b1e2d" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0, 0.22, 0]} castShadow>
          <coneGeometry args={[0.07, 0.16, 12]} />
          <meshStandardMaterial color="#ffe8a3" emissive="#ffb703" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0, -0.18, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
          <boxGeometry args={[0.14, 0.02, 0.14]} />
          <meshStandardMaterial color="#f2f2f2" metalness={0.1} roughness={0.8} />
        </mesh>
        <mesh ref={flameRef} position={[0, -0.26, 0]} visible={phase === 'launch'}>
          <coneGeometry args={[0.06, 0.22, 10]} />
          <meshStandardMaterial color="#ff8c42" emissive="#ff5d00" emissiveIntensity={2} transparent opacity={0.9} />
        </mesh>
      </group>

      <pointLight ref={fuseLightRef} position={[0, 0.66, 0]} color="#ffb703" distance={3.5} />
      <pointLight ref={burstLightRef} position={[0, burstHeight, 0]} color="#ffd166" distance={28} intensity={0} />

      {countdownValue !== null ? (
        <Billboard position={[0, 1.46, 0]}>
          <Text
            anchorX="center"
            anchorY="middle"
            color="#fff6bf"
            fontSize={0.34}
            outlineColor="#8b1e2d"
            outlineWidth={0.04}
          >
            {countdownValue.toString()}
          </Text>
        </Billboard>
      ) : null}

      <mesh ref={burstFlashRef} position={[0, burstHeight, 0]} visible={phase === 'burst'}>
        <sphereGeometry args={[0.45, 24, 24]} />
        <meshStandardMaterial color="#fff6bf" emissive="#ffe066" emissiveIntensity={3.2} transparent opacity={0.74} />
      </mesh>

      <mesh ref={shockwaveRef} position={[0, burstHeight, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={phase === 'burst'}>
        <torusGeometry args={[0.7, 0.07, 16, 48]} />
        <meshStandardMaterial color="#ffe066" emissive="#ff9f1c" emissiveIntensity={2.4} transparent opacity={0.7} />
      </mesh>

      {particleSeedsRef.current.map((seed, index) => (
        <mesh
          key={index}
          ref={(particle) => {
            particleRefs.current[index] = particle
          }}
          position={[0, burstHeight, 0]}
          visible={phase === 'burst'}
        >
          <sphereGeometry args={[seed.scale, 10, 10]} />
          <meshStandardMaterial color={seed.color} emissive={seed.color} emissiveIntensity={2.8} />
        </mesh>
      ))}
    </group>
  )
}
