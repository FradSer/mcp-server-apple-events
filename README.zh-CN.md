# Apple Events MCP Server ![Version 1.5.0](https://img.shields.io/badge/version-1.5.0-blue) ![License: MIT](https://img.shields.io/badge/license-MIT-green)

[![X Follow](https://img.shields.io/twitter/follow/FradSer?style=social)](https://x.com/FradSer)

[English](README.md) | **简体中文**

一个为 macOS 提供原生 Apple Reminders 和 Calendar 集成的 Model Context Protocol (MCP) 服务器。它通过标准化接口暴露 Apple Reminders 与 Calendar Events，支持完整的 CRUD 操作。

> [!NOTE]
> **本服务器的实现基础：[event](https://github.com/FradSer/event) —— 纯 Swift 实现的 macOS Apple Reminders 与 Calendar 命令行工具。**
>
> 从 v1.5.0 起，本服务器的 EventKit 后端切换为独立的 [`event`](https://github.com/FradSer/event) CLI。`event` 以 git submodule 的形式 vendor 在 `vendor/event` 下，在 `pnpm install` 时自动构建为 `bin/event`，无需另行 `brew install`。两个项目共享同一份 Swift 代码。由于 `event` 目前尚未暴露对应的 CLI 标志，部分 MCP 工具写入字段在此次切换中被移除——alarms、重复规则、位置触发器、reminder 的 `location`、calendar 的 `url` / `structuredLocation` / `availability` / `isAllDay` 写入以及跨日历搬移。读取路径保持不变，因此在 Reminders.app / Calendar.app 中配置的值仍会原样往返于本服务器。完整移除字段表与替代方案见 [docs/migration-to-event-cli.md](docs/migration-to-event-cli.md)。对于本 MCP 服务器以外的脚本与自动化场景，建议直接使用 [`event`](https://github.com/FradSer/event) CLI。

## 目录

- [功能特性](#功能特性)
- [系统要求](#系统要求)
- [macOS 权限要求](#macos-权限要求sonoma-14--sequoia-15)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [使用示例](#使用示例)
- [结构化提示库](#结构化提示库)
- [可用的 MCP 工具](#可用的-mcp-工具)
- [组织策略](#组织策略)
- [标签系统](#标签系统)
- [开发](#开发)
- [License](#license)
- [Contributing](#contributing)

## 功能特性

### 核心功能

- **列表管理**：查看所有提醒事项和提醒事项列表，支持高级过滤
- **提醒事项操作**：跨列表的完整 CRUD 操作（创建、读取、更新、删除）
- **丰富内容支持**：标题、备注、开始/截止日期、URL、优先级、标签和完成状态
- **原生 macOS 集成**：基于 EventKit 框架直接与 Apple Reminders 集成

### 增强提醒功能

- **优先级支持**：设置提醒优先级（高/中/低/无），并带有视觉指示器
- **标签/标签**：使用自定义标签组织提醒事项，支持跨列表分类与过滤
- **子任务/清单**：向提醒事项添加带进度跟踪的清单项目
- **重复提醒、alarms 与位置触发器**：本服务器只读——请在 Reminders.app 中配置。读取响应会原样返回这些字段并显示视觉指示器。

### 高级功能

- **智能组织**：按优先级、截止日期、类别或完成状态自动分类与智能过滤
- **多条件搜索**：按完成状态、截止日期范围、标签和全文进行过滤
- **权限管理**：自动验证并请求所需的 macOS 系统权限
- **灵活日期处理**：支持多种日期格式（`YYYY-MM-DD`、`YYYY-MM-DD HH:mm:ss`、ISO 8601），具备时区感知
- **Unicode 支持**：完整的国际字符支持与全面的输入校验

### 技术优势

- **Clean Architecture**：遵循 Clean Architecture 原则的 4 层架构，包含依赖注入
- **类型安全**：使用 Zod 进行运行时类型校验的完整 TypeScript 覆盖
- **高性能**：用于 EventKit 关键操作的 Swift 编译二进制
- **健壮的错误处理**：具有详细诊断信息的一致错误响应
- **Repository Pattern**：标准化的数据访问抽象

## 系统要求

- **Node.js 20 或更高版本**
- **macOS**（Apple Reminders 集成所需）
- **Xcode Command Line Tools**（从源码构建时编译 Swift 代码所需）
- **pnpm**（推荐用于包管理）

npm 发布包自带预构建的通用签名 `bin/event` 二进制，使用 `npx` 的用户无需安装 Xcode 或 Swift 工具链。从 git 克隆构建时则需要上述依赖。

## macOS 权限要求（Sonoma 14+ / Sequoia 15）

Apple 将提醒事项和日历权限拆分为「仅写入」与「完全访问」范围。vendored 的 `event` CLI 内嵌了自己的 Info.plist（bundle id 为 `me.frad.event`），声明了以下隐私键：

- `NSRemindersUsageDescription`
- `NSRemindersFullAccessUsageDescription`
- `NSRemindersWriteOnlyAccessUsageDescription`
- `NSCalendarsUsageDescription`
- `NSCalendarsFullAccessUsageDescription`
- `NSCalendarsWriteOnlyAccessUsageDescription`

MCP 服务通过随附的 `bin/event-disclaim` shim 启动 `event`，在 spawn 时主动放弃（disclaim）TCC 责任归属——macOS 因此会把权限请求归到 `event` 自己头上，而不是启动 MCP 服务的宿主应用。首次调用 EventKit 时弹出的授权对话框显示的是 **“event”**，授权记录也以 `event` 的名义出现在 `系统设置 > 隐私与安全性 > 提醒事项 / 日历` 中。授权一次即可覆盖本机上所有 MCP 客户端（Claude Desktop、Codex Desktop、Cursor、终端客户端等）。

当 CLI 检测到 `notDetermined` 授权状态时，会调用 `requestFullAccessToReminders` / `requestFullAccessToEvents`，macOS 会弹出对应的授权对话框。如果系统遗失权限记录，可运行 `./check-permissions.sh` 重新触发请求。

若 Claude 的工具调用依旧遇到权限错误，请参阅下方的 *桌面端 MCP 客户端* 一节。

### 日历读取报错排查

如果看到 `Failed to read calendar events`，请先确认日历权限已设置为 **Full Calendar Access**：

- 打开 `System Settings > Privacy & Security > Calendars`
- 找到启动 MCP 服务的应用（例如 Terminal 或 Claude Desktop）
- 将权限切换为 **Full Calendar Access**

你也可以重新运行 `./check-permissions.sh`（脚本会同时检查 Reminders 与 Calendars 权限）。

### 桌面端 MCP 客户端（Claude Desktop、Codex Desktop 等）

macOS 会把提醒事项与日历的访问权限归属到 **responsible（负责）** 进程。默认情况下，负责进程是启动 MCP 服务的桌面应用本身，而不是 `event` 子进程——如果该应用的 bundle 缺少 `NSRemindersUsageDescription` / `NSCalendarsUsageDescription`（Codex Desktop 只声明了 `NSAppleEventsUsageDescription`），TCC 会在请求到达 EventKit 之前就拒绝它：

```text
Reminder permission denied. Unknown error
```

自 [issue #93](https://github.com/FradSer/mcp-server-apple-events/issues/93) 修复之后，本服务自己打破了这条归属链：`bin/event` 始终经由 `bin/event-disclaim` shim 启动，shim 使用与 Chromium、LLDB 相同的 responsibility-disclaim spawn 属性，让 `event` 成为自己的 TCC 负责进程。`event` 内嵌了所需的 usage description，并以 `com.apple.security.personal-information.{reminders,calendars}` hardened-runtime entitlements 签名，因此无论哪个桌面客户端启动本服务，EventKit 授权对话框都能正常弹出。

升级后的注意事项：

- 授权对话框（以及 `系统设置 > 隐私与安全性` 中的条目）现在归属于 **`event`**，而不是 Terminal / Claude Desktop / Codex Desktop。之前授予这些宿主应用的权限不再作用于 MCP 服务；`event` 的新授权请求批准一次即可。
- 使用 ad-hoc（本地）构建时，macOS 会将授权绑定到二进制的精确哈希——重新构建 `bin/event` 会再次弹窗。npm 预编译发行版使用 Developer ID 签名，授权可跨版本保持稳定。本地构建可通过设置 `APPLE_SIGNING_IDENTITY` 获得同样的稳定性。
- 直接运行 `./bin/event`（不经过 shim）仍然沿用宿主归属，因此在 Terminal 中直接使用的行为与以前完全一致。

#### 恢复卡死的 TCC 状态（权限弹窗始终不出现）

如果日历/提醒事项的权限对话框始终不弹出，且 `系统设置 → 隐私与安全性 → 提醒事项 / 日历` 里也找不到 `event`，说明你的机器很可能已处于 stale/misattributed 的 TCC 状态。上面的服务端 disclaim 修复只能防止干净机器进入此状态，无法清除已经损坏的条目。可靠的恢复方法是：

1. **全局重置 Calendar 与 Reminders 的 TCC 条目（不要按 app 重置）**，在终端执行：

   ```bash
   tccutil reset Calendar
   tccutil reset Reminders
   ```

   按 bundle 重置（例如 `tccutil reset Calendar com.anthropic.claudefordesktop`）常常**无效**——那些阻塞弹窗的 stale/misattributed 条目会存活下来。裸用形式会清除该服务下的**所有**条目，才能真正清掉坏状态。

   > 注意：这会清除**所有**应用的 Calendar/Reminders 权限。其他应用下次需要访问时会重新弹窗。

2. **在 Claude 客户端里重新触发权限。** 重置后，在 Claude 对话中（Claude Desktop 或 Claude Code）输入类似：

   > 「使用 AppleScript 查看我的 Calendar 和 Reminders」

   这能可靠地触发系统权限流程，macOS 会正常弹出 Calendar/Reminders 授权对话框。授权后 MCP 服务即可正常使用。原始报告与确认见 [issue #83](https://github.com/FradSer/mcp-server-apple-events/issues/83)。

**验证命令**

```bash
pnpm test -- src/__tests__/build-event.test.ts
```

该测试用例锁定了 `scripts/build-event.mjs` 的构建契约：分别为 arm64 与 x86_64 两种架构各调用一次 `swift build -c release` 构建 vendored 子模块（并把 Info.plist 链接进 `__TEXT,__info_plist` 段），用 `lipo` 合并为通用二进制 `bin/event`，再从 `scripts/disclaim.c` 编译出 `bin/event-disclaim` shim，最后为两个二进制签名（优先使用登录钥匙串中的 Developer ID Application 证书，找不到时回退为 ad-hoc 签名并给出警告），全程启用 hardened runtime，`event` 还额外携带 personal-information entitlements。

### macOS 26 (Tahoe) 上 `could not build module 'Foundation'` 错误排查

如果 `pnpm build` 失败并提示 `could not build module 'Foundation'`（或 `SDK is not supported by the compiler`），说明你的 Swift 工具链版本低于 macOS 26 SDK 的要求。macOS 26+ SDK 包含的 `Foundation.swift-interface` 需要 **Swift 6.3 或更高版本**；而 macOS 26 早期版本附带的 Command Line Tools 包含的是 Swift 6.2.x，无法解析该文件。详见 [issue #85](https://github.com/FradSer/mcp-server-apple-events/issues/85)。

`pnpm build:event` 现在会检测此不匹配并打印相同的解决方案，但如果手动遇到此问题：

1. 从 App Store 安装 Xcode 26.x（附带 Swift 6.3+），或
2. 将 Command Line Tools 更新到附带 Swift 6.3+ 的版本：
   ```bash
   softwareupdate --list
   sudo softwareupdate -i "Command Line Tools for Xcode-<latest>"
   ```
3. 如果两者都已安装，将 `xcode-select` 指向完整版 Xcode：
   ```bash
   sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
   ```

验证：

```bash
xcrun swiftc --version          # 应显示 Apple Swift version 6.3 或更高
xcrun --show-sdk-version        # 应与你的 macOS 主版本匹配
```

## 快速开始

直接使用 `npx` 运行服务器：

```bash
npx mcp-server-apple-events
```

## 配置说明

### 配置 Cursor

1. 打开 Cursor
2. 打开 Cursor 设置
3. 点击侧边栏中的 "MCP"
4. 点击 "Add new global MCP server"
5. 使用以下设置配置服务器：

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

### 配置 ChatWise

1. 打开 ChatWise
2. 进入设置
3. 导航至工具部分
4. 点击 "+" 按钮
5. 使用以下设置配置工具：
   - 类型：`stdio`
   - ID：`apple-reminders`
   - 命令：`mcp-server-apple-events`
   - 参数：（留空）

### 配置 Claude Desktop

你需要配置 Claude Desktop 以识别 Apple Events MCP 服务器。有两种方式可以访问配置：

#### 方式 1：通过 Claude Desktop 界面

1. 打开 Claude Desktop 应用
2. 从左上角菜单栏启用开发者模式
3. 打开设置并导航至开发者选项
4. 点击编辑配置按钮打开 `claude_desktop_config.json`

#### 方式 2：直接访问文件

macOS：

```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

Windows：

```bash
code %APPDATA%\Claude\claude_desktop_config.json
```

将以下配置添加到你的 `claude_desktop_config.json`：

**方式 A：使用 npx（推荐）**

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

**方式 B：使用本地构建**

如果你在本地构建了项目，使用 node 并指定 `dist/index.js` 的路径：

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

有关连接本地 MCP 服务器的更多信息，请参阅 [官方 MCP 文档](https://modelcontextprotocol.io/docs/develop/connect-local-servers)。

完全退出 Claude Desktop（不仅仅是关闭窗口）后重启，使更改生效。查看工具图标以验证 Apple Events 服务器是否已连接。

## 使用示例

配置完成后，你可以让 Claude 与你的 Apple Reminders 进行交互。以下是一些示例提示：

### 创建提醒事项

```text
创建一个明天下午 5 点的"买杂货"提醒。
添加一个"打电话给妈妈"的提醒，备注"询问周末计划"。
在"工作"列表中创建一个下周五到期的"提交报告"提醒。
创建一个带URL的提醒"查看这个网站：https://google.com"。
```

### 创建带有优先级的提醒

```text
创建一个周五到期的"完成季度报告"高优先级提醒。
添加一个今天到期的"给客户回电话"紧急高优先级提醒。
创建一个"审阅文档"中等优先级提醒。
```

### 创建带有标签的提醒

```text
创建一个带有 work 和 urgent 标签的提醒 "Review PR"。
添加一个带有 personal 和 shopping 标签的提醒 "Buy birthday gift"。
创建一个带有 project-alpha, backend, review 标签的提醒。
```

### 创建带有子任务的提醒

```text
创建一个提醒 "Grocery shopping"，包含子任务：milk, eggs, bread, butter。
添加一个提醒 "Pack for trip"，包含清单项目：passport, charger, clothes, toiletries。
创建 "Sprint planning"，包含子任务：review backlog, estimate stories, assign tasks。
```

### 管理子任务

```text
显示我的 "Grocery shopping" 提醒的子任务。
将 "milk" 子任务标记为已完成。
向我的购物列表提醒添加一个新的子任务 "cheese"。
重新排序我打包清单中的子任务。
```

### 过滤提醒

```text
显示所有高优先级提醒。
显示带有 "work" 标签的提醒。
仅显示重复提醒。
查找基于位置的提醒。
显示带有未完成子任务的提醒。
```

### 更新提醒事项

```text
将"买杂货"提醒的标题更新为"买有机杂货"。
将"打电话给妈妈"提醒更新为今天下午 6 点到期。
更新"提交报告"提醒并将其标记为已完成。
将"买杂货"的备注更改为"别忘了牛奶和鸡蛋"。
在我的"完成报告"提醒上将优先级设置为高。
向我的 "Review PR" 提醒添加标签 "urgent"。
```

### 管理提醒事项

```text
显示我的所有提醒事项。
列出"购物"列表中的所有提醒事项。
显示我已完成的提醒事项。
```

### 处理列表

```text
显示所有提醒事项列表。
显示"工作"列表中的提醒事项。
```

服务器会处理你的自然语言请求，与 Apple 原生提醒事项应用交互，向 Claude 返回格式化结果，并维护与 macOS 的原生集成。

> 重复提醒、alarms 与位置触发器在本服务器中是只读的。请在 Reminders.app 中配置——它们仍会出现在读取结果中并带有视觉指示器。

## 结构化提示库

该服务器提供统一的提示注册表，可通过 MCP 的 `ListPrompts` 和 `GetPrompt` 端点访问。每个模板都共享使命、上下文输入、编号流程、约束、输出格式和质量标准，让下游助手获得可预测的框架，而无需解析松散的自由格式示例。

- **daily-task-organizer** —— 可选 `today_focus`（你今天最想完成的重点）生成当日执行蓝图，在优先级工作与恢复时间之间保持平衡。支持智能任务聚类、专注时间段安排、自动提醒列表组织，并会在大量今日到期的提醒需要固定时段时，按照到期时间自动创建日历时间块。Quick Win 任务簇会转换为以提醒到期时间结束的 15 分钟「Focus Sprint — [Outcome]」日历占位，而 Standard 任务则对应 30、45 或 60 分钟的事件，并以同一到期时间窗口为锚点。
- **smart-reminder-creator** —— 可选 `task_idea`（你想做的一句话描述），生成优化调度的提醒结构。
- **reminder-review-assistant** —— 可选 `review_focus`（如「逾期」或某个清单名）用于审计与优化现有提醒。
- **weekly-planning-workflow** —— 可选 `user_ideas`（你本周想要完成的想法和目标）指导周一至周日的重置，时间区块与现有列表相关联。

### 设计约束与验证

- 提示严格限制在 Apple Reminders 原生能力范围内（无第三方自动化），并在提交不可逆操作前询问缺失上下文。
- 共享格式使输出可渲染为 Markdown 部分或表格，无需客户端应用程序的额外解析胶水。
- 每次修改提示文案后运行 `pnpm test -- src/server/prompts.test.ts` 以断言元数据、模式兼容性和叙述组装。

## 可用的 MCP 工具

该服务器按照服务域暴露 MCP 工具，对应提醒事项与日历的不同资源。请使用与你要操作的资源匹配的标识符：

- `reminders_tasks` —— 管理单个提醒事项
- `reminders_subtasks` —— 管理提醒事项内的清单项目
- `reminders_lists` —— 管理提醒事项列表
- `calendar_events` —— 管理日历事件（时间块）
- `calendar_calendars` —— 查看可用日历

所有工具都接受一个 `action` 字段以及按操作区分的参数。日期字段接受 `YYYY-MM-DD`、`YYYY-MM-DD HH:mm:ss`（本地时间）或带时区的 ISO 8601。

### 提醒事项任务工具

**工具名称**：`reminders_tasks`

管理单个提醒事项任务，支持完整 CRUD，包括优先级、标签和子任务。alarms、重复规则与位置触发器在本工具中是只读的——请在 Reminders.app 中配置。

**操作**：`read`、`create`、`update`、`delete`

#### 按操作的参数

**读取操作**（`action: "read"`）：

- `id` *(可选)*：要读取的特定提醒事项的唯一标识符
- `filterList` *(可选)*：要展示的提醒事项列表名称
- `showCompleted` *(可选)*：是否包含已完成的提醒事项（默认：false）
- `search` *(可选)*：根据标题或备注筛选提醒事项的搜索词
- `dueWithin` *(可选)*：按到期范围筛选（`today`、`tomorrow`、`this-week`、`overdue`、`no-date`）
- `filterPriority` *(可选)*：按优先级筛选（`high`、`medium`、`low`、`none`）
- `filterRecurring` *(可选)*：为 true 时仅显示重复提醒
- `filterLocationBased` *(可选)*：为 true 时仅显示基于位置的提醒
- `filterTags` *(可选)*：按标签筛选（提醒必须具有所有指定标签）

**创建操作**（`action: "create"`）：

- `title` *(必填)*：提醒事项标题
- `dueDate` *(可选)*：到期时间
- `targetList` *(可选)*：要添加到的提醒事项列表名称
- `note` *(可选)*：提醒事项备注内容
- `url` *(可选)*：与提醒事项关联的 URL（接受任意合法 URI scheme）
- `priority` *(可选)*：优先级（0=无, 1=高, 5=中, 9=低）
- `tags` *(可选)*：要设置到提醒上的标签数组
- `subtasks` *(可选)*：随提醒创建的子任务标题数组

> 创建时不支持 `startDate`——请在创建后通过 `update` 设置。

**更新操作**（`action: "update"`）：

- `id` *(必填)*：要更新的提醒事项唯一标识符
- `title` *(可选)*：新标题
- `startDate` *(可选)*：新的开始时间
- `dueDate` *(可选)*：新的到期时间
- `note` *(可选)*：新的备注内容
- `url` *(可选)*：新的 URL
- `completed` *(可选)*：标记提醒为已完成（`true`）或未完成（`false`）
- `targetList` *(可选)*：提醒所在列表（不支持跨列表搬移——请删除后在目标列表重建）
- `priority` *(可选)*：新优先级（0=无, 1=高, 5=中, 9=低）
- `tags` *(可选)*：用此数组替换所有标签
- `addTags` *(可选)*：要添加的标签（与现有标签合并）
- `removeTags` *(可选)*：要移除的标签

**删除操作**（`action: "delete"`）：

- `id` *(必填)*：要删除的提醒事项唯一标识符

#### 使用示例

```json
{
  "action": "create",
  "title": "购买食材",
  "dueDate": "2024-03-25 18:00:00",
  "targetList": "购物",
  "note": "别忘了牛奶和鸡蛋",
  "priority": 1,
  "tags": ["shopping", "errands"],
  "subtasks": ["牛奶", "鸡蛋", "面包"]
}
```

```json
{
  "action": "read",
  "filterList": "工作",
  "showCompleted": false,
  "dueWithin": "today",
  "filterPriority": "high",
  "filterTags": ["urgent"]
}
```

```json
{
  "action": "update",
  "id": "reminder-123",
  "completed": false,
  "addTags": ["followup"]
}
```

```json
{
  "action": "delete",
  "id": "reminder-123"
}
```

### 提醒事项子任务工具

**工具名称**：`reminders_subtasks`

管理提醒事项中的子任务/清单。子任务使用人类可读的格式存储在备注字段中，在原生提醒事项应用中可见。

**操作**：`read`、`create`、`update`、`delete`、`toggle`、`reorder`

#### 按操作的参数

**读取操作**（`action: "read"`）：

- `reminderId` *(必填)*：父提醒事项 ID

**创建操作**（`action: "create"`）：

- `reminderId` *(必填)*：父提醒事项 ID
- `title` *(必填)*：子任务标题

**更新操作**（`action: "update"`）：

- `reminderId` *(必填)*：父提醒事项 ID
- `subtaskId` *(必填)*：要更新的子任务 ID
- `title` *(可选)*：新标题
- `completed` *(可选)*：新的完成状态

**删除操作**（`action: "delete"`）：

- `reminderId` *(必填)*：父提醒事项 ID
- `subtaskId` *(必填)*：要删除的子任务 ID

**切换操作**（`action: "toggle"`）：

- `reminderId` *(必填)*：父提醒事项 ID
- `subtaskId` *(必填)*：要切换的子任务 ID

**重排序操作**（`action: "reorder"`）：

- `reminderId` *(必填)*：父提醒事项 ID
- `order` *(必填)*：所有子任务 ID 的数组，按期望顺序排列

#### 使用示例

```json
{
  "action": "read",
  "reminderId": "reminder-123"
}
```

```json
{
  "action": "create",
  "reminderId": "reminder-123",
  "title": "取干洗衣服"
}
```

```json
{
  "action": "toggle",
  "reminderId": "reminder-123",
  "subtaskId": "a1b2c3d4"
}
```

#### 子任务存储格式

子任务使用以下人类可读的格式存储在备注字段中：

```text
用户备注...

---SUBTASKS---
[ ] {a1b2c3d4} 第一个任务
[x] {e5f6g7h8} 已完成任务
[ ] {i9j0k1l2} 另一个任务
---END SUBTASKS---
```

此格式确保子任务在原生提醒事项应用中可见，同时支持编程访问。

### 提醒事项列表工具

**工具名称**：`reminders_lists`

管理提醒事项列表——查看现有列表或创建新的列表来组织提醒事项。

**操作**：`read`、`create`、`update`、`delete`

#### 按操作的参数

**读取操作**（`action: "read"`）：

- 无需额外参数

**创建操作**（`action: "create"`）：

- `name` *(必填)*：新提醒事项列表的名称

**更新操作**（`action: "update"`）：

- `name` *(必填)*：要更新的列表的当前名称
- `newName` *(必填)*：提醒事项列表的新名称

**删除操作**（`action: "delete"`）：

- `name` *(必填)*：要删除的列表名称

#### 使用示例

```json
{
  "action": "create",
  "name": "项目 Alpha"
}
```

### 日历事件工具

**工具名称**：`calendar_events`

处理 EventKit 日历事件（时间块），提供 CRUD 能力。URL、structured location、all-day 切换、availability、alarms 与重复规则在本工具中是只读的——请在 Calendar.app 中配置。All-day 事件由日期格式推断（不带时间分量的 `YYYY-MM-DD`）。

**操作**：`read`、`create`、`update`、`delete`

#### 按操作的参数

**读取操作**（`action: "read"`）：

- `id` *(可选)*：读取单个事件的唯一标识符
- `filterCalendar` *(可选)*：按日历名称筛选
- `search` *(可选)*：按标题/备注/地点搜索
- `availability` *(可选)*：按可用性筛选（`busy`、`free`、`tentative`、`unavailable`、`not-supported`）
- `startDate` *(可选)*：筛选开始时间在此之后的事件（两个日期都省略时默认为今天）
- `endDate` *(可选)*：筛选结束时间在此之前的事件（两个日期都省略时默认为今天 + 14 天）

**创建操作**（`action: "create"`）：

- `title` *(必填)*：事件标题
- `startDate` *(必填)*：开始时间
- `endDate` *(必填)*：结束时间
- `targetCalendar` *(可选)*：目标日历名称
- `note` *(可选)*：附加备注
- `location` *(可选)*：地点文本

**更新操作**（`action: "update"`）：

- `id` *(必填)*：事件唯一标识符
- `title` *(可选)*：新标题
- `startDate` *(可选)*：新的开始时间
- `endDate` *(可选)*：新的结束时间
- `note` *(可选)*：新的备注
- `location` *(可选)*：新的地点文本

> 事件无法通过 update 跨日历搬移——请在目标日历中删除并重建。

**删除操作**（`action: "delete"`）：

- `id` *(必填)*：事件唯一标识符
- `span` *(可选)*：循环事件删除范围（`this-event` 或 `future-events`）

### 日历集合工具

**工具名称**：`calendar_calendars`

返回读取窗口内至少包含一个事件的日历集合。在创建或更新事件前可先确认可用的日历名称。可选的日期范围会缩小该窗口，并为每个日历标注窗口内的事件数量。

**操作**：`read`

**可选参数**：

- `startDate`：限定日历发现范围的起始日期
- `endDate`：限定日历发现范围的结束日期

#### 使用示例

```json
{
  "action": "read"
}
```

```json
{
  "action": "read",
  "startDate": "2026-05-04",
  "endDate": "2026-05-11"
}
```

#### 响应示例

```json
{
  "content": [
    {
      "type": "text",
      "text": "### Calendars (Total: 3)\n- Work - 5 events\n- Personal - 2 events\n- Shared - 1 event"
    }
  ],
  "isError": false
}
```

注意：vendor 的 `event` CLI 没有 EventKit 日历标识符，因此合成的 `id` 与日历 `title` 相同；当两者一致时，Markdown 输出会省略该 ID。

### 只读字段结构

读取操作返回的提醒事项和事件会携带本服务器不写入的 alarms、重复规则和位置触发器。它们原样来自 Reminders.app / Calendar.app 中配置的值。

Alarm 对象（读取响应）：

```json
{
  "relativeOffset": -900,
  "absoluteDate": "2025-11-04T09:00:00+08:00",
  "locationTrigger": {
    "title": "Office",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "radius": 100,
    "proximity": "enter"
  }
}
```

重复规则对象（读取响应）：

```json
{
  "frequency": "daily" | "weekly" | "monthly" | "yearly",
  "interval": 1,
  "endDate": "YYYY-MM-DD",
  "occurrenceCount": 10,
  "daysOfWeek": [1, 3, 5],
  "daysOfMonth": [1, 15],
  "monthsOfYear": [3, 6]
}
```

### 响应格式

**成功响应**：

```json
{
  "content": [
    {
      "type": "text",
      "text": "Successfully created reminder: Buy groceries"
    }
  ],
  "isError": false
}
```

**带有增强功能的提醒事项**：读取提醒事项时，输出包含增强功能的视觉指示器：

- 🔄 - 重复提醒
- 📍 - 基于位置的提醒
- 🏷️ - 带有标签
- 📋 - 带有子任务

示例输出：

```text
- [ ] 购买杂货 🏷️📋
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

**关于 URL 字段的说明**：`url` 字段完全受 EventKit API 支持。创建或更新带有 URL 参数的提醒事项时，URL 会存储在原生的 `url` 属性中（可通过提醒事项应用详情视图的 "i" 图标查看），同时以结构化格式追加到备注中，便于解析和多个 URL 支持：

```text
提醒事项备注内容...

URLs:
- https://example.com
- https://another-url.com
```

URL 接受任意合法 URI scheme（`http`、`https`、`mailto`、`tel`、`obsidian`、`shortcuts` 等）。`file`、`javascript`、`data` 等危险 scheme 会被拒绝，http(s) 主机名会经过 SSRF 黑名单校验。

**列表响应**：

```json
{
  "reminders": [
    {
      "title": "Buy groceries",
      "list": "Shopping",
      "isCompleted": false,
      "dueDate": "2024-03-25 18:00:00",
      "priority": 1,
      "tags": ["shopping", "errands"],
      "subtasks": [
        { "id": "a1b2c3d4", "title": "Milk", "isCompleted": true },
        { "id": "e5f6g7h8", "title": "Eggs", "isCompleted": false }
      ],
      "subtaskProgress": { "completed": 1, "total": 2, "percentage": 50 },
      "notes": "Don't forget the organic options",
      "url": null
    }
  ],
  "total": 1,
  "filter": {
    "list": "Shopping",
    "showCompleted": false
  }
}
```

## 组织策略

服务器通过四个内置策略提供智能提醒事项组织功能：

### 优先级策略

基于优先级关键词自动分类提醒事项：

- **高优先级**：包含「urgent」「important」「critical」「asap」等词
- **中优先级**：标准提醒事项的默认类别
- **低优先级**：包含「later」「someday」「eventually」「maybe」等词

### 截止日期策略

基于提醒事项的截止日期进行组织：

- **已过期**：过去的截止日期
- **今天**：今天到期
- **明天**：明天到期
- **本周**：本周内到期
- **下周**：下周内到期
- **未来**：下周之后到期
- **无日期**：没有截止日期的提醒事项

### 类别策略

通过内容分析智能分类提醒事项：

- **工作**：商务、会议、项目、办公室、客户相关
- **个人**：家庭、朋友、自我护理相关
- **购物**：购买、商店、采购、杂货相关
- **健康**：医生、运动、医疗、健身、锻炼相关
- **财务**：账单、付款、金融、银行、预算相关
- **旅行**：旅行、假期、航班、酒店相关
- **教育**：学习、课程、学校、书籍、研究相关
- **未分类**：不匹配任何特定类别的提醒事项

### 完成状态策略

简单的二元组织：

- **活跃**：未完成的提醒事项
- **已完成**：已完成的提醒事项

### 使用示例

按优先级组织所有提醒事项：

```text
按优先级组织我的提醒事项
```

对与工作相关的提醒事项进行分类：

```text
按类别组织工作列表中的提醒事项
```

对逾期项目进行排序：

```text
按截止日期组织逾期提醒事项
```

## 标签系统

标签为提醒事项提供跨列表分类。它们使用 `[#tag]` 格式存储在备注字段中，在原生提醒事项应用中保持人类可读。读取时同时支持 `[#tag]` 和裸 `#tag` 两种格式。

### 标签格式

标签存储在备注末尾：

```text
用户备注...

[#work] [#urgent] [#project-alpha]
```

### 标签规则

- 标签可以包含字母、数字、下划线和连字符
- 每个标签最多 50 个字符
- 区分大小写
- 按多个标签过滤使用 AND 逻辑（提醒必须具有所有指定的标签）

### 标签操作示例

创建时添加标签：

```json
{
  "action": "create",
  "title": "Review code",
  "tags": ["work", "code-review", "urgent"]
}
```

按标签过滤：

```json
{
  "action": "read",
  "filterTags": ["work", "urgent"]
}
```

更新标签（添加/移除）：

```json
{
  "action": "update",
  "id": "reminder-123",
  "addTags": ["completed"],
  "removeTags": ["urgent"]
}
```

## 开发

1. 使用 pnpm 安装依赖（在 macOS 上 postinstall 钩子会从 `vendor/event` 子模块构建 `bin/event`）：

```bash
pnpm install
```

2. 在启动前构建 TypeScript 与 vendored `event` CLI：

```bash
pnpm build
```

3. 运行全量测试，验证 TypeScript 仓库层、Zod 校验、构建脚本与提示模板：

```bash
pnpm test
```

4. 在提交前执行 Biome 检查：

```bash
pnpm exec biome check
```

### 嵌套目录启动

CLI 入口内建项目根目录回退逻辑。即使从 `dist/` 等子目录或编辑器任务运行器启动，服务器也能在向上最多十层目录内定位 `package.json` 并加载随附的 `bin/event` 二进制。若你自定义目录结构，请确保清单文件仍在该查找深度之内，以维持这一保证。

### 可用脚本

- `pnpm build` - 构建 TypeScript 与 vendored `event` CLI（从源码启动服务器前必需）
- `pnpm build:ts` - 仅构建 TypeScript
- `pnpm build:event` - 仅构建 vendored `event` CLI（运行 `swift build -c release` 编译 `vendor/event` 并生成 `bin/event`）
- `pnpm build:release` - 构建并进行 notarize（用于发布打包）
- `pnpm test` - 运行完整的 Jest 测试套件
- `pnpm test:ci` - 运行带覆盖率的 Jest 测试套件
- `pnpm lint` - Biome 格式化/修复加 TypeScript 类型检查
- `pnpm check` - Lint 加带覆盖率的测试

### 依赖

**运行时依赖：**

- `@modelcontextprotocol/sdk ^1.29.0` - MCP 协议实现
- `exit-on-epipe ^1.0.1` - 优雅的进程终止处理
- `zod ^4.4.3` - 运行时类型校验

**开发依赖：**

- `typescript ^6.0.3` - TypeScript 编译器
- `@types/node ^25.8.0` - Node.js 类型定义
- `@types/jest ^30.0.0` - Jest 类型定义
- `jest ^30.4.2` - 测试框架
- `@swc/core ^1.15.33` - SWC 编译器
- `@swc/jest ^0.2.39` - SWC Jest 转换器
- `@biomejs/biome 2.4.15` - 代码格式化和静态检查

## License

MIT

## Contributing

Contributions welcome! Please read the contributing guidelines first.
