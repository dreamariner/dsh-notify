# dsh-notify

DeepSeek Harness 插件：**回合（turn）跑完时发一条系统通知**。

DSH 的对话跑完时人不在屏幕前就没有任何信号，只能一直盯屏。macOS 上关掉窗口 DSH
仍在后台跑，这种「活干完了但没人知道」的场景最需要通知。

通知由 DSH 自己发出：桌面端（Electron）弹出的横幅归属是 **DeepSeek Harness**，
点一下 macOS 会激活应用，DSH Desktop 的窗口随即被拉到前台。

## 通知规则

一回合结束（`turn/end`）时按四道闸依次判断，任何一道不过就不发：

| 闸 | 默认 | 说明 |
|---|---|---|
| `enabled` | 开 | 总开关 |
| `notifyKinds` | `completed`、`error` | 回合结束原因。`aborted` 是人自己按停的，默认不报 |
| `includeSubagents` | 关 | 子代理会话默认不报，否则一轮里会弹好几次 |
| `minDurationMs` | 0 | 回合最短耗时，秒回的活不叫人 |

通知标题默认 `DSH`，会话有标题时拼成 `DSH · 会话名`；正文取最后一条助手消息的
摘要（默认最多 120 字），没有文本时按结束原因给一句兜底文案（如「回合已完成」）。

## 安装

**想用**（npm 发布后）：

- desktop 应用：Plugin Manager 里直接装
- headless 环境：`dsh plugin --profile <name> add @dreamariner/dsh-notify`

**想改**（本地源码态）：

```sh
pnpm install
pnpm profile:add          # link: 本仓 packages/dsh-notify 装进 ~/.dsh/profiles/desktop；缺依赖自动 install、装前自动构建
pnpm profile:add --remove # 反向卸载（含名单清理）
```

装完**重启 DSH 实例一次**生效。

## 配置

插件配置写在 profile 的 patch 里（`~/.dsh/profiles/desktop/cordis.patch.yml`），
给本插件的 `config` 段：

```yaml
- id: dsh-notify
  config:
    enabled: true
    notifyKinds: [completed, error, max-tokens]
    includeSubagents: false
    minDurationMs: 30000
    title: DSH
    showSummary: true
    summaryMaxChars: 120
    fallback: osascript
    fallbackDelayMs: 8000
    soundName: ''
    appName: DeepSeek Harness
    notifyOnLoad: false
```

| 配置项 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `true` | 总开关，关掉后插件仍装载但不发通知 |
| `notifyKinds` | string[] | `[completed, error]` | 报哪些结束原因。宿主可选值：`completed` / `error` / `max-tokens` / `blocked` / `aborted` / `interrupted` / `forked` |
| `includeSubagents` | boolean | `false` | 子代理会话是否也报 |
| `minDurationMs` | number | `0` | 回合最短耗时（毫秒） |
| `title` | string | `DSH` | 通知标题 |
| `showSummary` | boolean | `true` | 正文是否带助手消息摘要 |
| `summaryMaxChars` | number | `120` | 摘要最大字数 |
| `fallback` | `'osascript'` \| `'none'` | `'osascript'` | 客户端接不到时宿主自己的兜底通道 |
| `fallbackDelayMs` | number | `8000` | 兜底延迟：客户端在这段时间内接走就不兜底 |
| `soundName` | string | `''` | macOS 声音名（`/System/Library/Sounds` 下不含扩展名） |
| `appName` | string | `DeepSeek Harness` | 通知归属的应用名 |
| `notifyOnLoad` | boolean | `false` | 装载时先弹一条自检通知 |

### 兜底通道

通知正常由客户端（桌面端 / 浏览器）弹：桌面端的横幅归属是 DSH 本身，点一下能唤起
DSH Desktop。客户端接不到时（没有客户端、headless、浏览器没给通知权限），宿主在
`fallbackDelayMs` 之后用自己的 osascript 通道补一条，那条的归属是「脚本编辑器」。
把 `fallback` 设成 `none` 可以彻底不要兜底。

## 已知限制

- **macOS 通知权限与专注模式**：横幅由系统决定显不显示，插件管不了这一层；首次使用
  若没看到横幅，去「系统设置 → 通知」确认允许。
- **浏览器端**：普通浏览器里通知权限默认是不给的（插件不主动弹权限框，避免打断正事），
  这种情况下走宿主的兜底通道。
- **一个任务可能收两条**：派子代理那一轮结束弹一条，子代理跑完、父回合转述结果
  那轮又弹一条。嫌第二条吵就把 `minDurationMs` 调大（例如 30000，转述那种秒回会被
  滤掉）。
- **Windows 没有内置通道**：客户端那半边依赖浏览器的 Notification API，宿主兜底
  只实现了 macOS。

## 开发

```sh
pnpm install
pnpm test          # vitest run
pnpm typecheck     # tsc --noEmit
pnpm build         # 构建 host 半边 + client 半边 + wire 契约产物
pnpm dev           # watch 构建
pnpm dev:hmr       # host 半边热重载接线（client 半边重建即热替换）
```

DSH 实例管理（固定经这些命令启动，打包版才有 inspector）：

```sh
pnpm dsh:status    # 实例在跑与否 + 访问地址
pnpm dsh:start     # 启动（构建门失败会阻断启动）
pnpm dsh:restart   # 优雅停止后重启
pnpm dsh:stop
pnpm dsh:probe     # 连实例验证本插件装载且 active
```

真机验收（会真的发一条提示词到实例，跑一轮真实对话）：

```sh
pnpm verify:notify                 # 发默认提示词
pnpm verify:notify "你的提示词"     # 自定义
```

脚本跑完会打印插件日志里的通知记录，例如
`已通知：kind=completed 用时=5717ms 正文="收到"`。横幅只有人眼能确认，看一眼屏幕
才算验收通过。

## 日志

插件日志双写：console（进实例日志）与文件 `$DSH_HOME/logs/dsh-notify.log`（桌面端
宿主 logger 不可见，文件这份才看得到）。每次不通知也会记原因码：

```
2026-11-17T08:02:52 [info] 客户端已接入通知流（通知由客户端弹，归属是 DSH 本身）
2026-11-17T08:03:12 [info] 已通知：kind=completed 用时=13895ms 正文="收到"
```

## 结构

```
packages/dsh-notify/
  src/index.ts         宿主半边：订阅会话事件 → 决策 → 推通知载荷
  src/turn-watcher.ts  通知决策纯逻辑（四道闸，可单测）
  src/notify-bus.ts    宿主侧通知总线（推给客户端 / 超时兜底）
  src/notify.ts        兜底通道：osascript 命令构造与发送
  src/remote.ts        Typert wire 契约：通知流 + 兜底转交
  src/contract.ts      wire 契约类型（公开类型子路径 ./types）
  src/client/index.tsx 客户端半边：接通知流 → 弹系统通知
packages/protocol/     wire 协议声明源（git 子模块）
```

## 发布

```sh
pnpm --filter @dreamariner/dsh-notify publish
```

发布前检查：`locale/*.json` 的 `meta.title` / `meta.description` 换成真实文案、
`icon.svg` 换成原创图形（Plugin Manager 与 Settings 会展示它们）。
