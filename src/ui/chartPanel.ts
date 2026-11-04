import * as vscode from 'vscode';
import { CHART_PERIOD_LABEL, ChartPeriod, StockChartData } from '../chart';
import { logger } from '../logger';
import { StockCode } from '../types';

/** 面板向扩展主线程发送的消息 */
type PanelMessage =
  | { type: 'ready' }
  | { type: 'switchPeriod'; period: ChartPeriod }
  | { type: 'refresh' };

/** 图表加载器：由控制器注入，负责真正请求远端接口 */
type ChartLoader = (stock: StockCode, period: ChartPeriod) => Promise<StockChartData>;

/** 查看图表的 Webview 面板 */
export class ChartPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;

  private ready = false;

  private currentStock: StockCode | undefined;

  private currentDisplayName = '';

  private currentPeriod: ChartPeriod = 'intraday';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly loadChart: ChartLoader,
  ) {
    void this.extensionUri;
  }

  /** 打开或复用图表面板 */
  show(stock: StockCode, displayName: string): void {
    this.currentStock = stock;
    this.currentDisplayName = displayName;
    this.ensurePanel();
    this.panel?.reveal(vscode.ViewColumn.Active);
    this.updateTitle();
    if (this.ready) {
      void this.loadCurrentChart();
    }
  }

  /** 行情刷新后，若图表面板还开着，则同步刷新当前图表 */
  async refreshVisible(): Promise<void> {
    if (!this.panel || !this.ready || !this.currentStock) {
      return;
    }
    await this.loadCurrentChart();
  }

  private ensurePanel(): void {
    if (this.panel) {
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'stockMonitorChart',
      '股票图表',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );
    this.ready = false;
    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.ready = false;
    });

    this.panel.webview.onDidReceiveMessage((message: PanelMessage) => {
      void this.handleMessage(message);
    });
  }

  private async handleMessage(message: PanelMessage): Promise<void> {
    try {
      if (message.type === 'ready') {
        this.ready = true;
        this.postState();
        await this.loadCurrentChart();
        return;
      }

      if (message.type === 'switchPeriod') {
        this.currentPeriod = message.period;
        await this.loadCurrentChart();
        return;
      }

      if (message.type === 'refresh') {
        await this.loadCurrentChart();
      }
    } catch (err) {
      logger.error('处理图表面板消息失败', err);
    }
  }

  /** 把当前股票与周期同步给 Webview，保证顶部状态及时更新 */
  private postState(): void {
    if (!this.panel || !this.currentStock) {
      return;
    }
    void this.panel.webview.postMessage({
      type: 'state',
      stock: {
        key: this.currentStock.key,
        code: this.currentStock.code,
        market: this.currentStock.market,
        displayName: this.currentDisplayName || this.currentStock.code,
      },
      period: this.currentPeriod,
      periodLabel: CHART_PERIOD_LABEL[this.currentPeriod],
    });
  }

  /** 加载当前股票 + 当前周期的图表数据 */
  private async loadCurrentChart(): Promise<void> {
    if (!this.panel || !this.currentStock) {
      return;
    }

    this.postState();
    void this.panel.webview.postMessage({
      type: 'loading',
      period: this.currentPeriod,
      message: `正在加载${CHART_PERIOD_LABEL[this.currentPeriod]}...`,
    });

    try {
      const data = await this.loadChart(this.currentStock, this.currentPeriod);
      void this.panel.webview.postMessage({
        type: 'chartData',
        data,
        displayName: this.currentDisplayName || data.name,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      logger.error(`加载图表失败：${this.currentStock.key} ${this.currentPeriod}`, err);
      void this.panel.webview.postMessage({
        type: 'error',
        message: `加载${CHART_PERIOD_LABEL[this.currentPeriod]}失败：${message}`,
      });
    }
  }

  private updateTitle(): void {
    if (!this.panel || !this.currentStock) {
      return;
    }
    const name = this.currentDisplayName || this.currentStock.code;
    this.panel.title = `${name} 图表`;
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: data:`,
      "style-src 'unsafe-inline'",
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>股票图表</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        padding: 16px;
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
      }
      .shell {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }
      .stock-meta {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 220px;
      }
      .stock-name {
        font-size: 18px;
        font-weight: 600;
      }
      .stock-subtitle {
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
      }
      .tabs {
        display: inline-flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .tab,
      .action-button {
        border: 1px solid var(--vscode-input-border, transparent);
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border-radius: 6px;
        padding: 6px 12px;
        cursor: pointer;
      }
      .tab.active {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }
      .content {
        border: 1px solid var(--vscode-panel-border);
        border-radius: 8px;
        background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-foreground) 8%);
        padding: 12px;
      }
      .status {
        min-height: 20px;
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
        margin-bottom: 8px;
      }
      .status.error {
        color: var(--vscode-errorForeground);
      }
      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 8px;
        margin-bottom: 12px;
      }
      .summary-card {
        border: 1px solid var(--vscode-panel-border);
        border-radius: 6px;
        padding: 8px 10px;
        background: var(--vscode-editor-background);
      }
      .summary-label {
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
        margin-bottom: 4px;
      }
      .summary-value {
        font-size: 14px;
        font-weight: 600;
      }
      .canvas-wrap {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      canvas {
        width: 100%;
        display: block;
        border-radius: 6px;
        background: var(--vscode-editor-background);
      }
      #priceCanvas {
        height: 360px;
      }
      #volumeCanvas {
        height: 140px;
      }
      .empty {
        padding: 48px 12px;
        text-align: center;
        color: var(--vscode-descriptionForeground);
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="toolbar">
        <div class="stock-meta">
          <div id="stockName" class="stock-name">股票图表</div>
          <div id="stockSubtitle" class="stock-subtitle">请选择股票查看图表</div>
        </div>
        <div class="tabs">
          <button class="tab active" data-period="intraday">分时图</button>
          <button class="tab" data-period="daily">日K图</button>
          <button class="tab" data-period="weekly">周K图</button>
          <button class="tab" data-period="monthly">月K图</button>
          <button id="refreshButton" class="action-button" type="button">刷新图表</button>
        </div>
      </div>
      <div class="content">
        <div id="status" class="status"></div>
        <div id="summary" class="summary"></div>
        <div id="empty" class="empty">正在等待图表数据...</div>
        <div id="canvasWrap" class="canvas-wrap" style="display:none;">
          <canvas id="priceCanvas"></canvas>
          <canvas id="volumeCanvas"></canvas>
        </div>
      </div>
    </div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const state = {
        stock: undefined,
        period: 'intraday',
        displayName: '',
        data: undefined,
        status: '正在初始化图表面板...',
        error: '',
      };

      const tabButtons = Array.from(document.querySelectorAll('.tab'));
      const refreshButton = document.getElementById('refreshButton');
      const stockNameEl = document.getElementById('stockName');
      const stockSubtitleEl = document.getElementById('stockSubtitle');
      const statusEl = document.getElementById('status');
      const summaryEl = document.getElementById('summary');
      const emptyEl = document.getElementById('empty');
      const canvasWrapEl = document.getElementById('canvasWrap');
      const priceCanvas = document.getElementById('priceCanvas');
      const volumeCanvas = document.getElementById('volumeCanvas');

      function setActivePeriod(period) {
        tabButtons.forEach(function(button) {
          button.classList.toggle('active', button.dataset.period === period);
        });
      }

      function resizeCanvas(canvas) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return {
          ctx: ctx,
          width: rect.width,
          height: rect.height,
        };
      }

      function gridLineColor() {
        return 'rgba(127, 127, 127, 0.28)';
      }

      function textColor() {
        return getComputedStyle(document.body).getPropertyValue('--vscode-foreground').trim() || '#d4d4d4';
      }

      function subtleColor() {
        return getComputedStyle(document.body).getPropertyValue('--vscode-descriptionForeground').trim() || '#999';
      }

      function backgroundColor() {
        return getComputedStyle(document.body).getPropertyValue('--vscode-editor-background').trim() || '#1e1e1e';
      }

      function formatNumber(value, decimals) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return '--';
        }
        return value.toFixed(decimals);
      }

      function formatVolume(value) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
          return '--';
        }
        if (value >= 100000000) {
          return (value / 100000000).toFixed(2) + '亿股';
        }
        if (value >= 10000) {
          return (value / 10000).toFixed(2) + '万股';
        }
        return value.toFixed(0) + '股';
      }

      function priceColor(isUp) {
        return isUp ? '#ff4d4f' : '#22a06b';
      }

      function renderStatus() {
        statusEl.textContent = state.error || state.status || '';
        statusEl.classList.toggle('error', Boolean(state.error));
      }

      function renderHeader() {
        const name = state.displayName || (state.data && state.data.name) || '股票图表';
        stockNameEl.textContent = name;
        if (!state.stock) {
          stockSubtitleEl.textContent = '请选择股票查看分时图 / 日K图 / 周K图 / 月K图';
          return;
        }
        const updatedAt = state.data && state.data.updatedAt ? ' · ' + state.data.updatedAt : '';
        stockSubtitleEl.textContent = state.stock.market.toUpperCase() + ' · ' + state.stock.code + updatedAt;
      }

      function renderSummary() {
        summaryEl.innerHTML = '';
        if (!state.data || !Array.isArray(state.data.points) || state.data.points.length === 0) {
          return;
        }

        const points = state.data.points;
        if (state.data.period === 'intraday') {
          const last = points[points.length - 1];
          const cards = [
            ['最新价', formatNumber(last.price, state.data.priceDecimals)],
            ['均价', formatNumber(last.averagePrice, state.data.priceDecimals)],
            ['昨收', formatNumber(state.data.previousClose, state.data.priceDecimals)],
            ['成交量', formatVolume(last.volume)],
          ];
          cards.forEach(function(pair) {
            const card = document.createElement('div');
            card.className = 'summary-card';
            card.innerHTML =
              '<div class="summary-label">' +
              pair[0] +
              '</div><div class="summary-value">' +
              pair[1] +
              '</div>';
            summaryEl.appendChild(card);
          });
          return;
        }

        const last = points[points.length - 1];
        const cards = [
          ['开盘', formatNumber(last.open, state.data.priceDecimals)],
          ['收盘', formatNumber(last.close, state.data.priceDecimals)],
          ['最高', formatNumber(last.high, state.data.priceDecimals)],
          ['最低', formatNumber(last.low, state.data.priceDecimals)],
          ['成交量', formatVolume(last.volume)],
        ];
        cards.forEach(function(pair) {
          const card = document.createElement('div');
          card.className = 'summary-card';
          card.innerHTML =
            '<div class="summary-label">' +
            pair[0] +
            '</div><div class="summary-value">' +
            pair[1] +
            '</div>';
          summaryEl.appendChild(card);
        });
      }

      function drawGrid(ctx, width, height, padding, rows, cols) {
        const plotWidth = width - padding.left - padding.right;
        const plotHeight = height - padding.top - padding.bottom;
        ctx.save();
        ctx.strokeStyle = gridLineColor();
        ctx.lineWidth = 1;
        for (let i = 0; i <= rows; i += 1) {
          const y = padding.top + (plotHeight / rows) * i;
          ctx.beginPath();
          ctx.moveTo(padding.left, y);
          ctx.lineTo(width - padding.right, y);
          ctx.stroke();
        }
        for (let i = 0; i <= cols; i += 1) {
          const x = padding.left + (plotWidth / cols) * i;
          ctx.beginPath();
          ctx.moveTo(x, padding.top);
          ctx.lineTo(x, height - padding.bottom);
          ctx.stroke();
        }
        ctx.restore();
      }

      function drawAxisLabels(ctx, labels, width, height, padding) {
        if (!labels.length) {
          return;
        }
        ctx.save();
        ctx.fillStyle = subtleColor();
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const plotWidth = width - padding.left - padding.right;
        const steps = Math.min(5, labels.length - 1);
        for (let i = 0; i <= steps; i += 1) {
          const index = Math.round((labels.length - 1) * (i / steps));
          const x = padding.left + (plotWidth * index) / Math.max(1, labels.length - 1);
          ctx.fillText(labels[index], x, height - padding.bottom + 6);
        }
        ctx.restore();
      }

      function renderIntraday() {
        const priceLayer = resizeCanvas(priceCanvas);
        const volumeLayer = resizeCanvas(volumeCanvas);
        const points = state.data.points;
        const priceCtx = priceLayer.ctx;
        const volumeCtx = volumeLayer.ctx;
        const padding = { top: 16, right: 52, bottom: 24, left: 52 };

        priceCtx.clearRect(0, 0, priceLayer.width, priceLayer.height);
        volumeCtx.clearRect(0, 0, volumeLayer.width, volumeLayer.height);
        drawGrid(priceCtx, priceLayer.width, priceLayer.height, padding, 4, 4);
        drawGrid(volumeCtx, volumeLayer.width, volumeLayer.height, padding, 2, 4);

        const prices = points.map(function(point) { return point.price; });
        const avgPrices = points.map(function(point) { return point.averagePrice; });
        const previousClose = state.data.previousClose || prices[0];
        const maxDeviation = Math.max(
          Math.abs(Math.max.apply(null, prices.concat(avgPrices)) - previousClose),
          Math.abs(previousClose - Math.min.apply(null, prices.concat(avgPrices)))
        ) || previousClose * 0.02 || 1;
        const maxPrice = previousClose + maxDeviation * 1.08;
        const minPrice = previousClose - maxDeviation * 1.08;
        const plotWidth = priceLayer.width - padding.left - padding.right;
        const plotHeight = priceLayer.height - padding.top - padding.bottom;

        function xOf(index) {
          return padding.left + (plotWidth * index) / Math.max(1, points.length - 1);
        }

        function yOf(price) {
          return padding.top + ((maxPrice - price) / Math.max(0.000001, maxPrice - minPrice)) * plotHeight;
        }

        priceCtx.save();
        priceCtx.strokeStyle = 'rgba(53, 132, 228, 1)';
        priceCtx.lineWidth = 2;
        priceCtx.beginPath();
        points.forEach(function(point, index) {
          const x = xOf(index);
          const y = yOf(point.price);
          if (index === 0) {
            priceCtx.moveTo(x, y);
          } else {
            priceCtx.lineTo(x, y);
          }
        });
        priceCtx.stroke();

        priceCtx.strokeStyle = 'rgba(255, 170, 0, 0.95)';
        priceCtx.lineWidth = 1.5;
        priceCtx.beginPath();
        points.forEach(function(point, index) {
          const x = xOf(index);
          const y = yOf(point.averagePrice);
          if (index === 0) {
            priceCtx.moveTo(x, y);
          } else {
            priceCtx.lineTo(x, y);
          }
        });
        priceCtx.stroke();

        const prevY = yOf(previousClose);
        priceCtx.setLineDash([4, 4]);
        priceCtx.strokeStyle = 'rgba(200, 200, 200, 0.65)';
        priceCtx.beginPath();
        priceCtx.moveTo(padding.left, prevY);
        priceCtx.lineTo(priceLayer.width - padding.right, prevY);
        priceCtx.stroke();
        priceCtx.setLineDash([]);

        priceCtx.fillStyle = subtleColor();
        priceCtx.font = '12px sans-serif';
        priceCtx.textAlign = 'left';
        priceCtx.textBaseline = 'middle';
        for (let i = 0; i <= 4; i += 1) {
          const price = maxPrice - ((maxPrice - minPrice) * i) / 4;
          const y = padding.top + (plotHeight * i) / 4;
          priceCtx.fillText(formatNumber(price, state.data.priceDecimals), 6, y);
        }
        priceCtx.restore();

        drawAxisLabels(priceCtx, points.map(function(point) { return point.time; }), priceLayer.width, priceLayer.height, padding);

        const maxVolume = Math.max.apply(null, points.map(function(point) { return point.volume; })) || 1;
        const volumePlotWidth = volumeLayer.width - padding.left - padding.right;
        const volumePlotHeight = volumeLayer.height - padding.top - padding.bottom;
        volumeCtx.save();
        points.forEach(function(point, index) {
          const x = padding.left + (volumePlotWidth * index) / Math.max(1, points.length - 1);
          const barWidth = Math.max(1, volumePlotWidth / Math.max(points.length, 120) * 0.8);
          const barHeight = (point.volume / maxVolume) * volumePlotHeight;
          const isUp = point.price >= previousClose;
          volumeCtx.fillStyle = isUp ? 'rgba(255, 77, 79, 0.55)' : 'rgba(34, 160, 107, 0.55)';
          volumeCtx.fillRect(x - barWidth / 2, volumeLayer.height - padding.bottom - barHeight, barWidth, barHeight);
        });
        volumeCtx.fillStyle = subtleColor();
        volumeCtx.font = '12px sans-serif';
        volumeCtx.textAlign = 'left';
        volumeCtx.fillText(formatVolume(maxVolume), 6, padding.top + 6);
        volumeCtx.restore();
        drawAxisLabels(volumeCtx, points.map(function(point) { return point.time; }), volumeLayer.width, volumeLayer.height, padding);
      }

      function renderKline() {
        const priceLayer = resizeCanvas(priceCanvas);
        const volumeLayer = resizeCanvas(volumeCanvas);
        const priceCtx = priceLayer.ctx;
        const volumeCtx = volumeLayer.ctx;
        const points = state.data.points;
        const padding = { top: 16, right: 18, bottom: 24, left: 52 };
        priceCtx.clearRect(0, 0, priceLayer.width, priceLayer.height);
        volumeCtx.clearRect(0, 0, volumeLayer.width, volumeLayer.height);
        drawGrid(priceCtx, priceLayer.width, priceLayer.height, padding, 4, 4);
        drawGrid(volumeCtx, volumeLayer.width, volumeLayer.height, padding, 2, 4);

        const highs = points.map(function(point) { return point.high; });
        const lows = points.map(function(point) { return point.low; });
        const maxPrice = Math.max.apply(null, highs) * 1.01;
        const minPrice = Math.min.apply(null, lows) * 0.99;
        const plotWidth = priceLayer.width - padding.left - padding.right;
        const plotHeight = priceLayer.height - padding.top - padding.bottom;
        const candleGap = plotWidth / Math.max(points.length, 1);
        const candleWidth = Math.max(2, Math.min(12, candleGap * 0.68));

        function xOf(index) {
          return padding.left + candleGap * index + candleGap / 2;
        }

        function yOf(price) {
          return padding.top + ((maxPrice - price) / Math.max(0.000001, maxPrice - minPrice)) * plotHeight;
        }

        priceCtx.save();
        priceCtx.lineWidth = 1;
        points.forEach(function(point, index) {
          const x = xOf(index);
          const isUp = point.close >= point.open;
          const color = priceColor(isUp);
          const openY = yOf(point.open);
          const closeY = yOf(point.close);
          const highY = yOf(point.high);
          const lowY = yOf(point.low);
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(1, Math.abs(closeY - openY));

          priceCtx.strokeStyle = color;
          priceCtx.beginPath();
          priceCtx.moveTo(x, highY);
          priceCtx.lineTo(x, lowY);
          priceCtx.stroke();

          if (isUp) {
            priceCtx.fillStyle = 'rgba(255, 77, 79, 0.18)';
            priceCtx.strokeStyle = color;
            priceCtx.strokeRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
            priceCtx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
          } else {
            priceCtx.fillStyle = color;
            priceCtx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
          }
        });

        priceCtx.fillStyle = subtleColor();
        priceCtx.font = '12px sans-serif';
        priceCtx.textAlign = 'left';
        priceCtx.textBaseline = 'middle';
        for (let i = 0; i <= 4; i += 1) {
          const price = maxPrice - ((maxPrice - minPrice) * i) / 4;
          const y = padding.top + (plotHeight * i) / 4;
          priceCtx.fillText(formatNumber(price, state.data.priceDecimals), 6, y);
        }
        priceCtx.restore();

        drawAxisLabels(
          priceCtx,
          points.map(function(point) { return point.time; }),
          priceLayer.width,
          priceLayer.height,
          padding
        );

        const maxVolume = Math.max.apply(null, points.map(function(point) { return point.volume; })) || 1;
        const volumePlotWidth = volumeLayer.width - padding.left - padding.right;
        const volumePlotHeight = volumeLayer.height - padding.top - padding.bottom;
        volumeCtx.save();
        points.forEach(function(point, index) {
          const x = padding.left + (volumePlotWidth * index) / Math.max(points.length, 1) + candleGap / 2;
          const isUp = point.close >= point.open;
          const barHeight = (point.volume / maxVolume) * volumePlotHeight;
          volumeCtx.fillStyle = isUp ? 'rgba(255, 77, 79, 0.55)' : 'rgba(34, 160, 107, 0.55)';
          volumeCtx.fillRect(x - candleWidth / 2, volumeLayer.height - padding.bottom - barHeight, candleWidth, barHeight);
        });
        volumeCtx.fillStyle = subtleColor();
        volumeCtx.font = '12px sans-serif';
        volumeCtx.textAlign = 'left';
        volumeCtx.fillText(formatVolume(maxVolume), 6, padding.top + 6);
        volumeCtx.restore();
        drawAxisLabels(
          volumeCtx,
          points.map(function(point) { return point.time; }),
          volumeLayer.width,
          volumeLayer.height,
          padding
        );
      }

      function renderChart() {
        if (!state.data || !Array.isArray(state.data.points) || state.data.points.length === 0) {
          emptyEl.style.display = 'block';
          canvasWrapEl.style.display = 'none';
          emptyEl.textContent = state.error || state.status || '暂无可展示的数据';
          return;
        }
        emptyEl.style.display = 'none';
        canvasWrapEl.style.display = 'flex';
        if (state.data.period === 'intraday') {
          renderIntraday();
        } else {
          renderKline();
        }
      }

      function renderAll() {
        setActivePeriod(state.period);
        renderHeader();
        renderStatus();
        renderSummary();
        renderChart();
      }

      window.addEventListener('message', function(event) {
        const message = event.data || {};
        if (message.type === 'state') {
          state.stock = message.stock;
          state.displayName = message.stock ? message.stock.displayName : '';
          state.period = message.period;
          renderAll();
          return;
        }
        if (message.type === 'loading') {
          state.error = '';
          state.status = message.message || '正在加载图表...';
          renderAll();
          return;
        }
        if (message.type === 'chartData') {
          state.error = '';
          state.status = '';
          state.displayName = message.displayName || state.displayName;
          state.data = message.data;
          state.period = message.data.period;
          renderAll();
          return;
        }
        if (message.type === 'error') {
          state.error = message.message || '图表加载失败';
          state.status = '';
          state.data = undefined;
          renderAll();
        }
      });

      tabButtons.forEach(function(button) {
        button.addEventListener('click', function() {
          const nextPeriod = button.dataset.period;
          if (!nextPeriod || nextPeriod === state.period) {
            return;
          }
          state.period = nextPeriod;
          setActivePeriod(nextPeriod);
          vscode.postMessage({ type: 'switchPeriod', period: nextPeriod });
        });
      });

      refreshButton.addEventListener('click', function() {
        vscode.postMessage({ type: 'refresh' });
      });

      window.addEventListener('resize', function() {
        if (state.data) {
          renderChart();
        }
      });

      vscode.postMessage({ type: 'ready' });
    </script>
  </body>
</html>`;
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
    this.ready = false;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
