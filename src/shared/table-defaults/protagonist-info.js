/**
 * Thông tin nhân vật chính — 默认表定义
 */
export const protagonistInfoSheet = {
  uid: "sheet_DpKcVGqg",
  name: "Bảng thông tin nhân vật chính",
  sourceData: {
    note: "Ghi lại thông tin danh tính cốt lõi của nhân vật chính. Bảng này có đúng một hàng. (Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: Tên nhân vật - Tên của nhân vật chính.\n- Cột 1: Giới tính/Tuổi - Giới tính sinh lý và tuổi của nhân vật chính.\n- Cột 2: Đặc điểm ngoại hình - Mô tả khách quan bằng văn bản về ngoại hình nhân vật chính.\n- Cột 3: Nghề nghiệp/Thân phận - Vai trò chính của nhân vật chính trong xã hội.\n- Cột 4: Trải nghiệm trước đây - Ghi lại câu chuyện nền và các trải nghiệm then chốt về sau của nhân vật chính, cập nhật tăng dần theo cốt truyện, không quá 300 chữ, vượt quá thì phải nén lại.\n- Cột 5: Đặc điểm tính cách - Khái quát tính cách cốt lõi của nhân vật chính.",
    initNode: "Khi khởi tạo game, chèn mục duy nhất của nhân vật chính.",
    deleteNode: "Cấm xóa.",
    updateNode: "Cột 'Trải nghiệm trước đây' được cập nhật tăng dần liên tục theo diễn biến cốt truyện; cập nhật khi các trạng thái của nhân vật chính thay đổi.\nVí dụ SQL: UPDATE protagonist_info SET past_experience = 'Nội dung trải nghiệm sau khi cập nhật', occupation = 'Nghề nghiệp mới' WHERE row_id = 1;",
    insertNode: "Cấm thao tác.",
ddl: `CREATE TABLE protagonist_info ( -- Bảng thông tin nhân vật chính
  row_id INTEGER PRIMARY KEY, -- Số hàng
  char_name TEXT NOT NULL, -- Tên nhân vật
  gender_age TEXT, -- Giới tính/Tuổi
  appearance TEXT, -- Đặc điểm ngoại hình
  occupation TEXT, -- Nghề nghiệp/Thân phận
  past_experience TEXT, -- Trải nghiệm trước đây
  personality TEXT -- Đặc điểm tính cách
);`
  },
  content: [
    [
      "row_id",
      "Tên nhân vật",
      "Giới tính/Tuổi",
      "Đặc điểm ngoại hình",
      "Nghề nghiệp/Thân phận",
      "Trải nghiệm trước đây",
      "Đặc điểm tính cách"
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
    entryName: "Thông tin nhân vật chính",
    entryType: "constant",
    keywords: "",
    preventRecursion: true,
    injectionTemplate: "",
    extraIndexEnabled: false,
    extraIndexEntryName: "Thông tin nhân vật chính-Chỉ mục",
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
