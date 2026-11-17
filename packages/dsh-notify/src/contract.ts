// wire 契约类型（唯一事实源：host 的 remote.ts 签名、生成的 client 契约、客户端
// 半边的载荷形状都从这里取）。
//
// ⚠ 只放类型，不放任何运行时代码：本模块经 src/types.ts 以公开类型子路径发布，
// typert 生成器要求 Remote 边界类型（方法参数/返回值引用的一切类型）从包的
// 公开非根类型子路径导出（"." 与 ./typert、./remote 均不计入），生成的
// lib/typert.remote-client.* 从这里 import 类型。

/** 一条通知的载荷（宿主判定后推给客户端，客户端弹系统通知）。 */
export interface NotifyPayload {
  /** 通知标题。 */
  title: string
  /** 通知正文。 */
  body: string
  /** 回合结束原因（completed / error / …），客户端可据此分类。 */
  kind: string
}

/** 客户端发不了系统通知时，转交宿主兜底通道的参数。 */
export interface NotifyFallbackArgs {
  /** 通知标题。 */
  title: string
  /** 通知正文。 */
  body: string
  /** 回合结束原因。 */
  kind: string
}

/** 兜底通道的结果。 */
export interface NotifyFallbackResult {
  /** 是否发出去了。 */
  posted: boolean
}
