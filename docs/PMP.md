# Project Management Plan (PMP)

> The purpose of this PMP is to practice planning and tracking work in Jira. Keep it short: most of the content is a summary of what you set up in Jira.
> Keep this file at `docs/PMP.md`. Each section is one Jira epic (PMP-1 … PMP-6); mark the epic Done when the section is complete.
> Save screenshots in `docs/img/`.

| Section | Content | Required by |
|---|---|---|
| PMP-1 | Project, Jira setup, team and roles | Week 6 |
| PMP-2 | Work packages (epics) and sprint plan | Week 6 |
| PMP-3 | Progress review: mid-term (v0.1) | Mid-term evaluation (Week 8 / 9) |
| PMP-4 | Progress review: v0.2 | Week 10 |
| PMP-5 | Progress review: final (v1.0) | Final evaluation |
| PMP-6 | Retrospective | Final evaluation |

---

## PMP-1. Project and Team

### Project and Jira Setup

**Project in one sentence:**  
A web-based, AI-assisted child development platform that enables parents, specialists, and children to manage shared schedules, tasks, and development records, with role-based AI summaries to support human decisions.

**Jira project key:** TF383  
**Jira board link:** https://batinabis.atlassian.net/jira/software/projects/TF383/boards/2/backlog  

### Team and Roles

| Name | Jira / GitHub username | Role |
|---|---|---|
| Batin Abis | GitHub: `bbatinn`; Jira: Batin |Full-Stack Developer  |
| Mert Akdemir | GitHub: `akdemirmert`; Jira: Mert Akdemir |Full-Stack Developer  |
| Burak Tunahan Mazman | GitHub:`buraktnhn1` Jira: Burak Tunahan Mazman |Full-Stack Developer |

---

## PMP-2. Plan

### Work Packages (Epics)

> One row per Jira epic. Number of tasks = how many tasks you created under that epic.

In Jira each work package is one epic: PMP-1 … PMP-6 (TF383-1 … TF383-6), M1 … M8 (TF383-7 … TF383-14), and the two extra epics the workflow guide allows, SRS (TF383-55) and DESIGN (TF383-56). Every task belongs to one epic and has one assignee. The M1–M8 tasks cover the functional requirements in `docs/SRS.md` (FR-M1-01 … FR-M8-09).

| Epic | Owner | Number of tasks | Planned sprint(s) |
|---|---|---|---|
| PMP-1 – Project, Jira setup, team and roles (TF383-1) | Batın Abiş | 4 | Sprint 1 |
| PMP-2 – Work packages (epics) and sprint plan (TF383-2) | Mert Akdemir | 2 | Sprint 1 |
| PMP-3 – Progress review: mid-term (v0.1) (TF383-3) | Batın Abiş | 1 | Sprint 2 |
| PMP-4 – Progress review: v0.2 (TF383-4) | Mert Akdemir | 1 | Sprint 4 |
| PMP-5 – Progress review: final (v1.0) (TF383-5) | Batın Abiş | 3 | Sprints 5–6 |
| PMP-6 – Retrospective (TF383-6) | Batın Abiş | 1 | Sprint 5 |
| SRS – Software requirements specification (TF383-55) | Mert Akdemir | 2 | Sprints 1–2 |
| DESIGN – Design document and walking skeleton (TF383-56) | Mert Akdemir | 2 | Sprints 1–2 |
| M1 – Login and roles (TF383-7) | Mert Akdemir | 2 | Sprint 2 |
| M2 – Linking specialists (TF383-8) | Mert Akdemir | 3 | Sprint 2 |
| M3 – Weekly schedule (TF383-9) | Batın Abiş | 2 | Sprint 2 |
| M4 – Tasks (TF383-10) | Mert Akdemir | 3 | Sprint 3 |
| M5 – Specialist entries (TF383-11) | Batın Abiş | 3 | Sprint 4 |
| M6 – Documents (TF383-12) | Batın Abiş | 2 | Sprint 2 |
| M7 – Weekly statistics (TF383-13) | Batın Abiş | 1 | Sprint 4 |
| M8 – Role-based AI summary (TF383-14) | Mert Akdemir | 2 | Sprint 4 |

### Sprint Plan

> One row per Jira sprint. Align sprints with the weekly schedule.

| Sprint | Weeks | Sprint goal | Ends with |
|---|---|---|---|
| Sprint 1 | 4–5 | SRS draft, PMP sections 1–2, walking skeleton | Walking skeleton (v0.0), Week 5 |
| Sprint 2 | 6–7 | Final SRS and design document, PMP section 3, M1, M2, M3 and M6 | PMP section 3, Week 7 |
| Sprint 3 | 8 | M4 and the first E2E test in CI | Release v0.1, mid-term (Week 8) |
| Sprint 4 | 9–10 | PMP section 4, M5, M7 and M8, branch coverage ≥ 40 %, E2E tests for 3 critical flows | Release v0.2, Week 10 |
| Sprint 5 | 11–12 | PMP sections 5–6, branch coverage ≥ 60 %, an E2E test for each of M1–M8, final report | Release v1.0, Week 12 |
| Sprint 6 | 13 | Presentation and live demo | Final presentation, Week 13 |

### Tasks per Sprint

Who does what in each sprint, as assigned in Jira on 31 October 2026.

| Sprint | Mert Akdemir | Batın Abiş |
|---|---|---|
| Sprint 1 | PMP-1 section (TF383-18), PMP-2 (TF383-35, TF383-36), SRS draft (TF383-19), walking skeleton v0.0 (TF383-22) | Jira project, GitHub connection, team and roles (TF383-15 … TF383-17), SRS review with the test team (TF383-21) |
| Sprint 2 | M1 (TF383-37, TF383-38), M2 (TF383-39 … TF383-41), final SRS (TF383-29), design document (TF383-31) | M3 (TF383-42, TF383-43), M6 (TF383-50, TF383-51), PMP-3 (TF383-57) |
| Sprint 3 | M4 (TF383-44, TF383-45) | M4 (TF383-46) |
| Sprint 4 | M8 (TF383-53, TF383-54), PMP-4 (TF383-58) | M5 (TF383-47 … TF383-49), M7 (TF383-52) |
| Sprint 5 | v1.0 release (TF383-32) | PMP-5 (TF383-59), PMP-6 (TF383-60), final report (TF383-33) |
| Sprint 6 | – | Presentation and live demo (TF383-34) |

---

## PMP-3. Progress Review: Mid-term (v0.1)

**Jira board screenshot:**  

| Epic | Planned for this point | Status (Done / In progress / Not started) |
|---|---|---|
| | | |
| | | |

**Changes to the plan (if any):**

---

## PMP-4. Progress Review: v0.2

**Jira board screenshot:**  

| Epic | Planned for this point | Status (Done / In progress / Not started) |
|---|---|---|
| | | |
| | | |

**Changes to the plan (if any):**

---

## PMP-5. Progress Review: Final (v1.0)

**Jira board screenshot:**  

| Epic | Planned for this point | Status (Done / In progress / Not started) |
|---|---|---|
| | | |
| | | |

**Changes to the plan (if any):**

---

## PMP-6. Retrospective

- What worked well in using Jira:
- What we would do differently:
