/**
 * SEO Breadcrumb Component
 * 
 * Renders visible breadcrumbs + BreadcrumbList schema.
 * Critical for sitelinks and rich results.
 */

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { getBreadcrumbSchema } from "@/lib/seo/schemas";
import { JsonLd } from "./json-ld";

interface BreadcrumbItem {
  name: string;
  path: string;
}

interface SeoBreadcrumbsProps {
  items: BreadcrumbItem[];
}

/**
 * SEO-optimized breadcrumbs with structured data.
 * Always includes Home as the first item.
 */
export function SeoBreadcrumbs({ items }: SeoBreadcrumbsProps) {
  const allItems: BreadcrumbItem[] = [{ name: "Home", path: "/" }, ...items];

  return (
    <>
      {/* BreadcrumbList JSON-LD */}
      <JsonLd data={getBreadcrumbSchema(allItems)} />

      {/* Visible breadcrumb navigation */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-sm text-muted-foreground py-3"
      >
        <ol className="flex items-center gap-1.5" itemScope itemType="https://schema.org/BreadcrumbList">
          {allItems.map((item, index) => {
            const isLast = index === allItems.length - 1;
            return (
              <li
                key={item.path}
                className="flex items-center gap-1.5"
                itemProp="itemListElement"
                itemScope
                itemType="https://schema.org/ListItem"
              >
                {index === 0 ? (
                  <Home className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {isLast ? (
                  <span
                    itemProp="name"
                    className="font-medium text-foreground"
                    aria-current="page"
                  >
                    {item.name}
                  </span>
                ) : (
                  <Link
                    href={item.path}
                    itemProp="item"
                    className="hover:text-foreground transition-colors"
                  >
                    <span itemProp="name">{item.name}</span>
                  </Link>
                )}
                <meta itemProp="position" content={String(index + 1)} />
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
