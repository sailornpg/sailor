# Agent Progress

## 当前 Active Feature

**feat-sidebar-active-highlight** — 增强当前会话选中效果

状态：done

## Checklist

官方列表原先 hover 和 active 都使用 bg-muted；局部选中背景改为强调色 14% 混合侧栏底色，标题字重 600。保持官方组件与键盘焦点。

## 验证

沿用当前会话已阅读的设计规范与项目约定；前轮基线通过。列表回归测试、typecheck/build 通过，verifier 已标记 done。当前目录不是 Git 仓库。


## 视觉 Evidence

隔离 Electron，1440×900 浅深色和 800×900 窄窗口：选中标题字重 600，普通 400；默认浅色选中背景约 #d3d3d2，深色约 #303030，与原 bg-muted 悬停区分。实际点击第二个会话后 active 转移、旧行恢复透明；长标题正常省略，无布局变化。截图 `.agent-harness/evidence/sidebar-highlight-{light,dark,narrow}.png`。仅测试 fixture，会话不调用模型。临时进程和配置已清理。
