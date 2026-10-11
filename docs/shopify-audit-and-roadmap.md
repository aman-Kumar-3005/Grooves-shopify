# Grooves Shopify audit and implementation roadmap

Prepared 21 September 2026. Baseline: local commit `7be9b1a`, Savor 4.1.5, exported theme in `D:/Grooves shopify`. Updated after the first implementation pass. This remains an implementation record, not a claim that the storefront has been certified for launch.

## Decision and scope

Keep Savor for the MVP. Its native product forms, filters, search, cart drawer, recommendations, responsive media, and structured data provide a useful foundation. Repair the custom merchandising sections and configure real catalog data before considering a theme replacement. Prioritize trustworthy content, a working purchase path, product compatibility information, and mobile speed before adding campaigns or more motion.

The first implementation pass removed fabricated product ratings, unsafe custom-slider variant selection, customer-visible shoppable-video placeholders, unsupported testimonial badges, unsupported cart urgency/promotional claims, and the HTTP Open Graph image defect. The hero now has a collection fallback CTA and responsive image candidates; product and collection pages now share visible breadcrumbs and BreadcrumbList JSON-LD. Merchant policy, catalog, checkout, app, and live-performance verification remain open.

**Evidence boundaries**

- **Confirmed in export:** code and configured template values, with file references below. The export may differ from the published theme.
- **Conditional defect:** code demonstrably fails under a specified condition; catalog or browser data is needed to establish current customer exposure.
- **Verification required:** storefront measurements, admin settings, app behavior, actual product information, stock, order flow, analytics, accessibility results, and rendered SEO output.
- Reviewed layout, metadata, configuration, all principal templates, custom sliders, hero, testimonials, video sections, native collection/product/review components, and script-loading architecture. Parsed 73 JSON files after stripping comments and 145 embedded section/block JSON schemas successfully. This checks syntax only, not Shopify schema rules or rendered Liquid. Shopify CLI was not available, so Theme Check was not run.
- No live checkout transaction, visual browser audit, Lighthouse run, security penetration test, or full URL crawl was performed. No speed scores, conversion rates, sales rankings, or vulnerability clearance are asserted.
- `grooveslifestyle.com` was inferred from the support email and opened read-only. Its retrieved homepage differs from the export. It names products including Alpha100 and Signature2.0 and shows Power Bank and Adaptor headings without products in the extracted text. Treat these as public-page observations to verify visually, not proof of empty inventory or that this is the target Shopify storefront. The export's `1tsavh-dz.myshopify.com` address could not be retrieved by the browsing tool; that does not establish an outage. [Public homepage](https://grooveslifestyle.com/)

**Planning assumptions:** India/INR, English first, six core collections, up to 100 parent products, existing Shopify checkout, one experienced Shopify developer with part-time design/content and QA support. The brand is provisionally Grooves; MEWALT may be its legal entity and must be explained consistently rather than simply removed. Confirm domain, published theme ID, Shopify plan, Markets, catalog size, existing apps, policies, and launch date during discovery. Gulf markets mentioned in the footer require separate shipping, currency, language, and policy validation.

## Prioritized audit register

P0 = launch/relaunch blocker; P1 = MVP requirement; P2 = enhancement. Effort is hands-on effort, excludes merchant decisions, and overlaps with roadmap estimates; do not add it again to the phase totals.

| ID | Priority / area | Finding and evidence | Concrete fix | Acceptance / effort |
|---|---|---|---|---|
| A01 | P0 · trust / reviews | **Implemented in theme code.** The custom slider now renders a genuine rating/count only when both exist; random-rating settings and fallback values were removed. Existing template JSON values are harmless unknown settings but should be cleaned in Theme Editor. | Validate against the installed review provider and rendered product fixtures. | Code path has no fabricated rating; live review-source verification remains open. |
| A02 | P0 · purchase path | Both blocks in `templates/index.json → hero_RkimKJ` have `button_label: Shop Now`, blank `slide_link`, and blank heading/subheading. `sections/hero.liquid:579` requires a link to output the button. | Give the primary hero one real collection/PDP destination, live HTML heading, benefit statement, and CTA. Verify image-baked copy is not the only message. | Keyboard/touch CTA reaches an in-stock collection/product; no blank href. 1–2 h plus assets. |
| A03 | P0 · cart correctness | **Implemented for the custom slider.** It uses `selected_or_first_available_variant`, locale-aware `routes.cart_add_url`, and sends products with choices or selling plans to the PDP. | Reuse/native behavior remains preferred; run the required inventory, selling-plan, quantity, and rapid-click tests in a preview store. | Static Liquid diagnostics pass; live cart behavior remains unverified. |
| A04 | P0 · commercial accuracy | Header says free shipping above $50. Homepage marquee says free prepaid shipping and 24-hour replacement; trust blocks say seven-day returns/exchange and a one-year no-questions-asked warranty. Homepage also claims 2.5 crore customers, blanket 50% discount, and a PREPAID offer. | Merchant signs off one policy/offer matrix. Replace unsupported assertions, align shipping/returns/warranty copy with operations, and test actual discount eligibility and stacking. Localize money. | Header, PDP, cart, policies, support and checkout describe the same rules; offers work in test orders. 4–6 h plus approval. |
| A05 | P0 · incomplete content | **Implemented in `sections/shoppable-videos.liquid`.** Incomplete blocks are editor-only, valid cards require both product and media, and Shopify's video renderer is used. | Remove empty instances from product/cart templates in Theme Editor and audit assigned handles in admin. | Code has no public placeholder/dead link; rendered preview verification remains open. |
| A06 | P0 · release verification | Export cannot establish payment, taxes, shipping zones, gateway availability, discounts, stock synchronization, or checkout readiness. | Complete checkout/configuration matrix and test order, fulfillment, cancellation, and refund workflow before launch. Confirm stock and bundle inventory. | Recorded end-to-end results for each offered payment/shipping scenario; no pending blocker. 1–2 days in launch QA. |
| A07 | P1 · authenticity | `sections/custom-testimonials.liquid:154–164` gives every manually entered testimonial five stars and “Verified Buyer.” Press logos have blank source links in the homepage configuration. | Use documented customer permission and review provenance; only source-verified orders receive the badge. Link substantiated press coverage or hide the claim. Explain Grooves/MEWALT relationship in About/footer. | Evidence recorded for each public endorsement; no automatic verification badge. 3–5 h plus merchant evidence. |
| A08 | P1 · navigation / discovery | Active `dynamic_collection_slider_cyxfNq` has five categories and omits Headphones; the separate six-category collection list is disabled. | Show all six categories consistently in header, homepage tiles and footer. Keep existing handles (`adaptor`, `combo`, `power-bank`) unless migration is justified; display polished plural names. | All six categories reachable within two actions on mobile; menus have no empty collections/dead destinations. 3–5 h. |
| A09 | P1 · PDP conversion | `templates/product.json → main → product-details` places the full description before variant picker and buy buttons. There is a native review summary, but no dedicated review-list app block or technical specifications section in this template. Generic brand copy follows. | Move concise benefits and essential compatibility near price; place variants/ATC before long description. Add specs, box contents, approved delivery/warranty copy, genuine review list, and relevant complements. Verify apps injected elsewhere before adding one. | Buy controls stay easy to find; six product-category fixtures show accurate specs with no blank rows. 1–2 days. |
| A10 | P1 · performance | Hero requests one 1600px mobile image and one 2400px desktop image rather than width candidates (`sections/hero.liquid:546,553`). First slide already correctly uses eager/high priority. | Preserve first-slide priority; add responsive width candidates and accurate sizes, separate mobile art direction, and source compression. Prefer one static hero. | Mobile chooses an appropriate source; no duplicate desktop/mobile fetch; no LCP fade-in. 3–5 h. |
| A11 | P1 · media reliability | Two similarly named video sections are active. `shoppable-videos.liquid:163` assumes `sources[1]` is MP4; scripts use document-wide selectors and the first track's autoplay setting. The second implementation also uses global selectors and a global YouTube callback. | Consolidate into one section-scoped component. Use Shopify video output or inspect MIME types; initialize per instance, clean up on unload, and support editor rerenders. Load/play only intentionally and pause offscreen. | Two instances with different settings work independently; single-source video works; no duplicate listeners. 1–2 days. |
| A12 | P1 · accessibility | Hero dots are 12×12px (`hero.liquid:436`); carousel autoplay pauses on mouse hover only; no explicit pause, focus pause, reduced-motion support, or inactive-slide focus exclusion is present. Testimonials also auto-scroll. Video cards lack usable playback controls. | Static MVP hero; otherwise large hit areas, visible pause, focus/hover pause, reduced-motion handling, current-slide semantics and inactive-slide focus management. Provide captioned, controllable video outside the product-link click target. | Keyboard, screen-reader and reduced-motion tests pass; no focus moves to hidden slides. 1–2 days including A11. |
| A13 | P1 · design consistency | Native square burgundy/cream styling coexists with rounded black custom cards, varying section widths, tiny card text and repeated “Newly In / Prebook @” merchandising. Homepage has 17 enabled sections. | Use one token system and one product-card implementation. Consolidate homepage to 7–9 useful sections; remove empty custom-liquid space. Use actual new-release/preorder data. | Consistent cards, money, spacing and states across homepage/PLP/PDP/cart; no unsupported preorder label. 1–2 days. |
| A14 | P1 · SEO | **Partially implemented.** Product and collection pages now render shared visible breadcrumbs and matching BreadcrumbList JSON-LD in `snippets/grooves-breadcrumbs.liquid`; admin metadata and rendered-schema validation are still unavailable from the export. | Populate admin metadata and validate representative product, collection, variant, and Market URLs; check for app duplication. | Static code diagnostics pass; live crawl and Rich Results validation remain open. |
| A15 | P1 · social previews | **Implemented in `snippets/meta-tags.liquid`.** `og:image` now uses HTTPS and `og:site_name` is escaped. Price formatting, fallback imagery, and Markets output still require a rendered storefront check. | Test shared product and collection URLs across the active currencies and validate with platform debuggers. | Static diagnostics pass; live preview validation remains open. |
| A16 | P1 · filtering | Collection/search templates enable filters; facet code exists. Actual Search & Discovery setup and rating data are unknown. | Configure taxonomy, availability, price, compatibility and category-specific filters. Implement genuine review-derived rating thresholds as supported metafield filters. | Filters operate over all results, survive refresh/back, and show clear chips/counts/no-results recovery. 1–2 days. |
| A17 | P1 · scripts / privacy / security | Native modules plus global custom scripts require runtime review. YouTube iframe API is conditionally injected by one section. No app inventory, pixel settings, scopes, or account-security evidence is available. This is not a confirmed exploit. | Inventory scripts/apps, owners, purpose, consent behavior and permissions. Keep credentials server-side; escape output; use supported Customer Privacy/pixel integrations. Remove unused integrations after dependency review. | Runtime requests and consent states documented; no private token in served assets; least-privilege roles and app scopes checked. 0.5–1 day plus access. |
| A18 | P1 · release hygiene | Only initial Git commit observed; export ZIP exists, but no Shopify deployment/Theme Check workflow is present. | Establish unpublished preview theme, change tracking, Theme Check, preview acceptance and rollback runbook. Prevent audit docs/ZIP from being uploaded. | Release artifact, theme IDs, source commit and admin change log recorded; rollback rehearsed. 0.5–1 day. |
| A19 | P2 · 404 recovery | `templates/404.json` already provides a clear H1, explanation, all-products CTA and three recommendations. | Retain it; add search and six useful category links, curate recommendations, and track meaningful broken inbound URLs. | Real missing URLs remain HTTP 404; no blanket redirect to home. 2–3 h. |
| A20 | P2 · growth measurement | Catalog rankings, margins, acquisition economics and analytics quality are not in the export. | Validate events, build a contribution-margin-aware funnel dashboard, and test hero/benefits/bundles sequentially. | No duplicate purchases; decisions use channel/device cohorts and agreed statistical rules. 1 day setup, ongoing review. |

## Front-end design and merchandising specification

**Visual direction:** accessible consumer electronics retail with generous white space, accurate product photography and concise technical benefits. Preserve the existing burgundy `#A42325` as the primary action color, use `#111111` text, `#FFFFFF` surfaces, `#F6F7F9` secondary surfaces, and restrained warm accent panels. Treat palette contrast as a test requirement for every state. Use the existing theme's font settings with one readable sans family, at most two weights, 16px body text, approximately 1.5 line height, 32–40px mobile hero headings and 48–64px desktop headings. Avoid all-uppercase paragraphs.

Use an 8px spacing rhythm, 12px card radius, 8px button radius, 44–48px controls, 1280px content max width and 16/24/32px page gutters. Two mobile product columns where text fits; one column at narrow widths when needed; three tablet and four desktop columns. Maintain a shared card image ratio and reserve media space. These are proposed tokens, not a rendered mockup.

**Homepage sequence**

1. One factual announcement: approved delivery or offer information with terms link.
2. Compact header: logo, all six categories, visible search affordance, Support, account and cart; sticky behavior only if it does not consume too much mobile space.
3. One static, editorial hero: “Sound for your day. Power for your devices.” Support copy: “Explore earbuds, headphones and everyday charging essentials.” Primary CTA “Shop earbuds”; secondary text link “Explore charging.” Adjust once brand positioning is confirmed.
4. Six category tiles: Earbuds, Headphones, Accessories, Combos, Power Banks, Adapters.
5. Four to eight best sellers based on fulfilled-order data, in-stock status and margin. Until data is available label this “Featured products,” not “Best sellers.”
6. One compatible combo offer with explicit component choices, inventory-aware price and real savings.
7. Two or three verified service benefits, linked to details.
8. Genuine reviews or one short customer demonstration with permission; do not fill empty proof slots with invented content.
9. Buying-guide links and footer containing contact, tracking, warranty, shipping, returns, privacy and terms. Newsletter can sit in the footer with a clear value proposition and consent wording.

**Collections and search:** place breadcrumb, collection H1 and a short useful intro above the grid. Put longer buying guidance/FAQs beneath the grid. Desktop gets a filter sidebar or compact bar; mobile gets Filter/Sort buttons and an accessible drawer. Show selected chips, result count, Clear all, price inputs with currency, and useful no-results recovery. Start with 24 products and crawlable pagination; enhance with “Load more” while preserving URL/back behavior. Search should handle “adaptor/adapter,” “TWS/earbuds,” exact model names and common misspellings. Keep pages/articles secondary to product results.

Cards show a sharp image, model name, one verified distinguishing feature, current price, valid compare-at price, honest rating/count, availability and one action. Single default-variant products get Add to cart; selectable products get Choose options. Quick view is an accessible native dialog with image, price, essential specs, choices and a full-details link; load it on demand. Avoid hover-only controls on touch screens.

**Product detail layout:** desktop 55/45 media/details split; mobile media followed by title, review link, price/tax information, three short benefits, compatibility, variants, availability, ATC and delivery summary. Keep the existing sticky ATC but synchronize selected variant, quantity, price and availability; do not cover browser safe areas, consent notices or chat. Longer content follows: detailed description, specifications, box contents, instructions, warranty, genuine reviews and FAQs. Recommend two or three compatible complements rather than unrelated “new” items. Show charger/cable inclusion explicitly and distinguish earbuds-only battery life from combined case life.

**Cart:** use the existing drawer and full cart page. Immediately confirm product, selected variant and quantity; allow edit/remove, show real discount allocations, subtotal and accurate delivery/tax wording. One optional compatible add-on is enough. Keep checkout prominent; empty cart offers a useful collection link. A free-shipping progress indicator is permitted only when it uses the actual market/payment/shipping rule; prepaid-only eligibility cannot be guaranteed before payment selection. No preselected paid add-ons or fabricated urgency.

**Asset brief**

| Asset | Master dimensions / composition | Delivery target and usage |
|---|---|---|
| Desktop hero | 2400×1000; product on one side, 40% quiet space for live text | Responsive 960/1440/1920/2400 candidates; aim ≤250 KB delivered at common desktop width |
| Mobile hero | 900×1125; independently composed crop, generous safe area | 360/540/750/900 candidates; aim ≤150 KB delivered; content-driven section height |
| Category tiles | 800×800, consistent lighting and scale | 160/240/400 candidates; approximately 20–50 KB each |
| Product gallery | 2000×2000 originals; square clean main image | White/neutral background, actual SKU/color; 320–1600 candidates and on-demand zoom |
| Product secondary media | 2000×2000 or consistent 4:3 | Front/back, ports, in-ear/on-head scale, box contents, measured dimensions and one readable feature diagram |
| Campaign banner | 1600×600 desktop; 900×900 mobile | Separate crops, ≤150/100 KB initial target |
| Social share | 1200×630 | Brand + model/category; test platform crop and text legibility |
| Demonstration video | 1080×1920 portrait or 1920×1080 landscape, 10–20 sec | Poster first; captions/transcript; no video transfer until intent/eligible visibility; optimized stream/source |

Byte sizes are project budgets to verify with the network panel, not observed results. Keep high-quality masters; Shopify image filters/CDN deliver responsive formats. Do not serve huge transparent PNGs for ordinary photographs. Use real approved product photography; any generated lifestyle background must preserve exact hardware shape, port locations, included accessories and branding. No actual image assets were generated as part of this audit.

Alt text identifies the product, color and relevant view: “Grooves [model] black earbuds with charging case open”; “Rear USB-C charging port on Grooves [model].” Decorative backgrounds/redundant images use empty alt where appropriate. Linked image-only category cards need an accessible category name. Avoid keyword lists, repetitive “image of,” and duplicating surrounding text. Put essential specs and offers in HTML, not only in images.

## Architecture, data and feature implementation

**Theme priority:** retain Savor and favor native section/block composition over replacement scripts. Review custom differences against a clean licensed version before any update; do not overwrite `header.liquid` or other heavily customized files with upstream versions blindly. Create reusable `grooves-benefits`, `grooves-specifications`, `grooves-compatibility` and `grooves-bundle-offer` sections/blocks only where native blocks cannot meet the need. Keep section settings editable, scope CSS to the instance, use locale strings, and expose app-block insertion where supported.

Use shared templates by category only when content/layout truly differs: audio, charging, accessories and combos. Keep catalog values in products/variants, not hardcoded section settings. Reuse `descriptors.subtitle`, which is already referenced in product cards. Assign Shopify's standard product taxonomy and category attributes first; add custom metafields for missing commercial information.

| Proposed definition | Shopify type / owner | Use and validation |
|---|---|---|
| `descriptors.subtitle` | Existing definition; inspect type before migration | One accurate card benefit; avoid redefining existing data incompatibly |
| `custom.key_benefits` | `list.single_line_text_field` / product | Maximum three concise approved claims |
| `custom.compatibility` | `list.single_line_text_field` / product, variant when different | Devices/protocols actually supported; standardized vocabulary |
| `custom.battery_hours` | `number_decimal` / product | State measured conditions and whether case included; omit if irrelevant |
| `custom.capacity_mah` | `number_integer` / product | Rated capacity, not a promise of delivered device charge |
| `custom.output_watts` | `number_decimal` / product or variant | Maximum output with protocol/port conditions explained |
| `custom.charging_protocols` | `list.single_line_text_field` / product | PD/PPS/etc. only if substantiated; filter source |
| `custom.anc` | `boolean` / audio product | ANC and call-noise reduction must be distinguished |
| `custom.warranty` | `metaobject_reference` / product | Approved policy title, term, exclusions, claim URL |
| `custom.box_contents` | `list.single_line_text_field` / product | Clarify included charger/cable/tips and quantities |
| `custom.faqs` | `list.metaobject_reference` / product or collection | Question/answer entries; useful visible content first |
| `custom.primary_collection` | `collection_reference` / product | Stable breadcrumb category; verify Online Store visibility |
| `custom.complements` | `list.product_reference` / product | Curated compatible cross-sells if native complementary recommendations are insufficient |
| `reviews.rating`, `reviews.rating_count` | Standard rating / integer definitions; review provider owns values | Genuine review aggregates; no merchant-entered random values |
| `custom.rating_thresholds` | `list.single_line_text_field` / product | Derived strings such as “3 stars & up”, “4 stars & up”; only for rated products |

Rating filtering needs explicit implementation: Shopify's documented supported metafield filter types do not include the `rating` type. Derive a supported list-of-text field from genuine aggregates. A product at 4.6 receives both “3 stars & up” and “4 stars & up”; an unrated product receives neither. Refresh after review moderation/deletion/import, use server-side app automation or a verified provider integration, and make the UI single-choice to avoid confusing threshold combinations. Do not filter only the products on the current page. The native price filter is limited to the store's default currency, so non-INR Markets need a separate tested approach or a clearly omitted price control. [Shopify filter requirements and types](https://help.shopify.com/en/manual/online-store/storefront-search/search-and-discovery-filters)

**Feature acceptance contracts**

| Feature | MVP implementation | Done when |
|---|---|---|
| Discovery and quick add | Native server-rendered grid, predictive search, Search & Discovery facets, native quick-add selector | Correct result counts across pages; accessible keyboard flow; available chosen variant is added; no silent errors |
| PDP and reviews | Four content patterns using metafields; real review summary and list; synchronized sticky ATC | Correct price/media/stock for every variant; unknown claims omitted; review anchors and moderation work |
| Bundles and cross-sells | Start with 2–3 fixed compatible combos; native related/complementary recommendations | Component stock, variants, fulfillment, discounts, returns and partial refunds behave correctly |
| SEO | Admin metadata, retained canonical/OG/product schema, added breadcrumbs, crawl map | Accurate rendered markup on representative variants/Markets; no accidental noindex or broken redirects |
| Performance | Responsive media, poster-first videos, component loading and app cleanup | Agreed page budgets met or documented; measured improvement on matched test conditions |
| Accessibility / responsive | WCAG 2.2 AA target; native dialogs/forms, labels, errors, motion controls | Manual keyboard/screen-reader tests plus automated checks; no critical journey blocker |
| Measurement | Supported Shopify pixel/app integrations; consent-aware funnel events | One purchase per order/transaction ID, correct currency/value, no PII in analytics payloads |

Use Shopify Bundles for fixed bundles/multipacks if it fits inventory and fulfillment requirements; evaluate a third-party app only for mix-and-match or unmet requirements. Adding several cart lines does not itself enforce a bundle discount or inventory relationship. Apply pricing rules through supported Shopify products/discounts/apps and validate discount combinations. [Shopify Bundles](https://help.shopify.com/en/manual/products/bundles/shopify-bundles)

The storefront theme controls the cart, not arbitrary checkout internals. Configure checkout branding and supported extensions according to the actual plan; advanced core checkout customization has plan restrictions. Do not base the roadmap on editing `checkout.liquid` or injecting payment-page JavaScript. [Checkout customization](https://help.shopify.com/en/manual/checkout-settings/customize-checkout-configurations)

## Performance, accessibility and security work

**Measurement:** establish home, one PLP, search, six category PDP fixtures and cart baselines on a real preview/production URL. Record mobile and desktop Lighthouse runs, network traces, image candidates, long tasks and application errors under matched device/network conditions. Take three lab runs per representative template and report median plus range. Separate lab evidence from field data; a Lighthouse score alone does not prove usable checkout or good INP.

Target field p75 LCP ≤2.5s, INP ≤200ms and CLS ≤0.1, assessed separately for mobile/desktop when sufficient traffic is available. Monitor Shopify's performance reporting and Search Console/CrUX after launch; small stores may lack field coverage. [Core Web Vitals](https://web.dev/articles/vitals)

Project budgets: initial compressed theme JS ≤150 KB and CSS ≤80 KB per key template; initial above-fold image payload ≤500 KB; mobile first-load total transfer target ≤1.5 MB excluding deliberate video playback. Measure all Shopify/app bytes too, with separately documented vendor ownership. A budget overrun needs measured justification, not removal of essential Shopify code to improve a score.

Preserve eager/high priority on the actual LCP image; lazy-load below-fold media, provide dimensions, and avoid several high-priority images. Load custom media/compare/review enhancements on demand and retain server-rendered critical content. Reuse native modules, remove redundant custom slider implementations, and profile before changing shared imports. Serve theme assets with `asset_url` and media with `image_url`; Shopify owns platform/CDN caching. Do not introduce a service worker that caches cart, checkout, accounts, live inventory, personalized HTML or stale prices. [Shopify performance guidance](https://shopify.dev/docs/storefronts/themes/best-practices/performance)

Audit fonts, CSS coverage and module requests in the browser. Large source-file size does not establish a runtime bottleneck. Keep code splitting/component loading compatible with Shopify's section rendering and editor lifecycle, with idempotent initialization and cleanup. Make the native HTML form usable if the custom Ajax enhancement fails.

Accessibility acceptance includes meaningful page heading hierarchy, landmarks/skip links, 4.5:1 normal-text contrast and 3:1 large-text/UI contrast where applicable; visible focus; meaningful link/button labels; selected swatches described in text; keyboard-accessible filters, quick view, menus, cart and accordions; focus trapping/restoration for dialogs; status/error announcements; touch targets designed at 44px or larger; captions and reduced-motion behavior. Test at 320, 375, 768, 1024 and 1440px, at 200% zoom and at 400% reflow, plus iOS Safari and Android Chrome. Existing `lang` and skip-to-content support should be preserved. Automated accessibility tools supplement manual testing. [Shopify accessibility guidance](https://shopify.dev/docs/storefronts/themes/best-practices/accessibility)

Security/admin review: verify HTTPS and primary-domain redirects, staff 2FA/least privilege, collaborator access expiry, app scopes and owners, token/secret scanning, abandoned app script removal, contact/newsletter spam handling, and supported privacy/pixel settings. Escape plain text and attributes; use JSON serialization for structured data; review dynamic DOM insertion with its actual data source instead of labeling every `innerHTML` a vulnerability. Keep Admin API credentials and review synchronization secrets out of Liquid/assets. Validate request signatures/webhooks in any new app backend. Do not collect payment details through theme code. Do not claim a theme export can prove PCI, legal compliance, or account security.

## SEO and content specification

Complete metadata for every published product and collection in Shopify admin, not merely for the featured examples below. Export the catalog, join it to actual landing-page traffic and fulfilled-order sales, then prioritize the top ten products, all six collections and remaining catalog. Verify product category/model/specs before writing, and maintain a review sheet with handle, canonical URL, H1, title, description, primary query, image alt coverage and approval state.

Editorial targets: titles usually around 50–60 characters and descriptions around 140–160 when useful; these are preview guides, not ranking rules or hard character limits. Avoid duplicated brand suffixes because `meta-tags.liquid` already appends `shop.name` when absent. Titles/descriptions must not assert unverified ratings, “No.1,” free delivery, discounts, ANC, capacity, warranty or charging speed.

| Page / current or proposed path | Suggested meta title | Suggested meta description |
|---|---|---|
| Home `/` | Earbuds, Headphones & Charging Accessories \| Grooves | Explore Grooves earbuds, headphones, accessories, combos, power banks and adapters. Compare product details and find gear for your everyday routine. |
| `/collections/earbuds` | Wireless Earbuds & TWS Earphones \| Grooves | Discover Grooves earbuds for everyday listening. Compare fit, battery specifications and features, and choose the model that suits your routine. |
| `/collections/headphones` | Headphones for Everyday Listening \| Grooves | Explore Grooves headphones and compare fit, connectivity and model specifications. Find audio gear for work, travel and everyday listening. |
| `/collections/accessories` | Mobile & Audio Accessories \| Grooves | Browse Grooves accessories for your everyday setup. Check connections, compatibility and box contents to choose the right accessory for your device. |
| `/collections/combo` | Audio & Charging Combos \| Grooves | Explore Grooves product combos. Compare included items, compatibility and bundle prices to choose a complete setup for listening and charging. |
| `/collections/power-bank` | Power Banks & Portable Charging \| Grooves | Compare Grooves power banks by rated capacity, ports and supported output. Check device compatibility and find portable charging for your routine. |
| `/collections/adaptor` | Charging Adapters & Device Compatibility \| Grooves | Explore Grooves charging adapters. Compare ports, power output and supported charging protocols before choosing an adapter for your device. |
| About, resolve actual handle | About Grooves \| Audio & Everyday Tech | Learn about Grooves, the products we make and the company behind the brand. Find information about our audio range, accessories and customer support. |
| Existing contact page | Contact Grooves \| Product & Order Support | Contact Grooves for help with products, compatibility or an existing order. Find our support details and the information needed to resolve your query. |
| Warranty page, resolve actual handle | Grooves Warranty & Product Support | Read the approved Grooves warranty terms, check eligibility and learn how to request support. Keep your order details ready when making a claim. |
| Blog, resolve actual handle | Audio & Charging Buying Guides \| Grooves | Explore practical guides to earbuds, headphones, charging adapters and power banks. Understand compatibility and choose accessories with confidence. |

Collection labels and claims must match inventory; if a collection has no usable products, do not advertise it as a stocked destination. Cart, search, account and internal utility URLs do not need acquisition-focused SEO copy.

**Product metadata examples:** no sales export was supplied, so true best sellers are unconfirmed. These three names were observed on the inferred public site and serve as candidate drafts only; they are not a mapping to the exported Shopify handles. Validate exact names, specifications and availability, then apply this structure to the actual top sellers. [Observed product names](https://grooveslifestyle.com/)

| Candidate | Title draft | Description draft |
|---|---|---|
| GROOVES Alpha100 | Grooves Alpha100 Earbuds \| Features & Specifications | Explore Grooves Alpha100 earbuds. Review product specifications, available options and box contents, then check compatibility before placing your order. |
| GROOVES Signature2.0 | Grooves Signature 2.0 Headphones \| Product Details | Discover Grooves Signature 2.0 headphones. Compare product details, available options and box contents to decide whether they suit your listening needs. |
| Grooves 25 W PD | Grooves 25 W PD Charger \| Compatibility & Details | View the Grooves 25 W PD charger. Check supported charging protocols, connections and device compatibility, and confirm what is included before buying. |

For the final catalog pass, replace generic wording with approved differentiators. Product title template: `[Brand] [Model] [Product type] – [verified differentiator]`. Description template: `Explore [model/type] with [verified feature]. Check [compatibility/fit], [box contents or support detail] and available options.` Variant colors share the base product SEO unless there is a deliberate separate indexable product strategy. Collection template: `[Category] – [meaningful choice attribute] | Grooves` plus a unique category description. Do not mass-publish unreviewed boilerplate.

**Structured data:** retain the existing `closest.product | structured_data` in `sections/product-information.liquid:3–4`; Shopify's filter supports product/variant representations. Validate actual Product/ProductGroup/Offer output, prices, currency, availability, identifiers and image URLs across variants/Markets. Add no parallel generic Product object. Decide whether theme or review app owns review enrichment; use genuine, visible ratings/counts and stable matching entity IDs. No review schema for manually fabricated testimonials. Keep existing Article output and review the Organization data in `header.liquid`; add accurate logo/contact/social identity only. Add visible breadcrumbs and matching BreadcrumbList. Do not promise rich results from technically valid markup. [Shopify structured data](https://shopify.dev/docs/api/liquid/filters/structured_data), [Google product guidance](https://developers.google.com/search/docs/appearance/structured-data/product), [Google breadcrumb guidance](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)

**Canonical and redirect rules**

| URL class / event | Rule |
|---|---|
| Product reached through a collection | Link internally to `product.url`; retain Shopify's canonical product URL rather than generating a collection-context duplicate |
| Variant query | Preserve variant selection/deep links; normally canonicalize to parent product through existing Shopify output; confirm deliberate variant SEO exceptions |
| Facet/sort/tracking query | Retain intended Shopify canonical behavior and inspect rendered output; use curated collections for valuable search intent rather than indexable arbitrary filter combinations |
| Paginated collection | Keep crawlable page links and distinct pagination URLs; verify canonical to that page, not a blanket canonical to page 1 |
| Markets/locales | Preserve legitimate localized URLs and platform hreflang; verify reciprocal alternates and self-canonicals per market; do not collapse all languages into English |
| Renamed handle | Avoid changes for cosmetic spelling alone. If needed, create an old-to-new Shopify URL redirect, update links/feeds, and test one hop to a relevant 200 destination |
| Deleted product | Keep an informative page for temporary stockouts. For permanent removal use a genuinely equivalent replacement when one exists; otherwise a useful real 404. Never redirect every deleted SKU to home |
| Old public site migration | First confirm domain/platform relationship. Crawl actual legacy URLs and map each to its Shopify destination before any DNS or domain change |

Redirect inventory columns: source URL/path, destination, reason, page type, traffic/backlinks, status, owner and verified date. Shopify redirects generally apply when the old path no longer resolves; verify collisions with active resources. Test 301 status, no loop/chain, correct language, correct destination and updated internal links. Do not redirect ordinary query variants or introduce client-side redirects for index migration. [Shopify URL redirects](https://help.shopify.com/en/manual/online-store/menus-and-links/url-redirect)

Shopify generates `/sitemap.xml`; absence of that file in this repository is expected. Submit the verified primary-domain sitemap in Search Console and check product/collection inclusion and localized sitemap behavior. No `robots.txt.liquid` exists here; keep Shopify defaults unless a measured crawl issue requires a narrowly scoped change. Robots rules control crawling, not guaranteed deindexing; do not block a URL and assume Google can read a new noindex on it. Inspect any private/staging exposure separately. [Shopify sitemap](https://help.shopify.com/en/manual/promoting-marketing/seo/find-site-map), [Shopify robots guidance](https://help.shopify.com/en/manual/promoting-marketing/seo/editing-robots-txt)

**Eight-week organic content calendar:** publish one substantive buying guide weekly, with original product examples, named editor/reviewer, source-backed technical claims and links to a relevant collection plus two to four compatible products. Do not invent search volumes; prioritize using Search Console and keyword research during discovery.

| Week | Article / query intent | Commercial destination |
|---|---|---|
| 1 | How to choose earbuds for calls, commuting and music | Earbuds + use-case comparison |
| 2 | ANC vs call-noise reduction: what each feature does | Audio models with verified capabilities |
| 3 | USB-C, USB PD and PPS: a compatibility buying guide | Adapters + compatible cables |
| 4 | Choosing a power bank: capacity, output and device needs | Power Banks |
| 5 | Which cable do you need? Ports, power and data explained | Accessories |
| 6 | Earbuds vs headphones for everyday use | Earbuds + Headphones |
| 7 | Build a travel charging kit: adapter, cable and power bank | Compatible Combos |
| 8 | Why charging may be slower than expected: a compatibility checklist | Adapters + Accessories + support |

Publish comparison tables from verified specifications, original photos and honest limitations. Answer category questions below collection grids, avoid thin duplicate blogs, and refresh stale model links quarterly. Start Merchant Center/free-listing and high-intent paid campaigns only after feed accuracy, policy pages, purchase tracking and checkout pass. Match campaign landing pages to the specific category/offer. Use consented welcome, abandoned-checkout and post-purchase education/review-request flows through supported integrations; this report does not authorize sending customer messages.

## Implementation examples and integration notes

These examples are specifications to adapt and test on an unpublished theme, not deployed changes. Preserve Savor's event/component contracts and translations. Examples deliberately avoid a second independent cart implementation.

**A. Render genuine rating data in the custom slider.** Replace the whole fake/fallback block, not just its enabled setting. The existing native review block is another reuse option.

```liquid
{%- liquid
  assign actual_rating = product.metafields.reviews.rating.value
  assign actual_count = product.metafields.reviews.rating_count.value | default: 0
-%}
{%- if actual_rating != blank and actual_count > 0 -%}
  <span class="product-rating">
    {{ actual_rating.rating | round: 1 }} / {{ actual_rating.scale_max }}
    ({{ actual_count }})
  </span>
{%- endif -%}
```

Localize the full accessible rating/count sentence and link it to the genuine review section on the PDP. Do not round data before calculating threshold eligibility.

**B. Safe HTML fallback for simple one-variant products.** In production, prefer rendering Savor's existing product-card/quick-add component. This outline prevents first-variant guessing and retains a no-JS purchase path.

```liquid
{%- assign chosen_variant = product.selected_or_first_available_variant -%}
{%- if product.available == false -%}
  <button type="button" disabled>{{ 'products.product.sold_out' | t }}</button>
{%- elsif product.has_only_default_variant and product.requires_selling_plan == false -%}
  <form method="post" action="{{ routes.cart_add_url }}">
    <input type="hidden" name="id" value="{{ chosen_variant.id }}">
    <input type="hidden" name="quantity" value="1">
    <button type="submit">{{ 'products.product.add_to_cart' | t }}</button>
  </form>
{%- else -%}
  <a href="{{ product.url }}">{{ 'products.product.choose_options' | t }}</a>
{%- endif -%}
```

Translation keys shown are proposed; use existing Savor keys or add them in all published locales. Products with minimum quantities, personalization or required line properties should also go through their full product form. If enhancing with Ajax, use the existing Savor handler; otherwise a new adapter must use locale-aware `window.Shopify.routes.root + 'cart/add.js'`, handle non-2xx/422 responses, prevent repeat submits, announce success/error, and refresh drawer plus cart count through supported section rendering. Do not fabricate native event names. Inventory errors must leave retry possible and must not open a success state. [Shopify Cart API](https://shopify.dev/docs/api/ajax/reference/cart)

**C. Responsive hero media inside a proposed static hero section.** `image` is an `image_picker` and CSS reserves the intended aspect ratio. Add a separate mobile `<source>` using its own width candidates when art direction differs.

```liquid
{%- if section.settings.image != blank -%}
  {{ section.settings.image
    | image_url: width: 2400
    | image_tag:
      widths: '360, 540, 750, 960, 1440, 1920, 2400',
      sizes: '100vw',
      loading: 'eager',
      fetchpriority: 'high',
      class: 'grooves-hero__image'
  }}
{%- endif -%}
```

Only use eager/high for an actual above-fold hero; subsequent sections use normal priority/lazy loading. Section schema outline: image/mobile_image pickers, heading text, subheading text, button label, URL, optional overlay and focal-position settings; include a preset, valid defaults and no hardcoded product promise. One main homepage H1; reusable lower sections use H2. CTA only appears when both destination and label exist, with an editor-only configuration notice when incomplete.

**D. Metafield rendering with empty-state protection.**

```liquid
{%- if product.metafields.custom.key_benefits.value != blank -%}
  <ul class="product-benefits">
    {%- for benefit in product.metafields.custom.key_benefits.value limit: 3 -%}
      <li>{{ benefit | escape }}</li>
    {%- endfor -%}
  </ul>
{%- endif -%}
```

Use `metafield_tag` for approved rich-text fields, and `.value` for typed references/numbers. Specify units in visible text and filter labels; hide missing information instead of substituting invented specifications. In Savor theme blocks, pass `closest.product` explicitly when using a snippet that expects `product`.

**E. Minimal product breadcrumb JSON-LD.** Pair this with the same visible Home → Product breadcrumb; expand with a validated primary collection when available. Adapt “Home” to the active locale. This belongs once on product pages, separate from the existing Product/ProductGroup output.

```liquid
{%- if request.page_type == 'product' -%}
  {%- assign breadcrumb_home_url = request.origin | append: routes.root_url -%}
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": {{ 'Home' | json }},
          "item": {{ breadcrumb_home_url | json }}
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": {{ product.title | json }},
          "item": {{ canonical_url | json }}
        }
      ]
    }
  </script>
{%- endif -%}
```

Keep the current `<link rel="canonical" href="{{ canonical_url }}">` as the baseline. Do not install duplicate SEO tag sections or JSON-LD apps without reconciling ownership. Validate JSON and rendering with titles containing quotes, ampersands and non-English characters, plus empty reviews, sold-out variants and alternate currencies.

## Phased roadmap, owners and dependencies

One person-day means approximately eight focused hours. Workstream effort includes developer, design/content and QA time; concurrent work reduces elapsed time. Estimates assume up to 100 products with usable source material, quick merchant decisions and no complex external integration. Add approximately 15–30 minutes per additional product for researched copy/data QA; extensive photography, translation or legacy migration needs separate scope.

| Phase | Elapsed target / effort | Deliverables and owner | Exit milestone / dependency |
|---|---|---|---|
| 0 · Baseline and discovery | Days 1–2 / 2–3 person-days | Developer + merchant: verify domain/theme/plan, audit apps, catalog/order export, policy matrix, inventory, analytics baseline; duplicate published theme and capture settings | M0: confirmed store scope, approved facts, preview theme and rollback copy. Requires store access, policies and product source data |
| 1 · Purchase-path repairs | Days 3–5 / 3–4 person-days | Developer + content: A01–A05, authentic testimonials, hero CTA, all six categories, remove incomplete sections and inconsistent promises | M1: preview has no fabricated ratings/placeholders; correct variant adds; principal links and claims verified. Depends on M0 |
| 2 · MVP merchandising and SEO | Days 6–10 / 6–8 person-days | Developer + designer + content: design tokens, unified cards, four PDP patterns, metafields, search/filter/rating sync, cart cleanup, first fixed combos, metadata for all launch SKUs/collections, breadcrumbs and imagery | M2: complete catalog and six-category purchase journeys; feed/SEO preview validation. Requires final imagery, review source and bundle rules |
| 3 · Performance, QA and launch | Days 11–15 / 5–6 person-days | Developer + QA + merchant: media/script work, accessibility tests, checkout orders, redirects, measurement, staged release and 48-hour monitoring | M3: all P0/P1 issues fixed or explicitly removed from scope with owner acceptance; launch gates pass. Publication is a scheduled merchant release decision |
| 4 · Enhancements | Weeks 4–6 / 8–12 person-days | Developer + content/growth: richer quick view, comparison guide, advanced compatible bundles, review-led media, content calendar, verified retention flows and focused experiments | M4: each enhancement shows measurable benefit without degrading checkout, performance or support outcomes |
| 5 · Optimization | Weeks 7–12 / 1–2 person-days weekly | Growth + merchant: search terms, content updates, inventory-aware merchandising, funnel diagnosis and controlled tests | M5: monthly findings tied to revenue per session, margin, conversion and return/support rates |

**Expected MVP:** about three working weeks and 16–21 person-days across contributors. A single person covering all roles should allow roughly four to five weeks. Add 20% scheduling contingency for app incompatibilities/data cleanup. No ranking or conversion uplift is guaranteed. A confirmed legacy-site migration, custom rating-sync backend or multi-market rollout can add one to two weeks each depending on scope.

Critical path: policy and catalog truth → product data/imagery → purchase path → integrations → QA → release. Front-end polish cannot resolve missing fulfillment or payment decisions. Do not buy overlapping search/review/bundle apps before the native-capability and existing-app inventory is complete. Record monthly app/license costs during selection; no subscription prices are assumed here.

## Testing, release and rollback

**Backup before implementation**

- Keep the existing ZIP unchanged and separately export the currently published theme at the start of implementation. This repository export is not proof of the current live state. Existing ZIP SHA-256: `9C9C01AD7202ABE1AE1BA1E9C0BE0C43BB3A009E780956F02F9FAA3919835D54`.
- Record published theme ID/name, timestamp and Git commit. Duplicate it to a named unpublished working theme and a clearly labeled rollback theme; confirm preview URLs and app embeds.
- Export products/variants, metadata/metafields, redirects and menus using supported tools; record app configuration, Markets, shipping/discount rules, checkout settings and pixels separately. Theme backups do not restore these store-wide settings, orders or app data.
- Keep audit docs and export ZIP out of theme uploads. Use Shopify's theme directory structure and an explicit upload ignore policy or dedicated deployment directory. Preserve files containing sensitive exports outside the published theme.

**Pre-release test matrix**

| Test area | Required cases / evidence |
|---|---|
| Catalog | One fixture per category; no reviews vs genuine reviews; missing image/specs; one/many variants; first variant unavailable; fully sold out; valid preorder only if actually supported |
| Discovery | Search synonyms/model names/no results; category/price/rating filters combined; sort; pagination; URL reload/back; mobile drawer; all six menu destinations |
| Commerce | PDP and card add; variant/color/price/media changes; quantity minimums/limits; remove/update; double tap; offline/network errors; 422 inventory rejection; cart count/drawer consistency |
| Bundles | Component out of stock, variants, discount stacking, mixed carts, inventory decrement, fulfillment, partial returns/refunds; no unapproved accessory substitution |
| Checkout | Every offered gateway/payment method in a supported test mode; COD/UPI only if offered; prepaid discount eligibility; shipping zone/serviceability; taxes/invoices; address validation; confirmation and fulfillment record |
| Accessibility | Keyboard-only discovery-to-checkout; screen-reader labels/errors/status; focus restore; zoom/reflow; contrast; reduced motion; captioned playback; no obscured controls |
| Browser/device | iOS Safari, Android Chrome, desktop Chrome/Edge/Firefox and Safari where supported; representative narrow/wide viewports; slow network; JS enhancement failure |
| SEO | Crawl all indexable launch URLs; status/canonical/title/H1/description/OG; Product/Offer/Breadcrumb markup; image alt; robots/sitemap; old-to-new redirects; Markets URLs; structured-data tests |
| Performance | Matched lab traces before/after; responsive images and video transfer; no avoidable layout shifts; no serious JS errors; separate app and theme request costs |
| Analytics/privacy | Consent accepted/rejected/withdrawn; view_item_list/select_item/view_item/add_to_cart/view_cart/begin_checkout/purchase mapping; purchase deduplication and currency/value correctness; no customer PII |
| Theme editor | Add/reorder/remove every modified section; duplicate instances; no stale intervals/listeners; settings persist; app embeds and blocks render |
| Support | Contact form submission, warranty/returns links, support address and operating hours; notification/confirmation copy matches actual promises |

**Release gates:** zero open P0 defects; no broken money/variant/inventory behavior; truthful prices/policies/reviews; no customer-visible placeholders; no critical accessibility blocker; all launch URLs checked; test purchase reconciled to order/fulfillment and analytics; rollback owner and window assigned. A passing automated score alone is insufficient.

Install/run Shopify CLI Theme Check during implementation, then validate in the unpublished theme. Perform test transactions in a development environment or controlled gateway test procedure without disrupting live customers. Any final production smoke order/refund must be merchant-coordinated. Plan a low-traffic release, freeze conflicting theme-editor changes, capture final settings, publish the tested theme, and immediately recheck home → search/collection → variant → cart → checkout.

**Rollback triggers:** reproducible add-to-cart or checkout regression, incorrect price/currency/offer, missing critical content, widespread Liquid/JS errors, or accidental crawl/index restrictions. Release owner republishes the last known-good theme immediately, aiming for under 15 minutes after diagnosis; retest the same purchase path. Roll back store-wide app/discount/catalog/redirect changes through the separate change log—theme publication alone will not undo them. Preserve order records and diagnostic evidence. Repair in the unpublished theme before retrying.

Monitor errors, payment success and support tickets through the first 48 hours. Review device/channel conversion and revenue per session after one to two weeks, and field performance/indexing over the following four weeks. Compare equivalent traffic and promotion periods, annotate releases, and avoid interpreting small-sample fluctuations as causal effects.

## Measurement and optimization backlog

Primary outcomes: completed orders per session, revenue per session, gross contribution after discounts/returns, checkout completion, and return/support-contact rates. Diagnostic metrics: product views, add-to-cart rate, search success, filter use, cart errors, payment failure and bundle attachment. Define denominators consistently; segment by device, channel, market, new/returning customer and stock availability.

Prioritize post-launch experiments: (1) static hero proposition and category CTA, (2) compatibility/box-content placement on PDPs, (3) relevant combo presentation, (4) delivery information beside ATC, then (5) quick view or richer video. Establish sample-size/minimum-detectable-effect requirements from baseline traffic, change one major variable at a time, and use margin, performance and returns as guardrails. For low traffic, use moderated usability sessions and funnel diagnostics before drawing A/B conclusions.

Handoff requires an owner for catalog/spec updates, policy changes, review authenticity, app renewals, performance monitoring, content publication and release rollback. The site is ready to scale acquisition only when that operating process and the customer purchase path both work.
