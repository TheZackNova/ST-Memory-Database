/**
 * Bảng kỷ yếu — 默认表定义
 */
export const chronicleSheet = {
  uid: "sheet_3NoMc1wI",
  name: "Bảng kỷ yếu",
  sourceData: {
    note: "Nhật ký theo lượt, sau mỗi lượt tương tác phải chèn ngay một bản ghi mới. (Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: Khoảng thời gian - Khoảng thời gian chính xác diễn ra sự kiện của lượt này.\n- Cột 1: Địa điểm - Địa điểm diễn ra sự kiện của lượt này, mô tả từ lớn đến nhỏ.\n- Cột 2: Kỷ yếu - Ghi lại sự kiện của lượt này một cách khách quan theo góc nhìn bên thứ ba, không thêm suy đoán, ngôn ngữ cảm xúc, diễn giải tiêu cực hay phán đoán chủ quan. Nội dung phải dựa trên các sự việc đã xảy ra rõ ràng trong chính văn, không bổ sung tình tiết chưa xuất hiện, không dưới 300 chữ, phần kết cấm tổng kết hoặc nâng tầm ý nghĩa.\n- Cột 3: Tổng quan - Trong vòng 30 chữ, một câu tóm tắt nội dung kỷ yếu.\n- Cột 4: Mã chỉ mục - Định dạng AMXXXX, XXXX tăng dần từ 0001, không được trùng với mã đã có.\n",
    initNode: "Khi khởi tạo câu chuyện, chèn một bản ghi mới để ghi lại cốt truyện khởi tạo.",
    deleteNode: "Cấm xóa.",
    updateNode: "Cấm thao tác.",
    insertNode: "Sau mỗi lượt tương tác, chèn một bản ghi mới.\nĐịnh dạng khoảng thời gian bắt buộc là YYYY-MM-DD HH:MM ~ YYYY-MM-DD HH:MM.\nVí dụ SQL: INSERT INTO chronicle (time_span, location, chronicle_text, summary, code_index) VALUES ('2024-03-15 14:00 ~ 2024-03-15 15:00', 'Vương thành·Quảng trường trung tâm', 'Nội dung kỷ yếu của lượt này...', 'Tóm tắt trong một câu', 'AM0002');",
    ddl: `CREATE TABLE chronicle ( -- Bảng kỷ yếu
  row_id INTEGER PRIMARY KEY, -- Số hàng
  time_span TEXT NOT NULL CHECK(time_span GLOB '????-??-?? ??:?? ~ ????-??-?? ??:??'), -- Khoảng thời gian
  location TEXT NOT NULL, -- Địa điểm
  chronicle_text TEXT NOT NULL, -- Kỷ yếu
  summary TEXT, -- Tổng quan
  code_index TEXT NOT NULL UNIQUE CHECK(code_index GLOB 'AM[0-9][0-9][0-9][0-9]') -- Mã chỉ mục
);`
  },
  content: [
    [
      "row_id",
      "Khoảng thời gian",
      "Địa điểm",
      "Kỷ yếu",
      "Tổng quan",
      "Mã chỉ mục"
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
    entryName: "Kỷ yếu",
    entryType: "keyword",
    keywords: "Mã chỉ mục",
    preventRecursion: true,
    injectionTemplate: "<Hồi tưởng ký ức>\n$1\n</Hồi tưởng ký ức>",
    extraIndexEnabled: true,
    extraIndexEntryName: "Chỉ mục kỷ yếu",
    extraIndexColumns: [
      "Tổng quan",
      "Mã chỉ mục"
    ],
    extraIndexColumnModes: {
      "Tổng quan": "index_only",
      "Mã chỉ mục": "both"
    },
    extraIndexInjectionTemplate: "<Tổng quan sự kiện đã xảy ra>\n$1\n</Tổng quan sự kiện đã xảy ra>",
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
