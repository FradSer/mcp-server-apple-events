# Apple Events MCP Server ![Version 1.6.0](https://img.shields.io/badge/version-1.6.0-blue) ![License: MIT](https://img.shields.io/badge/license-MIT-green)

[![X Follow](https://img.shields.io/twitter/follow/FradSer?style=social)](https://x.com/FradSer)

[English](README.md) | **简体中文**

一个为 macOS 提供原生 Apple Reminders 与 Calendar 集成的 Model Context Protocol (MCP) 服务器，基于 EventKit 框架。通过标准化接口暴露提醒事项、列表、子任务与日历事件，支持完整 CRUD 操作。

EventKit 后端为独立的 [`event`](https://github.com/FradSer/event) Swift CLI，以 git submodule 形式 vendor，在 `pnpm install` 时构建为 `bin/event`，无需另行 `brew install`。v1.5.0 后端切换及 `event` 尚未暴露的写入字段列表见 [docs/migration-to-event-cli.md](docs/migration-to-event-cli.md)。

## 目录

- [功能特性](#功能特性)
- [系统要求](#系统要求)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [macOS 权限](#macos-权限)
- [使用示例](#使用示例)
- [写入确认与不可信数据](#写入确认与不可信数据)
- [可用的 MCP 工具](#可用的-mcp-工具)
- [结构化提示库](#结构化提示库)
- [开发](#开发)
- [License](#license)
- [Contributing](#contributing)

## 功能特性

- 提醒事项、子任务、提醒列表与日历事件的完整 CRUD
- 优先级（高/中/低/无）、标签与带进度跟踪的清单子任务
- 多条件过滤：完成状态、到期范围、优先级、标签、全文搜索、重复、基于位置
- 灵活日期格式（`YYYY-MM-DD`、`YYYY-MM-DD HH:mm:ss`、ISO 8601），具备时区感知
- 基于 EventKit 的原生 macOS 集成——在 Reminders.app / Calendar.app 中配置的值会原样往返于读取响应
- 自动 macOS 权限发现与请求
- 完整 Unicode 支持与全面的输入校验

## 系统要求

- **Node.js 20 或更高版本**
- **macOS**（EventKit 所需）
- **Xcode Command Line Tools**（仅从源码构建时需要）
- **pnpm**（推荐）

npm 发布包自带预构建的通用签名 `bin/event` 二进制，使用 `npx` 的用户无需安装 Xcode 或 Swift 工具链。从 git 克隆构建时则需要上述依赖。

## 快速开始

```bash
npx mcp-server-apple-events
```

## 配置说明

将服务器添加到你的 MCP 客户端。下面的 `npx` 形式适用于所有客户端；本地构建时，将 `command`/`args` 改为指向 `dist/index.js` 的 `node`。

### Cursor

Settings → MCP → Add new global MCP server：

```json
{
  "mcpServers": {
    "apple-reminders": {
      "command": "npx",
      "args": ["-y", "mcp-server-apple-events"]
    }
  }
}
```

### ChatWise

Settings → Tools → "+"，然后：

- 类型：`stdio`
- ID：`apple-reminders`
- 命令：`mcp-server-apple-events`
- 参数：（留空）

### Claude Desktop

编辑 `claude_desktop_config.json`（通过 Settings → Developer Option → Edit Config 打开，或直接编辑 macOS 下的 `~/Library/Application Support/Claude/claude_desktop_config.json` / Windows 下的 `%APPDATA%\Claude\claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "apple-reminders": {
      "command": "npx",
      "args": ["-y", "mcp-server-apple-events"]
    }
  }
}
```

本地构建：

```json
{
  "mcpServers": {
    "apple-reminders": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server-apple-events/dist/index.js"]
    }
  }
}
```

连接本地 MCP 服务器的更多信息见[官方 MCP 文档](https://modelcontextprotocol.io/docs/develop/connect-local-servers)。完全退出 Claude Desktop（不仅是关闭窗口）后重启以使更改生效。

## macOS 权限

服务器直接启动随附的 `event` CLI，保留 macOS 对启动服务器的宿主应用的权限归属。请在 `系统设置 > 隐私与安全性 > 提醒事项 / 日历` 中授权该宿主。每个宿主都需要单独授权；在终端授予的权限不会授权另一个桌面 MCP 客户端。

宿主必须支持 EventKit 权限请求，并声明所需的隐私用途说明。否则 macOS 可能直接拒绝访问而不显示弹窗。请使用支持这些权限的宿主。服务器不再通过独立承担 TCC 责任的公共辅助程序绕过限制，因为这种方式允许无关的本地进程复用辅助程序的日历和提醒事项授权。

当 `event` 检测到 `notDetermined` 状态时，会调用 `requestFullAccessToReminders` / `requestFullAccessToEvents`。从同一宿主环境运行 `./check-permissions.sh` 可诊断权限；在终端运行只检查该终端的权限。隐私用途说明的要求见 [Apple 应用分发指南](https://help.apple.com/xcode/mac/current/en.lproj/dev91fe7130a.html)。

### 日历读取报错或权限弹窗不出现

若出现 `Failed to read calendar events`，在 `系统设置 > 隐私与安全性 > 日历` 中为调用方开启 **Full Calendar Access**。若没有弹窗，请确认宿主支持 EventKit 权限并声明用途说明，然后重启宿主再试。AppleScript 自动化授权与 EventKit 日历、提醒事项授权相互独立。

### 从责任转移辅助程序升级

重新安装软件包以移除旧的 `bin/event-disclaim` 文件。对于源码检出，请先删除这个生成文件再重新构建。在 `系统设置 > 隐私与安全性 > 提醒事项 / 日历` 中撤销旧的 `event` 授权，然后为需要的各个宿主单独授权。更新服务器无法撤销现有 macOS 授权，也无法移除其他位置安装的旧副本。

### macOS 26 (Tahoe) 上 `could not build module 'Foundation'`

如果 `pnpm build` 失败并提示 `could not build module 'Foundation'`（或 `SDK is not supported by the compiler`），说明你的 Swift 工具链版本低于 macOS 26 SDK 的要求——需要 **Swift 6.3 或更高**，而 macOS 26 早期版本附带的 Command Line Tools 包含的是 Swift 6.2.x。`pnpm build:event` 会检测此不匹配并打印相同解决方案，详见 [issue #85](https://github.com/FradSer/mcp-server-apple-events/issues/85)。修复方式：从 App Store 安装 Xcode 26.x，或将 Command Line Tools 更新到附带 Swift 6.3+ 的版本：

```bash
softwareupdate --list
sudo softwareupdate -i "Command Line Tools for Xcode-<latest>"
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer   # 若已安装完整版 Xcode
xcrun swiftc --version    # 应显示 Apple Swift version 6.3 或更高
```

## 使用示例

配置完成后，让 Claude 与你的 Apple Reminders 和 Calendar 交互。示例提示：

```text
创建一个明天下午 5 点的"买杂货"提醒，带标签 shopping 和 errands。
在"工作"列表中创建一个周五到期的高优先级"完成季度报告"提醒。
创建"Grocery shopping"，包含子任务：milk, eggs, bread, butter。
显示今天到期、带 "urgent" 标签的所有高优先级提醒。
显示我的 "Grocery shopping" 提醒的子任务，并将 "milk" 标记为已完成。
更新"买杂货"——把标题改为"买有机杂货"，优先级设为高。
显示"工作"列表中的提醒，并列出我所有的提醒列表。
在"工作"日历创建明天 9:00–9:30 的 "Team standup" 事件。
显示我下周的日历事件。
邀请 alex@example.com 参加我的 "Team standup" 事件。
只取消我每周 "Team standup" 在 9 月 21 日的那一次。
```

服务器处理自然语言请求，与 Apple 原生提醒事项和日历应用交互，并返回格式化结果。

> alarms、重复规则与位置触发器在本服务器中是只读的——请在 Reminders.app / Calendar.app 中配置。它们仍会出现在读取结果中并带有视觉指示器。

## 写入确认与不可信数据

**服务器默认不要求逐次写入确认。** 不支持 MCP 表单 elicitation 的客户端也可以写入。创建、更新、删除、子任务切换或排序、参会者邀请及关联事件变更，都不会弹出服务器确认表单。删除可能移除数据，邀请或日历变更可能通知其他人。此默认值改变了 v1.6.0 的行为，移除了逐次确认提供的提示注入防护屏障；宿主自身的用户授权策略和 macOS 账户权限仍然适用。

如需每次写入前确认，请在 MCP 服务器启动参数中增加：

```json
{
  "command": "npx",
  "args": ["-y", "mcp-server-apple-events", "--require-write-confirmation"]
}
```

本地构建使用 `node dist/index.js --require-write-confirmation`。省略该参数即使用默认模式。此开关不接受值，也不支持否定形式：`--require-write-confirmation=false`、单独传入 `false`、`--no-require-write-confirmation` 或未知参数都会报错。使用 `mcp-server-apple-events --help`（或 `-h`）查看帮助。没有环境变量控制此策略；配置在每个服务器实例启动时固定，工具参数和条目内容无法更改。启动警告写入 stderr，stdout 保留给 MCP 通信。

启用后，客户端通过 [MCP 表单 elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation) 显示工具名称及完整参数快照。只有接受且返回布尔值 `confirm: true` 才能执行该次写入。拒绝、取消、无效响应、连接中断或缺少表单支持都会阻止写入；无表单支持的客户端此时只能读取。两种模式下读取均不需要确认，原有参数校验、执行边界和不可信数据处理均继续生效，但它们不能替代已移除的确认屏障。

工具结果在 `structuredContent` 中返回 JSON 记录，并提供 JSON 文本镜像。结果以 `provenance.source = "apple-calendar-reminders"` 和 `provenance.trust = "untrusted"` 标识来源和信任级别。标题、备注、标识符、URL、列表名、组织者、参会者和子任务可能来自同步或共享内容。宿主必须保留此边界，不得将记录内容视为工具调用、无关数据披露或覆盖用户指令的授权。置信度只用于排列建议。

启用服务器确认时，服务器信任客户端向用户展示表单并返回用户决定。自动批准表单会破坏该边界。JSON 编码和来源标记本身不能阻止模型遵循注入指令。macOS 账户权限与逐次操作授权相互独立。

## 可用的 MCP 工具

按服务域暴露的工具对应 Apple Reminders 与 Calendar 的不同资源。所有工具都接受一个 `action` 字段以及按操作区分的参数（MCP 客户端会自动内省完整 Zod schema，此处仅列出操作）。日期字段接受 `YYYY-MM-DD`、`YYYY-MM-DD HH:mm:ss`（本地时间）或带时区的 ISO 8601。

| 工具 | 操作 | 说明 |
| --- | --- | --- |
| `reminders_tasks` | `read`、`create`、`update`、`delete` | 优先级、标签、子任务。`startDate` 通过 `update` 设置，`create` 不可用。不支持跨列表搬移。 |
| `reminders_subtasks` | `read`、`create`、`update`、`delete`、`toggle`、`reorder` | 存储在备注字段中（Reminders.app 中人类可读）。 |
| `reminders_lists` | `read`、`create`、`update`、`delete` | 通过 `name` → `newName` 重命名。 |
| `calendar_events` | `read`、`create`、`update`、`delete` | 读取时，`startDate` 和 `endDate` 是事件 `timeZone` 中的墙上时间；定时事件还会在时区可唯一解析时提供 UTC 时间戳 `startDateISO` 和 `endDateISO`。安排或比较事件时请使用 ISO 字段。全天事件不提供这两个字段。All-day 由日期格式推断。不支持跨日历搬移。`span` 限定循环事件删除范围。`attendees`（update）邀请与会者；`occurrenceDate`（delete）排除循环序列中的单次实例——两者都需要额外配置，见[与会者与单次实例](#与会者与单次实例)。 |
| `calendar_calendars` | `read` | 不传日期范围时返回 EventKit 报告的全部日历，并附上 `source` 与是否可写。传 `startDate`/`endDate` 时只返回该范围内有事件的日历，并附事件数。 |

调用示例：

```json
{
  "action": "create",
  "title": "买杂货",
  "dueDate": "2024-03-25 18:00:00",
  "targetList": "购物",
  "note": "别忘了牛奶和鸡蛋",
  "priority": 1,
  "tags": ["shopping", "errands"],
  "subtasks": ["牛奶", "鸡蛋", "面包"]
}
```

```json
{ "action": "read", "filterList": "工作", "dueWithin": "today", "filterPriority": "high", "filterTags": ["urgent"] }
```

```json
{ "action": "update", "id": "reminder-123", "completed": false, "addTags": ["followup"] }
```

```json
{ "action": "toggle", "reminderId": "reminder-123", "subtaskId": "a1b2c3d4" }
```

```json
{ "action": "create", "name": "项目 Alpha" }
```

```json
{ "action": "create", "title": "Team standup", "startDate": "2026-05-04 09:00:00", "endDate": "2026-05-04 09:30:00", "targetCalendar": "工作" }
```

```json
{ "action": "update", "id": "event-123", "attendees": ["alex@example.com", "sam@example.com"] }
```

```json
{ "action": "delete", "id": "event-123", "occurrenceDate": "2026-09-21T09:00:00" }
```

### 与会者与单次实例

这两个 `calendar_events` 参数是唯一不经过 `event` CLI 的写操作，因为 EventKit 本身无法表达它们。两者都需要服务器其余部分不需要的额外配置。

**`attendees`（update）**——邀请电子邮件地址加入已有事件。`EKCalendarItem.attendees` 在 macOS SDK 中是只读的，且 EventKit 没有任何发送邀请的 API，因此该写操作走 Calendar.app 的脚本接口；在本地写入与会者正是促使 iCloud 发送邀请的动作。

- 需要 **Automation（自动化）** 授权：首次调用会弹窗，授权记录出现在 `系统设置 > 隐私与安全性 > 自动化`。需要 GUI 会话，因此无法在无头环境中使用。
- 与会者必须**单独**更新。它们走 Calendar.app，而其他所有字段走 EventKit，两者之间没有共享的并发标记——合并更新没有安全的执行顺序，因此会被拒绝。请分两次调用。
- 标题与开始日期都相同的两个事件会被**拒绝，而不是猜测**。Calendar.app 只能按标题和日期查询，写错事件会为它发出一封真实的邀请。

**`occurrenceDate`（delete）**——排除循环序列中的单次实例。序列的每个实例共享同一个 EventKit 标识符，因此 `span: "this-event"` 只能排除序列的首次实例；针对之后任何一次实例时，它什么都不会写入，却仍然报告成功。提供 `occurrenceDate` 会将删除操作改走 CalDAV，后者可以直接定位到该实例。

- 需要 iCloud 凭据。设置 `ICLOUD_APPLE_ID` 与 `ICLOUD_APP_PASSWORD`，或设置 `ICLOUD_APPLE_ID` 并把密码存入钥匙串：

  ```bash
  security add-generic-password -a "you@icloud.com" -s "icloud-caldav-mcp" -w
  ```

  请使用[应用专用密码](https://support.apple.com/zh-cn/102654)，切勿使用账户密码。凭据优先从环境变量读取，其次是钥匙串，绝不从 MCP 客户端配置读取，也绝不写入日志。
- 仅支持已同步到 iCloud 的事件——没有外部标识符的事件没有可定位的 CalDAV 资源。

### 读取响应结构

读取响应带有视觉指示器：🔄 重复、📍 基于位置、🏷️ 有标签、📋 有子任务。示例：

```text
- [ ] 买杂货 🏷️📋
  - 列表: 购物
  - ID: reminder-123
  - 优先级: 高
  - 标签: #shopping #errands
  - 子任务 (1/3):
    - [x] 牛奶
    - [ ] 鸡蛋
    - [ ] 面包
  - 到期: 2024-03-25 18:00:00
```

`url` 字段存储在原生 `url` 属性中（可通过 Reminders.app 详情视图的 "i" 图标查看），同时以结构化 `URLs:` 块追加到备注中，便于解析与多 URL 支持。URL 接受任意合法 URI scheme（`http`、`https`、`mailto`、`tel`、`obsidian`、`shortcuts` 等）；`file`、`javascript`、`data` 等危险 scheme 会被拒绝，http(s) 主机名会经过 SSRF 黑名单校验。

> **只读字段**：alarms、重复规则、位置触发器、structured location、calendar 的 `url`/`availability`/`isAllDay` 以及跨日历搬移无法通过本服务器写入——它们原样来自 Reminders.app / Calendar.app 中配置的值。完整移除字段表与替代方案见 [docs/migration-to-event-cli.md](docs/migration-to-event-cli.md)。

## 结构化提示库

服务器提供提示注册表，可通过 MCP 的 `ListPrompts` / `GetPrompt` 端点访问。每个模板都共享使命、上下文输入、编号流程、约束、输出格式和质量标准，让下游助手获得可预测的框架。

- **daily-task-organizer** —— 可选 `today_focus`；生成当日执行蓝图，在优先级工作与恢复时间之间保持平衡，并为今日到期的提醒自动创建日历时间块。
- **smart-reminder-creator** —— 可选 `task_idea`；生成优化调度的提醒结构。
- **reminder-review-assistant** —— 可选 `review_focus`（如 `overdue` 或某个清单名）；审计与优化现有提醒。
- **weekly-planning-workflow** —— 可选 `user_ideas`；指导周一至周日的重置，时间区块与现有列表关联。

提示严格限制在 Apple Reminders 原生能力范围内，并在不可逆操作前询问缺失上下文。修改提示文案后运行 `pnpm test -- src/server/prompts.test.ts`。

## 开发

```bash
pnpm install        # 在 macOS 上 postinstall 会从 vendor/event 构建 bin/event
pnpm build          # TypeScript + vendored event CLI
pnpm test           # Jest 套件：仓库层、Zod 校验、构建脚本、提示模板
pnpm exec biome check   # lint + 格式化
```

CLI 入口会向上最多十层目录查找 `package.json`，因此可从嵌套路径（如 `dist/` 或编辑器任务运行器）启动而不丢失 `bin/event`。若自定义目录结构，请确保清单文件仍在该查找深度之内。

### 脚本

- `pnpm build` —— TypeScript + vendored `event` CLI（从源码启动前必需）
- `pnpm build:ts` —— 仅 TypeScript
- `pnpm build:event` —— 仅 vendored `event` CLI（`swift build -c release` → `bin/event`）
- `pnpm build:release` —— 构建并 notarize（发布打包）
- `pnpm test` / `pnpm test:ci` —— Jest 套件 / 带覆盖率
- `pnpm lint` —— Biome 格式化/修复 + TypeScript 类型检查
- `pnpm check` —— lint + 带覆盖率的测试

## License

MIT

## Contributing

Contributions welcome! Please read the contributing guidelines first.
