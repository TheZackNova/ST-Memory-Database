/**
 * 主角信息 — 默认表定义
 */
export const protagonistInfoSheet = {
  uid: "sheet_DpKcVGqg",
  name: "主角信息表",
  sourceData: {
    note: "Ghi lại thông tin danh tính cốt lõi của nhân vật chính. Bảng này có đúng một hàng. (Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: 人物名称 (Tên nhân vật) - Tên của nhân vật chính.\n- Cột 1: 性别/年龄 (Giới tính/Tuổi) - Giới tính sinh lý và tuổi của nhân vật chính.\n- Cột 2: 外貌特征 (Đặc điểm ngoại hình) - Mô tả khách quan bằng văn bản về ngoại hình nhân vật chính.\n- Cột 3: 职业/身份 (Nghề nghiệp/Thân phận) - Vai trò chính của nhân vật chính trong xã hội.\n- Cột 4: 过往经历 (Trải nghiệm trước đây) - Ghi lại câu chuyện nền và các trải nghiệm then chốt về sau của nhân vật chính, cập nhật tăng dần theo cốt truyện, không quá 300 chữ, vượt quá thì phải nén lại.\n- Cột 5: 性格特点 (Đặc điểm tính cách) - Khái quát tính cách cốt lõi của nhân vật chính.",
    initNode: "Khi khởi tạo game, chèn mục duy nhất của nhân vật chính.",
    deleteNode: "Cấm xóa.",
    updateNode: "Cột '过往经历' được cập nhật tăng dần liên tục theo diễn biến cốt truyện; cập nhật khi các trạng thái của nhân vật chính thay đổi.\nVí dụ SQL: UPDATE protagonist_info SET past_experience = 'Nội dung trải nghiệm sau khi cập nhật', occupation = 'Nghề nghiệp mới' WHERE row_id = 1;",
    insertNode: "Cấm thao tác.",
ddl: `CREATE TABLE protagonist_info ( -- 主角信息表
  row_id INTEGER PRIMARY KEY, -- 行号
  char_name TEXT NOT NULL, -- 人物名称
  gender_age TEXT, -- 性别/年龄
  appearance TEXT, -- 外貌特征
  occupation TEXT, -- 职业/身份
  past_experience TEXT, -- 过往经历
  personality TEXT -- 性格特点
);`
  },
  content: [
    [
      "row_id",
      "人物名称",
      "性别/年龄",
      "外貌特征",
      "职业/身份",
      "过往经历",
      "性格特点"
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
    entryName: "主角信息",
    entryType: "constant",
    keywords: "",
    preventRecursion: true,
    injectionTemplate: "",
    extraIndexEnabled: false,
    extraIndexEntryName: "主角信息-索引",
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
  orderNo: 1
};
