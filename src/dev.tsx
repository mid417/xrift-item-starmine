/**
 * 開発環境用エントリーポイント
 *
 * ローカル開発時（npm run dev）に使用されます。
 * 本番ビルド（npm run build）では使用されません。
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { OrbitControls } from '@react-three/drei'
import { ItemProvider, XRiftProvider } from '@xrift/world-components'
import { Item } from './Item'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <XRiftProvider baseUrl="/">
      <div style={{ width: '100vw', height: '100vh' }}>
        <Canvas shadows camera={{ position: [9, 9, 20], fov: 60 }}>
          <Physics>
            <ambientLight intensity={0.4} />
            <directionalLight
              position={[5, 5, 5]}
              intensity={1}
              castShadow
            />
            <ItemProvider id="dev-item-starmine">
              <Item position={[0, 0, 0]} />
            </ItemProvider>
            {/* 地面 */}
            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
              <planeGeometry args={[10, 10]} />
              <meshStandardMaterial color="#888888" />
            </mesh>
            <OrbitControls target={[0, 8.5, 0]} />
          </Physics>
        </Canvas>
      </div>
    </XRiftProvider>
  </StrictMode>,
)
