figma.showUI(__html__, { width: 400, height: 520, title: 'DSL Importer' });

figma.ui.onmessage = async (msg) => {
  if (!msg || msg.type !== 'import') return;

  try {
    await importDSL(msg.dsl);
    figma.ui.postMessage({ type: 'success', text: '页面已生成' });
  } catch (e) {
    figma.ui.postMessage({ type: 'error', text: e.message });
  }
};

function progress(text) {
  figma.ui.postMessage({ type: 'progress', text });
}

// ─── 字体加载 ────────────────────────────────────────────────────────────────

async function loadFonts(fontFamily) {
  const family = fontFamily || 'PingFang SC';
  await Promise.all([
    figma.loadFontAsync({ family, style: 'Regular' }),
    figma.loadFontAsync({ family, style: 'Medium' }),
    figma.loadFontAsync({ family, style: 'Semibold' }),
  ]).catch(() => {
    return figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  });
}

// ─── 组件实例化 ───────────────────────────────────────────────────────────────

async function getInstance(componentId) {
  const node = await figma.getNodeByIdAsync(componentId);
  if (!node) throw new Error(`找不到组件 componentId=${componentId}`);
  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
    throw new Error(`节点 ${componentId} 不是组件`);
  }
  return node.type === 'COMPONENT_SET'
    ? node.defaultVariant.createInstance()
    : node.createInstance();
}

// ─── 文本写入（按 name 查找文本节点）────────────────────────────────────────

function setTexts(instance, textsMap) {
  const textNodes = instance.findAll(n => n.type === 'TEXT');
  for (const node of textNodes) {
    if (textsMap[node.name] !== undefined) {
      node.characters = String(textsMap[node.name]);
    }
  }
}

function setTextByName(instance, name, value) {
  const node = instance.findOne(n => n.type === 'TEXT' && n.name === name);
  if (node) node.characters = String(value);
}

// ─── Frame 工厂 ───────────────────────────────────────────────────────────────

function makeFrame(name, opts = {}) {
  const f = figma.createFrame();
  f.name = name;
  f.fills = opts.fills !== undefined ? opts.fills : [];

  if (opts.layoutMode) {
    f.layoutMode = opts.layoutMode;
    f.primaryAxisSizingMode  = opts.primaryAxisSizingMode  || 'AUTO';
    f.counterAxisSizingMode  = opts.counterAxisSizingMode  || 'AUTO';
    f.itemSpacing            = opts.gap     || opts.itemSpacing || 0;
    f.paddingTop             = opts.paddingTop    || opts.padding || 0;
    f.paddingBottom          = opts.paddingBottom || opts.padding || 0;
    f.paddingLeft            = opts.paddingLeft   || opts.padding || 0;
    f.paddingRight           = opts.paddingRight  || opts.padding || 0;
    if (opts.primaryAxisAlignItems)  f.primaryAxisAlignItems  = opts.primaryAxisAlignItems;
    if (opts.counterAxisAlignItems)  f.counterAxisAlignItems  = opts.counterAxisAlignItems;
  }

  if (opts.width)        f.resize(opts.width, opts.height || f.height);
  if (opts.cornerRadius) f.cornerRadius = opts.cornerRadius;
  if (opts.background) {
    const hex = opts.background.replace('#', '');
    const r = parseInt(hex.slice(0,2),16)/255;
    const g = parseInt(hex.slice(2,4),16)/255;
    const b = parseInt(hex.slice(4,6),16)/255;
    f.fills = [{ type: 'SOLID', color: { r, g, b } }];
  }

  return f;
}

// ─── 主入口 ───────────────────────────────────────────────────────────────────

async function importDSL(dsl) {
  if (!dsl || typeof dsl !== 'object' || Array.isArray(dsl) || dsl.schema !== 'figma-dsl') {
    throw new Error('无效的 DSL：schema 字段必须为 "figma-dsl"');
  }
  if (dsl.sections !== undefined && !Array.isArray(dsl.sections)) {
    throw new Error('无效的 DSL：sections 必须是数组');
  }
  const page = dsl.page || {};
  const sections = dsl.sections || [];

  progress('加载字体...');
  await loadFonts(page.fontFamily);

  progress('创建页面框架...');
  const pageFrame = makeFrame(page.name || '页面', {
    layoutMode: 'VERTICAL',
    primaryAxisSizingMode: 'AUTO',
    counterAxisSizingMode: 'FIXED',
    width: page.width || 1208,
    gap: page.gap || 24,
    padding: page.padding || 24,
    background: '#FFFFFF',
    cornerRadius: page.cornerRadius || 16,
  });
  figma.currentPage.appendChild(pageFrame);
  pageFrame.x = 100;
  pageFrame.y = 100;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    progress(`渲染 ${section.type} (${i + 1}/${sections.length})...`);

    switch (section.type) {
      case 'PageTitle':
        await buildPageTitle(section, pageFrame);
        break;
      case 'FilterBar':
        await buildFilterBar(section, pageFrame);
        break;
      case 'TableSection':
        await buildTableSection(section, pageFrame);
        break;
      default:
        console.warn('未知 section type:', section.type);
    }
  }

  figma.viewport.scrollAndZoomIntoView([pageFrame]);
}

// ─── PageTitle ────────────────────────────────────────────────────────────────

async function buildPageTitle(section, parent) {
  const instance = await getInstance(section.componentId);
  parent.appendChild(instance);
  instance.layoutSizingHorizontal = 'HUG';
  instance.layoutSizingVertical   = 'HUG';

  if (section.texts) {
    setTexts(instance, section.texts);
  }
}

// ─── FilterBar ────────────────────────────────────────────────────────────────

async function buildFilterBar(section, parent) {
  const fields       = section.fields || [];
  const actionsId    = section.actions && section.actions.componentId;
  const fieldsPerRow = 3;
  const placeholderId = section.placeholderComponentId || '173:11230';

  const container = makeFrame('FilterBar', {
    layoutMode: 'VERTICAL',
    primaryAxisSizingMode: 'AUTO',
    counterAxisSizingMode: 'FIXED',
    gap: 16,
  });
  parent.appendChild(container);
  container.layoutSizingHorizontal = 'FILL';
  container.layoutSizingVertical   = 'HUG';

  // 末行已有字段数，需要填多少 placeHolder 让末行凑齐 fieldsPerRow-1 个（第3槽留给 actions）
  const remainder   = fields.length % fieldsPerRow;
  const slotsNeeded = remainder === 0 ? fieldsPerRow - 1 : fieldsPerRow - remainder - 1;
  const paddedFields = [...fields];
  for (let i = 0; i < slotsNeeded; i++) {
    paddedFields.push({ componentId: placeholderId, type: 'placeHolder' });
  }

  // 按行分组，每行 fieldsPerRow-1 个字段 + 1个 actions 槽
  // 但非末行是完整的 fieldsPerRow 个字段，只有末行才是 (fieldsPerRow-1) + actions
  // 所以先把所有行按 fieldsPerRow 分，末行最后一个元素被 actions 替换
  const rows = [];
  for (let i = 0; i < paddedFields.length; i += fieldsPerRow) {
    rows.push(paddedFields.slice(i, i + fieldsPerRow));
  }

  for (let ri = 0; ri < rows.length; ri++) {
    const rowFields = rows[ri];
    const isLastRow = ri === rows.length - 1;

    const rowFrame = makeFrame(`FilterRow_${ri + 1}`, {
      layoutMode: 'HORIZONTAL',
      primaryAxisSizingMode: 'AUTO',
      counterAxisSizingMode: 'AUTO',
      gap: 16,
      counterAxisAlignItems: 'CENTER',
    });
    container.appendChild(rowFrame);
    rowFrame.layoutSizingHorizontal = 'FILL';
    rowFrame.layoutSizingVertical   = 'HUG';

    for (const fieldDef of rowFields) {
      if (fieldDef.type === 'placeHolder') {
        const ph = await getInstance(fieldDef.componentId || placeholderId);
        rowFrame.appendChild(ph);
        ph.layoutSizingHorizontal = 'FILL';
        ph.layoutSizingVertical   = 'FIXED';
      } else {
        const field = await getInstance(fieldDef.componentId);
        rowFrame.appendChild(field);
        field.layoutSizingHorizontal = 'FILL';
        field.layoutSizingVertical   = 'FIXED';
        if (fieldDef.label) setTextByName(field, 'text', fieldDef.label);
        if (fieldDef.placeholder) {
          const ph = field.findOne(n => n.type === 'TEXT' && n.characters.startsWith('请'));
          if (ph) ph.characters = fieldDef.placeholder;
        }
      }
    }

    // 末行始终追加 actions
    if (isLastRow && actionsId) {
      const actions = await getInstance(actionsId);
      rowFrame.appendChild(actions);
      actions.layoutSizingHorizontal = 'FILL';
      actions.layoutSizingVertical   = 'FIXED';
    }
  }
}

// ─── TableSection ─────────────────────────────────────────────────────────────

async function buildTableSection(section, parent) {
  const cids     = section.componentIds || {};
  const columns  = section.columns || [];
  const rows     = section.rows || [];
  const toolbar  = section.toolbar || {};

  const dataColumns = columns.filter(c => c.type !== 'action');
  const colCount    = columns.length;

  const tableSection = makeFrame('TableSection', {
    layoutMode: 'VERTICAL',
    primaryAxisSizingMode: 'AUTO',
    counterAxisSizingMode: 'FIXED',
    gap: 16,
  });
  parent.appendChild(tableSection);
  tableSection.layoutSizingHorizontal = 'FILL';
  tableSection.layoutSizingVertical   = 'HUG';

  // SectionTitle
  if (cids.SectionTitle) {
    const sectionTitle = await getInstance(cids.SectionTitle);
    tableSection.appendChild(sectionTitle);
    sectionTitle.layoutSizingHorizontal = 'HUG';
    sectionTitle.layoutSizingVertical   = 'HUG';
    if (section.title)   setTextByName(sectionTitle, 'title',   section.title);
    if (section.counter) setTextByName(sectionTitle, 'counter', section.counter);
  }

  // ActionBar
  await buildActionBar(toolbar, cids, tableSection);

  // DataTable
  const dataTable = makeFrame('DataTable', {
    layoutMode: 'VERTICAL',
    primaryAxisSizingMode: 'AUTO',
    counterAxisSizingMode: 'FIXED',
    gap: 0,
  });
  tableSection.appendChild(dataTable);
  dataTable.layoutSizingHorizontal = 'FILL';
  dataTable.layoutSizingVertical   = 'HUG';

  // TableHeaderRow
  if (cids.TableHeaderRow) {
    const header = await getInstance(cids.TableHeaderRow);
    dataTable.appendChild(header);
    header.layoutSizingHorizontal = 'FILL';
    header.layoutSizingVertical   = 'FIXED';

    const headerTextNodes = header.findAll(n => n.type === 'TEXT' && n.name === 'text');
    columns.forEach((col, i) => {
      if (headerTextNodes[i]) headerTextNodes[i].characters = col.title;
    });
  }

  // TableDataRows
  if (cids.TableDataRow && rows.length > 0) {
    let cellNames = null;

    for (let ri = 0; ri < rows.length; ri++) {
      const rowData  = rows[ri];
      const rowInst  = await getInstance(cids.TableDataRow);
      dataTable.appendChild(rowInst);
      rowInst.layoutSizingHorizontal = 'FILL';
      rowInst.layoutSizingVertical   = 'FIXED';

      const textCells = rowInst.findAll(n => n.type === 'TEXT' && n.name === 'text');
      rowData.forEach((cellValue, ci) => {
        if (cellValue !== null && cellValue !== undefined && textCells[ci]) {
          textCells[ci].characters = String(cellValue);
        }
      });

      if (cids.TableDataRow && columns.some(c => c.type === 'action')) {
        const actionCol = columns.find(c => c.type === 'action');
        if (actionCol && actionCol.actions) {
          const actionTextNodes = rowInst.findAll(
            n => n.type === 'TEXT' && (n.characters === '查看' || n.characters === '编辑' || n.characters === '删除')
          );
          actionCol.actions.forEach((actionLabel, ai) => {
            if (actionTextNodes[ai]) actionTextNodes[ai].characters = actionLabel;
          });
        }
      }
    }
  }

  // Pagination
  if (cids.Pagination) {
    const pagination = await getInstance(cids.Pagination);
    tableSection.appendChild(pagination);
    pagination.layoutSizingHorizontal = 'FILL';
    pagination.layoutSizingVertical   = 'FIXED';
  }
}

// ─── ActionBar ────────────────────────────────────────────────────────────────

async function buildActionBar(toolbar, cids, parent) {
  const leftItems  = toolbar.left  || [];
  const rightItems = toolbar.right || [];

  const actionBar = makeFrame('ActionBar', {
    layoutMode: 'HORIZONTAL',
    primaryAxisSizingMode: 'AUTO',
    counterAxisSizingMode: 'AUTO',
    primaryAxisAlignItems: 'SPACE_BETWEEN',
    counterAxisAlignItems: 'CENTER',
  });
  parent.appendChild(actionBar);
  actionBar.layoutSizingHorizontal = 'FILL';
  actionBar.layoutSizingVertical   = 'HUG';

  // LeftGroup
  const leftGroup = makeFrame('LeftGroup', {
    layoutMode: 'HORIZONTAL',
    primaryAxisSizingMode: 'AUTO',
    counterAxisSizingMode: 'AUTO',
    gap: 8,
  });
  actionBar.appendChild(leftGroup);
  leftGroup.layoutSizingHorizontal = 'HUG';
  leftGroup.layoutSizingVertical   = 'HUG';

  for (const item of leftItems) {
    if (item.type === 'SelectionCounter' && cids.SelectionCounter) {
      const counter = await getInstance(cids.SelectionCounter);
      leftGroup.appendChild(counter);
      counter.layoutSizingHorizontal = 'HUG';
      counter.layoutSizingVertical   = 'FIXED';
    } else if (item.componentId) {
      const btn = await getInstance(item.componentId);
      leftGroup.appendChild(btn);
      btn.layoutSizingHorizontal = 'HUG';
      btn.layoutSizingVertical   = 'FIXED';
      if (item.text) setTextByName(btn, 'text', item.text);
    }
  }

  // RightGroup
  const rightGroup = makeFrame('RightGroup', {
    layoutMode: 'HORIZONTAL',
    primaryAxisSizingMode: 'AUTO',
    counterAxisSizingMode: 'AUTO',
    gap: 8,
  });
  actionBar.appendChild(rightGroup);
  rightGroup.layoutSizingHorizontal = 'HUG';
  rightGroup.layoutSizingVertical   = 'HUG';

  for (const item of rightItems) {
    if (item.componentId) {
      const btn = await getInstance(item.componentId);
      rightGroup.appendChild(btn);
      btn.layoutSizingHorizontal = 'HUG';
      btn.layoutSizingVertical   = 'FIXED';
      if (item.text) setTextByName(btn, 'text', item.text);
    }
  }
}
