import { z } from "zod";

export const profileSchema = z.object({
  id: z.number(),
  name: z.string(),
  mode: z.string(),
  m3uUrl: z.string().nullable(),
  m3uContent: z.string().nullable(),
  epgUrl: z.string().nullable(),
  serverUrl: z.string().nullable(),
  username: z.string().nullable(),
  password: z.string().nullable(),
  favorites: z.array(z.string()).nullable(),
  continueWatching: z.record(z.object({ time: z.number(), duration: z.number() })).nullable(),
});

export type ProfileSchema = z.infer<typeof profileSchema>;

export const insertProfileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  mode: z.string().min(1, "Mode is required"),
  m3uUrl: z.string().nullable().optional(),
  m3uContent: z.string().nullable().optional(),
  epgUrl: z.string().nullable().optional(),
  serverUrl: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  favorites: z.array(z.string()).nullable().optional(),
  continueWatching: z.record(z.object({ time: z.number(), duration: z.number() })).nullable().optional(),
});

export type ProfileInput = z.infer<typeof insertProfileSchema>;
export type ProfileUpdateInput = Partial<ProfileInput>;

export const api = {
  profiles: {
    list: {
      method: "GET" as const,
      path: "/api/profiles" as const,
      responses: {
        200: z.array(profileSchema),
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/profiles/:id" as const,
      responses: {
        200: profileSchema,
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/profiles" as const,
      input: insertProfileSchema,
      responses: {
        201: profileSchema,
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/profiles/:id" as const,
      input: insertProfileSchema.partial(),
      responses: {
        200: profileSchema,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/profiles/:id" as const,
    },
  },
  proxy: {
    get: {
      method: "GET" as const,
      path: "/api/proxy" as const,
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
