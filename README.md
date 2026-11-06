# Stock Monitor · VS Code 实时股票行情插件

在 VS Code **状态栏**与**资源管理器侧边栏**中实时监控 A 股 / 港股 / 美股行情。灵感来自 Stock Bar，支持自选股管理、收藏置顶、持仓收益、涨跌配色与丰富的自定义配置。

> 插件 ID：`stock-monitor.vscode-stock-monitor-extension`　版本：`1.1.8`

---

## 功能特性

| 功能             | 说明                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 状态栏实时行情   | 为每只关注股票创建一个状态栏项，持续展示代码 / 名称 / 最新价 / 涨跌幅等核心指标                                                                    |
| 自动轮询刷新     | 默认每 10 秒刷新，可在 5 \~ 300 秒之间配置；可通过 `stockMonitor.autoRefresh` 关闭定时刷新；网络抖动时自动降级展示上一次成功的行情                 |
| **刷新时段限制** | 可配置仅在指定时间段内自动刷新（默认 `09:00-11:35`、`12:55-15:05`），减少非交易时段的无效请求；可用 `stockMonitor.enableRefreshTimeRange` 关闭限制 |
| **价格预警**     | 为每只股票配置价格上 / 下破、涨跌幅上 / 下破阈值，触发时状态栏高亮 `$(bell)` 并弹窗提醒；支持「只提醒一次，条件恢复后自动重新武装」                |
| **异动提醒**     | 行情出现**短时急速拉升 / 跳水**（如 1 分钟内波动超 1.5%）或 A 股**量比骤增**（放量）时弹窗提醒，支持观察窗口与冷却时间配置                         |
| **数据陈旧提示** | 行情超过 `刷新间隔 × 倍数` 未更新（如网络中断）时，状态栏与悬浮提示自动标记 `$(warning)`，及时暴露数据停更                                         |
| **图表面板**     | 支持查看**分时图、日K图、周K图、月K图**；可直接点击股票树节点或使用右键菜单 / 命令面板打开，面板内支持周期切换与手动刷新                           |
| **扩展行情字段** | 除基础行情外，还展示换手率、振幅、量比、市盈率(TTM)、市净率、总市值，并在 A 股涨停 / 跌停时自动追加「涨停」「跌停」标记                            |
| 关注列表管理     | 资源管理器中的「股票关注列表」视图，支持添加、移除、收藏与一键刷新                                                                                 |
| 收藏置顶         | 收藏的股票在状态栏与列表中优先展示                                                                                                                 |
| **持仓收益**     | 可为每只股票配置**别名、成本价、持仓数量**，实时计算**当日收益**与**持仓总收益**（含收益率与持仓市值）                                             |
| **持仓汇总**     | 自动汇总全部持仓的**当日参考盈亏**、**持仓总收益**与**持仓总市值**，并支持开关与文案自定义                                                         |
| 多市场支持       | A 股（沪 / 深 / 北交所）、港股、美股代码智能识别与归一化                                                                                           |
| 涨跌配色         | 上涨 / 下跌 / 平盘三态着色，支持 `greenUp` / `redUp` 两套方案、全局自定义颜色，以及单只股票颜色覆盖                                                |
| 悬浮明细         | 鼠标悬停即显示行情明细，配置持仓后追加成本价、持仓数量、当日收益与总收益                                                                           |
| 友好错误提示     | 针对代码无效、网络异常、请求超时、接口无数据等场景给出中文提示与排查指引                                                                           |
| 运行日志         | 全部请求与异常写入「Stock Monitor」输出通道，便于自助排查                                                                                          |

---

## 安装步骤

### 方式一：通过 .vsix 安装包安装（推荐，适用于离线环境）

命令行安装方式：

```bash
code --install-extension vscode-stock-monitor-extension-1.1.8.vsix
```

### 方式二：开发模式运行（用于二次开发）

```bash
npm install
npm run compile
```

在 VS Code 中按 `F5` 启动「Run Extension」配置，会打开一个已加载本插件的开发宿主窗口（详见文末「开发与构建」）。

---

## 使用方法

### 1. 状态栏

插件激活后（VS Code 启动完成即自动激活），状态栏会出现关注股票的行情，例如：

```
贵州茅台 1330.75 -1.85%      上证指数 3681.47 +0.91%
```

### 2. 持仓收益

为股票配置**别名、成本价、持仓数量**后，插件会在每一轮行情刷新时实时计算收益：

| 指标           | 计算公式                           |
| -------------- | ---------------------------------- |
| 持仓市值       | 最新价 × 持仓数量                  |
| **当日收益**   | （最新价 − 昨收）× 持仓数量        |
| 当日收益率     | 即行情涨跌幅                       |
| **持仓总收益** | （最新价 − 成本价）× 持仓数量      |
| 持仓收益率     | （最新价 − 成本价）÷ 成本价 × 100% |

配置方式有两种：

**方式一：命令面板（推荐）**

也可以直接在「股票关注列表」中**右键某只股票 → 设置持仓**。

**方式二：编辑** **`settings.json`**

```jsonc
{
  "stockMonitor.positions": [
    { "code": "sh600519", "alias": "茅台", "costPrice": 1200, "shares": 100 },
    { "code": "00700", "alias": "腾讯", "costPrice": 320.5, "shares": 200 },
    { "code": "AAPL", "costPrice": 180, "shares": 30 },
  ],
}
```

**展示效果**

```jsonc
{
  "stockMonitor.displayFields": [
    "name",
    "price",
    "changePercent",
    "profit",
    "totalProfit",
  ],
}
```

```
茅台 1330.75 -1.86% 当日 -2,515.00 总 +13,075.00
```

```text
参考盈亏 +1,234.56
```

> 说明：**只配置** **`shares`** **才会计算收益**；仅配置 `alias` / `costPrice` 时，别名与成本价照常展示，收益字段自动省略。成本价或数量为非法值（≤ 0、非数字）时会被自动忽略并在运行日志中提示。

### 3. 价格预警

通过 `stockMonitor.alerts` 为关注的股票设置价格 / 涨跌幅阈值，触发后状态栏项会显示 `$(bell)` 图标并在悬浮提示顶部列出触发原因，同时弹出一条警告通知（可点击「查看日志」跳转到输出面板）。

```jsonc
{
  "stockMonitor.alerts": [
    {
      "code": "sh600519",
      "above": 1600, // 最新价上破 1600 时提醒
      "below": 1400, // 最新价下破 1400 时提醒
      "changePercentAbove": 5, // 涨幅上破 +5% 时提醒
      "changePercentBelow": -5, // 跌幅下破 -5% 时提醒
    },
  ],
}
```

- **同一只股票的多个阈值请写在同一个对象内**（写多个对象时只有最后一条生效）。
- `once`（默认 `true`）表示「未触发 → 触发」的瞬间只提醒一次；当价格回落 / 涨跌幅回到区间内后会自动**重新武装**，下次越界可再次提醒，避免持续刷屏。
- 触发高亮对**所有越界状态**生效（包括已提醒过的），因此状态栏可始终反映当前是否处于预警区间。

### 4. 异动提醒

与「价格预警」不同，异动提醒关注的是**短时相对变化**：价格在观察窗口内急速波动，或 A 股量比骤增（放量）时弹出一条提示通知，点击「查看图表」可直接查看该股票走势。

| 异动类型 | 触发条件                                                               |
| -------- | ---------------------------------------------------------------------- |
| 急速拉升 | 观察窗口内涨幅达到 `stockMonitor.anomalyPriceChangePercent`            |
| 急速跳水 | 观察窗口内跌幅达到 `stockMonitor.anomalyPriceChangePercent`            |
| 放量异动 | 量比达到 `stockMonitor.anomalyVolumeRatioThreshold`（仅 A 股提供量比） |

```jsonc
{
  "stockMonitor.enableAnomalyAlert": true, // 异动提醒总开关
  "stockMonitor.anomalyWindowSeconds": 60, // 观察窗口：统计最近 60 秒的价格变化
  "stockMonitor.anomalyPriceChangePercent": 1.5, // 窗口内波动超过 1.5% 即视为异动
  "stockMonitor.anomalyVolumeRatioThreshold": 3, // 量比达到 3 视为放量，0 表示关闭
  "stockMonitor.anomalyCooldownSeconds": 300, // 同一只股票同类型异动 5 分钟内只提醒一次
}
```

- 需积累满一个观察窗口的行情数据后才会开始判断，避免刚启动监控时把一小段涨幅误判为异动。
- 冷却期内的同类型异动不会重复提醒；异动属于**瞬时事件**，不会像价格预警那样在状态栏留下持续高亮。
- 观察窗口与阈值越小越灵敏，实际使用中建议结合个股波动性（如大盘股可调低阈值，小盘股适当调高）调整。

### 5. 数据陈旧提示

行情数据超过 `刷新间隔 × stockMonitor.staleThresholdMultiplier`（默认 5 倍）仍未更新时，状态栏项与悬浮提示会标记 `$(warning)` 并显示距上次更新的秒数，用于发现网络中断等导致的数据停更。

该检测仅在**开启自动刷新且处于刷新时间段内**时生效，避免在非交易时段误报；将 `stockMonitor.staleThresholdMultiplier` 设为 `0` 可完全关闭。

### 6. 股票关注列表（侧边栏）

在「资源管理器（Explorer）」面板中找到 **股票关注列表**：

- **单击任意股票**：直接打开图表面板
- **右键菜单**：可从「查看图表」打开当前股票的分时图 / 日K图 / 周K图 / 月K图

### 7. 查看图表

执行方式有三种：

1. 在「股票关注列表」中**单击股票**
2. 在「股票关注列表」中**右键股票 → 查看图表**
3. 在命令面板执行 `Stock Monitor: 查看图表（分时图 / 日K图 / 周K图 / 月K图）`

图表面板顶部提供四个周期切换按钮：

- `分时图`
- `日K图`
- `周K图`
- `月K图`

面板右上角的「刷新图表」按钮会重新拉取当前股票、当前周期的数据。若主行情轮询仍在运行，图表面板打开期间也会随着轮询自动刷新。

若你希望图表更像“悬浮框”而不是普通编辑页签，可开启：

```jsonc
{
  "stockMonitor.chartPanelFloatMode": true,
}
```

开启后，图表会优先在旁边打开，并尽量不抢当前编辑器焦点；关闭后保持普通 Webview 面板打开方式。

### 8. 命令列表

在命令面板（`Cmd/Ctrl + Shift + P`）输入 `Stock Monitor` 即可看到全部命令：

| 命令                                       | 标识                          | 说明                                             |
| ------------------------------------------ | ----------------------------- | ------------------------------------------------ |
| 添加股票                                   | `stockMonitor.addStock`       | 输入代码并校验真实性后加入关注列表               |
| 移除股票                                   | `stockMonitor.removeStock`    | 从关注列表删除                                   |
| 收藏 / 取消收藏股票                        | `stockMonitor.toggleFavorite` | 切换收藏状态，收藏项优先展示                     |
| 设置持仓（别名 / 成本价 / 数量）           | `stockMonitor.setPosition`    | 可视化维护持仓配置，用于计算当日收益与持仓总收益 |
| 查看图表（分时图 / 日K图 / 周K图 / 月K图） | `stockMonitor.openChart`      | 打开图表面板并切换查看对应周期                   |
| 立即刷新行情                               | `stockMonitor.refresh`        | 手动触发一次刷新                                 |
| 显示运行日志                               | `stockMonitor.showLogs`       | 打开输出面板查看请求日志                         |

### 9. 股票代码书写格式

添加股票时支持以下写法（大小写不敏感，可含空格）：

| 市场           | 支持写法                                                    | 归一化结果 |
| -------------- | ----------------------------------------------------------- | ---------- |
| A 股（沪）     | `600519`、`sh600519`、`600519.SH`、`600519.SS`、`sh.600519` | `sh600519` |
| A 股（深）     | `000001`、`sz000001`、`000001.SZ`                           | `sz000001` |
| A 股（北交所） | `830799`、`bj830799`                                        | `bj830799` |
| 港股           | `700`、`00700`、`hk00700`、`0700.HK`                        | `hk00700`  |
| 美股           | `AAPL`、`us.AAPL`、`AAPL.OQ`、`NASDAQ:AAPL`                 | `usAAPL`   |

**规则说明**

---

## 插件配置

在 **设置**（`Cmd/Ctrl + ,`）中搜索 `Stock Monitor`，或直接编辑 `settings.json`：

```jsonc
{
  "stockMonitor.refreshInterval": 10,
  "stockMonitor.autoRefresh": true,
  "stockMonitor.enableRefreshTimeRange": true,
  "stockMonitor.refreshTimeRanges": [
    { "start": "09:00", "end": "11:35" },
    { "start": "12:55", "end": "15:05" },
  ],
  "stockMonitor.staleThresholdMultiplier": 5,
  "stockMonitor.alerts": [
    {
      "code": "sh600519",
      "above": 1600,
      "below": 1400,
      "changePercentAbove": 5,
      "changePercentBelow": -5,
    },
  ],
  "stockMonitor.enableAnomalyAlert": true,
  "stockMonitor.anomalyWindowSeconds": 60,
  "stockMonitor.anomalyPriceChangePercent": 1.5,
  "stockMonitor.anomalyVolumeRatioThreshold": 3,
  "stockMonitor.anomalyCooldownSeconds": 300,
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
    { "code": "sz300866", "upColor": "#a855f7", "downColor": "#06b6d4" },
  ],
  "stockMonitor.decimals": 2,
  "stockMonitor.apiEndpoint": "https://qt.gtimg.cn",
  "stockMonitor.chartApiEndpoint": "https://web.ifzq.gtimg.cn",
  "stockMonitor.chartPanelFloatMode": false,
  "stockMonitor.requestTimeout": 5000,
  "stockMonitor.watchList": ["sh000001", "sz399001", "sh600519"],
  "stockMonitor.positions": [
    { "code": "sh600519", "alias": "茅台", "costPrice": 1200, "shares": 100 },
  ],
}
```

| 配置项                                     | 类型    | 默认值                                                              | 取值范围            | 说明                                                                                                                                 |
| ------------------------------------------ | ------- | ------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `stockMonitor.refreshInterval`             | number  | `10`                                                                | 5 \~ 300            | 自动刷新间隔（秒）。过小会加重网络与接口负担                                                                                         |
| `stockMonitor.autoRefresh`                 | boolean | `true`                                                              | `true` / `false`    | 是否开启定时自动刷新行情。关闭后不再定时调用行情接口，点击状态栏项或执行「立即刷新行情」仍可手动刷新                                 |
| `stockMonitor.enableRefreshTimeRange`      | boolean | `true`                                                              | `true` / `false`    | 是否仅在 `refreshTimeRanges` 指定的时间段内自动刷新；关闭后全天自动刷新。仅约束**定时刷新**，手动刷新不受限                          |
| `stockMonitor.refreshTimeRanges`           | array   | `[{"start":"09:00","end":"11:35"},{"start":"12:55","end":"15:05"}]` | —                   | 允许自动刷新的时间段，元素为 `{ start, end }`，24 小时制 `HH:mm`。起止均为闭区间，支持跨零点（如 `22:00-02:00`）；空数组表示不限时段 |
| `stockMonitor.staleThresholdMultiplier`    | number  | `5`                                                                 | 0 \~ 60             | 行情超过「刷新间隔 × 该倍数」未更新时标记为数据陈旧；`0` 表示不检测。仅在开启自动刷新且处于刷新时段内生效                            |
| `stockMonitor.alerts`                      | array   | `[]`                                                                | —                   | 价格 / 涨跌幅预警规则，元素为 `{ code, above?, below?, changePercentAbove?, changePercentBelow?, once? }`                            |
| `stockMonitor.enableAnomalyAlert`          | boolean | `true`                                                              | `true` / `false`    | 是否启用异动提醒：短时急速拉升 / 跳水、A 股量比骤增（放量）时弹窗提醒。与 `alerts` 的区别见「异动提醒」小节                          |
| `stockMonitor.anomalyWindowSeconds`        | number  | `60`                                                                | 30 \~ 600           | 异动检测的价格观察窗口（秒），比较「窗口内最早采样价」与「当前价」的涨跌幅。需积累满一个窗口的数据后才开始判断                       |
| `stockMonitor.anomalyPriceChangePercent`   | number  | `1.5`                                                               | 0.1 \~ 20           | 观察窗口内涨跌幅超过该百分值即视为急速拉升 / 跳水；取值越小越灵敏。默认 1.5 表示 1.5%                                                |
| `stockMonitor.anomalyVolumeRatioThreshold` | number  | `3`                                                                 | 0 \~ 50             | 量比达到该值即视为放量异动；`0` 表示关闭该项检测。量比仅 A 股提供，港股 / 美股不会触发该类型                                         |
| `stockMonitor.anomalyCooldownSeconds`      | number  | `300`                                                               | 0 \~ 3600           | 同一只股票同类型异动的提醒冷却时间（秒），冷却期内不重复提醒；`0` 表示不冷却                                                         |
| `stockMonitor.statusBarAlignment`          | string  | `left`                                                              | `left` / `right`    | 状态栏停靠位置                                                                                                                       |
| `stockMonitor.statusBarPriority`           | number  | `100`                                                               | —                   | 状态栏优先级，数值越大越靠前；多只股票按关注顺序依次递减                                                                             |
| `stockMonitor.maxStatusBarItems`           | number  | `6`                                                                 | 1 \~ 20             | 状态栏最多展示的股票数量，收藏项优先                                                                                                 |
| `stockMonitor.showPortfolioSummary`        | boolean | `true`                                                              | `true` / `false`    | 是否展示全部持仓的状态栏汇总项                                                                                                       |
| `stockMonitor.portfolioSummaryLabel`       | string  | `参考盈亏`                                                          | —                   | 持仓汇总状态栏项的文案前缀，如 `参考盈亏` / `总当日盈亏`                                                                             |
| `stockMonitor.displayFields`               | array   | `["name","price","changePercent"]`                                  | 见下表              | 状态栏展示字段及顺序（仅影响状态栏，悬浮提示始终展示完整明细）                                                                       |
| `stockMonitor.colorScheme`                 | string  | `greenUp`                                                           | `greenUp` / `redUp` | 涨跌配色方案，平盘统一为灰色                                                                                                         |
| `stockMonitor.upColor`                     | string  | `""`                                                                | 十六进制颜色        | 全局上涨颜色；留空时回退到 `colorScheme`                                                                                             |
| `stockMonitor.downColor`                   | string  | `""`                                                                | 十六进制颜色        | 全局下跌颜色；留空时回退到 `colorScheme`                                                                                             |
| `stockMonitor.stockColors`                 | array   | `[]`                                                                | —                   | 单只股票颜色覆盖，元素为 `{ code, upColor?, downColor? }`                                                                            |
| `stockMonitor.decimals`                    | number  | `2`                                                                 | 0 \~ 4              | 价格保留小数位数                                                                                                                     |
| `stockMonitor.apiEndpoint`                 | string  | `https://qt.gtimg.cn`                                               | —                   | 行情接口地址，可替换为自建或第三方代理                                                                                               |
| `stockMonitor.chartApiEndpoint`            | string  | `https://web.ifzq.gtimg.cn`                                         | —                   | 图表接口地址，用于分时图 / 日K图 / 周K图 / 月K图；若默认地址不可用，可替换为支持同协议的代理                                         |
| `stockMonitor.chartPanelFloatMode`         | boolean | `false`                                                             | `true` / `false`    | 是否以“悬浮框”方式展示图表面板。开启后在旁边打开且尽量不抢当前编辑器焦点，关闭后按普通 Webview 面板方式打开                          |
| `stockMonitor.requestTimeout`              | number  | `5000`                                                              | 1000 \~ 30000       | 单次请求超时（毫秒）                                                                                                                 |
| `stockMonitor.watchList`                   | array   | `["sh000001","sz399001","sh600519"]`                                | —                   | 关注列表主配置；命令面板/侧边栏中的增删操作会同步写回 `settings.json`                                                                |
| `stockMonitor.positions`                   | array   | `[]`                                                                | —                   | 持仓配置，元素为 `{ code, alias?, costPrice?, shares? }`；命令 `stockMonitor.setPosition` 会同步写回 `settings.json`                 |

`displayFields` 可用字段：

| 字段                 | 含义                                         | 状态栏展示效果              |
| -------------------- | -------------------------------------------- | --------------------------- |
| `name`               | 股票名称（配置别名后展示别名）               | `贵州茅台` / `茅台`         |
| `code`               | 股票代码                                     | `600519`                    |
| `price`              | 最新价                                       | `1330.75`                   |
| `change`             | 涨跌额                                       | `-25.15`                    |
| `changePercent`      | 涨跌幅                                       | `-1.85%`                    |
| `profit`             | 当日收益（需配置 `shares`）                  | `当日 -2,515.00`            |
| `totalProfit`        | 持仓总收益（需配置 `shares` 与 `costPrice`） | `总 +13,075.00`             |
| `high` / `low`       | 最高 / 最低                                  | `高 1354.98` / `低 1322.60` |
| `open` / `prevClose` | 今开 / 昨收                                  | `开 1350.00` / `昨 1355.90` |
| `volume`             | 成交量                                       | `388.05万股`                |
| `turnover`           | 成交额                                       | `51.72亿元`                 |
| `turnoverRate`       | 换手率（港股不提供，自动省略）               | `换手 0.59%`                |
| `amplitude`          | 振幅                                         | `振幅 3.20%`                |
| `volumeRatio`        | 量比（仅 A 股提供，自动省略）                | `量比 1.35`                 |
| `peTtm`              | 市盈率(TTM)                                  | `PE 28.60`                  |
| `pb`                 | 市净率（仅 A 股提供，自动省略）              | `PB 8.10`                   |
| `marketCap`          | 总市值                                       | `市值 120.00亿元`           |
| `time`               | 行情时间                                     | `16:14:54`                  |

> 说明：扩展统计字段（`turnoverRate` / `amplitude` / `volumeRatio` / `peTtm` / `pb` / `marketCap`）在接口未提供数据时自动省略，不会展示无意义的 `0`。此外，A 股触及涨 / 跌停时，状态栏文本末尾会自动追加「涨停」/「跌停」，无需额外配置。

### 涨跌配色说明

项目需求描述为「上涨绿色、下跌红色」，同时要求「符合国内投资者使用习惯」（国内实为**红涨绿跌**）。为兼顾两者，插件提供 `colorScheme` 开关：

平盘两种情况均显示为灰色。配色使用 VS Code 主题色（`charts.green` / `charts.red` / `descriptionForeground`），会自动适配浅色与深色主题。

除此之外，还支持两层自定义颜色：

```jsonc
{
  "stockMonitor.upColor": "#22c55e",
  "stockMonitor.downColor": "#ef4444",
}
```

```jsonc
{
  "stockMonitor.stockColors": [
    { "code": "sz300866", "upColor": "#a855f7", "downColor": "#06b6d4" },
    { "code": "sh600519", "upColor": "#f59e0b" },
  ],
}
```

颜色优先级如下：

`单只股票颜色 > 全局颜色 > colorScheme 默认方案`

---

## 行情 API 说明

### 使用接口

默认对接**腾讯财经行情接口**（公开、免密钥、支持批量查询）：

```
GET https://qt.gtimg.cn/q=sh600519,hk00700,usAAPL
```

### 请求要点

- **一次拉取全部关注股票**：接口支持批量查询，`/q=` 后以英文逗号拼接多个代码（如 `q=sh600519,hk00700,usAAPL`），插件会合并为一次请求，单次最多 50 个代码，超出部分自动分片。
- **编码为 GBK**：响应文本必须按 GBK 解码，否则中文名称会出现乱码；插件内置 `iconv-lite` 完成转码。
- **需携带浏览器请求头**：插件默认附带 `User-Agent` 与 `Referer: https://gu.qq.com/`，以降低被风控拦截的概率。
- **超时可控**：默认 5000ms，可通过 `stockMonitor.requestTimeout` 调整（1000 \~ 30000ms）；超时会主动销毁连接，避免请求挂起。
- **局部失败不影响整体**：某个代码查不到不会影响同一批其他代码；整批请求失败时，插件会降级展示上一次成功获取的行情。

### 响应字段（`~` 分隔）

| 下标 | 含义         | 下标 | 含义         |
| ---- | ------------ | ---- | ------------ |
| 1    | 名称         | 30   | 行情时间     |
| 2    | 代码         | 31   | 涨跌额       |
| 3    | 最新价       | 32   | 涨跌幅（%）  |
| 4    | 昨收         | 33   | 最高         |
| 5    | 今开         | 34   | 最低         |
| 38   | 换手率（%）※ | 36   | 成交量       |
| 39   | 市盈率(TTM)  | 37   | 成交额       |
| 43   | 振幅（%）    | 45   | 总市值（亿） |
| 46   | 市净率 ※     | 47   | 涨停价 ※     |
| 48   | 跌停价 ※     | 49   | 量比 ※       |

> 标记 ※ 的字段（下标 46 ~ 49）**仅 A 股有效**：港美股在相同位置存放的是英文名与 52 周最高 / 最低价，含义完全不同，插件会按市场门控，避免误读。港股不提供换手率，恒为 0。

**单位换算**：A 股成交量原始单位为「手」（×100 得股数）、成交额为「万元」（×10000 得元），总市值原始单位为「亿元」（×1e8 得元）；港股与美股成交量 / 成交额已分别是「股」与「元」，无需换算。插件内部统一换算为「股 / 元」后再格式化展示。

**时间格式**：A 股为 `20261028161454`（紧凑 14 位），港美股为 `2026/10/28 16:08:30` 或 `2026-10-28 16:00:01`，插件统一归一化为 `HH:mm:ss`。

### 自定义 / 代理接口

若默认地址不可用（如内网限制、接口变更），可配置 `stockMonitor.apiEndpoint` 与 `stockMonitor.chartApiEndpoint` 指向自建反向代理。要求代理：

**通用要求**

1. 配置值只写**协议 + 域名（含端口）**，不要带路径或查询串，例如 `https://my-proxy.example.com`；插件会自行拼接 `pathname + search`。
2. 正常返回 **HTTP 200**；若使用跳转，最多跟随 3 层。
3. 支持 HTTPS / HTTP 均可，插件按地址协议自动选择传输方式。

**行情接口（`stockMonitor.apiEndpoint`）**

4. 保持原始路径格式 `GET {endpoint}/q=sh600519,hk00700`，并支持一次查询多个逗号分隔的代码。
5. **必须原样透传 GBK 编码**（推荐），或确保响应中的中文能被 GBK 正确解码，否则会出现乱码。
6. 响应体保持腾讯的 `v_<code>="字段~字段~..."` 文本格式与字段顺序，插件按下标解析。

**图表接口（`stockMonitor.chartApiEndpoint`）**

7. 需实现以下两个路径，并返回与腾讯一致的 JSON 结构：
   - 分时：`GET {endpoint}/appstock/app/minute/query?code=sh600519`
   - K 线：`GET {endpoint}/appstock/app/fqkline/get?param=sh600519,day,,,120,qfq`

> 代理仅做转发时，最简单的做法是「透传原始响应体、不修改编码与字段」，这样无需关心解析细节。

---

## 常见问题排查（FAQ）

### Q1：状态栏没有出现行情数据？

按以下顺序自查：

1. **确认插件已激活**：插件在 VS Code 启动完成后自动激活（`onStartupFinished`）。打开「查看 → 输出」并选择 `Stock Monitor` 通道，应能看到「Stock Monitor 插件已激活」；若没有，请确认扩展已启用且未被「禁用（工作区）」。
2. **确认关注列表不为空**：列表为空时状态栏只会显示一个 `$(add) 添加股票` 引导项，点击即可添加。
3. **确认未被展示上限隐藏**：状态栏最多展示 `stockMonitor.maxStatusBarItems`（默认 6）只股票，超出部分自动隐藏；同时检查 `stockMonitor.displayFields` 是否被清成了 `[]`（没有字段自然没有文本）。
4. **确认代码有效**：写在 `stockMonitor.watchList` 中但无法识别的代码会被跳过，日志里有「关注列表中的 "xxx" 无法识别，已跳过」的记录。
5. **远程开发场景**：在 Remote-SSH / WSL / Dev Container 中，扩展需安装在**远端**或设为在远端运行，否则状态栏不会出现。
6. 仍未出现时，执行一次 **Developer: Reload Window**。

### Q2：提示「网络请求失败」/「行情请求超时」？

这两类问题都来自行情接口请求本身，插件会翻译成可操作的中文提示：

| 场景            | 弹窗提示                                                        | 日志中的原始错误           |
| --------------- | --------------------------------------------------------------- | -------------------------- |
| 连接 / DNS 失败 | 无法连接行情接口（`https://qt.gtimg.cn`），请检查网络或代理设置 | `网络请求失败：<具体原因>` |
| 超过请求超时    | 行情请求超时，请检查网络，或调大 `stockMonitor.requestTimeout`  | `行情请求超时（5000ms）`   |

- **界面不会变空**：请求失败时会自动降级展示上一次成功获取的行情，因此表现为数据「停更」——若开启了数据陈旧提示，状态栏会出现 `$(warning)` 标记。
- 轮询期间的**同类错误只写日志、不重复弹窗**（避免每 10 秒打扰一次）；手动刷新与启动刷新一定会提示。
- 排查建议：
  1. 确认本机能访问行情接口 `https://qt.gtimg.cn`（公司网络、代理、防火墙可能拦截）。
  2. 弱网环境可调大 `stockMonitor.requestTimeout`（最大 30000ms）。
  3. 需要走代理时配置 `stockMonitor.apiEndpoint`，详见「自定义 / 代理接口」。
  4. 点击提示中的「查看日志」，或执行命令「显示运行日志」，查看具体失败原因。

### Q3：提示「无法识别的股票代码」？

插件支持以下写法（大小写不敏感）：

| 市场 | 可用写法                                                           |
| ---- | ------------------------------------------------------------------ |
| A 股 | `600519`、`sh600519`、`600519.SH`、`600519.SS`、`000001`、`430047` |
| 港股 | `700`、`00700`、`hk00700`、`0700.HK`                               |
| 美股 | `AAPL`、`us.AAPL`、`AAPL.US`、`NASDAQ:AAPL`                        |

常见原因：

- A 股必须是 6 位数字；港股不超过 5 位（`700` 会自动补零为 `00700`）；美股为 1 \~ 5 位字母（可含 `.` 与 `-`）。
- `usAAPL` 这种「无分隔符的字母前缀」写法不被识别（`USB` 本身就是真实美股代码，存在歧义），请改用 `us.AAPL` 或直接输入 `AAPL`。
- `000001` 会按**深市平安银行**处理，需要上证指数请显式写 `sh000001`。
- 前缀与代码格式不匹配会明确报错，如 `hk600519` → 「与港股代码格式不匹配」。

### Q4：提示「行情接口未返回任何有效数据」？

通常是**代码不存在、已退市或处于停牌状态**。插件在添加股票前会做一次真实探测，探测失败会明确提示且不会加入列表。

### Q5：中文名称显示为乱码？

说明代理/接口返回的不是 GBK 编码。请让代理保持 GBK 原样透传（推荐），或确保返回文本中的中文可被 GBK 正确解码。

### Q6：如何降低资源占用？

行情请求是「一次拉取全部关注股票」的合并请求，因此**关注多少只股票几乎不影响请求次数**，真正决定开销的是刷新频率与刷新时段。

1. 调大 `stockMonitor.refreshInterval`（默认 10 秒，范围 5 \~ 300 秒）。
2. 保留 `stockMonitor.enableRefreshTimeRange`（默认开启）与 `stockMonitor.refreshTimeRanges`，让非交易时段不发起请求。
3. 需要完全静默时关闭 `stockMonitor.autoRefresh`，改为手动刷新（点击状态栏项 / 列表刷新按钮 / 命令「立即刷新行情」）。
4. 图表面板只在打开时才请求图表接口，不用时关掉即可。
5. `stockMonitor.staleThresholdMultiplier` 设为 `0` 可关闭数据陈旧检测——它不产生网络开销，只减少一点渲染与提示逻辑。

### Q7：状态栏 / 列表没有显示收益？

收益必须同时满足「配置了持仓数量」和「已获取到行情」两个条件：

| 想看到的内容        | 必须配置                                                            |
| ------------------- | ------------------------------------------------------------------- |
| 名称显示为别名      | `alias`                                                             |
| 当日收益 / 持仓市值 | `shares`（正整数）                                                  |
| 持仓总收益 / 收益率 | `shares` + `costPrice`                                              |
| 状态栏持仓汇总项    | `stockMonitor.showPortfolioSummary` 为 `true`，且至少一只持仓可计算 |

- 只写 `alias` 或 `costPrice` 而**没有** `shares` 时，不会出现任何收益数值。
- 状态栏文本需在 `stockMonitor.displayFields` 中包含 `profit` / `totalProfit`，否则不会展示对应字段。
- 汇总项按「（最新价 − 昨收）× 持仓数量」累计当日参考盈亏，只统计**已获取行情**的持仓；行情未到达前暂不显示。
- 直接编辑 `settings.json` 中的 `positions` 会立即生效；若界面未刷新，执行一次 **Developer: Reload Window**。

### Q8：为什么 `settings.json` 和界面展示不一致？

新版本中，`stockMonitor.watchList` 与 `stockMonitor.positions` 都以 `settings.json` 为主数据源，命令面板和侧边栏中的操作会同步写回配置文件。若你刚升级自旧版本，插件会在启动时把旧缓存自动迁移到 `settings.json`。

若你直接编辑了 `settings.json` 但界面尚未变化，通常重新执行一次 **Developer: Reload Window** 即可。

### Q9：行情数据是实时的吗？可以用于交易吗？

数据来自公开接口，存在秒级延迟，**仅供学习与参考，不构成任何投资建议**，请勿用于程序化交易决策。

---

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
├── chart.ts                  # 图表数据结构与响应解析（纯函数）
├── position.ts               # 持仓收益计算与配置归一化（纯函数）
├── alerts.ts                 # 价格 / 涨跌幅预警规则解析与判定（纯函数）
├── anomaly.ts                # 行情异动检测：急拉 / 跳水 / 放量（纯函数）
├── timeWindow.ts             # 刷新时间段解析与判断（纯函数）
├── market/
│   ├── chartProvider.ts      # 腾讯分时 / K 线图表接口客户端
│   ├── stockCode.ts          # 股票代码识别与归一化（纯函数）
│   ├── quoteParser.ts        # 行情报文解析（纯函数）
│   ├── tencentProvider.ts    # 腾讯接口 HTTP 客户端
│   └── quoteService.ts       # 带缓存的行情服务（网络抖动降级）
└── ui/
    ├── chartPanel.ts         # 图表 Webview 面板
    ├── format.ts             # 数值/配色格式化（纯函数）
    ├── statusBarManager.ts   # 状态栏渲染
    └── watchListView.ts      # 关注列表树视图
```

### 架构要点

**1. 纯函数与副作用分离**

凡是不依赖 VS Code API 的逻辑，均抽成独立模块（`stockCode` / `quoteParser` / `position` / `alerts` / `anomaly` / `chart` / `timeWindow` / `format`），它们只做「输入 → 输出」的纯计算，不 `import 'vscode'`。因此可以用 mocha 直接在 Node 中跑单测，无需启动扩展宿主（见 `npm run test:unit`）。涉及 UI、网络、配置的副作用则集中在 `extension.ts`、`ui/*`、`market/*` 中。

**2. 主控制器串联**

`extension.ts` 是唯一的编排者：激活时创建 `QuoteService`（网络 + 缓存）、`StatusBarManager`（状态栏）与 `WatchListView`（侧边栏），并按 `refreshInterval` 定时轮询；每一轮拿到行情后，依次驱动状态栏渲染、树视图刷新、预警判定与异动检测。

**3. 数据流**

```
settings.json (watchList / positions)
        │  归一化代码
        ▼
   QuoteService ──► tencentProvider (HTTP + GBK 转码)
        │                  │
        │                  ▼
        │            quoteParser (报文 → Quote)
        ▼
   Map<key, Quote>
        ├─► statusBarManager   状态栏
        ├─► watchListView      侧边栏
        ├─► alerts             价格 / 涨跌幅预警
        └─► anomaly            急拉 / 跳水 / 放量异动
```

**4. 缓存降级**

`QuoteService` 持有上一次成功获取的快照。请求失败时不抛空界面，而是返回旧快照并把「数据陈旧」状态透出，由状态栏显示 `$(warning)`。

**5. 配置单一数据源**

`watchList` 与 `positions` 均以 `settings.json` 为唯一主数据源，`config.ts` 负责统一读取与 `onDidChangeConfiguration` 监听，任何界面操作都会写回配置文件，保证「界面所见 = 配置所有」。

**6. 图表面板**

`ui/chartPanel.ts` 是 Webview 面板，与扩展之间通过 `postMessage` 双向通信；`market/chartProvider.ts` 负责请求分时与 K 线数据，`chart.ts` 做纯函数解析。

---

## 性能开销说明

- **网络开销与股票数量无关**：行情采用合并请求，「一次刷新 = 一次请求」，每满 50 只股票才多分一片。因此 1 只与 50 只股票的网络开销基本相同，真正决定开销的是**刷新频率**与**刷新时段**。
- **默认量级**：`refreshInterval` 默认 10 秒，即交易时段内约 6 次/分钟；单次响应为数十 KB 的 GBK 文本。
- **非交易时段近乎零开销**：开启 `enableRefreshTimeRange` 后（默认开启），时段外的自动刷新不会发起任何请求。
- **图表按需请求**：仅在打开图表面板、切换周期或手动刷新时才请求图表接口，面板关闭后不再请求。
- **内存有界**：异动检测的采样历史受 `anomalyWindowSeconds` 窗口约束并定期裁剪；股票被移出关注列表后其采样与冷却记录会被清理，长时间运行不会持续增长。
- **渲染开销可控**：状态栏最多渲染 `maxStatusBarItems` 个条目，超出部分自动隐藏。
- **完全静默**：关闭 `stockMonitor.autoRefresh` 后，只有手动刷新才会产生请求。

如需进一步降低开销，优先调大 `refreshInterval`、保留时段限制，并关闭不使用的功能开关。

---

## 已知限制

- **数据源为第三方公开接口**：无 SLA 与官方承诺，接口若变更或限流，插件可能暂时不可用；届时可配置自建代理（见「自定义 / 代理接口」）。
- **非实时行情**：数据存在秒级延迟，仅适合盯盘参考，不适合程序化交易。
- **字段可得性受市场限制**：换手率、量比、涨停 / 跌停价仅 A 股提供；港美股不含这些字段，因此**量比放量异动仅对 A 股生效**，港股不提供换手率（恒为 0）。
- **非交易时段行情不变化**：休市期间既不会刷新数据，预警与异动也不会触发。
- **异动检测精度受刷新间隔制约**：异动依赖轮询采样，若 `refreshInterval` 大于 `anomalyWindowSeconds`，观察窗口内不足以形成有效采样，检测将不生效，建议让刷新间隔明显小于观察窗口。
- **无原生「悬浮窗」API**：`chartPanelFloatMode` 的实现是「在侧边打开 Webview 且不主动抢占编辑器焦点」，是一种近似方案，仍会占用编辑器区域，并非系统级浮窗。
- **多窗口场景**：`settings.json` 为单一数据源，同时打开多个 VS Code 窗口并修改关注列表 / 持仓时，可能出现后写覆盖先写的现象。
- **暂未上架 Marketplace**：需通过 `.vsix` 手动安装（见「安装步骤」）。

---

## 免责声明

本插件仅用于学习与技术演示。所有行情数据均来自第三方公开接口，其准确性、完整性与及时性不作任何保证。**本插件不构成任何投资建议，使用者据此进行投资决策所产生的风险与损失由使用者自行承担。**

---

## 相关链接

**源码与反馈**

- [GitHub 仓库](https://github.com/FlyingCaiChong/cc-vscode-stock-monitor-extension)：插件源码与版本记录
- [问题反馈（Issues）](https://github.com/FlyingCaiChong/cc-vscode-stock-monitor-extension/issues)：提交 Bug 或功能建议

**项目内文档**

- [更新日志（CHANGELOG.md）](./CHANGELOG.md)：各版本变更与新增功能
- [开源协议（LICENSE.md）](./LICENSE.md)：MIT License
- [扩展清单（package.json）](./package.json)：全部配置项定义与默认值
- [安装步骤](#安装步骤)：`.vsix` 安装与开发模式运行

**外部参考文档**

- [VS Code 扩展开发文档](https://code.visualstudio.com/api)：Extension API、Webview、StatusBar 等
- [VS Code 设置参考](https://code.visualstudio.com/docs/getstarted/settings)：`settings.json` 使用说明

**数据来源**

- [腾讯财经行情接口](https://qt.gtimg.cn)：行情数据接口（默认 `stockMonitor.apiEndpoint`）
- [腾讯分时 / K 线接口](https://web.ifzq.gtimg.cn)：图表数据接口（默认 `stockMonitor.chartApiEndpoint`）
