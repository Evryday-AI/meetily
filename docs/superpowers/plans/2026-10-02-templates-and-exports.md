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

- [ ] Add meaningful validation and persistence tests before implementation.
- [ ] Implement local persistence and register commands.
- [ ] Add missing original presets and frontend editor, connect refresh/selection.
- [ ] Run focused Bun tests and TypeScript. Run Rust tests if the native environment exists; otherwise record unverified compilation.
- [ ] Commit only task files and submit a task review package.

## Task 2: Exports

Files: focused modules in `frontend/src/lib/meeting-export/`, `frontend/src/components/MeetingDetails/ExportMenu.tsx`, `frontend/src/components/MeetingDetails/SummaryPanel.tsx`, required summary fallback helpers, `frontend/src-tauri/src/lib.rs` and `frontend/src-tauri/tauri.conf.json` for native file plugin initialization/save permissions, `frontend/package.json`, `frontend/pnpm-lock.yaml`, export tests.

Interfaces: `buildMeetingDocument({ title, createdAt, summaryMarkdown, transcripts }): MeetingDocument`, `renderMeetingExport(document, format): Promise<Uint8Array>`, `format` is `markdown | pdf | docx`. Keep model and renderers distinct. `ExportMenu` receives meeting metadata, `getSummaryMarkdown(): Promise<string>`, and transcript availability; summary panel obtains editor markdown then falls back to complete legacy summary conversion. It offers three formats and an include-transcript option. When enabled, fetch every transcript page using the existing Tauri pagination API, reject partial/failed retrieval, and include timestamped text. The selector is disabled during generation/export. The dialog plugin is initialized, but the filesystem plugin is currently missing from the builder: initialize it and add narrow dialog:allow-save permission alongside existing filesystem permissions. Use native save dialog and writeFile; cancellation is silent, errors preserve state, filenames are sanitized and have the proper extension. Load renderers dynamically. Add `docx` and a verified compatible local PDF renderer only in this task.

- [ ] Add content, pagination, renderer file-signature, filename, and write/cancellation tests before implementation.
- [ ] Implement shared model, complete transcript retrieval, local renderers, native save behavior.
- [ ] Integrate ExportMenu with current editor content and summary availability.
- [ ] Run focused tests, all existing tests, TypeScript, and production build.
- [ ] Commit task files and submit a task review package.

## Task 3: Review and delivery

- [ ] Resolve task review findings and run a final whole-branch review.
- [ ] Update this plan with actual validation and remaining limitations.
- [ ] Retain the feature branch and checkout for iteration; share fork and reviewable changes.

## Kickoff baseline

- Fork: https://github.com/Evryday-AI/meetily
- Upstream commit: a2cb62e (v0.4.1).
- Frontend: 45 Bun tests passed; `pnpm exec tsc --noEmit` passed.
- `pnpm lint` prompts for ESLint configuration because upstream has no config; no lint result is claimed.
- Native build: Rust and Visual Studio C++ build tools are unavailable.


