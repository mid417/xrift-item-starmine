# XRift Item Template

React Three Fiber で 3D アイテムを作成するための XRift アイテムテンプレートです。

## セットアップ

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
```

## 現在の花火演出

このアイテムは 10 秒カウントダウン後にランダムな花火を 1 発展開します。

- 菊: 球状に広がりつつ、やや尾を引く余韻を持つパターン
- 牡丹: 尾を引かずに明るい光点が丸く開くパターン
- 冠: 長く燃えながら大きく広がり、下方向へ流れ落ちるパターン
- 蜂: 回転するような揺らぎを伴って不規則に散るパターン

また、10 回に 1 回は打ち上げを行わず、地上付近でそのまま展開される演出が選ばれます。

## Shared 依存関係

このテンプレートは [Module Federation](https://module-federation.io/) を使用しており、以下の依存関係はホストアプリケーション（xrift-frontend）と共有されます。アイテムのバンドルにはインライン化されず、shared チャンクとして分離されます。

| パッケージ | バージョン |
| --- | --- |
| `react` | ^19.0.0 |
| `react-dom` | ^19.0.0 |
| `react/jsx-runtime` | - |
| `three` | ^0.176.0 |
| `three/addons` | ^0.176.0 |
| `@react-three/fiber` | ^9.3.0 |
| `@react-three/rapier` | ^2.1.0 |
| `@react-three/drei` | ^10.7.3 |

### `three/addons` について

`three/addons` は shared 依存として利用可能です。`DRACOLoader` や `GLTFLoader` など Three.js のアドオンモジュールを使用する場合は、`three/addons/*` からインポートしてください。

```tsx
// OK: shared チャンクとして分離される
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
```

これにより、アドオンモジュールがアイテムチャンクにインライン化されることを防ぎます。インライン化された場合、`@xrift/code-security` によって `new Worker()` などが critical 違反として検出される問題が発生します。
