# Requirements

## Team (player) features
| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| T1 | Register team | Enter team name + password, take team photo with camera. Team name unique. Route auto-assigned. Session persists on refresh |
| T1b | Cartoon team photo (optional, ADR-010) | AI cartoon version generated in the background; original kept if it fails; team picks which to use |
| T1a | Sign back in | Team name + password on the same or another device resumes the game |
| T2 | Wait for start | Registered team sees a waiting screen until the GM starts the game |
| T3 | View clue | Current clue (text and/or image) for the team's assigned route |
| T4 | Reveal question | Tap Reveal (available immediately, no location check): question shown, server records start time |
| T5 | Answer multiple choice | Dropdown + submit; wrong: penalty + retry; correct: next clue |
| T6 | Answer free text | Text + submit; lenient matching; wrong: penalty + retry |
| T7 | Submit photo | Camera/upload; "awaiting review" with paused timer; see approve/decline (+ reason) |
| T8 | Video call GM | WhatsApp button opens chat with GM (team starts video call); timer pauses on tap; see result when decided |
| T9 | Request hint | One hint per question; shown after confirming the 5-min penalty |
| T9a | Skip question | Only after the hint is used; available on dropdown, text and photo questions, not the final dance; confirm the 5-min penalty; timer stops; next clue shown |
| T10 | View map | Map of Hitchin with markers for completed locations |
| T11 | See own progress | Live running timer for the current question, running total incl. penalties, stage x of y. No leaderboard |
| T12 | Finish screen | Shown after the final stage, with total time |

## Game master (admin) features
| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| A1 | Secure admin access | Only GM can access admin console |
| A2 | Manage game content | Stages/clues/questions/answers/hints loaded from `content/game.private.json` via `npm run seed`. No editing UI |
| A3 | Start game | Routes auto-assigned alternately at registration (GM can override before start); start game; teams update without manual refresh |
| A4 | Photo review queue | New photo submissions appear in real time; approve/decline with optional reason |
| A5 | Video call decision | Approve/decline a team's final stage |
| A6 | Text answer override | See wrong text attempts; manually accept one |
| A7 | Live leaderboard | Teams, current stage, total time, ranking |
| A8 | Team details | View team name, photo, route |
| A9 | Adjust time | Add or remove time on a team's stage (± ms) with a required note; recorded in the attempt log |
| A10 | Tie-break | Set manual ordering for tied teams |
| A11 | Publish results | Make the results/leaderboard page publicly viewable via a shareable link |

## Non-functional
- Mobile-first web; works on iOS Safari and Android Chrome; no install
- Resilient to poor signal: retries, idempotent submissions, state restored on reload
- Server-authoritative timing
- Real-time updates for GM review queue and team review results (short polling, ADR-007)
- Personal data (team photos) private; deleted after the event
- One device per team (another device can sign in to resume)
- Scale: ~5 concurrent teams + 1 GM
