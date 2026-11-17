import { defineConfig } from 'tsdown'
import { EXTERNALS } from './tsdown.shared.ts'

// client 段：src/client/index.tsx → lib/client.js（CJS + __ModuleLoader__ 包装，
// 宿主渲染进程经 dsh.client 声明自动发现并装载）。
//
// ⚠ 必须在 host 段之后跑：本段会把 host 段刚生成的 lib/typert.remote-client.js
// 内联进 bundle（自有子路径不在浏览器模块表里，不能外置；反过来从 src/remote.ts
// 值导入会把 typert-protocol 的值依赖拖进浏览器 bundle → web boot: 1 entry did
// not activate）。顺序反了会内联上一轮的旧契约。
//
// EXTERNALS 是宿主契约（渲染进程模块表供给，绝不打包）；清单外的裸 import 一律内联，
// onlyImport 让清单外的裸 import 在构建期直接报错。
// ⚠ 官方 practices：不要 require 任何 @deepseek-ai/dsh-client-* 包 : 控件照宿主的
//   样子自己写，样式只引用 --dsw-alias-* 主题 token。
export default defineConfig({
  entry: ['src/client/index.tsx'],
  outDir: 'lib',
  clean: false,
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  fixedExtension: false,
  dts: false,
  sourcemap: true,
  deps: {
    neverBundle: EXTERNALS,
    alwaysBundle: (specifier: string) => !EXTERNALS.includes(specifier),
    onlyImport: EXTERNALS,
  },
  outputOptions: {
    entryFileNames: 'client.js',
    chunkFileNames: 'client.[name].js',
  },
  // : 包装，与 DSH 运行时期望的字节形态一致 :
  // ⚠ CJS 格式下 rolldown 会跳过独立的 intro（产物缺 var exports = module.exports
  //   → 浏览器 exports is not defined），故 intro 并进 banner。
  banner: [
    `window.__ModuleLoader__.load({ id: '@dreamariner/dsh-notify', factory: (require) => {`,
    'var module = { exports: {} };',
    'var exports = module.exports;',
  ].join('\n'),
  footer: 'return module.exports; } });',
})
