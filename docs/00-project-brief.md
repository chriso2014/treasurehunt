# Project Brief

## Purpose
A treasure hunt game for a personal team day in Hitchin town centre. It gives teams a fun, competitive activity that moves them around the town, solving location-based questions against the clock.

## Users
| Role | Who | Count |
|------|-----|-------|
| Player / team | Colleagues/friends on the team day, in teams of ~4 | 4–5 teams (~20 people) |
| Organiser (admin) | Chris (game owner) | 1 |

## How the game works (summary)
1. **Registration:** each team enters a team name and password and takes a team photo. One device per team.
2. **Start:** when the game starts, each team receives its first clue to a destination in Hitchin.
3. **At a destination:** the team taps **Reveal question**. Their timer for that question starts.
4. **Answering:** the timer stops when the answer is confirmed correct.
5. **Hints:** if stuck, the team can request a hint, which adds a time penalty to that question.
6. **Next:** after a correct answer, the team gets the next clue.
7. **Map:** teams can view a map marking the locations they have already completed.
8. **Winner:** the team with the **lowest accumulated time** (question times + penalties) wins.

Travel time between locations is **not** counted. Only reveal-to-correct time plus penalties count.

## Success criteria
- Runs reliably on the day on teams' phones with no manual intervention needed
- Times and scores are accurate and trusted (server-side timing)
- The organiser can see progress and the final ranking
- Fun and easy: a team can register and start within a couple of minutes, with no app install

## Constraints
- One-off event, small scale (~20 users), personal project, single developer (built with Claude)
- AWS Pro account: cost is not a constraint, but keep things simple
- Mobile web only, used outdoors (variable signal, sunlight, one hand)
- Event date: TBD
- Personal data (team photos only, no phone numbers): UK GDPR, so minimise and delete after the event

## Out of scope (unless decided otherwise)
- Native mobile apps
- Multiple concurrent events / multi-tenant
- Public sign-up or payments
- Complex user accounts (passwords, profiles)

## Open questions
- Event date
- Look & feel (colours, theme, on-screen name)
