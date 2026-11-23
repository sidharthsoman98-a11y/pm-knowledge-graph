# Learning experience design — v2

Why the reader works the way it does. Use this to judge future changes.

## 1. What the content is

| | Count | Typical length | Total |
|---|---|---|---|
| Topics in the map | 1,046 | question + objective + typed prerequisites | — |
| Topics with at least one reading ("lessons") | 472 | — | — |
| Exp20 explainers | 471 | ~2,270 words, 8–10 sections | ~94 h |
| Exp40 explainers | 468 | ~4,200 words, 12–15 sections | ~183 h |
| Case20 decision cases (with teaching note) | 388 | ~1,680 words | ~54 h |
| Case40 open cases (no teaching note) | 388 | ~3,390 words | ~108 h |

The other 574 topics are outline-only: the source gives their question, objective and links, but no reading. 59 of the 672 prerequisite links between lessons pass through one of them.

Reading every page once takes about 440 hours. Whatever the interface does, that number decides how a learner must pace themselves, so the reader shows it honestly.

## 2. What was wrong with v1 (learner's-eye evaluation)

1. **No starting point and no "next".** Home offered three parallel entry routes plus search. A learner had to build their own curriculum out of 1,046 topics.
2. **Self-declared mastery.** "Mark as understood" invited the fluency illusion: rereading feels like knowing (Bjork). Nothing checked recall, and nothing said what to revise.
3. **No spacing and no retrieval.** These are the two techniques with the strongest evidence, and both were absent.
4. **Monolithic readings.** Pages of 2,000–8,000 words ran as one scroll, with no resume point inside a page.
5. **Four formats as equal peers.** Nothing said which to read first, or that Exp20 and Exp40 cover the same topic at two depths.
6. **Case teaching notes spoil the case.** Reading straight through hands you the answer before you have tried.
7. **Outline-only topics mixed into lists.** In a learning journey they were dead ends.
8. **Prerequisite readiness invisible.** You could open an advanced topic without knowing which foundations you were missing.
9. **Topic pages buried the main action.** The primary action (start reading) competed with badges, a graph and four equal cards.

## 3. Evidence used

| Finding | Source | Design consequence |
|---|---|---|
| Practice testing and distributed practice have the highest utility of ten common techniques. Rereading and highlighting do not reliably help. | Dunlosky et al. 2013, *PSPI* | A recall step in every lesson, and a spaced Review queue. |
| An unsuccessful attempt to answer before studying improves later learning (the pretesting effect). | Richland, Kornell & Kao 2009; Kornell, Hays & Bjork 2009 | "Before you read": attempt the topic's question first, optional and skippable. |
| Learner-paced segments improve retention and transfer (meta-analysis of 56 studies; small to medium effects). | Rey et al. 2019, *Educ Psych Rev*; Mayer, segmenting principle | Explainers are read one section at a time by default. A whole-page toggle keeps the alternative. |
| The optimal gap before review grows with how long you need to retain. | Cepeda et al. 2008, *Psych Sci* | Expanding intervals: 1–5 days at first, then ×2.5 on each success. |
| Judgements of learning made after a delay are far more accurate than immediate ones. | Nelson & Dunlosky 1991 | The immediate self-rating only schedules the first review. "Mastered" requires recall after at least 21 days. |
| Interleaving helps you tell similar concepts apart, while blocked study suits first exposure. | Rohrer 2012; Carvalho & Goldstone 2014 | First learning is blocked by module. Review is interleaved round-robin across modules. |
| Worked examples help novices, and guidance should fade as expertise grows (expertise reversal). | Kalyuga et al. 2003; Renkl & Atkinson 2003 | The ladder runs Exp20 (explanation) → Case20 (guided, with teaching note) → Exp40 → Case40 (no guidance). An "I already know this" skip is checked later in Review. |
| Mastery learning on a prerequisite graph. | Math Academy's published approach | Prerequisites always come first. Readiness is shown on every lesson but never enforced. |
| Gamification has small positive effects on average, and they vary a lot. | Sailer & Homner 2020 (cognitive g = .49) | Progress, a weekly activity view and an honest time estimate. No points, badges or leaderboards. |
| Streaks raise continued use, but they work through loss aversion, and their effect on learning is unproven. | NU IPR WP-26-05 (2026); INSEAD streak research | No streak counter. "Active days this week" and minutes against a self-chosen daily goal give consistency without a streak to lose. |

## 4. Decisions

### Information architecture
- **Primary navigation: Today · Learn · Review · Browse · Search · Me.** The learning loop comes first and exploration second. Course, domains and curated paths live under Browse, unchanged.
- **Lessons are the 472 topics with readings.** Outline-only topics stay in their modules, labelled "Outline only" and folded away. Wherever a lesson depends on one, its objective is shown on that lesson, so nothing the source says is hidden.

### The path (`scripts/lib/path.mjs`)
- **Complete mastery** (default):
  - *Stage 1 · Foundations*: the 376 Beginner-edition lessons in 38 units.
  - *Stage 2 · Depth*: the same topics again at Exp40/Case40, plus the 96 Practitioner-only lessons in full, in 46 units.
  - Revisiting each topic at greater depth is a spiral design and adds spacing as a side effect.
- **ISB course order**: the 332 course topics session by session, then a depth pass.
- **Ordering**:
  - Every prerequisite comes first, including links that run through outline-only topics.
  - The order stays inside one module for as long as prerequisites allow.
  - Detours of one or two lessons are folded into the next unit.
  - `npm run verify` checks the ordering.

### The lesson
1. **Predict** (optional): attempt the question before reading.
2. **Read Exp20**, one section at a time, with the section position saved.
3. **Recall**: answer from memory, check against the objective and the page's own section headings, then self-rate. The topic enters Review.
4. **Work Case20**: questions first, with an answer box. The teaching note stays folded until you open it.
5. On the depth pass: **Exp40** and **Case40**. Case40 gets a recommendation box, and the page says there is no single answer.

Every step page shows the lesson's steps and the next action (path bar and side rail), so the learner never has to decide where to go.

### Review
- Topic cards: the question, answered from memory, checked against the objective and the explainer's headings.
- Connection cards: "Why does B *build on* A?", checked against the source's own reason for that prerequisite link (elaborative interrogation).
- Connection cards are introduced gradually: at most 8 a day, and only once both topics are learned.
- Ratings Missed / Hard / Good / Easy feed an SM-2-style schedule. A missed card comes back in the same session and again the next day.
- Every card's text comes from the source; `verify` checks it.

### Screen use
- **Reading pages**: table of contents with section ticks | text at the source's own line length | lesson rail with notes on screens of 1,360 px and wider. Below that width the rail moves under the text.
- **Topic pages**: content plus a sticky lesson panel on 1,100 px and wider; on smaller screens the panel moves under the objective.
- **Dashboard**: next lesson (large), reviews due, progress per stage with time left at your daily goal, this week.

### Not done, and why
- **Generated quizzes and summaries.** They would put words in the author's mouth. Recall prompts use only the source's questions, objectives, headings and prerequisite reasons.
- **Hard gating on prerequisites.** Many learners arrive with prior knowledge (expertise reversal). Readiness is shown instead, and skipped claims are tested in Review.
- **Cross-device sync.** A static site has no backend. Export and import of progress cover moving between devices.

## 5. Integrity
- Reading pages are byte-for-byte the source bodies with scoped CSS. All interactive changes are added in the browser, and `verify` compares every page's text with the source.
- Without JavaScript, every page still shows the complete content.
- Progress lives in one versioned `localStorage` key. v1's "understood" marks carry over as "known".
