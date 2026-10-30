// Landing page link added to "Share my Squeek Pal" posts. Set SITE_URL when building
// (SITE_URL=https://… npm run build:ext) once the site's address is known; empty adds no link.
declare const __SITE_URL__: string;
export const SITE_URL: string = typeof __SITE_URL__ === "string" ? __SITE_URL__ : "";
