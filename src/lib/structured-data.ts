/**
 * Per-page JSON-LD structured data for Google Rich Results.
 *
 * - Anime detail pages → TVSeries schema (shows in Google as a series with ratings)
 * - Watch pages → VideoObject schema (shows video thumbnail in search results)
 * - Genre/Dub/Year/Season pages → CollectionPage schema
 * - Other pages → WebPage schema
 *
 * This is what makes Google show rich results (star ratings, video thumbnails)
 * which dramatically improves CTR and indexing speed.
 */

const SITE_URL = "https://luffytv.live";

export interface StructuredDataProps {
  type: "tvseries" | "video" | "collection" | "webpage";
  title: string;
  description: string;
  url: string;
  image?: string;
  genres?: string[];
  rating?: { value: number; best: number; count: number };
  episodeNumber?: number;
  seasonNumber?: number;
}

export function generateStructuredData(props: StructuredDataProps): object {
  const { type, title, description, url, image, genres, rating, episodeNumber, seasonNumber } = props;
  const imageUrl = image?.startsWith("http") ? image : `${SITE_URL}${image || "/og.png"}`;

  switch (type) {
    case "tvseries":
      return {
        "@context": "https://schema.org",
        "@type": "TVSeries",
        name: title.replace(/ — .+$/, "").replace(/ \| .+$/, ""),
        description,
        url,
        image: imageUrl,
        genre: genres || [],
        ...(rating ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: rating.value,
            bestRating: rating.best,
            ratingCount: rating.count,
          },
        } : {}),
        ...(seasonNumber ? { numberOfSeasons: seasonNumber } : {}),
      };

    case "video":
      return {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: title.replace(/ — .+$/, "").replace(/ \| .+$/, ""),
        description,
        url,
        thumbnailUrl: imageUrl,
        contentUrl: url,
        ...(episodeNumber ? { episodeNumber } : {}),
        uploadDate: new Date().toISOString().split("T")[0],
      };

    case "collection":
      return {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: title.replace(/ \| .+$/, ""),
        description,
        url,
        image: imageUrl,
      };

    case "webpage":
    default:
      return {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: title.replace(/ \| .+$/, ""),
        description,
        url,
        image: imageUrl,
        isPartOf: { "@id": `${SITE_URL}/#website` },
      };
  }
}
