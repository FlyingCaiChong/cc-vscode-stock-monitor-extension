import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	// 使用较短的用户数据目录，避免 macOS 上 Unix socket 路径超过 103 字符导致启动失败
	launchArgs: [
		'--user-data-dir=/tmp/vscode-stock-monitor-ud',
		'--extensions-dir=/tmp/vscode-stock-monitor-ext',
	],
});
