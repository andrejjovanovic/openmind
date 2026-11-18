import fs from "node:fs/promises";
import path from "node:path";
import { currentUser } from "@/lib/auth";
import { UPLOAD_DIR, userOwnsImage } from "@/lib/db";

export async function GET(req: Request, ctx: RouteContext<"/files/[name]">) {
  const { name } = await ctx.params;
  // Stored files are always <uuid>.webp; anything else is not ours to serve.
  if (!/^[\w-]+\.webp$/.test(name)) return new Response("Not found", { status: 404 });
  const user = await currentUser();
  if (!user || !userOwnsImage(user.id, name)) return new Response("Not found", { status: 404 });
  // Revalidate on every use so a signed-out browser cannot replay a cached image;
  // the content never changes, so the answer is almost always a cheap 304.
  const headers = { "content-type": "image/webp", "cache-control": "private, no-cache", etag: `"${name}"` };
  if (req.headers.get("if-none-match") === headers.etag) return new Response(null, { status: 304, headers });
  try {
    const data = await fs.readFile(path.join(UPLOAD_DIR, name));
    return new Response(new Uint8Array(data), { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
