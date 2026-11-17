# @dreamariner/dsh-notify

DeepSeek Harness 插件：**回合（turn）跑完时发一条本机系统通知**。

DSH 的对话跑完时人不在屏幕前就没有任何信号，只能一直盯屏。macOS 上关掉窗口 DSH
仍在后台跑，这种「活干完了但没人知道」的场景最需要通知。本插件在回合结束时弹一条
系统通知，正文是最后一条助手消息的摘要。

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
pnpm profile:add          # link: 本仓装进 ~/.dsh/profiles/desktop；缺依赖自动 install、装前自动构建
pnpm profile:add --remove # 反向卸载
```

装完**重启 DSH 实例一次**生效。desktop profile 由应用自己管理，官方 CLI 触达不到，
所以用上面这条脚本。

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
    soundName: Glass
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
| `command` | string[] | `[]` | 自定义通知命令（argv 形态），空则按平台自动选 |
| `soundName` | string | `''` | macOS 声音名（`/System/Library/Sounds` 下不含扩展名） |
| `appName` | string | `DeepSeek Harness` | 通知归属的应用名 |
| `notifyOnLoad` | boolean | `false` | 装载时先弹一条自检通知 |

### 自定义通知命令

`command` 是 argv 数组，不经 shell。占位符 `{title}` 与 `{body}` 就地替换；模板里
一个占位符都没有时，标题与正文按顺序追加到参数末尾。

```yaml
config:
  command:
    - /opt/homebrew/bin/terminal-notifier
    - -title
    - '{title}'
    - -message
    - '{body}'
```

## 平台与已知限制

- **macOS**：走 `/usr/bin/osascript` 的 `display notification`。通知横幅的归属应用会
  显示成「脚本编辑器 / Script Editor」（osascript 属于该应用），想要自己的名字就用
  `command` 指到 `terminal-notifier` 或自建 .app bundle。
- **Linux**：走 `notify-send`，需要系统装了 `libnotify-bin`。
- **Windows**：没有内置通道（不实现未经实测的 PowerShell toast），要通知就配 `command`。
- **系统权限与专注模式**：macOS 的通知权限与专注模式会压制横幅，插件管不了这一层；
  首次使用若没看到横幅，去「系统设置 → 通知」确认允许。
- **子代理回合**：默认不报。若打开了 `includeSubagents`，一轮里可能弹多次。

## 开发

```sh
pnpm install
pnpm test          # vitest run
pnpm typecheck     # tsc --noEmit
pnpm build         # 构建到 lib/（产物不入库）
pnpm dev           # watch 构建
pnpm dev:hmr       # 把 lib/ 注册进本机 home patch 的 hmr watch 根（先重启实例一次，之后免重启热重载）
```

DSH 实例管理（固定经这些命令启动，打包版才有 inspector）：

```sh
pnpm dsh:status    # 实例在跑与否 + 访问地址
pnpm dsh:start     # 启动（构建门失败会阻断启动）
pnpm dsh:restart   # 优雅停止后重启
pnpm dsh:stop
pnpm dsh:probe     # 连实例验证本插件装载且 active
```

## 结构

```
src/index.ts        宿主半边入口：订阅会话事件 → 决策 → 发通知
src/config.ts       配置 schema（schemastery）
src/notify.ts       通知通道：平台命令构造、argv 发送、占位符替换
src/turn-watcher.ts 通知决策纯逻辑（四道闸，可单测）
cordis.patch.yml    自挂载 bundle patch
locale/*.json       展示元数据（meta.title / meta.description）
icon.svg            插件图标
tests/              决策单测 / 通道单测 / bundle 形态守卫 / 导入纪律护栏
```
