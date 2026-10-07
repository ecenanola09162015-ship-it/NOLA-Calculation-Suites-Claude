# Project explorer interface

The web launcher implements the approved interface catalogue: Concrete (11), LOADS (3), Steel (4), Geotechnical (6). Only RC Column, Steel Column and Soil Bearing Capacity carry Pilot badges. All other cards are Future Development. These UI badges are independent of the calculation-engine roadmap; no formula or verified result is introduced by this milestone.

Projects require Project Name, Building Name, Location, Prepared By, Checked By and Approved By. Existing project records remain readable; additive columns default to empty strings. Account-scoped interface drafts appear beneath their owning project. Pilot cards create metadata-only drafts; future cards show planned-workspace notices. Saved drafts and project metadata are backed by Neon. The responsive explorer becomes a slide-out panel on narrow screens.

Each icon is a separate file under `apps/web/public/icons/<module-slug>.svg`. Replace that SVG to change artwork without altering calculations or card layout. Use a 96 × 96 viewBox and keep meaningful geometry inside the canvas.

Validation: web production build and TypeScript, repository lint and existing engine safety tests, server-rendered catalogue smoke check (24 cards, exactly three Pilot badges, icon coverage, foundation category, and locked-engine notice). Signed-in project creation and cloud reload require an authenticated browser check against the test deployment before treating them as fully verified.
