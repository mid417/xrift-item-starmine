import { useEffect, useRef, useState } from 'react'
import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import { Interactable } from '@xrift/world-components'
import { Group, MathUtils, Mesh, PointLight, Vector3 } from 'three'

const FIREWORK_DELAY_MS = 10_000
const COUNTDOWN_ZERO_HOLD_SEC = 0.18
const LAUNCH_DURATION_SEC = 1.4
const BURST_DURATION_SEC = 2.4
const ROCKET_IDLE_Y = 0.78
const BURST_HEIGHT = 16.2
const PARTICLE_COUNT = 42

const PARTICLE_COLORS = ['#ff4d6d', '#ffd166', '#7bdff2', '#cdb4db', '#80ed99', '#f7a072', '#f9c74f', '#90be6d']

type FireworkPhase = 'idle' | 'launch' | 'burst' | 'done'

interface ParticleSeed {
  velocity: Vector3
  scale: number
  color: string
}

const createParticleSeed = (index: number): ParticleSeed => {
  const velocity = new Vector3(
    MathUtils.randFloatSpread(2.6),
    MathUtils.randFloat(0.6, 2.4),
    MathUtils.randFloatSpread(2.6),
  )
    .normalize()
    .multiplyScalar(MathUtils.randFloat(4.8, 9.8))

  return {
    velocity,
    scale: MathUtils.randFloat(0.09, 0.2),
    color: PARTICLE_COLORS[index % PARTICLE_COLORS.length],
  }
}

export interface ItemProps {
  position?: [number, number, number]
  scale?: number
}

export const Item: React.FC<ItemProps> = ({ position = [0, 0, 0], scale = 1 }) => {
  const groupRef = useRef<Group>(null)
  const rocketRef = useRef<Group>(null)
  const flameRef = useRef<Mesh>(null)
  const fuseLightRef = useRef<PointLight>(null)
  const burstLightRef = useRef<PointLight>(null)
  const burstFlashRef = useRef<Mesh>(null)
  const shockwaveRef = useRef<Mesh>(null)
  const particleRefs = useRef<Array<Mesh | null>>([])
  const particleSeedsRef = useRef<ParticleSeed[]>([])
  const phaseRef = useRef<FireworkPhase>('idle')
  const phaseStartedAtRef = useRef(0)
  const launchAtRef = useRef(0)
  const countdownValueRef = useRef<number | null>(null)
  const [phase, setPhase] = useState<FireworkPhase>('idle')
  const [countdownValue, setCountdownValue] = useState<number | null>(null)

  if (particleSeedsRef.current.length === 0) {
    particleSeedsRef.current = Array.from({ length: PARTICLE_COUNT }, (_, index) => createParticleSeed(index))
  }

  const transitionTo = (nextPhase: FireworkPhase) => {
    phaseRef.current = nextPhase
    phaseStartedAtRef.current = performance.now()
    setPhase(nextPhase)
  }

  const syncCountdownValue = (nextCountdownValue: number | null) => {
    if (countdownValueRef.current === nextCountdownValue) {
      return
    }

    countdownValueRef.current = nextCountdownValue
    setCountdownValue(nextCountdownValue)
  }

  const resetVisualState = () => {
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
      particle.position.set(0, BURST_HEIGHT, 0)
    })
  }

  const scheduleLaunch = () => {
    launchAtRef.current = performance.now() + FIREWORK_DELAY_MS
    syncCountdownValue(Math.ceil(FIREWORK_DELAY_MS / 1000))
  }

  const resetFirework = () => {
    transitionTo('idle')
    resetVisualState()
    scheduleLaunch()
  }

  useEffect(() => {
    resetVisualState()
    scheduleLaunch()
  }, [])

  useFrame((state, delta) => {
    const now = performance.now()
    let currentPhase = phaseRef.current
    let phaseElapsed = (now - phaseStartedAtRef.current) / 1000

    if (currentPhase === 'idle') {
      if (launchAtRef.current > 0 && now >= launchAtRef.current) {
        transitionTo('launch')
        currentPhase = 'launch'
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
        rocketRef.current.position.y = MathUtils.lerp(ROCKET_IDLE_Y, BURST_HEIGHT, easedProgress)

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
        particle.position.set(
          seed.velocity.x * burstTime,
          BURST_HEIGHT + seed.velocity.y * burstTime - 2.4 * burstTime * burstTime,
          seed.velocity.z * burstTime,
        )

        const currentScale = Math.max(seed.scale * (1.7 - burstProgress * 1.3), 0.02)
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
        particle.position.y = BURST_HEIGHT
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
      <pointLight ref={burstLightRef} position={[0, BURST_HEIGHT, 0]} color="#ffd166" distance={14} intensity={0} />

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

      <mesh ref={burstFlashRef} position={[0, BURST_HEIGHT, 0]} visible={phase === 'burst'}>
        <sphereGeometry args={[0.45, 24, 24]} />
        <meshStandardMaterial color="#fff6bf" emissive="#ffe066" emissiveIntensity={3.2} transparent opacity={0.85} />
      </mesh>

      <mesh ref={shockwaveRef} position={[0, BURST_HEIGHT, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={phase === 'burst'}>
        <torusGeometry args={[0.7, 0.07, 16, 48]} />
        <meshStandardMaterial color="#ffe066" emissive="#ff9f1c" emissiveIntensity={2.4} transparent opacity={0.8} />
      </mesh>

      {particleSeedsRef.current.map((seed, index) => (
        <mesh
          key={index}
          ref={(particle) => {
            particleRefs.current[index] = particle
          }}
          position={[0, BURST_HEIGHT, 0]}
          visible={phase === 'burst'}
        >
          <sphereGeometry args={[seed.scale, 10, 10]} />
          <meshStandardMaterial color={seed.color} emissive={seed.color} emissiveIntensity={2.8} />
        </mesh>
      ))}
    </group>
  )
}
