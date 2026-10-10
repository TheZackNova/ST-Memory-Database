/**
 * 纪要表 — 默认表定义
 */
export const chronicleSheet = {
  uid: "sheet_3NoMc1wI",
  name: "纪要表",
  sourceData: {
    note: "Nhật ký theo lượt, sau mỗi lượt tương tác phải chèn ngay một bản ghi mới. (Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: 时间跨度 (Khoảng thời gian) - Khoảng thời gian chính xác diễn ra sự kiện của lượt này.\n- Cột 1: 地点 (Địa điểm) - Địa điểm diễn ra sự kiện của lượt này, mô tả từ lớn đến nhỏ.\n- Cột 2: 纪要 (Kỷ yếu) - Ghi lại sự kiện của lượt này một cách khách quan theo góc nhìn bên thứ ba, không thêm suy đoán, ngôn ngữ cảm xúc, diễn giải tiêu cực hay phán đoán chủ quan. Nội dung phải dựa trên các sự việc đã xảy ra rõ ràng trong chính văn, không bổ sung tình tiết chưa xuất hiện, không dưới 300 chữ, phần kết cấm tổng kết hoặc nâng tầm ý nghĩa.\n- Cột 3: 概要 (Tóm lược) - Trong vòng 30 chữ, một câu tóm tắt nội dung kỷ yếu.\n- Cột 4: 编码索引 (Mã chỉ mục) - Định dạng AMXXXX, XXXX tăng dần từ 0001, không được trùng với mã đã có.\n",
    initNode: "Khi khởi tạo câu chuyện, chèn một bản ghi mới để ghi lại cốt truyện khởi tạo.",
    deleteNode: "Cấm xóa.",
    updateNode: "Cấm thao tác.",
    insertNode: "Sau mỗi lượt tương tác, chèn một bản ghi mới.\nĐịnh dạng khoảng thời gian bắt buộc là YYYY-MM-DD HH:MM ~ YYYY-MM-DD HH:MM.\nVí dụ SQL: INSERT INTO chronicle (time_span, location, chronicle_text, summary, code_index) VALUES ('2024-03-15 14:00 ~ 2024-03-15 15:00', 'Vương thành·Quảng trường trung tâm', 'Nội dung kỷ yếu của lượt này...', 'Tóm tắt trong một câu', 'AM0002');",
    ddl: `CREATE TABLE chronicle ( -- 纪要表
  row_id INTEGER PRIMARY KEY, -- 行号
  time_span TEXT NOT NULL CHECK(time_span GLOB '????-??-?? ??:?? ~ ????-??-?? ??:??'), -- 时间跨度
  location TEXT NOT NULL, -- 地点
  chronicle_text TEXT NOT NULL, -- 纪要
  summary TEXT, -- 概览
  code_index TEXT NOT NULL UNIQUE CHECK(code_index GLOB 'AM[0-9][0-9][0-9][0-9]') -- 编码索引
);`
  },
  content: [
    [
      "row_id",
      "时间跨度",
      "地点",
      "纪要",
      "概览",
      "编码索引"
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
    enabled: true,
    splitByRow: true,
    entryName: "纪要",
    entryType: "keyword",
    keywords: "编码索引",
    preventRecursion: true,
    injectionTemplate: "<记忆回溯>\n$1\n</记忆回溯>",
    extraIndexEnabled: true,
    extraIndexEntryName: "纪要索引",
    extraIndexColumns: [
      "概览",
      "编码索引"
    ],
    extraIndexColumnModes: {
      "概览": "index_only",
      "编码索引": "both"
    },
    extraIndexInjectionTemplate: "<已发生的事件概览>\n$1\n</已发生的事件概览>",
    entryPlacement: {
      position: "at_depth_as_system",
      depth: 999,
      order: 10000
    },
    extraIndexPlacement: {
      position: "at_depth_as_system",
      depth: 1000,
      order: 10010
    },
    fixedEntryPlacement: {
      position: "at_depth_as_system",
      depth: 9999,
      order: 99987
    },
    fixedIndexPlacement: {
      position: "at_depth_as_system",
      depth: 9999,
      order: 99988
    }
  },
  orderNo: 6
};
