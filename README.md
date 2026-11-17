# dsh-notify

DeepSeek Harness 插件：**回合（turn）跑完时发一条系统通知**。

DSH 的对话跑完时人不在屏幕前就没有任何信号，只能一直盯屏。macOS 上关掉窗口 DSH
仍在后台跑，这种「活干完了但没人知道」的场景最需要通知。

通知由 DSH 自己发出：桌面端（Electron）弹出的横幅归属是 **DeepSeek Harness**，
点一下 macOS 会激活应用，DSH Desktop 的窗口随即被拉到前台，并**切回这条通知对应的
那个会话**。

## 前提：macOS 通知权限

横幅由 macOS 决定显不显示。**第一次用之前，先在「系统设置 → 通知 → DeepSeek
Harness」里把通知打开**（允许通知，样式选「提醒」）。

没打开时的症状很容易误判：插件日志照样记「已通知」，客户端也照样把通知交给了系统，
但横幅不出现。系统日志里能看到该应用的通知被拒（`notificationsAllowed: false`）。
插件无权代开这个权限，也不该代改系统设置。

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
DSH Desktop 并切回对应的会话。客户端接不到时（没有客户端、headless、浏览器没给通知
权限），宿主在 `fallbackDelayMs` 之后用自己的 osascript 通道补一条，那条的归属是
「脚本编辑器」，点它只会打开脚本编辑器、切不回会话。把 `fallback` 设成 `none` 可以
彻底不要兜底。

## 已知限制

- **macOS 通知权限与专注模式**：横幅由系统决定显不显示，插件管不了这一层；首次使用
  若没看到横幅，去「系统设置 → 通知」确认允许（见上面的「前提」）。
- **窗口关闭不影响通知**：DSH 的关闭动作是「隐藏窗口」，页面与 Host 继续运行
  （`apps/desktop/src/main.ts:1329` 的 `close` 事件被 `preventDefault` 后走
  `hideMainWindow`）。实测窗口隐藏期间通知照发、归属照旧、点它也能切回会话。只有整个
  DSH 退出（⌘Q 或 Windows 托盘退出）之后才没有通知。
- **浏览器端**：普通浏览器里通知权限默认是不给的（插件不主动弹权限框，避免打断正事），
  这种情况下走宿主的兜底通道。
- **一个任务可能收两条**：派子代理那一轮结束弹一条，子代理跑完、父回合转述结果
  那轮又弹一条。嫌第二条吵就把 `minDurationMs` 调大（例如 30000，转述那种秒回会被
  滤掉）。
- **Windows 没有内置通道**：客户端那半边依赖浏览器的 Notification API，宿主兜底
  只实现了 macOS，Windows / Linux 不再补兜底通道（主路能用就用，不能用就算了）。
- **跨平台现状**：主路（客户端弹通知）本身跨平台，macOS 与 Windows 的 DSH Desktop 都能用，
  代码不用改；差别只在系统侧要不要给应用发通知的授权（macOS 要在「系统设置 → 通知」
  里放行）。Linux 没有 DSH Desktop 发行版，通知还依赖 libnotify/dbus 通知守护进程。
- **启动时有一条无害告警**：web boot 控制台会出现 `web boot: warning: 1 entry did not
  activate @dreamariner/dsh-notify: import failed`，几十毫秒后插件照常激活
  （控制台随后有「客户端就绪」，宿主日志有「客户端已接入通知流」）。这是宿主启动检查
  与动态 client 插件异步装载的时序差，与本插件无关。

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
2026-11-17T09:04:24 [info] 已通知：kind=completed 用时=2750ms 会话=session-9b7a4c37… 正文="收到"
```

客户端半边另在浏览器控制台自报两行（排查「点了没反应」时看它）：

```
[dsh-notify] 客户端就绪：uiWorkspace=可用（点横幅切回会话）
[dsh-notify] 已弹系统通知：DSH · 收到 · 会话=session-9b7a4c37…
[dsh-notify] 点横幅 → 切回会话：session-9b7a4c37…
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
  src/client/index.tsx 客户端半边：接通知流 → 弹系统通知 → 点横幅切回会话
  src/client/session-jump.ts  点横幅切会话的纯逻辑（可单测）
packages/protocol/     wire 协议声明源（git 子模块）
```

## 发布

```sh
pnpm --filter @dreamariner/dsh-notify publish
```

发布前检查：`locale/*.json` 的 `meta.title` / `meta.description` 换成真实文案、
`icon.svg` 换成原创图形（Plugin Manager 与 Settings 会展示它们）。
