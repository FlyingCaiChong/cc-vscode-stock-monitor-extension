import * as vscode from 'vscode';

/**
 * 极简日志封装：统一输出到 VS Code 的 OutputChannel（视图 → 输出 → Stock Monitor）。
 * 用户可通过命令「显示运行日志」查看，便于排查 API 失败等问题。
 */
class Logger {
  private channel: vscode.OutputChannel | undefined;

  /** 延迟创建 OutputChannel，避免扩展未激活时占用资源 */
  private get output(): vscode.OutputChannel {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel('Stock Monitor');
    }
    return this.channel;
  }

  info(message: string): void {
    this.output.appendLine(`[INFO  ${timestamp()}] ${message}`);
  }

  warn(message: string): void {
    this.output.appendLine(`[WARN  ${timestamp()}] ${message}`);
  }

  error(message: string, error?: unknown): void {
    const detail = error instanceof Error ? `${error.message}` : error ? String(error) : '';
    this.output.appendLine(`[ERROR ${timestamp()}] ${message}${detail ? ` - ${detail}` : ''}`);
    if (error instanceof Error && error.stack) {
      this.output.appendLine(error.stack);
    }
  }

  /** 展示输出面板（供命令调用） */
  show(): void {
    this.output.show(true);
  }

  dispose(): void {
    this.channel?.dispose();
    this.channel = undefined;
  }
}

/** 生成本地时间戳字符串，例如 18:20:31 */
function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const logger = new Logger();
