// Every review variant (docs/page-copy.md §5). A variant is an overlay:
// a file holding only the keys it rewords, with an `about` saying what
// it tries. Register it here so the review page and the checks see it;
// deploy it with inject-config.mjs --copy-variant <name>.
//
// Terms of Use keys (terms.*) cannot be reworded by a variant — see
// infrastructure/scripts/copy-variants.mjs.

import * as sample from './sample.js';

export const VARIANTS = {
  sample,
};
