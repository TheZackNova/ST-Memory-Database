/**
 * Bảng nhiệm vụ và sự kiện — 默认表定义
 */
export const questsEventsSheet = {
  uid: "sheet_etak47Ve",
  name: "Bảng nhiệm vụ và sự kiện",
  sourceData: {
    note: "Ghi lại tất cả nhiệm vụ đang tiến hành hiện tại. (Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: Tên nhiệm vụ - Tiêu đề nhiệm vụ, không được trùng với nhiệm vụ đã có trong bảng.\n- Cột 1: Loại nhiệm vụ - \u201CNhiệm vụ chính\u201D hoặc \u201CNhiệm vụ phụ\u201D.\n- Cột 2: Người giao - Nhân vật hoặc thế lực giao nhiệm vụ này.\n- Cột 3: Mô tả chi tiết - Mục tiêu và yêu cầu của nhiệm vụ.\n- Cột 4: Tiến độ hiện tại - Mô tả ngắn gọn mức độ hoàn thành nhiệm vụ.\n- Cột 5: Thời hạn nhiệm vụ - Thời gian còn lại để hoàn thành nhiệm vụ.\n- Cột 6: Phần thưởng - Phần thưởng nhận được khi hoàn thành nhiệm vụ.\n- Cột 7: Hình phạt - Hậu quả khi nhiệm vụ thất bại.",
    initNode: "Khi khởi tạo game, dựa theo cốt truyện và thiết lập để thêm một nhiệm vụ cốt truyện chính.",
    deleteNode: "Xóa khi nhiệm vụ hoàn thành, thất bại hoặc hết hạn.\nVí dụ SQL: DELETE FROM quests_events WHERE quest_name = 'Nhiệm vụ đã hoàn thành';",
    updateNode: "Cập nhật khi nhiệm vụ có tiến triển then chốt.\nVí dụ SQL: UPDATE quests_events SET current_progress = 'Đã hoàn thành giai đoạn một', time_limit = 'Còn 3 ngày' WHERE quest_name = 'Giải cứu công chúa';",
    insertNode: "Thêm khi nhân vật chính nhận hoặc kích hoạt nhiệm vụ chính hoặc nhiệm vụ phụ mới.\nVí dụ SQL: INSERT INTO quests_events (quest_name, quest_type, issuer, detail_desc, current_progress, time_limit, reward, penalty) VALUES ('Nhiệm vụ mới', 'Nhiệm vụ phụ', 'Trưởng làng', 'Mô tả nhiệm vụ', 'Vừa nhận', '7 ngày', '100 vàng', 'Giảm danh vọng');",
    ddl: `CREATE TABLE quests_events ( -- Bảng nhiệm vụ và sự kiện
  row_id INTEGER PRIMARY KEY, -- Số hàng
  quest_name TEXT NOT NULL UNIQUE, -- Tên nhiệm vụ
  quest_type TEXT NOT NULL CHECK(quest_type IN ('Nhiệm vụ chính', 'Nhiệm vụ phụ')), -- Loại nhiệm vụ
  issuer TEXT, -- Người giao
  detail_desc TEXT, -- Mô tả chi tiết
  current_progress TEXT, -- Tiến độ hiện tại
  time_limit TEXT, -- Thời hạn nhiệm vụ
  reward TEXT, -- Phần thưởng
  penalty TEXT -- Hình phạt
);`
  },
  content: [
    [
      "row_id",
      "Tên nhiệm vụ",
      "Loại nhiệm vụ",
      "Người giao",
      "Mô tả chi tiết",
      "Tiến độ hiện tại",
      "Thời hạn nhiệm vụ",
      "Phần thưởng",
      "Hình phạt"
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
    entryName: "Bảng nhiệm vụ và sự kiện",
    entryType: "constant",
    keywords: "",
    preventRecursion: true,
    injectionTemplate: "",
    extraIndexEnabled: false,
    extraIndexEntryName: "Bảng nhiệm vụ và sự kiện-Chỉ mục",
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
