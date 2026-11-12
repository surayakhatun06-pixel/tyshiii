import { useMemo } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

import type { MediaDetail } from "@/lib/anilist";
import { getAnimeDoc, isCustomId } from "@/lib/cloud-episodes";
import { applyOverride } from "@/lib/custom-series";
import { firebaseConfigured } from "@/lib/firebase";
import { mediaQuery } from "@/lib/queries";

/**
 * A title's details for the anime pages. AniList titles get any details the admin
 * edited by hand (title, poster, banner, about, genres) layered on top; custom
 * series are built entirely from Firestore.
 */
export function useMedia(id: number): MediaDetail {
  const { data } = useSuspenseQuery(mediaQuery(id));
  const custom = isCustomId(id);
  const override = useQuery({
    queryKey: ["anime-doc", id],
    queryFn: () => getAnimeDoc(id),
    enabled: !custom && firebaseConfigured && typeof window !== "undefined",
    staleTime: 0,
    retry: false,
  });
  return useMemo(
    () => (custom ? data : applyOverride(data, override.data)),
    [custom, data, override.data],
  );
}
