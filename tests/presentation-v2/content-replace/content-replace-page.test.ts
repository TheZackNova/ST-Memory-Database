/**
 * ContentReplacePage 集成 — 正文替换页结构与关键交互
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createSettings() {
  return {
    apiMode: 'custom',
    apiConfig: { url: '', apiKey: '', model: '', useMainApi: true, max_tokens: 60000, temperature: 1 },
    tavernProfile: '',
    apiPresets: [{ name: 'fast', apiMode: 'custom', apiConfig: { url: '', apiKey: '', model: '', useMainApi: true, max_tokens: 1000, temperature: 1 }, tavernProfile: '' }],
    defaultApiPresetName: 'fast',
    apiPresetBindingsByChat: {},
    contentOptimizationSettings: {
      enabled: false,
      apiPreset: '',
      seamlessMode: true,
      autoApply: true,
      showDiff: true,
      parallelMode: false,
      minLength: 100,
      maxOptimizations: 10,
      loopCount: 1,
      retryCount: 3,
      extractTags: '',
      extractRules: [],
      excludeTags: '',
      excludeRules: [],
      promptGroup: [
        { role: 'USER', content: '优化 $CONTENT', deletable: true, mainSlot: 'A' },
      ],
      promptPresets: [
        {
          name: '默认优化',
          promptGroup: [{ role: 'USER', content: '预设 $CONTENT', deletable: true }],
        },
      ],
    },
  } as any;
}

async function mountContentReplacePage() {
  vi.resetModules();
  document.body.innerHTML = '';
  document.head.innerHTML = '';

  const settings = createSettings();
  const saveSettings = vi.fn(() => ({ saved: true, storageType: 'memory' }));
  const performOptimization = vi.fn(async () => ({
    success: true,
    optimizations: [{ original: '旧句子', optimized: '新句子', plan: '更顺' }],
    optimizedContent: '新句子',
    summary: '完成',
  }));

  vi.doMock('../../../src/service/runtime/state-manager', () => ({
    settings_ACU: settings,
    currentChatFileIdentifier_ACU: 'chat-content-replace',
  }));
  vi.doMock('../../../src/service/settings/settings-service', () => ({
    saveSettings_ACU: saveSettings,
  }));
  vi.doMock('../../../src/service/ai/ai-service', () => ({
    getConnectionManagerProfiles_ACU: () => [],
    fetchAvailableModels_ACU: vi.fn(async () => ({ success: true, models: [] })),
  }));
  vi.doMock('../../../src/service/optimization/content-optimization', () => ({
    performContentOptimization_ACU: performOptimization,
  }));
  vi.doMock('../../../src/service/chat/chat-service', () => ({
    getOriginalContent_ACU: vi.fn(() => '旧句子'),
    replaceChatMessage_ACU: vi.fn(async () => true),
  }));
  vi.doMock('../../../src/service/plot/plot-logic', () => ({
    getLastOptimizedMessageIndex_ACU: vi.fn(() => 3),
  }));
  vi.doMock('../../../src/presentation-v2/composables/useChatChangedListener', async () => {
    const vue = await vi.importActual<typeof import('vue')>('vue');
    return {
      useChatChangedTick: () => vue.ref(0),
    };
  });

  const vue = await import('vue');
  const pinia = await import('pinia');
  const Page = (await import('../../../src/presentation-v2/pages/ContentReplacePage.vue')).default;
  const app = vue.createApp(Page);
  app.use(pinia.createPinia());
  const root = document.createElement('div');
  document.body.appendChild(root);
  app.mount(root);
  await new Promise(r => setTimeout(r, 0));

  return { app, settings, saveSettings, performOptimization };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ContentReplacePage', () => {
  it('渲染正文替换左右等宽分栏和五个 v2 面板', async () => {
    const { app } = await mountContentReplacePage();

    const page = document.querySelector('.acu-v2-content-replace-page');
    expect(page).not.toBeNull();
    const text = page!.textContent || '';
    expect(text).toContain('thay thế nội dung');
    expect(text).toContain('Cài đặt cơ bản');
    expect(text).toContain('Chế độ thay thế');
    expect(text).toContain('Lọc theo thẻ');
    expect(text).toContain('Preset thay thế nội dung');
    expect(text).toContain('Kiểm thử thủ công');
    expect(text).toContain('Preset mặc định');
    expect(text).not.toContain('Chưa chọn');

    const layout = page!.querySelector('.acu-v2-content-replace-page__layout');
    expect(layout).not.toBeNull();
    expect(layout!.querySelectorAll(':scope > .acu-panel').length).toBe(5);
    const panelTitles = Array.from(layout!.querySelectorAll<HTMLElement>(':scope > .acu-panel .acu-panel__title'))
      .map(title => title.textContent?.trim());
    expect(panelTitles).toEqual(['Cài đặt cơ bản', 'Chế độ thay thế', 'Preset thay thế nội dung', 'Lọc theo thẻ', 'Kiểm thử thủ công']);
    const mobileNavItems = Array.from(page!.querySelectorAll('.acu-mobile-panel-nav__item'))
      .map(item => item.textContent?.trim());
    expect(mobileNavItems).toEqual(['Cài đặt cơ bản', 'Chế độ thay thế', 'Preset', 'Lọc theo thẻ', 'Kiểm thử thủ công']);

    app.unmount();
  });

  it('布局使用直接双列 grid，同行面板按 grid 行高等高', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/presentation-v2/pages/ContentReplacePage.vue', 'utf8');

    expect(source).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(source).toContain('align-items: stretch;');
    expect(source).not.toContain('acu-v2-content-replace-page__column');
  });

  it('每个面板都渲染常驻说明信息条，页面内不再渲染重复 header', async () => {
    const { app } = await mountContentReplacePage();

    const header = document.querySelector('.acu-v2-content-replace-page .acu-page-header');
    expect(header).toBeNull();

    const panels = document.querySelectorAll('.acu-v2-content-replace-page .acu-panel');
    expect(panels.length).toBe(5);
    panels.forEach(panel => {
      expect(panel.querySelector('.acu-panel__description-region .acu-info-banner')).not.toBeNull();
      expect(panel.querySelector('.acu-panel__header .acu-info-banner')).toBeNull();
    });

    app.unmount();
  });

  it('正文替换页不再承载启用开关', async () => {
    const { app } = await mountContentReplacePage();

    expect(document.querySelector('.acu-v2-content-replace-page .acu-toggle')).toBeNull();
    const text = document.querySelector('.acu-v2-content-replace-page')?.textContent || '';
    expect(text).not.toContain('Công tắc bật ở bảng điều khiển');

    app.unmount();
  });

  it('API 预设下拉的跟随项显示当前活动 API 预设名', async () => {
    const { app } = await mountContentReplacePage();

    const basicPanel = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-content-replace-page .acu-panel'))
      .find(panel => panel.querySelector('.acu-panel__title')?.textContent?.includes('Cài đặt cơ bản'))!;
    const apiRow = Array.from(basicPanel.querySelectorAll<HTMLElement>('.acu-form-row'))
      .find(row => (row.textContent || '').includes('Preset API'))!;
    const acuSelect = apiRow.querySelector('.acu-select') as HTMLElement | null;
    expect(acuSelect).not.toBeNull();
    const trigger = acuSelect!.querySelector('.acu-select__trigger') as HTMLButtonElement;
    expect(trigger.textContent).toContain('Theo API đang hoạt động (fast)');
    trigger.click();
    await Promise.resolve();

    const labels = Array.from(acuSelect!.querySelectorAll<HTMLElement>('.acu-select__item'))
      .map(item => (item.textContent || '').trim());
    expect(labels[0]).toBe('Theo API đang hoạt động (fast)');
    expect(labels).toContain('fast');

    app.unmount();
  });

  it('提示词编辑器只在侧抽屉中出现，保存后写回当前配置和目标预设', async () => {
    const { app, settings, saveSettings } = await mountContentReplacePage();

    expect(document.querySelector('.acu-v2-content-replace-page .acu-prompt-segs')).toBeNull();

    const importButtonIcon = document.querySelector<HTMLElement>('.acu-v2-content-replace-page [title="Nhập JSON preset"] i');
    expect(importButtonIcon?.className || '').toContain('fa-download');

    const trigger = document.querySelector<HTMLButtonElement>('.acu-v2-content-replace-page .acu-preset-dd__trigger');
    expect(trigger).not.toBeNull();
    trigger!.click();
    await new Promise(r => setTimeout(r, 0));

    expect(document.querySelector('.acu-v2-content-replace-page .acu-preset-dd__star')).toBeNull();

    const customPresetItem = Array.from(document.querySelectorAll<HTMLButtonElement>('.acu-v2-content-replace-page .acu-preset-dd__item'))
      .find(button => button.textContent?.includes('默认优化'));
    expect(customPresetItem).not.toBeUndefined();
    customPresetItem!.click();
    await new Promise(r => setTimeout(r, 0));

    const editButton = document.querySelector<HTMLButtonElement>('.acu-v2-content-replace-page button[title="Sửa prompt hiện tại"]');
    expect(editButton).not.toBeNull();
    expect(editButton!.disabled).toBe(false);
    editButton!.click();
    await new Promise(r => setTimeout(r, 0));

    const drawer = document.querySelector('.acu-v2-drawer') as HTMLElement;
    expect(drawer).not.toBeNull();
    const textarea = drawer.querySelector<HTMLTextAreaElement>('.acu-prompt-segs textarea');
    expect(textarea).not.toBeNull();
    textarea!.value = '新的优化提示词 $CONTENT';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));

    expect(settings.contentOptimizationSettings.promptGroup[0].content).toBe('预设 $CONTENT');

    const saveButton = Array.from(drawer.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('Lưu prompt'));
    expect(saveButton).not.toBeUndefined();
    saveButton!.click();
    await new Promise(r => setTimeout(r, 0));

    expect(settings.contentOptimizationSettings.promptGroup[0].content).toBe('新的优化提示词 $CONTENT');
    expect(settings.contentOptimizationSettings.promptPresets[0].promptGroup[0].content).toBe('新的优化提示词 $CONTENT');
    expect(saveSettings).toHaveBeenCalled();

    app.unmount();
  });

  it('选择默认预设会载入内置提示词并写回设置', async () => {
    const { app, settings } = await mountContentReplacePage();

    const trigger = document.querySelector<HTMLButtonElement>('.acu-v2-content-replace-page .acu-preset-dd__trigger');
    expect(trigger).not.toBeNull();
    trigger!.click();
    await new Promise(r => setTimeout(r, 0));

    const defaultItem = Array.from(document.querySelectorAll<HTMLButtonElement>('.acu-v2-content-replace-page .acu-preset-dd__item'))
      .find(button => button.textContent?.includes('Preset mặc định'));
    expect(defaultItem).not.toBeUndefined();
    defaultItem!.click();
    await new Promise(r => setTimeout(r, 0));

    expect(document.querySelector('.acu-v2-content-replace-page')?.textContent || '').toContain('Prompt hiện tại: Preset mặc định');
    expect(settings.contentOptimizationSettings.promptGroup[0].content).not.toBe('预设 $CONTENT');
    expect(settings.contentOptimizationSettings.promptGroup.some((seg: any) => String(seg.content || '').includes('$CONTENT'))).toBe(true);

    app.unmount();
  });

  it('标签筛选新增空规则时先保留可编辑草稿，填完整后再写入设置', async () => {
    const { app, settings, saveSettings } = await mountContentReplacePage();

    const tagPanel = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-content-replace-page .acu-panel'))
      .find(panel => (panel.textContent || '').includes('Lọc theo thẻ')) as HTMLElement;
    expect(tagPanel).toBeDefined();

    const extractHeader = Array.from(tagPanel.querySelectorAll<HTMLButtonElement>('.acu-rule-pair-list__header'))
      .find(button => (button.textContent || '').includes('Quy tắc trích xuất thẻ nội dung')) as HTMLButtonElement;
    expect(extractHeader).toBeDefined();
    extractHeader.click();
    await new Promise(r => setTimeout(r, 0));

    const addButton = Array.from(tagPanel.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => (button.textContent || '').includes('Thêm quy tắc trích xuất')) as HTMLButtonElement;
    expect(addButton).toBeDefined();
    addButton.click();
    await new Promise(r => setTimeout(r, 0));

    let rows = Array.from(tagPanel.querySelectorAll<HTMLElement>('.acu-rule-pair-list__row'));
    expect(rows.length).toBe(1);
    expect(settings.contentOptimizationSettings.extractRules).toEqual([]);

    const inputs = rows[0].querySelectorAll<HTMLInputElement>('input');
    inputs[0].value = '<content>';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));
    expect(settings.contentOptimizationSettings.extractRules).toEqual([]);

    rows = Array.from(tagPanel.querySelectorAll<HTMLElement>('.acu-rule-pair-list__row'));
    const nextInputs = rows[0].querySelectorAll<HTMLInputElement>('input');
    nextInputs[1].value = '</content>';
    nextInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));

    expect(settings.contentOptimizationSettings.extractRules).toEqual([{ start: '<content>', end: '</content>' }]);
    expect(saveSettings).toHaveBeenCalled();

    app.unmount();
  });

  it('管理抽屉借鉴表格模板管理面板，不再显示保存当前提示词表单', async () => {
    const { app } = await mountContentReplacePage();

    const gearButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.acu-v2-content-replace-page button'))
      .find(button => button.getAttribute('title') === 'Quản lý preset');
    expect(gearButton).not.toBeUndefined();
    gearButton!.click();
    await new Promise(r => setTimeout(r, 0));

    const drawer = document.querySelector('.acu-v2-drawer') as HTMLElement | null;
    expect(drawer).not.toBeNull();
    const text = drawer!.textContent || '';
    expect(text).toContain('Quản lý preset thay thế nội dung');
    expect(text).not.toContain('Lưu prompt hiện tại');
    expect(text).not.toContain('Nạp preset');

    const titles = Array.from(drawer!.querySelectorAll<HTMLButtonElement>('.acu-v2-manage-item__actions button'))
      .map(button => button.getAttribute('title'));
    expect(titles).toContain('Xuất JSON');
    expect(titles).toContain('Đổi tên');
    expect(titles).toContain('Sửa prompt');
    expect(titles).toContain('Xóa');
    expect(titles).not.toContain('Đặt làm mặc định toàn cục');

    app.unmount();
  });

  it('手动测试使用当前正文替换配置并展示结果', async () => {
    const { app, performOptimization } = await mountContentReplacePage();

    const textarea = Array.from(document.querySelectorAll<HTMLTextAreaElement>('.acu-v2-content-replace-page textarea'))
      .find(el => el.placeholder === 'Nhập nội dung mô phỏng để kiểm tra prompt và định dạng trả về.');
    expect(textarea).not.toBeUndefined();
    textarea!.value = '这是一段足够长的测试正文。';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));

    const runButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.acu-v2-content-replace-page button'))
      .find(button => button.textContent?.includes('Chạy thử tối ưu'));
    expect(runButton).not.toBeUndefined();
    runButton!.click();
    await new Promise(r => setTimeout(r, 0));

    expect(performOptimization).toHaveBeenCalledWith('这是一段足够长的测试正文。', { currentLoop: 1, userMessage: '' });
    expect(document.querySelector('.acu-v2-content-replace-page')?.textContent || '').not.toContain('测试完成');
    expect(document.querySelector('.acu-v2-content-replace-page__test-output')?.textContent || '').toContain('Tối ưu hoàn tất: 1 đề xuất');

    app.unmount();
  });
});
