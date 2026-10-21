# Terms of Use — draft for the community (pool) markets and mobile-money rail

**Status: DRAFT for counsel review. Not legal advice. Do not publish as-is.**

This is the text to paste into **Admin → General → Legal → Terms of Use** (one
locale at a time; the editor accepts the same light markup used below:
`#`/`##`/`###` headings, paragraphs, `-` bullets, `1.` numbered lists, `**bold**`,
and the placeholders `{{siteName}}`, `{{siteNameUpper}}`, `{{siteUrl}}`).

It is written for the **closed-loop, seeded-balance test** first. The bracketed
`[…]` items must be filled in or struck out by counsel before any real money
moves. Sections marked **(real money)** can stay in the text now but only take
effect once deposits are switched on.

The in-app gate (one checkbox at the first deposit, stake or withdrawal) records
the date, the age confirmation and the version string `2026-10-21`. Bump
`CURRENT_TERMS_VERSION` in `src/lib/mobile-money/rules.ts` whenever this text
changes materially so everyone is asked again.

---

# Terms of Use

Last updated: [date]. Version 2026-10-21.

These Terms of Use (the "Terms") govern your access to and use of {{siteName}}
at {{siteUrl}} and its related services (the "Platform"), operated by
[legal entity name, registration number, registered address, Kenya] ("we", "us").
By creating an account, confirming the age and consent box, depositing, staking
or withdrawing, you agree to these Terms. If you do not agree, do not use the
Platform.

## 1. Who may use the Platform

1. You must be at least **18 years old**. We ask you to confirm this before your
   first deposit, stake or withdrawal and we record that confirmation.
2. You must be legally permitted to use prediction markets where you live. The
   Platform is currently offered to residents of **Kenya** only. We may block
   access from other countries.
3. You may hold only one account. Accounts are personal and may not be sold,
   lent or shared.
4. We may refuse, suspend or close an account at our discretion, including where
   we suspect fraud, abuse, multiple accounts, under-age use or a breach of these
   Terms.

## 2. What the community markets are

1. **Community markets** are questions with a Yes or No answer created inside a
   community on the Platform and resolved by that community's **jury**.
2. Stakes on a community market go into a shared **pool** in the community's
   currency. When the market resolves, the pool (less the fee in section 5) is
   shared among the stakes on the winning side in proportion to their size.
   This is a **parimutuel** market: there is no fixed price, and the payout
   shown while a market is open is an **estimate** that changes as others stake.
3. Community markets are **not** connected to any exchange, order book or
   blockchain settlement. They are run entirely on the Platform's own ledger.
4. During the **test phase** balances are **test credits with no cash value**,
   issued and withdrawn by us. They cannot be deposited, withdrawn or
   transferred and we may reset them at any time. Section 4 (deposits and
   withdrawals) does not apply during the test phase.

## 3. How markets resolve

1. Each community has a jury of at least three members seated by the community
   admin. A market resolves when the jury reaches the required majority
   (unanimous for juries of three or fewer votes required; otherwise more than
   75% of seats). Jurors must give a reason and may link evidence.
2. The jury's decision is final on the Platform. There is no appeal to us
   except under section 3.4.
3. If a market has passed its resolution date and the jury has not reached the
   required majority within 72 hours, or if the jury marks the market as
   disputed, the market is **cancelled** and every stake is **refunded in full**
   to the account it came from.
4. We may cancel and refund a market ourselves, before or after resolution,
   where we find jury collusion, a materially wrong resolution, a technical
   fault, or a legal requirement. We will tell affected users.
5. You are responsible for reading the question, the resolution source and the
   resolution rules before you stake. We do not guarantee that any market is
   well written or that a resolution source will remain available.

## 4. Deposits, withdrawals and your balance **(real money)**

1. Deposits and withdrawals are made through mobile money (currently M-Pesa and
   other pawaPay-supported wallets in Kenya) in Kenyan shillings. The number
   you use must be registered in your own name.
2. Your balance is a **record in our ledger** of what you have deposited, won,
   lost and withdrawn. It is held [in a segregated client account at [bank]] and
   is not an investment, does not earn interest, and is not insured by any
   deposit protection scheme.
3. Minimum and maximum amounts, daily limits and fees are shown in the app
   before you confirm. We may change them.
4. Withdrawals go only to a mobile money number you have deposited from, or to
   a new number up to a lower limit. We may ask for identity verification before
   paying out, and may delay or refuse a withdrawal while we investigate
   suspected fraud, money laundering or a breach of these Terms.
5. A deposit that has not been confirmed by your mobile money provider is not
   credited. A withdrawal that fails at the provider is returned to your balance.
6. You may not deposit funds that are not yours or that come from crime.

## 5. Fees

1. On each community market we keep a fee of up to **[X]%** of the winning
   pool, shown on the market page as the "rake" before you stake. Cancelled
   markets carry no fee.
2. Withdrawal fees, if any, are shown before you confirm. Your mobile money
   provider may charge its own fees.
3. [Taxes: withholding on winnings at the rate required by Kenyan law, if
   applicable — counsel to confirm.]

## 6. Your responsibilities

1. Keep your login, wallet and authenticator secure. Everything done from your
   account is treated as done by you.
2. Do not create markets or stake on markets whose outcome you can influence or
   already know, and do not vote as a juror on a market you have staked on. We
   may cancel such markets and close such accounts.
3. Do not use bots, multiple accounts, false information or any method to
   manipulate a market, a jury or a community.
4. Only stake what you can afford to lose. Prediction markets involve risk, and
   you may lose your entire stake. If you think you have a gambling problem,
   stop and seek help: [Kenya helpline / resource].

## 7. Our responsibilities and limits

1. We provide the Platform "as is". We do not guarantee uninterrupted
   availability, and we may suspend deposits, withdrawals or trading for a
   currency while we reconcile our ledger or fix a fault. Open markets are not
   affected by a pause except that new stakes may be refused.
2. We are not responsible for losses caused by mobile money providers, your
   network, your device, or your own mistakes (for example staking the wrong
   side or amount).
3. To the extent permitted by law, our total liability to you for any claim
   related to the Platform is limited to the balance in your account at the
   time of the claim.
4. Nothing in these Terms limits liability that cannot be limited under Kenyan
   law.

## 8. Privacy

We process your personal data (including your phone number, wallet address,
transactions and jury votes) under our Privacy Policy at
[{{siteUrl}}/privacy]. Jury votes and reasons are visible to community members.

## 9. Changes, suspension and closing your account

1. We may change these Terms. When the change is material we will ask you to
   accept the new version before your next deposit, stake or withdrawal.
2. You may close your account at any time once you have no stake in an open
   market. Any remaining balance will be paid out under section 4.
3. If we close your account, we will pay out any balance that is not subject to
   an investigation, less any amount you owe us.

## 10. Complaints, governing law and disputes

1. Complaints: [support email / in-app]. We aim to reply within [N] business
   days.
2. These Terms are governed by the laws of Kenya. Disputes are subject to the
   [exclusive jurisdiction of the courts of Kenya / arbitration under …].
3. [Regulatory statement: licence number from the Gambling Regulatory
   Authority, or the statement that the test phase involves no stake of money
   and no prize of money — counsel to decide.]

---

## Notes for counsel (not part of the published text)

- **Test phase vs real money.** Section 2.4 is what lets the seeded-balance test
  run without a licence; counsel should confirm that test credits with no cash
  value and no cash prize fall outside the Gambling Control Act and the GRA's
  scope. Strike 2.4 when deposits go live.
- **Age and consent record.** The app stores `terms_accepted_at`,
  `age_confirmed_at` and `terms_version` per user. Nothing else is collected at
  the gate. If the GRA requires identity verification before a first deposit
  (likely), that is the Sumsub step already built for the on-chain rail and can
  be switched on for the mobile-money rail.
- **Jury conflicts (6.2).** Technically a juror can currently stake on a market
  they vote on. If counsel wants this enforced rather than stated, it is a small
  change (refuse the vote when the juror holds a stake).
- **Fee (5.1).** The rake is a per-pool setting; the published cap must be at
  least the highest configured value.
- **Segregated account (4.2), withholding tax (5.3), helpline (6.4), privacy URL
  (8), complaints SLA (10.1), forum (10.2), licence (10.3)** are the open
  blanks.
