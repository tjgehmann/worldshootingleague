/**
 * The documents a real service needs before real people use it.
 *
 * These are drafts, not legal advice. Everything in ANGLE BRACKETS has to be
 * filled in, and the whole set should be read by someone qualified before the
 * beta opens — a German Impressum in particular has content requirements
 * (§ 5 DDG) that a template cannot know: the operator's legal form, address,
 * and, where applicable, register and VAT number.
 *
 * They live in one module rather than three files so the app can render them
 * offline and so there is one place where the version string changes. That
 * string is stored on the profile when somebody accepts, which is what makes
 * consent re-askable later.
 */

/** Bump on any material change; profiles record the version they accepted. */
export const TERMS_VERSION = '2026-08-01';

export interface LegalDocument {
  slug: 'imprint' | 'privacy' | 'terms' | 'source';
  title: string;
  updated: string;
  body: string;
}

const OPERATOR = '<Operator name>';
const ADDRESS = '<Street, postcode, town, country>';
const EMAIL = '<contact@example.org>';

/**
 * Where the code this app is built from lives. AGPL § 13 turns this from a
 * courtesy into an obligation: anyone using the service over a network is
 * owed the source of the version they are actually using, so a fork that
 * changes the rating or the reveal has to change this line too.
 */
const SOURCE_URL = 'https://github.com/tjgehmann/worldshootingleague';

export const LEGAL: Record<LegalDocument['slug'], LegalDocument> = {
  imprint: {
    slug: 'imprint',
    title: 'Imprint',
    updated: TERMS_VERSION,
    body: `Information under § 5 DDG.

Operator
${OPERATOR}
${ADDRESS}

Contact
Email: ${EMAIL}

Responsible for the content
${OPERATOR}, address as above.

This is a private, non-commercial beta of a sport shooting league. It sells
nothing and carries no advertising.

Dispute resolution
The European Commission provides a platform for online dispute resolution at
https://ec.europa.eu/consumers/odr. We are neither obliged nor willing to take
part in dispute resolution proceedings before a consumer arbitration board.`,
  },

  privacy: {
    slug: 'privacy',
    title: 'Privacy',
    updated: TERMS_VERSION,
    body: `Who is responsible
${OPERATOR}, ${ADDRESS}, ${EMAIL}.

What is stored, and why

  * Your email address and password, to let you sign in. The password is
    stored by our authentication provider as a hash and is never visible to us.
  * Your display name, handle, country and club, because a league is a list of
    people who can be told apart. These are visible to anyone, including
    visitors without an account.
  * Your date of birth, to check that you are old enough to hold an account
    and, later, to place you in an age category. It is never shown publicly.
  * The results you report: the total, the inner ten count where the discipline
    uses one, and the time you shot the series. Results of finished matches are
    public — that is the point of a league table.
  * The photograph of the display you attach as proof. It is visible to your
    opponent after both of you have reported, and to a referee while a case
    about that series is open. It is not public and is not shown to anyone
    else.
  * Device tokens, if you turn push notifications on, so the service can reach
    your phone. Turning notifications off deletes them.
  * Ordinary server logs kept by our hosting provider.

The legal basis is Art. 6(1)(b) GDPR — performing the service you asked for —
except for push notifications, which rest on your consent under Art. 6(1)(a)
and which you can withdraw at any time in your profile.

Who else sees it
Supabase Inc. hosts the database, the files and the authentication (servers in
the EU). Expo (Expo Inc., USA) delivers push notifications, and only if you
switch them on: it receives a device token and the text of the notification.
Nothing is sold, and there is no advertising or tracking.

How long
Account data for as long as the account exists. Results and the matches they
belong to stay after an account is deleted, because a match is two people's
record and a season table that quietly loses rows is a false table — but they
are no longer attached to a name. Evidence photographs are deleted <retention
period, e.g. 12 months> after the match they belong to is finalised.

Your rights
Access, rectification, erasure, restriction, portability and objection, and the
right to complain to a supervisory authority. Two of these are buttons in your
profile: "Download my data" produces everything the service holds about you,
and "Delete my account" removes your name, handle, date of birth and profile
immediately and queues the rest for deletion.

Cookies
The web version stores your session in the browser so that you stay signed in.
No analytics, no third-party cookies.`,
  },

  terms: {
    slug: 'terms',
    title: 'Terms',
    updated: TERMS_VERSION,
    body: `1. What this is
A beta of an online league for sport shooters on electronic targets. It is free,
it is unfinished, and it can be interrupted or reset while it is a beta.

2. Who can take part
Shooters of 18 and over. Under-18s are not admitted yet, because guardian
consent and the protections a junior account needs are not built.

3. Reporting a result honestly
You report what the display showed, for a series you shot yourself, under the
rules of the discipline. You attach a photograph of that display. You do not
report a result somebody else shot, a result from another session, or a number
that is not on the photograph.

4. Checking your opponent
After both of you have reported you can see their result and their photograph.
Looking at it is part of taking part. If it does not match, say so — that opens
a case for a referee rather than an argument between the two of you.

5. Referees
A referee may let a report stand, correct a score to what the photograph shows,
award a series to one side, or void it. What you reported stays visible next to
any correction. Decisions are made with a written reason that both shooters
read.

6. Consequences
A result obtained by misreporting can be corrected or voided and the rating
recalculated. Repeated or deliberate misreporting can end the account. There is
no prize money, so nothing here is a game of chance.

7. Your content
The photographs stay yours. You give us permission to store them and to show
them to your opponent and to referees for the purpose described above. Your
results may be shown publicly as part of tables and match pages.

8. Availability and liability
No uptime is promised during the beta. Liability is limited to intent and gross
negligence, except where the law does not permit that limitation — in
particular for injury to life, body or health.

9. Ending it
You can delete your account at any time in your profile. We may close an
account that breaks these terms, and will say why.

10. Law
German law applies. Where you are a consumer, the mandatory consumer protection
of your country of residence is unaffected.`,
  },

  source: {
    slug: 'source',
    title: 'Source code',
    updated: TERMS_VERSION,
    body: `This service is free software, licensed under the GNU Affero General
Public License, version 3 or later.

You are entitled to the complete source code of the version you are using, to
run it yourself, to study how it decides a match, and to redistribute it —
modified or not — under the same licence.

Where it is
${SOURCE_URL}

Why you are told this
Section 13 of the AGPL requires an operator who runs the software as a network
service to offer its source to the people using it. That is the whole reason
this licence was chosen over the plain GPL. A league is a set of rules applied
to other people's results; rules you cannot read are not rules, they are a
claim. The rating, the pairing and the blind reveal are all in that repository.

No warranty
The licence gives you the code, not a promise that it works. See sections 15
and 16 of the licence text, which is in the repository as LICENSE.`,
  },
};

export const LEGAL_LIST = [LEGAL.imprint, LEGAL.privacy, LEGAL.terms, LEGAL.source];
