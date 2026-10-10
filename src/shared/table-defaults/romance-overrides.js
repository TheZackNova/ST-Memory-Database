/**
 * romance-overrides.js — 恋爱特化默认表覆盖片段
 *
 * 只包含与原默认模板同名的表。
 * 组装新默认模板时会保留原默认表的 key/uid/orderNo，
 * 仅用这里的表结构、提示词、导出配置等内容覆盖。
 */
export const romanceDefaultSheetOverrides = {
  "sheet_global_data": {
    "uid": "sheet_global_data",
    "name": "Bảng dữ liệu toàn cục",
    "sourceData": {
      "note": "Ghi lại địa điểm hiện tại của nhân vật chính và các tham số liên quan đến thời gian. Bảng này có đúng một hàng.\n\n【Định nghĩa cột】(Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: Trạng thái toàn cục (story_state)\n- Cột 1: Địa điểm chi tiết hiện tại (current_location)\n- Cột 2: Khu vực phụ hiện tại (current_minor_region)\n- Cột 3: Khu vực chính hiện tại (current_major_region)\n- Cột 4: Thời gian cảnh lượt trước (prev_scene_time; NULL khi khởi tạo)\n- Cột 5: Thời gian đã trôi qua (elapsed_time)\n- Cột 6: Thời gian hiện tại (cur_time)\n\n【Ràng buộc bắt buộc】\nGiá trị của Trạng thái toàn cục là chuỗi cố định `Trạng thái toàn cục`, mang tính tiêu đề.\n\nCấp bậc địa điểm từ nhỏ đến lớn: địa điểm chi tiết < khu vực phụ < khu vực chính.\nMỗi trường chỉ ghi tên của cấp đó, không ghép tiền tố của cấp trên.\n√ Địa điểm chi tiết hiện tại điền “Ngự Uyển”\n× Địa điểm chi tiết hiện tại điền “Tokyo-Shinjuku-Ngự Uyển”\n\nĐịnh dạng thời gian:\nprev_scene_time / cur_time: YYYY-MM-DD HH:MM\nelapsed_time: {giá trị} {đơn vị}, nhiều đơn vị nối bằng dấu cách.\nTập đơn vị: [kỷ nguyên, thiên niên kỷ, thế kỷ, năm, tháng, tuần, ngày, giờ, phút]\nVí dụ: \"3 giờ 20 phút\" | \"2 ngày\" | \"3 năm 6 tháng\"\n\nCông thức tính thời gian: cur_time = prev_scene_time + elapsed_time\n- Khi khởi tạo prev_scene_time là NULL, cur_time điền trực tiếp thời gian ban đầu, không cần tính\n- Mỗi lượt tiến triển, gán cur_time của lượt trước cho prev_scene_time, sau đó điền elapsed_time lần này, cuối cùng tính ra cur_time mới",
      "initNode": "Khi khởi tạo câu chuyện, chèn mục duy nhất, ghi lại thời gian và địa điểm mở đầu của người dùng. Cấm sao chép nguyên địa điểm và ngày tháng trong ví dụ.\n\nVí dụ SQL: INSERT INTO global_state (story_state, current_location, current_minor_region, current_major_region, prev_scene_time, elapsed_time, cur_time)\nVALUES ('Trạng thái toàn cục', 'Ngự Uyển', 'Shinjuku', 'Tokyo', NULL, '0 phút', '2026-02-03 09:00');",
      "deleteNode": "Cấm.",
      "updateNode": "Mỗi lượt tiến triển cập nhật prev_scene_time, elapsed_time và cur_time; nếu địa điểm thay đổi thì cập nhật đồng bộ ba trường địa điểm.\n\n【Ràng buộc cập nhật】\nNgoại trừ prev_scene_time có thể là NULL khi khởi tạo, các trường còn lại không được ghi NULL hay chuỗi rỗng.\n\n【Ví dụ SQL cập nhật (bao quát cùng ngày + qua ngày + đổi vị trí)】\nVí dụ SQL (tiến triển trong ngày): UPDATE global_state SET prev_scene_time = '2026-02-03 09:00', elapsed_time = '3 giờ', cur_time = '2026-02-03 12:00' WHERE row_id = 1;\n\nVí dụ SQL (qua ngày): UPDATE global_state SET prev_scene_time = '2026-02-03 23:55', elapsed_time = '20 phút', cur_time = '2026-02-04 00:15' WHERE row_id = 1;\n\nVí dụ SQL (kèm đổi vị trí): UPDATE global_state SET current_location = 'Ga Shinjuku', current_minor_region = 'Shinjuku', current_major_region = 'Tokyo', prev_scene_time = '2026-02-03 12:00', elapsed_time = '30 phút', cur_time = '2026-02-03 12:30' WHERE row_id = 1;",
      "insertNode": "Cấm.",
      "ddl": "CREATE TABLE global_state ( -- Bảng dữ liệu toàn cục\n  row_id INTEGER PRIMARY KEY, -- Số hàng\n  story_state TEXT NOT NULL CHECK(story_state = 'Trạng thái toàn cục'), -- Trạng thái toàn cục\n  current_location TEXT NOT NULL, -- Địa điểm chi tiết hiện tại\n  current_minor_region TEXT NOT NULL, -- Khu vực phụ hiện tại\n  current_major_region TEXT NOT NULL, -- Khu vực chính hiện tại\n  prev_scene_time TEXT CHECK(prev_scene_time IS NULL OR prev_scene_time GLOB '????-??-?? ??:??'), -- Thời gian cảnh lượt trước\n  elapsed_time TEXT NOT NULL, -- Thời gian đã trôi qua\n  cur_time TEXT NOT NULL CHECK(cur_time GLOB '????-??-?? ??:??') -- Thời gian hiện tại\n);"
    },
    "content": [
      [
        "row_id",
        "Trạng thái toàn cục",
        "Địa điểm chi tiết hiện tại",
        "Khu vực phụ hiện tại",
        "Khu vực chính hiện tại",
        "Thời gian cảnh lượt trước",
        "Thời gian đã trôi qua",
        "Thời gian hiện tại"
      ]
    ],
    "updateConfig": {
      "uiSentinel": -1,
      "contextDepth": -1,
      "updateFrequency": -1,
      "batchSize": -1,
      "skipFloors": -1,
      "groupId": -1
    },
    "exportConfig": {
      "enabled": false,
      "splitByRow": false,
      "entryName": "Bảng dữ liệu toàn cục",
      "entryType": "constant",
      "keywords": "",
      "preventRecursion": true,
      "injectionTemplate": "",
      "extraIndexEnabled": false,
      "extraIndexEntryName": "Bảng dữ liệu toàn cục-Chỉ mục",
      "extraIndexColumns": [],
      "extraIndexColumnModes": {},
      "extraIndexInjectionTemplate": "",
      "entryPlacement": {
        "position": "at_depth_as_system",
        "depth": 2,
        "order": 10000
      },
      "extraIndexPlacement": {
        "position": "at_depth_as_system",
        "depth": 2,
        "order": 10010
      },
      "fixedEntryPlacement": {
        "position": "before_character_definition",
        "depth": 2,
        "order": 99981
      },
      "fixedIndexPlacement": {
        "position": "before_character_definition",
        "depth": 2,
        "order": 99982
      }
    },
    "orderNo": 0
  },
  "sheet_protagonist": {
    "uid": "sheet_protagonist",
    "name": "Bảng thông tin nhân vật chính",
    "sourceData": {
      "note": "Ghi lại thông tin danh tính cốt lõi của nhân vật chính. Bảng này có đúng một hàng.\n\n【Định nghĩa cột】(Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: Tên (name)\n- Cột 1: Giới tính (gender)\n- Cột 2: Tuổi (age)\n- Cột 3: Đặc điểm ngoại hình (appearance; gồm phong cách ăn mặc thường ngày, viết ấn tượng tổng thể, tránh liệt kê số liệu)\n- Cột 4: Thân phận (identity_text; phân tách bằng dấu phẩy)\n- Cột 5: Tình trạng gần đây (current_condition)\n- Cột 6: Địa điểm hiện tại (location_name)\n- Cột 7: Tài sản mang theo (belongings; có thể để trống)\n\n【Ràng buộc bắt buộc】\n1. Địa điểm hiện tại chỉ ghi tên địa điểm, không kèm tiền tố cấp bậc. Cập nhật đồng bộ khi vị trí thay đổi.\n\n2. Tình trạng gần đây dùng một câu mô tả cảm giác cơ thể, trạng thái cảm xúc hoặc điều đang canh cánh trong lòng của nhân vật chính.\nThời kỳ bình thường điền \"Mọi thứ như thường\", khi có bất thường thì viết thẳng cảm nhận cụ thể, không chồng chất nhãn mác.\n√ Tối qua ngủ không ngon, đầu hơi nặng\n√ Vừa chạy về từ trong mưa, quần áo vẫn còn ướt\n\n3. Tài sản mang theo chỉ ghi những vật có ý nghĩa đang mang trên người, không ghi tài nguyên kiểu game.\n√ Trong ví kẹp vé xem phim lần đầu tiên\n√ Trong túi còn hai viên kẹo vị quýt",
      "initNode": "Khi khởi tạo câu chuyện, chèn mục duy nhất của nhân vật chính.",
      "deleteNode": "Cấm.",
      "updateNode": "Với hàng đã tồn tại, cập nhật khi giá trị trường thay đổi: tuổi, ngoại hình, thân phận, tình trạng gần đây, địa điểm hiện tại, tài sản mang theo.\n\n【Ví dụ SQL cập nhật (tình trạng + đổi vị trí)】\nVí dụ SQL cập nhật (tình trạng thay đổi): UPDATE protagonist_info SET current_condition = 'Mệt mỏi, trầy đầu gối trái', location_name = 'Ngự Uyển' WHERE row_id = 1;\n\nVí dụ SQL cập nhật (tài sản mang theo thay đổi): UPDATE protagonist_info SET belongings = 'Trong ví kẹp vé xem phim lần đầu tiên, trong túi còn hai viên kẹo vị quýt' WHERE row_id = 1;",
      "insertNode": "Cấm.",
      "ddl": "CREATE TABLE protagonist_info ( -- Thông tin nhân vật chính\n  row_id INTEGER PRIMARY KEY CHECK(row_id = 1), -- Số hàng, chỉ được là 1\n  name TEXT NOT NULL, -- Tên\n  gender TEXT NOT NULL, -- Giới tính\n  age INTEGER CHECK(age IS NULL OR age >= 0), -- Tuổi\n  appearance TEXT NOT NULL, -- Đặc điểm ngoại hình\n  identity_text TEXT NOT NULL, -- Thân phận\n  current_condition TEXT NOT NULL DEFAULT 'Mọi thứ như thường', -- Tình trạng gần đây\n  location_name TEXT NOT NULL, -- Địa điểm hiện tại\n  belongings TEXT -- Tài sản mang theo\n);"
    },
    "content": [
      [
        "row_id",
        "Tên",
        "Giới tính",
        "Tuổi",
        "Đặc điểm ngoại hình",
        "Thân phận",
        "Tình trạng gần đây",
        "Địa điểm hiện tại",
        "Tài sản mang theo"
      ]
    ],
    "updateConfig": {
      "uiSentinel": -1,
      "contextDepth": -1,
      "updateFrequency": -1,
      "batchSize": -1,
      "skipFloors": -1,
      "groupId": -1
    },
    "exportConfig": {
      "enabled": false,
      "splitByRow": false,
      "entryName": "Thông tin nhân vật chính",
      "entryType": "constant",
      "keywords": "",
      "preventRecursion": true,
      "injectionTemplate": "",
      "extraIndexEnabled": false,
      "extraIndexEntryName": "Thông tin nhân vật chính-Chỉ mục",
      "extraIndexColumns": [],
      "extraIndexColumnModes": {},
      "extraIndexInjectionTemplate": "",
      "entryPlacement": {
        "position": "at_depth_as_system",
        "depth": 2,
        "order": 10000
      },
      "extraIndexPlacement": {
        "position": "at_depth_as_system",
        "depth": 2,
        "order": 10010
      },
      "fixedEntryPlacement": {
        "position": "at_depth_as_system",
        "depth": 2,
        "order": 99990
      },
      "fixedIndexPlacement": {
        "position": "at_depth_as_system",
        "depth": 2,
        "order": 99991
      }
    },
    "orderNo": 2
  },
  "sheet_important_non_romance": {
    "uid": "sheet_important_non_romance",
    "name": "Bảng nhân vật quan trọng",
    "sourceData": {
      "note": "Ghi lại tất cả nhân vật quan trọng có tác động đến cốt truyện hiện tại.\n\n【Định nghĩa cột】(Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: Tên (name; không được trùng với nhân vật đã có trong bảng)\n- Cột 1: Giới tính (gender)\n- Cột 2: Tuổi (age)\n- Cột 3: Giới thiệu một câu (brief_intro)\n- Cột 4: Đặc điểm ngoại hình (appearance)\n- Cột 5: Trang phục (outfit_text)\n- Cột 6: Địa điểm hiện tại (location_name)\n- Cột 7: Trạng thái có mặt (presence_status; Có mặt/Rời cảnh)\n- Cột 8: Quan hệ (relation_text)\n- Cột 9: Trải nghiệm trước đây (past_experience)\n- Cột 10: Lựa chọn tương tác (interaction_options)\n\n【Ràng buộc bắt buộc】\nbrief_intro chỉ cho phép nội dung thuộc sự thật khách quan, nghiêm cấm xuất hiện bất kỳ nhãn tính cách nào, như \"cởi mở\", \"lạnh lùng\", \"dịu dàng\"...; phạm vi nội dung khách quan bao gồm nhưng không giới hạn: thân phận cốt lõi của nhân vật, hành vi khách quan liên quan chặt chẽ đến cốt truyện, liên hệ khách quan với nhân vật then chốt, đặc điểm cốt lõi không thuộc tính cách.\n√ Điều hành tiệm tạp hóa phía nam thành / từng cứu mạng nhân vật chính / anh ruột của Alice\n× Ông chủ tiệm tạp hóa tính cách cô độc / dịu dàng và từng cứu nhân vật chính / anh trai cố chấp của Alice\n\noutfit_text chỉ ghi các yếu tố nhìn thấy được bên ngoài như quần áo, phụ kiện, trang điểm, vật đang cầm, cấm ghi đặc điểm dung mạo vốn có, khí chất, khí thế và các nội dung phi thị giác khác.\n√ Áo khoác cổ đứng xám đậm phối găng tay da đen / ngón áp út tay trái đeo một chiếc nhẫn bạc hình rắn\n× Toát ra khí thế cao quý, trông giống quân nhân\n\ninteraction_options phải đồng thời tuân theo các yêu cầu sau\n1. Không dùng ngôi thứ nhất \"tôi\"\n2. Bên khởi xướng hành động là nhân vật chính, bên tiếp nhận là nhân vật\n3. Phải là hành động cụ thể, có tính nhập vai, tránh từ đơn khô khan\n√ Hỏi anh ta manh mối vụ mất tích / Giả vờ tình cờ gặp rồi bắt chuyện để moi thông tin / Cố ý làm đổ ly nước để tạo xung đột\n× Trò chuyện / Hỏi thăm\n\n【Quy tắc định dạng relation_text】(bắt buộc)\n1. Định dạng phải là: tên nhân vật:mô tả quan hệ\n   - Phải ghi rõ tiền tố \"tên nhân vật:\", cấm bỏ tên nhân vật mà viết thẳng nội dung quan hệ.\n   - Cùng một nhân vật có nhiều nhãn/mô tả quan hệ thì phân tách các nhãn bằng dấu phẩy tiếng Anh ,\n   - Các nhân vật khác nhau phân tách bằng dấu chấm phẩy tiếng Anh ;\n   - Mô tả quan hệ bỏ đại từ nhân xưng, dùng câu trần thuật ngắn gọn.\n2. Chủ yếu ghi liên hệ khách quan giữa nhân vật này với nhân vật chính và các nhân vật quan trọng khác, ít nhất phải có quan hệ với nhân vật chính.\n   √ Nhân vật chính:từng sửa xe đạp giúp họ,người quen cũ\n   √ Nhân vật chính:quen biết;Alice:bạn cùng phòng kiêm bạn thân\n   √ Nhân vật chính:thân phận hiệu trưởng,chưa từng trực tiếp nói chuyện;Alice:người giám hộ\n   × Từng sửa xe đạp giúp nhân vật chính                    ← thiếu tiền tố tên nhân vật\n   × Nhân vật chính:quen biết;bạn cùng phòng kiêm bạn thân                  ← đoạn thứ hai thiếu tên nhân vật\n   × Nhân vật chính:người quen cũ,Alice:bạn cùng phòng                 ← dùng nhầm dấu phẩy giữa các nhân vật khác nhau\n   × Nhân vật chính:từng sửa xe đạp giúp họ;người quen cũ            ← dùng nhầm dấu chấm phẩy giữa các nhãn của cùng một nhân vật",
      "initNode": "Khi câu chuyện bắt đầu, chèn mục riêng cho mỗi nhân vật quan trọng đã biết hiện tại.\n\n【Ràng buộc định dạng】\nrelation_text phải ghi theo dạng \"tên nhân vật:mô tả quan hệ\"; nhiều mô tả của cùng một nhân vật phân tách bằng dấu phẩy tiếng Anh ,; các nhân vật khác nhau phân tách bằng dấu chấm phẩy tiếng Anh ;.\n\nVí dụ SQL: INSERT INTO important_non_romance (name, gender, age, brief_intro, appearance, outfit_text, location_name, presence_status, relation_text, past_experience, interaction_options) VALUES ('Hiệu trưởng', 'Nam', 60, 'Hiệu trưởng học viện', 'Tóc bạc, cầm gậy, ánh mắt sâu thẳm', 'Áo khoác cổ đứng xám đậm phối găng tay da đen', 'Phòng hiệu trưởng', 'Rời cảnh', 'Nhân vật chính:từng sửa xe đạp giúp họ,người quen cũ;Alice:người giám hộ', 'Nghe nói biết nhiều bí mật của học viện, rất ít khi lộ diện.', 'Hỏi ông manh mối vụ mất tích');",
      "deleteNode": "Mặc định cấm xóa. Nhân vật đã xuất hiện nhưng tạm thời không có cốt truyện, tạm thời rời cảnh, quan hệ thay đổi, thân phận thay đổi đều phải giữ lại trong bảng này, chỉ cập nhật các trường như presence_status, relation_text, past_experience, interaction_options. Chỉ khi nhân vật rõ ràng rời hẳn cốt truyện hiện tại và về sau không cần theo dõi nữa mới được phép xóa.\nVí dụ SQL (rời hẳn và không theo dõi nữa):DELETE FROM important_non_romance WHERE name = 'Alice';",
      "updateNode": "Với nhân vật quan trọng đã tồn tại, cập nhật khi trường thay đổi.\n\n【Ràng buộc định dạng】\nrelation_text phải ghi theo dạng \"tên nhân vật:mô tả quan hệ\"; nhiều mô tả của cùng một nhân vật phân tách bằng dấu phẩy tiếng Anh ,; các nhân vật khác nhau phân tách bằng dấu chấm phẩy tiếng Anh ;.\n\nVí dụ SQL (cập nhật trường thường): UPDATE important_non_romance SET presence_status = 'Rời cảnh', interaction_options = 'Hỏi ông manh mối vụ mất tích' WHERE name = 'Hiệu trưởng';\nVí dụ SQL (một nhân vật nhiều mô tả): UPDATE important_non_romance SET relation_text = 'Nhân vật chính:từng sửa xe đạp giúp họ,gần đây bắt đầu để ý động thái của nhân vật chính' WHERE name = 'Hiệu trưởng';\nVí dụ SQL (quan hệ nhiều nhân vật): UPDATE important_non_romance SET relation_text = 'Nhân vật chính:người quen cũ,tình cũ;Alice:người giám hộ;Kanda:cấp dưới cũ' WHERE name = 'Hiệu trưởng';",
      "insertNode": "Thêm mới khi nhân vật quan trọng mới xuất hiện.\n\n【Ràng buộc định dạng】\nrelation_text phải ghi theo dạng \"tên nhân vật:mô tả quan hệ\"; nhiều mô tả của cùng một nhân vật phân tách bằng dấu phẩy tiếng Anh ,; các nhân vật khác nhau phân tách bằng dấu chấm phẩy tiếng Anh ;. Ít nhất phải có quan hệ với nhân vật chính.\n\nVí dụ SQL: INSERT INTO important_non_romance (name, gender, age, brief_intro, appearance, outfit_text, location_name, presence_status, relation_text, past_experience, interaction_options) VALUES ('Thương nhân chợ đen', 'Nam', 45, 'Điều hành tiệm tạp hóa phía nam thành', 'Mắt trái có vết sẹo dao', 'Áo khoác cổ đứng xám đậm phối găng tay da đen', 'Tiệm tạp hóa phía nam thành', 'Có mặt', 'Nhân vật chính:từng cứu mạng ông ta,nhà cung cấp lâu dài', 'Giao dịch lâu dài ở chợ đen ngầm.', 'Giả vờ tình cờ gặp rồi bắt chuyện để moi thông tin');",
      "ddl": "CREATE TABLE important_non_romance ( -- Bảng nhân vật quan trọng\n  row_id INTEGER PRIMARY KEY, -- Số hàng\n  name TEXT NOT NULL UNIQUE, -- Tên\n  gender TEXT, -- Giới tính\n  age INTEGER CHECK(age IS NULL OR age >= 0), -- Tuổi\n  brief_intro TEXT NOT NULL, -- Giới thiệu một câu\n  appearance TEXT, -- Đặc điểm ngoại hình\n  outfit_text TEXT, -- Trang phục\n  location_name TEXT, -- Địa điểm hiện tại\n  presence_status TEXT NOT NULL DEFAULT 'Có mặt' CHECK(presence_status IN ('Có mặt', 'Rời cảnh')), -- Trạng thái có mặt\n  relation_text TEXT NOT NULL, -- Quan hệ\n  past_experience TEXT, -- Trải nghiệm trước đây\n  interaction_options TEXT -- Lựa chọn tương tác\n);"
    },
    "content": [
      [
        "row_id",
        "Tên",
        "Giới tính",
        "Tuổi",
        "Giới thiệu một câu",
        "Đặc điểm ngoại hình",
        "Trang phục",
        "Địa điểm hiện tại",
        "Trạng thái có mặt",
        "Quan hệ",
        "Trải nghiệm trước đây",
        "Lựa chọn tương tác"
      ]
    ],
    "updateConfig": {
      "uiSentinel": -1,
      "contextDepth": -1,
      "updateFrequency": -1,
      "batchSize": -1,
      "skipFloors": -1,
      "groupId": -1
    },
    "exportConfig": {
      "enabled": true,
      "splitByRow": true,
      "entryName": "Bảng nhân vật quan trọng",
      "entryType": "keyword",
      "keywords": "Tên",
      "preventRecursion": true,
      "injectionTemplate": "",
      "extraIndexEnabled": true,
      "extraIndexEntryName": "Bảng nhân vật quan trọng-Chỉ mục",
      "extraIndexColumns": [
        "Tên",
        "Giới thiệu một câu"
      ],
      "extraIndexColumnModes": {
        "Tên": "both",
        "Giới thiệu một câu": "index_only"
      },
      "extraIndexInjectionTemplate": "Dưới đây là các nhân vật quan trọng đã xuất hiện:\n<Chỉ mục nhân vật quan trọng>\n$1\n</Chỉ mục nhân vật quan trọng>",
      "entryPlacement": {
        "position": "at_depth_as_system",
        "depth": 10000,
        "order": 10000
      },
      "extraIndexPlacement": {
        "position": "at_depth_as_system",
        "depth": 10000,
        "order": 8010
      },
      "fixedEntryPlacement": {
        "position": "at_depth_as_system",
        "depth": 10000,
        "order": 99985
      },
      "fixedIndexPlacement": {
        "position": "at_depth_as_system",
        "depth": 10000,
        "order": 99986
      }
    },
    "orderNo": 5
  },
  "sheet_summary": {
    "uid": "sheet_summary",
    "name": "Bảng kỷ yếu",
    "sourceData": {
      "note": "Nhật ký theo lượt. Sau khi mỗi lượt tương tác kết thúc, chèn ngay một bản ghi mới.\n\n【Định nghĩa cột】(Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: Mã chỉ mục (code_index; tăng dần từ AM0001, không được trùng với mã đã có)\n- Cột 1: Khoảng thời gian (time_span)\n- Cột 2: Tổng quan (summary; ≤30 chữ)\n- Cột 3: Kỷ yếu (chronicle_text; 240-480 chữ)\n- Cột 4: Hội thoại quan trọng (key_dialogue; có thể để trống)\n\n【Ràng buộc bắt buộc】\n1. Định dạng mã chỉ mục là AMXXXX, tăng dần từ 0001.\n2. Định dạng khoảng thời gian là \"YYYY-MM-DD HH:MM ~ YYYY-MM-DD HH:MM\", bao phủ khoảng thời gian thực tế của sự kiện lượt này.\n3. Tổng quan dùng một câu khái quát nội dung kỷ yếu lượt này, ≤30 chữ.\n\n4. Quy chuẩn kỷ yếu:\n- Ghi lại mọi điều xảy ra trong chính văn theo góc nhìn bên thứ ba trung lập khách quan, loại bỏ mọi biện từ và hội thoại. Không lạm dụng miêu tả môi trường, không phân tích chi tiết hành động, không bình luận, không trữ tình, không nâng tầm ý nghĩa.\n- Dùng từ thẳng thắn, đời thường, tránh lối nói trang trọng (như “đạt được thỏa thuận”, “xác lập kế hoạch”).\n- Phần kết bắt buộc để mở, kết thúc trong dòng chảy tự nhiên của sự kiện, không được tổng kết trạng thái hay khép lại kiểu đóng.\nVí dụ vi phạm: Câu chuyện vẫn tiếp diễn / Một chương mới mở ra / Quan hệ hai người bước sang giai đoạn mới / Tương lai đang chờ họ.\n- Nhiều lượt tương tác được gộp thành một bản ghi.\n- Nội dung cấm: cảm xúc cực đoan (suy sụp, cuồng hỉ, tuyệt vọng...), cường điệu, ví von, nâng tầm, tổng kết cảm xúc, dục vọng thống trị, dục vọng kiểm soát, kết thúc mang tính tổng kết.\n\n5. Hội thoại quan trọng chỉ trích lời thoại nguyên văn trực tiếp thúc đẩy bước ngoặt cốt truyện, tiết lộ thông tin then chốt, thay đổi quan hệ/quyết định của nhân vật hoặc cấu thành lời hứa/lời thề/giao ước, ghi rõ người nói. Loại trừ xã giao, lặp lại, cảm thán cảm xúc. Thường 3 câu, tối đa 5 câu, tổng token không quá 150.",
      "initNode": "Khi khởi tạo câu chuyện, chèn một bản ghi mới để ghi lại cốt truyện.",
      "deleteNode": "Cấm.",
      "updateNode": "Cấm.",
      "insertNode": "Sau khi mỗi lượt tương tác kết thúc, chèn một bản ghi mới.\n\n【Quy chuẩn điền】\ncode_index, time_span, summary, chronicle_text phải được điền đầy đủ, không được để trống hay ghi NULL.\ntime_span bắt buộc có định dạng YYYY-MM-DD HH:MM ~ YYYY-MM-DD HH:MM.\ncode_index bắt buộc có dạng mã bốn chữ số như AM0001, và không được trùng với mã đã có.\n\nVí dụ SQL：INSERT INTO chronicle (code_index, time_span, summary, chronicle_text, key_dialogue) VALUES ('AM0036', '2026-02-04 08:00 ~ 2026-02-04 08:30', 'Tóm tắt trong một câu', 'Nội dung kỷ yếu của lượt này...', NULL);",
      "ddl": "CREATE TABLE chronicle ( -- Bảng kỷ yếu\n  row_id INTEGER PRIMARY KEY, -- Số hàng\n  code_index TEXT NOT NULL UNIQUE CHECK(code_index GLOB 'AM[0-9][0-9][0-9][0-9]'), -- Mã chỉ mục\n  time_span TEXT NOT NULL CHECK(time_span GLOB '????-??-?? ??:?? ~ ????-??-?? ??:??'), -- Khoảng thời gian\n  summary TEXT NOT NULL, -- Tổng quan\n  chronicle_text TEXT NOT NULL, -- Kỷ yếu\n  key_dialogue TEXT -- Hội thoại quan trọng\n);"
    },
    "content": [
      [
        "row_id",
        "Mã chỉ mục",
        "Khoảng thời gian",
        "Tổng quan",
        "Kỷ yếu",
        "Hội thoại quan trọng"
      ]
    ],
    "updateConfig": {
      "uiSentinel": -1,
      "contextDepth": -1,
      "updateFrequency": -1,
      "batchSize": -1,
      "skipFloors": -1,
      "groupId": -1
    },
    "exportConfig": {
      "enabled": true,
      "splitByRow": true,
      "entryName": "Kỷ yếu",
      "entryType": "keyword",
      "keywords": "Mã chỉ mục",
      "preventRecursion": true,
      "injectionTemplate": "<Hồi tưởng ký ức>\n$1\n</Hồi tưởng ký ức>",
      "extraIndexEnabled": true,
      "extraIndexEntryName": "Chỉ mục kỷ yếu",
      "extraIndexColumns": [
        "Mã chỉ mục",
        "Khoảng thời gian",
        "Tổng quan"
      ],
      "extraIndexColumnModes": {
        "Mã chỉ mục": "both",
        "Khoảng thời gian": "both",
        "Tổng quan": "index_only"
      },
      "extraIndexInjectionTemplate": "<Tổng quan sự kiện đã xảy ra>\n$1\n</Tổng quan sự kiện đã xảy ra>",
      "entryPlacement": {
        "position": "at_depth_as_system",
        "depth": 999,
        "order": 10000
      },
      "extraIndexPlacement": {
        "position": "at_depth_as_system",
        "depth": 1000,
        "order": 10010
      },
      "fixedEntryPlacement": {
        "position": "at_depth_as_system",
        "depth": 9999,
        "order": 99987
      },
      "fixedIndexPlacement": {
        "position": "at_depth_as_system",
        "depth": 9999,
        "order": 99988
      }
    },
    "orderNo": 10
  }
};
