/**
 * JSON-LD Structured Data Component
 * 
 * Renders <script type="application/ld+json"> tags for search engines.
 * This is the PRIMARY mechanism for rich results, knowledge panels,
 * and sitelinks search boxes.
 */

interface JsonLdProps {
  data: Record<string, unknown> | Record<string, unknown>[];
}

/**
 * Renders one or more JSON-LD script tags.
 * Place inside <head> or anywhere in the page body.
 */
export function JsonLd({ data }: JsonLdProps) {
  const schemas = Array.isArray(data) ? data : [data];

  return (
    <>
      {schemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema),
          }}
        />
      ))}
    </>
  );
}
