# The Henderson Learning Lab: Cole and Lily

Parent documents for the home learning program that runs from the app's Learn tab. Written Oct 11, 2026 for Peter and Nicole. Week 1 is Monday, Oct 12, 2026. The program design behind these pages is final; where a page and the app disagree, the design wins and the app catches up.

## What this is, in eight lines

1. Thirty minutes a school night per child: 12 math, 12 reading, 6 brain. One 105-minute weekend set: 30 / 30 / 45.
2. One adult runs both children from the Tonight page in 6-minute turns. Nobody teaches two kids at once.
3. Cole and Lily are placed by what they can already do, not by age. A skill is finished when it is mastered, not when the page ends.
4. The app teaches with a Learn-it card and logs every attempt, hint and minute. The adult's admin is one checkbox and an optional note.
5. The floor is five stars a week. Nothing is ever carried over, and nothing starts after 8:30.
6. Rewards are tiny, for effort only, never for scores, never cash, never a screen.
7. Evidence by New Jersey standard code builds into a printable pack for conversations with Lincroft.
8. It copies what is verified about Alpha School and drops the rest. Nobody promises "2x".

## One-page summary

**What it is.** Thirty minutes a school night per child (12 math / 12 reading / 6 brain) and one 105-minute weekend morning set (30 / 30 / 45), run by one adult from the Tonight page. Placement is by test-out rather than age, and mastery decides when a child moves on. The app gives the Learn-it card and the items; the adult touches each child three times a night: the first worked example, the first completion problem, and the check after the attempt.

**The floor: five stars a week.** One star per closed school night, one per weekend set. Five stars close the ring: 4 nights + 1 set on a normal week, or 3 nights + 2 sets on a heavy sports week. Four stars by Thursday means **Friday Free**. The second weekend day is free once the ring is closed. Missed nights vanish. The arithmetic leaves about 45% slack for both children, so the floor is enough.

**Targets.** Cole: nine Grade 3 gate skills verified by Nov 6; multiplication facts automatic before the district's Jan 11-15 check [C]; Grade 4 major clusters mastered by May 21, 2027; Grade 5 begun by Oct 2027; fall-2027 i-Ready reading 574 or higher [C]. His grade-2 CogAT score is the decisive unknown. The "101" in the family's notes is an earlier routine's summary, not the score report [F, unverified]; his reading and math rows count on the district matrix only if that score is 120 or higher [C]. So the Genesis report and Email 1 come first. Lily: Grade 1 exit by Jan 22, 2027, including the nine counting components [C] and within-10 facts before the Jan 4-8 check [C]; Grade 2 core by Aug 2027; fall-2027 i-Ready reading 498 or higher and mCLASS math 409 or higher [C]; the grade-2 CogAT is projected for Nov 9-11, 2027 [P], approached through play all year and 4-6 weeks of format familiarity.

**Motivation.** Lightning Bucks for Cole (a baseball ladder) and Sparkle Points for Lily (a ballet ladder, a named pony per mastered skill). Points for inputs only, capped at $4 of store value a week, some of it unexpected. A zero-cost time-back line every night: "Done by 7:45 = catch in the yard" / "dance party before bath." A 5-minute showcase for Grandpa once a month. Never for scores, never cash, never a screen, never a comparison.

**Cost.** Nothing to start. Year one is about $300-330.

**Tag key.** Every district-specific fact carries a tag the first time it appears in a document: [C] confirmed against the primary source · [P] partially confirmed, stated in corrected form · [R] reported with a cited source, not fact-checked · [U] unverifiable or unpublished · [I] inference · [F] family record. Anything [U] or [F, unverified] comes with the question to ask the school.

## The documents

| File | What it is for | Read it when |
|---|---|---|
| [00-program-guide.md](00-program-guide.md) | The program: principles, what we copy from Alpha and what we do not, the nightly protocol, the floor, mastery and review rules in parent words, the thermostat, rewards, the parent playbook, risks, what changed | Before Week 1, then whenever something feels off |
| [01-cole-plan.md](01-cole-plan.md) | Cole's twelve months: math, reading and writing, reasoning, dates and checkpoints | Sunday reviews; before any school meeting about Cole |
| [02-lily-plan.md](02-lily-plan.md) | Lily's twelve months: counting, facts, OG reading, Grade 2 on probes, the Counting Interview record | Sunday reviews; before Email 2 and the January retake |
| [03-gt-roadmap-middletown.md](03-gt-roadmap-middletown.md) | The district matrix, the CogAT, dates through middle school, what is published and what is not | Before Emails 1, 3 and 5; every August |
| [04-weekly-rhythm-and-templates.md](04-weekly-rhythm-and-templates.md) | A typical week around sports, the Sunday 5-minute review, printable cards, probe sheets, the workshop menu | Print once; tape the launch card to the fridge |
| [05-materials-and-tools.md](05-materials-and-tools.md) | What we own and how it is used, free tools, the small buy list, what not to buy, what the app replaces, the CogAT familiarity plan | Before buying anything |
| [06-questions-for-school.md](06-questions-for-school.md) | The five emails, ready to send, and the open questions behind them | This week |
| [07-app-guide.md](07-app-guide.md) | How the Learn tab works: Tonight, Mission Control, the player, Parent view, the report, settings | Before the first night; when a screen surprises you |

## Start this week (Oct 12-16, 2026)

- [ ] **Mon-Fri, placement sprint.** About 10 minutes per subject per child, inside the normal 30. Open `/learn/cole/play?mode=placement&subject=math` (then `reading`, `reasoning`; for Lily `phonics` as well), one subject per night. Five-item test-outs climb the skill order until two fail in a row. Lily's items are read aloud to her; nobody says the word "test".
- [ ] **Peter, 10 minutes, before any email.** Genesis Parent Portal → Documents [C]: download Cole's Nov 2025 CogAT report and the Sept 25 fall reports. Check the "101" [F, unverified] against the real report.
- [ ] **Send Email 1** to Dr. John Kerrigan, Director of Curriculum and Instruction [C], cc Principal Brian Dorgan [R]: Cole's CogAT score and the recalculation request. Text in 06-questions-for-school.md.
- [ ] **Send Email 2** to Mrs. Susan Alexander [F], cc Dr. Danielle Seibert [C]: Lily's Counting Interview "0" and K-1 enrichment. Attach the nine-component home record (a Together card in the app).
- [ ] **Register Noetic At-Home by Oct 22 ($29) [R]** if Cole wants a first low-stakes contest. Not required.
- [ ] **App setup.** Apply the two Supabase migrations, `supabase/migrations/007_learn.sql` and `008_learn_notes.sql` (both are safe to re-run), then set `ANTHROPIC_API_KEY` so the Coach is on. The Parent view says "The AI coach is off" until the key is set.
- [ ] **Parent view → Mark as mastered.** Seed Cole's grade-3 facts and the Grade 4 multiplication pages 32-35 (confirmed DONE Sep 17 [F]). Nothing of Lily's is seeded [F].
- [ ] **Parent view → Settings.** Check the defaults: 12 / 12 / 6 weekday, 30 / 30 / 45 weekend, blocks must start by 8:30, Lily's prompts read aloud automatically.
- [ ] **Set out the kit** by the table: timer, 20 counters, scrap paper, hole punch, colored pencils, Tangoes, Lily's Take Home Folder, Cole's bookmarked Grade 4 book.
- [ ] **Sunday Oct 18.** The first 5-minute dashboard review (checklist in 04-weekly-rhythm-and-templates.md).
