import { describe, expect, it } from "vitest";
import { enrichItems, filterPublished, sortBySort } from "../src/collections/helpers.js";

describe("filterPublished", () => {
  it("keeps only published rows", () => {
    const rows = [
      { id: "1", is_published: true, sort: 0 },
      { id: "2", is_published: false, sort: 1 },
      { id: "3", is_published: true, sort: 2 },
    ];
    expect(filterPublished(rows).map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("returns empty array when none are published", () => {
    expect(filterPublished([{ id: "a", is_published: false, sort: 0 }])).toHaveLength(0);
  });
});

describe("sortBySort", () => {
  it("sorts ascending by .sort", () => {
    const rows = [
      { id: "b", sort: 10 },
      { id: "a", sort: 0 },
      { id: "c", sort: 5 },
    ];
    expect(sortBySort(rows).map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("is stable for equal sort values", () => {
    const rows = [
      { id: "x", sort: 1 },
      { id: "y", sort: 1 },
    ];
    expect(sortBySort(rows).map((r) => r.id)).toEqual(["x", "y"]);
  });

  it("does not mutate the input", () => {
    const rows = [
      { id: "a", sort: 3 },
      { id: "b", sort: 1 },
    ];
    const original = [...rows];
    sortBySort(rows);
    expect(rows).toEqual(original);
  });
});

describe("enrichItems", () => {
  it("casts movie_snapshot jsonb to the typed shape", () => {
    const result = enrichItems([
      {
        collection_id: "c1",
        movie_slug: "dong-ho-cat",
        sort: 0,
        movie_snapshot: {
          name: "Đồng Hồ Cát",
          posterUrl: "https://cdn/p.webp",
          thumbUrl: "https://cdn/t.webp",
          type: "single",
          year: 2024,
          quality: "FHD",
        },
      },
    ]);
    expect(result[0]?.snapshot.name).toBe("Đồng Hồ Cát");
    expect(result[0]?.snapshot.posterUrl).toBe("https://cdn/p.webp");
    expect(result[0]?.movieSlug).toBe("dong-ho-cat");
    expect(result[0]?.sort).toBe(0);
  });

  it("falls back to empty fields for an empty snapshot", () => {
    const result = enrichItems([
      { collection_id: "c1", movie_slug: "x", sort: 1, movie_snapshot: {} },
    ]);
    expect(result[0]?.snapshot.name).toBe("");
    expect(result[0]?.snapshot.year).toBeNull();
  });
});
