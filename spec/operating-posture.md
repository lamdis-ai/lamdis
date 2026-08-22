# Operating posture

Decisions about how Lamdis Exchange handles money, workers, and reporting.
Recorded because a decision nobody wrote down gets made again by accident — and
because each of these is a constraint on what gets built next, not a footnote.

Status: current as of August 2026. Not legal advice; this records what the
system does so that a lawyer can tell us where it is wrong.

## 1. Where the money actually sits

**Corrected 2026-08-22.** This section previously said the exchange never takes
custody and that staying out of custody is what keeps it a marketplace rather
than a money business. That was written as an intention and asserted as a fact,
and the code does not do it. Anybody reading it would have drawn the wrong
conclusion about a regulated question.

What the code does:

- A top-up is a Stripe Checkout session with **no** `transfer_data` and **no**
  `on_behalf_of`, so the funds settle into **the platform's own Stripe
  balance**.
- A payout is `POST /v1/transfers` with a `destination`, moving money **out of
  that same platform balance** into a connected account the worker owns.
- Between those two events the money is in an account belonging to us, held at
  a licensed payment provider.

So: **we do hold the funds**, in our account at Stripe, and the public FAQ
saying so is the accurate surface. What is true and worth stating precisely is
narrower — the exchange operates no wallet of its own, holds nothing outside
the payment provider, and never touches a card number or a bank account. The
double-entry ledger in `internal/ledger` records obligations *against* that
balance; it is not itself a pot of money.

**This is a legal question and it is not settled here.** Whether holding
customer funds in a platform Stripe balance and disbursing them to third
parties constitutes money transmission depends on the Connect arrangement, the
states involved, and Stripe's own licensing — none of which a code comment can
resolve. It needs counsel before this takes real money, and the honest thing to
publish until then is the mechanics rather than a conclusion.

**The constraint this places on future work:** do not describe the exchange as
non-custodial anywhere. If a genuinely non-custodial arrangement is wanted, it
is a different integration — destination charges with `on_behalf_of`, so funds
never land in the platform balance at all — not a wording change.

## 2. People here are independent, not employed

Workers choose what to take, when to take it, what to charge on open jobs, and
use their own equipment. The exchange sets *what outcome is required* and never
*how the person achieves it*.

**The constraint this places on future work:** the facts that decide worker
classification are exactly the features a marketplace is tempted to add —
assigning shifts, requiring availability windows, mandating exclusivity,
penalising declined work, prescribing method. The claim-and-cooldown design
already sits close to this line: declining work must stay free, and the
cooldown after *abandoning* accepted work must not turn into a penalty for
choosing not to accept.

## 3. Suppliers, and what employing people means here

A business can operate as a `Supplier`: a legal name, licences, insurance, and
members who take work on its behalf. Concurrency, cooldown and standing belong
to the supplier; the seat, the capability and the evidence belong to the person
who did the work.

**This helps the classification position rather than complicating it.** A
technician who works for Northline Mechanical is Northline's employee, not the
exchange's — the employment relationship sits with the company, which is where
it belongs and where it is already governed. The exchange contracts with the
business.

**It also concentrates the risk.** Members are added by the supplier and the
exchange does not verify that a person consented to be added, so a supplier
could attach somebody and earn against their work. One person may belong to
only one supplier, which bounds it; consent is not solved.

**Vetting is the load-bearing part.** A vetted supplier holds twelve jobs at
once instead of one, so "vetted" has to mean a person actually checked the
licence number against the issuing register and the certificate of insurance
against the carrier. It is deliberately unreachable from any account-
authenticated route. If vetting ever becomes self-service, the ceiling must
come back down with it.

**Licensed trades require a verified licence.** Not a claimed one. Before this,
a contractor carrying a state licence, bonding and cover competed on identical
terms with anyone who ticked a box — and lost sealed-bid work to them, because
the underbidder carried none of the cost. A qualification that is free to claim
is worse than no qualification, because it reads as a guarantee.

## 4. Earnings above a calendar-year threshold are reportable

United States, 1099-NEC, $600 per person per calendar year. Tracked in
`internal/exchange/compliance.go` against ledger postings joined to their
operation timestamps.

The provider files for connected accounts it pays. The exchange's job is to
know who is *approaching* the line so details are collected before the money is
stuck — asking someone for a tax document at the moment they try to cash out is
the worst possible time.

Workers are told when they pass three quarters of the threshold, not when they
cross it.

## 5. What the open board may carry

The board needs no authentication, so everything `Listing.Public()` returns is
world-readable. Three fields are therefore split by who is entitled to them:

| field | public | carries |
|---|---|---|
| `title` | yes | what outcome is wanted |
| `detail` | yes | the scope of the work — without it nobody can price an open job |
| `area` | yes | a coarse locality, enough to judge whether to travel |
| `where` | **no** | the exact address |
| `instructions` | **no** | how to do it, including how to get in |

`where` and `instructions` reach the claimant over their capability and nowhere
else. This is not a preference: before the split, a job saying *"gate code 4471,
key under the flowerpot"* at a named street address was readable by anyone who
fetched the board, before a single person had claimed it. The sealed-bid design
was hiding the price and publishing the front door.

The residual leak is `title`, which must be public. An agent that writes the
address into the predicate puts it back on the board, so posting returns a
warning when the title repeats the address given in `where`. It warns rather
than refuses: for a sign on a commercial street the address is already a public
fact and belongs in the title.

**The constraint this places on future work:** any new public field is a
decision about what a stranger may learn about a property before they have
committed to anything. Default to withholding and release on claim.

## 6. What the verification actually establishes

Stated plainly, because the gap between these two is where fraud lives.

**Established:** that a photograph carries a code we privately issued for this
job and this stage, that the file claims a time and a place consistent with the
job, that it has not been submitted before, and that a model which never saw
the predicate described a scene a second model judged to satisfy it.

**Partly established:** that the photograph is of a real scene.
`synthetic_suspicion` is now consumed, at a threshold measured rather than
guessed (2026-08-21, against the live describer):

| set | n | score |
|---|---|---|
| genuine phone photographs | 18 | max 0.30, median 0.05 |
| Qwen diffusion, plain scenes | 2 | 0.45, 0.60 |
| Qwen diffusion, odd framing | 2 | 0.75 |
| flat vector illustrations | 3 | 0.97–0.98 |

Real tops out at 0.30 and fabricated starts at 0.45, so the threshold sits at
**0.40** — inside the gap, near its top, because refusing an honest worker is
the worse error. The constant that was in the tree before the measurement was
0.60, which would have passed the 0.45 image.

**The limits of that number:** one generator, no adversarial tuning against the
detector, 18 real images from one phone. A submitter who post-processes
generated output — grain, compression, a real EXIF block — is not represented
in this sample and may well score below 0.40.
`screen_or_print_recapture_suspicion` is recorded on every submission and
**gates nothing**, because nobody has measured what separates a photograph of a
screen from an honest photograph taken at an angle. It is stored so the corpus
exists when somebody does.

### Thresholds must be measured

`internal/exchange/calibration.go` records where every gating number came from:
the date, the method, both distributions, and what the sample does not cover. A
threshold marked unmeasured may be recorded and reported but **may not refuse
anybody's work** — the server refuses to start if one is wired to, and a test
fails if an unmeasured constant is even set to a non-zero value.

This exists because of a specific error. Asked whether fabricated imagery would
be caught, the reasoning was: grep shows the signal is discarded, so the
question is settled and measuring would only confirm it. The first half was
true and the conclusion was wrong. The measurement, once taken, put real
photographs at a maximum of 0.30 and generated ones at a minimum of 0.45, with
the constant in the tree at 0.60 — on the wrong side of the gap, passing the
exact fabrication it existed to stop.

Grep establishes whether a signal is used. It cannot establish whether the
number is right.

Capture metadata is attacker-supplied and nothing cross-checks it: no sun-angle
consistency, no weather correlation, no comparison against the claim time. It
is required at V2 as a floor, not believed as proof.

**The constraint this places on future work:** do not describe this system as
detecting fabricated evidence until those signals are consumed and their
thresholds calibrated against a real corpus. The honest current claim is that
it makes *reuse* and *absence* expensive, not that it detects generation.

## 7. Work this exchange refuses

Written after reading the published analysis of the first marketplace of this
shape. Researchers found six abuse classes being bought openly there: accounts
created on third-party services at $12–15 each, impersonation in job interviews
at $60/hour, one-time passcodes solicited from workers, engagement farming
across hundreds of accounts, referral fraud paired with real identity checks,
and reconnaissance dispatched by closed-loop pipelines with no human in them. A
bounty asking for help defeating two-factor authentication drew 79 applicants.

**The workers were not the problem.** Creating an account for somebody is a
five-minute errand until it turns out to be a money-mule pipeline, and the
person whose name is on it carries that. An exchange that dispatches physical
acts without asking what they are for is a laundering service with a job board
attached.

`internal/api/screen.go` refuses seven classes before a job is listed — never
after somebody has done it, because a worker who completes an abusive task has
already taken the risk and paying them does not undo it. Where an honest
reading exists (moving contact off-platform, many people at low pay) the job is
held for a person rather than refused: a locksmith opening a door and a burglar
opening a door describe themselves identically, and the difference is a licence
rather than a phrase.

Two further findings from the same source are addressed directly:

- **Workers could not tell whether an employer was a person or a pipeline.**
  Jobs now carry `posted_by_agent`, taken from the credential that posted them
  rather than from anything the buyer claims.
- **A worker earned $5 and could not withdraw it.** Our threshold exists
  because a flat transfer fee eats a small balance, but a threshold nobody can
  override is indistinguishable from not being paid. `POST /v1/payout/now`
  sends whatever is clear, with the fee borne by the person who chose it. The
  buyer's review window is *not* waivable this way — that one is not the
  worker's to give up.

**The constraint this places on future work:** screening is a floor, not a
solution. It is keyword-shaped and somebody will word around it. The rules must
stay short enough to reason about, and anything that starts refusing honest
work has failed at a higher cost than anything it caught.

## 8. What is deliberately not solved

- **Non-US workers.** Currency is USD throughout, distances are miles, and the
  skill catalogue encodes US credentials (EPA 608, FAA Part 107, CDL, state
  licences). This is a US-first product on purpose; it is not accidentally
  US-shaped.
- **Sybil supply.** One person can hold several accounts. Claim limits and
  cooldowns raise the cost; they do not solve it.
- **Disputes.** Resolved by a human reading the evidence. There is no appeals
  process and no arbitration clause.
- **Evidence durability.** Uploaded bytes live in memory and do not survive a
  restart. Hashes and verdicts survive; the images do not.
