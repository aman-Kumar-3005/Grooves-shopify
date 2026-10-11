# Grooves Lifestyle PageSpeed audit — 10 October 2026

## Baseline supplied by PageSpeed Insights

| Metric | Mobile | Desktop |
| --- | ---: | ---: |
| Performance | 55 | 84 |
| Accessibility | 79 | 79 |
| Best Practices | 92 | 92 |
| SEO | 92 | 92 |
| First Contentful Paint | 5.7 s | 0.8 s |
| Largest Contentful Paint | 15.0 s | 1.6 s |
| Total Blocking Time | 140 ms | 50 ms |
| Cumulative Layout Shift | 0 | 0.069 |
| Speed Index | 11.0 s | 3.8 s |

The report had no CrUX field data, so these are Lighthouse lab results and will vary between runs.

## Root causes confirmed

- The hero downloaded oversized desktop PNGs on mobile and did not mark the LCP image as high priority.
- Six shoppable videos exposed roughly 29 MB of MP4 sources during the initial page load.
- Several product, category, logo and banner images were served significantly larger than their rendered size.
- A remote Google Fonts CSS import was render-blocking, in addition to the theme's own font loading.
- Four font files were preloaded even though only the body and heading fonts are critical.
- Premium reveal and scroll-progress JavaScript added avoidable mobile work and forced layout measurement.
- The announcement marquee repeated six messages 12 times, creating 72 direct children.
- The closed mobile navigation drawer still exposed focusable controls to the accessibility tree.
- Empty press-logo image output, generic skeleton labels, small hero-dot targets, duplicated button names, low heading contrast and skipped footer heading levels caused accessibility/SEO failures.

## Fixes implemented

- Added responsive hero `srcset`/`sizes`, intrinsic dimensions, async decoding and `fetchpriority="high"` for the first slide; later slides stay lazy and low priority.
- Replaced initial MP4 elements with lightweight responsive posters. An HTML5 video is created only when a desktop pointer hovers the card or the card receives keyboard focus.
- Right-sized category, explore-range, shoppable-product, press-logo, header-logo and footer-logo images.
- Removed the Google Fonts `@import` and reused the theme's configured font variables.
- Reduced font preloads to the body and heading fonts.
- Disabled non-essential reveal work on small screens and scroll-progress work on mobile/tablet; deferred the first scroll measurement to animation frame.
- Reduced the marquee from 12 duplicated groups to two seamless groups and hid the duplicate from assistive technology.
- Made the closed navigation drawer inert and synchronized its inert state with open/close behavior.
- Repaired press-logo source/alt output, skeleton semantics, button accessible names, footer heading order, hero touch targets and heading contrast.
- Added numeric image dimensions throughout the affected sections to reduce layout shifts.

## Validation completed locally

- JavaScript syntax check passed for `assets/premium-enhancements.js`.
- All 72 JSON files in `config`, `templates` and `locales` parsed successfully.
- `git diff --check` passed.
- No remaining literal `height="auto"`, `src=""` or `aria-label="Loading..."` patterns were found in sections, snippets or blocks.

## Items controlled outside theme code

The following PageSpeed costs come from Shopify or installed apps and were deliberately not removed because they can affect store analytics or conversion features:

- Google Analytics / Google tag (explicitly installed for the store)
- Loox review widget
- ReCart scripts
- Shogun pixel collector
- Shopify-generated `compiled_assets/styles.css` and platform scripts

After the theme change is deployed, review the Shopify App Embeds panel and disable any unused Loox, ReCart or Shogun embed. This is the only safe way to remove those third-party costs.

## After-score status

An honest after score requires these theme changes to be deployed to the tested storefront first. Re-run the same public URL in PageSpeed Insights after deployment, preferably three times per device, and use the median result. Compare LCP, total transferred bytes, DOM size and accessibility failures—not only the headline score.
