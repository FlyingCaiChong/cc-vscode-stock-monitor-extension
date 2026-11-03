# Stock Monitor · VS Code 实时股票行情插件

在 VS Code **状态栏**与**资源管理器侧边栏**中实时监控 A 股 / 港股 / 美股行情。灵感来自 Stock Bar，支持自选股管理、收藏置顶、持仓收益、涨跌配色与丰富的自定义配置。

> 插件 ID：`stock-monitor.vscode-stock-monitor-extension`　版本：`1.1.4`

***

## 功能特性

| 功能         | 说明                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| 状态栏实时行情    | 为每只关注股票创建一个状态栏项，持续展示代码 / 名称 / 最新价 / 涨跌幅等核心指标                                                               |
| 自动轮询刷新     | 默认每 10 秒刷新，可在 5 \~ 300 秒之间配置；可通过 `stockMonitor.autoRefresh` 关闭定时刷新；网络抖动时自动降级展示上一次成功的行情                     |
| **刷新时段限制** | 可配置仅在指定时间段内自动刷新（默认 `09:00-11:35`、`12:55-15:05`），减少非交易时段的无效请求；可用 `stockMonitor.enableRefreshTimeRange` 关闭限制 |
| 关注列表管理     | 资源管理器中的「股票关注列表」视图，支持添加、移除、收藏与一键刷新                                                                          |
| 收藏置顶       | 收藏的股票在状态栏与列表中优先展示                                                                                          |
| **持仓收益**   | 可为每只股票配置**别名、成本价、持仓数量**，实时计算**当日收益**与**持仓总收益**（含收益率与持仓市值）                                                  |
| **持仓汇总**   | 自动汇总全部持仓的**当日参考盈亏**、**持仓总收益**与**持仓总市值**，并支持开关与文案自定义                                                        |
| 多市场支持      | A 股（沪 / 深 / 北交所）、港股、美股代码智能识别与归一化                                                                           |
| 涨跌配色       | 上涨 / 下跌 / 平盘三态着色，支持 `greenUp` / `redUp` 两套方案、全局自定义颜色，以及单只股票颜色覆盖                                            |
| 悬浮明细       | 鼠标悬停即显示行情明细，配置持仓后追加成本价、持仓数量、当日收益与总收益                                                                       |
| 友好错误提示     | 针对代码无效、网络异常、请求超时、接口无数据等场景给出中文提示与排查指引                                                                       |
| 运行日志       | 全部请求与异常写入「Stock Monitor」输出通道，便于自助排查                                                                        |

***

## 安装步骤

### 方式一：通过 .vsix 安装包安装（推荐，适用于离线环境）

命令行安装方式：

```bash
code --install-extension vscode-stock-monitor-extension-1.1.0.vsix
```

### 方式二：开发模式运行（用于二次开发）

```bash
npm install
npm run compile
```

在 VS Code 中按 `F5` 启动「Run Extension」配置，会打开一个已加载本插件的开发宿主窗口（详见文末「开发与构建」）。

***

## 使用方法

### 1. 状态栏

插件激活后（VS Code 启动完成即自动激活），状态栏会出现关注股票的行情，例如：

```
贵州茅台 1330.75 -1.85%      上证指数 3681.47 +0.91%
```

### 2. 持仓收益

为股票配置**别名、成本价、持仓数量**后，插件会在每一轮行情刷新时实时计算收益：

| 指标        | 计算公式                    |
| --------- | ----------------------- |
| 持仓市值      | 最新价 × 持仓数量              |
| **当日收益**  | （最新价 − 昨收）× 持仓数量        |
| 当日收益率     | 即行情涨跌幅                  |
| **持仓总收益** | （最新价 − 成本价）× 持仓数量       |
| 持仓收益率     | （最新价 − 成本价）÷ 成本价 × 100% |

配置方式有两种：

**方式一：命令面板（推荐）**

也可以直接在「股票关注列表」中**右键某只股票 → 设置持仓**。

**方式二：编辑** **`settings.json`**

```jsonc
{
  "stockMonitor.positions": [
    { "code": "sh600519", "alias": "茅台", "costPrice": 1200, "shares": 100 },
    { "code": "00700",    "alias": "腾讯", "costPrice": 320.5, "shares": 200 },
    { "code": "AAPL",     "costPrice": 180,   "shares": 30 }
  ]
}
```

**展示效果**

```jsonc
{
  "stockMonitor.displayFields": ["name", "price", "changePercent", "profit", "totalProfit"]
}
```

```
茅台 1330.75 -1.86% 当日 -2,515.00 总 +13,075.00
```

```text
参考盈亏 +1,234.56
```

> 说明：**只配置** **`shares`** **才会计算收益**；仅配置 `alias` / `costPrice` 时，别名与成本价照常展示，收益字段自动省略。成本价或数量为非法值（≤ 0、非数字）时会被自动忽略并在运行日志中提示。

### 3. 股票关注列表（侧边栏）

在「资源管理器（Explorer）」面板中找到 **股票关注列表**：

### 4. 命令列表

在命令面板（`Cmd/Ctrl + Shift + P`）输入 `Stock Monitor` 即可看到全部命令：

| 命令                  | 标识                            | 说明                       |
| ------------------- | ----------------------------- | ------------------------ |
| 添加股票                | `stockMonitor.addStock`       | 输入代码并校验真实性后加入关注列表        |
| 移除股票                | `stockMonitor.removeStock`    | 从关注列表删除                  |
| 收藏 / 取消收藏股票         | `stockMonitor.toggleFavorite` | 切换收藏状态，收藏项优先展示           |
| 设置持仓（别名 / 成本价 / 数量） | `stockMonitor.setPosition`    | 可视化维护持仓配置，用于计算当日收益与持仓总收益 |
| 立即刷新行情              | `stockMonitor.refresh`        | 手动触发一次刷新                 |
| 显示运行日志              | `stockMonitor.showLogs`       | 打开输出面板查看请求日志             |

### 5. 股票代码书写格式

添加股票时支持以下写法（大小写不敏感，可含空格）：

| 市场       | 支持写法                                                    | 归一化结果      |
| -------- | ------------------------------------------------------- | ---------- |
| A 股（沪）   | `600519`、`sh600519`、`600519.SH`、`600519.SS`、`sh.600519` | `sh600519` |
| A 股（深）   | `000001`、`sz000001`、`000001.SZ`                         | `sz000001` |
| A 股（北交所） | `830799`、`bj830799`                                     | `bj830799` |
| 港股       | `700`、`00700`、`hk00700`、`0700.HK`                       | `hk00700`  |
| 美股       | `AAPL`、`us.AAPL`、`AAPL.OQ`、`NASDAQ:AAPL`                | `usAAPL`   |

**规则说明**

***

## 插件配置

在 **设置**（`Cmd/Ctrl + ,`）中搜索 `Stock Monitor`，或直接编辑 `settings.json`：

```jsonc
{
  "stockMonitor.refreshInterval": 10,
  "stockMonitor.autoRefresh": true,
  "stockMonitor.enableRefreshTimeRange": true,
  "stockMonitor.refreshTimeRanges": [
    { "start": "09:00", "end": "11:35" },
    { "start": "12:55", "end": "15:05" }
  ],
  "stockMonitor.statusBarAlignment": "left",
  "stockMonitor.statusBarPriority": 100,
  "stockMonitor.maxStatusBarItems": 6,
  "stockMonitor.showPortfolioSummary": true,
  "stockMonitor.portfolioSummaryLabel": "参考盈亏",
  "stockMonitor.displayFields": ["name", "price", "changePercent"],
  "stockMonitor.colorScheme": "greenUp",
  "stockMonitor.upColor": "#22c55e",
  "stockMonitor.downColor": "#ef4444",
  "stockMonitor.stockColors": [
    { "code": "sz300866", "upColor": "#a855f7", "downColor": "#06b6d4" }
  ],
  "stockMonitor.decimals": 2,
  "stockMonitor.apiEndpoint": "https://qt.gtimg.cn",
  "stockMonitor.requestTimeout": 5000,
  "stockMonitor.watchList": ["sh000001", "sz399001", "sh600519"],
  "stockMonitor.positions": [
    { "code": "sh600519", "alias": "茅台", "costPrice": 1200, "shares": 100 }
  ]
}
```

| 配置项                                   | 类型      | 默认值                                                                 | 取值范围                | 说明                                                                                                   |
| ------------------------------------- | ------- | ------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `stockMonitor.refreshInterval`        | number  | `10`                                                                | 5 \~ 300            | 自动刷新间隔（秒）。过小会加重网络与接口负担                                                                               |
| `stockMonitor.autoRefresh`            | boolean | `true`                                                              | `true` / `false`    | 是否开启定时自动刷新行情。关闭后不再定时调用行情接口，点击状态栏项或执行「立即刷新行情」仍可手动刷新                                                   |
| `stockMonitor.enableRefreshTimeRange` | boolean | `true`                                                              | `true` / `false`    | 是否仅在 `refreshTimeRanges` 指定的时间段内自动刷新；关闭后全天自动刷新。仅约束**定时刷新**，手动刷新不受限                                   |
| `stockMonitor.refreshTimeRanges`      | array   | `[{"start":"09:00","end":"11:35"},{"start":"12:55","end":"15:05"}]` | —                   | 允许自动刷新的时间段，元素为 `{ start, end }`，24 小时制 `HH:mm`。起止均为闭区间，支持跨零点（如 `22:00-02:00`）；空数组表示不限时段              |
| `stockMonitor.statusBarAlignment`     | string  | `left`                                                              | `left` / `right`    | 状态栏停靠位置                                                                                              |
| `stockMonitor.statusBarPriority`      | number  | `100`                                                               | —                   | 状态栏优先级，数值越大越靠前；多只股票按关注顺序依次递减                                                                         |
| `stockMonitor.maxStatusBarItems`      | number  | `6`                                                                 | 1 \~ 20             | 状态栏最多展示的股票数量，收藏项优先                                                                                   |
| `stockMonitor.showPortfolioSummary`   | boolean | `true`                                                              | `true` / `false`    | 是否展示全部持仓的状态栏汇总项                                                                                      |
| `stockMonitor.portfolioSummaryLabel`  | string  | `参考盈亏`                                                              | —                   | 持仓汇总状态栏项的文案前缀，如 `参考盈亏` / `总当日盈亏`                                                                     |
| `stockMonitor.displayFields`          | array   | `["name","price","changePercent"]`                                  | 见下表                 | 状态栏展示字段及顺序（仅影响状态栏，悬浮提示始终展示完整明细）                                                                      |
| `stockMonitor.colorScheme`            | string  | `greenUp`                                                           | `greenUp` / `redUp` | 涨跌配色方案，平盘统一为灰色                                                                                       |
| `stockMonitor.upColor`                | string  | `""`                                                                | 十六进制颜色              | 全局上涨颜色；留空时回退到 `colorScheme`                                                                          |
| `stockMonitor.downColor`              | string  | `""`                                                                | 十六进制颜色              | 全局下跌颜色；留空时回退到 `colorScheme`                                                                          |
| `stockMonitor.stockColors`            | array   | `[]`                                                                | —                   | 单只股票颜色覆盖，元素为 `{ code, upColor?, downColor? }`                                                        |
| `stockMonitor.decimals`               | number  | `2`                                                                 | 0 \~ 4              | 价格保留小数位数                                                                                             |
| `stockMonitor.apiEndpoint`            | string  | `https://qt.gtimg.cn`                                               | —                   | 行情接口地址，可替换为自建或第三方代理                                                                                  |
| `stockMonitor.requestTimeout`         | number  | `5000`                                                              | 1000 \~ 30000       | 单次请求超时（毫秒）                                                                                           |
| `stockMonitor.watchList`              | array   | `["sh000001","sz399001","sh600519"]`                                | —                   | 关注列表主配置；命令面板/侧边栏中的增删操作会同步写回 `settings.json`                                                          |
| `stockMonitor.positions`              | array   | `[]`                                                                | —                   | 持仓配置，元素为 `{ code, alias?, costPrice?, shares? }`；命令 `stockMonitor.setPosition` 会同步写回 `settings.json` |

`displayFields` 可用字段：

| 字段                   | 含义                                | 状态栏展示效果                   |
| -------------------- | --------------------------------- | ------------------------- |
| `name`               | 股票名称（配置别名后展示别名）                   | `贵州茅台` / `茅台`             |
| `code`               | 股票代码                              | `600519`                  |
| `price`              | 最新价                               | `1330.75`                 |
| `change`             | 涨跌额                               | `-25.15`                  |
| `changePercent`      | 涨跌幅                               | `-1.85%`                  |
| `profit`             | 当日收益（需配置 `shares`）                | `当日 -2,515.00`            |
| `totalProfit`        | 持仓总收益（需配置 `shares` 与 `costPrice`） | `总 +13,075.00`            |
| `high` / `low`       | 最高 / 最低                           | `高 1354.98` / `低 1322.60` |
| `open` / `prevClose` | 今开 / 昨收                           | `开 1350.00` / `昨 1355.90` |
| `volume`             | 成交量                               | `388.05万股`                |
| `turnover`           | 成交额                               | `51.72亿元`                 |
| `time`               | 行情时间                              | `16:14:54`                |

### 涨跌配色说明

项目需求描述为「上涨绿色、下跌红色」，同时要求「符合国内投资者使用习惯」（国内实为**红涨绿跌**）。为兼顾两者，插件提供 `colorScheme` 开关：

平盘两种情况均显示为灰色。配色使用 VS Code 主题色（`charts.green` / `charts.red` / `descriptionForeground`），会自动适配浅色与深色主题。

除此之外，还支持两层自定义颜色：

```jsonc
{
  "stockMonitor.upColor": "#22c55e",
  "stockMonitor.downColor": "#ef4444"
}
```

```jsonc
{
  "stockMonitor.stockColors": [
    { "code": "sz300866", "upColor": "#a855f7", "downColor": "#06b6d4" },
    { "code": "sh600519", "upColor": "#f59e0b" }
  ]
}
```

颜色优先级如下：

`单只股票颜色 > 全局颜色 > colorScheme 默认方案`

***

## 行情 API 说明

### 使用接口

默认对接**腾讯财经行情接口**（公开、免密钥、支持批量查询）：

```
GET https://qt.gtimg.cn/q=sh600519,hk00700,usAAPL
```

### 请求要点

### 响应字段（`~` 分隔，各市场下标一致）

| 下标 | 含义  | 下标 | 含义     |
| -- | --- | -- | ------ |
| 1  | 名称  | 30 | 行情时间   |
| 2  | 代码  | 31 | 涨跌额    |
| 3  | 最新价 | 32 | 涨跌幅（%） |
| 4  | 昨收  | 33 | 最高     |
| 5  | 今开  | 34 | 最低     |
| —  | —   | 36 | 成交量    |
| —  | —   | 37 | 成交额    |

**单位换算**：A 股成交量原始单位为「手」（×100 得股数）、成交额为「万元」（×10000 得元）；港股与美股已分别是「股」与「元」，无需换算。插件内部统一换算为「股 / 元」后再格式化展示。

**时间格式**：A 股为 `20261028161454`（紧凑 14 位），港美股为 `2026/10/28 16:08:30` 或 `2026-10-28 16:00:01`，插件统一归一化为 `HH:mm:ss`。

### 自定义 / 代理接口

若默认地址不可用（如内网限制、接口变更），可配置 `stockMonitor.apiEndpoint` 指向自建反向代理。要求代理：

***

## 常见问题排查（FAQ）

### Q1：状态栏没有出现行情数据？

### Q2：提示「网络请求失败」/「行情请求超时」？

### Q3：提示「无法识别的股票代码」？

### Q4：提示「行情接口未返回任何有效数据」？

通常是**代码不存在、已退市或处于停牌状态**。插件在添加股票前会做一次真实探测，探测失败会明确提示且不会加入列表。

### Q5：中文名称显示为乱码？

说明代理/接口返回的不是 GBK 编码。请让代理保持 GBK 原样透传（推荐），或确保返回文本中的中文可被 GBK 正确解码。

### Q6：如何降低资源占用？

### Q7：状态栏 / 列表没有显示收益？

### Q8：为什么 `settings.json` 和界面展示不一致？

新版本中，`stockMonitor.watchList` 与 `stockMonitor.positions` 都以 `settings.json` 为主数据源，命令面板和侧边栏中的操作会同步写回配置文件。若你刚升级自旧版本，插件会在启动时把旧缓存自动迁移到 `settings.json`。

若你直接编辑了 `settings.json` 但界面尚未变化，通常重新执行一次 **Developer: Reload Window** 即可。

### Q9：行情数据是实时的吗？可以用于交易吗？

数据来自公开接口，存在秒级延迟，**仅供学习与参考，不构成任何投资建议**，请勿用于程序化交易决策。

***

## 开发与构建

```bash
# 安装依赖
npm install

# 编译（watch 模式）
npm run watch

# 编译一次
npm run compile

# 代码检查
npm run lint

# 纯函数单元测试（不启动 VS Code，快速）
npm run test:unit

# 扩展宿主集成测试（会下载并启动 VS Code）
npm test

# 打包 .vsix
npm run vsix
```

### 调试插件

在 VS Code 中打开本项目，按 `F5` 选择 **Run Extension**，会启动一个加载了本插件的开发宿主窗口。可在该窗口的状态栏与侧边栏验证全部功能，并设置断点调试。

### 项目结构

```
src/
├── extension.ts              # 插件入口与主控制器（串联各模块）
├── config.ts                 # 配置读取与变更监听
├── types.ts                  # 全局类型（不依赖 vscode，便于单测）
├── logger.ts                 # OutputChannel 日志封装
├── watchListStore.ts         # 关注列表存储（settings.json 为主，缓存保留展示元数据）
├── position.ts               # 持仓收益计算与配置归一化（纯函数）
├── timeWindow.ts             # 刷新时间段解析与判断（纯函数）
├── market/
│   ├── stockCode.ts          # 股票代码识别与归一化（纯函数）
│   ├── quoteParser.ts        # 行情报文解析（纯函数）
│   ├── tencentProvider.ts    # 腾讯接口 HTTP 客户端
│   └── quoteService.ts       # 带缓存的行情服务（网络抖动降级）
└── ui/
    ├── format.ts             # 数值/配色格式化（纯函数）
    ├── statusBarManager.ts   # 状态栏渲染
    └── watchListView.ts      # 关注列表树视图
```

### 架构要点

***

## 性能开销说明

***

## 已知限制

***

## 免责声明

本插件仅用于学习与技术演示。所有行情数据均来自第三方公开接口，其准确性、完整性与及时性不作任何保证。**本插件不构成任何投资建议，使用者据此进行投资决策所产生的风险与损失由使用者自行承担。**

***

## 相关链接
