# Software Requirements Specification (SRS)

**AI-Assisted Child Development Platform**

| | |
|---|---|
| Course | SENG 383 – Software Project III, Fall 2026 |
| Team | 383-G9 |
| Repository | https://github.com/seng383/seng383-team-project |
| Prepared by | Batın Abiş, Mert Akdemir, Burak Tunahan Mazman |
| Version | 0.1 (draft, Week 4) |
| Status | Draft – to be reviewed with the test and quality team |

### Revision history

| Version | Date | Description | Authors |
|---|---|---|---|
| 0.1 | 25.10.2026 | First draft: user stories and acceptance criteria for M1–M8, roles, constraints and non-functional requirements. | 383-G9 |

---

## 1. Introduction

### 1.1 Purpose

This document describes what our platform has to do in release 1.0. We use it as the basis for the design document, the Jira backlog and the tests. The SENG 440 test and quality team uses the acceptance criteria in Section 3 to write their tests, so every criterion is written to be checkable through the user interface or the API.

### 1.2 Problem and scope

A child's development is followed by several people at once: parents, teachers, psychologists, doctors, special education teachers and coaches. Today each of them keeps separate notes, gives separate tasks and sees only part of the picture.

Our product is a web application that brings them together around one shared weekly schedule, one task list and one record of observations. An AI component summarizes the week's records for each reader according to their role. The AI only supports decisions. Its output is always shown as a suggestion, together with the records it is based on, and a person decides what to do with it.

**In scope (release 1.0):** the eight mandatory requirements M1–M8 in Section 3.

**Optional extensions** (only after M1–M8 pass the test team's tests): monthly views, recurring tasks, edit history, per-document sharing, AI task suggestions, notifications.

**Out of scope:** field-level permissions, email invitations, an admin panel, mobile apps, cloud deployment, microservices and Docker.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| Parent | User who owns a child's data, sees all of the child's records and links specialists to the child. |
| Specialist | Teacher, psychologist, doctor, special education teacher or coach. Works only with the children they are linked to. |
| Child | User who sees only their own tasks and schedule. |
| Linked specialist | A specialist that the parent has linked to a specific child (M2). |
| Record | Any schedule event, task, specialist entry or document that belongs to a child. |
| Specialist entry | A dated observation written by a linked specialist (M5). |
| Development area | Category of a task, used for statistics: Language, Motor skills, Social-emotional, Cognitive, Self-care. |
| Week | Monday 00:00 to Sunday 23:59, local time. |
| Mock mode | Setting in which the AI module returns a fixed, predictable response instead of calling the AI provider. Used in tests and CI. |

### 1.4 References

1. SENG 383 Term Project Assignment: AI-Assisted Child Development Platform, Fall 2026.
2. Term Project – Student Guide (WebOnline).
3. Project Management Plan: `docs/PMP.md` in this repository.

---

## 2. Overall description

### 2.1 Product perspective

The product is a new, self-contained web application. It runs on the developer's or tester's own computer by following the README; there is no cloud deployment. It has three layers:

- **Frontend:** React (Vite) single-page application.
- **Backend:** Node.js + Express REST API with JWT authentication.
- **Database:** SQLite, filled with synthetic data by a seed script.

The only external service is the AI provider, **GitHub Models**, which the backend calls through one AI module. In tests and CI the module runs in mock mode, so no network access or API key is needed there.

### 2.2 User roles and access rules

The role comes from the user's account; the user does not choose it at login.

| What | Parent | Linked specialist | Unlinked specialist | Child |
|---|---|---|---|---|
| Child's weekly schedule | View, add | View, add | No access | View own |
| Child's tasks | View, assign | View, assign | No access | View own, mark done |
| Specialist entries | View | View, add, edit own | No access | No access |
| Documents | View, upload, download | View, upload, download | No access | No access |
| Weekly statistics | View | View | No access | No access |
| AI weekly summary | View (parent version) | View (specialist version) | No access | No access |
| Link / unlink specialists | Yes | No | No | No |

These rules are enforced by the backend for every request. Hiding a button in the user interface is not enough.

### 2.3 Constraints

| ID | Constraint |
|---|---|
| C-1 | Technology: React (Vite), Node.js + Express, SQLite, JWT authentication. |
| C-2 | Tests: Jest + Supertest (backend), Vitest (frontend), Playwright (end-to-end). CI with GitHub Actions. Work tracking in Jira. |
| C-3 | AI: GitHub Models, accessed only through a single backend module that has a mandatory mock mode for tests and CI. |
| C-4 | Data: only synthetic data created by the seed script. No real personal data at any stage. |
| C-5 | Safety: the AI never makes decisions, never suggests a diagnosis or treatment, and receives only data the reader is allowed to see. |
| C-6 | Running: the application runs locally by following the README. No cloud deployment, no Docker. |

### 2.4 Assumptions and dependencies

- A-1: User accounts (parents, children, specialists) are created by the seed script. A sign-up screen is not part of release 1.0. *(To confirm with the test team.)*
- A-2: Each child has exactly one parent account in release 1.0. A parent can have more than one child.
- A-3: A GitHub account with access to GitHub Models is available for the live AI mode. Its token is kept in a local `.env` file and never committed.
- A-4: The interface text is in Turkish, as in the example screens of the assignment. This document is in English.

---

## 3. Functional requirements

Each requirement below is written as one or more user stories with acceptance criteria (AC) in *Given / When / Then* form. "The API rejects the request" means it responds with an error status (401 when not logged in, 403 when not allowed) and returns no data about the child.

All eight requirements are mandatory. The release column follows the assignment: M1–M4 in v0.1, M5–M8 in v0.2.

### M1 – Login and roles (v0.1)

**US-1.1** As a registered user, I want to log in with my email and password so that I can reach the screens for my role.

- AC1. Given a seeded account and the correct password, when the user logs in, then they are taken to the start screen of their role (parent dashboard, specialist's children list, or the child's task screen).
- AC2. Given a wrong password or an unknown email, when the user tries to log in, then an error message is shown and no session is created. The message does not say which of the two was wrong.
- AC3. Given a logged-in user, when they log out, then protected pages and API endpoints can no longer be used without logging in again.

**US-1.2** As any user, I want to see only the screens of my own role so that I do not reach data that is not meant for me.

- AC1. Given a child account, when the child opens a parent or specialist page by typing its URL, then access is denied.
- AC2. Given any role, when a request is sent to an API endpoint of another role, then the API rejects it.
- AC3. Given no valid token, when any protected API endpoint is called, then the API rejects it with 401.

### M2 – Linking specialists (v0.1)

**US-2.1** As a parent, I want to link a registered specialist to my child by email so that they can work with my child's records.

- AC1. Given the email of a registered specialist, when the parent links them to the child, then the specialist appears in the child's list of linked specialists with name and type.
- AC2. Given an email that does not belong to a registered specialist, when the parent tries to link it, then an error message is shown and nothing is linked.
- AC3. Given a specialist who is already linked, when the parent links the same email again, then no duplicate is created.

**US-2.2** As a parent, I want to unlink a specialist so that they no longer see my child's data.

- AC1. Given a linked specialist, when the parent unlinks them and confirms, then the specialist is removed from the list.
- AC2. Given an unlinked specialist, when they send any request about the child (schedule, tasks, entries, documents, statistics, AI summary), then the API rejects it.

**US-2.3** As a specialist, I want to see the list of children I am linked to so that I can open their profiles.

- AC1. Given a specialist linked to two children, when they open their start screen, then exactly those two children are listed.

### M3 – Weekly schedule (v0.1)

**US-3.1** As a parent or linked specialist, I want to add an event to the child's schedule so that everyone involved sees the same plan.

- AC1. Given a parent or linked specialist, when they add an event with title, date, start time and end time, then it appears in the weekly view of that week.
- AC2. Given an event whose end time is before its start time, or a missing title or date, when it is saved, then an error is shown and the event is not created.

**US-3.2** As a parent, linked specialist or child, I want to see the events of a selected week so that I know what is planned.

- AC1. Given events in several weeks, when a week is selected, then only the events of that week are listed, ordered by day and time.
- AC2. Given a child account, when the child opens the schedule, then only their own events are shown and there is no option to add events.

### M4 – Tasks (v0.1)

**US-4.1** As a parent or linked specialist, I want to assign a task to the child so that the child knows what to do.

- AC1. Given a parent or linked specialist, when they create a task with title, description, development area and due date, then the task appears in the child's task list with status "not done".
- AC2. Given a missing title, development area or due date, when the task is saved, then an error is shown and the task is not created.

**US-4.2** As a child, I want to mark a task as done so that the adults can see my progress.

- AC1. Given a task assigned to the child, when the child marks it done, then its status changes to "done".
- AC2. Given a task of another child, when a child tries to change it through the API, then the API rejects it.

**US-4.3** As the person who assigned a task, I want to see its status so that I can follow up.

- AC1. Given tasks assigned by a user, when that user opens their task list, then each task shows its current status ("done" / "not done").

### M5 – Specialist entries (v0.2)

**US-5.1** As a linked specialist, I want to add a dated observation about the child so that the child's development is recorded over time.

- AC1. Given a linked specialist, when they save an entry with a date and text, then the entry appears in the child's entries with the author's name and the date.
- AC2. Given an empty text, when the entry is saved, then an error is shown and nothing is saved.

**US-5.2** As the specialist who wrote an entry, I want to edit it so that I can correct mistakes.

- AC1. Given an entry written by the specialist, when they edit and save it, then the new text is shown and the entry is marked "edited".
- AC2. Given an entry written by another specialist, when a specialist tries to edit it, then the API rejects it.

**US-5.3** As a parent or linked specialist, I want to read all entries about the child.

- AC1. Given entries written by two different specialists, when the parent or a linked specialist opens the entries, then both are listed, newest first.
- AC2. Given a child account, when entries are requested through the user interface or the API, then access is denied.

### M6 – Documents (v0.2)

**US-6.1** As a parent or linked specialist, I want to upload a PDF or image so that important documents are kept in one place.

- AC1. Given a PDF, JPEG or PNG file of at most 10 MB, when it is uploaded, then it appears in the document list with name, type, uploader and upload date.
- AC2. Given a file of another type or larger than 10 MB, when it is uploaded, then an error is shown and the file is not stored.

**US-6.2** As a parent or linked specialist, I want to view and download the child's documents.

- AC1. Given a listed document, when the user selects it, then it can be viewed in the browser and downloaded with its original name.
- AC2. Given a child account or an unlinked specialist, when the document list or a document file is requested, then access is denied.

### M7 – Weekly statistics (v0.2)

**US-7.1** As a parent or linked specialist, I want to see how many of the child's tasks were completed in a selected week so that I can follow progress.

- AC1. Given tasks due in the selected week, when the statistics are opened, then the completion rate is shown as done tasks / all tasks of that week, as a percentage.
- AC2. Given tasks in several development areas, when the statistics are opened, then a separate completion rate is shown for each area that has tasks in that week.
- AC3. Given a week without tasks, when it is selected, then the screen says there are no tasks instead of showing 0 %.

### M8 – Role-based AI summary (v0.2)

**US-8.1** As a parent, I want a short AI summary of my child's week so that I get an overview without reading every record.

**US-8.2** As a linked specialist, I want an AI summary of the child's week written for a specialist so that I can prepare for my next session.

Acceptance criteria for US-8.1 and US-8.2:

- AC1. Given the week's records, when the summary is requested, then the backend builds the prompt only from records that the reader is allowed to see (Section 2.2), and uses a different prompt for parents and for specialists.
- AC2. Given a generated summary, when it is shown, then it carries the label "AI-generated" and lists the records it is based on, each with a link to the record.
- AC3. Given any summary, then it contains no diagnosis, no treatment advice and no decision on behalf of the user. The screen states that the summary is a suggestion and the user decides.
- AC4. Given a week without records, when the summary is requested, then the system says there is nothing to summarize and does not call the AI provider.
- AC5. Given that the AI provider is unreachable or returns an error, when the summary is requested, then a clear message is shown and the rest of the page keeps working.
- AC6. Given mock mode is on (tests and CI), when the summary is requested, then the AI module returns the same fixed response every time and makes no network call.

**US-8.3** As a parent or specialist, I want to mark a summary as helpful or incorrect so that the team can see how useful the summaries are. *(Shown in example screen A.2; to confirm with the test team whether it is part of the mandatory scope.)*

- AC1. Given a shown summary, when the user selects "helpful" or "incorrect", then the choice is saved for that summary and shown as selected.

---

## 4. Non-functional requirements

| ID | Requirement | How we check it |
|---|---|---|
| NFR-1 | Passwords are stored only as bcrypt hashes, never as plain text. | Inspect the database after seeding. |
| NFR-2 | Every protected endpoint checks the token, the role and, for child data, the parent/link relation. | API tests for each endpoint with parent, linked specialist, unlinked specialist and child accounts. |
| NFR-3 | The AI module sends the provider only the records the reader may see, and nothing else (no emails, no passwords). | Unit test of the prompt builder in mock mode. |
| NFR-4 | Secrets (JWT secret, GitHub token) are read from `.env` and are not in the repository. | Code review; `.env` is in `.gitignore`, `.env.example` is committed. |
| NFR-5 | A new team member can install, seed and start the application by following the README on Windows, macOS or Linux with Node.js 22 or newer. | The test team installs from the README before each release. |
| NFR-6 | With the seed data, pages load in under 2 seconds on a normal laptop. An AI summary in live mode shows a loading state and appears within 15 seconds, or an error message. | Manual check during demos; Playwright timing for the main pages. |
| NFR-7 | Branch coverage is at least 40 % at v0.2 and at least 60 % at v1.0. | Coverage report in CI. |
| NFR-8 | CI runs the backend, frontend and end-to-end tests on every pull request; a pull request is merged only after review and passing CI. | GitHub Actions and pull request history. |
| NFR-9 | Only synthetic data is used. The seed script creates all users and records. | Code review of the seed script. |

---

## 5. Data requirements (draft)

The final data model will be in the design document (Week 6). The main entities are:

- **User:** id, name, email, password hash, role (parent, specialist, child), specialist type (for specialists).
- **Child profile:** link between a child user and their parent.
- **Specialist link:** child, specialist, link date.
- **Event:** child, title, date, start time, end time, created by.
- **Task:** child, title, description, development area, due date, status, assigned by, completed at.
- **Specialist entry:** child, author, date, text, created at, edited flag / edited at.
- **Document:** child, original file name, type, size, stored path, uploaded by, upload date.
- **AI summary:** child, week, reader role, text, source record ids, created at, feedback.

---

## 6. Release plan and traceability

| Req. | User stories | Release | Planned end-to-end test |
|---|---|---|---|
| M1 | US-1.1, US-1.2 | v0.1 | Each role logs in and lands on its own start screen; child cannot open a parent page. |
| M2 | US-2.1 – US-2.3 | v0.1 | Parent links and unlinks a specialist; unlinked specialist gets an error. |
| M3 | US-3.1, US-3.2 | v0.1 | Specialist adds an event; parent and child see it in the weekly view. |
| M4 | US-4.1 – US-4.3 | v0.1 | Parent assigns a task; child marks it done; parent sees "done". |
| M5 | US-5.1 – US-5.3 | v0.2 | Specialist adds and edits an entry; entry shows "edited"; child cannot see it. |
| M6 | US-6.1, US-6.2 | v0.2 | Parent uploads a PDF; specialist downloads it; child cannot see the list. |
| M7 | US-7.1 | v0.2 | Completion rate for a seeded week matches the expected value, in total and by area. |
| M8 | US-8.1 – US-8.3 | v0.2 | Parent and specialist get different mock summaries, labelled "AI-generated" with source links. |

| Milestone | Week | Content |
|---|---|---|
| Walking skeleton (v0.0) | 5 | Frontend, backend and database connected end to end; CI running. |
| Release v0.1 | 8 | M1–M4; first end-to-end test running in CI. |
| Release v0.2 | 10 | M1–M8; branch coverage ≥ 40 %; end-to-end tests for 3 critical flows. |
| Release v1.0 | 12 | Final version; branch coverage ≥ 60 %; an end-to-end test for each of M1–M8. |

---

## 7. Open questions for the test and quality team

1. Is a sign-up screen expected, or are seeded accounts enough (A-1)?
2. Is the helpful/incorrect feedback on AI summaries (US-8.3) part of the mandatory scope?
3. Are the five development areas in Section 1.3 enough for the statistics in M7?
4. Is the 10 MB upload limit (US-6.1) acceptable for the documents you plan to test with?
5. Which three flows should be the "critical flows" for the v0.2 end-to-end tests? Our proposal: login by role (M1), task assign and complete (M4), and the unlinked specialist being blocked (M2).
