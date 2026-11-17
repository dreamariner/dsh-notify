# AGENTS.md · dsh-notify

> Agent 进仓先读本文：项目定位、目录结构、形态不变量、门禁与红线。人向的安装与使用说明在 [README.md](README.md)。

## 项目定位

@dreamariner/dsh-notify：回合（turn）跑完时发一条本机系统通知。DSH 的对话跑完时人不在屏幕前就没有任何信号，macOS 上关掉窗口 DSH 仍在后台跑，这种「活干完了但没人知道」的场景最需要通知。由 create-dsh-plugin 生成的 DeepSeek Harness（DSH）插件，形态：**纯 Node 半边**。

## 文档机制

- 需求与迭代跟踪：[docs/issues/AGENTS.md](docs/issues/AGENTS.md)（唯一索引 / 状态真相源，新 issue 走其工作流）
- 系统现状：[docs/wiki/00-变更日志.md](docs/wiki/00-变更日志.md)（结构变化在此留时间线）

## 目录结构

```
├── src/                # 源码
│   ├── index.ts        # 宿主接线：订阅会话事件 → 决策 → 发通知
│   ├── config.ts       # 配置 schema（schemastery，peer 共享宿主实例）
│   ├── notify.ts       # 通知通道：平台命令构造、argv 发送、占位符替换
│   └── turn-watcher.ts # 通知决策纯逻辑（四道闸，可单测）
├── tests/              # 自守护栏测试（决策单测 / 通道单测 / bundle 形态 / 导入纪律）
├── scripts/            # 项目共用：profile-add / lib/manifest-deps（host 另有 dev-hmr）
├── locale/             # 展示元数据（Plugin Manager / Settings 在不激活插件时经 exports 读取）
├── icon.svg            # 插件图标（透明底铃铛，原创图形）
├── cordis.patch.yml    # 自挂载 bundle 的配置层
├── lib/                # 构建产物（不入库）
└── package.json        # manifest（files / exports / dsh 键）
```

## 形态速记

- 单包布局：根即插件包，npm 发布 / `dsh plugin add` / `profile:add` 都以本仓为单位。
- host 半边：`src/index.ts`（宿主接线）+ `src/config.ts`（配置 schema）+ `src/notify.ts`
  （通知通道）+ `src/turn-watcher.ts`（决策纯逻辑），无浏览器面。
- 本插件不注册 Agent tool：通知是宿主行为，不是模型能力，少一个 Agent 可见面少一类噪音。

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
```

## 红线

- **lib 不入库**：构建产物不进 git。gitignore 已按布局锚定（single = `/lib/`，workspace = `packages/*/lib/`）；勿改回裸 `lib/`，那会任意深度匹配误伤 `scripts/lib/` 共享模块，clone 出来的仓 build 直接挂。
- **发布面不含 src**：`files` 白名单与 `exports` 都不带源码；`./src/*` 是官方 client 包的 monorepo 内约定，独立发行插件无人消费。
- **DSH 版本锚 `0.2.2-rc.2`**：peerDependencies 范围与 `engines.dsh` 都锚在此，升级时同步 `package.json` 与注释。
- **依赖决策表**：peer = 外置（宿主供给同一实例，运行期共享）；dependencies = 内联自带；devDependencies = 只许 `import type`。唯一事实源是 `package.json`（`scripts/lib/manifest-deps.mjs` 派生 tsdown 三件套），源码导入纪律由 `tests/import-guard.spec.ts` 机械执行。
- **schemastery 双声明**：peer（与宿主共享实例）+ dev（精确钉本仓 typecheck），缺一会装出两份实例。
- **cordis 只许 `import type { Context }`**：dev 钉版仅服务 typecheck。值导入前必须先把 cordis 升进 peerDependencies，否则 alwaysBundle 会把它内联进产物，运行期出现第二份 cordis 实例（作用域与注册表不跨副本共享，插件静默失灵；教训源自早期插件仓的实测事故（2026-10-22）），导入护栏会拦。
- **实例固定经 `pnpm dsh:start` 启动**：打包版要带 `--inspect` 才有 inspector，Dock 直启的实例 stop / restart 管不了；启动前构建门失败会阻断（lib 不入库，没有旧产物可跑）。
- **行文不用破折号「——」**（zero 知识库行文规范，2026-11-01 起）。
