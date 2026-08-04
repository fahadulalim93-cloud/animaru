"use client";

/**
 * BrowsePage — thin wrapper that renders the new pure-black Browse component.
 *
 * The actual implementation lives in ./browse-new.tsx
 * The CSS lives in ./Browse.css
 *
 * This wrapper exists so existing imports (anime-section-page.tsx imports
 * `BrowsePage from "./browse-page"`) keep working without changes.
 */
import Browse from "./browse-new";

export default function BrowsePage() {
  return <Browse />;
}
