/**
 * DashboardPage 集成 — 基础/高级开关、SQL 存储模式选择、开发者总开关
 *
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "acu_v2_ui_state";

const m = vi.hoisted(() => ({
  parseTableTemplateJson_ACU: vi.fn(),
}));

function createSettings() {
  return {
    apiMode: "custom",
    apiConfig: {
      url: "",
      apiKey: "",
      model: "",
      useMainApi: true,
      max_tokens: 60000,
      temperature: 1,
    },
    tavernProfile: "",
    streamingEnabled: false,
    apiPresets: [
      {
        name: "table-fast",
        apiMode: "custom",
        apiConfig: {
          url: "",
          apiKey: "",
          model: "",
          useMainApi: true,
          max_tokens: 1000,
          temperature: 1,
        },
        tavernProfile: "",
      },
    ],
    defaultApiPresetName: "table-fast",
    apiPresetBindingsByChat: {},
    tableApiPreset: "",
    tableApiPresetOverridesByName: {},
    autoUpdateEnabled: true,
    continuationPageEnabled: true,
    externalImportPageEnabled: true,
    toastMuteEnabled: false,
    promptTemplateSettings: { enabled: true },
    zeroTkOccupyModeDefault: false,
    summaryVectorIndexModeDefault: false,
    vectorMemoryConfig: {
      embeddingEndpoint: "",
      embeddingModel: "",
      rerankEndpoint: "",
      rerankModel: "",
    },
    autoUpdateFrequency: 2,
    skipUpdateFloors: 0,
    updateBatchSize: 2,
    manualSelectedTables: [],
    hasManualSelection: false,
    storageMode: "native",
    contentOptimizationSettings: { apiPreset: "" },
    plotSettings: {
      enabled: false,
      plotTasks: [],
      promptPresets: [],
      plotWorldbookConfig: { worldbookName: "", enabledEntries: [] },
    },
    plotApiPreset: "",
    plotTaskApiPresetOverridesById: {},
  } as any;
}

function createTableData() {
  return {
    sheet_a: {
      name: "角色状态",
      content: [["id"], ["1"]],
      updateConfig: { updateFrequency: -1, skipFloors: -1 },
    },
    sheet_b: {
      name: "事件记录",
      content: [["id"], ["1"], ["2"]],
      updateConfig: { updateFrequency: 0, skipFloors: -1 },
    },
  };
}

function createSqlTableData() {
  return {
    sheet_a: {
      name: "角色状态",
      content: [
        ["row_id", "姓名"],
        ["1", "角色A"],
      ],
      sourceData: {
        ddl: "CREATE TABLE character_status (\n  row_id INTEGER PRIMARY KEY, -- 行号\n  name TEXT -- 姓名\n);",
      },
      updateConfig: { updateFrequency: -1, skipFloors: -1 },
    },
    sheet_b: {
      name: "事件记录",
      content: [
        ["row_id", "事件"],
        ["1", "抵达城门"],
      ],
      sourceData: {
        ddl: "CREATE TABLE event_log (\n  row_id INTEGER PRIMARY KEY, -- 行号\n  event_text TEXT -- 事件\n);",
      },
      updateConfig: { updateFrequency: 0, skipFloors: -1 },
    },
  };
}

let lastMountedApp: { __resetAcuV2MountForTests: () => void } | null = null;

async function mountDashboardPage(
  settings = createSettings(),
  tableData = createTableData(),
  options: {
    chatFileIdentifier?: string;
    developerOptionsEnabled?: boolean;
    warnLogEnabled?: boolean;
    failStorageSwitch?: boolean;
    vectorPipelineEnabled?: boolean;
    historyState?: Record<string, unknown>;
    templateData?: Record<string, unknown> | null;
  } = {},
) {
  vi.resetModules();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  m.parseTableTemplateJson_ACU.mockReset();
  m.parseTableTemplateJson_ACU.mockImplementation(() => {
    // 默认注入可被 Dashboard 展示的确定性模板 fixture（含 seed row）
    return {
      sheet_purge: {
        name: "PurgeFallbackTable",
        content: [
          ["row_id", "值"],
          ["seed_row_1", "不应被视为聊天数据"],
        ],
        updateConfig: { updateFrequency: 7, skipFloors: 2 },
      },
    };
  });
  vi.doMock("../../../src/shared/utils", async () => {
    const actual = await vi.importActual<typeof import("../../../src/shared/utils")>("src/shared/utils");
    return {
      ...actual,
      parseTableTemplateJson_ACU: m.parseTableTemplateJson_ACU,
    };
  });

  const saveSettings = vi.fn(() => ({ saved: true, storageType: "memory" }));
  const enableFlightMode = vi.fn(async () => ({ ok: true, visibleChronicleRowCount: 2 }));
  const disableFlightMode = vi.fn(async () => ({ ok: true }));

  vi.doMock("../../../src/service/runtime/state-manager", () => ({
    settings_ACU: settings,
    currentChatFileIdentifier_ACU:
      options.chatFileIdentifier ?? "chat-dashboard",
    currentJsonTableData_ACU: tableData,
    coreApisAreReady_ACU: true,
    getCurrentIsolationKey_ACU: () => "",
  }));
  vi.doMock("../../../src/service/settings/settings-service", () => ({
    saveSettings_ACU: saveSettings,
    setGlobalPlotEnabled_ACU: vi.fn((enabled: boolean) => {
      settings.plotSettings.enabled = enabled;
    }),
    setZeroTkOccupyMode_ACU: vi.fn((enabled: boolean) => {
      settings.zeroTkOccupyModeDefault = enabled;
    }),
    setSummaryVectorIndexMode_ACU: vi.fn((enabled: boolean) => {
      settings.summaryVectorIndexModeDefault = enabled;
    }),
  }));
  vi.doMock("../../../src/service/chat/chat-service", () => ({
    getChatArray_ACU: () => [
      { is_user: true, mes: "u1" },
      { is_user: false, mes: "a1" },
      { is_user: true, mes: "u2" },
      { is_user: false, mes: "a2" },
      { is_user: false, mes: "a3" },
    ],
  }));
  vi.doMock("../../../src/service/template/chat-scope", () => ({
    getSortedSheetKeys_ACU: (data: any) =>
      Object.keys(data).filter((k) => k.startsWith("sheet_")),
    getCurrentChatPlotScopeState_ACU: () => null,
    setCurrentChatPlotScopeState_ACU: vi.fn(),
  }));
  vi.doMock("../../../src/service/template/template-preset-service", () => ({
    getActiveTemplatePresetMeta_ACU: () => ({
      displayName: "默认预设",
      scopeLabel: "全局",
    }),
  }));
  vi.doMock("../../../src/service/table/table-history", () => ({
    resolveTableHistoryStateFromChat_ACU: (_chat: any[], opts: any) => ({
      latestAiMessageIndex: 4,
      latestDataMessageIndex: 3,
      lastTrackedUpdateMessageIndex: opts.sheetKey === "sheet_a" ? 1 : -1,
      latestDataAiFloor: 2,
      lastTrackedUpdateAiFloor: opts.sheetKey === "sheet_a" ? 1 : 0,
      hasAnyData: opts.sheetKey === "sheet_a",
      hasTrackedUpdate: opts.sheetKey === "sheet_a",
      ...(options.historyState || {}),
    }),
  }));
  vi.doMock("../../../src/service/table/storage-mode", () => ({
    getCurrentStorageMode: () => settings.storageMode,
    isSqliteMode: () => settings.storageMode === "sqlite",
  }));
  vi.doMock("../../../src/service/table/table-storage-strategy", () => ({
    switchStorageMode: vi.fn(async (mode: string) => {
      if (options.failStorageSwitch) throw new Error("switch failed");
      settings.storageMode = mode;
    }),
  }));
  vi.doMock("../../../src/service/vector/vector-memory-config", () => ({
    getCurrentVectorMemoryConfig_ACU: () => settings.vectorMemoryConfig || {},
    validateSummaryVectorIndexConfig_ACU: (config: any) => {
      const errors: string[] = [];
      if (!String(config?.embeddingEndpoint || "").trim())
        errors.push("缺少 embeddingEndpoint");
      if (!String(config?.embeddingModel || "").trim())
        errors.push("缺少 embeddingModel");
      const hasRerankEndpoint = !!String(config?.rerankEndpoint || "").trim();
      const hasRerankModel = !!String(config?.rerankModel || "").trim();
      if (hasRerankEndpoint !== hasRerankModel)
        errors.push("rerankEndpoint 和 rerankModel 必须同时填写或同时留空");
      return { valid: errors.length === 0, errors };
    },
  }));
  // 向量服务健康项按填表模式推导是否需要就绪；这里直接控制门控结果，其余导出保持真实实现。
  vi.doMock("../../../src/service/fill-mode/fill-mode-gate", async () => {
    const actual = await vi.importActual<typeof import("../../../src/service/fill-mode/fill-mode-gate")>("src/service/fill-mode/fill-mode-gate");
    return {
      ...actual,
      isVectorPipelineEnabledForCurrentChat_ACU: () => options.vectorPipelineEnabled === true,
      isVectorModeExplicitlySelected_ACU: () => options.vectorPipelineEnabled === true,
    };
  });
  vi.doMock("../../../src/service/ai/ai-service", () => ({
    getConnectionManagerProfiles_ACU: () => [],
    fetchAvailableModels_ACU: vi.fn(async () => ({
      success: true,
      models: [],
    })),
  }));
  vi.doMock("../../../src/service/flight-mode/flight-mode-state", () => ({
    getCurrentFlightModeState_ACU: () => ({ enabled: false, hiddenRowIds: [], bigSummarySheetKey: "" }),
  }));
  vi.doMock("../../../src/service/flight-mode/flight-mode-transition", () => ({
    enableFlightMode_ACU: enableFlightMode,
    disableFlightMode_ACU: disableFlightMode,
  }));

  vi.spyOn(window, "confirm").mockReturnValue(false);

  const mount = await import("../../../src/presentation-v2/bootstrap/mount");
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      uiTierV2: { tier: 'high' }, router: { activePageId: "dashboard" },
      devOptions: {
        developerOptionsEnabled: options.developerOptionsEnabled === true,
        warnLogEnabled: options.warnLogEnabled === true,
      },
    }),
  );
  lastMountedApp = mount;
  await mount.openAcuV2App();
  await new Promise((r) => setTimeout(r, 0));
  expect(document.querySelector('.acu-v2-dashboard-page')).not.toBeNull();
  const { useDashboardPage } = await import("../../../src/presentation-v2/composables/useDashboardPage");
  const dashboard = useDashboardPage();
  return { mount, settings, saveSettings, enableFlightMode, disableFlightMode, dashboard };
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  lastMountedApp?.__resetAcuV2MountForTests();
  lastMountedApp = null;
});

describe("DashboardPage", () => {
  it("runtime 为 null 时展示全局模板表名与配置，不把 seed rows 当作已有聊天数据", async () => {
    const { dashboard } = await mountDashboardPage(createSettings(), null);

    expect(dashboard.hasTables.value).toBe(true);
    const rows = dashboard.tableRows.value;
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("PurgeFallbackTable");
    // updateConfig 来自模板 fixture（updateFrequency=7, skipFloors=2），
    // 且模板 fixture 内含 seed row，不得被当作已初始化的聊天数据。
    expect(rows[0].frequency).toBe(7);
    expect(rows[0].skip).toBe(2);
    expect(rows[0].hasTrackedUpdate).toBe(false);
    expect(rows[0].hasAnyData).toBe(false);
    expect(rows[0].lastUpdatedLabel).toBe("Chưa khởi tạo");
  });

  it("runtime 为 null 时模板回退以 stripSeedRows 读取全局模板", async () => {
    const { dashboard } = await mountDashboardPage(createSettings(), null);
    expect(dashboard.hasTables.value).toBe(true);
    // useDashboardPage 内的 display reader必须通过 parseTableTemplateJson_ACU({ stripSeedRows: true })
    // 读取模板，避免把模板预置行当作聊天数据。
    expect(m.parseTableTemplateJson_ACU).toHaveBeenCalledWith({ stripSeedRows: true });
  });

  it("配置状态面板移除后，仪表盘展示运行概览和开关面板", () => {
    const source = readFileSync(
      "src/presentation-v2/pages/DashboardPage.vue",
      "utf8",
    );
    const copySource = readFileSync(
      "src/presentation-v2/copy/dashboard-copy.ts",
      "utf8",
    );

    expect(source).toContain("dashboardCopy.panels.healthTitle");
    expect(source).toContain("dashboardCopy.panels.togglesTitle");
    expect(copySource).toContain('healthTitle: "Tổng quan hoạt động"');
    expect(copySource).toContain('togglesTitle: "Công tắc"');
    expect(source).not.toContain("ConfigStatusPanel");
    expect(source).not.toContain(
      "grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);",
    );
    expect(source).not.toContain("acu-v2-dashboard-page__spacer");
  });

  it("默认渲染运行概览和基础开关；header 不再有 subtitle / 刷新按钮 / API 三件套", async () => {
    const { mount } = await mountDashboardPage();

    const page = document.querySelector(".acu-v2-dashboard-page");
    expect(page).not.toBeNull();
    const text = page!.textContent || "";

    // 配置状态面板已移除，新的运行概览面板保留概览提醒
    expect(text).not.toContain("配置状态");
    expect(text).not.toContain("当前使用 table-fast");
    expect(text).not.toContain("默认预设（全局）");
    expect(text).not.toContain("Chế độ lưu trữGốcSQL");
    expect(
      page!.querySelector(".acu-v2-dashboard-page__setup-item"),
    ).toBeNull();
    expect(
      page!.querySelector(".acu-v2-dashboard-page__status-table"),
    ).toBeNull();
    expect(text).not.toContain("下一次");
    expect(text).not.toContain("事件记录");
    expect(text).toContain("Tổng quan hoạt động");
    expect(text).toContain("API");
    expect(text).toContain("Cập nhật bảng");
    expect(text).toContain("Chế độ SQL");
    expect(text).toContain("Vector giao hỏa");
    expect(text).toContain("Nhật ký chạy");

    const vectorHealth = Array.from(
      page!.querySelectorAll<HTMLElement>(
        ".acu-v2-dashboard-page__health-item",
      ),
    ).find((item) => (item.textContent || "").includes("Vector giao hỏa"));
    expect(vectorHealth).toBeDefined();
    expect(vectorHealth!.textContent || "").toContain("Chưa bật");
    expect(
      vectorHealth!.classList.contains(
        "acu-v2-dashboard-page__health-item--info",
      ),
    ).toBe(true);
    expect(vectorHealth!.querySelector(".acu-badge--neutral")).not.toBeNull();

    // 基础设置默认呈现
    expect(text).toContain("Cài đặt cơ bản");
    expect(text).not.toContain("功能开关");
    expect(text).toContain("Cài đặt nâng cao");
    expect(text).toContain("Cập nhật tự động");
    expect(text).toContain("Chế độ im lặng");
    expect(text).toContain("Thú cưng màn hình");
    expect(text).toContain("Bật xuất streaming");
    expect(text).toContain("Chế độ chiếm 0TK");

    const visibleToggleKeys = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        "button[data-acu-toggle-key]",
      ),
    ).map((button) => button.dataset.acuToggleKey);
    expect(visibleToggleKeys).toEqual([
      "autoUpdateEnabled",
      "silentModeEnabled",
      "desktopPetEnabled",
      "deskPetJokesEnabled",
      "deskPetShowRealWork",
      "zeroTkOccupyModeDefault",
      "streamingEnabled",
    ]);

    // 默认在基础设置视图下，高级字段不可见
    expect(
      document.querySelector('button[data-acu-toggle-key="plotEnabled"]'),
    ).toBeNull();
    expect(text).not.toContain("启用条件模板功能");
    expect(text).not.toContain("交火模式默认关闭");
    expect(text).not.toContain("Bật tùy chọn nhà phát triển");
    expect(text).not.toContain("启用SQL存储");
    // 旧存储模式 radio 不再由配置状态面板承载
    expect(text).not.toContain("决定表格数据如何持久化");
    expect(
      document.querySelector('div[role="radiogroup"][aria-label="Chế độ lưu trữ"]'),
    ).toBeNull();
    expect(text).not.toContain("SQLite");

    // 旧设计已删除：subtitle / 刷新按钮 / API 三件套面板 / 规范填表 toggle
    expect(text).not.toContain("数据库运行态");
    expect(text).not.toContain("当前 API");
    expect(text).not.toContain("规范填表");
    expect(
      document.querySelector(
        'button[data-acu-toggle-key="standardizedTableFillEnabled"]',
      ),
    ).toBeNull();

    mount.__resetAcuV2MountForTests();
  });

  it("未加载聊天时表格更新和 SQL 模式使用白色提示，不显示黄色警告", async () => {
    const settings = createSettings();
    settings.storageMode = "sqlite";
    const { mount } = await mountDashboardPage(settings, createSqlTableData(), {
      chatFileIdentifier: "unknown_chat_init",
    });

    const healthItems = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".acu-v2-dashboard-page__health-item",
      ),
    );
    const tableHealth = healthItems.find((item) =>
      (item.textContent || "").includes("Cập nhật bảng"),
    );
    const sqlHealth = healthItems.find((item) =>
      (item.textContent || "").includes("Chế độ SQL"),
    );

    expect(tableHealth).toBeDefined();
    expect(sqlHealth).toBeDefined();
    for (const item of [tableHealth!, sqlHealth!]) {
      expect(item.textContent || "").toContain("Chưa nạp cuộc trò chuyện");
      expect(
        item.classList.contains("acu-v2-dashboard-page__health-item--info"),
      ).toBe(true);
      expect(
        item.classList.contains("acu-v2-dashboard-page__health-item--warning"),
      ).toBe(false);
      expect(item.querySelector(".acu-badge--neutral")).not.toBeNull();
      expect(item.querySelector("button")).toBeNull();
    }
    expect(tableHealth!.textContent || "").toContain("không thể đọc bảng cơ sở dữ liệu tương ứng");
    expect(sqlHealth!.textContent || "").toContain(
      "tạm thời không thể kiểm tra mẫu bảng của cuộc trò chuyện hiện tại có phù hợp hay không",
    );

    mount.__resetAcuV2MountForTests();
  });

  it("SQLite 存储开启且表格模板适配时显示模板适配", async () => {
    const settings = createSettings();
    settings.storageMode = "sqlite";
    const { mount } = await mountDashboardPage(settings, createSqlTableData());

    const sqlHealth = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".acu-v2-dashboard-page__health-item",
      ),
    ).find((item) => (item.textContent || "").includes("Chế độ SQL"));

    expect(sqlHealth).toBeDefined();
    expect(sqlHealth!.textContent || "").toContain("Mẫu phù hợp");
    expect(sqlHealth!.textContent || "").toContain("Chế độ lưu trữ hiện tại là SQLite");
    expect(sqlHealth!.textContent || "").toContain(
      "2 bảng hiện tại đều là mẫu bảng phù hợp với SQL",
    );
    expect(sqlHealth!.querySelector("button")).toBeNull();

    mount.__resetAcuV2MountForTests();
  });

  it("SQLite 存储开启但表格模板不完整时提示去表格模板补齐", async () => {
    const settings = createSettings();
    settings.storageMode = "sqlite";
    const tableData = createSqlTableData() as any;
    delete tableData.sheet_b.sourceData.ddl;
    const { mount } = await mountDashboardPage(settings, tableData);

    const sqlHealth = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".acu-v2-dashboard-page__health-item",
      ),
    ).find((item) => (item.textContent || "").includes("Chế độ SQL"));

    expect(sqlHealth).toBeDefined();
    expect(sqlHealth!.textContent || "").toContain("Mẫu chưa phù hợp");
    expect(sqlHealth!.textContent || "").toContain("Chế độ lưu trữ hiện tại là SQLite");
    expect(sqlHealth!.textContent || "").toContain("事件记录");
    expect(sqlHealth!.textContent || "").toContain("bổ sung thông tin cấu trúc bảng SQL");
    expect(sqlHealth!.textContent || "").toContain("Xem mẫu bảng");

    const action = Array.from(
      sqlHealth!.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => (button.textContent || "").includes("Xem mẫu bảng"));
    expect(action).toBeDefined();

    mount.__resetAcuV2MountForTests();
  });

  it("原生 JSON 存储但表格模板包含 SQL 信息时默认显示中性说明", async () => {
    const settings = createSettings();
    const { mount } = await mountDashboardPage(settings, createSqlTableData());

    const sqlHealth = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".acu-v2-dashboard-page__health-item",
      ),
    ).find((item) => (item.textContent || "").includes("Chế độ SQL"));

    expect(sqlHealth).toBeDefined();
    expect(sqlHealth!.textContent || "").toContain("JSON gốc");
    expect(sqlHealth!.textContent || "").toContain("Chế độ lưu trữ hiện tại là JSON gốc");
    expect(sqlHealth!.textContent || "").toContain("không ảnh hưởng đến việc chạy chế độ JSON gốc");
    expect(sqlHealth!.textContent || "").not.toContain("kiểm tra của nhà phát triển");
    expect(
      sqlHealth!.classList.contains("acu-v2-dashboard-page__health-item--info"),
    ).toBe(true);
    expect(
      sqlHealth!.classList.contains(
        "acu-v2-dashboard-page__health-item--warning",
      ),
    ).toBe(false);

    mount.__resetAcuV2MountForTests();
  });

  it("开发者模式显示原生 JSON 下的 SQL 模板诊断", async () => {
    const settings = createSettings();
    const { mount } = await mountDashboardPage(settings, createSqlTableData(), {
      developerOptionsEnabled: true,
    });

    const sqlHealth = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".acu-v2-dashboard-page__health-item",
      ),
    ).find((item) => (item.textContent || "").includes("Chế độ SQL"));

    expect(sqlHealth).toBeDefined();
    expect(sqlHealth!.textContent || "").toContain("Gợi ý cho nhà phát triển");
    expect(sqlHealth!.textContent || "").toContain("kiểm tra của nhà phát triển phát hiện");
    expect(sqlHealth!.textContent || "").toContain("chọn \"SQLite\"");
    expect(
      sqlHealth!.classList.contains("acu-v2-dashboard-page__health-item--info"),
    ).toBe(true);

    mount.__resetAcuV2MountForTests();
  });

  it("API 未配置时健康面板第一项给出最高优先级提醒并可跳到 API 页", async () => {
    const settings = createSettings();
    settings.apiPresets = [];
    settings.defaultApiPresetName = "";
    settings.apiConfig.useMainApi = false;
    const { mount } = await mountDashboardPage(settings);

    const healthItems = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".acu-v2-dashboard-page__health-item",
      ),
    );
    expect(healthItems.length).toBeGreaterThanOrEqual(4);
    expect(healthItems[0].textContent || "").toContain("API");
    expect(healthItems[0].textContent || "").toContain("Chưa cấu hình");
    expect(healthItems[0].textContent || "").toContain(
      "Trang API hiện không có preset khả dụng",
    );
    expect(healthItems[0].textContent || "").toContain("Thiếu Endpoint, Mô hình");

    const action = Array.from(
      healthItems[0].querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => (button.textContent || "").includes("Cấu hình API"));
    expect(action).toBeDefined();
    action!.click();
    await Promise.resolve();

    const { useRouterStore } =
      await import("../../../src/presentation-v2/stores/router-store");
    expect(useRouterStore().activePageId).toBe("api");

    mount.__resetAcuV2MountForTests();
  });

  it("API 健康追踪 API 页当前预设，而不是填表专用 API", async () => {
    const settings = createSettings();
    settings.apiConfig.useMainApi = false;
    settings.tableApiPreset = "missing-table-only";
    const { mount } = await mountDashboardPage(settings);

    const healthItems = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".acu-v2-dashboard-page__health-item",
      ),
    );
    const apiText = healthItems[0].textContent || "";
    expect(apiText).toContain('Preset hiện tại "table-fast" ở trang API đã được cấu hình');
    expect(apiText).toContain("dùng API chính của SillyTavern");
    expect(
      healthItems[0].querySelector(".acu-v2-dashboard-page__health-meta"),
    ).toBeNull();
    expect(apiText).not.toContain("当前填表 API");
    expect(apiText).not.toContain("当前预设：");
    expect(apiText).not.toContain("连接：");
    expect(apiText).not.toContain("填表页指定");
    expect(apiText).not.toContain("missing-table-only");

    mount.__resetAcuV2MountForTests();
  });

  it("运行日志报错会在健康面板解释并统一跳转高级工具", async () => {
    const { mount } = await mountDashboardPage();
    const { pushLog } = await import("../../../src/shared/log-buffer");

    pushLog("error", ["[ACU]", "API请求失败: 500 bad gateway"]);
    await Promise.resolve();

    const page = document.querySelector(
      ".acu-v2-dashboard-page",
    ) as HTMLElement;
    expect(page.textContent || "").toContain("Nhật ký gần đây chỉ ra vấn đề về cấu hình hoặc kết nối API");
    expect(page.textContent || "").toContain("Xem nhật ký chạy");

    const logAction = Array.from(
      page.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => (button.textContent || "").includes("Xem nhật ký chạy"));
    expect(logAction).toBeDefined();
    logAction!.click();
    await Promise.resolve();

    const { useRouterStore } =
      await import("../../../src/presentation-v2/stores/router-store");
    expect(useRouterStore().activePageId).toBe("advanced-tools");

    mount.__resetAcuV2MountForTests();
  });

  it("运行日志 Warn 计数默认隐藏，仅开发者模式显示", async () => {
    const normal = await mountDashboardPage();
    let logBuffer = await import("../../../src/shared/log-buffer");

    logBuffer.pushLog("warn", ["[ACU]", "普通警告"]);
    await Promise.resolve();

    let pageText =
      document.querySelector(".acu-v2-dashboard-page")?.textContent || "";
    expect(pageText).toContain("Phiên giao diện lần này không ghi nhận nhật ký cấp Error.");
    expect(pageText).not.toContain("Warn");

    normal.mount.__resetAcuV2MountForTests();

    const developer = await mountDashboardPage(createSettings(), createTableData(), {
      developerOptionsEnabled: true,
      warnLogEnabled: true,
    });
    logBuffer = await import("../../../src/shared/log-buffer");
    logBuffer.pushLog("warn", ["[ACU]", "开发者警告"]);
    await Promise.resolve();

    pageText =
      document.querySelector(".acu-v2-dashboard-page")?.textContent || "";
    expect(pageText).toContain("ở chế độ nhà phát triển có thể thấy");
    expect(pageText).toContain("dòng Warn");

    developer.mount.__resetAcuV2MountForTests();
  });

  it("填表模式使用向量召回但向量模型缺失时显示独立提醒", async () => {
    const { mount } = await mountDashboardPage(createSettings(), createTableData(), { vectorPipelineEnabled: true });

    const text =
      document.querySelector(".acu-v2-dashboard-page")?.textContent || "";
    expect(text).toContain("Vector giao hỏa");
    expect(text).toContain("Cấu hình chưa đầy đủ");
    expect(text).toContain("Thiếu \"URL vector hóa\"");
    expect(text).toContain("Thiếu \"Tên mô hình vector hóa\"");
    expect(text).not.toContain("embeddingEndpoint");
    expect(text).not.toContain("embeddingModel");
    expect(text).not.toContain(`服务${"地址"}`);
    expect(text).not.toContain(`模型${"名称"}`);
    expect(text).toContain("Đến chế độ điền bảng");

    mount.__resetAcuV2MountForTests();
  });

  it("仪表盘不再提供飞行模式开关", async () => {
    const { mount } = await mountDashboardPage();
    expect(document.querySelector('button[data-acu-toggle-key="flightMode"]')).toBeNull();
    expect(document.querySelector(".acu-v2-dashboard-page")?.textContent || "").not.toContain("飞行模式");

    mount.__resetAcuV2MountForTests();
  });

  it("修改自动填表开关会保存 settings", async () => {
    const { mount, settings, saveSettings } = await mountDashboardPage();

    const toggle = document.querySelector(
      'button[data-acu-toggle-key="autoUpdateEnabled"]',
    ) as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    toggle.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(settings.autoUpdateEnabled).toBe(false);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(saveSettings).toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it("切换到高级设置后显示高级开关、存储模式选择与开发者总开关", async () => {
    const { mount } = await mountDashboardPage();

    // 找到 segmented control 的"Cài đặt nâng cao"按钮
    const segmentedButtons = Array.from(
      document.querySelectorAll('button[role="radio"]'),
    ) as HTMLButtonElement[];
    const advancedBtn = segmentedButtons.find(
      (b) => (b.textContent || "").trim() === "Cài đặt nâng cao",
    );
    expect(advancedBtn).toBeDefined();
    advancedBtn!.click();
    await new Promise((r) => setTimeout(r, 0));

    const text =
      document.querySelector(".acu-v2-dashboard-page")?.textContent || "";
    expect(document.querySelector('button[data-acu-toggle-key="plotEnabled"]')).toBeNull();
    expect(text).toContain("Viết tiếp thông minh");
    expect(text).toContain("Mô phỏng thế giới");
    expect(text).toContain("Nhập từ bên ngoài");
    expect(document.querySelector('button[data-acu-toggle-key="summaryVectorIndexModeEnabled"]')).toBeNull();
    expect(text).toContain("Chế độ lưu trữ");
    expect(text).toContain("JSON gốc");
    expect(text).toContain("SQLite");
    expect(text).toContain("Tương thích tốt nhất");
    expect(text).toContain("Bật tùy chọn nhà phát triển");
    expect(text).not.toContain("启用SQL存储");
    expect(text).not.toContain("启用条件模板功能");
    expect(text).not.toContain("Chế độ chiếm 0TK");
    expect(text).toContain("Chọn cách lưu dữ liệu bảng");

    const visibleToggleKeys = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        "button[data-acu-toggle-key]",
      ),
    ).map((button) => button.dataset.acuToggleKey);
    expect(visibleToggleKeys).toEqual([
      "continuationPageEnabled",
      "worldSimulationPageEnabled",
      "externalImportPageEnabled",
      "contentReplaceEnabled",
      "developerOptionsEnabled",
    ]);

    const storageGroup = document.querySelector(
      'div[role="radiogroup"][aria-label="Chế độ lưu trữ"]',
    );
    expect(storageGroup).not.toBeNull();
    expect(storageGroup!.closest(".acu-dashboard-storage-mode")).not.toBeNull();
    expect(
      storageGroup!.classList.contains("acu-dashboard-storage-mode__switch"),
    ).toBe(true);
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".acu-dashboard-storage-mode__card",
      ),
    );
    expect(cards).toHaveLength(2);
    expect(
      cards[0].classList.contains("acu-dashboard-storage-mode__card--active"),
    ).toBe(true);
    expect(
      cards[1].classList.contains("acu-dashboard-storage-mode__card--active"),
    ).toBe(false);
    expect(text.indexOf("Bật tùy chọn nhà phát triển")).toBeLessThan(
      text.indexOf("Chế độ lưu trữGốcSQL"),
    );

    mount.__resetAcuV2MountForTests();
  });

  it("修改流式输出开关会保存 settings", async () => {
    const { mount, settings, saveSettings } = await mountDashboardPage();

    const toggle = document.querySelector(
      'button[data-acu-toggle-key="streamingEnabled"]',
    ) as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    toggle.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(settings.streamingEnabled).toBe(true);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(saveSettings).toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it("高级设置里的存储模式选择会切换到 SQLite", async () => {
    const { mount, settings, saveSettings } = await mountDashboardPage();

    const segmentedButtons = Array.from(
      document.querySelectorAll('button[role="radio"]'),
    ) as HTMLButtonElement[];
    const advancedBtn = segmentedButtons.find(
      (b) => (b.textContent || "").trim() === "Cài đặt nâng cao",
    );
    advancedBtn!.click();
    await new Promise((r) => setTimeout(r, 0));

    const page = document.querySelector(
      ".acu-v2-dashboard-page",
    ) as HTMLElement;
    const storageButtons = Array.from(
      page.querySelectorAll<HTMLButtonElement>(
        'div[role="radiogroup"][aria-label="Chế độ lưu trữ"] button[role="radio"]',
      ),
    );
    expect(
      storageButtons.map((button) => (button.textContent || "").trim()),
    ).toEqual(["Gốc", "SQL"]);
    expect(
      storageButtons.map((button) => button.getAttribute("aria-checked")),
    ).toEqual(["true", "false"]);

    storageButtons[1].click();
    await new Promise((r) => setTimeout(r, 0));

    expect(settings.storageMode).toBe("sqlite");
    expect(
      storageButtons.map((button) => button.getAttribute("aria-checked")),
    ).toEqual(["false", "true"]);
    const cards = Array.from(
      page.querySelectorAll<HTMLElement>(".acu-dashboard-storage-mode__card"),
    );
    expect(
      cards.map((card) =>
        card.classList.contains("acu-dashboard-storage-mode__card--active"),
      ),
    ).toEqual([false, true]);
    expect(saveSettings).toHaveBeenCalled();
    expect(page.textContent || "").not.toContain("Đã chuyển sang chế độ SQLite.");
    expect(document.body.textContent || "").toContain("Đã chuyển sang chế độ SQLite.");

    mount.__resetAcuV2MountForTests();
  });

  it("真实工作内容默认关闭，桌宠与普通气泡均即时刷新通知和进度，错误始终显示真实内容", async () => {
    const settings = createSettings();
    settings.deskPetJokesEnabled = false;
    const { mount, saveSettings } = await mountDashboardPage(settings);
    const hub = await import('../../../src/shared/notice-hub');
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));
    const toggle = () => document.querySelector<HTMLButtonElement>('[data-acu-toggle-key="deskPetShowRealWork"]')!;
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    hub.notify_ACU('info', '正在核对第三批纪要', { title: '纪要召回' });
    await tick();
    const body = () => document.querySelector('.acu-notice-bubble__text')?.textContent || '';
    expect(body()).toMatch(/^Đang .+…$/);
    expect(body()).not.toBe('正在核对第三批纪要');
    toggle().click();
    await tick();
    expect(settings.deskPetShowRealWork).toBe(true);
    expect(saveSettings).toHaveBeenCalled();
    expect(body()).toBe('正在核对第三批纪要');
    expect(document.querySelector('.acu-notice-bubble__heading')?.textContent).toBe('纪要召回');
    expect(document.querySelector('.acu-notice-bubble__detail')).toBeNull();
    document.querySelector<HTMLButtonElement>('[data-acu-toggle-key="desktopPetEnabled"]')!.click();
    await tick();
    expect(settings.desktopPetEnabled).toBe(false);
    expect(toggle()).not.toBeNull();
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('[data-acu-toggle-key="deskPetJokesEnabled"]')).toBeNull();
    expect(body()).toBe('正在核对第三批纪要');
    expect(document.querySelector('.acu-notice-bubble__heading')?.textContent).toBe('纪要召回');
    toggle().click();
    await tick();
    expect(settings.deskPetShowRealWork).toBe(false);
    expect(body()).toMatch(/^Đang .+…$/);
    toggle().click();
    await tick();
    expect(body()).toBe('正在核对第三批纪要');
    document.querySelector<HTMLButtonElement>('[data-acu-toggle-key="desktopPetEnabled"]')!.click();
    await tick();
    toggle().click();
    await tick();
    expect(body()).toMatch(/^Đang .+…$/);

    const errorText = '纪要读取失败：连接中断';
    hub.notify_ACU('error', errorText, { title: '纪要召回失败' });
    document.querySelector<HTMLButtonElement>('.acu-notice-bubble__close')!.click();
    await tick();
    expect(body()).toBe(errorText);
    expect(document.querySelector('.acu-notice-bubble__heading')?.textContent).toBe('纪要召回失败');
    expect(document.querySelector('.acu-notice-bubble')?.getAttribute('role')).toBe('alert');
    expect(document.querySelector('.acu-notice-bubble__detail')).toBeNull();
    expect(document.querySelector('.acu-notice-bubble__body')?.classList.contains('is-expandable')).toBe(false);
    toggle().click();
    await tick();
    expect(body()).toBe(errorText);
    toggle().click();
    await tick();
    expect(settings.deskPetShowRealWork).toBe(false);
    expect(body()).toBe(errorText);
    expect(document.querySelector('.acu-notice-bubble__detail')).toBeNull();
    document.querySelector<HTMLButtonElement>('[data-acu-toggle-key="desktopPetEnabled"]')!.click();
    await tick();
    expect(toggle()).not.toBeNull();
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(body()).toBe(errorText);
    expect(document.querySelector('.acu-notice-bubble__heading')?.textContent).toBe('纪要召回失败');
    document.querySelector<HTMLButtonElement>('[data-acu-toggle-key="desktopPetEnabled"]')!.click();
    await tick();

    const task = hub.beginNoticeTask_ACU('剧情推进', { detail: '分析记忆目录', busy: true });
    document.querySelector<HTMLButtonElement>('.acu-notice-bubble__close')!.click();
    await tick();
    toggle().click();
    await tick();
    expect(document.querySelector('.acu-notice-bubble__heading')?.textContent).toBe('剧情推进');
    expect(body()).toBe('分析记忆目录');
    task.update('整理最终提示词');
    await tick();
    expect(body()).toBe('整理最终提示词');

    document.querySelector<HTMLButtonElement>('[data-acu-toggle-key="desktopPetEnabled"]')!.click();
    await tick();
    expect(toggle()).not.toBeNull();
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(body()).toBe('整理最终提示词');
    const savesBeforeRealWorkToggle = saveSettings.mock.calls.length;
    toggle().click();
    await tick();
    expect(settings.deskPetShowRealWork).toBe(false);
    expect(saveSettings).toHaveBeenCalledTimes(savesBeforeRealWorkToggle + 1);
    expect(body()).toMatch(/^Đang .+…$/);
    toggle().click();
    await tick();
    expect(settings.deskPetShowRealWork).toBe(true);
    expect(saveSettings).toHaveBeenCalledTimes(savesBeforeRealWorkToggle + 2);
    expect(document.querySelector('.acu-notice-bubble__heading')?.textContent).toBe('剧情推进');
    task.update('普通气泡持续显示工作进度');
    await tick();
    expect(body()).toBe('普通气泡持续显示工作进度');
    document.querySelector<HTMLButtonElement>('[data-acu-toggle-key="desktopPetEnabled"]')!.click();
    await tick();
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(body()).toBe('普通气泡持续显示工作进度');
    task.end();
    mount.__resetAcuV2MountForTests();
  });

  it("关闭 v2 后通知气泡仍在面板外可见", async () => {
    const { mount } = await mountDashboardPage();

    const segmentedButtons = Array.from(
      document.querySelectorAll('button[role="radio"]'),
    ) as HTMLButtonElement[];
    segmentedButtons.find((b) => (b.textContent || "").trim() === "Cài đặt nâng cao")!.click();
    await new Promise((r) => setTimeout(r, 0));

    const storageButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        'div[role="radiogroup"][aria-label="Chế độ lưu trữ"] button[role="radio"]',
      ),
    );
    storageButtons[1].click();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector(".acu-notice-bubble")?.textContent || "").toContain("Đã chuyển sang chế độ SQLite.");

    document.querySelector<HTMLButtonElement>(".acu-v2-app__close")!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector(".acu-notice-bubble")?.textContent || "").toContain("Đã chuyển sang chế độ SQLite.");

    mount.__resetAcuV2MountForTests();
  });

  it("存储模式切换失败时写日志并显示短 toast", async () => {
    const { mount } = await mountDashboardPage(createSettings(), createTableData(), {
      failStorageSwitch: true,
    });

    const segmentedButtons = Array.from(
      document.querySelectorAll('button[role="radio"]'),
    ) as HTMLButtonElement[];
    segmentedButtons.find((b) => (b.textContent || "").trim() === "Cài đặt nâng cao")!.click();
    await new Promise((r) => setTimeout(r, 0));

    const storageButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        'div[role="radiogroup"][aria-label="Chế độ lưu trữ"] button[role="radio"]',
      ),
    );
    storageButtons[1].click();
    await new Promise((r) => setTimeout(r, 0));

    expect(document.body.textContent || "").toContain("Chuyển chế độ lưu trữ thất bại, xem chi tiết trong nhật ký chạy");
    const { getAllLogs } = await import("../../../src/shared/log-buffer");
    expect(getAllLogs().some((entry) => entry.message.includes("switch failed"))).toBe(true);

    mount.__resetAcuV2MountForTests();
  });

  it("高级设置承载功能页开关，格林推演默认关闭并随切换控制一级页可见性", async () => {
    const { mount, settings, saveSettings } = await mountDashboardPage();

    const segmentedButtons = Array.from(
      document.querySelectorAll('button[role="radio"]'),
    ) as HTMLButtonElement[];
    const advancedBtn = segmentedButtons.find(
      (b) => (b.textContent || "").trim() === "Cài đặt nâng cao",
    );
    expect(advancedBtn).toBeDefined();
    advancedBtn!.click();
    await new Promise((r) => setTimeout(r, 0));

    let text =
      document.querySelector(".acu-v2-dashboard-page")?.textContent || "";
    expect(text).not.toContain("Đẩy cốt truyện");
    expect(text).toContain("Viết tiếp thông minh");
    expect(text).toContain("Mô phỏng thế giới");
    expect(text).toContain("Nhập từ bên ngoài");
    expect(text).toContain("Thay thế nội dung");

    expect(
      document.querySelector(".acu-v2-sidebar")?.textContent || "",
    ).toContain("Đẩy cốt truyện");
    expect(
      document.querySelector(".acu-v2-sidebar")?.textContent || "",
    ).toContain("Viết tiếp thông minh");
    expect(
      document.querySelector(".acu-v2-sidebar")?.textContent || "",
    ).not.toContain("Mô phỏng thế giới");
    expect(
      document.querySelector(".acu-v2-sidebar")?.textContent || "",
    ).toContain("Nhập từ ngoài");
    expect(
      document.querySelector(".acu-v2-sidebar")?.textContent || "",
    ).not.toContain("交火模式");

    const continuationToggle = document.querySelector(
      'button[data-acu-toggle-key="continuationPageEnabled"]',
    ) as HTMLButtonElement;
    const worldSimulationToggle = document.querySelector(
      'button[data-acu-toggle-key="worldSimulationPageEnabled"]',
    ) as HTMLButtonElement;
    const importToggle = document.querySelector(
      'button[data-acu-toggle-key="externalImportPageEnabled"]',
    ) as HTMLButtonElement;
    expect(document.querySelector('button[data-acu-toggle-key="plotEnabled"]')).toBeNull();
    expect(continuationToggle).not.toBeNull();
    expect(worldSimulationToggle).not.toBeNull();
    expect(importToggle).not.toBeNull();
    expect(worldSimulationToggle.getAttribute("aria-checked")).toBe("false");

    continuationToggle.click();
    worldSimulationToggle.click();
    importToggle.click();
    await Promise.resolve();

    expect(settings.continuationPageEnabled).toBe(false);
    expect(settings.worldSimulationPageEnabled).toBe(true);
    expect(settings.externalImportPageEnabled).toBe(false);
    text = document.querySelector(".acu-v2-sidebar")?.textContent || "";
    expect(text).not.toContain("Viết tiếp thông minh");
    expect(text).toContain("Mô phỏng thế giới");
    expect(text).not.toContain("Nhập từ ngoài");
    expect(worldSimulationToggle.getAttribute("aria-checked")).toBe("true");
    expect(saveSettings).toHaveBeenCalled();

    const savesBeforeDisablingWorldSimulation = saveSettings.mock.calls.length;
    worldSimulationToggle.click();
    await Promise.resolve();
    expect(settings.worldSimulationPageEnabled).toBe(false);
    expect(saveSettings).toHaveBeenCalledTimes(savesBeforeDisablingWorldSimulation + 1);
    expect(worldSimulationToggle.getAttribute("aria-checked")).toBe("false");
    text = document.querySelector(".acu-v2-sidebar")?.textContent || "";
    expect(text).toContain("Chức năng");
    expect(text).toContain("Đẩy cốt truyện");
    expect(text).not.toContain("Mô phỏng thế giới");

    mount.__resetAcuV2MountForTests();
  });

  it("正文替换开关常驻显示在外部导入下方，开启后才显示页面并启用功能", async () => {
    const settings = createSettings();
    settings.contentOptimizationSettings.enabled = false;
    const { mount } = await mountDashboardPage(settings);

    const segmentedButtons = Array.from(
      document.querySelectorAll('button[role="radio"]'),
    ) as HTMLButtonElement[];
    const advancedBtn = segmentedButtons.find(
      (b) => (b.textContent || "").trim() === "Cài đặt nâng cao",
    );
    advancedBtn!.click();
    await new Promise((r) => setTimeout(r, 0));

    const text =
      document.querySelector(".acu-v2-dashboard-page")?.textContent || "";
    expect(text).not.toContain("功能开关");
    expect(text).toContain("Thay thế nội dung");
    expect(
      document.querySelector(".acu-v2-sidebar")?.textContent || "",
    ).not.toContain("Thay thế nội dung");
    expect(settings.contentOptimizationSettings.enabled).toBe(false);

    const visibleToggleKeys = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        "button[data-acu-toggle-key]",
      ),
    ).map((button) => button.dataset.acuToggleKey);
    expect(visibleToggleKeys).toEqual([
      "continuationPageEnabled",
      "worldSimulationPageEnabled",
      "externalImportPageEnabled",
      "contentReplaceEnabled",
      "developerOptionsEnabled",
    ]);

    const toggle = document.querySelector(
      'button[data-acu-toggle-key="contentReplaceEnabled"]',
    ) as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute("aria-checked")).toBe("false");

    toggle.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(settings.contentOptimizationSettings.enabled).toBe(true);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(
      document.querySelector(".acu-v2-sidebar")?.textContent || "",
    ).toContain("Thay thế nội dung");

    mount.__resetAcuV2MountForTests();
  });

  it("条件模板功能不再显示开关，并在刷新时保持开启", async () => {
    const settings = createSettings();
    settings.promptTemplateSettings.enabled = false;
    const { mount, saveSettings } = await mountDashboardPage(settings);

    const text =
      document.querySelector(".acu-v2-dashboard-page")?.textContent || "";
    expect(text).not.toContain("启用条件模板功能");
    expect(
      document.querySelector(
        'button[data-acu-toggle-key="promptTemplateEnabled"]',
      ),
    ).toBeNull();
    expect(settings.promptTemplateSettings.enabled).toBe(true);
    expect(saveSettings).toHaveBeenCalled();

    mount.__resetAcuV2MountForTests();
  });

  it("开发者总开关会写入 dev-options 持久化", async () => {
    const { mount } = await mountDashboardPage();

    const segmentedButtons = Array.from(
      document.querySelectorAll('button[role="radio"]'),
    ) as HTMLButtonElement[];
    const advancedBtn = segmentedButtons.find(
      (b) => (b.textContent || "").trim() === "Cài đặt nâng cao",
    );
    advancedBtn!.click();
    await new Promise((r) => setTimeout(r, 0));

    const devToggle = document.querySelector(
      'button[data-acu-toggle-key="developerOptionsEnabled"]',
    ) as HTMLButtonElement;
    expect(devToggle).not.toBeNull();
    devToggle.click();
    await Promise.resolve();

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    expect(persisted?.devOptions?.developerOptionsEnabled).toBe(true);

    mount.__resetAcuV2MountForTests();
  });
});

describe('零层面板入口反馈', () => {
  let disposePanel: (() => void) | undefined;
  afterEach(() => {
    disposePanel?.();
    disposePanel = undefined;
    vi.doUnmock('../../../src/presentation-v2/composables/useZeroLayerStatus');
    vi.doUnmock('../../../src/presentation-v2/stores/api-preset-store');
  });

  async function mountPanel() {
    vi.resetModules();
    const { createApp, ref, nextTick } = await import('vue');
    const view = ref({ status: 'disabled', intent: false, label: '已关闭',
      detail: '当前聊天尚未启用。', revision: null, headTurnId: null });
    const controls = ref({ apiPresetName: '', branchId: '', branches: [], heads: [],
      canSend: false, canExit: false, pendingTurn: null });
    const working = ref(false);
    const actionError = ref('');
    const submit = vi.fn(async () => false);
    const setEnabled = vi.fn(async (enabled: boolean) => {
      view.value = { ...view.value, status: enabled ? 'unverified' : 'disabled',
        intent: enabled, label: enabled ? '已开启' : '已关闭' };
      controls.value = { ...controls.value, canSend: enabled };
      return true;
    });
    const status = { view, controls, working, actionError, submit, setEnabled,
      worldInfoScanRounds: ref(2), setWorldInfoScanRounds: vi.fn(),
      history: ref([]), historyHasMore: ref(false), historyLoading: ref(false), historyError: ref(''),
      refresh: vi.fn(), recover: vi.fn(), stop: vi.fn(), exit: vi.fn(), abandon: vi.fn(),
      selectBranch: vi.fn(), forkBranch: vi.fn(), loadHistory: vi.fn() };
    vi.doMock('../../../src/presentation-v2/composables/useZeroLayerStatus', () => ({ useZeroLayerStatus: () => status }));
    vi.doMock('../../../src/presentation-v2/stores/api-preset-store', () => ({ useApiPresetStore: () => ({
      presets: [{ name: 'database-direct', apiMode: 'custom',
        apiConfig: { useMainApi: false, sendViaTavern: false, url: 'https://api.invalid', model: 'test' } }],
      refreshFromSettings: vi.fn(),
    }) }));
    const { default: Panel } = await import('../../../src/presentation-v2/components/DashboardZeroLayerStatus.vue');
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = createApp(Panel);
    app.mount(root);
    disposePanel = () => { app.unmount(); root.remove(); };
    await nextTick();
    return { root, status, nextTick };
  }

  it('关闭时解释禁用原因，选择预设并启用后可发送，失败保留草稿', async () => {
    const { root, status, nextTick } = await mountPanel();
    const toggle = Array.from(root.querySelectorAll<HTMLButtonElement>('button[role="switch"]'))
      .find(button => button.textContent?.includes('Bật Tầng 0 cho cuộc trò chuyện này'))!;
    const send = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent === 'Gửi lượt logic')!;
    const input = root.querySelector<HTMLInputElement>('.acu-input-shell--text input')!;
    input.value = '开始';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(toggle.disabled).toBe(true);
    expect(toggle.title).toContain('Hãy chọn');
    expect(send.disabled).toBe(true);
    expect(root.querySelector('#acu-zero-layer-send-hint')?.textContent).toContain('chưa bật Tầng 0');
    send.click();
    expect(status.submit).not.toHaveBeenCalled();

    root.querySelector<HTMLButtonElement>('.acu-select__trigger')!.click();
    await nextTick();
    root.querySelector<HTMLElement>('.acu-select__item')!.click();
    await nextTick();
    expect(toggle.disabled).toBe(false);
    toggle.click();
    await nextTick();
    expect(status.setEnabled).toHaveBeenCalledWith(true, 'database-direct');
    expect(send.disabled).toBe(false);
    send.click();
    await status.submit.mock.results[0].value;
    await nextTick();
    expect(status.submit).toHaveBeenCalledWith('开始');
    expect(input.value).toBe('开始');
    status.submit.mockResolvedValueOnce(true);
    send.click();
    expect(status.submit).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(input.value).toBe(''));
    await nextTick();
    expect(send.disabled).toBe(true);
    expect(send.title).toBe('Vui lòng nhập hành động của lượt này.');
  });

  it('读取失败时保留未知状态，操作期间禁止重复发送并展示具体错误', async () => {
    const { root, status, nextTick } = await mountPanel();
    status.view.value = { ...status.view.value, status: 'storage-read-failed',
      intent: null as any, detail: '存档读取失败，请只读刷新。' };
    status.actionError.value = '正文 API 连接失败';
    await nextTick();
    const toggle = root.querySelector<HTMLButtonElement>('button[role="switch"]')!;
    const send = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent === 'Gửi lượt logic')!;
    expect(toggle.disabled).toBe(true);
    expect(send.title).toBe('存档读取失败，请只读刷新。');
    expect(root.querySelector('[role="alert"]')?.textContent).toBe('正文 API 连接失败');
    status.working.value = true;
    await nextTick();
    expect(send.disabled).toBe(true);
    expect(send.title).toContain('Thao tác Tầng 0 đang chạy');
  });
});