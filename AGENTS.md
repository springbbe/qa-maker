# AGENTS.md — hướng dẫn cho AI agent làm việc trên repo này

## Dự án là gì
QA Maker là web **tĩnh** (GitHub Pages, nhánh `main`, thư mục gốc) để luyện đề thi.
Người dùng copy prompt → gửi cho AI kèm file PDF đề → AI trả JSON → dán vào web → web lưu `localStorage` và dựng các chế độ ôn tập.
Ngôn ngữ giao diện, prompt, comment: **tiếng Việt**.

## Nguyên tắc
- Không có bước build, không npm, không framework. Chỉ HTML/CSS/JS thuần, mở `index.html` qua HTTP là chạy.
- Thư viện ngoài chỉ qua CDN có ghim phiên bản trong `index.html`: KaTeX 0.16.11, marked 12.0.2, DOMPurify 3.1.6. Code phải chạy được (xuống cấp nhẹ) nếu CDN lỗi — xem `rich()` trong `app.js`.
- Mọi nội dung lấy từ JSON người dùng đều đi qua `rich()` (Markdown → DOMPurify) hoặc `esc()`. Không chèn HTML thô.
- Người dùng mặc định push thẳng lên `main` (đã đồng ý). Commit message rõ ràng.

## Bản đồ code
| File | Nội dung |
|---|---|
| `index.html` | Khung trang, header, nạp CDN + các file `assets/*.js` theo thứ tự: prompt → sample → app |
| `assets/prompt.js` | `window.buildPrompt(extra)` — prompt chuẩn gửi AI (viết bằng `String.raw`, đừng làm hỏng dấu `\`) |
| `assets/sample.js` | `window.SAMPLE_DECK_JSON` — bộ đề mẫu dạng chuỗi JSON (dấu `\` của LaTeX đã nhân đôi) |
| `assets/app.js` | Toàn bộ logic, một IIFE, chia mục bằng comment `// ===` |
| `assets/style.css` | Biến màu ở `:root`, dark mode qua `prefers-color-scheme` + `[data-theme]` |

Các mục trong `app.js`:
1. Tiện ích (`esc`, `toast`, `onKey`/`every` tự dọn khi đổi route qua `onCleanup`)
2. Lưu trữ: khóa `qam:index`, `qam:deck:<id>`, `qam:prog:<id>`, `qam:meta:<id>`, `qam:exam:<id>`, `qam:settings`
3. Đọc JSON: `extractJsonBlocks` → `parseJsonLoose`/`repairJson` → `deepFix` (khôi phục LaTeX bị JSON nuốt `\b \f \t \n \r`) → `normalizeQuestion` → `parseImport`; `mergeInto` để gộp phần
4. Hiển thị: `rich`, `questionHtml`, `answerHtml`, `explainHtml`
5. Chấm: `grade`, `matchText` (bỏ dấu, so số theo số chữ số thập phân), `similarity` (Levenshtein)
6. `makeInput(q, opts)` — ô trả lời dùng chung cho mọi loại câu
7. Phạm vi ôn tập: `filterQs(deck, scope, eligible)`
8. Các chế độ: đăng ký trong object `MODES` (`run(deck)`, `eligible`, `noScope`). Thêm chế độ mới = thêm 1 mục vào `MODES` + 1 hàm `runXxx`.
9. Trang: `viewHome`, `viewImport`, `viewDeck`; router hash `#/`, `#/import?deck=`, `#/deck/<id>/<mode>`
10. `window.QAM` lộ một số hàm để kiểm thử từ console.

## Định dạng dữ liệu
Định nghĩa chuẩn nằm trong prompt (`assets/prompt.js`) và README. Câu hỏi sau khi chuẩn hóa luôn có:
`id, number, section, type, question, options[{key,text}], answer, context, passage, figure, explanation, note, answerSource ('document'|'ai'|''), fixedOrder, tags[], difficulty`.
`type` ∈ `single | multiple | true_false | fill_blank | short_answer | essay`.
Nếu đổi định dạng: cập nhật **cùng lúc** prompt, `normalizeQuestion`, sample, README.

Tiến độ mỗi câu (`qam:prog:<deckId>` → `{ [qid]: {...} }`): `a` số lần làm, `c` đúng, `w` sai, `last` (1/0), `t` thời điểm, `known` (flashcard), `star`, `srs {reps,int,ef,due}`.

## Kiểm thử
Không có test runner. Cách đã dùng:
```bash
python3 -m http.server 8765 &
# Playwright (đã cài sẵn trong môi trường cloud): mở http://localhost:8765, bấm "Dùng thử đề mẫu",
# đi qua từng #/deck/<id>/<mode>, bắt sự kiện pageerror/console error; gọi window.QAM.parseImport(...) để test bộ đọc JSON.
```
Luôn chạy `node --check assets/*.js` trước khi commit.
