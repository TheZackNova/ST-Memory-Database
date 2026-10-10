/**
 * DataMgmtPage 集成 — 数据管理页结构与关键动作
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MERGE_SUMMARY_PROMPT_ACU } from '../../../src/shared/defaults-json.js';

const STORAGE_KEY = 'acu_v2_ui_state';
const capturedDownloads: string[] = [];

function createSettings() {
  return {
    storageMode: 'native',
    dataIsolationEnabled: true,
    dataIsolationCode: 'alpha',
    deleteStartFloor: 1,
    deleteEndFloor: null,
    charCardPrompt: [{ role: 'system', content: 'prompt' }],
    mergeSummaryPrompt: 'merge prompt',
    mergeTargetCount: 1,
    mergeBatchSize: 5,
    mergeStartIndex: 1,
    mergeEndIndex: null,
    autoMergeEnabled: false,
    autoMergeThreshold: 20,
    autoMergeReserve: 0,
    apiPresets: [],
    defaultApiPresetName: '',
    apiPresetBindingsByChat: {},
    contentOptimizationSettings: { apiPreset: '' },
    tableApiPresetOverridesByName: {},
    plotSettings: {
      enabled: true,
      promptPresets: [
        { name: '全局推进', prompts: [], plotTasks: [], contextExtractRules: [], contextExcludeRules: [] },
      ],
      lastUsedPresetName: '全局推进',
      globalRevision: 1,
      loopSettings: { quickReplyContent: [], currentPromptIndex: 0, maxRetries: 3 },
      prompts: [],
      plotTasks: [],
    },
    plotPresetBindings: {
      'chat-data': { presetName: '聊天推进', source: 'ui', isExplicit: true, updatedAt: 1000 },
      'other-chat': { presetName: '其他推进', source: 'ui', isExplicit: true, updatedAt: 1000 },
    },
    retainRecentLayers: 100,
    tableKeyOrder: ['sheet_b', 'sheet_a'],
    manualSelectedTables: ['sheet_a'],
    hasManualSelection: true,
    importSelectedTables: ['sheet_b'],
    hasImportTableSelection: true,
    tableUpdateLocks: {
      'chat-data::alpha': { sheet_a: { rows: [1], cols: [], cells: [] } },
      'other-chat::alpha': { sheet_a: { rows: [2], cols: [], cells: [] } },
    },
    specialIndexLocks: {
      'chat-data::alpha': { sheet_a: false },
      'chat-data::beta': { sheet_a: false },
    },
  } as any;
}

/** 通知不再有常驻列表视口（改由单气泡轮播），断言直接读 toast-store 的当前条目。 */
let activeToastStore: any = null;

function toastTexts(kind: string): string[] {
  return (activeToastStore?.items || []).filter((item: any) => item.kind === kind).map((item: any) => item.text);
}

function toastText(kind: string): string {
  return toastTexts(kind).join('\n');
}

async function mountDataMgmtPage(chatFileIdentifier = 'chat-data', initialMixedDecision: any = null, sqliteMode = false, pendingReload = false) {
  vi.resetModules();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ uiTierV2: { tier: 'high' }, router: { activePageId: 'data-mgmt' } }));

  const settings = createSettings();
  const isolationHistory = ['alpha', 'beta'];
  const saveSettings = vi.fn(() => ({ saved: true, storageType: 'memory' }));
  const applyTemplateScope = vi.fn(() => ({
    mode: 'chat_override',
    isolationKey: settings.dataIsolationCode,
    presetName: 'chat-template',
  }));
  const switchIsolation = vi.fn(async (code: string) => {
    settings.dataIsolationCode = code;
    settings.dataIsolationEnabled = !!code;
    if (code && !isolationHistory.includes(code)) isolationHistory.unshift(code);
  });
  const removeHistory = vi.fn((code: string) => {
    const index = isolationHistory.indexOf(code);
    if (index >= 0) isolationHistory.splice(index, 1);
  });
  const cleanupLegacyIsolation = vi.fn(async () => {
    const removedCodes = [...isolationHistory];
    isolationHistory.splice(0, isolationHistory.length);
    settings.dataIsolationCode = '';
    settings.dataIsolationEnabled = false;
    return { removedCodes, failedCodes: [], switchedToDefault: true };
  });
  const deleteGenerated = vi.fn(async () => undefined);
  const deleteLocalDataWithScope = vi.fn(async (_mode: string, _start: number | null, _end: number | null, expectedPath?: 'purge' | 'range') => {
    if (expectedPath === 'purge') {
      return { path: 'purge' as const, result: { saved: true, clearedMessageCount: 2, removedMetadata: ['TavernDB_ACU_InternalSheetGuide'] } };
    }
    return { path: 'range' as const, deletedCount: 2 };
  });
  const cleanupWorldbook = vi.fn(async () => 1);
  const overrideLatest = vi.fn(async () => 3);
  const loadOrCreate = vi.fn(async () => ({ ok: true }));
  const refreshMerged = vi.fn(async () => ({ ok: true }));
  const applyTemplate = vi.fn(async () => ({ templateStr: '{}', templateObj: {} }));
  const saveChatToHost = vi.fn(async () => undefined);
  const buildCheckpoint = vi.fn(() => ({ format: 'acu-table-checkpoint' }));
  const parseCheckpoint = vi.fn(() => ({ success: true, checkpoint: { format: 'acu-table-checkpoint', source: { storageMode: 'native' } } }));
  const restoreCheckpoint = vi.fn(async () => ({ success: true, restoredMessageIndex: 1 }));
  const mixedDecision = { value: initialMixedDecision };
  const getMixedDecision = vi.fn(() => mixedDecision.value);
  const buildMixedSnapshots = vi.fn(() => ({
    legacy: { filename: 'TavernDB_mixed_legacy_chat_alpha_decision.json', payload: { storage: 'legacy-v1' } },
    v2: { filename: 'TavernDB_mixed_v2_chat_alpha_decision.json', payload: { storage: 'storage-frame-v2' } },
  }));
  const commitMixedDecision = vi.fn(async () => ({ status: 'committed', decisionId: 'decision-test' }));
  const prepareV2Recovery = vi.fn(async () => ({ planId: 'recovery-plan', status: 'recoverable_orphan_data_replace', isolationKey: 'alpha', requiresConfirmation: true, message: 'orphan candidate' }));
  const scanV2IsolationDiagnostics = vi.fn(async () => [
    { isolationKey: 'alpha', status: 'recoverable_orphan_data_replace', requiresConfirmation: true, message: 'alpha candidate', isCurrentIsolation: true },
    { isolationKey: 'beta', status: 'unrecoverable_no_base', requiresConfirmation: false, message: 'beta has no base', isCurrentIsolation: false },
  ]);
  const commitV2Recovery = vi.fn(async () => ({ status: 'committed', planId: 'recovery-plan' }));
  const runtimeHealth = {
    status: 'ready' as const,
    expectedMode: sqliteMode ? 'sqlite' as const : 'native' as const,
    activeMode: sqliteMode ? 'sqlite' as const : 'native' as const,
    source: 'merged' as const,
    loadToken: 7,
    error: 'token=secret; ddl=private',
  };
  const getRuntimeHealth = vi.fn(() => ({ ...runtimeHealth }));
  const reloadStorageProvider = vi.fn(async () => {
    if (pendingReload) return new Promise<never>(() => {});
    return {
      ok: true,
      degraded: false,
      source: 'merged' as const,
    };
  });
  const chat = [
    {
      is_user: true,
      mes: 'u',
      TavernDB_ACU_ScopedConfig: {
        version: 1,
        plot: {
          mode: 'chat_override',
          presetName: '聊天推进',
          snapshot: {
            prompts: [],
            plotTasks: [],
            loopSettings: { quickReplyContent: [], currentPromptIndex: 0, maxRetries: 3 },
          },
          source: 'ui_import',
          updatedAt: 1000,
        },
        template: {
          alpha: { mode: 'chat_override', templateStr: '{"sheet_a":{}}' },
          beta: { mode: 'chat_override', templateStr: '{"sheet_b":{}}' },
        },
        templateArchives: {
          alpha: [
            { archiveKey: 'alpha-a', mode: 'chat_override', templateStr: '{"sheet_a":{}}' },
          ],
          beta: [
            { archiveKey: 'beta-a', mode: 'chat_override', templateStr: '{"sheet_b":{}}' },
          ],
        },
      },
      TavernDB_ACU_InternalSheetGuide: {
        version: 2,
        tags: {
          alpha: { data: { mate: { type: 'chatSheets' }, sheet_a: { name: 'A', content: [['h']] } } },
          beta: { data: { mate: { type: 'chatSheets' }, sheet_b: { name: 'B', content: [['h']] } } },
        },
      },
      TavernDB_ACU_TableHeaderGuide: {
        version: 1,
        tags: {
          alpha: { headers: [{ uid: 'sheet_a' }] },
          beta: { headers: [{ uid: 'sheet_b' }] },
        },
      },
    },
    { is_user: false, TavernDB_ACU_IsolatedData: { alpha: {} } },
    { is_user: false, TavernDB_ACU_IsolatedData: { alpha: {} } },
  ] as any[];

  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:acu-test'),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function(this: HTMLAnchorElement) {
    capturedDownloads.push(this.download);
  });

  vi.doMock('../../../src/service/runtime/state-manager', () => ({
    settings_ACU: settings,
    currentChatFileIdentifier_ACU: chatFileIdentifier,
    currentJsonTableData_ACU: {
      mate: { type: 'chatSheets' },
      sheet_a: { name: 'A', content: [['h']], sourceData: {} },
      sheet_b: { name: 'B', content: [['h']], sourceData: {} },
    },
    getCurrentIsolationKey_ACU: () => settings.dataIsolationCode || '',
    coreApisAreReady_ACU: true,
  }));
  vi.doMock('../../../src/data/gateways/chat-gateway', async () => {
    const actual = await vi.importActual<any>('../../../src/data/gateways/chat-gateway');
    return {
      ...actual,
      getChatArray_ACU: () => chat,
      getChatLength_ACU: () => chat.length,
      getLastMessageIndex_ACU: () => Math.max(0, chat.length - 1),
      saveChatToHost_ACU: saveChatToHost,
    };
  });
  vi.doMock('../../../src/service/settings/settings-service', () => ({
    applyTemplateScopeForCurrentChat_ACU: applyTemplateScope,
    getDataIsolationHistory_ACU: () => [...isolationHistory],
    removeDataIsolationHistory_ACU: removeHistory,
    saveSettings_ACU: saveSettings,
    switchIsolationProfile_ACU: switchIsolation,
    applyCombinedSettingsImport_ACU: vi.fn(() => ['charCardPrompt']),
  }));
  vi.doMock('../../../src/service/settings/legacy-isolation-cleanup-service', () => ({
    cleanupLegacyIsolationProfiles_ACU: cleanupLegacyIsolation,
  }));
  vi.doMock('../../../src/service/chat/chat-service', async () => {
    const actual = await vi.importActual<any>('../../../src/service/chat/chat-service');
    return {
      ...actual,
      getChatArray_ACU: () => chat,
      // 真实实现保留（resolveDeletionPath 用它做预判）；分派函数用 mock。
      deleteLocalDataWithScope_ACU: deleteLocalDataWithScope,
      overrideLatestLayerWithTemplateCore_ACU: overrideLatest,
    };
  });
  vi.doMock('../../../src/service/table/table-service', () => ({
    loadOrCreateJsonTableFromChatHistory_ACU: loadOrCreate,
  }));
  vi.doMock('../../../src/service/worldbook/worldbook-cleanup', () => ({
    cleanupWorldbookEntriesAfterDataDeletion_ACU: cleanupWorldbook,
  }));
  vi.doMock('../../../src/service/worldbook/pipeline', () => ({
    deleteAllGeneratedEntries_ACU: deleteGenerated,
    refreshMergedDataAndNotify_ACU: refreshMerged,
  }));
  vi.doMock('../../../src/service/template/template-preset-service', () => ({
    applyTemplateSnapshotToScope_ACU: applyTemplate,
    getDefaultTemplateSnapshot_ACU: () => ({
      templateStr: JSON.stringify({
        mate: { type: 'chatSheets' },
        sheet_a: { name: 'A', content: [['h']], sourceData: {} },
      }),
      templateObj: {
        mate: { type: 'chatSheets' },
        sheet_a: { name: 'A', content: [['h']], sourceData: {} },
      },
    }),
  }));
  vi.doMock('../../../src/service/table/storage-mode', () => ({
    isSqliteMode: () => sqliteMode,
    getCurrentStorageMode: () => settings.storageMode,
  }));
  vi.doMock('../../../src/service/table/table-storage-strategy', () => ({
    getStorageRuntimeHealth_ACU: getRuntimeHealth,
    reloadStorageProvider,
  }));
  vi.doMock('../../../src/service/table/table-checkpoint-transfer', () => ({
    buildCurrentTableCheckpoint_ACU: buildCheckpoint,
    parseTableCheckpointFile_ACU: parseCheckpoint,
    restoreTableCheckpointToLatestAi_ACU: restoreCheckpoint,
  }));
  vi.doMock('../../../src/service/table/mixed-storage-decision-registry', () => ({
    getActiveMixedStorageDecisionSummary_ACU: getMixedDecision,
    buildRegisteredMixedStorageSnapshotTransfer_ACU: buildMixedSnapshots,
    commitRegisteredMixedStorageDecision_ACU: commitMixedDecision,
  }));
  vi.doMock('../../../src/service/table/table-v2-recovery-service', () => ({
    prepareV2Recovery_ACU: prepareV2Recovery,
    scanV2IsolationDiagnostics_ACU: scanV2IsolationDiagnostics,
    commitPreparedV2Recovery_ACU: commitV2Recovery,
  }));
  const mount = await import('../../../src/presentation-v2/bootstrap/mount');
  await mount.openAcuV2App();
  const { useToastStore } = await import('../../../src/presentation-v2/stores/toast-store');
  activeToastStore = useToastStore(mount.getAcuV2PiniaForBridge()!);
  await new Promise(r => setTimeout(r, 0));

  return {
    mount,
    settings,
    applyTemplateScope,
    saveSettings,
    switchIsolation,
    removeHistory,
    cleanupLegacyIsolation,
    deleteGenerated,
    deleteLocalDataWithScope,
    cleanupWorldbook,
    overrideLatest,
    loadOrCreate,
    refreshMerged,
    applyTemplate,
    saveChatToHost,
    chat,
    buildCheckpoint,
    parseCheckpoint,
    restoreCheckpoint,
    mixedDecision,
    getMixedDecision,
    buildMixedSnapshots,
    commitMixedDecision,
    prepareV2Recovery,
    scanV2IsolationDiagnostics,
    commitV2Recovery,
    runtimeHealth,
    getRuntimeHealth,
    reloadStorageProvider,
  };
}

beforeEach(() => {
  localStorage.clear();
  capturedDownloads.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function clickDialogButton(label: string): Promise<void> {
  await Promise.resolve();
  const layer = document.querySelector<HTMLElement>('.acu-dialog-layer');
  expect(layer).not.toBeNull();
  const button = Array.from(layer!.querySelectorAll<HTMLButtonElement>('button'))
    .find(item => item.textContent?.includes(label));
  expect(button).not.toBeUndefined();
  button!.click();
  await new Promise(r => setTimeout(r, 0));
}

async function clickDialogCheckbox(label: string): Promise<void> {
  await Promise.resolve();
  const layer = document.querySelector<HTMLElement>('.acu-dialog-layer');
  expect(layer).not.toBeNull();
  const checkbox = Array.from(layer!.querySelectorAll<HTMLButtonElement>('button[role="checkbox"]'))
    .find(item => item.textContent?.includes(label));
  expect(checkbox).not.toBeUndefined();
  checkbox!.click();
  await Promise.resolve();
}

describe('DataMgmtPage', () => {
  it('隐藏旧数据管理入口，仅保留备份 Checkpoint 与删除清理面板', async () => {
    const { mount } = await mountDataMgmtPage();

    const page = document.querySelector('.acu-v2-data-mgmt-page');
    expect(page).not.toBeNull();
    const text = page!.textContent || '';
    expect(document.querySelector('.acu-v2-app__page-title')?.textContent?.trim()).toBe('Quản lý dữ liệu');
    expect(text).toContain('Sao lưu và khôi phục');
    expect(text).toContain('Xóa và dọn dẹp');
    expect(text).toContain('Checkpoint của cuộc trò chuyện hiện tại');
    expect(text).not.toContain('Cô lập dữ liệu');
    expect(text).not.toContain('Xóa mục chèn của định danh hiện tại');
    expect(text).not.toContain('Chẩn đoán runtime SQLite');
    expect(text).not.toContain('Số thứ tự tải');
    expect(text).not.toContain('Xóa dữ liệu cục bộ của định danh hiện tại');
    expect(text).not.toContain('Nhập gộp (mẫu + chỉ dẫn)');
    // V2 恢复入口不受 legacy UI 开关控制：写入门闸的错误文案会把用户引导到这里。
    expect(text).toContain('Quét tất cả miền cô lập V2');
    expect(text).toContain('Chẩn đoán khôi phục dữ liệu V2');
    expect(text).not.toContain('Quản lý chỉ mục chế độ giao hỏa');
    expect(text).not.toContain('Xóa chỉ mục giao hỏa hiện tại');
    expect(text).not.toContain('Xóa bộ nhớ đệm tạm');
    expect(text).toContain('Dọn nhãn cô lập cũ toàn cục');

    mount.__resetAcuV2MountForTests();
  });






  it('每个面板都渲染常驻说明信息条', async () => {
    const { mount } = await mountDataMgmtPage();

    const panels = document.querySelectorAll('.acu-v2-data-mgmt-page .acu-panel');
    expect(panels.length).toBe(2);
    panels.forEach(panel => {
      expect(panel.querySelector('.acu-panel__description-region .acu-info-banner')).not.toBeNull();
      expect(panel.querySelector('.acu-panel__header .acu-info-banner')).toBeNull();
    });

    mount.__resetAcuV2MountForTests();
  });

  it('左列只保留备份恢复，右列保留删除清理', async () => {
    const { mount } = await mountDataMgmtPage();

    const columns = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-data-mgmt-page__panel-stack'));
    expect(columns).toHaveLength(2);

    const leftTitles = Array.from(columns[0].querySelectorAll<HTMLElement>('.acu-panel__title'))
      .map(title => title.textContent?.trim() || '');
    const rightTitles = Array.from(columns[1].querySelectorAll<HTMLElement>('.acu-panel__title'))
      .map(title => title.textContent?.trim() || '');

    expect(leftTitles).toEqual(['Sao lưu và khôi phục']);
    // 休眠数据面板已移除：切回含该表/列的模板即自动唤醒（协调器 reveal 链路），无需单独入口。
    expect(rightTitles).toEqual(['Xóa và dọn dẹp']);

    mount.__resetAcuV2MountForTests();
  });

  it('删除与清理面板分为自动清理和手动删除', async () => {
    const { mount } = await mountDataMgmtPage();

    const cleanupPanel = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-data-mgmt-page .acu-panel'))
      .find(el => el.querySelector('.acu-panel__title')?.textContent?.includes('Xóa và dọn dẹp'))!;
    const sectionTitles = Array.from(cleanupPanel.querySelectorAll<HTMLElement>('.acu-v2-data-mgmt-page__section-title'))
      .map(title => title.textContent?.trim() || '');

    expect(sectionTitles).toEqual(['Dọn dẹp tự động', 'Xóa thủ công']);
    expect(cleanupPanel.textContent || '').toContain('Số tầng dữ liệu giữ lại');
    expect(cleanupPanel.textContent || '').not.toContain('Xóa dữ liệu cục bộ của định danh hiện tại');
    expect(cleanupPanel.textContent || '').toContain('Khôi phục cấu hình mặc định');
    expect(cleanupPanel.textContent || '').toContain('Dọn nhãn cô lập cũ toàn cục');

    mount.__resetAcuV2MountForTests();
  });

  it('全局旧隔离标签清理确认前取消不会执行删除', async () => {
    const { mount, cleanupLegacyIsolation } = await mountDataMgmtPage();

    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Dọn nhãn cô lập cũ toàn cục'));
    expect(button).not.toBeUndefined();
    button!.click();
    await new Promise(r => setTimeout(r, 0));
    expect(document.querySelector('.acu-dialog-layer')?.textContent).toContain('alpha、beta');
    expect(document.querySelector('.acu-dialog-layer')?.textContent).toContain('Không xóa nội dung chat');

    await clickDialogButton('Hủy');
    expect(cleanupLegacyIsolation).not.toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it('全局旧隔离标签清理确认后删除全部 Profile 并切换到默认数据', async () => {
    const { mount, cleanupLegacyIsolation, settings } = await mountDataMgmtPage();

    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Dọn nhãn cô lập cũ toàn cục'));
    button!.click();
    await clickDialogButton('Dọn nhãn cô lập cũ');
    await new Promise(r => setTimeout(r, 0));

    expect(cleanupLegacyIsolation).toHaveBeenCalledOnce();
    expect(settings.dataIsolationCode).toBe('');
    expect(settings.dataIsolationEnabled).toBe(false);
    expect(toastText('success')).toContain('Đã dọn 2 nhãn cô lập cũ');

    mount.__resetAcuV2MountForTests();
  });


  it('全局 header 展示当前页标题，页面内不再渲染重复 header', async () => {
    const { mount } = await mountDataMgmtPage();

    expect(document.querySelector('.acu-v2-data-mgmt-page .acu-page-header')).toBeNull();
    const globalTitle = document.querySelector('.acu-v2-app__page-title');
    expect(globalTitle?.textContent?.trim()).toBe('Quản lý dữ liệu');

    mount.__resetAcuV2MountForTests();
  });






  it('T5 范围留空点删除所有本地数据 → 走 purge 分支（两级确认后 deleteLocalDataWithScope 收到 all/null/null/purge）', async () => {
    const { mount, deleteLocalDataWithScope } = await mountDataMgmtPage();

    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Xóa tất cả dữ liệu cục bộ'));
    expect(button).not.toBeUndefined();
    button!.click();
    await clickDialogButton('Xóa tất cả dữ liệu cục bộ');
    await clickDialogButton('Xác nhận xóa sạch cứng');
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    // 页面 refresh() 会把 settings.deleteStartFloor 回退为 1，因此实际 start=1（仍全范围）
    expect(deleteLocalDataWithScope).toHaveBeenCalledWith('all', 1, null, 'purge');

    mount.__resetAcuV2MountForTests();
  });

  it('T6 purge 成功后不调用 loadOrCreateJsonTableFromChatHistory 与 reloadStorageProvider（C2 no-reload 契约）', async () => {
    const { mount, deleteLocalDataWithScope, loadOrCreate, reloadStorageProvider } = await mountDataMgmtPage();

    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Xóa tất cả dữ liệu cục bộ'));
    button!.click();
    await clickDialogButton('Xóa tất cả dữ liệu cục bộ');
    await clickDialogButton('Xác nhận xóa sạch cứng');
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    expect(deleteLocalDataWithScope).toHaveBeenCalledTimes(1);
    expect(loadOrCreate).not.toHaveBeenCalled();
    expect(reloadStorageProvider).not.toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it('T7 purge 成功后不调用 cleanupWorldbookEntriesAfterDataDeletion（C3）', async () => {
    const { mount, deleteLocalDataWithScope, cleanupWorldbook } = await mountDataMgmtPage();

    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Xóa tất cả dữ liệu cục bộ'));
    button!.click();
    await clickDialogButton('Xóa tất cả dữ liệu cục bộ');
    await clickDialogButton('Xác nhận xóa sạch cứng');
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    expect(deleteLocalDataWithScope).toHaveBeenCalledTimes(1);
    expect(cleanupWorldbook).not.toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it('T8 purge 结果 saved=false 时显示 error toast 且不显示成功文案', async () => {
    const { mount, deleteLocalDataWithScope } = await mountDataMgmtPage();
    deleteLocalDataWithScope.mockResolvedValueOnce({ path: 'purge', result: { saved: false, clearedMessageCount: 0, removedMetadata: [], error: '当前聊天记录为空。' } });

    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Xóa tất cả dữ liệu cục bộ'));
    button!.click();
    await clickDialogButton('Xóa tất cả dữ liệu cục bộ');
    await clickDialogButton('Xác nhận xóa sạch cứng');
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    expect(toastText('error')).toContain('当前聊天记录为空');
    expect(document.body.textContent || '').not.toContain('已删除所有本地数据');

    mount.__resetAcuV2MountForTests();
  });

  it('T9 purge 结果 saved=true + cleanupWarnings 时显示 warning toast', async () => {
    const { mount, deleteLocalDataWithScope } = await mountDataMgmtPage();
    deleteLocalDataWithScope.mockResolvedValueOnce({
      path: 'purge',
      result: { saved: true, clearedMessageCount: 2, removedMetadata: [], cleanupWarnings: ['世界书清理失败'] },
    });

    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Xóa tất cả dữ liệu cục bộ'));
    button!.click();
    await clickDialogButton('Xóa tất cả dữ liệu cục bộ');
    await clickDialogButton('Xác nhận xóa sạch cứng');
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    expect(toastText('warning')).toContain('Toàn bộ dữ liệu cục bộ đã bị hard clear');
    expect(document.body.textContent || '').toContain('世界书清理失败');

    mount.__resetAcuV2MountForTests();
  });

  it('T10 all 按钮两级确认；任一级取消则不调用服务', async () => {
    const { mount, deleteLocalDataWithScope } = await mountDataMgmtPage();

    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Xóa tất cả dữ liệu cục bộ'));
    button!.click();
    await clickDialogButton('Xóa tất cả dữ liệu cục bộ');
    // 第二级点取消（关闭对话框）
    const layer = document.querySelector<HTMLElement>('.acu-dialog-layer');
    const cancelButton = Array.from(layer!.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Hủy'));
    expect(cancelButton).toBeDefined();
    cancelButton!.click();
    await new Promise(r => setTimeout(r, 0));

    expect(deleteLocalDataWithScope).not.toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it('T11 局部范围（start=2）点删除所有本地数据 → range 分支单级确认，且必须 reload + cleanupWorldbook', async () => {
    const { mount, deleteLocalDataWithScope, loadOrCreate, cleanupWorldbook, reloadStorageProvider, refreshMerged } = await mountDataMgmtPage('chat-data', null, true);
    // 通过起始楼层输入框驱动 deleteRange.startFloor = 2 → 未覆盖第 1 层 → range
    const startFloorInput = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="number"]'))
      .find(input => input.closest('.acu-form-row')?.textContent?.includes('Tầng bắt đầu'))!;
    startFloorInput.value = '2';
    startFloorInput.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));

    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Xóa tất cả dữ liệu cục bộ'));
    button!.click();
    // range 分支是单级确认：点「删除数据」即执行
    await clickDialogButton('Xóa dữ liệu');
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    // 预判 path='range'，服务层 mock 默认返回 range 分支
    expect(deleteLocalDataWithScope).toHaveBeenCalledWith('all', 2, null, 'range');
    expect(loadOrCreate).toHaveBeenCalled();
    expect(reloadStorageProvider).toHaveBeenCalled();
    expect(refreshMerged).toHaveBeenCalled();
    expect(cleanupWorldbook).toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it('T12 局部范围点 all 时确认弹窗为 range 语义（单级），不出现硬清空两级文案', async () => {
    const { mount } = await mountDataMgmtPage();
    // 通过起始楼层输入框驱动 deleteRange.startFloor = 2 → 局部范围
    const startFloorInput = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="number"]'))
      .find(input => input.closest('.acu-form-row')?.textContent?.includes('Tầng bắt đầu'))!;
    startFloorInput.value = '2';
    startFloorInput.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));

    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Xóa tất cả dữ liệu cục bộ'));
    button!.click();
    await new Promise(r => setTimeout(r, 0));

    // range 分支单级确认弹窗出现（标题「删除指定楼层本地数据」，无「再次确认删除」第二级）
    expect(document.body.textContent || '').toContain('Xóa dữ liệu cục bộ của các tầng chỉ định');
    expect(document.body.textContent || '').toContain('Chỉ xóa dữ liệu điền bảng của các tầng trong phạm vi đó');
    expect(document.body.textContent || '').not.toContain('Xác nhận xóa lần nữa');

    // 关闭弹窗
    const layer = document.querySelector<HTMLElement>('.acu-dialog-layer');
    const cancelButton = Array.from(layer!.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Hủy'));
    cancelButton!.click();
    await new Promise(r => setTimeout(r, 0));

    mount.__resetAcuV2MountForTests();
  });

  it('T12b 勾选表格后：按钮改为「删除所选 N 张表的数据」，全范围也走 range 单级确认，服务收到第 5 参 sheetKeys', async () => {
    const { mount, deleteLocalDataWithScope, loadOrCreate, reloadStorageProvider, cleanupWorldbook } = await mountDataMgmtPage('chat-data', null, true);
    // 运行时有 sheet_a(A) / sheet_b(B)：限定表格列表按表名展示。
    const checkbox = document.querySelector<HTMLButtonElement>('.acu-v2-data-mgmt-page__sheet-filter [data-sheet-key="sheet_a"]');
    expect(checkbox).toBeTruthy();
    expect(document.body.textContent || '').toContain('Giới hạn bảng (tùy chọn)');
    checkbox!.click();
    await new Promise(r => setTimeout(r, 0));

    // 危险按钮文案随选表变化；范围留空（覆盖全部楼层）也不再是硬清空语义。
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Xóa dữ liệu của 1 bảng đã chọn'));
    expect(button).toBeTruthy();
    expect(document.body.textContent || '').toContain('Hiện đã giới hạn 1 bảng: A');
    button!.click();
    await new Promise(r => setTimeout(r, 0));
    expect(document.body.textContent || '').toContain('Xóa dữ liệu bảng đã chọn');
    expect(document.body.textContent || '').toContain('bảng 「A」');
    expect(document.body.textContent || '').not.toContain('Xác nhận xóa lần nữa');
    await clickDialogButton('Xóa dữ liệu bảng đã chọn');
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    expect(deleteLocalDataWithScope).toHaveBeenCalledWith('all', 1, null, 'range', ['sheet_a']);
    expect(loadOrCreate).toHaveBeenCalled();
    expect(reloadStorageProvider).toHaveBeenCalled();
    expect(cleanupWorldbook).toHaveBeenCalled();
    expect(document.body.textContent || '').toContain('bảng 「A」 trong');

    mount.__resetAcuV2MountForTests();
  });

  it('T12c 未勾选任何表时整楼层删除调用形态不变（不带第 5 参）', async () => {
    const { mount, deleteLocalDataWithScope } = await mountDataMgmtPage('chat-data', null, true);
    const startFloorInput = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="number"]'))
      .find(input => input.closest('.acu-form-row')?.textContent?.includes('Tầng bắt đầu'))!;
    startFloorInput.value = '2';
    startFloorInput.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Xóa tất cả dữ liệu cục bộ'));
    button!.click();
    await clickDialogButton('Xóa dữ liệu');
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    expect(deleteLocalDataWithScope).toHaveBeenCalledTimes(1);
    expect(deleteLocalDataWithScope.mock.calls[0]).toEqual(['all', 2, null, 'range']);
    mount.__resetAcuV2MountForTests();
  });

  it('T13 服务返回 aborted（确认期范围变化）时显示 warning toast，无成功', async () => {
    const { mount, deleteLocalDataWithScope } = await mountDataMgmtPage();
    deleteLocalDataWithScope.mockResolvedValueOnce({
      path: 'aborted',
      reason: '删除范围在确认期间发生变化（预期完全清空，实际为按范围删除）。为避免误删已中止，请重新确认。',
    });

    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Xóa tất cả dữ liệu cục bộ'));
    button!.click();
    await clickDialogButton('Xóa tất cả dữ liệu cục bộ');
    await clickDialogButton('Xác nhận xóa sạch cứng');
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    expect(toastText('warning')).toContain('为避免误删已中止');
    expect(document.body.textContent || '').not.toContain('已删除所有本地数据');

    mount.__resetAcuV2MountForTests();
  });



  it('删除与清理面板可以保存自动保留本地数据层数', async () => {
    const { mount, settings, saveSettings } = await mountDataMgmtPage();

    const cleanupPanel = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-data-mgmt-page .acu-panel'))
      .find(el => el.querySelector('.acu-panel__title')?.textContent?.includes('Xóa và dọn dẹp'))!;
    const retentionRow = Array.from(cleanupPanel.querySelectorAll<HTMLElement>('.acu-form-row'))
      .find(row => (row.textContent || '').includes('Số tầng dữ liệu giữ lại'))!;
    const input = retentionRow.querySelector<HTMLInputElement>('input[type="number"]')!;
    input.value = '30';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));

    expect(settings.retainRecentLayers).toBe(30);
    expect(saveSettings).toHaveBeenCalled();
    expect(document.body.textContent || '').not.toContain('自动清理策略已保存：保留最近 30 层本地数据。');

    mount.__resetAcuV2MountForTests();
  });

  it('恢复默认配置会恢复模板提示词并清理当前聊天快照、剧情预设和锁', async () => {
    const {
      mount,
      settings,
      chat,
      applyTemplate,
      saveSettings,
      saveChatToHost,
      loadOrCreate,
      refreshMerged,
    } = await mountDataMgmtPage();

    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Khôi phục cấu hình mặc định'));
    expect(button).not.toBeUndefined();
    button!.click();
    await Promise.resolve();

    const dialogText = document.querySelector('.acu-dialog-layer')?.textContent || '';
    expect(dialogText).toContain('Mẫu bảng và prompt mặc định');
    expect(dialogText).toContain('prompt tóm tắt gộp');
    expect(dialogText).toContain('Snapshot mẫu bảng của cuộc trò chuyện hiện tại');
    expect(dialogText).toContain('Snapshot preset đẩy cốt truyện của cuộc trò chuyện hiện tại');
    expect(dialogText).toContain('Khóa bảng của cuộc trò chuyện hiện tại');
    expect(dialogText).not.toContain('表格选择状态');
    expect(dialogText).not.toContain('手动填表选择状态');
    // 只看恢复默认弹窗里的勾选项：页面「限定表格」勾选框默认未勾选，不属于本弹窗。
    const dialogCheckboxes = Array.from(document.querySelectorAll<HTMLButtonElement>('.acu-dialog-layer button[role="checkbox"]'));
    expect(dialogCheckboxes.length).toBeGreaterThan(0);
    expect(dialogCheckboxes.every(item => item.getAttribute('aria-checked') === 'true')).toBe(true);

    await clickDialogButton('Khôi phục theo mục đã chọn');
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    expect(applyTemplate).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      scope: 'global',
      source: 'v2_reset_all_defaults',
      presetName: '',
      persistChatScope: false,
    }));
    expect(saveSettings).toHaveBeenCalled();
    expect(saveChatToHost).toHaveBeenCalled();
    expect(loadOrCreate).toHaveBeenCalled();
    expect(refreshMerged).toHaveBeenCalled();

    expect(settings.tableKeyOrder).toEqual([]);
    expect(settings.manualSelectedTables).toEqual(['sheet_a']);
    expect(settings.hasManualSelection).toBe(true);
    expect(settings.importSelectedTables).toEqual(['sheet_b']);
    expect(settings.hasImportTableSelection).toBe(true);
    expect(settings.mergeSummaryPrompt).toBe(DEFAULT_MERGE_SUMMARY_PROMPT_ACU);
    expect(settings.tableUpdateLocks['chat-data::alpha']).toBeUndefined();
    expect(settings.tableUpdateLocks['other-chat::alpha']).toBeDefined();
    expect(settings.specialIndexLocks['chat-data::alpha']).toBeUndefined();
    expect(settings.specialIndexLocks['chat-data::beta']).toBeDefined();
    expect(settings.plotPresetBindings['chat-data']).toBeUndefined();
    expect(settings.plotPresetBindings['other-chat']).toBeDefined();
    expect(settings.plotSettings.promptPresets.map((preset: any) => preset.name)).toContain('全局推进');

    const first = chat[0];
    expect(first.TavernDB_ACU_ScopedConfig.plot).toBeUndefined();
    expect(first.TavernDB_ACU_ScopedConfig.template.alpha).toBeUndefined();
    expect(first.TavernDB_ACU_ScopedConfig.template.beta).toBeDefined();
    expect(first.TavernDB_ACU_ScopedConfig.templateArchives.alpha).toBeUndefined();
    expect(first.TavernDB_ACU_ScopedConfig.templateArchives.beta).toBeDefined();
    expect(first.TavernDB_ACU_InternalSheetGuide.tags.alpha).toBeUndefined();
    expect(first.TavernDB_ACU_InternalSheetGuide.tags.beta).toBeDefined();
    expect(first.TavernDB_ACU_TableHeaderGuide.tags.alpha).toBeUndefined();
    expect(first.TavernDB_ACU_TableHeaderGuide.tags.beta).toBeDefined();
    expect(document.body.textContent || '').toContain('Đã khôi phục cấu hình mặc định theo các mục đã chọn.');

    mount.__resetAcuV2MountForTests();
  });

  it('恢复默认配置多选弹窗取消部分项目后会保留对应状态', async () => {
    const {
      mount,
      settings,
      chat,
      applyTemplate,
      saveChatToHost,
    } = await mountDataMgmtPage();

    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Khôi phục cấu hình mặc định'));
    expect(button).not.toBeUndefined();
    button!.click();
    await Promise.resolve();
    await clickDialogCheckbox('Khóa bảng của cuộc trò chuyện hiện tại');
    await clickDialogButton('Khôi phục theo mục đã chọn');
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    expect(applyTemplate).toHaveBeenCalled();
    expect(saveChatToHost).toHaveBeenCalled();
    expect(settings.manualSelectedTables).toEqual(['sheet_a']);
    expect(settings.hasManualSelection).toBe(true);
    expect(settings.importSelectedTables).toEqual(['sheet_b']);
    expect(settings.hasImportTableSelection).toBe(true);
    expect(settings.tableUpdateLocks['chat-data::alpha']).toBeDefined();
    expect(settings.specialIndexLocks['chat-data::alpha']).toBeDefined();
    expect(settings.tableKeyOrder).toEqual([]);
    expect(settings.plotPresetBindings['chat-data']).toBeUndefined();

    const first = chat[0];
    expect(first.TavernDB_ACU_ScopedConfig.plot).toBeUndefined();
    expect(first.TavernDB_ACU_ScopedConfig.template.alpha).toBeUndefined();

    mount.__resetAcuV2MountForTests();
  });



  it('导出 Checkpoint 文件名清洗非法字符并附加固定时间戳', async () => {
    const { mount, buildCheckpoint } = await mountDataMgmtPage('alpha/beta:*?gamma');
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 12, 21, 18, 41));
    const panel = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-data-mgmt-page .acu-panel'))
      .find(el => el.querySelector('.acu-panel__title')?.textContent?.includes('Sao lưu và khôi phục'));
    const checkpointSection = panel!.querySelector('.acu-v2-data-mgmt-page__checkpoint-section');
    const exportButton = Array.from(checkpointSection!.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('Xuất Checkpoint'));

    exportButton!.click();

    expect(buildCheckpoint).toHaveBeenCalledTimes(1);
    expect(capturedDownloads).toEqual(['TavernDB_checkpoint_alpha_beta_gamma_20260712-211841.json']);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:acu-test');

    vi.useRealTimers();
    mount.__resetAcuV2MountForTests();
  });

  it('导入 Checkpoint 在危险确认前不会触发恢复', async () => {
    const { mount, parseCheckpoint, restoreCheckpoint } = await mountDataMgmtPage();
    const input = Array.from(document.querySelectorAll<HTMLInputElement>('.acu-v2-data-mgmt-page__checkpoint-section input[type="file"]'))[0];
    expect(input).toBeDefined();
    const file = new File(['{}'], 'checkpoint.json', { type: 'application/json' });
    Object.defineProperty(input!, 'files', { configurable: true, value: [file] });
    Object.defineProperty(FileReader.prototype, 'readAsText', {
      configurable: true,
      value: function(this: FileReader) {
        Object.defineProperty(this, 'result', { configurable: true, value: '{}' });
        this.onload?.(new ProgressEvent('load'));
      },
    });
    input!.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));

    expect(parseCheckpoint).toHaveBeenCalledWith('{}');
    expect(document.querySelector('.acu-dialog-layer')?.textContent).toContain('Khôi phục Checkpoint của cuộc trò chuyện hiện tại');
    expect(document.querySelector('.acu-dialog-layer')?.textContent).toContain('Chế độ nguồn: native; chế độ đích: native');
    expect(document.querySelector('.acu-dialog-layer')?.textContent).toContain('toàn bộ tầng AI');
    expect(document.querySelector('.acu-dialog-layer')?.textContent).toContain('tầng AI mới nhất của khóa cô lập đang kích hoạt');
    expect(document.querySelector('.acu-dialog-layer')?.textContent).toContain('các lần cập nhật sau sẽ dùng mẫu này');
    expect(document.querySelector('.acu-dialog-layer')?.textContent).toContain('Mẫu toàn cục và nội dung chat không đổi');
    expect(restoreCheckpoint).not.toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it('恢复 Checkpoint 按完整成功、部分成功和失败反馈真实状态', async () => {
    const { mount, restoreCheckpoint, settings } = await mountDataMgmtPage();
    const file = new File(['{}'], 'checkpoint.json', { type: 'application/json' });
    Object.defineProperty(FileReader.prototype, 'readAsText', {
      configurable: true,
      value: function(this: FileReader) {
        Object.defineProperty(this, 'result', { configurable: true, value: '{}' });
        this.onload?.(new ProgressEvent('load'));
      },
    });

    restoreCheckpoint.mockResolvedValueOnce({
      success: true, restoredMessageIndex: 1,
      postCondition: { runtimeMatches: true, scopeIsChatOverride: true, templateMatches: true, guideMatches: true, providerMode: 'native' },
    });
    const input = Array.from(document.querySelectorAll<HTMLInputElement>('.acu-v2-data-mgmt-page__checkpoint-section input[type="file"]'))[0];
    Object.defineProperty(input!, 'files', { configurable: true, value: [file] });
    input!.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));
    await clickDialogButton('Khôi phục Checkpoint');
    expect(toastText('success')).toContain('Lưu trữ thực tế: native');

    restoreCheckpoint.mockResolvedValueOnce({
      success: true, restoredMessageIndex: 1, derivedRefreshWarnings: ['世界书刷新失败'], cleanupWarnings: ['向量 manifest 清理失败'],
      postCondition: { runtimeMatches: false, scopeIsChatOverride: true, templateMatches: false, guideMatches: true, providerMode: 'native' },
    });
    const partialInput = Array.from(document.querySelectorAll<HTMLInputElement>('.acu-v2-data-mgmt-page__checkpoint-section input[type="file"]'))[0];
    Object.defineProperty(partialInput!, 'files', { configurable: true, value: [file] });
    partialInput!.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));
    await clickDialogButton('Khôi phục Checkpoint');
    expect(toastText('warning')).toContain('thành công một phần');
    expect(toastText('warning')).toContain('Dữ liệu runtime không nhất quán');
    expect(toastText('warning')).toContain('Snapshot mẫu của cuộc trò chuyện không nhất quán');
    expect(toastText('warning')).toContain('Làm mới phái sinh: 世界书刷新失败');
    expect(toastText('warning')).toContain('Dọn dẹp: 向量 manifest 清理失败');

    settings.storageMode = 'sqlite';
    restoreCheckpoint.mockResolvedValueOnce({
      success: true, restoredMessageIndex: 1,
      postCondition: { runtimeMatches: true, scopeIsChatOverride: true, templateMatches: true, guideMatches: true, providerMode: 'native' },
    });
    const fallbackInput = Array.from(document.querySelectorAll<HTMLInputElement>('.acu-v2-data-mgmt-page__checkpoint-section input[type="file"]'))[0];
    Object.defineProperty(fallbackInput!, 'files', { configurable: true, value: [file] });
    fallbackInput!.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));
    await clickDialogButton('Khôi phục Checkpoint');
    const warningToasts = toastTexts('warning');
    expect(warningToasts.at(-1)).toContain('Mục tiêu đặt là SQLite, lưu trữ thực tế fallback về native');

    restoreCheckpoint.mockResolvedValueOnce({ success: true, restoredMessageIndex: 1 });
    const missingConditionInput = Array.from(document.querySelectorAll<HTMLInputElement>('.acu-v2-data-mgmt-page__checkpoint-section input[type="file"]'))[0];
    Object.defineProperty(missingConditionInput!, 'files', { configurable: true, value: [file] });
    missingConditionInput!.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));
    await clickDialogButton('Khôi phục Checkpoint');
    const finalWarningToasts = toastTexts('warning');
    expect(finalWarningToasts.at(-1)).toContain('Thiếu hậu điều kiện khôi phục');

    restoreCheckpoint.mockResolvedValueOnce({ success: false, error: 'strict failed' });
    const failedInput = Array.from(document.querySelectorAll<HTMLInputElement>('.acu-v2-data-mgmt-page__checkpoint-section input[type="file"]'))[0];
    Object.defineProperty(failedInput!, 'files', { configurable: true, value: [file] });
    failedInput!.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));
    await clickDialogButton('Khôi phục Checkpoint');
    expect(toastText('error')).toContain('Khôi phục Checkpoint thất bại: strict failed');

    mount.__resetAcuV2MountForTests();
  });

  it('mixed 决议只展示授权动作，并导出 detached legacy/V2 双快照', async () => {
    const { mount, buildMixedSnapshots } = await mountDataMgmtPage('chat-data', {
      decisionId: 'decision-test',
      kind: 'conflict_requires_user_choice',
      diagnosticCodes: ['provenance_missing_or_invalid'],
      allowedActions: ['noop', 'download_snapshots'],
      createdAt: 1,
    });

    const section = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-data-mgmt-page__checkpoint-section'))
      .find(item => item.textContent?.includes('Quyết định lưu trữ hỗn hợp'));
    expect(section).toBeDefined();
    expect(section!.textContent).toContain('Quyết định lưu trữ hỗn hợp');
    expect(section?.textContent).toContain('conflict_requires_user_choice');
    expect(section?.textContent).not.toContain('Giữ V2 và dọn legacy');
    expect(section?.textContent).not.toContain('Nộp ứng viên gộp có giới hạn');
    const downloadButton = Array.from(section!.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('Xuất snapshot legacy/V2'))!;
    downloadButton.click();

    expect(buildMixedSnapshots).toHaveBeenCalledWith('decision-test');
    expect(capturedDownloads).toEqual([
      'TavernDB_mixed_legacy_chat_alpha_decision.json',
      'TavernDB_mixed_v2_chat_alpha_decision.json',
    ]);
    mount.__resetAcuV2MountForTests();
  });

  it('mixed V2 仍需 checkpoint 收敛时展示稳定诊断且不提供清理或合并动作', async () => {
    const { mount } = await mountDataMgmtPage('chat-data', {
      decisionId: 'decision-convergence',
      kind: 'blocked_checkpoint_convergence',
      diagnosticCodes: ['v2_requires_checkpoint_convergence'],
      allowedActions: ['noop', 'download_snapshots'],
      createdAt: 1,
    });

    const section = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-data-mgmt-page__checkpoint-section'))
      .find(item => item.textContent?.includes('Quyết định lưu trữ hỗn hợp'))!;

    expect(section.textContent).toContain('blocked_checkpoint_convergence');
    expect(section.textContent).toContain('v2_requires_checkpoint_convergence');
    expect(section.textContent).not.toContain('Giữ V2 và dọn legacy');
    expect(section.textContent).not.toContain('Nộp ứng viên gộp có giới hạn');
    expect(section.textContent).toContain('Xuất snapshot legacy/V2');
    mount.__resetAcuV2MountForTests();
  });

  it('mixed 合并候选必须经两次确认，且页面将 decisionId 与固定 action 交给服务', async () => {
    const { mount, commitMixedDecision } = await mountDataMgmtPage('chat-data', {
      decisionId: 'decision-test',
      kind: 'legacy_has_v2_missing_data',
      diagnosticCodes: ['merge_candidate_available'],
      allowedActions: ['noop', 'download_snapshots', 'commit_merge_candidate'],
      createdAt: 1,
    });
    const section = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-data-mgmt-page__checkpoint-section'))
      .find(item => item.textContent?.includes('Quyết định lưu trữ hỗn hợp'))!;
    const commitButton = Array.from(section.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('Nộp ứng viên gộp có giới hạn'))!;

    commitButton.click();
    await new Promise(r => setTimeout(r, 0));
    expect(document.querySelector('.acu-dialog-layer')?.textContent).toContain('Nộp ứng viên gộp lưu trữ hỗn hợp');
    expect(commitMixedDecision).not.toHaveBeenCalled();
    await clickDialogButton('Tiếp tục nộp ứng viên');
    expect(document.querySelector('.acu-dialog-layer')?.textContent).toContain('Xác nhận lại ứng viên gộp');
    expect(commitMixedDecision).not.toHaveBeenCalled();
    await clickDialogButton('Xác nhận nộp ứng viên');

    expect(commitMixedDecision).toHaveBeenCalledWith('decision-test', 'commit_merge_candidate');
    expect(commitMixedDecision.mock.calls[0]).toHaveLength(2);
    mount.__resetAcuV2MountForTests();
  });

  it('V2 恢复：兼容宽容回放固化 plan 经确认后以 confirmCompatTolerantFixation 提交（含身份归并需二次确认）', async () => {
    const { mount, prepareV2Recovery, commitV2Recovery } = await mountDataMgmtPage();
    const pageButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.acu-v2-data-mgmt-page button'));

    // 场景 1：无身份归并 → 单次确认，confirmCompatTolerantFixation=false。
    prepareV2Recovery.mockResolvedValueOnce({
      planId: 'compat-plan', status: 'recoverable_compat_tolerant_replay', isolationKey: 'alpha',
      requiresConfirmation: false, message: 'V2 严格回放失败，当前数据经 Tier-1 兼容宽容回放读出。固化方案：在楼层 #2 写入兼容过渡根。',
    });
    pageButtons().find(button => button.textContent?.includes('Chẩn đoán khôi phục dữ liệu V2'))!.click();
    await new Promise(r => setTimeout(r, 0));
    const fixButton = pageButtons().find(button => button.textContent?.includes('Cố định phát lại tương thích thành gốc chuyển tiếp'));
    expect(fixButton).not.toBeUndefined();
    expect(fixButton!.textContent).not.toContain('Xác nhận gộp định danh');
    fixButton!.click();
    await new Promise(r => setTimeout(r, 0));
    expect(document.querySelector('.acu-dialog-layer')?.textContent).toContain('Cố định phát lại tương thích thành gốc chuyển tiếp');
    expect(commitV2Recovery).not.toHaveBeenCalled();
    await clickDialogButton('Cố định');
    expect(commitV2Recovery).toHaveBeenCalledWith('compat-plan', { confirmOrphanDataReplace: false, confirmCompatTolerantFixation: false });

    // 场景 2：含身份归并 → 两次确认，confirmCompatTolerantFixation=true。
    commitV2Recovery.mockClear();
    prepareV2Recovery.mockResolvedValueOnce({
      planId: 'compat-plan-remap', status: 'recoverable_compat_tolerant_replay', isolationKey: 'alpha',
      requiresConfirmation: true, message: '身份归并=sheet_a→sheet_b。固化方案：在楼层 #2 写入兼容过渡根。',
    });
    pageButtons().find(button => button.textContent?.includes('Chẩn đoán khôi phục dữ liệu V2'))!.click();
    await new Promise(r => setTimeout(r, 0));
    const remapButton = pageButtons().find(button => button.textContent?.includes('Xác nhận gộp định danh và cố định phát lại tương thích thành gốc chuyển tiếp'));
    expect(remapButton).not.toBeUndefined();
    remapButton!.click();
    await new Promise(r => setTimeout(r, 0));
    await clickDialogButton('Cố định');
    expect(document.querySelector('.acu-dialog-layer')?.textContent).toContain('Xác nhận lại việc gộp định danh sheetKey');
    expect(commitV2Recovery).not.toHaveBeenCalled();
    await clickDialogButton('Xác nhận gộp và cố định');
    expect(commitV2Recovery).toHaveBeenCalledWith('compat-plan-remap', { confirmOrphanDataReplace: false, confirmCompatTolerantFixation: true });

    // 场景 3：诊断结果无 plan（不可自动固化）→ 不出现固化按钮。
    prepareV2Recovery.mockResolvedValueOnce({
      status: 'recoverable_compat_tolerant_replay', isolationKey: 'alpha',
      requiresConfirmation: false, message: '自动固化不可用：放置过渡根后严格探针仍失败。',
    });
    pageButtons().find(button => button.textContent?.includes('Chẩn đoán khôi phục dữ liệu V2'))!.click();
    await new Promise(r => setTimeout(r, 0));
    expect(pageButtons().some(button => button.textContent?.includes('Cố định phát lại tương thích thành gốc chuyển tiếp'))).toBe(false);
    expect(document.querySelector('.acu-v2-data-mgmt-page')?.textContent).toContain('自动固化不可用');
    mount.__resetAcuV2MountForTests();
  });

  it('mixed 提交保存后后置校验失败时提示已保存而非伪造回滚', async () => {
    const { mount, commitMixedDecision } = await mountDataMgmtPage('chat-data', {
      decisionId: 'decision-test',
      kind: 'equivalent_provenance_verified',
      diagnosticCodes: ['legacy_v2_fingerprints_equal'],
      allowedActions: ['noop', 'download_snapshots', 'keep_v2'],
      createdAt: 1,
    });
    commitMixedDecision.mockResolvedValueOnce({
      status: 'committed_postcondition_failed',
      decisionId: 'decision-test',
      error: 'reload failed',
    });
    const section = Array.from(document.querySelectorAll<HTMLElement>('.acu-v2-data-mgmt-page__checkpoint-section'))
      .find(item => item.textContent?.includes('Quyết định lưu trữ hỗn hợp'))!;
    const commitButton = Array.from(section.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('Giữ V2 và dọn legacy'))!;

    commitButton.click();
    await new Promise(r => setTimeout(r, 0));
    await clickDialogButton('Giữ V2');

    expect(commitMixedDecision).toHaveBeenCalledWith('decision-test', 'keep_v2');
    expect(toastText('warning')).toContain('Dữ liệu đã được lưu nhưng kiểm tra hậu điều kiện thất bại: reload failed');
    mount.__resetAcuV2MountForTests();
  });






  it('全页危险按钮仅包含删除所有本地数据和全局旧隔离标签清理', async () => {
    const { mount } = await mountDataMgmtPage();

    const dangerButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.acu-v2-data-mgmt-page button.acu-btn--danger'));
    expect(dangerButtons.map(button => button.textContent?.trim())).toEqual(['Xóa tất cả dữ liệu cục bộ', 'Dọn nhãn cô lập cũ toàn cục']);

    mount.__resetAcuV2MountForTests();
  });
});
