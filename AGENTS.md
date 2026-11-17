# AGENTS.md · dsh-notify

> Agent 进仓先读本文：项目定位、目录结构、形态不变量、门禁与红线。人向的安装与使用说明在 [README.md](README.md)。

## 项目定位

@dreamariner/dsh-notify：DSH 回合结束系统通知。回合跑完时弹一条系统通知：桌面端的横幅归属是 DSH 本身（点一下唤起 DSH Desktop 并切回那条通知对应的会话），客户端接不到时宿主用 osascript 兜底补一条。DeepSeek Harness（DSH）插件，形态：**host + client 双端**。

## 文档机制

- 需求与迭代跟踪：[docs/issues/AGENTS.md](docs/issues/AGENTS.md)（唯一索引 / 状态真相源，新 issue 走其工作流）
- 系统现状：[docs/wiki/00-变更日志.md](docs/wiki/00-变更日志.md)（结构变化在此留时间线）

## 目录结构

```
├── packages/dsh-notify/     # 插件包（src / tests / locale / icon.svg / cordis.patch.yml）
├── packages/protocol/          # typert 协议声明源 submodule（pinned vendor，勿改内容）
├── scripts/                    # 项目共用：profile-add / dev-hmr / sync-pack-docs / lib/manifest-deps
│                               # （full 另有 ensure-protocol）
├── lib/                        # 各包构建产物（packages/*/lib/，不入库）
├── tsconfig.host.json          # host 面聚合 tsconfig（registration + paths 重定向）
└── package.json                # 根壳 manifest（private；pnpm -r 转发构建）
```

## 形态速记

- workspace 布局：根壳承载测试与类型检查，插件包在 `packages/dsh-notify/`；`add` 子命令可继续追加插件，无需迁移结构。
- 双端：host 半边 `src/index.ts`（订阅会话事件 → 决策 → 推通知载荷）；client 半边 `src/client/index.tsx`（接通知流 → 用系统的 Notification API 弹横幅）。
- **通知归属与唤起**：归属显示「DeepSeek Harness」、点一下唤起 DSH Desktop，都靠 client 半边在 Electron 渲染进程里发。host 自己用 osascript 发的话归属是「脚本编辑器」，点它唤起的是脚本编辑器。
- **点横幅切回会话**：载荷带 `sessionId`（`src/contract.ts`），client 半边点横幅时用 `ctx.get('uiWorkspace').openSession(sessionId)` 把会话切过去。`uiWorkspace` 是可选服务（动态插件 ctx 的 `ctx.get` 是免声明的可选查找），取不到就只唤起窗口、不切会话；client 装载时会自报一行「客户端就绪：uiWorkspace=可用/不可用」，排查时先看它。
- **macOS 通知权限是前提**：系统没给 DeepSeek Harness 通知授权时，通知请求会被 macOS 吞掉（横幅不出现，但插件日志照样记「已通知」；系统日志里能看到 `notificationsAllowed: false`）。要在「系统设置 → 通知 → DeepSeek Harness」里允许通知，插件无权代开。
- **两路互斥**：client 半边接走载荷就不兜底；没人接（headless、浏览器没给通知权限）时 host 在 `fallbackDelayMs` 后用 osascript 补一条。日志里「客户端已接入通知流」与「宿主兜底已发出」两条能直接分辨走的是哪条。
- **跨平台口径（2026-11-17 定）**：主路（client 半边用 Web Notification API）天然跨平台，不为平台写分支；**兜底通道只保留 macOS 的 osascript，不再扩 Windows / Linux**（林老师定：主路行就行，不行就不行）。DSH Desktop 的发行目标只有 macOS 与 Windows（`apps/desktop/scripts/package-target.ts` 的 `builderPlatform`），Linux 无宿主，Linux 的 Chromium 通知还依赖 libnotify/dbus，所以不值得为它写通道。`fallback` 配置项因此保持 `'osascript' | 'none'` 两个值。
- typert face：client → host 的类型化 RPC，方法只声明在 `src/remote.ts`，构建期生成 `lib/typert.host.*`（宿主装配 wire codec）与 `lib/typert.remote-client.*`（client 侧类型化契约）。
- wire 边界类型必须放在**公开非根类型子路径**（本仓是 `src/contract.ts` 经 `src/types.ts` 发布为 `./types`），否则 typert 生成器直接报「must be exported from a public non-root type subpath」。
- 协议声明源：`packages/protocol` submodule（pinned vendor，勿在本仓改它的内容）。

## 常用命令

```sh
pnpm install        # 首次
pnpm build          # 构建（产物进 lib/，不入库）
pnpm test           # 自守护栏测试
pnpm typecheck
pnpm dev            # watch 重建
pnpm dev:hmr        # host 半边热重载接线（client 半边重建即热替换）
pnpm profile:add    # link: 安装进 ~/.dsh/profiles/desktop（缺依赖自动 install、装前自动构建、登记名单、自检）

# ── DSH 实例管理 ──
# 门：构建（恒开）+ 版本（根 manifest 有 dshVersion 时对账官方版，DSH_ALLOW_VERSION_MISMATCH=1 越过）
#    + 在飞回合守卫（DSH_INFLIGHT_GUARD=1 开启，DSH_FORCE_STOP=1 越过）。
# 仓根 .env（gitignored）自动加载：真实环境变量优先，.env 只补缺（路径/端口/形态/开关）。
pnpm dsh:status     # 实例在跑与否 + 访问地址（--json 供 automation）
pnpm dsh:start [前台|后台]   # 启动实例（打包版带 --inspect；启动前过构建门与版本门）
pnpm dsh:restart    # 优雅停止后重启（默认后台；stop/restart 前过在飞守卫）
pnpm dsh:stop       # 优雅停止（inspector 自动应答退出；兜底属主圈定）
pnpm dsh:probe      # 连实例验证本插件装载且 active（pluginInventory/list）

pnpm verify:notify  # 真机验收：发一条提示词跑一轮真实对话，读插件日志判定是否发出通知
```

## 红线

- **lib 不入库**：构建产物不进 git。gitignore 已按布局锚定（single = `/lib/`，workspace = `packages/*/lib/`）；勿改回裸 `lib/`，那会任意深度匹配误伤 `scripts/lib/` 共享模块，clone 出来的仓 build 直接挂。
- **发布面不含 src**：`files` 白名单与 `exports` 都不带源码；`./src/*` 是官方 client 包的 monorepo 内约定，独立发行插件无人消费。
- **DSH 版本锚 `0.2.2-rc.2`**：peerDependencies 范围与 `engines.dsh` 都锚在此，升级时同步 `package.json` 与注释。
- **依赖决策表**：peer = 外置（宿主供给同一实例，运行期共享）；dependencies = 内联自带；devDependencies = 只许 `import type`。唯一事实源是 `package.json`（`scripts/lib/manifest-deps.mjs` 派生 tsdown 三件套），源码导入纪律由 `tests/import-guard.spec.ts` 机械执行。
- **schemastery 双声明**：peer（与宿主共享实例）+ dev（精确钉本仓 typecheck），缺一会装出两份实例。
- **cordis 只许 `import type { Context }`**：dev 钉版仅服务 typecheck。值导入前必须先把 cordis 升进 peerDependencies，否则 alwaysBundle 会把它内联进产物，运行期出现第二份 cordis 实例（作用域与注册表不跨副本共享，插件静默失灵；教训源自早期插件仓的实测事故（2026-10-22）），导入护栏会拦。
- **typert 纪律**：face 方法只声明在 `src/remote.ts`；协议包 devDep 必须裸精确版本（放宽会让 vendor 副本成为合法候选）；zod 必须留在 dependencies（生成产物 import 它）。
- **实例固定经 `pnpm dsh:start` 启动**：打包版要带 `--inspect` 才有 inspector，Dock 直启的实例 stop / restart 管不了；启动前构建门失败会阻断（lib 不入库，没有旧产物可跑）。
- **行文不用破折号「——」**（zero 知识库行文规范，2026-11-01 起）。
