# Long Huyết Huyền Hoàng · CSDL (龙血玄黄·数据库) — Bản tiếng Việt

Tiện ích **trí nhớ dạng bảng** cho [SillyTavern](https://github.com/SillyTavern/SillyTavern). Sau mỗi lượt trả lời của AI, tiện ích tự động đọc diễn biến mới, cập nhật một bộ bảng dữ liệu (nhân vật, địa điểm, vật phẩm, nhiệm vụ, kỷ yếu…) và đưa phần liên quan trở lại ngữ cảnh. Nhờ vậy câu chuyện dài hàng trăm tầng vẫn giữ được chi tiết mà không làm phình ngữ cảnh.

Đây là bản Việt hoá của dự án gốc tiếng Trung (tên gốc: 龙血玄黄·数据库 / AutoCardUpdater). Giao diện, thông báo, prompt mặc định và bảng mẫu đã được dịch sang tiếng Việt; dữ liệu và cấu hình cũ từ bản tiếng Trung vẫn dùng được (xem [Chuyển từ bản tiếng Trung](#chuyển-từ-bản-tiếng-trung)).

- Phiên bản hiện tại: **1.2.9**
- Tên hiển thị: **Long Huyết Huyền Hoàng · CSDL** (trong Manage extensions), **Nailong · CSDL I** (thanh bên và nút mở giao diện).
- Cài được theo hai cách: **extension của SillyTavern** hoặc **script của Tavern Helper (酒馆助手)**.

---

## Mục lục

- [Tính năng](#tính-năng)
- [Cài đặt](#cài-đặt)
- [Bắt đầu nhanh](#bắt-đầu-nhanh)
- [Khuyên dùng: Frontend Database](#khuyên-dùng-frontend-database)
- [Hướng dẫn sử dụng](#hướng-dẫn-sử-dụng)
- [Chuyển từ bản tiếng Trung](#chuyển-từ-bản-tiếng-trung)
- [Xử lý sự cố](#xử-lý-sự-cố)
- [Dành cho nhà phát triển](#dành-cho-nhà-phát-triển)

---

## Tính năng

| Nhóm | Tính năng | Mô tả ngắn |
|---|---|---|
| Lõi | **Điền bảng tự động** | Sau mỗi phản hồi của AI, một lượt gọi AI riêng đọc nội dung mới và thêm/sửa/xoá hàng trong các bảng. |
| Lõi | **Chế độ điền bảng** | Bốn cách đưa trí nhớ vào ngữ cảnh: cổ điển, vector, truy hồi logic bằng LLM, giao hỏa (kết hợp). |
| Lõi | **Mẫu bảng** | Tám bảng mặc định có sẵn; tự sửa bảng/cột/quy tắc bằng trình chỉnh sửa trực quan hoặc nhờ trợ lý mẫu bằng AI. |
| Lõi | **Ghi vào sổ thế giới** | Dữ liệu bảng được ghi thành các mục sổ thế giới (World Info) để SillyTavern chèn vào prompt. |
| Cốt truyện | **Đẩy cốt truyện** | Trước khi AI viết, chạy thêm các tác vụ (truy hồi ký ức theo thời gian, dàn ý…) để dẫn hướng nội dung. |
| Nâng cao | **Agent sổ thế giới** | Agent tự bật/tắt mục sổ thế giới theo tình huống và tạo metadata Skill cho từng mục. |
| Nâng cao | **Viết tiếp thông minh** | Nhóm agent (lập dàn ý, chia nhịp, viết, duyệt) tự viết tiếp câu chuyện nhiều lượt liên tục. |
| Nâng cao | **Nhập từ ngoài** | Chuyển tiểu thuyết TXT thành các mục sổ thế giới, tiện cho việc làm thẻ nhân vật. |
| Cao cấp | **Mô phỏng thế giới** | Mô phỏng những gì diễn ra ngoài cảnh (nhân vật khác, thế lực, tin đồn) và ghi tín hiệu vào nội dung. |
| Cao cấp | **Thay thế nội dung** | Tự kiểm tra và tối ưu văn bản AI trả về sau mỗi lượt. |
| Cao cấp | **Bảng điều khiển SQL** | Chạy SQL trực tiếp trên dữ liệu bảng khi dùng chế độ lưu trữ SQLite. |
| Khác | **Sao lưu/khôi phục, snapshot** | Mỗi tầng tin nhắn lưu một snapshot bảng; có thể quay lại, sao lưu, dọn dẹp. |
| Khác | **Thú cưng màn hình** | Linh vật hiện bong bóng thông báo và tiến độ (có thể tắt). |

---

## Cài đặt

> Chỉ chọn **một** trong hai cách: extension **hoặc** script Tavern Helper. Không chạy cả hai cùng lúc.

### Cách 1 — Extension của SillyTavern (khuyên dùng)

1. Mở SillyTavern → bảng **Extensions** (biểu tượng khối ghép) → **Install extension**.
2. Dán URL:
   ```
   https://github.com/TheZackNova/ST-Memory-Database
   ```
3. Ô **Branch** để trống hoặc ghi `main`. Muốn thử một nhánh khác thì ghi tên nhánh đó.
4. Bấm **Install**, rồi tải lại trang.

Cập nhật về sau: **Extensions → Manage extensions** → bấm cập nhật ở dòng của tiện ích (tiện ích không tự cập nhật).

<details>
<summary>Cài/chuyển nhánh bằng git (khi giao diện không có ô Branch)</summary>

```bash
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/TheZackNova/ST-Memory-Database
# chuyển sang nhánh khác nếu cần:
cd ST-Memory-Database && git fetch origin <tên-nhánh> && git checkout <tên-nhánh>
```

Sau đó tải lại SillyTavern.
</details>

### Cách 2 — Script của Tavern Helper (酒馆助手)

Dùng cách này nếu bạn đã cài [Tavern Helper](https://github.com/N0VI028/JS-Slash-Runner) và quen quản lý script trong đó.

1. Tải tệp [`酒馆助手脚本-龙血玄黄·数据库.json`](./酒馆助手脚本-龙血玄黄·数据库.json) ở thư mục gốc repo (mở tệp → **Download raw file**).
2. Trong Tavern Helper, vào danh sách script → nhập tệp JSON vừa tải.
3. Bật script, tải lại trang.

---

## Bắt đầu nhanh

1. **Mở bảng điều khiển**: bấm nút menu tiện ích (biểu tượng đũa phép ở ô nhập chat) → chọn **Nailong · CSDL I** (biểu tượng cơ sở dữ liệu).
2. **Cấu hình API** (trang **API**): chọn dùng kết nối hiện tại của SillyTavern, một preset kết nối, hoặc nhập API tùy chỉnh (URL + khoá + mô hình). Nên dùng mô hình rẻ, nhanh, làm theo hướng dẫn tốt cho việc điền bảng.
3. **Mở hoặc tạo một cuộc trò chuyện** với thẻ nhân vật bất kỳ.
4. **Chat bình thường.** Sau mỗi phản hồi của AI, tiện ích tự điền bảng; tiến độ hiện ở bong bóng thông báo (hoặc cạnh thú cưng màn hình).
5. **Xem kết quả**: trang **Bảng điều khiển** hiển thị trạng thái bảng; bấm mở **trình chỉnh sửa trực quan** để xem/sửa từng hàng.

Chỉ cần vậy là đã có trí nhớ dạng bảng. Các tính năng khác là tuỳ chọn.

---

## Khuyên dùng: Frontend Database

Để **xem thông tin bảng dễ dàng hơn** ngay trong khung chat, nên cài thêm script giao diện **Frontend Database** cho Tavern Helper. Script hiển thị dữ liệu bảng thành thẻ và dashboard gọn gàng, cho phép sửa/xoá hàng trực tiếp, và biến bảng lựa chọn thành các nút bấm nhanh.

Bản trong repo ([`extras/Frontend_Database-V13.47-vn.json`](./extras/Frontend_Database-V13.47-vn.json)) đã được vá cho tương thích với template tiếng Việt mới:

- Nhận đúng **Bảng lựa chọn** để hiện nút lựa chọn nhanh.
- Dashboard tự xếp thẻ cho bảng thông tin nhân vật chính, dữ liệu toàn cục, nhân vật quan trọng, vật phẩm hành trang, kỹ năng, nhiệm vụ.
- Thẻ bảng kỷ yếu lấy **Mã chỉ mục** làm tiêu đề.
- Escape HTML cho toàn bộ dữ liệu bảng, tránh vỡ giao diện khi nội dung có ký tự `<`, `>`, `&`.

**Cài đặt:**

1. Cần có [Tavern Helper (酒馆助手)](https://github.com/N0VI028/JS-Slash-Runner) và đã cài tiện ích này.
2. Tải [`extras/Frontend_Database-V13.47-vn.json`](./extras/Frontend_Database-V13.47-vn.json) (mở tệp → **Download raw file**).
3. Trong Tavern Helper, nhập tệp JSON vào danh sách script, bật script và tải lại trang.
4. Nếu đã có bản Frontend Database cũ, tắt hoặc xoá bản cũ để không chạy hai bản cùng lúc. Dashboard từng cấu hình với tên bảng cũ có thể cần chọn lại bảng trong chế độ sửa dashboard.

> Script này là dự án riêng (tác giả gốc: 夏休期; biên tập: a1185673398, Spark; cảm hứng: 九颜、Zaria; dịch: Decal), chỉ được vá nhỏ để tương thích. Nó dùng API công khai `window.AutoCardUpdaterAPI` của tiện ích, không thay đổi cách tiện ích lưu dữ liệu.

---

## Hướng dẫn sử dụng

### Cấp giao diện

Để giao diện gọn, các trang được chia theo ba cấp:

| Cấp | Hiển thị |
|---|---|
| **Chế độ nhẹ** (mặc định) | Bàn điền bảng, chế độ điền bảng, đẩy cốt truyện, API, quản lý dữ liệu, nhật ký chạy. |
| **Chế độ nâng cao** | Thêm Agent, viết tiếp thông minh, nhập từ ngoài. |
| **Chế độ cao cấp** | Thêm mô phỏng thế giới, thay thế nội dung, bảng điều khiển SQL, tùy chọn nhà phát triển. |

Đổi cấp: **bấm 5 lần liên tiếp vào tên tiện ích** ở góc trên thanh bên → chọn cấp. Lên **Chế độ cao cấp** phải gõ đúng cụm xác nhận `Bật tính năng nâng cao`.

> Nếu chỉ cần chức năng ghi nhớ, **Chế độ nhẹ là đủ**.

### Bảng điều khiển

Trang tổng quan, gồm:

- Tình trạng API, cập nhật bảng, chế độ lưu trữ (JSON gốc / SQLite), vector giao hỏa, nhật ký chạy.
- Các công tắc nhanh:
  - **Cập nhật tự động** (mặc định bật): tắt thì phải cập nhật bảng thủ công.
  - **Chế độ im lặng**: ẩn mọi bong bóng thông báo; lỗi vẫn được ghi vào nhật ký.
  - **Chế độ chiếm 0TK** (mặc định bật): tổng quan kỷ yếu không chiếm ngữ cảnh.
  - **Xuất streaming**, **Thú cưng màn hình**, **Chèn truyện cười nhạt**.
  - Bật/tắt từng tính năng: viết tiếp thông minh, mô phỏng thế giới, nhập từ ngoài, thay thế nội dung.

### Bàn điền bảng

- **Mẫu bảng (preset)**: chọn mẫu đang dùng; bấm ngôi sao để đặt làm mặc định toàn cục. Mẫu dựng sẵn không sửa được — dùng **Tạo mới từ mặc định** để có bản sao tự sửa.
- **Sổ thế giới đích**: nơi ghi dữ liệu bảng. Mặc định là sổ thế giới chính của thẻ nhân vật; thẻ chưa có thì cần tạo sổ mới và gắn vào thẻ.
- **Mục sổ thế giới đính kèm**: các mục gửi kèm cho AI điền bảng tham khảo.
- **Cài đặt cập nhật tự động**: bao nhiêu tầng thì cập nhật một lần, bỏ qua bao nhiêu tầng gần nhất, v.v.
- **Lọc theo thẻ**: loại bỏ phần văn bản trong các thẻ nhất định (ví dụ phần suy nghĩ) trước khi gửi đi điền bảng.
- **Prompt điền bảng**: xem/sửa prompt; nút **khôi phục mặc định** đưa về bản tiếng Việt hiện hành.
- **Điền bảng thủ công**: chạy cập nhật ngay cho một khoảng tầng.

### Bảng mẫu mặc định

| Bảng | Nội dung |
|---|---|
| Bảng dữ liệu toàn cục | Địa điểm hiện tại, thời gian hiện tại, thời gian trôi qua. |
| Bảng thông tin nhân vật chính | Tên, giới tính/tuổi, ngoại hình, thân phận, quá khứ, tính cách. |
| Bảng nhân vật quan trọng | Các nhân vật phụ quan trọng, vật phẩm họ giữ, có còn trong cảnh hay không. |
| Bảng kỹ năng nhân vật chính | Tên, loại, cấp độ, hiệu quả kỹ năng. |
| Bảng vật phẩm hành trang | Vật phẩm, số lượng, mô tả, phân loại. |
| Bảng nhiệm vụ và sự kiện | Nhiệm vụ chính/phụ, tiến độ, thời hạn, thưởng phạt. |
| Bảng kỷ yếu | Tóm tắt diễn biến theo từng đoạn, kèm mã chỉ mục (AM0001…). |
| Bảng lựa chọn | Gợi ý các hướng hành động tiếp theo. |

Mỗi bảng có **ghi chú/quy tắc điền** riêng (AI đọc kỹ trước khi điền) và cấu hình chèn vào sổ thế giới. Sửa trong **trình chỉnh sửa trực quan**:

- Thêm/xoá/đổi tên bảng và cột, sửa quy tắc điền, vị trí chèn.
- **Trợ lý mẫu**: mô tả bằng lời điều muốn sửa (ví dụ *"thêm cột Mục tiêu ngắn hạn vào bảng nhân vật quan trọng"*), AI đề xuất thay đổi, bạn xem diff rồi áp dụng.

> Xoá bảng hoặc cột đang có dữ liệu luôn cần xác nhận rõ ràng.

### Chế độ điền bảng

Chọn trong trang **Chế độ điền bảng** (áp dụng theo từng cuộc trò chuyện; bấm ngôi sao để đặt mặc định cho cuộc trò chuyện mới):

| Chế độ | Cách hoạt động | Khi nào dùng |
|---|---|---|
| **Bảng cổ điển** (mặc định) | Kỷ yếu được tổng kết lớn dần để gọn ngữ cảnh. | Không muốn cấu hình gì thêm. |
| **Bảng vector** | Embedding + rerank chọn kỷ yếu liên quan nhất rồi chèn vào. | Câu chuyện rất dài, có sẵn API embedding. |
| **Truy hồi logic bằng LLM** | LLM đọc danh mục kỷ yếu rồi đọc kỹ đoạn cần thiết. | Cần độ chính xác cao nhất, chấp nhận thêm một lượt gọi LLM. |
| **Giao hỏa** | Từ khoá + vector + BM25 + rerank, rồi LLM phân tích. | Kết hợp ưu điểm của hai chế độ trên. |

Chế độ vector và giao hỏa cần cấu hình thêm **Embedding / Rerank** (URL, khoá, mô hình) trong trang API.

### Đẩy cốt truyện

Chạy các tác vụ AI phụ **trước** khi AI chính viết, ví dụ preset dựng sẵn **truy hồi theo thời gian** giúp AI nhớ lại sự kiện liên quan. Có thể tạo preset riêng, mỗi preset gồm nhiều tác vụ với prompt và điều kiện kích hoạt.

Ở chế độ nâng cao có thêm **Agent sổ thế giới**: tự quyết định bật/tắt mục sổ thế giới theo tình huống, và **Skill hoá** (tạo metadata mô tả/thời điểm kích hoạt cho từng mục).

### Viết tiếp thông minh *(chế độ nâng cao)*

Giao cho một nhóm agent viết tiếp câu chuyện thay bạn:

1. Bật tính năng trong Bảng điều khiển, mở trang **Viết tiếp thông minh**.
2. Nhập yêu cầu (hướng đi, nhịp độ, số lượt…), có thể ghim **yêu cầu người dùng** để agent luôn tuân theo.
3. Agent lập dàn ý → chia nhịp → viết → duyệt trước khi gửi; có thể ngắt và chen chỉ thị bất kỳ lúc nào.

Prompt của từng agent sửa được trong trang, có nút khôi phục mặc định.

### Nhập từ ngoài *(chế độ nâng cao)*

Tải tệp TXT (tiểu thuyết, tư liệu) → chọn cách tách đoạn và bảng cần ghi → tiện ích chia nhỏ, gọi AI trích xuất và ghi thành mục sổ thế giới (tiền tố `外部导入-`). Có thể tạm dừng và tiếp tục.

### Mô phỏng thế giới *(chế độ cao cấp)*

Mô phỏng những gì xảy ra **ngoài cảnh** trong lúc nhân vật chính hành động: nhân vật khác, thế lực, tin đồn, phục bút. Agent lập sổ cái thế giới, kiểm tra bằng chứng, rồi sau khi bạn xác nhận sẽ ghi các tín hiệu cảm nhận được (đoạn 〈与此同时〉) vào tầng assistant.

### Quản lý dữ liệu

- **Sao lưu và khôi phục** dữ liệu bảng của cuộc trò chuyện.
- **Chẩn đoán**: kiểm tra runtime SQLite, khôi phục dữ liệu V2.
- **Xoá và dọn dẹp**: xoá dữ liệu của cuộc trò chuyện, dọn mục sổ thế giới do tiện ích tạo.

### Công cụ nâng cao

- **Nhật ký chạy**: xem log chi tiết; lỗi thường gặp có kèm gợi ý cách xử lý.
- **Bảng điều khiển SQL** *(chế độ cao cấp, cần lưu trữ SQLite)*: chạy câu lệnh SQL trực tiếp trên cơ sở dữ liệu SQLite của cuộc trò chuyện hiện tại — cẩn thận với lệnh ghi/xoá.

---

## Chuyển từ bản tiếng Trung

Nếu bạn đã dùng bản tiếng Trung trước đó:

- **Dữ liệu bảng cũ vẫn được nhận.** Bảng mặc định khai báo tên bảng/cột tiếng Trung cũ làm bí danh, nên dữ liệu trong các cuộc trò chuyện cũ được kế thừa. Mẫu mặc định cũ chưa sửa sẽ được làm mới sang bản tiếng Việt; mẫu bạn đã tự sửa và preset có tên riêng được giữ nguyên.
- **Theme dựng sẵn** đổi tên sang tiếng Việt (Sáng, Tối, Kem sữa…); tên cũ vẫn được nhận.
- **Prompt đã lưu không tự chuyển sang tiếng Việt.** Nếu trước đây cấu hình đã lưu prompt, chúng vẫn là tiếng Trung (vẫn chạy bình thường). Muốn dùng bản tiếng Việt, bấm **khôi phục mặc định** ở từng chỗ:
  - Prompt điền bảng (Bàn điền bảng)
  - Preset đẩy cốt truyện
  - Prompt các agent viết tiếp thông minh
  - Prompt các agent mô phỏng thế giới
  - Prompt thay thế/tối ưu nội dung, prompt vector
- **Nên sao lưu trước** (Quản lý dữ liệu → Sao lưu) khi đổi phiên bản.

Một số dấu nhận diện nội bộ vẫn giữ chữ Hán vì là định danh dùng để dọn dẹp và bảo vệ dữ liệu: tiền tố mục `外部导入-`, các mục cố định của bảng kiểu cũ. Tên script trong Tavern Helper (`@name`) và tên tệp JSON vẫn là `龙血玄黄·数据库` để bản cài cũ nhận đúng script khi cập nhật.

---

## Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Không thấy nút mở tiện ích | Tải lại trang; kiểm tra tiện ích đã bật trong Manage extensions; không chạy đồng thời bản extension và bản script. |
| Bảng không được cập nhật | Kiểm tra **Cập nhật tự động** đang bật; trang API đã cấu hình; xem **Nhật ký chạy** để biết lỗi. |
| Báo lỗi API / hết thời gian | Kiểm tra URL, khoá, tên mô hình; thử mô hình khác; giảm lượng tầng gửi mỗi lần. |
| AI trả về sai định dạng / không có `<tableEdit>` | Dùng mô hình làm theo hướng dẫn tốt hơn; khôi phục prompt điền bảng mặc định. |
| Nội dung trùng lặp hoặc sai sau khi xoá/sửa tin nhắn | Dùng điền bảng thủ công cho khoảng tầng bị ảnh hưởng, hoặc khôi phục snapshot. |
| Không cần bong bóng thông báo | Bật **Chế độ im lặng** hoặc tắt thú cưng màn hình. |

Khi báo lỗi, vui lòng đính kèm phần liên quan trong **Nhật ký chạy**.

---

## Dành cho nhà phát triển

- Mã nguồn TypeScript + Vue 3 trong `src/`, test Vitest trong `tests/`.
- Công cụ: Node 22, pnpm, TypeScript 5.7, Vitest 3.2, Rollup 4.

```bash
pnpm install
npx tsc --noEmit                 # kiểm tra kiểu
npx vitest run                   # chạy test
ACU_BUILD_VERSION=1.2.9 npm run build
```

Lệnh build tạo `index.js` ở thư mục gốc (tệp mà extension nạp, khai báo trong `manifest.json`) và đồng bộ sang tệp JSON của Tavern Helper. Thư mục `dist/` chỉ là sản phẩm trung gian, không commit.

Quy ước dự án xem trong [`AGENTS.md`](./AGENTS.md).

---

## Ghi công

- Tác giả bản gốc tiếng Trung: dự án **龙血玄黄·数据库** (AutoCardUpdater).
- Việt hoá: [TheZackNova](https://github.com/TheZackNova).
- Script Frontend Database: tác giả gốc 夏休期; biên tập a1185673398, Spark; cảm hứng 九颜、Zaria; dịch Decal.
