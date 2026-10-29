import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * 扩展宿主冒烟测试：验证插件可被激活、命令与配置项已正确注册。
 * 运行方式：`npm test`（由 @vscode/test-cli 启动真实 VS Code 实例）。
 */
suite('Stock Monitor 扩展冒烟测试', () => {
  test('插件可激活且注册了全部命令', async () => {
    const extension = vscode.extensions.getExtension('stock-monitor.vscode-stock-monitor-extension');
    assert.ok(extension, '未找到插件，请检查 publisher 与 name 组合');

    await extension.activate();
    assert.strictEqual(extension.isActive, true);

    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'stockMonitor.addStock',
      'stockMonitor.removeStock',
      'stockMonitor.toggleFavorite',
      'stockMonitor.setPosition',
      'stockMonitor.refresh',
      'stockMonitor.showLogs',
    ]) {
      assert.ok(commands.includes(id), `缺少命令：${id}`);
    }
  });

  test('配置项具备预期默认值', () => {
    const config = vscode.workspace.getConfiguration('stockMonitor');
    assert.strictEqual(config.get('refreshInterval'), 10);
    assert.strictEqual(config.get('colorScheme'), 'greenUp');
    assert.strictEqual(config.get('showPortfolioSummary'), true);
    assert.strictEqual(config.get('portfolioSummaryLabel'), '参考盈亏');
    assert.strictEqual(config.get('upColor'), '');
    assert.strictEqual(config.get('downColor'), '');
    assert.deepStrictEqual(config.get('stockColors'), []);
    assert.strictEqual(config.get('statusBarAlignment'), 'left');
    assert.deepStrictEqual(config.get('positions'), []);
  });
});
