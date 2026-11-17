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
 */
export const EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
]
