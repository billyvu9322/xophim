import axios from "axios";

// Axios instance for the XoPhim API. `withCredentials` so httpOnly auth cookies
// ride along once auth exists. Base URL: relative /v1 (Vite proxies in dev,
// same-origin in the single-image deploy) unless overridden.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/v1",
  withCredentials: true,
});
