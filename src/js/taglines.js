// Hero taglines for the landing page.
//
// One is picked at random per page load. Each entry has an `active` flag —
// inactive ones live in the file (so we don't lose ideas) but won't be
// shown until promoted. The /taglines.html review page shows everything,
// active and not, grouped by category. The words are in the bundle
// (src/copy/<locale>/taglines.js); this file keeps which are active.
//
// The landing page loads this module, so it reads only the taglines
// surface — not the whole app bundle (design-spec §9's page budget).

import { createCopy } from './copy-engine.js';
import { locale, formats } from '../copy/en-US/locale.js';
import strings from '../copy/en-US/taglines.js';

const { text } = createCopy({ locale, formats, layers: [strings] });

export const TAGLINES = [
  // ─── Mr. Rogers / Sesame Street register ───
  { category: 'rogers', text: text('taglines.peopleNeighborhood'), active: true },
  { category: 'rogers', text: text('taglines.beautifulDayNeighborhood'), active: true },
  { category: 'rogers', text: text('taglines.wontYouBeMyNeighbor'), active: true },
  { category: 'rogers', text: text('taglines.howdyNeighbor'), active: true },

  // ─── Quietly direct ───
  { category: 'direct', text: text('taglines.worldNeeds'), active: true },
  { category: 'direct', text: text('taglines.wantedHere'), active: true },
  { category: 'direct', text: text('taglines.someoneHopingShow'), active: true },
  { category: 'direct', text: text('taglines.savedSeat'), active: true },
  { category: 'direct', text: text('taglines.beenExpecting'), active: true },

  // ─── Literary / borrowed ───
  { category: 'literary', text: text('taglines.onlyConnect'), attribution: text('taglines.onlyConnect.by'), active: true },
  { category: 'literary', text: text('taglines.allRealLiving'), attribution: text('taglines.allRealLiving.by'), active: true },
  { category: 'literary', text: text('taglines.toBeOfUse'), attribution: text('taglines.toBeOfUse.by'), active: true },
  { category: 'literary', text: text('taglines.goodFencesMake'), attribution: text('taglines.goodFencesMake.by'), active: true },
  { category: 'literary', text: text('taglines.noManIsland'), attribution: text('taglines.noManIsland.by'), active: true },
  { category: 'literary', text: text('taglines.practiceResurrection'), attribution: text('taglines.practiceResurrection.by'), active: true },
  { category: 'literary', text: text('taglines.payAttentionAstonished'), attribution: text('taglines.payAttentionAstonished.by'), active: true },
  { category: 'literary', text: text('taglines.onlyWayHave'), attribution: text('taglines.onlyWayHave.by'), active: true },
  { category: 'literary', text: text('taglines.liveQuestionsNow'), attribution: text('taglines.liveQuestionsNow.by'), active: true },
  { category: 'literary', text: text('taglines.friendshipBornThat'), attribution: text('taglines.friendshipBornThat.by'), active: true },
  { category: 'literary', text: text('taglines.loveAllVulnerable'), attribution: text('taglines.loveAllVulnerable.by'), active: true },
  { category: 'literary', text: text('taglines.whatYouSeek'), attribution: text('taglines.whatYouSeek.by'), active: true },
  { category: 'literary', text: text('taglines.birdNestSpider'), attribution: text('taglines.birdNestSpider.by'), active: true },
  { category: 'literary', text: text('taglines.twoBetterThan'), attribution: text('taglines.twoBetterThan.by'), active: true },
  { category: 'literary', text: text('taglines.whereverThereHuman'), attribution: text('taglines.whereverThereHuman.by'), active: true },
  { category: 'literary', text: text('taglines.homePlaceWhere'), attribution: text('taglines.homePlaceWhere.by'), active: true },
  { category: 'literary', text: text('taglines.pleasureFriendsVisit'), attribution: text('taglines.pleasureFriendsVisit.by'), active: true },
  { category: 'literary', text: text('taglines.worldIsOneFamily'), attribution: text('taglines.worldIsOneFamily.by'), active: true },
  { category: 'literary', text: text('taglines.childrenAdamLimbs'), attribution: text('taglines.childrenAdamLimbs.by'), active: true },
  { category: 'literary', text: text('taglines.personPersonThrough'), attribution: text('taglines.personPersonThrough.by'), active: true },
  { category: 'literary', text: text('taglines.wantGoFast'), attribution: text('taglines.wantGoFast.by'), active: true },
  { category: 'literary', text: text('taglines.friendNeedsAnswered'), attribution: text('taglines.friendNeedsAnswered.by'), active: true },
  { category: 'literary', text: text('taglines.manySmallPeople'), attribution: text('taglines.manySmallPeople.by'), active: true },
  { category: 'literary', text: text('taglines.oneTimeOneMeeting'), attribution: text('taglines.oneTimeOneMeeting.by'), active: true },

  // ─── Time, place, ritual ───
  { category: 'ritual', text: text('taglines.saturdayMorningCoffee'), active: true },
  { category: 'ritual', text: text('taglines.tuesdayWalking'), active: true },
  { category: 'ritual', text: text('taglines.kettlesOn'), active: true },
  { category: 'ritual', text: text('taglines.pullUpChair'), active: true },
  { category: 'ritual', text: text('taglines.teasOn'), active: true },

  // ─── Anti-platform ───
  { category: 'anti-platform', text: text('taglines.mostAppsWant'), active: true },
  { category: 'anti-platform', text: text('taglines.notificationWorthGetting'), active: true },
  { category: 'anti-platform', text: text('taglines.notMeantToScrollAlone'), active: true },
  { category: 'anti-platform', text: text('taglines.helloHarderThan'), active: true },

  // ─── Question / invitation ───
  { category: 'question', text: text('taglines.knewYourNeighbors'), active: true },
  { category: 'question', text: text('taglines.lastMetSomeoneNew'), active: true },
];

export const CATEGORY_LABELS = {
  rogers: 'Mr. Rogers / Sesame Street register',
  direct: 'Quietly direct',
  literary: 'Literary / borrowed',
  ritual: 'Time, place, ritual',
  'anti-platform': 'Anti-platform',
  question: 'Question / invitation',
};

const FALLBACK = { text: text('taglines.fallback'), active: true };

export function pickActiveTagline({ taglines = TAGLINES, random = Math.random } = {}) {
  const active = taglines.filter(t => t.active);
  if (active.length === 0) return FALLBACK;
  return active[Math.floor(random() * active.length)];
}
