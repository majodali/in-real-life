// The public landing page (src/index.html), in page order. Rendered into
// the page at deploy time, so the page needs no JavaScript for its words.
// {b:…} marks bold words inside a sentence; {em:…} marks emphasis.

export default {
  'landing.meta.title': 'in·real·life — neighborhood meetups on Bainbridge Island',
  'landing.meta.description': "in·real·life is a community-driven way to find meetups on Bainbridge Island and to say you'll be there. A coffee walk, a book swap, a low-tide morning.",

  // The early-days notice: top of the page on desktop, bottom of the
  // screen on phones.
  'landing.notice.label': 'Where things stand',
  'landing.notice.tag': 'Early days',
  'landing.notice.body': "We're opening on Bainbridge Island first, and starting small on purpose. We check every sign-up ourselves, so allow a few days.",

  'landing.nav.label': 'Page',
  'landing.nav.week': 'Example week',
  'landing.nav.how': 'How it works',
  'landing.nav.absent': 'Principles',

  // Shown when JavaScript is off; otherwise a rotating tagline replaces
  // it (src/js/taglines.js).
  'landing.tagline.fallback': 'Who are the people in your neighborhood?',

  'landing.hero.headline': "You're invited to meet your neighbors, {em:in real life.}",
  'landing.hero.lede': "in·real·life is a community-driven way to find meetups on Bainbridge Island and to say you'll be there. A coffee walk, a book swap, a low-tide morning. You confirm, and then you show up. That is the whole thing.",

  // The call to action, used beside the introduction and again at the end.
  'landing.cta.accept': 'Accept the invitation',
  'landing.cta.signin': 'Already signed up? Sign in',

  'landing.glance.title': 'At a glance',
  'landing.glance.what.term': 'What it is',
  'landing.glance.what.def': "A short list of small, in-person meetups near where you live, and a way to say you'll come.",
  'landing.glance.who.term': "Who it's for",
  'landing.glance.who.def': "Adults, 18 and over, living on Bainbridge Island. Sign-up takes a few minutes; then we check you're local.",
  'landing.glance.runs.term': 'Who runs it',
  'landing.glance.runs.def': "It's community-driven: neighbors propose the meetups, and every decision about how it works is public. Not for profit, no ads, nothing for sale.",
  'landing.glance.where.term': 'Where',
  'landing.glance.where.def': 'Bainbridge Island, Washington, to begin with. One place at a time after that.',

  // The example week. Invented meetups at real places, labeled as ideas.
  'landing.week.title': 'A week of ideas',
  'landing.week.flag': 'Example week',
  'landing.week.note': 'Examples, to show the kind of thing neighbors propose. They are invented and not live: the places are real, the people are not. The real calendar is in the app.',
  'landing.week.listLabel': 'Example meetups, by day',
  'landing.week.mon': 'Monday',
  'landing.week.tue': 'Tuesday',
  'landing.week.wed': 'Wednesday',
  'landing.week.thu': 'Thursday',
  'landing.week.fri': 'Friday',
  'landing.week.sat': 'Saturday',
  'landing.week.sun': 'Sunday',
  'landing.week.walk.when': '6:30 pm',
  'landing.week.walk.title': 'Evening walk, Grand Forest west loop',
  'landing.week.walk.meta': 'Mandus Olson Road trailhead · Hosted by {b:Ruth}',
  'landing.week.coffee.when': '7:30 am',
  'landing.week.coffee.title': 'Coffee before the morning boat',
  'landing.week.coffee.meta': 'Pegasus Coffee House, Winslow · Hosted by {b:Daniel}',
  'landing.week.lunch.when': '12:15 pm',
  'landing.week.lunch.title': 'Lunch on the benches at Waterfront Park',
  'landing.week.lunch.meta': 'Waterfront Park, near the boat launch · Hosted by {b:Amara}',
  'landing.week.games.when': '7:00 pm',
  'landing.week.games.title': 'Board games at the library',
  'landing.week.games.meta': 'Bainbridge Public Library, meeting room · Hosted by {b:Joe}',
  'landing.week.pickleball.when': '6:00 pm',
  'landing.week.pickleball.title': 'Pickleball for people who have never played',
  'landing.week.pickleball.meta': 'Battle Point Park courts · Hosted by {b:Linh}',
  'landing.week.sketching.when': '5:30 pm',
  'landing.week.sketching.title': 'Sketching the harbor',
  'landing.week.sketching.meta': 'Eagle Harbor waterfront trail, by the marina · Hosted by {b:Ellen}',
  'landing.week.market.when': '9:00 am',
  'landing.week.market.title': "Farmers' market, then a coffee",
  'landing.week.market.meta': 'Town Square, Winslow · Hosted by {b:Priya}',
  'landing.week.tide.when': '2:00 pm',
  'landing.week.tide.title': 'Low tide walk at Fay Bainbridge',
  'landing.week.tide.meta': 'Fay Bainbridge Park, the beach below the campground · Hosted by {b:Tom}',
  'landing.week.run.when': '10:00 am',
  'landing.week.run.title': 'Sunday run, Gazzam Lake loop',
  'landing.week.run.meta': 'Gazzam Lake Nature Preserve, Marshall Road entrance · Hosted by {b:Marcus}',
  'landing.week.books.when': '4:00 pm',
  'landing.week.books.title': 'Book swap, one in and one out',
  'landing.week.books.meta': 'Lynwood Center, the benches outside the theater · Hosted by {b:Sofia}',
  'landing.week.end': 'That is one week of ideas. The real calendar shows what neighbors have actually proposed.',

  // The principles: each thing left out, paired with what we do instead.
  'landing.absent.title': 'What the cards leave out, on purpose',
  'landing.absent.lead': 'You have just read ten meetups without seeing what anyone looks like or which one is "popular". That is the design. Each thing we leave out is paired with what we do instead.',
  'landing.absent.faces.title': 'No faces, no surnames',
  'landing.absent.faces.body': 'There are no profile photos to size people up by. {b:Instead:} a first name, and a line from the host on how to find the group. Your surname, address and phone number stay yours.',
  'landing.absent.inbox.title': 'No inbox',
  'landing.absent.inbox.body': 'There is no messaging and no direct messages, so there is nothing to check and nobody can write to you. {b:Instead:} the way to talk to someone is to go where they said they would be, and ask in person.',
  'landing.absent.popular.title': 'No popularity contest',
  'landing.absent.popular.body': "Nothing is trending or promoted, and we never rank people. {b:Instead:} meetups are suggested by fit — what you enjoy, when you're free, the size of group you like — and never by how many are going.",
  'landing.absent.keepUp.title': 'Nothing to keep up with',
  'landing.absent.keepUp.body': "No streaks, no badges, no feed that never ends. Miss a month and nothing happens to you. {b:Instead:} a short list of what's coming up nearby, there when you want it.",
  'landing.absent.ads.title': 'No ads, nothing for sale',
  'landing.absent.ads.body': 'in·real·life is not for profit. We do not sell advertising, and we do not sell what we know about you. {b:Instead:} we collect the minimum a meetup needs, and we publish how we decide things.',

  'landing.how.title': 'How it works',
  'landing.how.lead': 'Three steps. The first one is the part that makes the room trustworthy.',
  'landing.how.join.title': "Sign up, and show us you're local",
  'landing.how.join.p1': 'Sign-up is for adults, 18 and over, and we verify that you live on the island before you see anyone. That is what makes this a neighborhood and not the whole internet.',
  'landing.how.join.p2': 'Then a short interview: what you enjoy, when you are free, the kind of company you like.',
  'landing.how.pick.title': 'Pick something coming up',
  'landing.how.pick.p1': "Read the real calendar the way you read the ideas above. When something looks right, say you'll be there. That is a promise to the host, not a like.",
  'landing.how.show.title': 'Show up',
  'landing.how.show.p1': 'Look for the first name on the card and say hello. That is where the app stops and the meetup starts.',
  'landing.how.show.p2': 'Afterwards we ask how it went, starting with whether it was worth another go.',

  'landing.where.title': 'Where it works',
  'landing.where.p1': 'We are starting on Bainbridge Island, Washington, and only there. We add neighborhoods one at a time, so each one stays small enough to recognize itself.',
  'landing.where.p2': 'Not on the island? Leave your email at sign-up. We will let you know when we reach your neighborhood, and we will not write to you in between.',

  'landing.close.title': 'We hope to see you there.',
  'landing.close.body': "Sign up, see what neighbors have proposed, and say you'll come. Or propose something yourself; a walk is enough.",
};
