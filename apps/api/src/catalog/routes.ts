import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { catalogService, type ListQuery } from "./service.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(64).optional(),
  sort_field: z.enum(["modified.time", "_id", "year"]).optional(),
  sort_type: z.enum(["asc", "desc"]).optional(),
  // Audio track filter (KKPhim sort_lang): vietsub | thuyet-minh | long-tieng.
  sort_lang: z.enum(["vietsub", "thuyet-minh", "long-tieng"]).optional(),
  category: z.string().optional(),
  country: z.string().optional(),
  // Comma-separated years for multi-select (e.g. "2020,2021"). KKPhim treats
  // multiple values as OR.
  year: z.string().optional(),
});

function toListQuery(q: z.infer<typeof listQuerySchema>): ListQuery {
  return q;
}

export const registerCatalogRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/home", async () => catalogService.home());

  app.get(
    "/list/:type",
    { schema: { params: z.object({ type: z.string() }), querystring: listQuerySchema } },
    async (req) => catalogService.list(req.params.type, toListQuery(req.query)),
  );

  app.get(
    "/category/:slug",
    { schema: { params: z.object({ slug: z.string() }), querystring: listQuerySchema } },
    async (req) => catalogService.category(req.params.slug, toListQuery(req.query)),
  );

  app.get(
    "/country/:slug",
    { schema: { params: z.object({ slug: z.string() }), querystring: listQuerySchema } },
    async (req) => catalogService.country(req.params.slug, toListQuery(req.query)),
  );

  app.get(
    "/year/:year",
    { schema: { params: z.object({ year: z.coerce.number().int() }), querystring: listQuerySchema } },
    async (req) => catalogService.year(req.params.year, toListQuery(req.query)),
  );

  app.get(
    "/search",
    { schema: { querystring: listQuerySchema.extend({ keyword: z.string().min(1) }) } },
    async (req) => {
      const { keyword, ...rest } = req.query;
      return catalogService.search(keyword, toListQuery(rest));
    },
  );

  app.get(
    "/detail/:slug",
    { schema: { params: z.object({ slug: z.string() }) } },
    async (req) => catalogService.detail(req.params.slug),
  );

  app.get("/categories", async () => catalogService.categories());
  app.get("/countries", async () => catalogService.countries());

  app.get("/filters", async () => {
    const [categories, countries] = await Promise.all([
      catalogService.categories(),
      catalogService.countries(),
    ]);
    const currentYear = 2026;
    const years = Array.from({ length: currentYear - 1970 + 1 }, (_, i) => currentYear - i);
    return { categories, countries, years };
  });
};
