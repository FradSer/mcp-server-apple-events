# Apple Events MCP Server ![Version 1.4.0](https://img.shields.io/badge/version-1.4.0-blue) ![License: MIT](https://img.shields.io/badge/license-MIT-green)

[![X Follow](https://img.shields.io/twitter/follow/FradSer?style=social)](https://x.com/FradSer)

[English](README.md) | **简体中文**

一个为 macOS 提供原生 Apple Reminders 和 Calendar 集成的 Model Context Protocol (MCP) 服务器。该服务器允许你通过标准化接口与 Apple Reminders 和 Calendar Events 进行交互，具有全面的管理功能。

> [!NOTE]
> **后续方向：[event](https://github.com/FradSer/event) —— 纯 Swift 实现的 macOS Apple Reminders 与 Calendar 命令行工具。**
>
> 对于脚本化、自动化以及在终端中直接使用的场景，我们后续建议优先使用独立的 [`event`](https://github.com/FradSer/event) CLI。它通过 EventKit 提供与本服务器一致的提醒事项 / 日历 / 列表 / 子任务 / 标签操作，并原生支持 Markdown 与 JSON 输出。后续版本的 `mcp-server-apple-events` 计划改为依赖 `event` CLI 来替代当前内置的 `EventKitCLI` 二进制，使两个项目共用同一套经过验证的 Swift 实现。

## 功能特性

### 核心功能
- **列表管理**：查看所有提醒事项和提醒事项列表的高级过滤选项
- **提醒事项操作**：完整的CRUD操作（创建、读取、更新、删除）提醒事项
- **丰富内容支持**：完全支持标题、备注、截止日期、URL和完成状态
- **原生macOS集成**：使用EventKit框架直接与Apple Reminders集成

### 增强提醒功能 (v1.3.0)
- **优先级支持**：设置提醒优先级（高/中/低/无），并带有视觉指示器
- **重复提醒**：创建具有灵活重复规则（每日、每周、每月、每年）的重复提醒
- **基于位置的触发器**：设置地理围栏提醒，在到达或离开某个位置时触发
- **标签/标签**：使用自定义标签组织提醒事项，以便进行跨列表分类和过滤
- **子任务/清单**：向提醒事项添加带有进度跟踪的清单项目

### 高级功能
- **智能组织**：按优先级、截止日期、类别或完成状态的自动分类 and 智能过滤
- **强大搜索**：包括完成状态、截止日期范围、标签和全文搜索的多条件过滤
- **批量操作**：使用优化的数据访问模式高效处理多个提醒事项
- **权限管理**：自动验证和请求所需的macOS系统权限
- **灵活日期处理**：支持多种日期格式（YYYY-MM-DD、ISO 8601）并具有时区感知能力
- **Unicode支持**：完整的国际字符支持和全面的输入验证

### 技术优势
- **Clean Architecture**：遵循Clean Architecture原则的4层架构，包含依赖注入
- **类型安全**：使用Zod模式验证进行运行时类型检查的完整TypeScript覆盖
- **高性能**：用于Apple Reminders性能关键操作的Swift编译二进制文件
- **健壮的错误处理**：具有详细诊断信息的一致错误响应
- **Repository Pattern**：标准化的CRUD操作的数据访问抽象
- **函数式编程**：在适当情况下使用纯函数和不可变数据结构

## 系统要求

- **Node.js 20 或更高版本**
- **macOS**（Apple Reminders 集成所需）
- **Xcode Command Line Tools**（编译 Swift 代码所需）
- **pnpm**（推荐用于包管理）

## macOS 权限要求（Sonoma 14+ / Sequoia 15）

Apple 已将提醒事项和日历权限拆分为「仅写入」与「完全访问」范围。Swift 桥接层声明了以下隐私键，确保在你授权后 Claude 可以安全读取并写入所选数据：

- `NSRemindersUsageDescription`
- `NSRemindersFullAccessUsageDescription`
- `NSRemindersWriteOnlyAccessUsageDescription`
- `NSCalendarsUsageDescription`
- `NSCalendarsFullAccessUsageDescription`
- `NSCalendarsWriteOnlyAccessUsageDescription`

当授权状态为 `notDetermined` 时，CLI 会调用 `requestFullAccessToReminders` / `requestFullAccessToEvents`，macOS 会弹出对应的授权对话框。如果系统遗失权限记录，可运行 `./check-permissions.sh` 重新触发请求。

若 Claude 的工具调用依旧遇到权限错误，请参阅下方的 *桌面端 MCP 客户端* 一节——那里描述了 responsible 进程归属问题以及推荐的解决方案。

### 日历读取报错排查

如果看到 `Failed to read calendar events`，请先确认日历权限已设置为 **Full Calendar Access**：

- 打开 `System Settings > Privacy & Security > Calendars`
- 找到启动 MCP 服务的应用（例如 Terminal 或 Claude Desktop）
- 将权限切换为 **Full Calendar Access**

你也可以重新运行 `./check-permissions.sh`（脚本现在会同时检查 Reminders 与 Calendars 权限）。

### 桌面端 MCP 客户端（Claude Desktop、Codex Desktop 等）

macOS 把提醒事项与日历的访问权限归属到 **responsible（负责）** 进程——也就是启动 MCP 服务的桌面应用本身，而不是 `EventKitCLI` 子进程。要让 EventKit 弹出授权对话框，负责应用的 bundle 必须在自己的 `Info.plist` 中声明 `NSRemindersUsageDescription` / `NSCalendarsUsageDescription`（macOS Sonoma 之后还需要写入权限或完全访问权限的对应键）。如果这些键缺失，TCC 会在请求到达 EventKit 之前就拒绝它，Swift CLI 会返回：

```text
Reminder permission denied. Unknown error
```

——即使同一个二进制在 Terminal 中可以正常工作。完整的 TCC 日志见 [issue #93](https://github.com/FradSer/mcp-server-apple-events/issues/93)。目前 Codex Desktop 只声明了 `NSAppleEventsUsageDescription`，这就是它会撞到这堵墙的原因。

这是 macOS 层面的限制，单凭 MCP 服务无法绕过——只有桌面客户端自己在 `Info.plist` 里加上对应的 usage description 才能根治。在等待上游修复期间，下面的两个方案能让本服务保持可用：

**可靠方案——使用基于终端的 MCP 客户端启动本服务。** Codex CLI、Claude Code 等在终端中启动的客户端会继承 Terminal / iTerm2 已经持有的 `kTCCServiceReminders` / `kTCCServiceCalendar` 授权，本服务无需修改即可正常调用 EventKit：

```bash
# 在 Terminal / iTerm2 里运行，由它充当 responsible app
codex
# 或
claude
```

**部分方案——AppleScript 路由（仅当桌面应用已声明 `NSAppleEventsUsageDescription` 时有效）。** 运行：

```bash
osascript -e 'tell application "Reminders" to get name of lists'
osascript -e 'tell application "Calendar" to get name of calendars'
```

会触发一次 **Automation** 授权请求（`kTCCServiceAppleEvents`），允许负责应用控制 `com.apple.reminders` 与 `com.apple.iCal`。但这并不会顺带创建 `kTCCServiceReminders` / `kTCCServiceCalendar` 授权记录，所以一个直接调用 EventKit 的 Swift CLI 在 host bundle 缺少 usage description 时仍然会被拒。只有当你的客户端能够端到端走 AppleScript 时这套方案才生效（本服务目前并不会这么做）。

**验证命令**

```bash
pnpm test -- src/swift/Info.plist.test.ts
```

测试会确保所有必须的 usage-description 字段在发布前均已就绪。

### macOS 26 (Tahoe) 上 `could not build module 'Foundation'` 错误排查

如果 `pnpm build` 失败并提示 `could not build module 'Foundation'`（或 `SDK is not supported by the compiler`），说明你的 Swift 工具链版本低于 macOS 26 SDK 的要求。macOS 26+ SDK 包含的 `Foundation.swiftinterface` 需要 **Swift 6.3 或更高版本**；而 macOS 26 早期版本附带的 Command Line Tools 包含的是 Swift 6.2.x，无法解析该文件。详见 [issue #85](https://github.com/FradSer/mcp-server-apple-events/issues/85)。

`pnpm build:swift` 现在会检测此不匹配并打印相同的解决方案，但如果手动遇到此问题：

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

你可以直接使用 `npx` 运行服务器：

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

### 2. 添加服务器配置

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

有关连接本地 MCP 服务器的更多信息，请参阅
[官方 MCP 文档](https://modelcontextprotocol.io/docs/develop/connect-local-servers)。

### 3. 重启 Claude Desktop

要使更改生效：

1. 完全退出 Claude Desktop（不仅仅是关闭窗口）
2. 重新启动 Claude Desktop
3. 查看工具图标以验证 Apple Events 服务器是否已连接

## 使用示例

配置完成后，你可以让 Claude 与你的 Apple Reminders 进行交互。以下是一些示例提示：

### 创建提醒事项
```
创建一个明天下午 5 点的"买杂货"提醒。
添加一个"打电话给妈妈"的提醒，备注"询问周末计划"。
在"工作"列表中创建一个下周五到期的"提交报告"提醒。
创建一个带URL的提醒"查看这个网站：https://google.com"。
```

### 创建带有优先级的提醒
```
创建一个周五到期的"完成季度报告"高优先级提醒。
添加一个今天到期的"给客户回电话"紧急高优先级提醒。
创建一个"审阅文档"中等优先级提醒。
```

### 创建重复提醒
```
创建一个每天上午 9 点"服药"的提醒。
每周一添加一个"团队站会"提醒。
在每月 1 号创建一个"交房租"提醒。
在 3 月 15 日设置一个"报税"年度提醒。
```

### 创建基于位置的提醒
```
提醒我在到达杂货店时"买牛奶"。
创建一个在我回家时"检查信箱"的提醒。
添加一个在我离开办公室时"提交工时表"的提醒。
```

### 创建带有标签的提醒
```
创建一个带有 work 和 urgent 标签的提醒 "Review PR"。
添加一个带有 personal 和 shopping 标签的提醒 "Buy birthday gift"。
创建一个带有 project-alpha, backend, review 标签的提醒。
```

### 创建带有子任务的提醒
```
创建一个提醒 "Grocery shopping"，包含子任务：milk, eggs, bread, butter。
添加一个提醒 "Pack for trip"，包含清单项目：passport, charger, clothes, toiletries。
创建 "Sprint planning"，包含子任务：review backlog, estimate stories, assign tasks。
```

### 管理子任务
```
显示我的 "Grocery shopping" 提醒的子任务。
将 "milk" 子任务标记为已完成。
向我的购物列表提醒添加一个新的子任务 "cheese"。
重新排序我打包清单中的子任务。
```

### 过滤提醒
```
显示所有高优先级提醒。
显示带有 "work" 标签的提醒。
仅显示重复提醒。
查找基于位置的提醒。
显示带有未完成子任务的提醒。
```

### 更新提醒事项
```
将"买杂货"提醒的标题更新为"买有机杂货"。
将"打电话给妈妈"提醒更新为今天下午 6 点到期。
更新"提交报告"提醒并将其标记为已完成。
将"买杂货"的备注更改为"别忘了牛奶和鸡蛋"。
在我的"完成报告"提醒上将优先级设置为高。
向我的 "Review PR" 提醒添加标签 "urgent"。
```

### 管理提醒事项
```
显示我的所有提醒事项。
列出"购物"列表中的所有提醒事项。
显示我已完成的提醒事项。
```

### 处理列表
```
显示所有提醒事项列表。
显示"工作"列表中的提醒事项。
```

服务器将：
- 处理你的自然语言请求
- 与 Apple 原生提醒事项应用交互
- 向 Claude 返回格式化结果
- 维护与 macOS 的原生集成

## 结构化提示库

该服务器提供统一的提示注册表，可通过 MCP 的 `ListPrompts` 和 `GetPrompt` 端点访问。每个模板都共享使命、上下文输入、编号流程、约束、输出格式和质量标准，让下游助手获得可预测的框架，而无需解析松散的自由格式示例。

- **daily-task-organizer** —— 可选 `today_focus`（你今天最想完成的重点）生成当日执行蓝图，在优先级工作与恢复时间之间保持平衡。支持智能任务聚类、专注时间段安排、自动提醒列表组织，并会在大量今日到期的提醒需要固定时段时，按照到期时间自动创建日历时间块。快速完成类任务簇会转换为以提醒到期时间结束的 15 分钟「Focus Sprint — [Outcome]」日历占位，而标准任务则对应 30 、45 或 60 分钟的事件，并以同一到期时间窗口为锚点。
- **smart-reminder-creator** —— 可选 `task_idea`（你想做的一句话描述），生成优化调度的提醒结构。
- **reminder-review-assistant** —— 可选 `review_focus`（如“逾期”或某个清单名）用于审计与优化现有提醒。
- **weekly-planning-workflow** —— 可选 `user_ideas`（您本周想要完成的想法和目标）指导周一至周日的重置，时间区块与现有列表相关联。

### 设计约束与验证

- 提示严格限制在 Apple Reminders 原生能力范围内（无第三方自动化），并在提交不可逆操作前询问缺失上下文。
- 共享格式使输出可渲染为 Markdown 部分或表格，无需客户端应用程序的额外解析胶水。
- 每次修改提示文案后运行 `pnpm test -- src/server/prompts.test.ts` 以断言元数据、模式兼容性和叙述组装。

## 可用的 MCP 工具

服务器现在按照服务域暴露 MCP 工具，对应提醒事项与日历的不同资源：

### 提醒事项任务工具

**工具名称**：`reminders_tasks`

用于管理单个提醒事项任务，支持完整的 CRUD 操作，包括优先级、提醒（alarms）、重复规则（recurrence rules）、开始/到期/完成时间、位置触发器、标签和子任务。

**操作**：`read`、`create`、`update`、`delete`

**主要处理函数**：
- `handleReadReminders()` - 带筛选选项读取提醒事项
- `handleCreateReminder()` - 创建新的提醒事项
- `handleUpdateReminder()` - 更新现有提醒事项
- `handleDeleteReminder()` - 删除提醒事项

#### 按操作的参数

**读取操作**（`action: "read"`）：
- `id` *(可选)*：要读取的特定提醒事项的唯一标识符
- `filterList` *(可选)*：要展示的提醒事项列表名称
- `showCompleted` *(可选)*：是否包含已完成的提醒事项（默认：false）
- `search` *(可选)*：根据标题或内容筛选提醒事项的搜索词
- `dueWithin` *(可选)*：按到期范围筛选（"today"、"tomorrow"、"this-week"、"overdue"、"no-date"）
- `filterPriority` *(可选)*：按优先级级别筛选 ("high", "medium", "low", "none")
- `filterRecurring` *(可选)*：仅显示重复提醒
- `filterLocationBased` *(可选)*：仅显示基于位置的提醒
- `filterTags` *(可选)*：按标签筛选（必须具有所有指定标签）

**创建操作**（`action: "create"`）：
- `title` *(必填)*：提醒事项标题
- `startDate` *(可选)*：开始时间，格式为 `YYYY-MM-DD` 或 `YYYY-MM-DD HH:mm:ss`
- `dueDate` *(可选)*：到期时间，格式为 `YYYY-MM-DD` 或 `YYYY-MM-DD HH:mm:ss`
- `targetList` *(可选)*：要添加到的提醒事项列表名称
- `note` *(可选)*：提醒事项备注内容
- `url` *(可选)*：与提醒事项关联的 URL
- `location` *(可选)*：位置文本（`EKCalendarItem.location`，不是地理围栏触发器）
- `priority` *(可选)*：优先级级别 (0=无, 1=高, 5=中, 9=低)
- `alarms` *(可选)*：提醒数组（见下方「提醒对象」）
- `recurrenceRules` *(可选)*：重复规则数组（见下方「重复规则对象」）
- `recurrence` *(可选)*：兼容旧写法的单个重复规则（等价于单元素 `recurrenceRules`）
- `locationTrigger` *(可选)*：位置触发器对象
- `tags` *(可选)*：要添加到提醒的标签数组
- `subtasks` *(可选)*：要随提醒创建的子任务标题数组

**更新操作**（`action: "update"`）：
- `id` *(必填)*：要更新的提醒事项唯一标识符
- `title` *(可选)*：提醒事项新标题
- `startDate` *(可选)*：新的开始时间
- `dueDate` *(可选)*：新的到期时间，格式为 `YYYY-MM-DD` 或 `YYYY-MM-DD HH:mm:ss`
- `note` *(可选)*：新的备注内容
- `url` *(可选)*：新的 URL
- `location` *(可选)*：新的位置文本（传空字符串可清空）
- `completed` *(可选)*：设置提醒事项完成状态
- `completionDate` *(可选)*：设置显式完成时间
- `targetList` *(可选)*：提醒事项所在列表
- `priority` *(可选)*：新优先级级别 (0=无, 1=高, 5=中, 9=低)
- `alarms` *(可选)*：用此数组替换所有提醒
- `clearAlarms` *(可选)*：设置为 true 以移除所有提醒
- `recurrenceRules` *(可选)*：用此数组替换所有重复规则
- `recurrence` *(可选)*：兼容旧写法的单个重复规则
- `clearRecurrence` *(可选)*：设置为 true 以移除重复规则
- `locationTrigger` *(可选)*：新位置触发器
- `clearLocationTrigger` *(可选)*：设置为 true 以移除位置触发器
- `tags` *(可选)*：用此数组替换所有标签
- `addTags` *(可选)*：要添加的标签
- `removeTags` *(可选)*：要移除的标签

**删除操作**（`action: "delete"`）：
- `id` *(必填)*：要删除的提醒事项唯一标识符

#### 提醒对象（Alarm Object）

```json
{
  "relativeOffset": -900,            // 秒（相对到期/开始时间），负数表示提前
  "absoluteDate": "2025-11-04T09:00:00+08:00", // 绝对触发时间（可选）
  "locationTrigger": {               // 地理围栏触发（可选）
    "title": "办公室",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "radius": 100,
    "proximity": "enter"
  }
}
```

每个提醒对象必须且只能指定 `relativeOffset`、`absoluteDate`、`locationTrigger` 之一。

#### 重复规则对象（用于 `recurrenceRules`）

```json
{
  "frequency": "daily" | "weekly" | "monthly" | "yearly",
  "interval": 1,           // 每 N 个周期 (默认: 1)
  "endDate": "YYYY-MM-DD", // 可选结束日期
  "occurrenceCount": 10,   // 可选最大发生次数
  "daysOfWeek": [1, 3, 5], // 1=周日, 7=周六 (用于每周)
  "daysOfMonth": [1, 15],  // 1-31 (用于每月)
  "monthsOfYear": [3, 6]   // 1-12 (用于每年)
}
```

#### 位置触发器对象

```json
{
  "title": "家", // 地点名称
  "latitude": 37.7749, // 纬度
  "longitude": -122.4194, // 经度
  "radius": 100, // 地理围栏半径（米，默认: 100）
  "proximity": "enter" // "enter" (到达) 或 "leave" (离开)
}
```

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
  "action": "create",
  "title": "团队站会",
  "dueDate": "2024-03-25 09:00:00",
  "recurrence": {
    "frequency": "weekly",
    "interval": 1,
    "daysOfWeek": [2, 3, 4, 5, 6]
  }
}
```

```json
{
  "action": "create",
  "title": "买牛奶",
  "locationTrigger": {
    "title": "杂货店",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "radius": 200,
    "proximity": "enter"
  }
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
  "action": "delete",
  "id": "reminder-123"
}
```

### 提醒事项子任务工具

**工具名称**：`reminders_subtasks`

管理提醒事项中的子任务/清单。子任务使用人类可读的格式存储在备注字段中，在原生提醒事项应用中可见。

**操作**：`read`, `create`, `update`, `delete`, `toggle`, `reorder`

**主要处理函数**：
- `handleReadSubtasks()` - 列出提醒的所有子任务
- `handleCreateSubtask()` - 添加新子任务
- `handleUpdateSubtask()` - 修改子任务
- `handleDeleteSubtask()` - 移除子任务
- `handleToggleSubtask()` - 切换完成状态
- `handleReorderSubtasks()` - 更改子任务顺序

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

用于管理提醒事项列表 —— 查看现有列表或创建新的列表来组织提醒事项。

**操作**：`read`、`create`、`update`、`delete`

**主要处理函数**：
- `handleReadReminderLists()` - 读取所有提醒事项列表
- `handleCreateReminderList()` - 创建新的提醒事项列表
- `handleUpdateReminderList()` - 更新现有提醒事项列表
- `handleDeleteReminderList()` - 删除提醒事项列表

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

用于处理 EventKit 日历事件（时间块），提供 CRUD 能力。

**操作**：`read`、`create`、`update`、`delete`

**主要处理函数**：
- `handleReadCalendarEvents()` - 带可选筛选读取事件
- `handleCreateCalendarEvent()` - 创建日历事件
- `handleUpdateCalendarEvent()` - 更新现有事件
- `handleDeleteCalendarEvent()` - 删除日历事件

#### 按操作的参数

**读取操作**（`action: "read"`）：
- `id` *(可选)*：读取单个事件的唯一标识符
- `filterCalendar` *(可选)*：按日历名称筛选
- `search` *(可选)*：按标题/备注/地点搜索
- `availability` *(可选)*：按可用性筛选（"busy"、"free"、"tentative"、"unavailable"、"not-supported"）
- `startDate`、`endDate` *(可选)*：按时间范围筛选

**创建操作**（`action: "create"`）：
- `title` *(必填)*：事件标题
- `startDate` *(必填)*：开始时间
- `endDate` *(必填)*：结束时间
- `targetCalendar` *(可选)*：目标日历名称
- `note`、`location`、`structuredLocation`、`url`、`isAllDay` *(可选)*：基础字段
- `availability` *(可选)*：可用性（"busy"、"free"、"tentative"、"unavailable"）
- `alarms` *(可选)*：提醒数组（见上方「提醒对象」）
- `recurrenceRules` *(可选)*：重复规则数组（见上方「重复规则对象」）

**更新操作**（`action: "update"`）：
- `id` *(必填)*：事件唯一标识符
- 其余字段同创建操作，均为可选更新
- `clearAlarms` *(可选)*：设置为 true 以移除所有提醒
- `clearRecurrence` *(可选)*：设置为 true 以移除所有重复规则
- `span` *(可选)*：循环事件变更范围：`"this-event"` 或 `"future-events"`

**删除操作**（`action: "delete"`）：
- `id` *(必填)*：事件唯一标识符
- `span` *(可选)*：循环事件删除范围：`"this-event"` 或 `"future-events"`

### 日历集合工具

**工具名称**：`calendar_calendars`

用于返回 EventKit 中可用的日历集合。在创建或更新事件前可先确认日历标识。

**操作**：`read`

**主要处理函数**：
- `handleReadCalendars()` - 列出所有日历的 ID 与名称

#### 使用示例

```json
{
  "action": "read"
}
```

#### 响应示例

```json
{
  "content": [
    {
      "type": "text",
      "text": "### Calendars (Total: 3)\n- Work (ID: cal-1)\n- Personal (ID: cal-2)\n- Shared (ID: cal-3)"
    }
  ],
  "isError": false
}
```

#### 响应格式

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

**带有增强功能的提醒事项**：

读取提醒事项时，输出包含增强功能的视觉指示器：
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

**关于 URL 字段的说明**：`url` 字段完全受 EventKit API 支持。创建或更新带有 URL 参数的提醒事项时，URL 会存储在两个位置以确保最大兼容性：

1. **EventKit URL 字段**：URL 存储在原生的 `url` 属性中（可通过提醒事项应用详情视图的 "i" 图标查看）
2. **备注字段**：URL 也会以结构化格式追加到备注中，以便解析

**双重存储方式**：

- **URL 字段**：存储单个 URL，用于原生提醒事项应用显示
- **备注字段**：以结构化格式存储 URL，支持解析和多个 URL

```text
提醒事项备注内容...

URLs:
- https://example.com
- https://another-url.com
```

这确保了 URL 既可通过提醒事项应用 UI 访问，也可通过 API/备注进行解析。

**URL 提取**：可以使用正则表达式从提醒事项备注中提取 URL：

```typescript
// 使用正则表达式从备注中提取 URL
const urlsRegex = reminder.notes?.match(/https?:\/\/[^\s]+/g) || [];
```

**结构化格式的优势**：

- **一致的解析**：URL 始终在可预测的位置
- **支持多个 URL**：可靠地处理每个提醒事项的多个 URL
- **清晰的分离**：备注内容和 URL 清晰分离
- **向后兼容**：非结构化 URL 仍可作为回退方案检测

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
- **高优先级**：包含"紧急"、"重要"、"关键"、"紧急"等词
- **中优先级**：标准提醒事项的默认类别
- **低优先级**：包含"稍后"、"某天"、"最终"、"也许"等词

### 截止日期策略
基于提醒事项的截止日期进行组织：
- **已过期**：过去的截止日期
- **今天**：今天到期的提醒事项
- **明天**：明天到期的提醒事项
- **本周**：本周内到期的提醒事项
- **下周**：下周到期的提醒事项
- **未来**：下周之后到期的提醒事项
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

标签为提醒事项提供跨列表分类。它们使用 `[#tag]` 格式存储在备注字段中，这使得它们在原生提醒事项应用中保持人类可读。

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

1. 使用 pnpm 安装依赖（保持 Swift 桥接与 TypeScript 版本一致）：
```bash
pnpm install
```

2. 在启动前构建 Swift 二进制（TypeScript 使用运行时执行）：
```bash
pnpm build
```

3. 运行全量测试，验证 TypeScript、Swift 桥接和提示模板：
```bash
pnpm test
```

4. 在提交前执行 Biome 检查：
```bash
pnpm exec biome check
```

### 嵌套目录启动

CLI 入口内建项目根目录回退逻辑。即使从 `dist/` 等子目录或编辑器任务运行器启动，服务器也能在向上最多十层目录内定位 `package.json` 并加载随附的 Swift 二进制。若你自定义目录结构，请确保清单文件仍在该查找深度之内，以维持这一保证。

### 可用脚本

- `pnpm build` - 构建 TypeScript 和 Swift 二进制文件（运行前必需）
- `pnpm build:swift` - 仅构建 Swift 二进制文件
- `pnpm test` - 运行 Jest 测试套件
- `pnpm check` - 运行 Biome 格式化和 TypeScript 类型检查

### 依赖

**运行时依赖：**

- `@modelcontextprotocol/sdk ^1.29.0` - MCP 协议实现
- `exit-on-epipe ^1.0.1` - 优雅的进程终止处理
- `zod ^4.4.3` - 运行时类型验证

**开发依赖：**

- `typescript ^6.0.3` - TypeScript 编译器
- `@types/node ^25.8.0` - Node.js 类型定义
- `@types/jest ^30.0.0` - Jest 类型定义
- `jest ^30.4.2` - 测试框架
- `@swc/core ^1.15.33` - SWC 编译器
- `@swc/jest ^0.2.39` - SWC Jest 转换器
- `@biomejs/biome 2.4.15` - 代码格式化和静态检查

**构建工具：**

- Swift 二进制文件用于原生 macOS 集成
- TypeScript 编译用于跨平台兼容性


## License

MIT

## Contributing

Contributions welcome! Please read the contributing guidelines first.
