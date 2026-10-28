const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'figma-plugin/code.js'), 'utf8');

function importer() {
  const requestedIds = [];
  const instances = [];
  const frames = [];
  const messages = [];
  function node() {
    return {
      width: 100,
      height: 32,
      children: [],
      appendChild(child) {
        assert.ok(!child || typeof child.then !== 'function', 'appendChild must receive a resolved node');
        this.children.push(child);
      },
      resize(width, height) { this.width = width; this.height = height; },
    };
  }
  const figma = {
    showUI() {},
    ui: { postMessage(message) { messages.push(message); } },
    loadFontAsync: async () => {},
    currentPage: node(),
    viewport: { scrollAndZoomIntoView() {} },
    createFrame() { const frame = node(); frames.push(frame); return frame; },
    getNodeById() { throw new Error('Synchronous node lookup is unavailable in dynamic-page mode'); },
    async getNodeByIdAsync(id) {
      await Promise.resolve();
      requestedIds.push(id);
      return {
        type: 'COMPONENT',
        createInstance() {
          const instance = node();
          instance.id = id;
          instance.texts = id === 'data-row'
            ? Array.from({ length: 5 }, () => ({ type: 'TEXT', name: 'text', characters: '原始内容' }))
            : [];
          instance.findAll = predicate => instance.texts.filter(predicate);
          instance.findOne = predicate => instance.texts.find(predicate) || null;
          instances.push(instance);
          return instance;
        },
      };
    },
  };
  const context = vm.createContext({ figma, __html__: '', console });
  vm.runInContext(source, context);
  return { context, figma, requestedIds, instances, frames, messages };
}

function importerUI() {
  const elements = Object.fromEntries(['dsl', 'status', 'btnClear', 'btnImport'].map(id => [id, {
    value: '', disabled: false, textContent: '', className: '',
    classList: { add() {}, remove() {} },
  }]));
  const posted = [];
  const context = vm.createContext({
    document: { getElementById: id => elements[id] },
    window: {},
    parent: { postMessage: message => posted.push(message) },
  });
  const html = fs.readFileSync(path.join(root, 'figma-plugin/ui.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script, context);
  return { elements, context, posted };
}

test('invalid root and sections fail before creating a frame', async () => {
  const app = importer();
  for (const dsl of [null, [], 'text', {}, { schema: 'other' }]) {
    await assert.rejects(app.context.importDSL(dsl), /schema/);
  }
  await assert.rejects(app.context.importDSL({ schema: 'figma-dsl', sections: {} }), /sections/);
  assert.equal(app.frames.length, 0);
});

test('minimal example imports without looking up components', async () => {
  const app = importer();
  const dsl = JSON.parse(fs.readFileSync(path.join(root, 'examples/minimal.dsl.json'), 'utf8'));
  await app.context.importDSL(dsl);
  assert.equal(app.figma.currentPage.children.length, 1);
  assert.equal(app.figma.currentPage.children[0].name, 'DSL 基础导入验证');
  assert.deepEqual(app.requestedIds, []);
});

test('filter padding uses the template ID or the supplied placeholder component', async () => {
  for (const count of [0, 1, 2, 3, 4, 5, 6]) {
    const app = importer();
    const parent = app.figma.createFrame();
    await app.context.buildFilterBar({
      fields: Array.from({ length: count }, (_, i) => ({ componentId: 'field-' + i, type: 'input' })),
      actions: { componentId: 'actions' },
    }, parent);
    const rows = parent.children[0].children;
    assert.equal(rows.length, Math.ceil((count + 1) / 3));
    assert.ok(rows.every(row => row.children.length === 3));
    assert.equal(rows.at(-1).children.at(-1).id, 'actions');
    assert.ok(!app.requestedIds.includes('1:185'));
    if (count % 3 !== 2) assert.ok(app.requestedIds.includes('173:11230'));
  }
  const custom = importer();
  await custom.context.buildFilterBar({
    fields: [], placeholderComponentId: 'custom-placeholder',
    actions: { componentId: 'actions' },
  }, custom.figma.createFrame());
  assert.equal(custom.requestedIds.filter(id => id === 'custom-placeholder').length, 2);
  assert.ok(!custom.requestedIds.includes('173:11230'));
});

test('table cells write zero, false, and empty strings while preserving null and absent values', async () => {
  const app = importer();
  await app.context.buildTableSection({
    componentIds: { TableDataRow: 'data-row' },
    columns: Array.from({ length: 5 }, () => ({ type: 'text' })),
    rows: [[0, false, '', null, undefined]],
  }, app.figma.createFrame());
  const texts = app.instances.find(instance => instance.id === 'data-row').texts;
  assert.deepEqual(texts.map(node => node.characters), ['0', 'false', '', '原始内容', '原始内容']);
});

test('UI rejects null and array JSON without posting an import', () => {
  const ui = importerUI();
  for (const value of ['null', '[]', '"text"']) {
    ui.elements.dsl.value = value;
    assert.doesNotThrow(() => ui.elements.btnImport.onclick());
    assert.match(ui.elements.status.textContent, /无效的 DSL/);
  }
  assert.equal(ui.posted.length, 0);
});

test('UI keeps import disabled during progress and restores it only after completion', () => {
  for (const type of ['success', 'error']) {
    const ui = importerUI();
    ui.elements.dsl.value = '{"schema":"figma-dsl","sections":[]}';
    ui.elements.btnImport.onclick();
    assert.equal(ui.elements.btnImport.disabled, true);
    assert.equal(ui.posted.length, 1);
    ui.context.window.onmessage({ data: { pluginMessage: { type: 'progress', text: '加载字体...' } } });
    assert.equal(ui.elements.btnImport.disabled, true);
    ui.context.window.onmessage({ data: { pluginMessage: { type, text: '完成' } } });
    assert.equal(ui.elements.btnImport.disabled, false);
  }
});


test('all component lookup paths await the dynamic-page API', async () => {
  const app = importer();
  await app.context.importDSL({
    schema: 'figma-dsl',
    sections: [
      { type: 'PageTitle', componentId: 'page-title', texts: { title: '页面标题' } },
      {
        type: 'TableSection',
        title: '表格标题',
        counter: '共 1 条',
        componentIds: {
          SectionTitle: 'section-title', SelectionCounter: 'selection-counter',
          TableHeaderRow: 'header-row', TableDataRow: 'data-row', Pagination: 'pagination',
        },
        toolbar: {
          left: [{ type: 'SelectionCounter' }, { componentId: 'left-button', text: '批量操作' }],
          right: [{ componentId: 'right-button', text: '新增' }],
        },
        columns: [{ type: 'text', title: '数据' }],
        rows: [['一条记录']],
      },
    ],
  });
  assert.deepEqual(app.requestedIds, [
    'page-title', 'section-title', 'selection-counter', 'left-button',
    'right-button', 'header-row', 'data-row', 'pagination',
  ]);
  assert.equal(app.instances.length, 8);
});
