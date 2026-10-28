# Domain Model, Game Rules & Glossary

## Glossary
| Term | Meaning |
|------|---------|
| **Game** | The single treasure hunt event. Has a state: `setup` → `registration` → `live` → `finished` |
| **Team** | A group of ~4 players sharing one device. Has display name, login slug, password (in Cognito), photo, route |
| **Route** | An ordered sequence of stages. There are two routes (A and B). Each team is assigned one, staggered so teams are spread out |
| **Stage** | One step of a route: a clue leading to a location, plus the question asked there |
| **Clue** | Text and/or image shown to a team that leads them to the next location |
| **Location** | A real place in Hitchin (name + lat/lng) used for the map of completed stages |
| **Question** | The challenge revealed at a location. Has a `type` (see below) |
| **Reveal** | The team's action that shows the question and **starts the question timer** |
| **Attempt** | One submitted answer (selection, text, photo, or video-call request) |
| **Penalty** | Seconds added to a team's time: wrong answer, declined submission, hint, or skip |
| **Skip** | Giving up on a question after using its hint; adds a skip penalty and moves the team on |
| **Hint** | Optional help for a question; using it adds a penalty |
| **Game master (GM)** | The organiser (Chris). Reviews photo and video submissions in real time |
| **Review** | GM decision on a photo/video submission: `approved` or `declined` |
| **Total time** | Sum over all stages of (active timer time + penalties). Lowest wins |

## Core rules
1. Each team follows its assigned route's stages in order. A team cannot move on until the current question is **correct/approved** or **skipped**.
2. Travel time between locations is **not** counted.
3. The question timer starts at **Reveal** and stops when the answer is confirmed correct or approved.
4. The timer is **paused** while a submission is waiting for GM review (types 3 and 4). GM review speed must never affect a team's score.
5. Every wrong answer or declined submission adds a **penalty**, and the team tries again (except type 4, see below).
6. Each question has **one hint**. It can be requested at any time after Reveal and adds a **hint penalty**.
6a. After using the hint, a team may **skip** the question. This adds a **skip penalty**, stops the timer, and moves them to the next clue. Skip is not available on the final `video_call` stage.
6b. There is **no location check** (no GPS or QR). Reveal is available as soon as the clue is shown. Revealing early is the team's own risk, because the timer is running.
7. After a correct answer the team sees the next clue. The completed location is added to their map.
8. All timing is recorded **server-side**. Client clocks are display only.
9. Teams see a **live running timer** for the current question and their running total. They do **not** see the leaderboard during the game.
10. There is **no cut-off time**. The game ends when every team has finished the final stage.

## Question types

### Type 1: `multiple_choice` (dropdown)
- Team sees: question text (+ optional image) and a dropdown of options.
- Answer: select one option and submit.
- Checking: automatic. Exact match against the correct option ID, done on the server. The correct option is never sent to the client.
- Wrong: wrong-answer penalty added; dropdown stays available; retry.
- Correct: timer stops; next clue shown.

### Type 2: `free_text`
- Team sees: question text (+ optional image) and a text field.
- Answer: type text and submit.
- Checking: automatic, **lenient matching** (see "Text answer matching" below).
- Wrong / correct: same as type 1.

### Type 3: `photo`
- Team sees: question/task text describing what to photograph.
- Answer: take or upload a photo and submit.
- Checking: **manual GM review in real time** against the GM's criteria.
- Timer: **pauses** on submission and stays paused until the GM decides.
  - Approved: question complete; next clue shown.
  - Declined: wrong-answer penalty added; **timer resumes**; team can submit a new photo. The GM can add an optional reason ("whole team must be in shot").
- Team sees an "Awaiting game master review" status while paused.

### Type 4: `video_call` (final stage only)
- Team sees: task description (dance routine) and a **"Call game master on WhatsApp"** button.
- Answer: team calls the GM over WhatsApp and performs live.
- Checking: **manual GM decision** in the admin console.
- Timer: **pauses** when the team taps the WhatsApp button (so waiting for the GM to answer costs nothing) and the game ends when the GM records the decision.
- Note: a web link (`https://wa.me/<GM number>`) opens a WhatsApp chat with the GM. It cannot start a video call directly; the team taps the video-call icon in WhatsApp.
  - Approved: no penalty; team's game **finished**.
  - Declined: penalty added; team's game **finished** anyway (no retry).
- This is always the last stage.

## Text answer matching (type 2)
Each `free_text` question defines one or more `acceptedAnswers`. A submission is correct if, after normalisation, it matches any of them within the allowed tolerance.

Normalisation (applied to both sides):
- lowercase, trim, collapse whitespace
- strip punctuation and accents
- optionally ignore leading articles ("the", "a", "an")
- number words ↔ digits ("seven" = "7") where `numeric: true`

Tolerance (per question, sensible default):
- `maxTypos`: allowed edit distance (Levenshtein). Default `0` for numbers and answers ≤ 3 chars (so "1851" never passes for "1850"), `1` up to 6 chars, `2` for longer
- `contains`: optional. Correct if the submission contains any of the listed keywords as whole words (e.g. "St Mary's" within a longer sentence)
- `numeric`: optional. Correct if the submission's only number (digits like "1,850" or words like "eighteen hundred and fifty") is within `±tolerance`
- Implemented and table-tested in `backend/src/lib/answers.ts`

Safety net:
- All wrong text attempts are visible in the admin console.
- The GM can **manually accept** a rejected text answer. The penalty for that attempt is removed and the timer stops at the original submission time.

## Penalties
All penalties default to **300 seconds (5 minutes)**. The default is configurable globally, and a question can override it.

| Event | Default penalty |
|-------|-----------------|
| Wrong answer (types 1 & 2) | 300 s per wrong attempt |
| Declined photo (type 3) | 300 s per decline |
| Declined video call (type 4) | 300 s (game then ends) |
| Hint used | 300 s |
| Skip (after hint) | 300 s |

## Scoring
```
stageTime(team, stage) = activeTimerSeconds + sum(penalties)
totalTime(team)        = sum of stageTime over all stages
```
Ranking: ascending `totalTime`. Tie-break: decided manually by the GM (on the quality of the final dance routine). The admin console allows setting a tie-break order.

## Stage state machine (per team, per stage)
```
locked → clue_shown → revealed (timer running)
           revealed → awaiting_review (timer paused)   [photo / video_call]
    awaiting_review → revealed (declined; penalty; timer resumes)  [photo]
    awaiting_review → completed (approved or video_call declined)
           revealed → skipped (hint used + skip; penalty)  [not video_call]
           revealed → completed (correct answer)       [multiple_choice / free_text]
```
The timer is recorded as a list of running intervals (start/stop timestamps), so pauses are exact and auditable.

## Routes
- Two routes: **A** and **B**. They visit the **same locations and questions in a different order**, so every team answers the same set and times are comparable.
- Both routes finish with the `video_call` (dance) stage.
- Routes are **assigned automatically, alternating** in registration order (1st team: A, 2nd: B, 3rd: A …). The GM can override before the game starts.

## Results
- The leaderboard is visible to the GM only during the game.
- After all teams finish, the GM **publishes results**. A results page link then becomes viewable and the GM shares it.
