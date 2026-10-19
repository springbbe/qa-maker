# QA Maker – Luyện đề từ PDF bằng AI

Web tĩnh (chạy trên GitHub Pages) biến **bất kỳ file đề thi nào** (PDF, ảnh, Word…) thành bộ ôn tập:
flashcard, luyện tập, thi thử, ôn ngắt quãng, trò chơi… Không cần server, không cần đăng nhập — dữ liệu lưu trong `localStorage` của trình duyệt.

## Cách dùng

1. Mở web → bấm **📋 Copy prompt** (trang chủ hoặc trang *Nhập đề*). Có thể thêm “ghi chú cho AI”, ví dụ *“Chỉ lấy Đề số 01”*.
2. Mở ChatGPT / Claude / Gemini → **đính kèm file PDF** → dán prompt → gửi.
3. Copy nguyên câu trả lời của AI (có thể kèm ` ```json `) → dán vào trang **Nhập đề** → **Lưu & bắt đầu ôn**.
4. File dài: AI sẽ chia phần và ghi “Còn tiếp — gõ 'tiếp'”. Gõ `tiếp`, dán phần sau, chọn **Gộp vào** bộ đề cũ.

Muốn thử ngay: bấm **✨ Dùng thử đề mẫu** → chọn một đề trong danh sách đề mẫu.

## Thêm đề mẫu

1. Lấy JSON AI trả về (đúng định dạng bên dưới), lưu thành file trong thư mục [`samples/`](samples/), ví dụ `samples/toan-cao-cap-de-1.json`.
2. Thêm tên file vào [`samples/index.json`](samples/index.json):
   ```json
   { "samples": ["kinh-te-luong-de-so-01.json", "toan-cao-cap-de-1.json"] }
   ```
   Có thể ghi đè tên/môn/mô tả hiển thị: `{ "file": "toan-cao-cap-de-1.json", "title": "Toán cao cấp – Đề 1" }`.
3. Commit & push. Người dùng đã thêm đề mẫu trước đó sẽ thấy nút **🔄 Cập nhật** khi file thay đổi (tiến độ giữ nguyên theo `id` câu).

## Các chế độ ôn

| Chế độ | Mô tả |
|---|---|
| 🃏 Flashcard | Lật thẻ hỏi–đáp, đánh dấu thuộc / chưa thuộc, xáo thẻ, phím tắt |
| ✍️ Luyện tập | Làm từng câu, chấm ngay, hiện giải thích, làm lại câu sai |
| ⏱️ Thi thử | Chọn số câu & thời gian, bảng điều hướng, gắn cờ, nộp bài chấm thang 10, xem lại; tự lưu bài đang làm dở |
| 🧠 Ôn ngắt quãng | Thuật toán lặp lại ngắt quãng (kiểu SM‑2): Quên / Khó / Nhớ / Dễ |
| ⌨️ Gõ đáp án | Ẩn phương án, tự gõ lại đáp án (so khớp gần đúng) |
| ⚡ Đúng / Sai nhanh | 60 giây: đáp án đề xuất đúng hay sai? Có kỷ lục |
| 🧩 Ghép cặp | Ghép câu hỏi với đáp án nhanh nhất, có kỷ lục |
| 🎯 Ôn câu sai | Chỉ luyện các câu đang làm sai |
| 📖 Xem toàn bộ đề | Đọc đề + đáp án, tìm kiếm, ẩn/hiện đáp án, in ra PDF |
| 📊 Thống kê | Tiến độ, tỉ lệ đúng theo phần, câu hay sai nhất |

Mọi chế độ dùng chung **Phạm vi ôn tập**: lọc theo phần/đề, loại câu, trạng thái (sai, ★ đánh dấu, chưa làm, chưa thuộc, đáp án do AI giải), thứ tự ngẫu nhiên, số câu tối đa, xáo phương án.

## Định dạng JSON (`qa-maker` v1)

```json
{
  "format": "qa-maker", "version": 1,
  "title": "Tên bộ đề", "subject": "Môn", "description": "", "language": "vi",
  "passages": [{ "id": "p1", "title": "Bài đọc", "text": "..." }],
  "questions": [{
    "id": "1", "number": "1", "section": "Đề số 01",
    "type": "single",
    "passage": "p1", "context": "", "figure": "",
    "question": "Markdown + $LaTeX$",
    "options": [{ "key": "A", "text": "..." }, { "key": "B", "text": "..." }],
    "answer": ["B"],
    "explanation": "", "answerSource": "document", "note": "",
    "fixedOrder": false, "tags": [], "difficulty": "medium"
  }]
}
```

| `type` | `answer` |
|---|---|
| `single` | `["C"]` |
| `multiple` | `["A","C"]` |
| `true_false` | `true` / `false` |
| `fill_blank` (chỗ trống là `___`) | `[["đáp án 1","cách viết khác"],["đáp án 2"]]` |
| `short_answer` | `["3395.15","3395,15"]` |
| `essay` | `"lời giải mẫu (Markdown)"` |

Prompt đầy đủ (giải thích từng trường, cách nhận diện đáp án tô màu / in đậm / bảng đáp án, cách viết công thức, chia phần…) nằm trong [`assets/prompt.js`](assets/prompt.js).

Bộ đọc JSON khá “dễ tính”: chấp nhận khối ` ```json `, lời dẫn thừa, nhiều phần dán cùng lúc, dấu phẩy thừa, LaTeX quên nhân đôi `\`, đáp án dạng `"b"`, `"B. text"`, số thứ tự, v.v. — và sẽ báo các lưu ý khi nhập.

## Chạy thử trên máy

```bash
python3 -m http.server 8000
# mở http://localhost:8000  (cần web server để tải được đề mẫu; mở file:// trực tiếp sẽ không thấy đề mẫu)
```

## Cấu trúc

```
index.html          khung trang + nạp thư viện CDN (KaTeX, marked, DOMPurify)
assets/style.css    giao diện (sáng/tối, mobile)
assets/prompt.js    prompt gửi cho AI → window.buildPrompt(extra)
assets/app.js       toàn bộ logic: lưu trữ, đọc JSON, hiển thị, các chế độ ôn
samples/index.json  danh sách đề mẫu
samples/*.json      các đề mẫu (JSON định dạng qa-maker)
```
