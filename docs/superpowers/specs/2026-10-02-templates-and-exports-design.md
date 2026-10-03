# Custom templates and meeting exports

Approved direction: extend the MIT desktop app for our own use, retaining the option to commercialize. The user authorized implementation on 2026-10-02 after reviewing the proposed staged approach.

## First milestone

Keep the Tauri/Rust core, Next.js interface, local SQLite storage, and existing summary providers. Deliver editable local summary templates and local PDF, DOCX, and Markdown exports. Speaker diarization, live speaker labels, integrations, GPU packaging, billing, and a new brand are separate milestones.

Templates contain a display name, description, and ordered sections. Each section has a title, instruction, and paragraph/list/string format. The editor can create templates, duplicate built-ins, edit custom templates, and delete custom templates. Show a structural preview; it does not call an AI model. Persist custom templates in the directory already read by the summary engine. Protect built-ins from accidental overwriting. A successful save refreshes the selector and selects the saved template. Failed writes preserve the editor's contents and display an actionable error. Prevent edits while summary generation is active.

Add four original presets (retrospective, client call, interview, project planning) beside the two existing presets. Use stable IDs so the current summary commands and template cache continue to work.

Exports contain the current meeting title, date, current summary (including unsaved editor changes), and optionally the complete transcript with recording-relative timestamps. Fetch all transcript pages from the backend rather than exporting only the visible page. Markdown, PDF, and DOCX use one shared document representation. PDF and DOCX generation run locally and load only when needed. Save through the native file dialog and filesystem, with explicit cancellation handling. Preserve paragraphs, headings, lists, and tables where supported; document any formatting limitations. Fail clearly rather than silently exporting a truncated transcript or empty summary.

## Verification

Use existing Bun tests and TypeScript checks, plus tests covering validation, persistence boundaries, all-page transcript fetching, exported document contents, file signatures, cancellation, and failed writes. Test new Rust persistence logic with temporary directories. Run the Next.js production build. Native Tauri compilation and app smoke tests require Rust and Windows C++ build tools, absent at kickoff; report that limit honestly unless the environment becomes available.

## Constraints

- Preserve original MIT copyright and license notices.
- Keep processing local; export must not require an external service.
- Follow existing Tauri, React, and Tailwind patterns.
- Custom template IDs cannot traverse directories or overwrite built-in templates.
- Export all transcript pages when the transcript is requested.
- Export current unsaved summary content where the editor supports it.
- Do not change upstream main or add billing, authentication, or telemetry.

## Deferred work

After this milestone: benchmark local diarization models on representative recordings, add persistent speaker labels and corrections, validate GPU backends on our hardware, and expose meeting services through MCP/CLI/webhooks.
