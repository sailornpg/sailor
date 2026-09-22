#!/bin/bash
set -e

echo "=== Harness 初始化 ==="

echo "=== pnpm run typecheck ==="
pnpm run typecheck

echo "=== pnpm run build ==="
pnpm run build

echo "=== Verification 完成 ==="
echo ""
echo "下一步："
echo "1. 阅读 .agent-harness/feature_list.json，了解当前 feature state"
echo "2. 只选择一个未完成 feature"
echo "3. 只实现这个 feature"
echo "4. 声称完成前重新运行 verification"
