# Next In Line — Hiring Pipeline That Moves Itself

## 📌 Challenge Context

Small engineering teams often rely on spreadsheets to manage hiring pipelines. This leads to:

* loss of visibility into applicant states
* manual tracking of waitlisted candidates
* delays in follow-ups
* no structured flow of progression

The goal of this system is to replace that with a **deterministic, self-moving pipeline** where applicants automatically progress based on system rules.

---

## 💡 Solution Overview

This system enforces a **capacity-constrained pipeline**:

* A fixed number of applicants can be actively reviewed
* Additional applicants are placed into a waitlist
* When a slot opens, promotion happens automatically
* No manual intervention is required

---

## 🧠 Core Model
```text
            ┌────────────┐
            │  APPLIED   │
            └─────┬──────┘
                  │
        ┌─────────┴─────────┐
        │                   │
   (capacity free)     (capacity full)
        │                   │
   ┌────▼────┐         ┌────▼────┐
   │  ACTIVE │         │ WAITLIST│
   └────┬────┘         └────┬────┘
        │                   │
   (exit / decay)      (promotion)
        │                   │
   ┌────▼────┐         ┌────▼────┐
   │ EXITED  │◄────────┤ ACTIVE  │
   └─────────┘         └─────────┘
```

---

## ⚙️ Key Features

### 1. Capacity-Based Control

Each job defines an `activeCapacity`.

* If space exists → applicant becomes `ACTIVE`
* Otherwise → enters `WAITLIST`

---

### 2. Deterministic Queue Ordering

Waitlist is ordered using:

* `waitlist_eligible_at`
* `queue_token`
* `id` (tie-breaker)

This guarantees:

* consistent ordering
* fairness
* deterministic behavior

---

### 3. Automatic Promotion

When an active applicant exits:

```text
ACTIVE → EXITED → next WAITLIST → ACTIVE
```

Handled by:

```text
fillVacancies()
```

---

### 4. Exit Behavior

Exit is treated as a **terminal state**:

* Applicant is removed from pipeline
* Not reinserted into queue

This avoids:

* reordering exploits
* infinite loops
* inconsistent queue state

---

### 5. Applicant Visibility

Applicants can view:

* current status
* queue position
* acknowledgement state

---

## 🔐 Concurrency Handling

When multiple applications target the last available slot:

```text
Request A → locks row
Request B → waits
```

Implemented using:

```sql
SELECT ... FOR UPDATE
```

This ensures:

* no over-allocation
* strict consistency
* safe concurrent writes

---

## 🧾 Audit Logging

Every transition is recorded.

```text
APPLIED → WAITLIST
WAITLIST → ACTIVE
ACTIVE → EXITED
ACTIVE → WAITLIST (decay)
```

Each log includes:

* previous state
* next state
* timestamp
* metadata

This allows full reconstruction of system history.

---

## ⏳ Inactivity Decay

When promoted:

```text
ACTIVE + PENDING ACK
```

If not acknowledged within deadline:

```text
ACTIVE → WAITLIST (penalty)
next WAITLIST → ACTIVE
```

---

### Flow

```text
WAITLIST → ACTIVE → (no ack) → WAITLIST (penalty)
                          ↓
                     next promoted
```

---

## 🌐 API Overview

### Jobs

* `POST /jobs`

### Applications

* `POST /jobs/:jobId/applications`
* `GET /applications/:id/status`
* `POST /applications/:id/acknowledge`
* `POST /applications/:id/exit`

---

## 🖥️ Frontend

Minimal by design:

* Recruiter Dashboard

  * Create job
  * View pipeline

* Applicant Portal

  * Apply
  * Check status
  * Withdraw

Focus is on **state clarity, not UI complexity**.

---

## ⚙️ Tech Stack

* PostgreSQL
* Express.js
* Node.js
* React

No external queueing systems used.

---

## 🧠 Design Decisions

### No external queue

All ordering and promotion logic is handled internally for full control.

---

### Transactions

Used to maintain correctness under concurrent operations.

---

### Terminal exit

Ensures fairness and avoids reordering complexity.

---

### Minimal frontend

System is backend-driven; UI is only for interaction and visibility.

---

## 🔄 Improvements (Future Work)

* Full pipeline view for recruiter (all applicants per job)
* Better UI for acknowledgement handling
* Pagination for large datasets
* Metrics (conversion, drop-offs)

---

## 🧪 Running Locally

```bash
# Backend
npm install
node src/app.js

# Frontend
cd frontend
npm install
npm run dev
```
## 📸 Screenshots

### Recruiter Dashboard
![Recruiter](./screenshots/recruiter.png)

---

### Applicant Applying

![Apply Step 1](./screenshots/apply1.png)
![Apply Step 2](./screenshots/apply2.png)

---

### Queue Behavior
![Queue](./screenshots/queue.png)

---

### Promotion & Acknowledgement

![Promotion](./screenshots/promotion2.png)
![Acknowledgement](./screenshots/promotion1.png)