# Reservation Lower-Bound Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each reservation type's initial amount as its lower bound, without changing gift valuation or transaction behavior.

**Architecture:** The reservation view already receives both `initial` and `current_value`. Its presentation will use `initial` in the lower-bound label, while backend daily growth, matching, pledges, and stored gift values remain untouched.

**Tech Stack:** Vanilla JavaScript frontend, Node.js test runner.

## Global Constraints

- Change only reservation-page display copy and its UI regression test.
- Show `下限 {initial}` and preserve the existing upper-bound value.
- Do not alter daily growth, matching, pledge, gift, or database logic.

---

### Task 1: Render the fixed lower bound on reservation cards

**Files:**
- Modify: `packages/backend/test/ui.test.js`
- Modify: `web/app.js`

**Interfaces:**
- Consumes: reservation type objects with integer `initial`, `current_value`, and `cap` properties.
- Produces: reservation cards whose value line is `下限 {initial} · 上限 {cap}`.

- [x] **Step 1: Write the failing test**

Update the reservation UI fixture to use `initial: 300`, `current_value: 450`, and assert the rendered reservation card contains `下限 300 · 上限 600` and does not contain `当前金额 450`.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test packages/backend/test/ui.test.js`

Expected: the reservation display test fails because the current view renders `当前金额 450`.

- [x] **Step 3: Write minimal implementation**

In `reserve()` in `web/app.js`, replace only the displayed value fragment:

```js
<p>下限 ${t.initial} · 上限 ${t.cap}<br>
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test packages/backend/test/ui.test.js`

Expected: all UI tests pass.

- [ ] **Step 5: Commit and deploy**

Run `npm test`, commit the frontend and test changes, then execute `deploy/deploy-production.ps1` to push and deploy.
