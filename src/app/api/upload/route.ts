import { currentUser } from "@/lib/auth";
import { getOwnedBrain } from "@/lib/db";
import { MAX_IMAGE_BYTES, saveImage } from "@/lib/ingest";

export async function POST(req: Request) {
  // Browsers send Origin on cross-site POSTs; only accept uploads from our own pages.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) {
    return Response.json({ error: "Cross-origin uploads are not allowed" }, { status: 403 });
  }
  const user = await currentUser();
  if (!user) return Response.json({ error: "Log in to save images" }, { status: 401 });
  const form = await req.formData();
  const brain = getOwnedBrain(user.id, String(form.get("brain") ?? ""));
  if (!brain) return Response.json({ error: "Brain not found" }, { status: 404 });
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) return Response.json({ error: "No file provided" }, { status: 400 });

  const failed: string[] = [];
  for (const file of files) {
    try {
      if (file.size > MAX_IMAGE_BYTES) throw new Error("too large");
      await saveImage(brain.id, Buffer.from(await file.arrayBuffer()), file.name);
    } catch {
      failed.push(file.name);
    }
  }
  if (failed.length) {
    return Response.json({ error: `Could not save ${failed.join(", ")} (images up to 20 MB only)` }, { status: 422 });
  }
  return Response.json({ ok: true });
}
