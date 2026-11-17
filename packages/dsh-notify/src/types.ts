// wire 契约类型的公开子路径。
//
// typert 生成器要求 Remote 边界类型（方法参数/返回值引用的一切 workspace 类型）
// 从包的**公开非根类型子路径**导出（"." 与 ./typert、./remote 均不计入），生成的
// client 契约（lib/typert.remote-client.*）从这里 import 类型。本模块只做类型转发：
// `export type *` 不携带值导出，host 半边的运行时零副作用。

export type * from './contract.ts'
