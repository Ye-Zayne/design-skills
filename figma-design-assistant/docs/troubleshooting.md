# 问题排查

## 找不到插件或无法导入

确认选择的是当前源码目录 `figma-plugin/manifest.json`，并且同目录包含 `code.js` 和 `ui.html`。本模块目录的 `figma-plugin10.zip` 是原始快照，未包含后续修复。

首次安装应先在 Figma 中使用「创建新插件 / Create new plugin」，从生成的 manifest 获取属于你自己的 `id`，再替换本模块 manifest 中的 `figma-dsl-importer`。该原值只是占位示例，不能当作 Figma 分配的真实 ID。[Figma Manifest 官方说明](https://developers.figma.com/docs/plugins/manifest/) 解释了插件 ID 的来源。

确认当前 manifest 保留 `documentAccess: "dynamic-page"` 和 `networkAccess: { "allowedDomains": ["none"] }`。建议在 Figma 桌面端的设计文件中运行；若菜单位置变化，请查找客户端中的「开发 / Development」和「导入 manifest」入口。

## 动态页面加载相关报错

当前源码使用 `getNodeByIdAsync` 异步查找组件。启用 `documentAccess: "dynamic-page"` 后，旧的同步 `getNodeById` 会抛错；如果看到这类错误，请确认运行的是本模块 `figma-plugin/` 源码，而不是原始 ZIP 或其他旧副本。不要只给旧代码添加 `documentAccess` 就继续运行，组件查找调用链也需要支持异步。[Figma 动态加载迁移指南](https://developers.figma.com/docs/plugins/migrating-to-dynamic-loading/) 列出了相关 API 变更。

## JSON 格式错误或无效的 DSL

粘贴纯 JSON，不要把 Markdown 的三个反引号一起复制。JSON 不能有注释或末尾多余逗号。

顶层必须是对象，`schema` 必须为 `figma-dsl`，`sections` 如有提供必须是数组。可先用 `examples/minimal.dsl.json` 验证基础导入，再添加组件模块。

## 找不到组件 componentId

仓库附带的原始 ID 只对原始组件文件有效。请确保：

1. 当前打开的就是包含源组件的文件。
2. ID 指向源组件或组件集，不是实例、Frame 或其他节点。
3. DSL 中所有业务组件 ID 都已替换，包括筛选区的占位组件 ID。

插件按 ID 查找当前文件中的节点，不会通过组件名称搜索，也不会自动导入远程库。

## 字体加载或文本修改失败

`page.fontFamily` 默认是 `PingFang SC`。插件尝试加载该字体的 Regular、Medium、Semibold；失败后尝试加载 Inter Regular。这个回退只加载字体，不会把实例中的文本自动改成 Inter。

检查组件文本实际使用的字体与字重，确保它们在当前 Figma 环境可用。若组件使用多个字体、其他字重或混合字体，当前插件可能仍无法修改文本。此处需要在目标组件文件中验证，不能仅用基础空容器示例判断业务文本可用。

## 文案没变化或列错位

标题替换按文本图层名称匹配；筛选字段标签和普通按钮使用名称 `text`，表格标题使用 `title` / `counter`。名称不匹配时会保留原文案。

表格数据依赖行组件内部 `text` 节点的遍历顺序。检查组件是否包含额外的同名文本节点、表头/数据行是否使用相同列数，以及操作区结构是否符合约定。

## 画布出现重叠或半成品

每次导入都会在当前页面的 `(100, 100)` 附近创建新 Frame。插件不查重、不覆盖已有结果，也不会在失败时自动删除已生成的部分内容。

确认错误原因后，手动删除失败结果或移动旧稿，再重新导入。

## 本地检查与真实渲染的区别

`node --test tests/importer.test.cjs` 验证关键逻辑回归，`node --check figma-plugin/code.js` 验证 JavaScript 语法。它们不连接 Figma，也不验证真实组件的尺寸、字体和渲染效果；最终布局需在你自己的组件文件中检查。
