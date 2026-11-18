import { ping } from "@/lib/db";

/** Unauthenticated health probe for containers and load balancers. */
export async function GET() {
  try {
    ping();
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
