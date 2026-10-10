/**
 * 任务与事件表 — 默认表定义
 */
export const questsEventsSheet = {
  uid: "sheet_etak47Ve",
  name: "任务与事件表",
  sourceData: {
    note: "Ghi lại tất cả nhiệm vụ đang tiến hành hiện tại. (Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: 任务名称 (Tên nhiệm vụ) - Tiêu đề nhiệm vụ, không được trùng với nhiệm vụ đã có trong bảng.\n- Cột 1: 任务类型 (Loại nhiệm vụ) - \u201C主线任务\u201D hoặc \u201C支线任务\u201D.\n- Cột 2: 发布者 (Người giao) - Nhân vật hoặc thế lực giao nhiệm vụ này.\n- Cột 3: 详细描述 (Mô tả chi tiết) - Mục tiêu và yêu cầu của nhiệm vụ.\n- Cột 4: 当前进度 (Tiến độ hiện tại) - Mô tả ngắn gọn mức độ hoàn thành nhiệm vụ.\n- Cột 5: 任务时限 (Thời hạn nhiệm vụ) - Thời gian còn lại để hoàn thành nhiệm vụ.\n- Cột 6: 奖励 (Phần thưởng) - Phần thưởng nhận được khi hoàn thành nhiệm vụ.\n- Cột 7: 惩罚 (Hình phạt) - Hậu quả khi nhiệm vụ thất bại.",
    initNode: "Khi khởi tạo game, dựa theo cốt truyện và thiết lập để thêm một nhiệm vụ cốt truyện chính.",
    deleteNode: "Xóa khi nhiệm vụ hoàn thành, thất bại hoặc hết hạn.\nVí dụ SQL: DELETE FROM quests_events WHERE quest_name = 'Nhiệm vụ đã hoàn thành';",
    updateNode: "Cập nhật khi nhiệm vụ có tiến triển then chốt.\nVí dụ SQL: UPDATE quests_events SET current_progress = 'Đã hoàn thành giai đoạn một', time_limit = 'Còn 3 ngày' WHERE quest_name = 'Giải cứu công chúa';",
    insertNode: "Thêm khi nhân vật chính nhận hoặc kích hoạt nhiệm vụ chính hoặc nhiệm vụ phụ mới.\nVí dụ SQL: INSERT INTO quests_events (quest_name, quest_type, issuer, detail_desc, current_progress, time_limit, reward, penalty) VALUES ('Nhiệm vụ mới', '支线任务', 'Trưởng làng', 'Mô tả nhiệm vụ', 'Vừa nhận', '7 ngày', '100 vàng', 'Giảm danh vọng');",
    ddl: `CREATE TABLE quests_events ( -- 任务与事件表
  row_id INTEGER PRIMARY KEY, -- 行号
  quest_name TEXT NOT NULL UNIQUE, -- 任务名称
  quest_type TEXT NOT NULL CHECK(quest_type IN ('主线任务', '支线任务')), -- 任务类型
  issuer TEXT, -- 发布者
  detail_desc TEXT, -- 详细描述
  current_progress TEXT, -- 当前进度
  time_limit TEXT, -- 任务时限
  reward TEXT, -- 奖励
  penalty TEXT -- 惩罚
);`
  },
  content: [
    [
      "row_id",
      "任务名称",
      "任务类型",
      "发布者",
      "详细描述",
      "当前进度",
      "任务时限",
      "奖励",
      "惩罚"
    ]
  ],
  updateConfig: {
    uiSentinel: -1,
    contextDepth: -1,
    updateFrequency: -1,
    batchSize: -1,
    skipFloors: -1
  },
  exportConfig: {
    enabled: false,
    splitByRow: false,
    entryName: "任务与事件表",
    entryType: "constant",
    keywords: "",
    preventRecursion: true,
    injectionTemplate: "",
    extraIndexEnabled: false,
    extraIndexEntryName: "任务与事件表-索引",
    extraIndexColumns: [],
    extraIndexColumnModes: {},
    extraIndexInjectionTemplate: "",
    entryPlacement: {
      position: "at_depth_as_system",
      depth: 2,
      order: 10000
    },
    extraIndexPlacement: {
      position: "at_depth_as_system",
      depth: 2,
      order: 10010
    },
    fixedEntryPlacement: {
      position: "at_depth_as_system",
      depth: 2,
      order: 99990
    },
    fixedIndexPlacement: {
      position: "at_depth_as_system",
      depth: 2,
      order: 99991
    }
  },
  orderNo: 5
};
