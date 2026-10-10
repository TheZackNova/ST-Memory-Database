/**
 * Bảng nhân vật quan trọng — 默认表定义
 */
export const importantCharsSheet = {
  uid: "sheet_NcBlYRH5",
  name: "Bảng nhân vật quan trọng",
  sourceData: {
    note: "Ghi lại thông tin chi tiết và trạng thái động của tất cả NPC quan trọng. (Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: Tên - Tên của NPC, không được trùng với nhân vật đã có trong bảng.\n- Cột 1: Giới tính/Tuổi - Giới tính sinh lý và tuổi của NPC.\n- Cột 2: Giới thiệu một câu \u2013 Dùng không quá 15 chữ để khái quát thân phận, bối cảnh nhân vật, không kèm đánh giá chủ quan.\n- Cột 3: Đặc điểm ngoại hình - Mô tả chi tiết ngoại hình và trang phục hiện tại của NPC; với nhân vật nữ có thể mô tả vóc dáng; với nhân vật nam không cần mô tả.\n- Cột 4: Vật phẩm quan trọng đang giữ - Danh sách vật phẩm then chốt NPC sở hữu, phân tách bằng dấu chấm phẩy.\n- Cột 5: Đã rời cảnh - Xác định nhân vật này có thể tương tác trực tiếp với nhân vật chính hay không, điền \u201CCó\u201D hoặc \u201CKhông\u201D.\n- Cột 6: Trải nghiệm trước đây - Ghi lại bối cảnh nhân vật và các sự kiện then chốt, cập nhật tăng dần theo cốt truyện, không quá 300 chữ, vượt quá thì phải nén lại.",
    initNode: "Khi khởi tạo game, chèn một mục riêng cho mỗi nhân vật quan trọng đang có mặt.",
    deleteNode: "Cấm xóa.",
    updateNode: "Cập nhật khi trạng thái, quan hệ, suy nghĩ hoặc trải nghiệm của nhân vật đã có thay đổi; nếu nhân vật chết thì phải ghi chú (đã chết) bên cạnh tên.\nVí dụ SQL: UPDATE important_characters SET is_absent = 'Có', past_experience = 'Trải nghiệm mới thêm...' WHERE name = 'Tên nhân vật';",
    insertNode: "Thêm khi có nhân vật quan trọng chưa được ghi lại xuất hiện trong cốt truyện.\nVí dụ SQL: INSERT INTO important_characters (name, gender_age, brief_intro, appearance, key_items, is_absent, past_experience) VALUES ('Tên nhân vật', 'Nữ/20', 'Giới thiệu', 'Mô tả ngoại hình', 'Vật phẩm', 'Không', 'Trải nghiệm');",
    ddl: `CREATE TABLE important_characters ( -- Bảng nhân vật quan trọng
  row_id INTEGER PRIMARY KEY, -- Số hàng
  name TEXT NOT NULL UNIQUE, -- Tên
  gender_age TEXT, -- Giới tính/Tuổi
  brief_intro TEXT, -- Giới thiệu một câu
  appearance TEXT, -- Đặc điểm ngoại hình
  key_items TEXT, -- Vật phẩm quan trọng đang giữ
  is_absent TEXT NOT NULL DEFAULT 'Không' CHECK(is_absent IN ('Có', 'Không')), -- Đã rời cảnh
  past_experience TEXT -- Trải nghiệm trước đây
);`
  },
  content: [
    [
      "row_id",
      "Tên",
      "Giới tính/Tuổi",
      "Giới thiệu một câu",
      "Đặc điểm ngoại hình",
      "Vật phẩm quan trọng đang giữ",
      "Đã rời cảnh",
      "Trải nghiệm trước đây"
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
    entryName: "Bảng nhân vật quan trọng",
    entryType: "keyword",
    keywords: "Tên",
    preventRecursion: true,
    injectionTemplate: "",
    extraIndexEnabled: true,
    extraIndexEntryName: "Bảng nhân vật quan trọng-Chỉ mục",
    extraIndexColumns: [
      "Tên",
      "Giới thiệu một câu"
    ],
    extraIndexColumnModes: {
      "Tên": "both",
      "Giới thiệu một câu": "index_only"
    },
    extraIndexInjectionTemplate: "Dưới đây là các nhân vật đã xuất hiện:\n<Nhân vật đã xuất hiện>\n$1\n</Nhân vật đã xuất hiện>",
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
