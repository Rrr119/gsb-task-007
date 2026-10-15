# gsb-task-007 —— Pair-wise GSB 数据（五子棋人机对战网页）

同一个提示词、同一份初始环境快照，用 codex cli 跑两遍（A / B），用于 Pair-wise GSB 对比。

## 目录

| 路径 | 说明 |
| --- | --- |
| `prompt.md` | 提示词原文（A/B 两次逐字相同） |
| `rollouts/rollout-a.jsonl` | A 轮 codex 轨迹 |
| `rollouts/rollout-b.jsonl` | B 轮 codex 轨迹 |
| `run-a/` | A 轮模型产物（完整项目） |
| `run-b/` | B 轮模型产物（完整项目） |

另有产物快照分支：`gsb-task-007-a`、`gsb-task-007-b`（父提交均为初始环境快照）。

## 关键信息

- 初始环境快照：`fada2aab00777373c2cfd7cc4c1cd027284f12a5`
- Harness：codex cli `0.155.1`

| 项 | A 轮 | B 轮 |
| --- | --- | --- |
| session id | `01a1399f-61d2-7083-aece-45a35a33e643` | `01a139a9-f73d-7c23-bc25-f64a94bee9d5` |
| 运行时间 | 2026-10-14 16:55:08 → 17:06:41 | 2026-10-14 17:06:41 → 17:33:15 |
| 轮次校验 | 1 轮（turn_id 去重） | 1 轮（turn_id 去重） |
| 产物快照 commit | `5f20b621052646c78f7c500c29f8e7aca0193ef7` | `6e38fba1b4fbf94fc089123032f9c62cccc30933` |
| 产物快照分支 | `gsb-task-007-a` | `gsb-task-007-b` |
| 产物组织 | `src/` 拆模块（board/rules/ai/patterns/record/renderer/ui/timer…）+ `styles/main.css` | `js/core`、`js/ai`、`js/ui`、`js/storage`、`js/utils` + `css/style.css` + `tools/selftest.mjs` 自测 |

> 说明：`run-a/`、`run-b/` 是为了方便在默认分支直接浏览两轮产物而做的一份合并展示；
> GSB 规范要求的"产物快照"仍以 `gsb-task-007-a` / `gsb-task-007-b` 分支为准（父提交 = 初始环境快照）。