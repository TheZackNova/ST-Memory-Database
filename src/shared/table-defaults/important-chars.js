/**
 * 重要角色表 — 默认表定义
 */
export const importantCharsSheet = {
  uid: "sheet_NcBlYRH5",
  name: "重要角色表",
  sourceData: {
    note: "Ghi lại thông tin chi tiết và trạng thái động của tất cả NPC quan trọng. (Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: 姓名 (Tên) - Tên của NPC, không được trùng với nhân vật đã có trong bảng.\n- Cột 1: 性别/年龄 (Giới tính/Tuổi) - Giới tính sinh lý và tuổi của NPC.\n- Cột 2: 一句话介绍 (Giới thiệu một câu) \u2013 Dùng không quá 15 chữ để khái quát thân phận, bối cảnh nhân vật, không kèm đánh giá chủ quan.\n- Cột 3: 外貌特征 (Đặc điểm ngoại hình) - Mô tả chi tiết ngoại hình và trang phục hiện tại của NPC; với nhân vật nữ có thể mô tả vóc dáng; với nhân vật nam không cần mô tả.\n- Cột 4: 持有的重要物品 (Vật phẩm quan trọng đang giữ) - Danh sách vật phẩm then chốt NPC sở hữu, phân tách bằng dấu chấm phẩy.\n- Cột 5: 是否离场 (Có rời cảnh không) - Xác định nhân vật này có thể tương tác trực tiếp với nhân vật chính hay không, điền \u201C是\u201D hoặc \u201C否\u201D.\n- Cột 6: 过往经历 (Trải nghiệm trước đây) - Ghi lại bối cảnh nhân vật và các sự kiện then chốt, cập nhật tăng dần theo cốt truyện, không quá 300 chữ, vượt quá thì phải nén lại.",
    initNode: "Khi khởi tạo game, chèn một mục riêng cho mỗi nhân vật quan trọng đang có mặt.",
    deleteNode: "Cấm xóa.",
    updateNode: "Cập nhật khi trạng thái, quan hệ, suy nghĩ hoặc trải nghiệm của nhân vật đã có thay đổi; nếu nhân vật chết thì phải ghi chú (đã chết) bên cạnh tên.\nVí dụ SQL: UPDATE important_characters SET is_absent = '是', past_experience = 'Trải nghiệm mới thêm...' WHERE name = 'Tên nhân vật';",
    insertNode: "Thêm khi có nhân vật quan trọng chưa được ghi lại xuất hiện trong cốt truyện.\nVí dụ SQL: INSERT INTO important_characters (name, gender_age, brief_intro, appearance, key_items, is_absent, past_experience) VALUES ('Tên nhân vật', 'Nữ/20', 'Giới thiệu', 'Mô tả ngoại hình', 'Vật phẩm', '否', 'Trải nghiệm');",
    ddl: `CREATE TABLE important_characters ( -- 重要角色表
  row_id INTEGER PRIMARY KEY, -- 行号
  name TEXT NOT NULL UNIQUE, -- 姓名
  gender_age TEXT, -- 性别/年龄
  brief_intro TEXT, -- 一句话介绍
  appearance TEXT, -- 外貌特征
  key_items TEXT, -- 持有的重要物品
  is_absent TEXT NOT NULL DEFAULT '否' CHECK(is_absent IN ('是', '否')), -- 是否离场
  past_experience TEXT -- 过往经历
);`
  },
  content: [
    [
      "row_id",
      "姓名",
      "性别/年龄",
      "一句话介绍",
      "外貌特征",
      "持有的重要物品",
      "是否离场",
      "过往经历"
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
    entryName: "重要人物表",
    entryType: "keyword",
    keywords: "姓名",
    preventRecursion: true,
    injectionTemplate: "",
    extraIndexEnabled: true,
    extraIndexEntryName: "重要人物表-索引",
    extraIndexColumns: [
      "姓名",
      "一句话介绍"
    ],
    extraIndexColumnModes: {
      "姓名": "both",
      "一句话介绍": "index_only"
    },
    extraIndexInjectionTemplate: "Dưới đây là các nhân vật đã xuất hiện:\n<已登场角色>\n$1\n</已登场角色>",
    entryPlacement: {
      position: "at_depth_as_system",
      depth: 10000,
      order: 10000
    },
    extraIndexPlacement: {
      position: "at_depth_as_system",
      depth: 10000,
      order: 8000
    },
    fixedEntryPlacement: {
      position: "at_depth_as_system",
      depth: 10000,
      order: 99983
    },
    fixedIndexPlacement: {
      position: "at_depth_as_system",
      depth: 10000,
      order: 99984
    }
  },
  orderNo: 2
};
