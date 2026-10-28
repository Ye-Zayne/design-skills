# DSL 字段说明

本说明以 `figma-plugin/code.js` 的实际行为为准。原始 `figma-dsl-schema.json` 用于示例和映射参考，不提供完整的机器校验。

## 顶层和页面

| 字段 | 用途 |
| --- | --- |
| `schema` | 必须是 `figma-dsl` |
| `version` | 示例约定为 `1.0`；当前插件不按版本分支处理 |
| `page.name` | 生成的 Frame 名称，默认「页面」 |
| `page.width` | 页面容器宽度，默认 1208 |
| `page.padding` / `page.gap` | 默认均为 24 |
| `page.cornerRadius` | 默认 16 |
| `page.fontFamily` | 预加载 Regular、Medium、Semibold，默认 PingFang SC；不会更改文本字体 |
| `sections` | 模块数组，按顺序生成；省略时生成空容器 |

当前页面数值使用 truthy 默认值，因此 `padding: 0`、`gap: 0`、`cornerRadius: 0` 会回到默认值。容器背景固定为白色。生成的是当前页面中的 Frame，不是新建 Figma Page。

## 组件 ID

所有组件查找均在当前 Figma 文件中进行。ID 应指向 `COMPONENT` 或 `COMPONENT_SET`；传入组件集时创建其默认变体。不能使用实例节点、普通 Frame 或外部组件库链接代替 ID。

可从 Figma 组件链接中的 `node-id` 核对节点 ID；链接中显示的 `12-1870` 对应 DSL 的 `12:1870`。应定位源组件，而非画布上的某个实例。

## PageTitle

```json
{
  "type": "PageTitle",
  "componentId": "67:17401",
  "texts": { "title": "订单管理" }
}
```

`texts` 的键对应实例内文本图层的 **name**，不是当前显示的文案。插件会改写所有名称匹配的文本节点；没有匹配项时不会报错。

## FilterBar

| 字段 | 用途 |
| --- | --- |
| `fields` | 筛选字段数组；每项显式提供 `componentId` |
| `fields[].type` | `placeHolder` 会作为占位处理；其他值不会自动选取变体 |
| `fields[].label` | 写入首个名为 `text` 的文本节点 |
| `fields[].placeholder` | 写入首个当前文案以「请」开头的文本节点 |
| `actions.componentId` | 末行操作区组件 |
| `placeholderComponentId` | 自动补位组件 ID，默认采用原始映射 `173:11230` |

每行三个等宽槽位。存在操作区时，末行前两个槽位放字段或占位，第三个槽位放操作区。例如：

| 字段数量 | 布局（每格为一个槽位） |
| --- | --- |
| 0 | 占位 / 占位 / 操作区 |
| 1 | 字段 / 占位 / 操作区 |
| 2 | 字段 / 字段 / 操作区 |
| 3 | 字段 / 字段 / 字段；占位 / 占位 / 操作区 |
| 4 | 字段 / 字段 / 字段；字段 / 占位 / 操作区 |

当前算法即使未提供 `actions` 也会执行补位；建议业务 DSL 同时提供操作区和有效的占位组件。

## TableSection

| 字段 | 用途 |
| --- | --- |
| `title` / `counter` | 写入标题组件中名为 `title` / `counter` 的文本节点 |
| `componentIds.SectionTitle` | 表格标题组件 |
| `componentIds.SelectionCounter` | 工具栏已选数量组件 |
| `componentIds.TableHeaderRow` | 表头行组件，应自行选择与列数一致的变体 |
| `componentIds.TableDataRow` | 数据行组件，应自行选择与列数一致的变体 |
| `componentIds.Pagination` | 分页组件 |
| `toolbar.left` / `toolbar.right` | 左右工具栏数组；按钮用 `componentId` 和 `text` 指定 |
| `columns` | 列数组，`title` 写入表头中名为 `text` 的文本节点 |
| `rows` | 二维数组，按 `text` 文本节点的遍历顺序填入 |

工具栏项 `{ "type": "SelectionCounter" }` 使用 `componentIds.SelectionCounter`。普通按钮的 `text` 写入首个名为 `text` 的文本节点。`variant` 仅作描述，按钮外观由 `componentId` 指向的组件决定。

单元格的 `0`、`false`、空字符串会写入；`null` 和省略项保留组件原始文案。组件内的文本节点顺序需要与数据列一致。

若存在 `type: "action"` 的列，插件会查找当前文案恰好为「查看」「编辑」「删除」的文本节点，依次写入该列的 `actions` 数组。它不会自动增删操作按钮。

原始模板建议 4～8 列；需自行选择匹配的表头/数据行组件 ID。插件不依据 `$defs` 自动选取变体，也不根据 `text`、`number` 或 `action` 类型重新分配列宽。`Pagination` 和 `SelectionCounter` 当前保留组件默认内容。
