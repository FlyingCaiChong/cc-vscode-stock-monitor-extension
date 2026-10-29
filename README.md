# Stock Monitor · VS Code 实时股票行情插件

在 VS Code **状态栏**与**资源管理器侧边栏**中实时监控 A 股 / 港股 / 美股行情。灵感来自 Stock Bar，支持自选股管理、收藏置顶、持仓收益、涨跌配色与丰富的自定义配置。

> 插件 ID：`stock-monitor.vscode-stock-monitor-extension`　版本：`1.1.0`

---

## 功能特性

| 功能 | 说明 |
| --- | --- |
| 状态栏实时行情 | 为每只关注股票创建一个状态栏项，持续展示代码 / 名称 / 最新价 / 涨跌幅等核心指标 |
| 自动轮询刷新 | 默认每 10 秒刷新，可在 5 ~ 300 秒之间配置；可通过 `stockMonitor.autoRefresh` 关闭定时刷新；网络抖动时自动降级展示上一次成功的行情 |
| 关注列表管理 | 资源管理器中的「股票关注列表」视图，支持添加、移除、收藏与一键刷新 |
| 收藏置顶 | 收藏的股票在状态栏与列表中优先展示 |
| **持仓收益** | 可为每只股票配置**别名、成本价、持仓数量**，实时计算**当日收益**与**持仓总收益**（含收益率与持仓市值） |
| **持仓汇总** | 自动汇总全部持仓的**当日参考盈亏**、**持仓总收益**与**持仓总市值**，并支持开关与文案自定义 |
| 多市场支持 | A 股（沪 / 深 / 北交所）、港股、美股代码智能识别与归一化 |
| 涨跌配色 | 上涨 / 下跌 / 平盘三态着色，支持 `greenUp` / `redUp` 两套方案、全局自定义颜色，以及单只股票颜色覆盖 |
| 悬浮明细 | 鼠标悬停即显示行情明细，配置持仓后追加成本价、持仓数量、当日收益与总收益 |
| 友好错误提示 | 针对代码无效、网络异常、请求超时、接口无数据等场景给出中文提示与排查指引 |
| 运行日志 | 全部请求与异常写入「Stock Monitor」输出通道，便于自助排查 |

---

## 安装步骤

### 方式一：通过 .vsix 安装包安装（推荐，适用于离线环境）

1. 获取安装包 `vscode-stock-monitor-extension-1.1.0.vsix`。
2. 打开 VS Code，按下 `Cmd/Ctrl + Shift + P` 打开命令面板。
3. 输入并选择 **Extensions: Install from VSIX...**（扩展：从 VSIX 安装）。
4. 选择 `.vsix` 文件，等待右下角提示安装完成。
5. 重新加载窗口（`Cmd/Ctrl + Shift + P` → **Developer: Reload Window**）。

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

---

## 使用方法

### 1. 状态栏

插件激活后（VS Code 启动完成即自动激活），状态栏会出现关注股票的行情，例如：

```
贵州茅台 1330.75 -1.85%      上证指数 3681.47 +0.91%
```

- **点击**任意状态栏项 → 立即刷新行情。
- **悬停** → 查看完整明细（涨跌额、今开、昨收、最高、最低、成交量、成交额、行情时间），配置持仓后额外展示成本价、持仓数量、持仓市值、当日收益与持仓总收益。
- 已配置持仓数量并拿到行情后，会额外显示一个**持仓汇总项**，用于展示全部持仓的当日参考盈亏；可通过 `stockMonitor.showPortfolioSummary` 控制开关，通过 `stockMonitor.portfolioSummaryLabel` 自定义文案。
- 关注列表为空时，显示占位项 `＋ 添加股票`，点击即可添加。

### 2. 持仓收益

为股票配置**别名、成本价、持仓数量**后，插件会在每一轮行情刷新时实时计算收益：

| 指标 | 计算公式 |
| --- | --- |
| 持仓市值 | 最新价 × 持仓数量 |
| **当日收益** | （最新价 − 昨收）× 持仓数量 |
| 当日收益率 | 即行情涨跌幅 |
| **持仓总收益** | （最新价 − 成本价）× 持仓数量 |
| 持仓收益率 | （最新价 − 成本价）÷ 成本价 × 100% |

配置方式有两种：

**方式一：命令面板（推荐）**

1. `Cmd/Ctrl + Shift + P` → 输入 **Stock Monitor: 设置持仓**；
2. 若未从列表右键触发，先选择要设置的股票；
3. 依次输入 `别名` → `成本价` → `持仓数量`（均可留空；三项全部留空即清除该股票的持仓配置）。

也可以直接在「股票关注列表」中**右键某只股票 → 设置持仓**。

**方式二：编辑 `settings.json`**

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

- 配置 `alias` 后，状态栏与列表中的名称统一替换为别名（状态栏需在 `displayFields` 中包含 `name` 字段）。
- 列表描述会追加当日收益：`茅台  1330.75  -1.86%  当日 -2,515.00`。
- 状态栏展示收益需在 `stockMonitor.displayFields` 中加入 `profit`（当日收益）或 `totalProfit`（持仓总收益），例如：

```jsonc
{
  "stockMonitor.displayFields": ["name", "price", "changePercent", "profit", "totalProfit"]
}
```

```
茅台 1330.75 -1.86% 当日 -2,515.00 总 +13,075.00
```

- 若至少有一只股票配置了 `shares` 且已获取行情，状态栏还会额外显示一个**持仓汇总项**，默认文案类似：

```text
参考盈亏 +1,234.56
```

- 汇总项悬浮提示会展示：
  - 纳入计算的持仓数量
  - 持仓总市值
  - 当日参考盈亏
  - 持仓总收益（仅统计配置了成本价的持仓）

> 说明：**只配置 `shares` 才会计算收益**；仅配置 `alias` / `costPrice` 时，别名与成本价照常展示，收益字段自动省略。成本价或数量为非法值（≤ 0、非数字）时会被自动忽略并在运行日志中提示。

### 3. 股票关注列表（侧边栏）

在「资源管理器（Explorer）」面板中找到 **股票关注列表**：

- 顶部工具栏：`立即刷新行情`、`添加股票`。
- 单项行内按钮：`收藏 / 取消收藏`、`设置持仓`、`移除股票`。
- 每行展示 `股票名称（或别名）  价格  涨跌幅%`，配置持仓后追加 `当日收益`；收藏项带 ⭐ 图标并置顶。

### 4. 命令列表

在命令面板（`Cmd/Ctrl + Shift + P`）输入 `Stock Monitor` 即可看到全部命令：

| 命令 | 标识 | 说明 |
| --- | --- | --- |
| 添加股票 | `stockMonitor.addStock` | 输入代码并校验真实性后加入关注列表 |
| 移除股票 | `stockMonitor.removeStock` | 从关注列表删除 |
| 收藏 / 取消收藏股票 | `stockMonitor.toggleFavorite` | 切换收藏状态，收藏项优先展示 |
| 设置持仓（别名 / 成本价 / 数量） | `stockMonitor.setPosition` | 可视化维护持仓配置，用于计算当日收益与持仓总收益 |
| 立即刷新行情 | `stockMonitor.refresh` | 手动触发一次刷新 |
| 显示运行日志 | `stockMonitor.showLogs` | 打开输出面板查看请求日志 |

### 5. 股票代码书写格式

添加股票时支持以下写法（大小写不敏感，可含空格）：

| 市场 | 支持写法 | 归一化结果 |
| --- | --- | --- |
| A 股（沪） | `600519`、`sh600519`、`600519.SH`、`600519.SS`、`sh.600519` | `sh600519` |
| A 股（深） | `000001`、`sz000001`、`000001.SZ` | `sz000001` |
| A 股（北交所） | `830799`、`bj830799` | `bj830799` |
| 港股 | `700`、`00700`、`hk00700`、`0700.HK` | `hk00700` |
| 美股 | `AAPL`、`us.AAPL`、`AAPL.OQ`、`NASDAQ:AAPL` | `usAAPL` |

**规则说明**

- 纯 6 位数字按 A 股处理，交易所由首位推断：`6/9/5/7` → 沪市，`0/1/2/3` → 深市，`4/8` → 北交所。
- 纯 1 ~ 5 位数字按港股处理，不足 5 位自动补零（`700` → `00700`）。
- 纯字母（长度 ≤ 5，允许 `.` 与 `-`）按美股处理，自动转大写。
- ⚠️ `000001` 无前缀时按**深市个股（平安银行）**处理；需要**上证指数**请显式写 `sh000001`。
- ⚠️ 无分隔符的字母前缀写法 `usAAPL` **不予识别**（`USB` 本身就是真实美股代码，存在歧义），请改用 `us.AAPL` 或直接输入 `AAPL`。

---

## 插件配置

在 **设置**（`Cmd/Ctrl + ,`）中搜索 `Stock Monitor`，或直接编辑 `settings.json`：

```jsonc
{
  "stockMonitor.refreshInterval": 10,
  "stockMonitor.autoRefresh": true,
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

| 配置项 | 类型 | 默认值 | 取值范围 | 说明 |
| --- | --- | --- | --- | --- |
| `stockMonitor.refreshInterval` | number | `10` | 5 ~ 300 | 自动刷新间隔（秒）。过小会加重网络与接口负担 |
| `stockMonitor.autoRefresh` | boolean | `true` | `true` / `false` | 是否开启定时自动刷新行情。关闭后不再定时调用行情接口，点击状态栏项或执行「立即刷新行情」仍可手动刷新 |
| `stockMonitor.statusBarAlignment` | string | `left` | `left` / `right` | 状态栏停靠位置 |
| `stockMonitor.statusBarPriority` | number | `100` | — | 状态栏优先级，数值越大越靠前；多只股票按关注顺序依次递减 |
| `stockMonitor.maxStatusBarItems` | number | `6` | 1 ~ 20 | 状态栏最多展示的股票数量，收藏项优先 |
| `stockMonitor.showPortfolioSummary` | boolean | `true` | `true` / `false` | 是否展示全部持仓的状态栏汇总项 |
| `stockMonitor.portfolioSummaryLabel` | string | `参考盈亏` | — | 持仓汇总状态栏项的文案前缀，如 `参考盈亏` / `总当日盈亏` |
| `stockMonitor.displayFields` | array | `["name","price","changePercent"]` | 见下表 | 状态栏展示字段及顺序（仅影响状态栏，悬浮提示始终展示完整明细） |
| `stockMonitor.colorScheme` | string | `greenUp` | `greenUp` / `redUp` | 涨跌配色方案，平盘统一为灰色 |
| `stockMonitor.upColor` | string | `""` | 十六进制颜色 | 全局上涨颜色；留空时回退到 `colorScheme` |
| `stockMonitor.downColor` | string | `""` | 十六进制颜色 | 全局下跌颜色；留空时回退到 `colorScheme` |
| `stockMonitor.stockColors` | array | `[]` | — | 单只股票颜色覆盖，元素为 `{ code, upColor?, downColor? }` |
| `stockMonitor.decimals` | number | `2` | 0 ~ 4 | 价格保留小数位数 |
| `stockMonitor.apiEndpoint` | string | `https://qt.gtimg.cn` | — | 行情接口地址，可替换为自建或第三方代理 |
| `stockMonitor.requestTimeout` | number | `5000` | 1000 ~ 30000 | 单次请求超时（毫秒） |
| `stockMonitor.watchList` | array | `["sh000001","sz399001","sh600519"]` | — | 关注列表主配置；命令面板/侧边栏中的增删操作会同步写回 `settings.json` |
| `stockMonitor.positions` | array | `[]` | — | 持仓配置，元素为 `{ code, alias?, costPrice?, shares? }`；命令 `stockMonitor.setPosition` 会同步写回 `settings.json` |

`displayFields` 可用字段：

| 字段 | 含义 | 状态栏展示效果 |
| --- | --- | --- |
| `name` | 股票名称（配置别名后展示别名） | `贵州茅台` / `茅台` |
| `code` | 股票代码 | `600519` |
| `price` | 最新价 | `1330.75` |
| `change` | 涨跌额 | `-25.15` |
| `changePercent` | 涨跌幅 | `-1.85%` |
| `profit` | 当日收益（需配置 `shares`） | `当日 -2,515.00` |
| `totalProfit` | 持仓总收益（需配置 `shares` 与 `costPrice`） | `总 +13,075.00` |
| `high` / `low` | 最高 / 最低 | `高 1354.98` / `低 1322.60` |
| `open` / `prevClose` | 今开 / 昨收 | `开 1350.00` / `昨 1355.90` |
| `volume` | 成交量 | `388.05万股` |
| `turnover` | 成交额 | `51.72亿元` |
| `time` | 行情时间 | `16:14:54` |

### 涨跌配色说明

项目需求描述为「上涨绿色、下跌红色」，同时要求「符合国内投资者使用习惯」（国内实为**红涨绿跌**）。为兼顾两者，插件提供 `colorScheme` 开关：

- `greenUp`（**默认**）：上涨 🟢 绿色、下跌 🔴 红色 —— 国际市场惯例。
- `redUp`：上涨 🔴 红色、下跌 🟢 绿色 —— A 股投资者习惯。

平盘两种情况均显示为灰色。配色使用 VS Code 主题色（`charts.green` / `charts.red` / `descriptionForeground`），会自动适配浅色与深色主题。

除此之外，还支持两层自定义颜色：

1. **全局颜色**

```jsonc
{
  "stockMonitor.upColor": "#22c55e",
  "stockMonitor.downColor": "#ef4444"
}
```

2. **单只股票覆盖**

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

---

## 行情 API 说明

### 使用接口

默认对接**腾讯财经行情接口**（公开、免密钥、支持批量查询）：

```
GET https://qt.gtimg.cn/q=sh600519,hk00700,usAAPL
```

### 请求要点

- **批量查询**：多个代码以英文逗号分隔，单次最多 50 个（超出会自动分片请求）。
- **编码**：响应为 **GBK** 编码，插件使用 `iconv-lite` 转码为 UTF-8 以避免中文乱码。
- **请求头**：携带浏览器 `User-Agent` 与 `Referer: https://gu.qq.com/`，降低被风控拦截的概率。
- **超时**：默认 5 秒，超时会主动销毁连接避免挂起，并按 `TIMEOUT` 错误处理。
- **重定向**：最多跟随 3 层。

### 响应字段（`~` 分隔，各市场下标一致）

| 下标 | 含义 | 下标 | 含义 |
| --- | --- | --- | --- |
| 1 | 名称 | 30 | 行情时间 |
| 2 | 代码 | 31 | 涨跌额 |
| 3 | 最新价 | 32 | 涨跌幅（%） |
| 4 | 昨收 | 33 | 最高 |
| 5 | 今开 | 34 | 最低 |
| — | — | 36 | 成交量 |
| — | — | 37 | 成交额 |

**单位换算**：A 股成交量原始单位为「手」（×100 得股数）、成交额为「万元」（×10000 得元）；港股与美股已分别是「股」与「元」，无需换算。插件内部统一换算为「股 / 元」后再格式化展示。

**时间格式**：A 股为 `20261028161454`（紧凑 14 位），港美股为 `2026/10/28 16:08:30` 或 `2026-10-28 16:00:01`，插件统一归一化为 `HH:mm:ss`。

### 自定义 / 代理接口

若默认地址不可用（如内网限制、接口变更），可配置 `stockMonitor.apiEndpoint` 指向自建反向代理。要求代理：

1. 接受 `GET {endpoint}/q=code1,code2` 形式的路径；
2. 返回与腾讯接口一致的 `v_xxx="...";` 文本格式；
3. **必须保持 GBK 编码**：插件固定按 GBK 解码，若代理返回 UTF-8，中文名称会出现乱码。
   （若确实需要 UTF-8，可修改 `src/market/tencentProvider.ts` 中的 `iconv.decode(..., 'gbk')` 为 `'utf-8'` 后重新打包。）

---

## 常见问题排查（FAQ）

### Q1：状态栏没有出现行情数据？

1. 确认已关注至少一只股票：打开「股票关注列表」，若为空点击 `＋ 添加股票`。
2. 确认状态栏项未被隐藏：VS Code 状态栏中右键 → 检查 `Stock Monitor: xxx` 是否被取消勾选。
3. 检查 `stockMonitor.statusBarAlignment` 与 `statusBarPriority` 配置是否将其挤到不易察觉的位置。
4. 打开命令面板执行 **Stock Monitor: 显示运行日志**，查看输出通道中的请求记录。

### Q2：提示「网络请求失败」/「行情请求超时」？

- 检查本机网络与代理设置，确认可访问 `https://qt.gtimg.cn`。
- 若处于企业内网，可能需要配置 `http.proxy` 或改用自建代理并设置 `stockMonitor.apiEndpoint`。
- 适当调大 `stockMonitor.requestTimeout`（最大 30000 毫秒）。
- 网络抖动时插件会**自动降级展示上一次成功获取的行情**，不会直接清空数据；状态栏项临时显示 `--` 表示该代码本次无返回。

### Q3：提示「无法识别的股票代码」？

- 核对代码格式，参考上文「股票代码书写格式」。
- A 股为 6 位数字，港股不超过 5 位，美股不超过 5 个字母。
- 需要上证指数请写 `sh000001`；直接写 `000001` 会被识别为深市平安银行。

### Q4：提示「行情接口未返回任何有效数据」？

通常是**代码不存在、已退市或处于停牌状态**。插件在添加股票前会做一次真实探测，探测失败会明确提示且不会加入列表。

### Q5：中文名称显示为乱码？

说明代理/接口返回的不是 GBK 编码。请让代理保持 GBK 原样透传（推荐），或确保返回文本中的中文可被 GBK 正确解码。

### Q6：如何降低资源占用？

- 调大 `stockMonitor.refreshInterval`（如 30 ~ 60 秒）。
- 调小 `stockMonitor.maxStatusBarItems`。
- 减少关注列表数量。

### Q7：状态栏 / 列表没有显示收益？

1. 确认已在该股票的持仓配置中填写 **`shares`（持仓数量）** —— 只有配置持仓数量才会计算收益。
2. 状态栏需在 `stockMonitor.displayFields` 中加入 `profit` / `totalProfit`；「持仓总收益」还需要配置 `costPrice`。
3. 检查 `stockMonitor.positions` 中的代码能否被正确识别（参考「股票代码书写格式」）。
4. 打开 **Stock Monitor: 显示运行日志**，若配置中存在非法条目（数量 ≤ 0、代码无法识别等），日志中会给出具体原因。

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
├── position.ts               # 持仓收益计算与配置归一化（纯函数）
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

- **纯函数与副作用分离**：`stockCode` / `quoteParser` / `format` / `position` 四个模块不依赖 `vscode`，可直接用普通 mocha 测试（`npm run test:unit`）。
- **缓存降级**：`QuoteService` 保留最近一次成功数据；请求失败时降级返回缓存，避免界面闪白。
- **请求防堆积**：控制器使用 `refreshing` 标记，上一轮未返回时不重复发起请求。
- **错误去重**：轮询期间的同类错误只写日志不弹窗，避免持续打扰用户。
- **配置文件为主数据源**：`watchList` / `positions` 以 `settings.json` 为准，用户手动编辑配置后界面会自动同步。
- **持仓配置容错**：`position.normalizePositions` 逐条校验用户配置，非法条目只记录日志并跳过，不会导致插件异常。

---

## 性能开销说明

- 每轮刷新仅发起 **一次** HTTP 请求（关注列表超过 50 只时才分片）。
- 状态栏项数量上限由 `maxStatusBarItems` 控制（默认 6），且实例被复用而非反复创建。
- 无行情或插件未激活时不创建 `OutputChannel` 等资源。
- 在默认配置（3 只股票、10 秒间隔）下，网络流量与 CPU 占用可忽略不计，不影响编辑器正常使用。

---

## 已知限制

- 行情数据来自公开接口，存在秒级延迟，**非交易所 Level-1 实时行情**。
- A 股 `000001` 等存在「指数 / 个股」同码的情况，需用显式前缀区分。
- 无分隔符的字母前缀写法（如 `usAAPL`）因存在歧义而不被识别。

---

## 免责声明

本插件仅用于学习与技术演示。所有行情数据均来自第三方公开接口，其准确性、完整性与及时性不作任何保证。**本插件不构成任何投资建议，使用者据此进行投资决策所产生的风险与损失由使用者自行承担。**

---

## 相关链接

- [VS Code 扩展 API 文档](https://code.visualstudio.com/api)
- [扩展开发指南](https://code.visualstudio.com/api/references/extension-guidelines)
- [腾讯财经行情接口](https://gu.qq.com/)
