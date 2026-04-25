# RPE and Session-to-Session Load Progression

## What RPE actually means
**Rate of Perceived Exertion** (RPE) on the Tuchscherer scale is a
self-rating of how many reps the lifter could have done with that
weight. RPE 10 = could not have done another rep. RPE 9 = one in the
tank. RPE 8 = two in the tank. RPE 7 = three. Below RPE 7 the rating
becomes too noisy to be useful for autoregulation.

The scale is *not* "how hard did this feel" — that's an effort scale. RPE
asks specifically about reps in reserve, which lifters can self-report
with reasonable consistency (within ~0.5 RPE) once they've practiced it
for a few weeks.

## How RPE drives the next session's prescription

The agent's `recommend_load` tool should treat the most recent set as
the primary signal:

| Last set | What to do next session |
|---|---|
| RPE ≤ 7, form clean | +5 lb (lower body) or +2.5 lb (upper body) |
| RPE 8, form clean | Repeat the same weight, focus on form |
| RPE 9, form clean | Repeat the same weight |
| RPE 10 with grinder reps | Hold or back off 5–10 lb |
| Form broke down (rules-engine flagged repeated risk events) | Back off 10 lb regardless of RPE |
| Pain (lifter-reported) | Back off ≥20 lb and route to a recovery cue |

These are starter heuristics, not gospel. They assume linear progression
on a beginner / early-intermediate program. For more advanced lifters
weekly auto-regulation around an RPE target (e.g. "work up to a top
single at RPE 8, then 3 backoff sets at RPE 7") replaces fixed
increments.

## Why form trumps RPE
A clean RPE 7 set is a stronger progression signal than a heroic RPE 10
that breaks form. The rules engine is the source of truth for "form
broke down." If the agent sees repeated risk events on the most recent
set, the next-session target should hold or back off **even if** the
lifter rated the set low. The narrative for the lifter ("we held weight
this week because your right knee caved on 2 of the last 3 reps") is in
the post-set summary; the numeric prescription is in `recommend_load`.

## When to skip the increment
Do not progress weight if any of the following are true:

- The lifter is starting a new training block (deload or test week).
- Sleep / nutrition / stress is self-reported as significantly off.
- A safety-flagged event (LUMBAR_FLEXION on deadlift, ELBOW_FLARE with
  pain on bench, severe KNEE_CAVE under load) appeared in the last
  session.
- The lifter has missed more than ~5 days of training. Repeat last
  successful session before adding load.

When in doubt, hold weight. Lost time from injury is always worse than a
slow progression.

## Source notes
RPE scale and reps-in-reserve definitions: Mike Tuchscherer's *Reactive
Training Manual* and Greg Nuckols's writeups at *Stronger by Science*.
Increment rules: Mark Rippetoe's *Starting Strength* (linear
progression). Autoregulation around RPE targets: Eric Helms's *The
Muscle and Strength Pyramids — Training*. No specific page numbers
fabricated.
