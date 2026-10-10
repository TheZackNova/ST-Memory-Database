/**
 * FormFillPage 集成 — 更新参数、规则列表、提示词段、手动填表
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'acu_v2_ui_state';

function createSettings() {
  return {
    autoUpdateThreshold: 3,
    autoUpdateFrequency: 2,
    updateBatchSize: 2,
    manualUpdateContextDepth: null,
    manualUpdateBatchSize: null,
    maxConcurrentGroups: 1,
    skipUpdateFloors: 0,
    retainRecentLayers: 100,
    autoUpdateTokenThreshold: 500,
    tableMaxRetries: 3,
    tableEditLastPairOnly: true,
    tableContextExtractTags: '',
    tableContextExtractRules: [{ start: '<正文>', end: '</正文>' }],
    tableContextExcludeTags: '',
    tableContextExcludeRules: [{ start: '<think>', end: '</think>' }],
    storageMode: 'native',
    apiPresets: [{ name: 'fast', apiMode: 'custom', apiConfig: { url: '', apiKey: '', model: '', useMainApi: true, max_tokens: 1000, temperature: 1 }, tavernProfile: '' }],
    defaultApiPresetName: 'fast',
    apiPresetBindingsByChat: {},
    tableApiPreset: '',
    manualSelectedTables: [],
    hasManualSelection: false,
    charCardPrompt: [
      { role: 'SYSTEM', content: '系统段', deletable: true },
      { role: 'USER', content: '主任务', mainSlot: 'A', isMain: true, deletable: false },
      { role: 'USER', content: '数据段', mainSlot: 'B', isMain2: true, deletable: false },
    ],
  } as any;
}

function createTableData() {
  return {
    sheet_a: { name: '角色状态', content: [['id'], ['1']], updateConfig: { updateFrequency: -1, skipFloors: -1 } },
    sheet_b: { name: '事件记录', content: [['id'], ['1'], ['2']], updateConfig: { updateFrequency: -1, skipFloors: -1 } },
  };
}

async function mountFormFillPage(
  settings = createSettings(),
  activePageId = 'form-fill',
  checkpointFloors = [
    { messageIndex: 1, aiFloor: 1, reason: 'init', createdAt: 1 },
    // 历史 fixture：reason:'periodic' 仅表示旧数据兼容，新策略不再生成 periodic full checkpoint。
    { messageIndex: 4, aiFloor: 3, reason: 'periodic', createdAt: 2 },
  ],
) {
  vi.resetModules();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  const { ref, computed } = await import('vue');
  const saveSettings = vi.fn(() => ({ saved: true, storageType: 'memory' }));
  const orchestrate = vi.fn(async (..._args: any[]) => ({ success: true }));
  const catchUpPlan = {
    targetAiFloor: 3,
    targetMessageIndex: 4,
    planSignature: 'catch-up-plan',
    waves: [
      {
        startAiFloor: 2,
        endAiFloor: 2,
        messageIndices: [3],
        sheetKeys: ['sheet_a'],
        groups: [{ key: 'a', groupId: 0, batchSize: 1, sheetKeys: ['sheet_a'], requestOptions: null, updateMode: 'manual_independent', executionKind: 'standard' }],
      },
      {
        startAiFloor: 3,
        endAiFloor: 3,
        messageIndices: [4],
        sheetKeys: ['sheet_a', 'sheet_b'],
        groups: [{ key: 'ab', groupId: 0, batchSize: 1, sheetKeys: ['sheet_a', 'sheet_b'], requestOptions: null, updateMode: 'manual_independent', executionKind: 'standard' }],
      },
    ],
  };
  const prepareCatchUp = vi.fn(async (..._args: any[]) => ({ success: true, plan: catchUpPlan }));
  const orchestrateCatchUp = vi.fn(async (..._args: any[]) => ({ success: true, outcome: 'complete', committedBucketCount: 2, catchUpPlan }));
  const refreshMergedData = vi.fn(async () => ({ degraded: false }));
  const executeCore = vi.fn(async (..._args: any[]) => ({ success: true, modifiedKeys: [] }));
  const processUpdatesBatch = vi.fn(async (indices: number[], mode: string, options: any, executeUpdate: any) => {
    if (options?.__skipExecuteForTest) return { success: true };
    return executeUpdate(
      [{ mes: 'AI回复' }],
      indices[indices.length - 1] ?? -1,
      mode,
      false,
      options?.targetSheetKeys ?? null,
      options?.requestOptions ?? null,
      { currentBatch: 1, totalBatches: 1 },
    );
  });
  const manualExtraHintSetter = vi.fn();
  const abortAllActiveRequests = vi.fn();
  const setWasStoppedByUser = vi.fn();
  const setIsAutoUpdatingCard = vi.fn();
  const openVisualizer = vi.fn(async () => {});

  const worldbookConfig: any = {
    source: 'character',
    manualSelection: [],
    enabledEntries: {},
    injectionTarget: 'character',
  };

  vi.doMock('../../../src/service/runtime/state-manager', () => ({
    settings_ACU: settings,
    currentChatFileIdentifier_ACU: 'chat-form-fill',
    currentJsonTableData_ACU: createTableData(),
    getCurrentIsolationKey_ACU: () => '',
    coreApisAreReady_ACU: true,
    _set_manualExtraHint_ACU: manualExtraHintSetter,
    abortAllActiveRequests_ACU: abortAllActiveRequests,
    _set_wasStoppedByUser_ACU: setWasStoppedByUser,
    _set_isAutoUpdatingCard_ACU: setIsAutoUpdatingCard,
  }));
  vi.doMock('../../../src/service/settings/settings-service', () => ({
    saveSettings_ACU: saveSettings,
    setGlobalPlotEnabled_ACU: vi.fn((enabled: boolean) => { settings.plotSettings = { ...(settings.plotSettings || {}), enabled }; }),
    setZeroTkOccupyMode_ACU: vi.fn((enabled: boolean) => { settings.zeroTkOccupyModeDefault = enabled; }),
    setSummaryVectorIndexMode_ACU: vi.fn((enabled: boolean) => { settings.summaryVectorIndexModeDefault = enabled; }),
  }));
  vi.doMock('../../../src/service/chat/chat-service', () => ({
    getChatArray_ACU: () => [
      { is_user: true, mes: 'u1' },
      { is_user: false, mes: 'a1' },
      { is_user: true, mes: 'u2' },
      { is_user: false, mes: 'a2' },
      { is_user: false, mes: 'a3' },
    ],
  }));
  vi.doMock('../../../src/service/settings/settings-readers', () => ({
    getCurrentWorldbookConfig_ACU: () => worldbookConfig,
    getCurrentCharSettings_ACU: () => ({ worldbookConfig }),
    getCurrentTableDisplayData_ACU: () => createTableData(),
    hasRuntimeTableData_ACU: () => true,
  }));
  vi.doMock('../../../src/presentation-v2/composables/useTableTemplatePresets', () => ({
    useTableTemplatePresets: () => ({
      busy: ref(false),
      message: ref(null),
      selectedGlobalPreset: ref('global-A'),
      selectedGlobalPresetValue: ref('global:global-A'),
      selectedChatPreset: ref('global:global-A'),
      selectedChatPresetLabel: ref('global-A（全局预设）'),
      isChatOverridden: computed(() => false),
      chatPresetItems: ref([
        { value: 'global:', label: 'Preset mặc định (toàn cục)', meta: '2 张表' },
        { value: 'global:global-A', label: 'global-A（全局预设）', meta: '2 张表' },
      ]),
      chatArchiveItems: ref([]),
      runtimeTemplateItem: ref(null),
      runtimeDiffersFromLibrary: ref(false),
      runtimeTemplateAvailable: ref(false),
      chatSnapshotDiffersFromLibrary: ref(false),
      refresh: vi.fn(),
      selectGlobalPreset: vi.fn(async () => {}),
      selectChatPreset: vi.fn(async () => {}),
      importPresetForCurrentChat: vi.fn(async () => {}),
      restoreArchivedChatTemplate: vi.fn(async () => {}),
      exportTemplate: vi.fn(),
    }),
  }));
  vi.doMock('../../../src/presentation-v2/composables/useTablePresetManagement', () => ({
    useTablePresetManagement: () => ({
      drawerView: ref('closed'),
      isDrawerOpen: computed(() => false),
      title: computed(() => ''),
      busy: ref(false),
      message: ref(null),
      presetMeta: ref([]),
      defaultPresetName: ref('global-A'),
      refresh: vi.fn(),
      openManage: vi.fn(),
      closeDrawer: vi.fn(),
      openVisualizer,
      editPreset: vi.fn(async () => {}),
      setAsDefault: vi.fn(async () => {}),
      deletePreset: vi.fn(async () => {}),
      exportPreset: vi.fn(),
      renamePreset: vi.fn(async () => {}),
      createBlankPreset: vi.fn(async () => {}),
    }),
  }));
  vi.doMock('../../../src/service/table/storage-mode', () => ({
    getCurrentStorageMode: () => settings.storageMode,
  }));
  vi.doMock('../../../src/service/template/chat-scope', () => ({
    getSortedSheetKeys_ACU: (data: any) => Object.keys(data).filter(k => k.startsWith('sheet_')),
  }));
  vi.doMock('../../../src/service/template/template-preset-service', () => ({
    getActiveTemplatePresetMeta_ACU: () => ({ displayName: 'Preset mặc định', scopeLabel: 'Toàn cục' }),
  }));
  vi.doMock('../../../src/service/table/table-history', () => ({
    collectV2CheckpointFloorsFromChat_ACU: () => checkpointFloors,
    resolveTableHistoryStateFromChat_ACU: (_chat: any[], options: any) => ({
      latestAiMessageIndex: 4,
      latestDataMessageIndex: 3,
      lastTrackedUpdateMessageIndex: options.sheetKey === 'sheet_a' ? 1 : -1,
      latestDataAiFloor: 2,
      lastTrackedUpdateAiFloor: options.sheetKey === 'sheet_a' ? 1 : 0,
      hasAnyData: true,
      hasTrackedUpdate: options.sheetKey === 'sheet_a',
    }),
  }));
  vi.doMock('../../../src/service/table/table-storage-strategy', () => ({
    reloadStorageProvider: vi.fn(async () => {}),
    switchStorageMode: vi.fn(async (mode: string) => { settings.storageMode = mode; }),
  }));
  vi.doMock('../../../src/service/table/update-orchestrator', () => ({
    orchestrateManualUpdate_ACU: orchestrate,
    orchestrateManualCatchUp_ACU: orchestrateCatchUp,
    prepareManualCatchUpPlan_ACU: prepareCatchUp,
    processUpdatesBatch_ACU: processUpdatesBatch,
    executeCardUpdateCore_ACU: executeCore,
  }));
  vi.doMock('../../../src/service/ai/ai-service', () => ({
    getConnectionManagerProfiles_ACU: (): any[] => [],
    fetchAvailableModels_ACU: vi.fn(async () => ({ success: true, models: [] })),
  }));
  vi.doMock('../../../src/service/worldbook/pipeline', () => ({
    refreshMergedDataAndNotify_ACU: refreshMergedData,
    getWorldbookNames_ACU: vi.fn(async () => ['world-X', 'world-Y']),
    getLorebookEntriesByNames_ACU: vi.fn(async () => ({
      'CharBookFF': [
        { uid: 11, comment: '角色概念', name: '角色概念', enabled: true },
        { uid: 12, comment: '人物关系', name: '人物关系', enabled: true },
      ],
    })),
  }));
  vi.doMock('../../../src/service/worldbook/worldbook-service', () => ({
    getCurrentCharPrimaryLorebook_ACU: vi.fn(async () => 'CharBookFF'),
    getCharLorebooks_ACU: vi.fn(async () => ({ primary: 'CharBookFF', additional: [] })),
  }));

  vi.spyOn(window, 'confirm').mockReturnValue(false);

  const mount = await import('../../../src/presentation-v2/bootstrap/mount');
  // 上一用例的双 rAF 完成回调可能在异步 import 期间写回旧路由；种子必须紧贴挂载同步写入。
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ uiTierV2: { tier: 'high' }, router: { activePageId } }));
  await mount.openAcuV2App();
  const pinia = mount.getAcuV2PiniaForBridge()!;
  const { useRouterStore } = await import('../../../src/presentation-v2/stores/router-store');
  const { useUiModeStore } = await import('../../../src/presentation-v2/stores/ui-mode-store');
  expect({ tier: useUiModeStore(pinia).tier, page: useRouterStore(pinia).activePageId }).toEqual({ tier: 'high', page: activePageId });
  await new Promise(r => setTimeout(r, 0));
  return {
    mount,
    settings,
    saveSettings,
    orchestrate,
    prepareCatchUp,
    orchestrateCatchUp,
    refreshMergedData,
    processUpdatesBatch,
    executeCore,
    worldbookConfig,
    manualExtraHintSetter,
    abortAllActiveRequests,
    setWasStoppedByUser,
    setIsAutoUpdatingCard,
    openVisualizer,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * 确认弹窗在异步准备（解析世界书注入目标等）之后才出现，不能假设固定的微任务数。
 * 轮询直到弹窗层出现；超过上限则抛错，避免用例在弹窗缺失时静默通过或死循环。
 */
async function waitForDialogLayer(maxTicks = 50): Promise<HTMLElement> {
  for (let tick = 0; tick < maxTicks; tick += 1) {
    const layer = document.querySelector<HTMLElement>('.acu-dialog-layer');
    if (layer) return layer;
    await Promise.resolve();
    if (tick % 5 === 4) await new Promise(r => setTimeout(r, 0));
  }
  throw new Error('等待确认弹窗出现超时');
}

async function clickDialogButton(label: string): Promise<void> {
  const layer = await waitForDialogLayer();
  expect(layer).not.toBeNull();
  const button = Array.from(layer!.querySelectorAll<HTMLButtonElement>('button'))
    .find(item => item.textContent?.includes(label));
  expect(button).not.toBeUndefined();
  button!.click();
  await new Promise(r => setTimeout(r, 0));
}

/** 通知不再有常驻列表视口（改由单气泡轮播），断言直接读 toast-store 的当前条目。 */
async function toastStoreOf(mount: any) {
  const { useToastStore } = await import('../../../src/presentation-v2/stores/toast-store');
  return useToastStore(mount.getAcuV2PiniaForBridge()!);
}

async function readToastText(mount: any): Promise<string> {
  return (await toastStoreOf(mount)).items.map(item => item.text).join('\n');
}

async function clickToastAction(mount: any, label: string): Promise<void> {
  const item = (await toastStoreOf(mount)).items.find(entry => entry.action?.label.includes(label));
  expect(item).toBeDefined();
  await item!.action!.onClick();
}

describe('FormFillPage', () => {
  it('渲染填表工作台的状态、自动更新、表格模板与手动填表面板', async () => {
    const { mount } = await mountFormFillPage();

    const page = document.querySelector('.acu-v2-form-fill-page');
    expect(page).not.toBeNull();
    const text = page!.textContent || '';
    expect(document.querySelector('.acu-v2-app__page-title')?.textContent || '').toContain('Bàn điền bảng');
    expect(text).toContain('Trạng thái bảng');
    expect(text).toContain('Cuộc trò chuyện hiện tại');
    expect(text).toContain('chat-form-fill');
    expect(text).toContain('Số tầng phản hồi AI tích lũy');
    expect(text).toContain('角色状态');
    expect(text).toContain('事件记录');
    expect(text).not.toContain('就绪:角色状态');
    expect(text).not.toContain('Lần tiếp theo:');
    const statusLine = page!.querySelector('.acu-v2-form-fill-page__status-line');
    expect(statusLine).not.toBeNull();
    expect((statusLine!.textContent || '').replace(/\s+/g, '')).toContain('Cuộctròchuyệnhiệntại:chat-form-fill·SốtầngphảnhồiAItíchlũy:3');
    expect(text).toContain('Cài đặt cập nhật tự động');
    expect(text).toContain('Khoảng cách tự động điền bảng');
    expect(text).toContain('Không điền bảng tầng mới nhất');
    expect(text).not.toContain('并发策略');
    expect(text).not.toContain('历史数据保留');
    expect(text).not.toContain('沿用当前自定义参数');
    expect(text).not.toContain('内容过滤');
    expect(text).not.toContain('填表触发条件');
    expect(document.getElementById('form-fill-trigger-panel')).toBeNull();
    expect(text).not.toContain('高级数值');
    expect(text).not.toContain('填表注入目标世界书');
    expect(text).not.toContain('填表附加世界书条目');
    // 填表规则已并入填表工作台：提示词、标签筛选、写入目标与附加条目常驻本页。
    expect(text).toContain('Prompt điền bảng');
    expect(text).toContain('Sửa prompt');
    expect(text).toContain('Lọc theo thẻ');
    expect(text).toContain('Mục sổ thế giới bổ sung');
    expect(text).not.toContain('段落数量');
    expect(text).not.toContain('保存状态');
    expect(text).toContain('Điền bảng thủ công');
    expect(text).toContain('Preset API điền bảng');
    expect(text).toContain('Yêu cầu bổ sung cho lần điền bảng này');
    expect(text).toContain('full checkpoint hiện tại');
    expect(text).toContain('Tầng AI 1 (Mốc cơ sở ban đầu)');
    expect(text).toContain('Tầng AI 3 (Mốc cơ sở chu kỳ lịch sử)');
    expect(text).toContain('phạm vi dự kiến xử lý');
    expect(text).toContain('Chạy điền bảng thủ công');
    expect(text).toContain('Preset mẫu bảng');
    expect(text).toContain('Mở trình chỉnh sửa bảng trực quan');
    expect(text).not.toContain('立即构建交火纪要索引');
    expect(page!.querySelector('.acu-prompt-segs')).toBeNull();
    const panelTitles = Array.from(page!.querySelectorAll('.acu-v2-form-fill-page__grid > .acu-panel .acu-panel__title'))
      .map(title => (title.textContent || '').trim());
    expect(panelTitles).toEqual(['Trạng thái bảng', 'Cài đặt cập nhật tự động', 'Điền bảng thủ công', 'Preset mẫu bảng']);
    const ruleTitles = Array.from(page!.querySelectorAll('.acu-v2-form-fill-page__col .acu-panel__title'))
      .map(title => (title.textContent || '').trim());
    expect(ruleTitles).toEqual(['Prompt điền bảng', 'Lọc theo thẻ', 'Sổ thế giới đích để ghi', 'Mục sổ thế giới bổ sung']);
    const mobileNavItems = Array.from(page!.querySelectorAll('.acu-mobile-panel-nav__item'))
      .map(item => (item.textContent || '').trim());
    expect(mobileNavItems).toEqual(['Trạng thái bảng', 'Cập nhật tự động', 'Điền bảng thủ công', 'Preset mẫu bảng', 'Prompt', 'Lọc theo thẻ', 'Sổ thế giới đích để ghi', 'Mục sổ thế giới bổ sung']);
    expect(document.getElementById('form-fill-update-panel')).not.toBeNull();
    expect(page!.querySelector('.acu-v2-form-fill-page__panel--manual')).not.toBeNull();

    mount.__resetAcuV2MountForTests();
  });

  it('标签筛选里的 tableEdit 解析开关会保存设置', async () => {
    const { mount, settings, saveSettings } = await mountFormFillPage(createSettings(), 'form-fill');

    const toggle = document.querySelector(
      'button[data-acu-setting-key="tableEditLastPairOnly"]',
    ) as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    toggle.click();
    await Promise.resolve();

    expect(settings.tableEditLastPairOnly).toBe(false);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(saveSettings).toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it('每个主页面板都渲染常驻说明信息条', async () => {
    const { mount } = await mountFormFillPage();

    const panels = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-form-fill-page > .acu-v2-form-fill-page__grid > .acu-panel'));
    expect(panels.length).toBeGreaterThan(0);
    for (const panel of panels) {
      expect(panel.querySelector('.acu-panel__header .acu-info-banner')).toBeNull();
      expect(panel.querySelector('.acu-panel__description-region .acu-info-banner')).not.toBeNull();
    }

    mount.__resetAcuV2MountForTests();
  });

  it('填表 API 预设下拉的跟随项显示当前活动 API 预设名', async () => {
    const { mount } = await mountFormFillPage();

    const updatePanel = Array.from(document.querySelectorAll<HTMLElement>('.acu-panel'))
      .find(panel => panel.querySelector('.acu-panel__title')?.textContent?.includes('Cài đặt cập nhật tự động'))!;
    const apiRow = Array.from(updatePanel.querySelectorAll<HTMLElement>('.acu-form-row'))
      .find(row => (row.textContent || '').includes('Preset API điền bảng'))!;
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

    mount.__resetAcuV2MountForTests();
  });

  it('高级参数中的触发条件数字字段会归一化并保存 settings', async () => {
    const { mount, settings, saveSettings } = await mountFormFillPage();

    const updatePanel = Array.from(document.querySelectorAll<HTMLElement>('.acu-panel'))
      .find(panel => panel.querySelector('.acu-panel__title')?.textContent?.includes('Cài đặt cập nhật tự động'))!;
    const advancedHeader = Array.from(updatePanel.querySelectorAll<HTMLButtonElement>('.acu-disclosure-group__header'))
      .find(btn => (btn.textContent || '').includes('Tham số nâng cao'))!;
    advancedHeader.click();
    await Promise.resolve();

    const tokenRow = Array.from(updatePanel.querySelectorAll<HTMLElement>('.acu-disclosure-group .acu-form-row'))
      .find(row => (row.textContent || '').includes('Độ dài tối thiểu của phản hồi AI'))!;
    const tokenInput = tokenRow.querySelector<HTMLInputElement>('input[type="number"]')!;
    tokenInput.value = '7';
    tokenInput.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(settings.autoUpdateTokenThreshold).toBe(7);
    expect(saveSettings).toHaveBeenCalled();
    expect(document.querySelector('.acu-v2-form-fill-page')?.textContent || '').not.toContain('设置已保存');

    mount.__resetAcuV2MountForTests();
  });

  it('自动更新设置选项会写入更新间隔与保留最新层字段', async () => {
    const optionSettings = {
      ...createSettings(),
      autoUpdateThreshold: 3,
      autoUpdateFrequency: 1,
      updateBatchSize: 3,
      maxConcurrentGroups: 1,
      skipUpdateFloors: 0,
      retainRecentLayers: 100,
    };
    const { mount, settings, saveSettings } = await mountFormFillPage(optionSettings);

    const updatePanel = Array.from(document.querySelectorAll<HTMLElement>('.acu-panel'))
      .find(panel => panel.querySelector('.acu-panel__title')?.textContent?.includes('Cài đặt cập nhật tự động'))!;
    expect(updatePanel.querySelectorAll<HTMLInputElement>('input[type="number"]')).toHaveLength(0);
    expect(updatePanel.textContent || '').toContain('Tham số nâng cao');

    const intervalRow = Array.from(updatePanel.querySelectorAll<HTMLElement>('.acu-form-row'))
      .find(row => (row.textContent || '').includes('Khoảng cách tự động điền bảng'))!;
    const intervalTrigger = intervalRow.querySelector<HTMLButtonElement>('.acu-select__trigger')!;
    intervalTrigger.click();
    await Promise.resolve();
    expect(intervalRow.textContent || '').toContain('Mỗi 1 tầng: kịp thời nhất');
    expect(intervalRow.textContent || '').not.toContain('每 2 层：常用节奏');
    expect(intervalRow.textContent || '').toContain('Mỗi 3 tầng: cân bằng');
    expect(intervalRow.textContent || '').toContain('Mỗi 5 tầng: tần suất thấp, tiết kiệm API');
    expect(Array.from(intervalRow.querySelectorAll<HTMLElement>('.acu-select__item'))
      .map(item => (item.textContent || '').trim())).not.toContain('Tùy chỉnh');
    const everyOne = Array.from(intervalRow.querySelectorAll<HTMLElement>('.acu-select__item'))
      .find(item => (item.textContent || '').trim() === 'Mỗi 1 tầng: kịp thời nhất')!;
    everyOne.click();
    await Promise.resolve();
    expect(settings.autoUpdateThreshold).toBe(3);
    expect(settings.autoUpdateFrequency).toBe(1);
    expect(settings.updateBatchSize).toBe(3);

    intervalTrigger.click();
    await Promise.resolve();
    const everyThree = Array.from(intervalRow.querySelectorAll<HTMLElement>('.acu-select__item'))
      .find(item => (item.textContent || '').trim() === 'Mỗi 3 tầng: cân bằng')!;
    everyThree.click();
    await Promise.resolve();
    expect(settings.autoUpdateThreshold).toBe(3);
    expect(settings.autoUpdateFrequency).toBe(3);
    expect(settings.updateBatchSize).toBe(3);

    intervalTrigger.click();
    await Promise.resolve();
    const everyFive = Array.from(intervalRow.querySelectorAll<HTMLElement>('.acu-select__item'))
      .find(item => (item.textContent || '').trim() === 'Mỗi 5 tầng: tần suất thấp, tiết kiệm API')!;
    everyFive.click();
    await Promise.resolve();
    expect(settings.autoUpdateThreshold).toBe(5);
    expect(settings.autoUpdateFrequency).toBe(5);
    expect(settings.updateBatchSize).toBe(5);

    const skipRow = Array.from(updatePanel.querySelectorAll<HTMLElement>('.acu-form-row'))
      .find(row => (row.textContent || '').includes('Không điền bảng tầng mới nhất'))!;
    skipRow.querySelector<HTMLButtonElement>('.acu-toggle')!.click();
    await Promise.resolve();
    expect(settings.skipUpdateFloors).toBe(1);
    expect(updatePanel.textContent || '').not.toContain('并发策略');
    expect(updatePanel.textContent || '').not.toContain('历史数据保留');

    expect(saveSettings).toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it('高级参数可编辑自动更新字段和触发条件字段，改成非快捷组合后显示自定义', async () => {
    const { mount, settings, saveSettings } = await mountFormFillPage({
      ...createSettings(),
      autoUpdateThreshold: 3,
      autoUpdateFrequency: 3,
      updateBatchSize: 3,
      skipUpdateFloors: 0,
    });

    const updatePanel = Array.from(document.querySelectorAll<HTMLElement>('.acu-panel'))
      .find(panel => panel.querySelector('.acu-panel__title')?.textContent?.includes('Cài đặt cập nhật tự động'))!;
    const intervalRow = Array.from(updatePanel.querySelectorAll<HTMLElement>('.acu-form-row'))
      .find(row => (row.textContent || '').includes('Khoảng cách tự động điền bảng'))!;
    expect(intervalRow.querySelector('.acu-select__trigger')?.textContent || '').toContain('Mỗi 3 tầng: cân bằng');

    const advancedHeader = Array.from(updatePanel.querySelectorAll<HTMLButtonElement>('.acu-disclosure-group__header'))
      .find(btn => (btn.textContent || '').includes('Tham số nâng cao'))!;
    advancedHeader.click();
    await Promise.resolve();

    const advancedRows = Array.from(updatePanel.querySelectorAll<HTMLElement>('.acu-disclosure-group .acu-form-row'));
    expect(advancedRows.map(row => (row.textContent || '').trim()).join('|')).toContain('Số tầng ngữ cảnh điền bảng');
    expect(advancedRows.map(row => (row.textContent || '').trim()).join('|')).toContain('Tần suất tự động điền bảng');
    expect(advancedRows.map(row => (row.textContent || '').trim()).join('|')).toContain('Số tầng mỗi lô');
    expect(advancedRows.map(row => (row.textContent || '').trim()).join('|')).toContain('Số phản hồi mới nhất bỏ qua');
    expect(advancedRows.map(row => (row.textContent || '').trim()).join('|')).toContain('Độ dài tối thiểu của phản hồi AI');
    expect(advancedRows.map(row => (row.textContent || '').trim()).join('|')).toContain('Số lần thử lại tối đa khi điền bảng');
    expect(advancedRows).toHaveLength(6);

    const batchRow = advancedRows.find(row => (row.textContent || '').includes('Số tầng mỗi lô'))!;
    const batchInput = batchRow.querySelector<HTMLInputElement>('input[type="number"]')!;
    batchInput.value = '2';
    batchInput.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(settings.updateBatchSize).toBe(2);
    expect(intervalRow.querySelector('.acu-select__trigger')?.textContent || '').toContain('Tùy chỉnh');
    intervalRow.querySelector<HTMLButtonElement>('.acu-select__trigger')!.click();
    await Promise.resolve();
    expect(Array.from(intervalRow.querySelectorAll<HTMLElement>('.acu-select__item'))
      .map(item => (item.textContent || '').trim())).not.toContain('Tùy chỉnh');

    const skipRow = advancedRows.find(row => (row.textContent || '').includes('Số phản hồi mới nhất bỏ qua'))!;
    const skipInput = skipRow.querySelector<HTMLInputElement>('input[type="number"]')!;
    skipInput.value = '2';
    skipInput.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(settings.skipUpdateFloors).toBe(2);
    expect(updatePanel.textContent || '').toContain('Không điền bảng tầng mới nhất: tùy chỉnh');
    expect(saveSettings).toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it('打开提示词抽屉时不显示其他面板的保存消息', async () => {
    const { mount } = await mountFormFillPage(createSettings(), 'form-fill');

    const toggle = document.querySelector(
      'button[data-acu-setting-key="tableEditLastPairOnly"]',
    ) as HTMLButtonElement;
    toggle.click();
    await Promise.resolve();

    const openButton = Array.from(document.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Sửa prompt')) as HTMLButtonElement;
    openButton.click();
    await Promise.resolve();

    const drawer = document.querySelector('.acu-v2-drawer') as HTMLElement;
    expect(drawer).not.toBeNull();
    expect(drawer.textContent || '').not.toContain('设置已保存');

    mount.__resetAcuV2MountForTests();
  });

  it('添加排除规则会写入结构化规则', async () => {
    const { mount, settings, saveSettings } = await mountFormFillPage(createSettings(), 'form-fill');

    const excludePanel = Array.from(document.querySelectorAll('.acu-panel'))
      .find(panel => (panel.textContent || '').includes('Quy tắc loại trừ')) as HTMLElement;
    // 非空规则列表默认折叠：先展开“排除规则”再点击“添加”按钮。
    const expandHeader = Array.from(excludePanel.querySelectorAll<HTMLButtonElement>('.acu-rule-pair-list__header'))
      .find(btn => (btn.textContent || '').includes('Quy tắc loại trừ')) as HTMLButtonElement;
    expect(expandHeader).toBeDefined();
    expandHeader.click();
    await Promise.resolve();
    const excludeList = expandHeader.closest('.acu-rule-pair-list') as HTMLElement;
    const addButton = Array.from(excludePanel.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Thêm quy tắc loại trừ')) as HTMLButtonElement;
    addButton.click();
    await Promise.resolve();

    let rows = Array.from(excludeList.querySelectorAll<HTMLElement>('.acu-rule-pair-list__row'));
    expect(rows.length).toBe(2);
    expect(settings.tableContextExcludeRules.length).toBe(1);
    expect(settings.tableContextExcludeRules[0]).toEqual({ start: '<think>', end: '</think>' });

    const inputs = rows[1].querySelectorAll<HTMLInputElement>('input');
    inputs[0].value = '<note>';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
    expect(settings.tableContextExcludeRules.length).toBe(1);

    rows = Array.from(excludeList.querySelectorAll<HTMLElement>('.acu-rule-pair-list__row'));
    const nextInputs = rows[1].querySelectorAll<HTMLInputElement>('input');
    nextInputs[1].value = '</note>';
    nextInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();

    expect(settings.tableContextExcludeRules).toContainEqual({ start: '<note>', end: '</note>' });
    expect(saveSettings).toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it('提示词编辑器只在侧抽屉中出现，保存后写回 charCardPrompt', async () => {
    const { mount, settings, saveSettings } = await mountFormFillPage(createSettings(), 'form-fill');

    expect(document.querySelector('.acu-v2-table-page .acu-prompt-segs')).toBeNull();
    const openButton = Array.from(document.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Sửa prompt')) as HTMLButtonElement;
    openButton.click();
    await Promise.resolve();

    const drawer = document.querySelector('.acu-v2-drawer') as HTMLElement;
    expect(drawer).not.toBeNull();
    const textareas = Array.from(drawer.querySelectorAll<HTMLTextAreaElement>('.acu-prompt-segs textarea'));
    expect(textareas.length).toBeGreaterThan(0);
    textareas[0].value = '新的系统段';
    textareas[0].dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();

    const saveButton = Array.from(drawer.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Lưu prompt')) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
    saveButton.click();
    await Promise.resolve();

    expect(settings.charCardPrompt[0].content).toBe('新的系统段');
    expect(saveSettings).toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it('关闭有未保存修改的提示词抽屉会确认', async () => {
    const { mount } = await mountFormFillPage(createSettings(), 'form-fill');

    const openButton = Array.from(document.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Sửa prompt')) as HTMLButtonElement;
    openButton.click();
    await Promise.resolve();

    const drawer = document.querySelector('.acu-v2-drawer') as HTMLElement;
    const textarea = drawer.querySelector<HTMLTextAreaElement>('.acu-prompt-segs textarea')!;
    textarea.value = '未保存修改';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();

    const closeButton = drawer.querySelector<HTMLButtonElement>('[title="Đóng"]')!;
    closeButton.click();
    await Promise.resolve();

    expect(document.querySelector('.acu-dialog-layer')?.textContent || '')
      .toContain('Bạn có thay đổi prompt điền bảng chưa lưu');
    expect(document.querySelector('.acu-v2-drawer')).not.toBeNull();

    mount.__resetAcuV2MountForTests();
  });

  it('提示词抽屉有未保存修改时关闭整个 UI 会确认', async () => {
    const { mount } = await mountFormFillPage(createSettings(), 'form-fill');

    const openButton = Array.from(document.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Sửa prompt')) as HTMLButtonElement;
    openButton.click();
    await Promise.resolve();

    const drawer = document.querySelector('.acu-v2-drawer') as HTMLElement;
    const textarea = drawer.querySelector<HTMLTextAreaElement>('.acu-prompt-segs textarea')!;
    textarea.value = '未保存修改';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();

    const appClose = document.querySelector<HTMLButtonElement>('.acu-v2-app__close')!;
    appClose.click();
    await Promise.resolve();

    expect(document.querySelector('.acu-dialog-layer')?.textContent || '')
      .toContain('Bạn có thay đổi prompt điền bảng chưa lưu');
    expect(document.getElementById('acu-app-v2')!.style.display).not.toBe('none');
    expect(document.querySelector('.acu-v2-drawer')).not.toBeNull();

    mount.__resetAcuV2MountForTests();
  });

});

describe('FormFillPage · 手动填表面板', () => {
  it('渲染手动填表面板和常驻说明信息条，运行配置不混入手动面板', async () => {
    const { mount } = await mountFormFillPage();

    const page = document.querySelector('.acu-v2-form-fill-page');
    expect(page).not.toBeNull();
    const panel = Array.from(page!.querySelectorAll<HTMLElement>('.acu-v2-form-fill-page__grid > .acu-panel'))
      .find(item => item.querySelector('.acu-panel__title')?.textContent?.includes('Điền bảng thủ công'))!;
    const text = panel.textContent || '';
    expect(text).not.toContain('Preset API điền bảng');
    expect(text).toContain('Xử lý thủ công N tầng gần nhất');
    expect(text).toContain('Gộp mỗi N tầng thành một lần điền bảng');
    expect(text).toContain('Yêu cầu bổ sung cho lần điền bảng này');
    expect(text).toContain('full checkpoint hiện tại');
    expect(text).toContain('Tầng AI 1 (Mốc cơ sở ban đầu)');
    expect(text).toContain('Tầng AI 3 (Mốc cơ sở chu kỳ lịch sử)');
    expect(text).toContain('Bảng đã chọn: 角色状态 (sheet_a), 事件记录 (sheet_b)');
    expect(text).toContain('Chạy điền bảng thủ công');
    expect(text).toContain('Bắt kịp các tầng chưa điền của bảng đã chọn');
    expect(text).toContain('không quét các khoảng trống nội bộ nằm trước mốc lịch sử');
    expect(panel.querySelector('.acu-v2-form-fill-page__manual-extra .acu-toggle')).toBeNull();
    expect(panel.querySelector('.acu-v2-form-fill-page__manual-extra textarea')).not.toBeNull();

    expect(panel.querySelector('.acu-panel__description-region .acu-info-banner')).not.toBeNull();

    const runPanel = Array.from(page!.querySelectorAll<HTMLElement>('.acu-v2-form-fill-page__grid > .acu-panel'))
      .find(item => item.querySelector('.acu-panel__title')?.textContent?.includes('Cài đặt cập nhật tự động'))!;
    expect(runPanel.textContent || '').toContain('Preset API điền bảng');

    mount.__resetAcuV2MountForTests();
  });

  it('checkpoint reason 文案兼容历史手动、保留边界、未知和缺失 reason', async () => {
    const { mount } = await mountFormFillPage(createSettings(), 'form-fill', [
      { messageIndex: 1, aiFloor: 1, reason: 'manual', createdAt: 1 },
      { messageIndex: 2, aiFloor: 2, reason: 'compaction', createdAt: 2 },
      { messageIndex: 3, aiFloor: 3, reason: 'weird', createdAt: 3 },
      { messageIndex: 4, aiFloor: 4, createdAt: 4 },
    ]);

    const panel = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-form-fill-page__grid > .acu-panel'))
      .find(item => item.querySelector('.acu-panel__title')?.textContent?.includes('Điền bảng thủ công'))!;
    const text = panel.textContent || '';
    expect(text).toContain('Tầng AI 1 (Mốc cơ sở thủ công lịch sử)');
    expect(text).toContain('Tầng AI 2 (Mốc cơ sở ranh giới lưu giữ)');
    expect(text).toContain('Tầng AI 3 (Mốc cơ sở cũ: weird)');
    expect(text).toContain('Tầng AI 4 (Mốc cơ sở cũ)');

    mount.__resetAcuV2MountForTests();
  });

  it('手动参数保存到独立字段，不改自动更新设置', async () => {
    const { mount, settings, saveSettings } = await mountFormFillPage();

    const panel = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-form-fill-page__grid > .acu-panel'))
      .find(item => item.querySelector('.acu-panel__title')?.textContent?.includes('Điền bảng thủ công'))!;
    const depthRow = Array.from(panel.querySelectorAll<HTMLElement>('.acu-form-row'))
      .find(row => (row.textContent || '').includes('Xử lý thủ công N tầng gần nhất'))!;
    const batchRow = Array.from(panel.querySelectorAll<HTMLElement>('.acu-form-row'))
      .find(row => (row.textContent || '').includes('Gộp mỗi N tầng thành một lần điền bảng'))!;
    const depthInput = depthRow.querySelector<HTMLInputElement>('input[type="number"]')!;
    const batchInput = batchRow.querySelector<HTMLInputElement>('input[type="number"]')!;

    expect(depthInput.value).toBe('3');
    expect(batchInput.value).toBe('3');

    depthInput.value = '100';
    depthInput.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    batchInput.value = '2';
    batchInput.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(settings.manualUpdateContextDepth).toBe(100);
    expect(settings.manualUpdateBatchSize).toBe(2);
    expect(settings.autoUpdateThreshold).toBe(3);
    expect(settings.updateBatchSize).toBe(2);
    expect(saveSettings).toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it('执行手动填表不再改写自动更新设置：手动参数由 service 层独立解析', async () => {
    const settings = createSettings();
    settings.autoUpdateThreshold = 3;
    settings.updateBatchSize = 2;
    settings.manualUpdateContextDepth = 100;
    settings.manualUpdateBatchSize = 4;
    const { mount, orchestrate } = await mountFormFillPage(settings);
    const observedSettings: Array<{ threshold: number; batchSize: number; manualDepth: number; manualBatch: number }> = [];
    orchestrate.mockImplementation(async () => {
      observedSettings.push({
        threshold: settings.autoUpdateThreshold,
        batchSize: settings.updateBatchSize,
        manualDepth: settings.manualUpdateContextDepth,
        manualBatch: settings.manualUpdateBatchSize,
      });
      return { success: true };
    });

    const button = Array.from(document.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Chạy điền bảng thủ công')) as HTMLButtonElement;
    button.click();
    await clickDialogButton('Xác nhận và tiếp tục');
    await new Promise(r => setTimeout(r, 0));

    // 自动填表设置在整个执行期间保持原值；service 层通过 manual-update-settings 读取手动参数。
    expect(observedSettings).toEqual([{ threshold: 3, batchSize: 2, manualDepth: 100, manualBatch: 4 }]);
    expect(settings.autoUpdateThreshold).toBe(3);
    expect(settings.updateBatchSize).toBe(2);

    mount.__resetAcuV2MountForTests();
  });

  it('执行手动填表会把已选表传给 service 编排，空附加要求不传入额外内容', async () => {
    const { mount, orchestrate, manualExtraHintSetter } = await mountFormFillPage();

    const button = Array.from(document.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Chạy điền bảng thủ công')) as HTMLButtonElement;
    expect(button).not.toBeUndefined();
    button.click();
    await waitForDialogLayer();

    const dialogText = document.querySelector('.acu-dialog-layer')?.textContent || '';
    expect(dialogText).toContain('Sắp thực hiện điền bảng thủ công');
    expect(dialogText).toContain('full checkpoint hiện tại: Tầng AI 1 (Mốc cơ sở ban đầu), Tầng AI 3 (Mốc cơ sở chu kỳ lịch sử)');
    expect(dialogText).toContain('Phạm vi điền lại lần này: Tầng AI 1~3');
    expect(dialogText).toContain('Bảng đã chọn: 角色状态 (sheet_a), 事件记录 (sheet_b)');
    expect(dialogText).toContain('xóa trước checkpoint và nhật ký tăng thêm V2 của các bảng đã chọn trong phạm vi điền lại lần này');
    expect(dialogText).toContain('dữ liệu bảng ở các tầng trước đó sẽ không thể khôi phục');
    expect(dialogText).toContain('checkpoint ngoài phạm vi, dữ liệu bảng của lịch sử trò chuyện ngoài phạm vi và các bảng không được chọn sẽ không bị xóa');
    expect(dialogText).toContain('Nếu thất bại hoặc bị dừng trước khi kết quả của đợt đầu được ghi xuống, dữ liệu bảng trước khi dọn sẽ được tự động khôi phục');
    expect(dialogText).toContain('Một khi đã có đợt được cam kết thành công, thất bại sẽ không hoàn tác việc dọn');
    expect(dialogText).not.toContain('sẽ quay về trạng thái trước thao tác này');
    expect(dialogText).toContain('Đích chèn sổ thế giới: Thẻ nhân vật gắn sổ thế giới · CharBookFF');
    expect(dialogText).not.toContain('第二次破坏性确认');
    expect(dialogText).toContain('Xác nhận và tiếp tục');
    expect(dialogText).not.toContain('直接填表');
    expect(await readToastText(mount))
      .not.toContain('手动填表开始');
    expect(orchestrate).not.toHaveBeenCalled();

    await clickDialogButton('Xác nhận và tiếp tục');
    await new Promise(r => setTimeout(r, 0));

    expect(orchestrate).toHaveBeenCalled();
    expect(orchestrate.mock.calls[0][0]).toEqual(['sheet_a', 'sheet_b']);
    expect(orchestrate.mock.calls[0][3]).toEqual(expect.objectContaining({
      clearBeforeUpdate: true,
      onProgress: expect.any(Function),
    }));
    expect(manualExtraHintSetter).not.toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it('所有 checkpoint 都落入重填范围时仅在确认弹窗中显示红色风险提示', async () => {
    const settings = createSettings();
    settings.manualUpdateContextDepth = 3;
    const { mount } = await mountFormFillPage(settings, 'form-fill', [
      { messageIndex: 1, aiFloor: 1, reason: 'init', createdAt: 1 },
      // 历史 fixture：reason:'periodic' 仅表示旧数据兼容，新策略不再生成 periodic full checkpoint。
      { messageIndex: 4, aiFloor: 3, reason: 'periodic', createdAt: 2 },
    ]);

    const panel = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-form-fill-page__grid > .acu-panel'))
      .find(item => item.querySelector('.acu-panel__title')?.textContent?.includes('Điền bảng thủ công'))!;
    expect(panel.textContent || '').toContain('Tầng AI 1 (Mốc cơ sở ban đầu)');
    expect(panel.textContent || '').toContain('Tầng AI 3 (Mốc cơ sở chu kỳ lịch sử)');
    expect(panel.textContent || '').toContain('theo cài đặt hiện tại, phạm vi dự kiến xử lý: Tầng AI 1~3');
    expect(panel.textContent || '').not.toContain('Nguy hiểm: toàn bộ full checkpoint');
    expect(panel.querySelector('.acu-v2-form-fill-page__checkpoint-risk')).toBeNull();

    const button = Array.from(panel.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Chạy điền bảng thủ công')) as HTMLButtonElement;
    button.click();
    await waitForDialogLayer();

    const danger = document.querySelector<HTMLElement>('.acu-dialog__danger-message');
    expect(danger).not.toBeNull();
    const dangerText = danger!.textContent || '';
    expect(dangerText).toContain('toàn bộ full checkpoint của cuộc trò chuyện hiện tại đều nằm trong phạm vi điền lại lần này');
    expect(dangerText).toContain('hệ thống chỉ kiểm tra ranh giới');
    expect(dangerText).toContain('bước tiếp theo sẽ yêu cầu bạn xác nhận riêng việc có thay thế nền của các bảng đã chọn trong phạm vi lần này hay không');
    expect(dangerText).not.toContain('首次确认后会立即替换 checkpoint 基底');
    expect(dangerText).not.toContain('空白结构');
    const confirmButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.acu-dialog-layer button'))
      .find(btn => btn.textContent?.includes('Xác nhận và tiếp tục'))!;
    expect(confirmButton.className).toContain('danger');

    mount.__resetAcuV2MountForTests();
  });

  it('手动填表展示 orchestrator 的具体进度文案，不把分组数显示成重试次数', async () => {
    const { mount, orchestrate, executeCore } = await mountFormFillPage();
    let releaseCore = () => {};
    executeCore.mockImplementation(async (...args: any[]) => {
      const onProgress = args[9] as ((event: any) => void) | undefined;
      expect(onProgress).toEqual(expect.any(Function));
      onProgress?.({
        phase: 'calling_ai',
        currentBatch: 1,
        totalBatches: 1,
        attempt: 1,
        maxRetries: 20,
        message: '正在生成第 1/20 组 AI 响应...',
      });
      await new Promise<void>(resolve => {
        releaseCore = resolve;
      });
      return { success: true, modifiedKeys: [] };
    });
    orchestrate.mockImplementation(async (_targetKeys: string[], processBatch: any) => {
      await processBatch([7], 'manual_independent', {
        targetSheetKeys: ['sheet_a'],
        batchSize: 1,
      });
      return { success: true };
    });

    const panel = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-form-fill-page__grid > .acu-panel'))
      .find(item => item.querySelector('.acu-panel__title')?.textContent?.includes('Điền bảng thủ công'))!;
    const button = Array.from(panel.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Chạy điền bảng thủ công')) as HTMLButtonElement;
    button.click();
    await clickDialogButton('Xác nhận và tiếp tục');
    await new Promise(r => setTimeout(r, 0));

    const toastText = await readToastText(mount);
    expect(toastText).toContain('Đợt 1/1 · 正在生成第 1/20 组kết quả điền bảng thủ công...');
    expect(toastText).not.toContain('调用 AI (1/20)');
    expect(button.textContent || '').toContain('Đang điền bảng...');

    expect(orchestrate).toHaveBeenCalled();
    releaseCore();
    await new Promise(r => setTimeout(r, 0));

    mount.__resetAcuV2MountForTests();
  });

  it('手动填表展示 service grouped 路径转发的重试进度', async () => {
    const { mount, orchestrate } = await mountFormFillPage();
    let releaseOrchestrate = () => {};
    orchestrate.mockImplementation(async (_targetKeys: string[], _processBatch: any, _refreshData: any, options: any) => {
      options.onProgress?.({
        phase: 'calling_ai',
        currentBatch: 2,
        totalBatches: 4,
        attempt: 2,
        maxRetries: 3,
      });
      await new Promise<void>(resolve => {
        releaseOrchestrate = resolve;
      });
      return { success: true };
    });

    const panel = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-form-fill-page__grid > .acu-panel'))
      .find(item => item.querySelector('.acu-panel__title')?.textContent?.includes('Điền bảng thủ công'))!;
    const button = Array.from(panel.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Chạy điền bảng thủ công')) as HTMLButtonElement;
    button.click();
    await clickDialogButton('Xác nhận và tiếp tục');
    await new Promise(r => setTimeout(r, 0));

    expect(await readToastText(mount))
      .toContain('Đợt 2/4 · Gọi AI (lần thử 2/3)');

    releaseOrchestrate();
    await new Promise(r => setTimeout(r, 0));

    mount.__resetAcuV2MountForTests();
  });

  it('手动填表进度 toast 提供终止按钮并触发中止链路', async () => {
    const { mount, orchestrate, abortAllActiveRequests, setWasStoppedByUser, setIsAutoUpdatingCard } = await mountFormFillPage();
    let releaseOrchestrate = () => {};
    orchestrate.mockImplementation(async () => {
      await new Promise<void>(resolve => {
        releaseOrchestrate = resolve;
      });
      return { success: false, error: '手动更新已终止。' };
    });

    const panel = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-form-fill-page__grid > .acu-panel'))
      .find(item => item.querySelector('.acu-panel__title')?.textContent?.includes('Điền bảng thủ công'))!;
    const button = Array.from(panel.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Chạy điền bảng thủ công')) as HTMLButtonElement;
    button.click();
    await clickDialogButton('Xác nhận và tiếp tục');
    await new Promise(r => setTimeout(r, 0));

    await clickToastAction(mount, 'Dừng');
    await Promise.resolve();

    expect(setWasStoppedByUser).toHaveBeenCalledWith(false);
    expect(setWasStoppedByUser).toHaveBeenCalledWith(true);
    expect(abortAllActiveRequests).toHaveBeenCalledTimes(1);
    expect(setIsAutoUpdatingCard).toHaveBeenCalledWith(false);
    expect(await readToastText(mount)).toContain('Đã dừng điền bảng thủ công');

    releaseOrchestrate();
    await new Promise(r => setTimeout(r, 0));

    mount.__resetAcuV2MountForTests();
  });

  it('手动填表附加要求常驻显示，填写后传给本次执行', async () => {
    const { mount, manualExtraHintSetter } = await mountFormFillPage();

    const panel = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-form-fill-page__grid > .acu-panel'))
      .find(item => item.querySelector('.acu-panel__title')?.textContent?.includes('Điền bảng thủ công'))!;
    const textarea = panel.querySelector<HTMLTextAreaElement>('.acu-v2-form-fill-page__manual-extra textarea')!;
    expect(textarea).not.toBeNull();

    textarea.value = '只更新角色状态。';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();

    const button = Array.from(panel.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Chạy điền bảng thủ công')) as HTMLButtonElement;
    button.click();
    await clickDialogButton('Xác nhận và tiếp tục');
    await new Promise(r => setTimeout(r, 0));

    expect(manualExtraHintSetter).toHaveBeenCalledWith(
      'Sau đây là yêu cầu điền bảng bổ sung của người dùng, hãy tuân thủ nghiêm ngặt:\n只更新角色状态。',
    );

    mount.__resetAcuV2MountForTests();
  });

  it('追平入口使用真实计划展示 wave、bucket、skip 与内部空洞边界，确认后才执行', async () => {
    const { mount, prepareCatchUp, orchestrateCatchUp, orchestrate } = await mountFormFillPage();
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(btn => btn.textContent?.includes('Bắt kịp các tầng chưa điền của bảng đã chọn'))!;

    button.click();
    await new Promise(r => setTimeout(r, 0));

    const dialogText = document.querySelector('.acu-dialog-layer')?.textContent || '';
    expect(prepareCatchUp).toHaveBeenCalledWith(['sheet_a', 'sheet_b']);
    expect(dialogText).toContain('Mục tiêu khóa: tầng AI 3');
    expect(dialogText).toContain('Dự kiến 2 wave, 2 bucket');
    expect(dialogText).toContain('Bỏ qua tầng mới nhất: 0 tầng');
    expect(dialogText).toContain('Wave 1: Tầng AI 2; 角色状态');
    expect(dialogText).toContain('Wave 2: Tầng AI 3; 角色状态, 事件记录');
    expect(dialogText).toContain('không quét hay sửa các khoảng trống nội bộ trước tiền tuyến lịch sử');
    expect(orchestrateCatchUp).not.toHaveBeenCalled();
    expect(orchestrate).not.toHaveBeenCalled();

    await clickDialogButton('Xác nhận bắt kịp');
    await new Promise(r => setTimeout(r, 0));

    expect(orchestrateCatchUp).toHaveBeenCalledTimes(1);
    expect(orchestrateCatchUp.mock.calls[0][0]).toEqual(['sheet_a', 'sheet_b']);
    expect(orchestrateCatchUp.mock.calls[0][1]).toEqual(expect.any(Function));
    expect(orchestrateCatchUp.mock.calls[0][2]).toEqual(expect.objectContaining({
      abortController: expect.any(AbortController),
      onProgress: expect.any(Function),
    }));
    expect(orchestrate).not.toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it('追平规划无缺口时提示已追平且不执行编排或刷新', async () => {
    const { mount, prepareCatchUp, orchestrateCatchUp, refreshMergedData } = await mountFormFillPage();
    prepareCatchUp.mockResolvedValueOnce({
      success: true,
      plan: { targetAiFloor: 3, targetMessageIndex: 4, planSignature: 'none', waves: [] },
    });
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(btn => btn.textContent?.includes('Bắt kịp các tầng chưa điền của bảng đã chọn'))!;

    button.click();
    await new Promise(r => setTimeout(r, 0));

    expect(document.querySelector('.acu-dialog-layer')).toBeNull();
    expect(await readToastText(mount)).toContain('Các bảng đã chọn đã được bắt kịp');
    expect(orchestrateCatchUp).not.toHaveBeenCalled();
    expect(refreshMergedData).not.toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it('追平运行与普通手填互斥，终止仅中止当前 controller', async () => {
    const { mount, orchestrateCatchUp, orchestrate, abortAllActiveRequests, setWasStoppedByUser, setIsAutoUpdatingCard } = await mountFormFillPage();
    let releaseCatchUp = () => {};
    let capturedController: AbortController | undefined;
    orchestrateCatchUp.mockImplementation(async (_keys: string[], _refresh: any, options: any) => {
      capturedController = options.abortController;
      await new Promise<void>(resolve => { releaseCatchUp = resolve; });
      return { success: false, outcome: 'stopped', committedBucketCount: 1 };
    });
    const catchUpButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(btn => btn.textContent?.includes('Bắt kịp các tầng chưa điền của bảng đã chọn'))!;
    const manualButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(btn => btn.textContent?.includes('Chạy điền bảng thủ công'))!;

    catchUpButton.click();
    await new Promise(r => setTimeout(r, 0));
    expect(manualButton.disabled).toBe(true);
    await clickDialogButton('Xác nhận bắt kịp');
    await new Promise(r => setTimeout(r, 0));
    expect(capturedController?.signal.aborted).toBe(false);
    expect(manualButton.disabled).toBe(true);

    await clickToastAction(mount, 'Dừng');
    await Promise.resolve();

    expect(capturedController?.signal.aborted).toBe(true);
    expect(abortAllActiveRequests).not.toHaveBeenCalled();
    expect(setWasStoppedByUser).not.toHaveBeenCalled();
    expect(setIsAutoUpdatingCard).not.toHaveBeenCalled();
    expect(orchestrate).not.toHaveBeenCalled();

    releaseCatchUp();
    await new Promise(r => setTimeout(r, 0));
    expect(await readToastText(mount)).toContain('đã giữ lại 1 bucket đã cam kết');

    mount.__resetAcuV2MountForTests();
  });

  it('terminal progress 保存失败时提示数据已提交，不误报为整次追平失败', async () => {
    const { mount, orchestrateCatchUp } = await mountFormFillPage();
    orchestrateCatchUp.mockResolvedValueOnce({
      success: true,
      outcome: 'progress_metadata_failed',
      committedBucketCount: 2,
      error: '终态进度保存失败：strict save failed',
    });
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(btn => btn.textContent?.includes('Bắt kịp các tầng chưa điền của bảng đã chọn'))!;

    button.click();
    await new Promise(r => setTimeout(r, 0));
    await clickDialogButton('Xác nhận bắt kịp');
    await new Promise(r => setTimeout(r, 0));

    const toastText = await readToastText(mount);
    expect(toastText).toContain('Dữ liệu bắt kịp thủ công đã được cam kết nhưng ghi nhận trạng thái hoàn tất thất bại');
    expect(toastText).toContain('strict save failed');

    mount.__resetAcuV2MountForTests();
  });

  it('追平回放完整性失败时明确提示已回载持久化数据，不伪装成普通 AI 失败', async () => {
    const { mount, orchestrateCatchUp } = await mountFormFillPage();
    orchestrateCatchUp.mockResolvedValueOnce({
      success: false,
      outcome: 'integrity_failed',
      committedBucketCount: 1,
      error: 'V2 replay 未恢复所选表：sheet_a；已从聊天持久化状态回载运行时。',
    });
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(btn => btn.textContent?.includes('Bắt kịp các tầng chưa điền của bảng đã chọn'))!;

    button.click();
    await new Promise(r => setTimeout(r, 0));
    await clickDialogButton('Xác nhận bắt kịp');
    await new Promise(r => setTimeout(r, 0));

    const toastText = await readToastText(mount);
    expect(toastText).toContain('Kiểm tra tính toàn vẹn lưu trữ của lần bắt kịp thủ công thất bại');
    expect(toastText).toContain('đã nạp lại dữ liệu đã lưu trong cuộc trò chuyện');
    expect(toastText).toContain('V2 replay 未恢复所选表');

    mount.__resetAcuV2MountForTests();
  });

  it('追平锚点预检阻断时展示恢复指引而不伪装成 AI 执行失败', async () => {
    const { mount, orchestrateCatchUp } = await mountFormFillPage();
    orchestrateCatchUp.mockResolvedValueOnce({
      success: false,
      outcome: 'blocked',
      committedBucketCount: 0,
      error: '手动追平目标早于未知 V2 checkpoint；请先执行 V2 恢复诊断。',
    });
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(btn => btn.textContent?.includes('Bắt kịp các tầng chưa điền của bảng đã chọn'))!;

    button.click();
    await new Promise(r => setTimeout(r, 0));
    await clickDialogButton('Xác nhận bắt kịp');
    await new Promise(r => setTimeout(r, 0));

    expect(await readToastText(mount)).toContain('请先执行 V2 恢复诊断');

    mount.__resetAcuV2MountForTests();
  });

  it('sync_pending 提供仅同步重试，重试不再次调用追平编排', async () => {
    const { mount, orchestrateCatchUp, refreshMergedData } = await mountFormFillPage();
    orchestrateCatchUp.mockResolvedValueOnce({ success: true, outcome: 'sync_pending', committedBucketCount: 2 });
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(btn => btn.textContent?.includes('Bắt kịp các tầng chưa điền của bảng đã chọn'))!;
    button.click();
    await new Promise(r => setTimeout(r, 0));
    await clickDialogButton('Xác nhận bắt kịp');
    await new Promise(r => setTimeout(r, 0));

    expect(await readToastText(mount)).toContain('đồng bộ sổ thế giới đang chờ thử lại');
    await clickToastAction(mount, 'Chỉ thử lại đồng bộ');
    await new Promise(r => setTimeout(r, 0));

    expect(refreshMergedData).toHaveBeenCalledTimes(1);
    expect(orchestrateCatchUp).toHaveBeenCalledTimes(1);
    expect(await readToastText(mount)).toContain('không gọi lại AI');

    mount.__resetAcuV2MountForTests();
  });
});
