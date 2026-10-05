# Custom Templates and Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add usable local template editing and PDF/DOCX/Markdown meeting exports to our fork.

**Architecture:** Reuse the existing template loader and summary commands. Add guarded custom-template persistence and a focused editor. Build exports from one shared document model and fetch complete transcripts independently of viewport pagination.

**Tech Stack:** Rust/Tauri, TypeScript/React/Next.js, SQLite, Bun, docx and a local PDF renderer.

## Global Constraints

- Preserve original MIT copyright and license notices.
- Keep processing local; export must not require an external service.
- Follow existing Tauri, React, and Tailwind patterns.
- Custom template IDs cannot traverse directories or overwrite built-in templates.
- Export all transcript pages when the transcript is requested.
- Export current unsaved summary content where the editor supports it.
- Do not change upstream main or add billing, authentication, or telemetry.

## Task 1: Templates

Files: `frontend/src-tauri/src/summary/templates/{loader,types,mod,defaults}.rs`, `frontend/src-tauri/src/summary/template_commands.rs`, `frontend/src-tauri/src/lib.rs`, preset JSON files in `frontend/src-tauri/templates/`, `frontend/src/lib/summary-templates.ts`, `frontend/src/components/MeetingDetails/TemplateEditor.tsx`, `frontend/src/components/MeetingDetails/{SummaryGeneratorButtonGroup,SummaryPanel}.tsx`, `frontend/src/hooks/meeting-details/useTemplates.ts`, `frontend/src/app/meeting-details/page-content.tsx`, focused template tests.

Interfaces: `api_get_template(templateId): Template`, `api_save_custom_template(templateId: string | null, templateJson: string): TemplateInfo`, `api_delete_custom_template(templateId): void`. `TemplateInfo` adds `is_custom: bool`. Hook exposes `refreshTemplates(): Promise<void>`. New saves generate `custom_` plus a UUID; updates/deletes accept only safe `custom_` identifiers. Validate at most 64 KiB of JSON and all required trimmed fields before any write. Persist atomically in the existing custom directory with tempfile. Do not let a save overwrite a preset. Provide six embedded starter presets by retaining standard/daily/retrospective and adding client_call/interview/project_planning. Preserve extra bundled and safe manually supplied templates. Editor supports ordered section add/remove/reorder, duplicate, edit, delete, structural preview, busy/error states; successful saves refresh and select the new ID.

- [x] Add meaningful validation and persistence tests before implementation.
- [x] Implement local persistence and register commands.
- [x] Add missing original presets and frontend editor, connect refresh/selection.
- [x] Run focused Bun tests and TypeScript. Run Rust tests if the native environment exists; otherwise record unverified compilation.
- [x] Commit only task files and submit a task review package.

## Task 2: Exports

Files: focused modules in `frontend/src/lib/meeting-export/`, `frontend/src/components/MeetingDetails/ExportMenu.tsx`, `frontend/src/components/MeetingDetails/SummaryPanel.tsx`, required summary fallback helpers, `frontend/src-tauri/src/lib.rs` and `frontend/src-tauri/tauri.conf.json` for native file plugin initialization/save permissions, `frontend/package.json`, `frontend/pnpm-lock.yaml`, export tests.

Interfaces: `buildMeetingDocument({ title, createdAt, summaryMarkdown, transcripts }): MeetingDocument`, `renderMeetingExport(document, format): Promise<Uint8Array>`, `format` is `markdown | pdf | docx`. Keep model and renderers distinct. `ExportMenu` receives meeting metadata, `getSummaryMarkdown(): Promise<string>`, and transcript availability; summary panel obtains editor markdown then falls back to complete legacy summary conversion. It offers three formats and an include-transcript option. Enable export if a summary or transcripts exist; when there is no summary, allow transcript-only export and include the transcript by default. Reject an empty document. When enabled, fetch every transcript page using the existing Tauri pagination API, reject partial/failed retrieval, and include timestamped text. The selector is disabled during generation/export. The dialog plugin is initialized, but the filesystem plugin is currently missing from the builder: initialize it and add narrow dialog:allow-save permission alongside existing filesystem permissions. Use native save dialog and writeFile; cancellation is silent, errors preserve state, filenames are sanitized and have the proper extension. Load renderers dynamically. Add `docx` and a verified compatible local PDF renderer only in this task.

- [x] Add content, pagination, renderer file-signature, filename, and write/cancellation tests before implementation.
- [x] Implement shared model, complete transcript retrieval, local renderers, native save behavior.
- [x] Integrate ExportMenu with current editor content and summary availability.
- [x] Run focused tests, all existing tests, TypeScript, and production build.
- [x] Commit task files and submit a task review package.

## Task 3: Review and delivery

- [x] Resolve task review findings and run a final whole-branch review.
- [x] Update this plan with actual validation and remaining limitations.
- [x] Retain the feature branch and checkout for iteration; share fork and reviewable changes.

## Kickoff baseline

- Fork: https://github.com/Evryday-AI/meetily
- Upstream commit: a2cb62e (v0.4.1).
- Frontend: 45 Bun tests passed; `pnpm exec tsc --noEmit` passed.
- `pnpm lint` prompts for ESLint configuration because upstream has no config; no lint result is claimed.
- Native build: Rust and Visual Studio C++ build tools are unavailable.

## Implementation validation

Tasks 1 and 2 passed separate reviews after correcting the legacy template read limit, saved-editor export state, and empty formatted content checks. The final frontend suite passes 100 tests with 370 assertions. TypeScript and the Next.js production build pass, including all 11 static pages. Rust persistence regressions were initially unexecuted without the native toolchain; the later Windows validation below resolves native compilation and persistence-test verification. Actual save-dialog/write UI smoke testing remains pending.

The final integration review also corrected section formats being omitted from generation instructions. Paragraph, list, and short-text choices now affect the prompt and cache fingerprint while preserving item-format hints. Four focused Rust regressions were added and subsequently passed during the Windows validation below. The focused re-review passed with no remaining Important or Critical findings.

Independent sample inspection confirmed a 15-page PDF with complete transcript content and readable first, continued-table, and last pages. DOCX ZIP/XML inspection confirmed headings, table, and complete content. PDF uses local Helvetica and explicitly rejects unsupported characters; DOCX and Markdown preserve Unicode. Formatting limits are documented in `frontend/src/lib/meeting-export/README.md`.

## Windows installation validation — 2026-10-05

Installed Rust/MSVC, CMake, and libclang, then built the CPU release helper and native application. The first native build identified a dialog plugin minor-version mismatch; the Rust dialog dependency and Cargo lockfile now retain the compatible 2.3 release. The release build and NSIS packaging passed. `cargo test -p meetily --release --lib summary::` passed all 121 selected tests, including custom-template create/update/delete, atomic replacement, rejected writes, legacy oversized reads, format instructions, fingerprints, and cache rejection.

Installed the local build as **Meetly Custom** in `%USERPROFILE%\Apps\Meetly Custom`, with desktop and Start menu shortcuts. The local configuration uses `com.evryday.meetly`, disables upstream updater endpoints/artifacts, and preserves the Windows resource mapping for the verified ONNX DLLs/license. Verified installer exit 0, installed files, shortcut target, a responding native window, and startup loading ONNX Runtime 1.22.0 without errors. First-run model setup remains available in the app; recording/transcription and the native export dialog were not manually exercised in this installation check.



