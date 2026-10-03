# Meeting exports

All formats use `MeetingDocument`: the current title, the date in the user's local timezone, summary blocks, and optional complete transcript paragraphs with recording-relative timestamps. Legacy summaries follow `_section_order`, then retain any additional sections. Missing recording timestamps are explicitly marked `time unavailable`; wall-clock timestamps are never misrepresented as recording-relative times.

PDF (`jspdf` and `jspdf-autotable`) and DOCX (`docx`) are imported only when requested and generated locally. No export service or remote font is used. The native save dialog grants access to the selected file; cancellation does not write anything. Failed conversion, incomplete transcript retrieval, and failed writes surface an error without modifying the summary or resetting format options.

Headings, paragraphs, ordered/unordered and nested lists, task checkbox text, and tables are preserved. Inline emphasis, colors, and blockquote/code styling are flattened to text; links retain their display text and URL, and images retain alt text without downloading image data. Markdown escapes literal syntax. PDF tables repeat the header on each page, keep ordinary rows together, and continue rows taller than a page. DOCX tables use header rows; the document viewer controls final pagination.

PDF uses built-in Helvetica with WinAnsi text support (including Western European accents and common typographic punctuation). Characters outside that repertoire, such as CJK text and emoji, cause an actionable error identifying the character and recommending Markdown or DOCX. They are never silently replaced. Markdown and DOCX retain Unicode; a DOCX viewer supplies the fonts used to display it.

Native save-dialog and filesystem integration still require a Tauri smoke test on a machine with Rust and the Windows C++ build tools.
