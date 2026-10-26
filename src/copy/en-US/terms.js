// The Terms of Use (src/terms.html), in page order.
//
// These words are what members agree to. Changing any of them changes
// the agreement: bump AGREEMENT_VERSION and AGREEMENT_LAST_UPDATED in
// src/js/agreement.js in the same commit. A review variant may not
// override terms.* keys (docs/page-copy.md §5), and a translation needs a
// governing-language decision first (R10, R11).
//
// {termsVersion} and {termsUpdated} are filled from agreement.js at
// deploy (infrastructure/scripts/render-copy.mjs), so the page and the
// version a member accepts cannot disagree.

export default {
  'terms.meta.title': 'in·real·life — Terms of Use',
  'terms.nav.label': 'Site',

  'terms.title': 'Terms of Use',
  'terms.version': 'Version {termsVersion} — last updated {termsUpdated}',
  'terms.intro.p1': "These are the rules for using in·real·life. They're short on purpose — we'd rather write something you'll actually read than bury you in fine print.",
  'terms.intro.p2': 'By signing up, you agree to them.',

  'terms.who.title': 'Who can use this',
  'terms.who.p1': 'in·real·life is for adults. You need to be 18 or older to sign up.',
  'terms.who.p2': "in·real·life works one neighborhood at a time. We'll ask for your postal code at sign-up and only create an account if we're already serving your area. If we're not, you can leave your email and we'll let you know when we get there.",
  'terms.who.p3': "One person, one account. Don't share yours, and don't sign up on behalf of someone who can't sign up themselves.",

  'terms.what.title': 'What in·real·life does',
  'terms.what.p1': 'We help neighbors meet each other in person, at events in your neighborhood.',
  'terms.what.p2': "You tell us a little about yourself. We show you what's happening nearby. You decide if you want to go. You show up.",
  'terms.what.p3': "That's all we do. We don't run the events ourselves. We don't vet every organizer or guarantee any specific event will happen as planned. We don't introduce you to anyone privately, and we're not a dating service.",

  'terms.conduct.title': 'How to be a neighbor',
  'terms.conduct.intro': "Be the kind of person you'd want to meet at a coffee walk on Saturday morning. In practice:",
  'terms.conduct.r1': "Treat people the way you'd want to be treated.",
  'terms.conduct.r2': 'Be the person you said you were — your real first name, an honest description.',
  'terms.conduct.r3': "Show up if you said you would. If you can't make it, let people know in advance.",
  'terms.conduct.r4': "Don't harass anyone. Don't threaten anyone. Don't make anyone feel unsafe.",
  'terms.conduct.r5': 'No soliciting, recruiting, or advertising at events.',
  'terms.conduct.r6': "If something at an event makes you uncomfortable, tell us. We'd rather hear about it than not.",
  'terms.conduct.close': "We may close accounts that don't follow these. We won't always explain publicly — but we'll explain to the person whose account it was.",

  'terms.info.title': 'What we do with your information',
  'terms.info.intro': 'The short version: we collect what we need to make a meetup happen, nothing more.',
  'terms.info.shared.title': 'What we share with other people on in·real·life',
  'terms.info.shared.i1': 'Your first name',
  'terms.info.shared.i2': 'Your avatar',
  'terms.info.shared.i3': 'A short "vibe" message you write yourself',
  'terms.info.shared.i4': "Whether you've said you'll be at an event",
  'terms.info.private.title': "What we don't share",
  'terms.info.private.i1': 'Your last name, address, phone number, or email',
  'terms.info.private.i2': 'Your exact location',
  'terms.info.private.i3': "Anything else you've told us privately",
  'terms.info.p1': "We don't sell your data. We don't run ads. We don't use your information to train AI models.",
  'terms.info.p2': "We keep your data on Amazon Web Services, in the United States. If you want a copy, ask us — we'll send you everything we have about you. If you want it deleted, we'll delete it. (Some records we have to keep for legal or accounting reasons; we'll tell you when that applies.)",

  'terms.content.title': 'Your account and content',
  'terms.content.p1': "You own what you write. We have permission to display it on in·real·life as needed for the service to work — that's it. We won't republish your interview responses, your vibe message, or anything else off-platform.",
  'terms.content.p2': "If you delete your account, your profile goes away and other people can't see you anymore. We may keep some records — for legal reasons, or because they're tied up in event history other people are still part of.",

  'terms.closure.title': "When we'll close your account",
  'terms.closure.intro': 'We may close your account if:',
  'terms.closure.r1': 'You break the rules above.',
  'terms.closure.r2': "You repeatedly RSVP to events and don't show up.",
  'terms.closure.r3': "We have a reasonable suspicion you're not who you said you were.",
  'terms.closure.r4': "We're required to by law.",
  'terms.closure.p1': 'You can close your account anytime, from your profile page. No penalty.',

  'terms.money.title': 'Money',
  'terms.money.p1': "in·real·life is free to use right now. We'll let you know — clearly and in advance — if we ever start charging for anything.",

  'terms.legal.title': 'Stuff we have to say',
  'terms.legal.p1': 'in·real·life is provided "as is." We can\'t promise the service will always work, that you\'ll meet anyone you click with, or that any specific event will be a good experience. Use your judgment in person, the same way you would anywhere else.',
  'terms.legal.p2': "We're not responsible for what happens at events. If you meet someone here and something goes wrong, that's between the people involved (and, if it's serious, the police). We'll cooperate with law enforcement as required.",
  'terms.legal.p3': "To the extent the law allows, our liability is limited to the amount you've paid us — which, right now, is zero.",
  'terms.legal.p4': 'These terms are governed by the laws of the State of Washington, USA.',

  'terms.changes.title': 'Changes to these terms',
  'terms.changes.p1': "We may update these terms. When we do, we'll let you know — by email if we have your address, and by showing the new terms when you next open in·real·life. If a change matters, we'll ask you to accept it before continuing. If you don't agree, you can close your account.",

  'terms.contact.title': 'Getting in touch',
  // {mail:…} becomes a mailto: link to the address it marks.
  'terms.contact.p1': 'Questions, complaints, or want a copy of your data? Email us at {mail:hello@in-real.life}.',
  'terms.contact.p2': "We're a small team — we'll try to get back to you within a week.",
};
