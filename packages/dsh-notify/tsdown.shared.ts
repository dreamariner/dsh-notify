// @dreamariner/dsh-notify :: 两段构建共享的常量
//
// 为什么拆成两个 tsdown 配置（tsdown.host.config.ts / tsdown.client.config.ts）：
// client 产物要把构建期生成的 lib/typert.remote-client.js **内联**进 bundle
// （自有子路径不在浏览器模块表里，外置即 missed the module table），而那个文件是
// host 段构建时才生成的。合成一个配置时两段并行跑，client 会内联**上一轮**的旧契约
// （方法增删后客户端 bundle 与宿主对不上），fresh clone 时甚至解析不到该文件。
// 拆开后 build 脚本按 host → client 顺序跑，契约必然是当轮新生成的。

/**
 * 宿主渲染进程模块表供给的清单（绝不打进 bundle；清单外的裸 import 一律内联）。
 * react 系是宿主 baseline（与官方 practices 的模块表请求同源，改动须两处同步）。
 *
 * ⚠ typert 协议包（@deepseek-ai/dsh-typert-protocol）两半边**有意不同**（2026-11-17 定案，
 * 逐层核实过 DSH 源码）：
 * · host 半边：peerDependencies → neverBundle 外置（hostDeps），运行期解析到宿主同一实例。
 *   同一性在这里要紧：NotifyRemote 继承的 TypertRemoteService 基类、宿主 typert-loader 的
 *   face 装配都走这份实例，这是「协议不重复」设计真正落地的地方（产物 lib/index.js 与
 *   lib/typert.host.js 都是裸 import，已验证）。
 * · client 半边：**内联**，别加进本清单。渲染进程模块表种子（DSH packages/client/web/src/
 *   platform.ts 的 PLATFORM_MODULES）没有协议包；协议包自身无 dsh.client 声明、不构成
 *   client 模块行；dsh.client.external 的请求也只能落到种子或别的 client 模块行上
 *   （client-modules 的 arriveGraphRow），同样没有供给方。外置后 client 的 require 会
 *   miss the module table，插件 client 静默失效。DSH 自己的 client 构建门
 *   （packages/client/tsdown.client.ts）把协议包列进 INLINE_SAFE、把生成的 <pkg>/remote
 *   列进 GENERATED_REMOTE，两者都注明「no runtime identity to share（no Symbol /
 *   instanceof / singleton）」；官方 client 装配（api/remotes/src/client）本身就值导入
 *   全部 /remote 产物内联进 bundle。client 侧挂载按端点字符串与包名（contribution.package）
 *   校验、无跨副本同一性检查，多一份副本无实害。若未来 DSH 把协议包加进种子表，可再议外置。
 * · 内联进 bundle 的是 **npm 发布副本**（devDependencies 裸精确 pin，registry 安装；
 *   解析实测落在 node_modules/.pnpm/…@0.2.2-rc.2），不是 packages/protocol vendor
 *   submodule：vendor 只经 tsconfig.host.json 的 paths 重定向进入生成器 face program
 *   （host 构建期 codegen），无 lib/ 产物、不进任何 bundle。protocol-vendor.spec
 *   机械守护这条隔离（裸精确 pin / vendor 后缀 / 运行期解析断言）；内容级比对不可行
 *   （rolldown 转换去注释），判据是解析链。
 * · 脚手架 README（create-dsh-plugin）「协议包运行期由模块表供给」的说法对 0.2.2-rc.2
 *   不成立（照做 client 必挂）；「内联解析不到」的预期被 vendor 纪律的 devDep 精确 pin
 *   掩盖（构建期解析得到，于是静默内联成功）。0.4.1 起脚手架已修正该指引。
 * zod 留在 dependencies 内联：脚手架依赖纪律 dependencies = 内联自带，插件版本自锚，
 * 不耦合宿主种子副本的版本漂移。
 */
export const EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
]
