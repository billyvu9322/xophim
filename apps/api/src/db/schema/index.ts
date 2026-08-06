// Drizzle schema source of truth. Re-export every table module from here so the
// Drizzle instance and drizzle-kit pick them all up.

export * from "./auth.js";
export * from "./user-state.js";
export * from "./community.js";
export * from "./collections.js";
export * from "./rooms.js";
