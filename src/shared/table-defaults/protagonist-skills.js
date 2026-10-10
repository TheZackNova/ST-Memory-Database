/**
 * Bảng kỹ năng nhân vật chính — 默认表定义
 */
export const protagonistSkillsSheet = {
  uid: "sheet_lEARaBa8",
  name: "Bảng kỹ năng nhân vật chính",
  sourceData: {
    note: "Ghi lại tất cả kỹ năng mà nhân vật chính có được. (Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: Tên kỹ năng - Tên của kỹ năng, không được trùng với kỹ năng đã có trong bảng.\n- Cột 1: Loại kỹ năng - Loại của kỹ năng (ví dụ: \u201CBị động\u201D, \u201CChủ động\u201D).\n- Cột 2: Cấp độ/Giai đoạn - Cấp độ hoặc giai đoạn hiện tại của kỹ năng.\n- Cột 3: Mô tả hiệu quả - Hiệu quả cụ thể của kỹ năng ở cấp độ hiện tại.",
    initNode: "Khi khởi tạo game, dựa theo thiết lập để thêm kỹ năng ban đầu cho nhân vật chính.",
    deleteNode: "Xóa khi kỹ năng bị tước đoạt hoặc thay thế vì cốt truyện.\nVí dụ SQL: DELETE FROM protagonist_skills WHERE skill_name = 'Kỹ năng bị tước đoạt';",
    updateNode: "Cập nhật cấp độ/giai đoạn và mô tả hiệu quả khi kỹ năng đã có được nâng cấp.\nVí dụ SQL: UPDATE protagonist_skills SET skill_level = 'Lv.3', effect_desc = 'Mô tả hiệu quả mới' WHERE skill_name = 'Hỏa cầu thuật';",
    insertNode: "Thêm khi nhân vật chính có được kỹ năng mới.\nVí dụ SQL: INSERT INTO protagonist_skills (skill_name, skill_type, skill_level, effect_desc) VALUES ('Kỹ năng mới', 'Chủ động', 'Lv.1', 'Mô tả hiệu quả');",
    ddl: `CREATE TABLE protagonist_skills ( -- Bảng kỹ năng nhân vật chính
  row_id INTEGER PRIMARY KEY, -- Số hàng
  skill_name TEXT NOT NULL UNIQUE, -- Tên kỹ năng
  skill_type TEXT NOT NULL CHECK(skill_type IN ('Bị động', 'Chủ động')), -- Loại kỹ năng
  skill_level TEXT, -- Cấp độ/Giai đoạn
  effect_desc TEXT -- Mô tả hiệu quả
);`
  },
  content: [
    [
      "row_id",
      "Tên kỹ năng",
      "Loại kỹ năng",
      "Cấp độ/Giai đoạn",
      "Mô tả hiệu quả"
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
    entryName: "Bảng kỹ năng nhân vật chính",
    entryType: "constant",
    keywords: "",
    preventRecursion: true,
    injectionTemplate: "",
    extraIndexEnabled: false,
    extraIndexEntryName: "Bảng kỹ năng nhân vật chính-Chỉ mục",
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
  orderNo: 3
};
