import { useEffect } from "react";

const SITE_NAME = "XoPhim";

interface SeoInput {
  /** Page title WITHOUT the site-name suffix (added automatically). */
  title?: string;
  description?: string;
}

// Client-side <head> sync for SPA navigation. The server injects the correct
// per-route head for the FIRST (crawler) load; this keeps the title/description
// in sync as the user navigates between routes without a full reload, and helps
// social crawlers that execute JS. Restores the previous values on unmount.
export function useSeo({ title, description }: SeoInput): void {
  useEffect(() => {
    const prevTitle = document.title;
    if (title) document.title = `${title} | ${SITE_NAME}`;

    let metaEl: HTMLMetaElement | null = null;
    let prevDesc: string | null = null;
    if (description) {
      metaEl = document.querySelector('meta[name="description"]');
      if (!metaEl) {
        metaEl = document.createElement("meta");
        metaEl.name = "description";
        document.head.appendChild(metaEl);
      }
      prevDesc = metaEl.getAttribute("content");
      metaEl.setAttribute("content", description);
    }

    return () => {
      document.title = prevTitle;
      if (metaEl && prevDesc !== null) metaEl.setAttribute("content", prevDesc);
    };
  }, [title, description]);
}
