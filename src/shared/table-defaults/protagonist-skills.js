/**
 * 主角技能表 — 默认表定义
 */
export const protagonistSkillsSheet = {
  uid: "sheet_lEARaBa8",
  name: "主角技能表",
  sourceData: {
    note: "Ghi lại tất cả kỹ năng mà nhân vật chính có được. (Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: 技能名称 (Tên kỹ năng) - Tên của kỹ năng, không được trùng với kỹ năng đã có trong bảng.\n- Cột 1: 技能类型 (Loại kỹ năng) - Loại của kỹ năng (ví dụ: \u201C被动\u201D, \u201C主动\u201D).\n- Cột 2: 等级/阶段 (Cấp độ/Giai đoạn) - Cấp độ hoặc giai đoạn hiện tại của kỹ năng.\n- Cột 3: 效果描述 (Mô tả hiệu quả) - Hiệu quả cụ thể của kỹ năng ở cấp độ hiện tại.",
    initNode: "Khi khởi tạo game, dựa theo thiết lập để thêm kỹ năng ban đầu cho nhân vật chính.",
    deleteNode: "Xóa khi kỹ năng bị tước đoạt hoặc thay thế vì cốt truyện.\nVí dụ SQL: DELETE FROM protagonist_skills WHERE skill_name = 'Kỹ năng bị tước đoạt';",
    updateNode: "Cập nhật cấp độ/giai đoạn và mô tả hiệu quả khi kỹ năng đã có được nâng cấp.\nVí dụ SQL: UPDATE protagonist_skills SET skill_level = 'Lv.3', effect_desc = 'Mô tả hiệu quả mới' WHERE skill_name = 'Hỏa cầu thuật';",
    insertNode: "Thêm khi nhân vật chính có được kỹ năng mới.\nVí dụ SQL: INSERT INTO protagonist_skills (skill_name, skill_type, skill_level, effect_desc) VALUES ('Kỹ năng mới', '主动', 'Lv.1', 'Mô tả hiệu quả');",
    ddl: `CREATE TABLE protagonist_skills ( -- 主角技能表
  row_id INTEGER PRIMARY KEY, -- 行号
  skill_name TEXT NOT NULL UNIQUE, -- 技能名称
  skill_type TEXT NOT NULL CHECK(skill_type IN ('被动', '主动')), -- 技能类型
  skill_level TEXT, -- 等级/阶段
  effect_desc TEXT -- 效果描述
);`
  },
  content: [
    [
      "row_id",
      "技能名称",
      "技能类型",
      "等级/阶段",
      "效果描述"
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
    entryName: "主角技能表",
    entryType: "constant",
    keywords: "",
    preventRecursion: true,
    injectionTemplate: "",
    extraIndexEnabled: false,
    extraIndexEntryName: "主角技能表-索引",
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
