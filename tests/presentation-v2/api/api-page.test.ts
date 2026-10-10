/**
 * ApiPage 集成 — 页面结构、面板内预设管理
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const STORAGE_KEY = 'acu_v2_ui_state';

function createSettings() {
  return {
    apiMode: 'custom',
    apiConfig: { url: 'https://alpha.test', apiKey: '', model: 'ma', useMainApi: false, max_tokens: 1000, temperature: 0.7 },
    tavernProfile: '',
    streamingEnabled: false,
    apiPresets: [
      {
        name: 'alpha',
        apiMode: 'custom',
        apiConfig: { url: 'https://alpha.test', apiKey: '', model: 'ma', useMainApi: false, max_tokens: 1000, temperature: 0.7 },
        tavernProfile: '',
      },
      {
        name: 'beta',
        apiMode: 'custom',
        apiConfig: { url: '', apiKey: '', model: '', useMainApi: true, max_tokens: 60000, temperature: 1 },
        tavernProfile: '',
      },
    ],
    defaultApiPresetName: 'alpha',
    apiPresetBindingsByChat: { 'chat-page': { presetName: 'beta', updatedAt: 1 } },
    tableApiPresetOverridesByName: {},
    contentOptimizationSettings: { apiPreset: '' },
  };
}

async function mountApiPage(settings = createSettings()) {
  vi.resetModules();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ router: { activePageId: 'api' } }));
  vi.doMock('../../../src/service/runtime/state-manager', () => ({
    settings_ACU: settings,
    currentChatFileIdentifier_ACU: 'chat-page',
    getCurrentIsolationKey_ACU: () => '',
    coreApisAreReady_ACU: true,
  }));
  vi.doMock('../../../src/service/settings/settings-service', () => ({
    saveSettings_ACU: vi.fn(() => ({ saved: true, storageType: 'memory' })),
  }));
  vi.doMock('../../../src/service/ai/ai-service', () => ({
    getConnectionManagerProfiles_ACU: () => [],
    fetchAvailableModels_ACU: vi.fn(async () => ({ success: true, models: ['m1'] })),
  }));
  const mount = await import('../../../src/presentation-v2/bootstrap/mount');
  await mount.openAcuV2App();
  return { mount, settings };
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ApiPage', () => {
  it('PC 布局保持左右等宽分栏，不把单个面板拉满', () => {
    const source = readFileSync('src/presentation-v2/pages/ApiPage.vue', 'utf8');

    expect(source).toContain('<AcuPanelGrid class="acu-v2-api-page__grid">');
    expect(source).toContain('acu-v2-api-page__spacer');
    expect(source).toContain('<DanglingReferenceBanner scope="api" />');
  });

  it('悬挂填表预设时在页面标记失效引用，不隐式改写', async () => {
    const settings = createSettings() as any;
    settings.tableApiPreset = 'ghost';
    const { mount } = await mountApiPage(settings);
    const page = document.querySelector('.acu-v2-api-page');
    expect(page!.textContent).toContain('Preset API điền bảng「ghost」không còn tồn tại');
    expect(page!.textContent).toContain('cài đặt đã lưu sẽ không bị tự ghi lại');
    expect(settings.tableApiPreset).toBe('ghost');
    mount.__resetAcuV2MountForTests();
  });

  it('渲染 API 预设面板，选择和编辑集中在同一面板', async () => {
    const { mount } = await mountApiPage();

    const page = document.querySelector('.acu-v2-api-page');
    expect(page).not.toBeNull();
    expect(page!.textContent).toContain('Preset API');
    expect(page!.querySelectorAll('.acu-panel')).toHaveLength(1);
    expect(page!.textContent).not.toContain('交火模式向量服务');
    expect(page!.textContent).not.toContain('Embedding Endpoint');
    expect(page!.textContent).not.toContain('去交火模式配置');
    expect(page!.querySelector('input[placeholder*="embeddings"]')).toBeNull();
    expect(page!.textContent).not.toContain('重载');

    // Active preset shown in preset panel and opened in config panel.
    expect(page!.textContent).toContain('beta');
    expect(page!.textContent).not.toContain('流式输出');
    expect(page!.textContent).toContain('cuộc trò chuyện hiện tại');
    expect(page!.textContent).not.toContain('当前配置状态');
    expect(page!.textContent).not.toContain('已保存预设');
    expect(page!.textContent).toContain('Tên preset');
    expect(page!.textContent).toContain('Kiểu kết nối');
    expect(page!.textContent).toContain('Lưu preset hiện tại');
    expect(page!.querySelector('button[title="Sửa preset hiện tại"]')).toBeNull();

    const apiPanel = Array.from(page!.querySelectorAll<HTMLElement>('.acu-panel'))
      .find(panel => panel.querySelector('.acu-panel__title')?.textContent?.includes('Preset API'))!;
    expect(Array.from(page!.querySelectorAll<HTMLElement>('.acu-panel'))[0]).toBe(apiPanel);
    expect(apiPanel.querySelector('.acu-toggle')).toBeNull();
    expect(apiPanel.querySelector('button[title="Tạo preset mới"]')).not.toBeNull();
    expect(apiPanel.querySelector('button[title="Xóa preset hiện tại"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Quản lý preset API');

    // No import/export buttons (API presets are sensitive)
    expect(page!.textContent).not.toContain('Nhập');
    expect(page!.textContent).not.toContain('Xuất');

    mount.__resetAcuV2MountForTests();
  });

  it('当前 API 配置表单可直接保存活动预设并同步当前聊天绑定', async () => {
    const { mount, settings } = await mountApiPage();

    const page = document.querySelector('.acu-v2-api-page') as HTMLElement;
    const nameRow = Array.from(page.querySelectorAll('.acu-form-row'))
      .find(row => (row.textContent || '').includes('Tên preset')) as HTMLElement;
    const nameInput = nameRow.querySelector('input') as HTMLInputElement;
    expect(nameInput.value).toBe('beta');

    nameInput.value = 'beta-renamed';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();

    const saveButton = Array.from(page.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Lưu preset hiện tại')) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
    saveButton.click();
    await Promise.resolve();

    expect(settings.apiPresets.some((preset: any) => preset.name === 'beta-renamed')).toBe(true);
    expect(settings.apiPresetBindingsByChat['chat-page'].presetName).toBe('beta-renamed');
    expect(page.textContent || '').not.toContain('Đã lưu preset API hiện tại');
    expect(document.body.textContent || '').toContain('Đã lưu preset API hiện tại');

    mount.__resetAcuV2MountForTests();
  });

  it('API 预设下拉可切换当前聊天并设置全局默认', async () => {
    const { mount, settings } = await mountApiPage();

    const trigger = document.querySelector('.acu-v2-api-page .acu-preset-dd__trigger') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger!.textContent).toContain('beta');

    trigger!.click();
    await Promise.resolve();
    const items = Array.from(document.querySelectorAll('.acu-v2-api-page .acu-preset-dd__item')) as HTMLElement[];
    items.find(item => item.textContent?.includes('alpha'))!.click();
    await Promise.resolve();
    expect(settings.apiPresetBindingsByChat['chat-page'].presetName).toBe('alpha');

    trigger!.click();
    await Promise.resolve();
    const stars = Array.from(document.querySelectorAll('.acu-v2-api-page .acu-preset-dd__star')) as HTMLButtonElement[];
    stars.find(star => star.closest('.acu-preset-dd__item')?.textContent?.includes('beta'))!.click();
    await Promise.resolve();
    expect(settings.defaultApiPresetName).toBe('beta');

    mount.__resetAcuV2MountForTests();
  });

  it('无预设时提示并可通过图标新建，第一个预设保存后自动选中', async () => {
    const emptySettings = createSettings();
    emptySettings.apiPresets = [];
    emptySettings.defaultApiPresetName = '';
    emptySettings.apiPresetBindingsByChat = {};
    const { mount, settings } = await mountApiPage(emptySettings);

    const page = document.querySelector('.acu-v2-api-page') as HTMLElement;
    expect(page.querySelector('.acu-message')).not.toBeNull();

    const createButton = Array.from(page.querySelectorAll<HTMLButtonElement>('button'))
      .find(btn => btn.getAttribute('title') === 'Tạo preset mới')!;
    createButton.click();
    await Promise.resolve();

    const nameRow = Array.from(page.querySelectorAll('.acu-form-row'))
      .find(row => (row.textContent || '').includes('Tên preset')) as HTMLElement;
    const nameInput = nameRow.querySelector('input') as HTMLInputElement;
    nameInput.value = 'first-api';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();

    const saveButton = Array.from(page.querySelectorAll<HTMLButtonElement>('button'))
      .find(btn => btn.textContent?.includes('Lưu và chọn preset'))!;
    saveButton.click();
    await Promise.resolve();

    expect(settings.apiPresets.some((preset: any) => preset.name === 'first-api')).toBe(true);
    expect(settings.apiPresetBindingsByChat['chat-page'].presetName).toBe('first-api');
    expect(page.textContent || '').not.toContain('Đã lưu preset API hiện tại');
    expect(document.body.textContent || '').toContain('Đã lưu preset API hiện tại');

    mount.__resetAcuV2MountForTests();
  });
  it('自定义标签默认启用酒馆渠道，手动关闭后超时和开关保存重开仍保持', async () => {
    const settings = createSettings();
    settings.apiPresetBindingsByChat['chat-page'].presetName = 'alpha';
    const { mount } = await mountApiPage(settings);
    const page = document.querySelector('.acu-v2-api-page') as HTMLElement;
    const toggle = page.querySelector('[aria-label="Gửi qua kênh SillyTavern"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    const timeoutRow = Array.from(page.querySelectorAll('.acu-form-row')).find(row => row.textContent?.includes('Hết thời gian chờ (giây)'))!;
    const input = timeoutRow.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('300');
    input.value = '75';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    toggle.click();
    await Promise.resolve();
    const save = Array.from(page.querySelectorAll('button')).find(button => button.textContent?.includes('Lưu preset hiện tại'))!;
    save.click();
    await Promise.resolve();
    expect(settings.apiPresets.find(preset => preset.name === 'alpha')!.apiConfig).toMatchObject({ requestTimeoutSeconds: 75, sendViaTavern: false });
    expect(settings.apiConfig).toMatchObject({ requestTimeoutSeconds: 75, sendViaTavern: false });
    mount.__resetAcuV2MountForTests();
    const reopened = await mountApiPage(settings);
    expect(document.querySelector('[aria-label="Gửi qua kênh SillyTavern"]')!.getAttribute('aria-checked')).toBe('false');
    const restoredRow = Array.from(document.querySelectorAll('.acu-form-row')).find(row => row.textContent?.includes('Hết thời gian chờ (giây)'))!;
    expect((restoredRow.querySelector('input') as HTMLInputElement).value).toBe('75');
    reopened.mount.__resetAcuV2MountForTests();
  });

});
